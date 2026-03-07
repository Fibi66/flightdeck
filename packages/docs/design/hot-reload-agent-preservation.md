# Hot-Reload with Agent Process Preservation

> **Status:** Design Document (PROPOSAL — Security Model Added) | **Author:** Architect (e7f14c5e) | **Security Review:** Architect (cc29bb0d) | **Date:** 2026-03-07

## Problem Statement

During Flightdeck development, the server runs via `tsx watch src/index.ts`, which restarts the entire Node.js process on every code change. Because Copilot CLI agent processes are spawned as child processes of the server (`child_process.spawn`), they are killed whenever the server restarts. A single code change during an active crew session causes:

1. **All agents terminated** — `SIGTERM` propagates through the process tree
2. **All in-memory state lost** — messages, tool calls, plans, context window info, delegation tracking
3. **All ACP connections severed** — stdio pipes are closed with the parent process
4. **Context window budget wasted** — agents that resume need to rebuild context from scratch

This is the primary developer experience friction for anyone iterating on the Flightdeck server codebase.

### Current Process Tree

```
tsx watch (file watcher)
└── node src/index.ts              ← KILLED on file change
    ├── copilot --acp --stdio      ← agent 1 (child process — KILLED)
    ├── copilot --acp --stdio      ← agent 2 (child process — KILLED)
    ├── copilot --acp --stdio      ← agent 3 (child process — KILLED)
    └── ...
```

### Kill Chain Detail

1. `tsx watch` detects file change → sends SIGTERM to the node process
2. `index.ts` `gracefulShutdown()` calls `agentManager.shutdownAll()`
3. Each `Agent.terminate()` calls `acpConnection.terminate()` → `this.process.kill()`
4. Even without the explicit kill, OS SIGHUP propagates to children when parent exits

### Critical Constraint

ACP uses stdio pipes (`stdin`/`stdout`) for communication via the `@agentclientprotocol/sdk`. These pipe file descriptors are intrinsically tied to the parent-child process relationship — they cannot be transferred to a different process.

---

## Options Considered

### Option 1: Agent Process Daemon (Process Separation)

Split into two processes: a long-lived **Agent Host** daemon that spawns and manages Copilot CLI processes, and a restartable **API Server** that connects to the daemon via local IPC.

```
┌────────────────────────────────────────┐
│ Agent Host Daemon (long-lived)         │
│                                        │
│  ┌──────────┐ ┌──────────┐ ┌────────┐  │
│  │ copilot  │ │ copilot  │ │  ...   │  │
│  │ (agent 1)│ │ (agent 2)│ │        │  │
│  └────┬─────┘ └────┬─────┘ └────┬───┘  │
│       │ stdio      │ stdio      │      │
│  ┌────┴────────────┴────────────┴───┐  │
│  │    ACP Bridge Layer              │  │
│  └────────────────┬─────────────────┘  │
│                   │ Unix Domain Socket │
└───────────────────┼────────────────────┘
                    │
┌───────────────────┼─────────────────────┐
│ API Server (restartable via tsx watch)  │
│                   │                     │
│  ┌────────────────┴──────────────────┐  │
│  │ AgentManager (proxy to daemon)    │  │
│  │ Express + WebSocket + services    │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**How it works:**
- The daemon listens on a Unix domain socket (e.g., `/tmp/flightdeck-agents.sock`)
- It spawns Copilot CLI processes and bridges ACP protocol messages over the socket
- The API server connects to the daemon on startup, reconnects after restart
- On restart, the server queries the daemon for the current agent roster

**Daemon API surface:**
- `spawn(role, cliArgs, cwd) → agentId`
- `terminate(agentId) → boolean`
- `prompt(agentId, content) → result`
- `resolvePermission(agentId, approved) → void`
- `subscribe(agentId) → event stream`
- `list() → running agent descriptors`

| Pro | Con |
|-----|-----|
| Agents survive any number of server restarts | Significant refactoring (~2-3 weeks) |
| Clean architectural separation of concerns | Need IPC protocol between daemon and server |
| Daemon is small (~300 lines), rarely needs changes | Two processes to manage during development |
| Mirrors proven OTP supervision tree pattern | Event streaming adds a hop (daemon → server → WS) |
| Enables future distributed deployment | Daemon crash still kills all agents |

**Inspired by:** Symphony's Elixir/OTP supervision trees (Task.Supervisor manages agent processes independently of the Orchestrator GenServer), Edict's separate worker processes.

---

### Option 2: Server-Side Hot Module Replacement

Use Vite's SSR HMR or a framework like Resetless to hot-swap individual server modules without full process restart.

| Pro | Con |
|-----|-----|
| Fastest possible feedback loop | Express/WebSocket servers are deeply stateful — HMR is fragile |
| No architectural changes to process model | Every `setInterval`, event listener, DB connection leaks on swap |
| Single process | 35+ interconnected services make "what to swap" unpredictable |
| | Debug nightmares when old/new module versions coexist |
| | Designed for request handlers, not long-lived daemon processes |

**Verdict: Not recommended.** The Flightdeck server has 35+ interconnected stateful services with event listeners, intervals, and shared mutable state. Module-level HMR would be endlessly fragile.

---

### Option 3: Enhanced Auto-Resume After Restart

Don't prevent agent death. Instead, make recovery automatic: persist the agent roster before shutdown, auto-resume all agents via `copilot --resume <sessionId>` on restart.

| Pro | Con |
|-----|-----|
| Simplest implementation (~1-2 days) | Agents still die and restart (5-15s downtime per agent) |
| No architectural changes needed | `--resume` consumes context window budget to rebuild |
| 80% of infrastructure already exists | In-progress tool calls interrupted (could corrupt files mid-edit) |
| Can ship immediately | Message queues between agents are lost |
| | 10-20 agents take 30-60s to fully resume |

---

### Option 4: Worker Thread with Main Thread Process Hosting

Run business logic in a `worker_thread`. Main thread spawns and holds agent processes. Replace the worker on code change; main thread stays alive.

| Pro | Con |
|-----|-----|
| Single OS process | `worker_threads` cannot share file descriptors (stdio pipes) |
| Agents survive worker restart | Need structured-clone-safe IPC for all ACP messages |
| | `http.Server` can't easily be transferred between threads |
| | Effectively same complexity as daemon, with more constraints |

**Verdict: Not recommended.** Worker thread limitations make this harder than process separation for no additional benefit.

---

### Option 5: Detached Processes + Named Pipes

Spawn agents with `detached: true`, communicate via filesystem FIFOs instead of stdio pipes. New server can reopen the same FIFOs.

| Pro | Con |
|-----|-----|
| No daemon process needed | ACP SDK expects Node.js streams, not FIFOs |
| Agent processes survive independently | Copilot CLI expects stdio, needs wrapper script |
| | Platform-specific FIFO behavior (macOS vs Linux) |
| | Untested with ndJSON ACP protocol buffering |

**Verdict: Interesting but risky.** Worth prototyping only if Option 1 proves too heavy.

---

## Recommended Approach: Phased Hybrid

Ship **Phase 1** (Enhanced Auto-Resume) immediately for developer relief, then build **Phase 2** (Agent Host Daemon) as the correct long-term architecture.

### Phase 1: Enhanced Auto-Resume (1-2 days)

Persist the full agent roster to SQLite before shutdown. On dev-mode startup, detect the persisted roster and automatically resume all agents.

#### Implementation

**On graceful shutdown** (before terminating agents):

```typescript
// index.ts — inside gracefulShutdown()
function persistAgentRoster() {
  const roster = agentManager.getAll()
    .filter(a => !isTerminalStatus(a.status))
    .map(a => ({
      id: a.id,
      roleId: a.role.id,
      task: a.task,
      sessionId: a.sessionId,
      parentId: a.parentId,
      projectId: a.projectId,
      dagTaskId: a.dagTaskId,
      model: a.model,
      cwd: a.cwd,
    }));
  db.setSetting('dev-restart-roster', JSON.stringify(roster));
}
```

**On startup** (after all services initialized):

```typescript
function autoResumeIfDevRestart() {
  const rosterJson = db.getSetting('dev-restart-roster');
  if (!rosterJson) return;
  db.setSetting('dev-restart-roster', ''); // consume once

  const roster = JSON.parse(rosterJson);
  console.log(`🔄 Auto-resuming ${roster.length} agents from dev restart...`);

  for (const entry of roster) {
    const role = roleRegistry.get(entry.roleId);
    if (!role || !entry.sessionId) continue;
    agentManager.spawn(
      role, entry.task, entry.parentId, true,
      entry.model, entry.cwd, entry.sessionId, entry.id,
      { projectId: entry.projectId }
    );
  }
}
```

**UI indication:** Show a "🔄 Resuming N agents..." banner in the web dashboard so the developer knows agents are reconnecting.

#### Limitations

- Agents restart (~5-15s per agent), losing their current turn's work in progress
- Context window budget is consumed to rebuild each agent's context
- Pending inter-agent messages are lost (though DAG state and file locks persist in SQLite)

### Phase 2: Agent Host Daemon (2-3 weeks)

Extract agent process management into a standalone daemon process.

#### New File Structure

```
bin/
  flightdeck.mjs                  # CLI entry (unchanged)
  flightdeck-agent-host.mjs       # New: daemon entry

packages/server/
  src/
    agent-host/
      AgentHostDaemon.ts          # Spawns agents, manages ACP connections
      AgentHostProtocol.ts        # JSON-RPC message definitions
      AgentHostClient.ts          # Client used by the API server
    agents/
      AgentManager.ts             # Modified: delegates spawn/terminate to client
      Agent.ts                    # Modified: ACP events arrive via IPC, not direct
```

#### Protocol

JSON-RPC over Unix domain socket (see [Security Model](#security-model) for socket location):

```json
// Server → Daemon: spawn an agent
{"jsonrpc": "2.0", "method": "spawn", "params": {"role": "developer", "cliArgs": ["--model", "claude-opus-4.6"], "cwd": "/path/to/repo"}, "id": 1}

// Daemon → Server: agent event stream
{"jsonrpc": "2.0", "method": "event", "params": {"agentId": "abc123", "type": "text", "data": "Hello, I'm analyzing..."}}

// Server → Daemon: send prompt
{"jsonrpc": "2.0", "method": "prompt", "params": {"agentId": "abc123", "content": "Your task is..."}, "id": 2}
```

#### Dev Workflow

```bash
npm run dev
# 1. Starts agent-host daemon (if not already running)
# 2. Starts API server with tsx watch
# 3. Server connects to daemon via Unix socket
# 4. On file change: only the API server restarts
# 5. Server reconnects to daemon — agents are untouched
```

The `scripts/dev.mjs` launcher would be extended to:
1. Check if daemon is running (attempt socket connection)
2. Start daemon if needed
3. Start API server with `tsx watch`
4. On shutdown: leave daemon running (agents stay alive)

#### Migration Path

1. Extract `AcpConnection` into the daemon (it already has a clean boundary)
2. Create `AgentHostClient` that mirrors `AcpConnection`'s event interface
3. Modify `AgentAcpBridge.startAcp()` to use the client instead of direct spawn
4. All other code (AgentManager, CommandDispatcher, etc.) sees the same interface

---

## Security Model

### Threat Analysis

The daemon holds live agent processes with access to the filesystem, git, and external APIs. A compromised daemon connection could:

1. **Hijack running agents** — inject arbitrary prompts into an agent with file-write permissions
2. **Spawn rogue agents** — execute arbitrary CLI commands via `copilot --acp --stdio`
3. **Exfiltrate data** — subscribe to all agent event streams (code, conversations, tool outputs)
4. **Denial of service** — terminate all running agents, killing an active crew session

This is a **local privilege boundary** problem, not a network security problem. The threat actor is a rogue process on the same machine — not a remote attacker.

### IPC Mechanism: Unix Domain Socket (Recommended)

| Mechanism | OS-Level Auth | Network Exposure | Node.js Support | Platform |
|-----------|:---:|:---:|:---:|:---:|
| **Unix domain socket** | ✅ File permissions | ❌ None | ✅ `net` module | macOS, Linux |
| TCP localhost | ❌ None | ⚠️ `127.0.0.1` | ✅ `net` module | All |
| Named pipes | ⚠️ Platform-specific | ❌ None | ⚠️ Partial | Windows-focused |

**Decision: Unix domain socket.** The kernel enforces `connect()` permission checks against the socket file's owner/mode bits. TCP localhost provides zero OS-level authentication — any process can connect to a known port. Named pipes have inconsistent cross-platform behavior and no advantage over UDS on macOS/Linux.

### Socket Location

**Current proposal (WRONG):** `/tmp/flightdeck-agents-{pid}.sock`

**Problems with `/tmp/`:**
- World-readable directory — any user can see the socket file exists (information leak)
- Symlink attacks — a malicious user creates `/tmp/flightdeck-agents-*.sock` as a symlink before daemon starts
- Stale socket cleanup races on multi-user systems

**Recommended:** `$XDG_RUNTIME_DIR/flightdeck/agent-host.sock`

```
$XDG_RUNTIME_DIR/flightdeck/     # typically /run/user/<uid>/flightdeck/
├── agent-host.sock               # mode 0600 (owner rw only)
├── agent-host.token              # mode 0600 (per-session auth token)
└── agent-host.pid                # mode 0644 (daemon PID for health checks)
```

**Fallback chain** (for systems without `XDG_RUNTIME_DIR`):
1. `$XDG_RUNTIME_DIR/flightdeck/` — Linux with systemd (per-user tmpfs, correct permissions)
2. `~/.flightdeck/run/` — macOS, older Linux (user home, always available)

The directory is created with mode `0700` (owner-only access). The socket file is created with mode `0600`. These two permission checks mean only processes running as the daemon's UID can even attempt to connect.

### Authentication: Defense in Depth (Two Layers)

#### Layer 1: Kernel-Enforced File Permissions

The socket file's `0600` mode means the kernel rejects `connect()` from any process not running as the socket's owner UID. This is the primary security boundary — it's enforced at the syscall level with zero overhead.

```typescript
// In AgentHostDaemon.ts
import { createServer } from 'net';
import { mkdirSync, chmodSync } from 'fs';

const socketDir = getSocketDir();  // XDG_RUNTIME_DIR or ~/.flightdeck/run
mkdirSync(socketDir, { recursive: true, mode: 0o700 });

const server = createServer();
const socketPath = join(socketDir, 'agent-host.sock');
server.listen(socketPath, () => {
  chmodSync(socketPath, 0o600);  // owner rw only
});
```

#### Layer 2: Per-Session Token Handshake

Even with correct file permissions, defense in depth requires a second factor. The daemon generates a cryptographic token at startup, shared via a restricted file.

**Rationale:** File permissions can be bypassed in edge cases — Docker bind mounts inheriting host UIDs, NFS with `no_root_squash`, misconfigured container namespaces. The token ensures that even if a process can connect to the socket, it must also possess a secret that only the legitimate server should know.

```typescript
// Daemon startup — generate and persist token
import { randomBytes, timingSafeEqual } from 'crypto';

const sessionToken = randomBytes(32).toString('hex');  // 256-bit
writeFileSync(join(socketDir, 'agent-host.token'), sessionToken, { mode: 0o600 });

// On client connection — require auth as first message
socket.once('data', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.method !== 'auth' || !timingSafeEqual(
    Buffer.from(msg.params.token),
    Buffer.from(sessionToken),
  )) {
    socket.destroy();
    return;
  }
  // Authenticated — proceed to handle JSON-RPC
  upgradeToJsonRpc(socket);
});
```

```typescript
// Server (client) — read token and authenticate on connect
import { readFileSync } from 'fs';

const token = readFileSync(join(socketDir, 'agent-host.token'), 'utf-8').trim();
const socket = connect(socketPath);
socket.write(JSON.stringify({
  jsonrpc: '2.0', method: 'auth',
  params: { token, pid: process.pid },
  id: 0,
}) + '\n');
```

**Token lifecycle:**
- Generated fresh on each daemon startup (not reusable across sessions)
- Stored in `agent-host.token` with mode `0600` (same as socket)
- `timingSafeEqual` prevents timing side-channel attacks
- Connection rejected immediately on auth failure (no retry, no error details)

### Authorization Model

Once authenticated, the server has full daemon access. No per-operation ACLs are needed because:

- **Single-user system:** The daemon serves exactly one Flightdeck server instance
- **Same trust boundary:** If you can authenticate, you're the same user who started the daemon
- **No multi-tenancy:** Each developer runs their own daemon (there's no shared daemon server)

### Threat Mitigation Summary

| Threat | Mitigation | Layer |
|--------|-----------|-------|
| Rogue local process connects to socket | Socket file mode `0600` — kernel rejects `connect()` | Filesystem |
| Socket directory traversal / symlink attack | Directory mode `0700` in user-private path (not `/tmp/`) | Filesystem |
| Docker/NFS permission bypass | Per-session token required as first message | Application |
| Token file read by other user | Token file mode `0600` in `0700` directory | Filesystem |
| Daemon impersonation (fake daemon) | Client verifies `agent-host.pid` matches socket peer | Application |
| Man-in-the-middle / network sniffing | Unix socket = no network exposure, local-only by definition | Transport |
| Timing side-channel on token comparison | `crypto.timingSafeEqual()` | Application |
| Stale socket from crashed daemon | `dev.mjs` checks PID file liveness before connecting | Launcher |
| Replay attack on auth token | Token is per-session; persistent connection (not per-request auth) | Protocol |

### What We Explicitly Don't Need

- **TLS:** Data never leaves the machine. Unix socket is not network-accessible. TLS would add complexity and latency for zero security benefit.
- **mTLS / client certificates:** Overkill for same-user local IPC. File permissions + token provides equivalent assurance.
- **Rate limiting:** Trusted client over local IPC. No abuse vector.
- **Per-agent ACLs:** Single-user system. If you authenticated, you own everything.
- **Encryption at rest for token:** The token file has the same permissions as the socket file. If an attacker can read one, they can read the other. The security boundary is the filesystem permissions, not encryption.

---

## Decision Matrix

| Criterion | Daemon (1) | HMR (2) | Resume (3) | Worker (4) | FIFO (5) | Hybrid (6) |
|-----------|:-:|:-:|:-:|:-:|:-:|:-:|
| Agent survival | ✅ Full | ⚠️ Partial | ❌ Restart | ✅ Full | ✅ Full | ⚠️→✅ |
| Implementation effort | 🔴 High | 🟡 Med | 🟢 Low | 🔴 High | 🟡 Med | 🟢→🔴 |
| Maintenance burden | 🟢 Low | 🔴 High | 🟢 Low | 🟡 Med | 🟡 Med | 🟢 Low |
| Risk of subtle bugs | 🟢 Low | 🔴 High | 🟢 Low | 🟡 Med | 🟡 Med | 🟢 Low |
| Ships quickly | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ (Phase 1) |
| Correct long-term | ✅ | ❌ | ❌ | ⚠️ | ⚠️ | ✅ (Phase 2) |

---

## Cross-Project Insights

- **Symphony (Elixir/OTP):** OTP supervision trees provide exactly the daemon pattern. `Task.Supervisor` manages agent worker processes independently of the `Orchestrator` GenServer. If the Orchestrator crashes, the supervisor restarts it while agents continue. Flightdeck's daemon would serve the same role as `Task.Supervisor`.

- **Edict:** Separate Orchestrator and Dispatch worker processes communicating via Redis Streams. If the orchestrator crashes, unacknowledged events are preserved in Redis for recovery. Flightdeck's SQLite persistence serves the same recovery role.

- **Key insight:** Every system that handles agent process management well separates the "agent lifecycle" concern from the "business logic" concern into different processes. Symphony does it with OTP, Edict with worker processes. Flightdeck currently conflates both in a single Node.js process.

---

## Implementation Timeline (AI-Assisted, 12 Agents)

The original estimates (1-2 days for Phase 1, 2-3 weeks for Phase 2) assumed a single developer working sequentially. With 12 AI agents available for parallel development, the critical path compresses dramatically.

### Phase 1: Enhanced Auto-Resume — 0.5 days

Already a small task. Three agents in parallel:

| Agent | Task | Estimated |
|-------|------|-----------|
| Developer A | Roster persistence in `gracefulShutdown()` + auto-resume on startup | 2-3 hours |
| Developer B | UI banner ("🔄 Resuming N agents...") + WebSocket notification | 2-3 hours |
| QA Tester | Integration test: restart server during active session, verify resume | 2-3 hours |

**Critical path:** 3 hours. All three workstreams are independent.

### Phase 2: Agent Host Daemon — 3-5 days

The daemon has ~8 independent workstreams, most parallelizable after a short shared-protocol design phase:

#### Day 1: Protocol Design + Foundation (3-4 agents)

| Agent | Task |
|-------|------|
| Architect | Design `AgentHostProtocol.ts` — JSON-RPC message types, Zod schemas, event stream format |
| Developer A | `AgentHostDaemon.ts` skeleton — socket listener, connection lifecycle, auth handshake |
| Developer B | Security module — token generation, file permissions, socket directory management |
| Developer C | `AgentHostClient.ts` skeleton — connect, authenticate, reconnect-on-disconnect |

#### Day 2-3: Core Implementation (6-8 agents, after protocol types land)

| Agent | Task |
|-------|------|
| Developer A | Daemon: spawn, terminate, prompt — bridge ACP stdio ↔ socket JSON-RPC |
| Developer B | Daemon: event subscription, multiplexed event streaming over socket |
| Developer C | Client: spawn/terminate/prompt proxy methods, matching AcpAdapter's EventEmitter interface |
| Developer D | Client: event demuxing, reconnect with re-subscription |
| Developer E | `AgentAcpBridge.ts` refactor — swap AcpAdapter for AgentHostClient when daemon detected |
| Developer F | `scripts/dev.mjs` update — daemon lifecycle (check, start, health, leave running on server stop) |
| QA Tester A | Unit tests: daemon protocol, auth, spawn/terminate |
| QA Tester B | Unit tests: client reconnect, event streaming |

#### Day 4-5: Integration + Polish (4-6 agents)

| Agent | Task |
|-------|------|
| Developer A | `AgentManager.ts` refactor — delegate to client, handle daemon-not-available fallback |
| Developer B | Daemon health monitoring — PID file, heartbeat, auto-cleanup of stale sockets |
| QA Tester A | End-to-end: start daemon → start server → spawn agents → restart server → verify agents alive |
| QA Tester B | Edge cases: daemon crash recovery, auth failure, concurrent server instances |
| Tech Writer | Update README, add `docs/daemon-architecture.md` |
| Code Reviewer | Review all daemon PRs before merge |

**Critical path:** 5 days (protocol → daemon core → integration testing). Most work parallelizes after the Day 1 protocol design.

### Phase Comparison

| | Single Developer | 12 AI Agents | Speedup |
|---|---|---|---|
| Phase 1 | 1-2 days | 0.5 days | 2-4x |
| Phase 2 | 2-3 weeks | 3-5 days | 3-5x |
| **Total** | **2.5-3.5 weeks** | **3.5-5.5 days** | **~4x** |

**Why not faster?** The critical path is constrained by integration dependencies (protocol types must land before daemon/client, daemon/client must work before AgentManager refactor). Parallelism helps within phases but can't eliminate sequential dependencies between phases.
