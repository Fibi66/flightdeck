import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentServerClient } from '../AgentServerClient.js';
import type { AgentServerClientOptions } from '../AgentServerClient.js';
import type {
  AgentServerTransport,
  TransportState,
  AgentServerMessage,
  OrchestratorMessage,
  MessageScope,
} from '../../transport/types.js';

// ── Mock Transport ──────────────────────────────────────────────────

class MockTransport implements AgentServerTransport {
  state: TransportState = 'disconnected';
  supportsReconnect = true;

  private messageHandlers: Array<(msg: AgentServerMessage) => void> = [];
  private stateHandlers: Array<(state: TransportState) => void> = [];

  /** Messages sent by the client. */
  sent: OrchestratorMessage[] = [];

  connect = vi.fn(async () => {
    this.setState('connected');
  });

  disconnect = vi.fn(async () => {
    this.setState('disconnected');
  });

  send = vi.fn((msg: OrchestratorMessage) => {
    this.sent.push(msg);
  });

  onMessage(handler: (msg: AgentServerMessage) => void): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  onStateChange(handler: (state: TransportState) => void): () => void {
    this.stateHandlers.push(handler);
    return () => {
      this.stateHandlers = this.stateHandlers.filter(h => h !== handler);
    };
  }

  // ── Test helpers ──

  /** Simulate receiving a message from the server. */
  receiveMessage(msg: AgentServerMessage): void {
    for (const handler of this.messageHandlers) {
      handler(msg);
    }
  }

  /** Simulate state change. */
  setState(state: TransportState): void {
    this.state = state;
    for (const handler of this.stateHandlers) {
      handler(state);
    }
  }

  /** Get the last sent message's requestId. */
  lastRequestId(): string {
    return (this.sent[this.sent.length - 1] as any).requestId;
  }
}

// ── Fixtures ────────────────────────────────────────────────────────

const scope: MessageScope = { projectId: 'test-proj', teamId: 'team-1' };

function createClient(opts?: AgentServerClientOptions) {
  const transport = new MockTransport();
  const client = new AgentServerClient(transport, scope, opts);
  return { client, transport };
}

describe('AgentServerClient', () => {
  let client: AgentServerClient;
  let transport: MockTransport;

  beforeEach(() => {
    ({ client, transport } = createClient());
  });

  afterEach(async () => {
    await client.dispose().catch(() => {});
  });

  // ── Connection ────────────────────────────────────────────────

  describe('connect', () => {
    it('connects to transport', async () => {
      await client.connect();
      expect(transport.connect).toHaveBeenCalledOnce();
      expect(client.isConnected).toBe(true);
    });

    it('emits connected event', async () => {
      const spy = vi.fn();
      client.on('connected', spy);
      await client.connect();
      expect(spy).toHaveBeenCalled();
    });

    it('authenticates when token provided', async () => {
      const { client: authClient, transport: authTransport } = createClient({ authToken: 'secret' });

      const connectPromise = authClient.connect();

      // Wait for connect + auth request to be sent
      await new Promise(r => setTimeout(r, 0));

      // Find the auth request
      const authReq = authTransport.sent.find(m => m.type === 'authenticate');
      expect(authReq).toBeDefined();

      // Respond with auth success
      authTransport.receiveMessage({
        type: 'auth_result',
        requestId: (authReq as any).requestId,
        success: true,
      });

      await connectPromise;
      expect(authClient.isConnected).toBe(true);
      await authClient.dispose();
    });

    it('throws on auth failure', async () => {
      const { client: authClient, transport: authTransport } = createClient({ authToken: 'bad-token' });

      const connectPromise = authClient.connect();
      await new Promise(r => setTimeout(r, 0));

      const authReq = authTransport.sent.find(m => m.type === 'authenticate');
      authTransport.receiveMessage({
        type: 'auth_result',
        requestId: (authReq as any).requestId,
        success: false,
        error: 'Invalid token',
      });

      await expect(connectPromise).rejects.toThrow('Authentication failed');
      await authClient.dispose();
    });

    it('throws if disposed', async () => {
      await client.dispose();
      await expect(client.connect()).rejects.toThrow('disposed');
    });
  });

  // ── Disconnect ────────────────────────────────────────────────

  describe('disconnect', () => {
    it('disconnects transport', async () => {
      await client.connect();
      await client.disconnect();
      expect(transport.disconnect).toHaveBeenCalledOnce();
    });

    it('emits disconnected event', async () => {
      await client.connect();
      const spy = vi.fn();
      client.on('disconnected', spy);
      await client.disconnect();
      expect(spy).toHaveBeenCalledWith('client disconnect');
    });

    it('rejects pending requests', async () => {
      await client.connect();

      const spawnPromise = client.spawn('dev', 'fast');
      await client.disconnect();

      await expect(spawnPromise).rejects.toThrow('disconnecting');
    });
  });

  // ── spawn() ───────────────────────────────────────────────────

  describe('spawn', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('sends spawn_agent and returns result', async () => {
      const spawnPromise = client.spawn('developer', 'fast', 'build feature');

      const req = transport.sent.find(m => m.type === 'spawn_agent');
      expect(req).toBeDefined();
      expect(req).toMatchObject({
        type: 'spawn_agent',
        scope,
        role: 'developer',
        model: 'fast',
        task: 'build feature',
      });

      transport.receiveMessage({
        type: 'agent_spawned',
        requestId: (req as any).requestId,
        agentId: 'agent-001',
        role: 'developer',
        model: 'fast',
        pid: 12345,
      });

      const result = await spawnPromise;
      expect(result).toEqual({
        agentId: 'agent-001',
        role: 'developer',
        model: 'fast',
        pid: 12345,
      });
    });

    it('sends optional context', async () => {
      const ctx = { maxTokens: 1000 };
      const spawnPromise = client.spawn('dev', 'fast', 'task', ctx);

      const req = transport.sent.find(m => m.type === 'spawn_agent');
      expect((req as any).context).toEqual(ctx);

      transport.receiveMessage({
        type: 'agent_spawned',
        requestId: (req as any).requestId,
        agentId: 'a',
        role: 'dev',
        model: 'fast',
        pid: 1,
      });
      await spawnPromise;
    });

    it('rejects on error response', async () => {
      const spawnPromise = client.spawn('dev', 'fast');
      const req = transport.sent.find(m => m.type === 'spawn_agent');

      transport.receiveMessage({
        type: 'error',
        requestId: (req as any).requestId,
        code: 'SPAWN_FAILED',
        message: 'Out of resources',
      });

      await expect(spawnPromise).rejects.toThrow('Out of resources');
    });

    it('rejects on timeout', async () => {
      const { client: fastClient, transport: fastTransport } = createClient({ requestTimeoutMs: 50 });
      await fastClient.connect();

      const spawnPromise = fastClient.spawn('dev', 'fast');
      await expect(spawnPromise).rejects.toThrow('timeout');

      await fastClient.dispose();
    });
  });

  // ── prompt() ──────────────────────────────────────────────────

  describe('prompt', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('sends send_message to agent', async () => {
      await client.prompt('agent-001', 'Hello agent');

      const msg = transport.sent.find(m => m.type === 'send_message');
      expect(msg).toMatchObject({
        type: 'send_message',
        scope,
        agentId: 'agent-001',
        content: 'Hello agent',
      });
    });

    it('throws if not connected', async () => {
      await client.disconnect();
      await expect(client.prompt('agent-001', 'hi')).rejects.toThrow('not connected');
    });
  });

  // ── terminate() ───────────────────────────────────────────────

  describe('terminate', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('sends terminate_agent', async () => {
      await client.terminate('agent-001', 'user requested');

      const msg = transport.sent.find(m => m.type === 'terminate_agent');
      expect(msg).toMatchObject({
        type: 'terminate_agent',
        scope,
        agentId: 'agent-001',
        reason: 'user requested',
      });
    });

    it('works without reason', async () => {
      await client.terminate('agent-001');

      const msg = transport.sent.find(m => m.type === 'terminate_agent');
      expect(msg).toBeDefined();
      expect((msg as any).reason).toBeUndefined();
    });
  });

  // ── list() ────────────────────────────────────────────────────

  describe('list', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('sends list_agents and returns agents', async () => {
      const listPromise = client.list();

      const req = transport.sent.find(m => m.type === 'list_agents');
      expect(req).toBeDefined();

      const agents = [
        {
          agentId: 'a1', role: 'dev', model: 'fast', status: 'running' as const,
          pid: 100, task: 'build', spawnedAt: '2026-01-01',
        },
        {
          agentId: 'a2', role: 'reviewer', model: 'fast', status: 'idle' as const,
          pid: 200, spawnedAt: '2026-01-01',
        },
      ];

      transport.receiveMessage({
        type: 'agent_list',
        requestId: (req as any).requestId,
        agents,
      });

      const result = await listPromise;
      expect(result).toEqual(agents);
    });
  });

  // ── subscribe() ───────────────────────────────────────────────

  describe('subscribe', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('sends subscribe message', () => {
      client.subscribe('agent-001');

      const msg = transport.sent.find(m => m.type === 'subscribe');
      expect(msg).toMatchObject({
        type: 'subscribe',
        scope,
        agentId: 'agent-001',
      });
    });

    it('includes lastSeenEventId when provided', () => {
      client.subscribe('agent-001', 'evt-50');

      const msg = transport.sent.find(m => m.type === 'subscribe');
      expect((msg as any).lastSeenEventId).toBe('evt-50');
    });

    it('uses tracked lastSeenEventId when not provided', () => {
      // Simulate receiving an event to track the ID
      transport.receiveMessage({
        type: 'agent_event',
        agentId: 'agent-001',
        eventId: 'evt-99',
        eventType: 'text',
        data: { text: 'hello' },
      });

      client.subscribe('agent-001');

      const msg = transport.sent.find(m => m.type === 'subscribe');
      expect((msg as any).lastSeenEventId).toBe('evt-99');
    });
  });

  // ── ping() ────────────────────────────────────────────────────

  describe('ping', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('sends ping and returns timestamp', async () => {
      const pingPromise = client.ping();

      const req = transport.sent.find(m => m.type === 'ping');
      expect(req).toBeDefined();

      transport.receiveMessage({
        type: 'pong',
        requestId: (req as any).requestId,
        timestamp: 1704067200,
      });

      const ts = await pingPromise;
      expect(ts).toBe(1704067200);
    });
  });

  // ── Event Handling ────────────────────────────────────────────

  describe('event handling', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('emits agentSpawned for unsolicited spawn notifications', () => {
      const spy = vi.fn();
      client.on('agentSpawned', spy);

      transport.receiveMessage({
        type: 'agent_spawned',
        requestId: 'unknown-req',
        agentId: 'agent-new',
        role: 'dev',
        model: 'fast',
        pid: 999,
      });

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'agent-new' }));
    });

    it('emits agentEvent and tracks eventId', () => {
      const spy = vi.fn();
      client.on('agentEvent', spy);

      transport.receiveMessage({
        type: 'agent_event',
        agentId: 'agent-001',
        eventId: 'evt-42',
        eventType: 'text',
        data: { text: 'hello' },
      });

      expect(spy).toHaveBeenCalledOnce();
      expect(client.getLastSeenEventId('agent-001')).toBe('evt-42');
    });

    it('tracks latest eventId per agent', () => {
      transport.receiveMessage({
        type: 'agent_event',
        agentId: 'agent-001',
        eventId: 'evt-1',
        eventType: 'text',
        data: {},
      });
      transport.receiveMessage({
        type: 'agent_event',
        agentId: 'agent-001',
        eventId: 'evt-5',
        eventType: 'text',
        data: {},
      });
      transport.receiveMessage({
        type: 'agent_event',
        agentId: 'agent-002',
        eventId: 'evt-3',
        eventType: 'text',
        data: {},
      });

      expect(client.getLastSeenEventId('agent-001')).toBe('evt-5');
      expect(client.getLastSeenEventId('agent-002')).toBe('evt-3');
    });

    it('emits agentExited', () => {
      const spy = vi.fn();
      client.on('agentExited', spy);

      transport.receiveMessage({
        type: 'agent_exited',
        agentId: 'agent-001',
        exitCode: 0,
        reason: 'completed',
      });

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        agentId: 'agent-001',
        exitCode: 0,
      }));
    });

    it('emits error for unsolicited errors', () => {
      const spy = vi.fn();
      client.on('error', spy);

      transport.receiveMessage({
        type: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong',
      });

      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        code: 'INTERNAL_ERROR',
      }));
    });
  });

  // ── Transport State Changes ───────────────────────────────────

  describe('transport state changes', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('rejects pending requests on transport disconnect', async () => {
      const spawnPromise = client.spawn('dev', 'fast');

      transport.setState('disconnected');

      await expect(spawnPromise).rejects.toThrow('disconnected');
    });

    it('re-subscribes tracked agents on reconnect', async () => {
      // Track some events
      transport.receiveMessage({
        type: 'agent_event',
        agentId: 'agent-001',
        eventId: 'evt-10',
        eventType: 'text',
        data: {},
      });
      transport.receiveMessage({
        type: 'agent_event',
        agentId: 'agent-002',
        eventId: 'evt-20',
        eventType: 'text',
        data: {},
      });

      transport.sent.length = 0; // clear sent messages

      // Simulate reconnect
      transport.setState('connected');

      // Should have sent subscribe messages for both tracked agents
      const subscribes = transport.sent.filter(m => m.type === 'subscribe');
      expect(subscribes).toHaveLength(2);

      const agentIds = subscribes.map(s => (s as any).agentId).sort();
      expect(agentIds).toEqual(['agent-001', 'agent-002']);

      const eventIds = subscribes.map(s => (s as any).lastSeenEventId).sort();
      expect(eventIds).toEqual(['evt-10', 'evt-20']);
    });

    it('emits connected on reconnect', () => {
      const spy = vi.fn();
      client.on('connected', spy);

      transport.setState('connected');
      expect(spy).toHaveBeenCalled();
    });

    it('emits disconnected on transport disconnect', () => {
      const spy = vi.fn();
      client.on('disconnected', spy);

      transport.setState('disconnected');
      expect(spy).toHaveBeenCalledWith('transport disconnected');
    });
  });

  // ── Request/Response Matching ─────────────────────────────────

  describe('request/response matching', () => {
    beforeEach(async () => {
      await client.connect();
    });

    it('matches responses by requestId', async () => {
      const p1 = client.spawn('dev', 'fast');
      const p2 = client.ping();

      const spawnReq = transport.sent.find(m => m.type === 'spawn_agent');
      const pingReq = transport.sent.find(m => m.type === 'ping');

      // Respond in reverse order
      transport.receiveMessage({
        type: 'pong',
        requestId: (pingReq as any).requestId,
        timestamp: 123,
      });
      transport.receiveMessage({
        type: 'agent_spawned',
        requestId: (spawnReq as any).requestId,
        agentId: 'a1',
        role: 'dev',
        model: 'fast',
        pid: 1,
      });

      const [spawn, ping] = await Promise.all([p1, p2]);
      expect(spawn.agentId).toBe('a1');
      expect(ping).toBe(123);
    });

    it('tracks pendingCount', async () => {
      expect(client.pendingCount).toBe(0);

      const p = client.spawn('dev', 'fast');
      expect(client.pendingCount).toBe(1);

      const req = transport.sent.find(m => m.type === 'spawn_agent');
      transport.receiveMessage({
        type: 'agent_spawned',
        requestId: (req as any).requestId,
        agentId: 'a1',
        role: 'dev',
        model: 'fast',
        pid: 1,
      });

      await p;
      expect(client.pendingCount).toBe(0);
    });

    it('rejects on error response matching requestId', async () => {
      const listPromise = client.list();
      const req = transport.sent.find(m => m.type === 'list_agents');

      transport.receiveMessage({
        type: 'error',
        requestId: (req as any).requestId,
        code: 'AUTH_REQUIRED',
        message: 'Not authenticated',
      });

      await expect(listPromise).rejects.toThrow('Not authenticated');
    });
  });

  // ── dispose() ─────────────────────────────────────────────────

  describe('dispose', () => {
    it('disconnects and prevents further use', async () => {
      await client.connect();
      await client.dispose();

      await expect(client.connect()).rejects.toThrow('disposed');
    });

    it('removes all listeners', async () => {
      client.on('agentEvent', vi.fn());
      client.on('connected', vi.fn());

      await client.dispose();

      expect(client.listenerCount('agentEvent')).toBe(0);
      expect(client.listenerCount('connected')).toBe(0);
    });

    it('is safe to call multiple times', async () => {
      await client.dispose();
      await client.dispose(); // should not throw
    });
  });
});
