/**
 * AgentServer tests.
 *
 * Tests cover: lifecycle, message dispatch, spawn/terminate/prompt,
 * event relay, orphan timer, PID file, subscribe/replay, mass failure,
 * error handling, and connection management.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { AgentServer } from './agent-server.js';
import type { AgentServerOptions, ManagedAgent } from './agent-server.js';
import type {
  AgentServerListener,
  TransportConnection,
  OrchestratorMessage,
  AgentServerMessage,
} from './transport/types.js';

// ── Mock AdapterFactory ─────────────────────────────────────────────

vi.mock('./adapters/AdapterFactory.js', () => ({
  createAdapterForProvider: vi.fn(),
  buildStartOptions: vi.fn(() => ({
    cliCommand: 'mock-cli',
    cwd: '/tmp',
  })),
}));

import { createAdapterForProvider, buildStartOptions } from './adapters/AdapterFactory.js';
const mockCreateAdapter = vi.mocked(createAdapterForProvider);
const mockBuildStartOptions = vi.mocked(buildStartOptions);

// ── Test Helpers ────────────────────────────────────────────────────

function createMockAdapter(): EventEmitter & {
  type: string;
  isConnected: boolean;
  isPrompting: boolean;
  promptingStartedAt: number | null;
  currentSessionId: string | null;
  supportsImages: boolean;
  start: ReturnType<typeof vi.fn>;
  prompt: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  resolvePermission: ReturnType<typeof vi.fn>;
} {
  const adapter = new EventEmitter() as any;
  adapter.type = 'mock';
  adapter.isConnected = true;
  adapter.isPrompting = false;
  adapter.promptingStartedAt = null;
  adapter.currentSessionId = null;
  adapter.supportsImages = false;
  adapter.start = vi.fn().mockResolvedValue('session-123');
  adapter.prompt = vi.fn().mockResolvedValue({ stopReason: 'end_turn' });
  adapter.cancel = vi.fn().mockResolvedValue(undefined);
  adapter.terminate = vi.fn();
  adapter.resolvePermission = vi.fn();
  return adapter;
}

function createMockConnection(): TransportConnection & {
  _messageHandlers: Array<(msg: OrchestratorMessage) => void>;
  _disconnectHandlers: Array<(reason: string) => void>;
  _sentMessages: AgentServerMessage[];
  simulateMessage: (msg: OrchestratorMessage) => void;
  simulateDisconnect: (reason: string) => void;
} {
  const conn: any = {
    id: `conn-${Math.random().toString(36).slice(2, 8)}`,
    isConnected: true,
    _messageHandlers: [],
    _disconnectHandlers: [],
    _sentMessages: [],
    send: vi.fn((msg: AgentServerMessage) => conn._sentMessages.push(msg)),
    onMessage: vi.fn((handler: (msg: OrchestratorMessage) => void) => {
      conn._messageHandlers.push(handler);
      return () => {
        conn._messageHandlers = conn._messageHandlers.filter((h: any) => h !== handler);
      };
    }),
    onDisconnect: vi.fn((handler: (reason: string) => void) => {
      conn._disconnectHandlers.push(handler);
      return () => {
        conn._disconnectHandlers = conn._disconnectHandlers.filter((h: any) => h !== handler);
      };
    }),
    close: vi.fn(() => { conn.isConnected = false; }),
    simulateMessage(msg: OrchestratorMessage) {
      conn._messageHandlers.forEach((h: any) => h(msg));
    },
    simulateDisconnect(reason: string) {
      conn.isConnected = false;
      conn._disconnectHandlers.forEach((h: any) => h(reason));
    },
  };
  return conn;
}

function createMockListener(): AgentServerListener & {
  _connectionHandlers: Array<(conn: TransportConnection) => void>;
  simulateConnection: (conn: TransportConnection) => void;
} {
  const listener: any = {
    _connectionHandlers: [],
    listen: vi.fn(),
    close: vi.fn(),
    onConnection: vi.fn((handler: (conn: TransportConnection) => void) => {
      listener._connectionHandlers.push(handler);
      return () => {
        listener._connectionHandlers = listener._connectionHandlers.filter((h: any) => h !== handler);
      };
    }),
    simulateConnection(conn: TransportConnection) {
      listener._connectionHandlers.forEach((h: any) => h(conn));
    },
  };
  return listener;
}

const SPAWN_MSG: OrchestratorMessage = {
  type: 'spawn_agent',
  requestId: 'req-1',
  scope: { projectId: 'proj-1', teamId: 'team-1' },
  role: 'developer',
  model: 'gpt-4',
  task: 'write tests',
};

// ── Tests ───────────────────────────────────────────────────────────

describe('AgentServer', () => {
  let listener: ReturnType<typeof createMockListener>;
  let conn: ReturnType<typeof createMockConnection>;
  let server: AgentServer;
  let runtimeDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    listener = createMockListener();
    conn = createMockConnection();
    runtimeDir = mkdtempSync(join(tmpdir(), 'agent-server-test-'));

    const adapter = createMockAdapter();
    mockCreateAdapter.mockReturnValue({
      adapter: adapter as any,
      backend: 'acp',
      fallback: false,
    });

    server = new AgentServer({
      listener,
      runtimeDir,
      orphanTimeoutMs: 5000,
    });
  });

  afterEach(async () => {
    if (server.started && !server.stopped) {
      await server.stop();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Lifecycle ───────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('starts and writes PID file', () => {
      server.start();
      expect(server.started).toBe(true);
      expect(listener.listen).toHaveBeenCalled();
      const pidFile = join(runtimeDir, 'agent-server.pid');
      expect(existsSync(pidFile)).toBe(true);
      expect(readFileSync(pidFile, 'utf8')).toBe(String(process.pid));
    });

    it('throws if started twice', () => {
      server.start();
      expect(() => server.start()).toThrow('already started');
    });

    it('stop is idempotent', async () => {
      server.start();
      await server.stop();
      await server.stop(); // no throw
      expect(server.stopped).toBe(true);
    });

    it('removes PID file on stop', async () => {
      server.start();
      const pidFile = join(runtimeDir, 'agent-server.pid');
      expect(existsSync(pidFile)).toBe(true);
      await server.stop();
      expect(existsSync(pidFile)).toBe(false);
    });

    it('terminates all agents on stop', async () => {
      server.start();
      listener.simulateConnection(conn);

      const adapter = createMockAdapter();
      mockCreateAdapter.mockReturnValue({ adapter: adapter as any, backend: 'acp', fallback: false });
      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0); // flush start promise

      expect(server.agentCount).toBe(1);
      await server.stop();
      expect(adapter.terminate).toHaveBeenCalled();
      expect(server.agentCount).toBe(0);
    });

    it('closes listener on stop', async () => {
      server.start();
      await server.stop();
      expect(listener.close).toHaveBeenCalled();
    });
  });

  // ── Connection Management ─────────────────────────────────────

  describe('connection management', () => {
    it('accepts connections from listener', () => {
      server.start();
      listener.simulateConnection(conn);
      expect(server.hasConnection).toBe(true);
    });

    it('replaces existing connection (single-client model)', () => {
      server.start();
      const conn1 = createMockConnection();
      const conn2 = createMockConnection();

      listener.simulateConnection(conn1);
      expect(server.hasConnection).toBe(true);

      listener.simulateConnection(conn2);
      expect(conn1.close).toHaveBeenCalled();
      expect(server.hasConnection).toBe(true);
    });

    it('starts buffering on disconnect', () => {
      server.start();
      listener.simulateConnection(conn);
      conn.simulateDisconnect('test');
      expect(server.hasConnection).toBe(false);
    });
  });

  // ── Ping / Auth ───────────────────────────────────────────────

  describe('ping / authenticate', () => {
    it('responds to ping with pong', () => {
      server.start();
      listener.simulateConnection(conn);
      conn.simulateMessage({ type: 'ping', requestId: 'ping-1' });
      const pong = conn._sentMessages.find((m) => m.type === 'pong');
      expect(pong).toBeDefined();
      expect(pong!.type).toBe('pong');
      expect((pong as any).requestId).toBe('ping-1');
      expect((pong as any).timestamp).toBeTypeOf('number');
    });

    it('responds to authenticate with success', () => {
      server.start();
      listener.simulateConnection(conn);
      conn.simulateMessage({ type: 'authenticate', requestId: 'auth-1', token: 'abc' });
      const auth = conn._sentMessages.find((m) => m.type === 'auth_result');
      expect(auth).toBeDefined();
      expect((auth as any).success).toBe(true);
    });
  });

  // ── Spawn ─────────────────────────────────────────────────────

  describe('spawn', () => {
    it('spawns an agent and sends agent_spawned response', async () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0);

      const spawned = conn._sentMessages.find((m) => m.type === 'agent_spawned');
      expect(spawned).toBeDefined();
      expect((spawned as any).role).toBe('developer');
      expect((spawned as any).model).toBe('gpt-4');
      expect((spawned as any).agentId).toBeTruthy();
      expect(server.agentCount).toBe(1);
    });

    it('tracks agent in managed agents map', async () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0);

      const agents = server.listAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].role).toBe('developer');
      expect(agents[0].model).toBe('gpt-4');
      expect(agents[0].status).toBe('running');
      expect(agents[0].sessionId).toBe('session-123');
    });

    it('returns error when adapter creation fails', () => {
      server.start();
      listener.simulateConnection(conn);

      mockCreateAdapter.mockImplementation(() => { throw new Error('no binary'); });
      conn.simulateMessage(SPAWN_MSG);

      const error = conn._sentMessages.find((m) => m.type === 'error');
      expect(error).toBeDefined();
      expect((error as any).code).toBe('SPAWN_FAILED');
      expect((error as any).message).toContain('no binary');
    });

    it('returns error when adapter start fails', async () => {
      const adapter = createMockAdapter();
      adapter.start.mockRejectedValue(new Error('connection refused'));
      mockCreateAdapter.mockReturnValue({ adapter: adapter as any, backend: 'acp', fallback: false });

      server.start();
      listener.simulateConnection(conn);
      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0);

      const error = conn._sentMessages.find((m) => m.type === 'error');
      expect(error).toBeDefined();
      expect((error as any).code).toBe('SPAWN_FAILED');
      expect((error as any).message).toContain('connection refused');
    });

    it('refuses spawn when mass failure pause is active', () => {
      server.start();
      listener.simulateConnection(conn);

      // Trigger mass failure by recording many exits
      for (let i = 0; i < 5; i++) {
        (server as any).massFailure.recordExit({
          agentId: `agent-${i}`,
          exitCode: 1,
          signal: null,
          error: 'crash',
          timestamp: Date.now(),
        });
      }

      conn.simulateMessage(SPAWN_MSG);
      const error = conn._sentMessages.find((m) => m.type === 'error');
      expect(error).toBeDefined();
      expect((error as any).code).toBe('SPAWN_FAILED');
      expect((error as any).message).toContain('mass failure');
    });
  });

  // ── Send Message ──────────────────────────────────────────────

  describe('send_message', () => {
    it('prompts an existing agent', async () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0);

      const agents = server.listAgents();
      const agentId = agents[0].id;

      conn.simulateMessage({
        type: 'send_message',
        requestId: 'msg-1',
        scope: { projectId: 'proj-1', teamId: 'team-1' },
        agentId,
        content: 'hello agent',
      });

      expect(agents[0].adapter.prompt).toHaveBeenCalledWith('hello agent');
    });

    it('returns error for unknown agent', () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage({
        type: 'send_message',
        requestId: 'msg-2',
        scope: { projectId: 'proj-1', teamId: 'team-1' },
        agentId: 'nonexistent',
        content: 'hello',
      });

      const error = conn._sentMessages.find((m) => m.type === 'error');
      expect(error).toBeDefined();
      expect((error as any).code).toBe('AGENT_NOT_FOUND');
    });
  });

  // ── Terminate ─────────────────────────────────────────────────

  describe('terminate', () => {
    it('terminates an existing agent', async () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0);

      const agents = server.listAgents();
      const agentId = agents[0].id;

      conn.simulateMessage({
        type: 'terminate_agent',
        requestId: 'term-1',
        scope: { projectId: 'proj-1', teamId: 'team-1' },
        agentId,
      });

      expect(agents[0].adapter.terminate).toHaveBeenCalled();
      expect(agents[0].status).toBe('stopping');
    });

    it('returns error for unknown agent', () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage({
        type: 'terminate_agent',
        requestId: 'term-2',
        scope: { projectId: 'proj-1', teamId: 'team-1' },
        agentId: 'nonexistent',
      });

      const error = conn._sentMessages.find((m) => m.type === 'error');
      expect((error as any).code).toBe('AGENT_NOT_FOUND');
    });
  });

  // ── List Agents ───────────────────────────────────────────────

  describe('list_agents', () => {
    it('returns empty list when no agents', () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage({
        type: 'list_agents',
        requestId: 'list-1',
        scope: { projectId: 'proj-1', teamId: 'team-1' },
      });

      const list = conn._sentMessages.find((m) => m.type === 'agent_list');
      expect(list).toBeDefined();
      expect((list as any).agents).toHaveLength(0);
    });

    it('returns all agents with correct info', async () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0);

      conn.simulateMessage({
        type: 'list_agents',
        requestId: 'list-2',
        scope: { projectId: 'proj-1', teamId: 'team-1' },
      });

      const list = conn._sentMessages.find((m) => m.type === 'agent_list');
      expect((list as any).agents).toHaveLength(1);
      expect((list as any).agents[0].role).toBe('developer');
      expect((list as any).agents[0].status).toBe('running');
      expect((list as any).agents[0].spawnedAt).toBeTruthy();
    });
  });

  // ── Event Relay ───────────────────────────────────────────────

  describe('event relay', () => {
    it('relays adapter text events to connection', async () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0);

      const agents = server.listAgents();
      agents[0].adapter.emit('text', 'hello world');

      const event = conn._sentMessages.find(
        (m) => m.type === 'agent_event' && (m as any).eventType === 'text',
      );
      expect(event).toBeDefined();
      expect((event as any).data.text).toBe('hello world');
      expect((event as any).agentId).toBe(agents[0].id);
    });

    it('relays adapter exit events as agent_exited', async () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0);

      const agents = server.listAgents();
      agents[0].adapter.emit('exit', 0);

      const exitMsg = conn._sentMessages.find((m) => m.type === 'agent_exited');
      expect(exitMsg).toBeDefined();
      expect((exitMsg as any).exitCode).toBe(0);
      expect(agents[0].status).toBe('exited');
    });

    it('marks agent as crashed on non-zero exit', async () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0);

      const agents = server.listAgents();
      agents[0].adapter.emit('exit', 1);

      expect(agents[0].status).toBe('crashed');
      const exitMsg = conn._sentMessages.find((m) => m.type === 'agent_exited');
      expect((exitMsg as any).exitCode).toBe(1);
    });

    it('relays thinking, tool_call, prompt_complete events', async () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0);

      const agents = server.listAgents();
      agents[0].adapter.emit('thinking', 'hmm');
      agents[0].adapter.emit('tool_call', { name: 'bash', args: {} });
      agents[0].adapter.emit('prompt_complete', 'end_turn');

      const types = conn._sentMessages
        .filter((m) => m.type === 'agent_event')
        .map((m) => (m as any).eventType);
      expect(types).toContain('thinking');
      expect(types).toContain('tool_call');
      expect(types).toContain('prompt_complete');
    });
  });

  // ── Subscribe / Replay ────────────────────────────────────────

  describe('subscribe', () => {
    it('replays buffered events on subscribe', async () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0);

      const agents = server.listAgents();

      // Disconnect to start buffering
      conn.simulateDisconnect('test');

      // Emit events while disconnected
      agents[0].adapter.emit('text', 'buffered text 1');
      agents[0].adapter.emit('text', 'buffered text 2');

      // Reconnect
      const conn2 = createMockConnection();
      listener.simulateConnection(conn2);

      // Subscribe with no lastSeenEventId → get all buffered events
      conn2.simulateMessage({
        type: 'subscribe',
        requestId: 'sub-1',
        scope: { projectId: 'proj-1', teamId: 'team-1' },
      });

      const events = conn2._sentMessages.filter(
        (m) => m.type === 'agent_event' && (m as any).eventType === 'text',
      );
      expect(events.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── Orphan Timer ──────────────────────────────────────────────

  describe('orphan timer', () => {
    it('starts orphan timer on start', () => {
      server.start();
      expect(server.started).toBe(true);
    });

    it('triggers stop after orphan timeout with no connection', async () => {
      server.start();
      expect(server.stopped).toBe(false);

      await vi.advanceTimersByTimeAsync(5000);
      expect(server.stopped).toBe(true);
    });

    it('clears orphan timer when connection arrives', async () => {
      server.start();

      // Connection arrives before timeout
      listener.simulateConnection(conn);

      await vi.advanceTimersByTimeAsync(5000);
      expect(server.stopped).toBe(false); // Timer was cleared
    });

    it('restarts orphan timer on disconnect', async () => {
      server.start();
      listener.simulateConnection(conn);

      // Disconnect triggers new timer
      conn.simulateDisconnect('test');

      // Wait less than timeout — still alive
      await vi.advanceTimersByTimeAsync(3000);
      expect(server.stopped).toBe(false);

      // Wait remaining time — now stops
      await vi.advanceTimersByTimeAsync(2000);
      expect(server.stopped).toBe(true);
    });
  });

  // ── Error Handling ────────────────────────────────────────────

  describe('error handling', () => {
    it('sends INVALID_MESSAGE for unknown message type', () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage({ type: 'unknown_type' } as any);

      const error = conn._sentMessages.find((m) => m.type === 'error');
      expect(error).toBeDefined();
      expect((error as any).code).toBe('INVALID_MESSAGE');
    });
  });

  // ── Getters ───────────────────────────────────────────────────

  describe('getters', () => {
    it('getAgent returns agent by ID', async () => {
      server.start();
      listener.simulateConnection(conn);

      conn.simulateMessage(SPAWN_MSG);
      await vi.advanceTimersByTimeAsync(0);

      const agents = server.listAgents();
      const found = server.getAgent(agents[0].id);
      expect(found).toBeDefined();
      expect(found!.role).toBe('developer');
    });

    it('getAgent returns undefined for unknown ID', () => {
      server.start();
      expect(server.getAgent('nonexistent')).toBeUndefined();
    });

    it('isSpawningPaused reflects mass failure state', () => {
      server.start();
      expect(server.isSpawningPaused).toBe(false);
    });
  });
});
