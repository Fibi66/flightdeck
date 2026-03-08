/**
 * Agent Server Entry Point — forked by ForkTransport.
 *
 * This script runs in a detached child process, separate from the
 * orchestrator. It bootstraps a ForkListener + AgentServer and
 * optionally wires persistence and recovery.
 *
 * Lifecycle:
 *  1. Create ForkListener (IPC + TCP localhost)
 *  2. Open SQLite DB for persistence (shared file, WAL mode)
 *  3. Create AgentServer with persistence hooks
 *  4. Run self-recovery (resume agents from previous state)
 *  5. Start listener → accept orchestrator connections
 *  6. Signal 'ready' to parent via IPC
 *
 * Survival strategy:
 *  - tsx watch hot-reload: parent dies → IPC disconnects → grace period
 *    starts (10s) → new parent reconnects within ~2s → timer cancelled
 *  - Manual Ctrl+C: parent dies → IPC disconnects → grace period starts
 *    → no reconnection → agent server shuts down after 10s
 *  - Explicit SIGTERM: immediate graceful shutdown
 *
 * Design: docs/design/agent-server-architecture.md
 */
import { ForkListener } from './transport/ForkListener.js';
import { AgentServer } from './agent-server.js';
import type { AgentServerPersistence, ManagedAgent } from './agent-server.js';
import { AgentServerPersistence as PersistenceLayer } from './agent-server-persistence.js';
import { AgentServerRecovery } from './agents/AgentServerRecovery.js';
import { Database } from './db/database.js';
import { AgentRosterRepository } from './db/AgentRosterRepository.js';
import { ActiveDelegationRepository } from './db/ActiveDelegationRepository.js';
import { logger } from './utils/logger.js';

// ── Configuration from environment ──────────────────────────────────

const stateDir = process.env.FLIGHTDECK_STATE_DIR ?? process.cwd();
const dbPath = process.env.FLIGHTDECK_DB_PATH ?? 'flightdeck.db';

/** Grace period (ms) after parent disconnect before self-terminating.
 *  tsx hot-reload reconnects in ~1-2s; manual Ctrl+C never reconnects. */
const ORPHAN_GRACE_PERIOD_MS = 10_000;

/** Interval (ms) for checking if we've been reparented to PID 1 (orphaned). */
const PARENT_CHECK_INTERVAL_MS = 5_000;

// ── Persistence bridge ──────────────────────────────────────────────
// AgentServer's interface uses simple (agentId, role, model) params,
// while PersistenceLayer expects ManagedAgent objects. This adapter
// bridges the two for lifecycle callbacks.

function createPersistenceBridge(
  rosterRepo: AgentRosterRepository,
  layer: PersistenceLayer,
): AgentServerPersistence {
  return {
    onAgentSpawned(agentId: string, role: string, model: string): void {
      try {
        rosterRepo.upsertAgent(agentId, role, model, 'idle');
      } catch (err) {
        logger.error({ module: 'persistence-bridge', msg: 'Failed to persist spawn', agentId, err: String(err) });
      }
    },
    onAgentTerminated(agentId: string): void {
      layer.onAgentTerminated(agentId);
    },
    onAgentExited(agentId: string, exitCode: number): void {
      layer.onAgentExited(agentId, exitCode);
    },
    onStatusChanged(agentId: string, status: string): void {
      layer.onStatusChanged(agentId, status);
    },
    onServerStop(agents: ManagedAgent[]): void {
      layer.onServerStop(agents);
    },
  };
}

// ── Bootstrap ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const originalParentPid = process.ppid;
  logger.info({ module: 'agent-server-entry', msg: 'Starting agent server process', pid: process.pid, ppid: originalParentPid });

  // 1. Create ForkListener — IPC from parent + TCP for reconnection
  const listener = new ForkListener({
    portFileDir: stateDir,
  });

  // 2. Open database for persistence
  let db: Database | undefined;
  let persistenceLayer: PersistenceLayer | undefined;
  let persistence: AgentServerPersistence | undefined;
  try {
    db = new Database(dbPath);
    const rosterRepo = new AgentRosterRepository(db);
    const delegationRepo = new ActiveDelegationRepository(db);
    persistenceLayer = new PersistenceLayer({ rosterRepo, delegationRepo });
    persistence = createPersistenceBridge(rosterRepo, persistenceLayer);
    logger.info({ module: 'agent-server-entry', msg: 'Database opened for persistence', dbPath });
  } catch (err) {
    logger.warn({ module: 'agent-server-entry', msg: 'Persistence unavailable — running without DB', err: String(err) });
  }

  // 3. Create AgentServer
  const server = new AgentServer({
    listener,
    runtimeDir: stateDir,
    persistence,
  });

  // 4. Self-recovery — resume agents from previous state
  if (persistenceLayer) {
    try {
      const recovery = new AgentServerRecovery(persistenceLayer);
      const report = await recovery.recover();
      if (report.total > 0) {
        logger.info({
          module: 'agent-server-entry',
          msg: 'Recovery complete',
          total: report.total,
          resumed: report.resumed.length,
          stale: report.stale.length,
          failed: report.failed.length,
        });
      }
    } catch (err) {
      logger.warn({ module: 'agent-server-entry', msg: 'Recovery failed — starting fresh', err: String(err) });
    }
  }

  // 5. Start server — begin accepting connections
  server.start();

  // 6. Signal ready to parent (ForkTransport waits for this)
  if (process.send) {
    process.send({ type: 'ready', pid: process.pid });
  }

  logger.info({ module: 'agent-server-entry', msg: 'Agent server ready', pid: process.pid });

  // ── Graceful shutdown ───────────────────────────────────────────

  let shuttingDown = false;

  async function shutdown(reason: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    // Cancel any pending timers
    if (orphanGraceTimer) clearTimeout(orphanGraceTimer);
    if (parentCheckTimer) clearInterval(parentCheckTimer);

    logger.info({ module: 'agent-server-entry', msg: `Shutting down: ${reason}`, pid: process.pid });

    try {
      await server.stop({ reason, timeoutMs: 10_000 });
    } catch (err) {
      logger.warn({ module: 'agent-server-entry', msg: 'Error during server stop', err: String(err) });
    }

    try {
      listener.close();
    } catch (err) {
      logger.warn({ module: 'agent-server-entry', msg: 'Error closing listener', err: String(err) });
    }

    if (db) {
      try {
        db.close();
      } catch (err) {
        logger.warn({ module: 'agent-server-entry', msg: 'Error closing database', err: String(err) });
      }
    }

    logger.info({ module: 'agent-server-entry', msg: 'Agent server stopped', pid: process.pid });
    process.exit(0);
  }

  // ── Signal handling ─────────────────────────────────────────────

  // SIGTERM: explicit shutdown request — always honor
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // SIGINT: propagated from parent Ctrl+C — immediate shutdown
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ── Orphan detection: grace period on parent disconnect ─────────
  // When the parent IPC channel closes, start a grace period.
  // If a new orchestrator reconnects via TCP within the window
  // (tsx hot-reload), cancel the timer and stay alive.
  // If nobody reconnects (manual Ctrl+C), shut down.

  let orphanGraceTimer: ReturnType<typeof setTimeout> | null = null;
  let parentCheckTimer: ReturnType<typeof setInterval> | null = null;

  /** Cancel the orphan grace timer (called when a new connection arrives). */
  function cancelOrphanGrace(): void {
    if (orphanGraceTimer) {
      clearTimeout(orphanGraceTimer);
      orphanGraceTimer = null;
      logger.info({ module: 'agent-server-entry', msg: 'Orphan grace period cancelled — new connection' });
    }
  }

  // Listen for new TCP connections that cancel the grace period.
  // The AgentServer emits connections via the listener — hook in.
  listener.onConnection(() => {
    cancelOrphanGrace();
  });

  process.on('disconnect', () => {
    logger.info({
      module: 'agent-server-entry',
      msg: `Parent IPC disconnected — starting ${ORPHAN_GRACE_PERIOD_MS / 1000}s grace period`,
    });

    orphanGraceTimer = setTimeout(() => {
      logger.info({ module: 'agent-server-entry', msg: 'Grace period expired — no reconnection, shutting down' });
      shutdown('orphan-grace-expired');
    }, ORPHAN_GRACE_PERIOD_MS);
  });

  // ── Parent PID monitoring ─────────────────────────────────────
  // Detect if we've been reparented to PID 1 (init) — our original
  // parent died without the IPC disconnect event firing (crash, SIGKILL).
  // This is a safety net for the grace period above.

  parentCheckTimer = setInterval(() => {
    if (process.ppid !== originalParentPid && process.ppid === 1) {
      logger.info({
        module: 'agent-server-entry',
        msg: 'Detected reparent to PID 1 — parent crashed',
        originalPpid: originalParentPid,
      });

      // Start grace period if not already running
      if (!orphanGraceTimer && !shuttingDown) {
        orphanGraceTimer = setTimeout(() => {
          logger.info({ module: 'agent-server-entry', msg: 'Grace period expired after parent crash — shutting down' });
          shutdown('parent-crash-grace-expired');
        }, ORPHAN_GRACE_PERIOD_MS);
      }

      // Stop checking — we've detected the orphan state
      if (parentCheckTimer) {
        clearInterval(parentCheckTimer);
        parentCheckTimer = null;
      }
    }
  }, PARENT_CHECK_INTERVAL_MS);

  // Don't let the parent check timer keep the process alive
  if (parentCheckTimer && typeof parentCheckTimer === 'object' && 'unref' in parentCheckTimer) {
    (parentCheckTimer as NodeJS.Timeout).unref();
  }
}

main().catch((err) => {
  logger.error({ module: 'agent-server-entry', msg: 'Fatal startup error', err: String(err) });
  process.exit(1);
});
