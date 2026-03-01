/**
 * Zod schemas for all ACP command payloads.
 *
 * Each command with a JSON payload has a corresponding schema here.
 * Use parseCommandPayload() to parse + validate in one step.
 */
import { z } from 'zod';
import type { Agent } from '../Agent.js';
import { logger } from '../../utils/logger.js';

// ── Comm Commands ────────────────────────────────────────────────────

export const agentMessageSchema = z.object({
  to: z.string({ message: 'Missing required field "to" (agent ID or role)' }).min(1, 'Missing required field "to" (agent ID or role)'),
  content: z.string({ message: 'Missing required field "content"' }).min(1, 'Missing required field "content"'),
});

export const broadcastSchema = z.object({
  content: z.string({ message: 'Missing required field "content"' }).min(1, 'Missing required field "content"'),
});

export const createGroupSchema = z.object({
  name: z.string({ message: 'Missing required field "name"' }).min(1, 'Missing required field "name"'),
  members: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
}).refine(
  (data) => (data.members && data.members.length > 0) || (data.roles && data.roles.length > 0),
  { message: 'Requires either "members" (array of agent IDs) or "roles" (array of role names)' },
);

export const addToGroupSchema = z.object({
  group: z.string({ message: 'Missing required field "group"' }).min(1, 'Missing required field "group"'),
  members: z.array(z.string()).min(1, 'Missing required field "members" (array of agent IDs)'),
});

export const removeFromGroupSchema = z.object({
  group: z.string({ message: 'Missing required field "group"' }).min(1, 'Missing required field "group"'),
  members: z.array(z.string()).min(1, 'Missing required field "members" (array of agent IDs)'),
});

export const groupMessageSchema = z.object({
  group: z.string({ message: 'Missing required field "group"' }).min(1, 'Missing required field "group"'),
  content: z.string({ message: 'Missing required field "content"' }).min(1, 'Missing required field "content"'),
});

// ── Agent Commands ───────────────────────────────────────────────────

export const createAgentSchema = z.object({
  role: z.string({ message: 'Missing required field "role"' }).min(1, 'Missing required field "role"'),
  task: z.string().optional(),
  model: z.string().optional(),
  context: z.string().optional(),
  dagTaskId: z.string().optional(),
  name: z.string().optional(),
  sessionId: z.string().optional(),
});

export const delegateSchema = z.object({
  to: z.string({ message: 'Missing required field "to" (agent ID)' }).min(1, 'Missing required field "to" (agent ID)'),
  task: z.string({ message: 'Missing required field "task"' }).min(1, 'Missing required field "task"'),
  context: z.string().optional(),
  dagTaskId: z.string().optional(),
});

export const terminateAgentSchema = z.object({
  id: z.string({ message: 'Missing required field "id" (agent ID)' }).min(1, 'Missing required field "id" (agent ID)'),
  reason: z.string().optional(),
});

export const cancelDelegationSchema = z.object({
  agentId: z.string().optional(),
  delegationId: z.string().optional(),
}).refine(
  (data) => data.agentId || data.delegationId,
  { message: 'requires either "agentId" or "delegationId"' },
);

// ── Coordination Commands ────────────────────────────────────────────

export const lockFileSchema = z.object({
  filePath: z.string({ message: 'Missing required field "filePath"' }).min(1, 'Missing required field "filePath"'),
  reason: z.string().optional(),
});

export const unlockFileSchema = z.object({
  filePath: z.string({ message: 'Missing required field "filePath"' }).min(1, 'Missing required field "filePath"'),
});

export const activitySchema = z.object({
  action: z.string().optional(),
  actionType: z.string().optional(),
  summary: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const decisionSchema = z.object({
  title: z.string({ message: 'Missing required field "title"' }).min(1, 'Missing required field "title"'),
  rationale: z.string().optional(),
  needsConfirmation: z.boolean().optional(),
});

export const commitSchema = z.object({
  message: z.string().optional(),
  files: z.array(z.string()).optional(),
});

// ── System Commands ──────────────────────────────────────────────────

export const requestLimitChangeSchema = z.object({
  limit: z.union([z.number(), z.string()]).transform((val) => {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    return num;
  }).pipe(z.number().int().min(1, 'Limit must be at least 1').max(100, 'Limit must be at most 100')),
  reason: z.string().optional(),
});

// ── Timer Commands ───────────────────────────────────────────────────

export const setTimerSchema = z.object({
  label: z.string({ message: 'Missing required field "label"' }).min(1, 'Missing required field "label"'),
  delay: z.union([z.number(), z.string()]).transform((val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return num;
  }).pipe(z.number().min(5, 'Delay must be at least 5 seconds').max(86400, 'Delay must be at most 86400 seconds (24 hours)')),
  message: z.string({ message: 'Missing required field "message"' }).min(1, 'Missing required field "message"'),
  repeat: z.boolean().optional(),
});

export const cancelTimerSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
}).refine(
  (data) => data.id || data.name,
  { message: 'Requires either "id" (timer ID) or "name" (timer label)' },
);

// ── Deferred Commands ────────────────────────────────────────────────

export const deferIssueSchema = z.object({
  description: z.string({ message: 'Missing required field "description"' }).min(1, 'Missing required field "description"'),
  severity: z.string().optional(),
  sourceFile: z.string().optional(),
  file: z.string().optional(),
});

export const resolveDeferredSchema = z.object({
  id: z.number({ message: 'Missing required field "id" (number)' }),
  dismiss: z.boolean().optional(),
});

// ── Capability Commands ──────────────────────────────────────────────

export const acquireCapabilitySchema = z.object({
  capability: z.string({ message: 'Missing required field "capability"' }).min(1, 'Missing required field "capability"'),
  reason: z.string().optional(),
});

// ── Direct Message Commands ──────────────────────────────────────────

export const directMessageSchema = z.object({
  to: z.string({ message: 'Missing required field "to" (agent ID)' }).min(1, 'Missing required field "to" (agent ID)'),
  content: z.string({ message: 'Missing required field "content"' }).min(1, 'Missing required field "content"'),
});

// ── Template Commands ────────────────────────────────────────────────

export const applyTemplateSchema = z.object({
  template: z.string({ message: 'Missing required field "template"' }).min(1, 'Missing required field "template"'),
  overrides: z.record(z.string(), z.object({
    title: z.string().optional(),
    role: z.string().optional(),
  })).optional(),
});

export const decomposeTaskSchema = z.object({
  task: z.string({ message: 'Missing required field "task"' }).min(1, 'Missing required field "task"'),
});

// ── Task Commands ────────────────────────────────────────────────────

const dagTaskInputSchema = z.object({
  id: z.string({ message: 'Missing required field "id"' }).trim().min(1, 'Missing required field "id"').max(100, 'id too long (max 100 chars)'),
  role: z.string({ message: 'Missing required field "role"' }).trim().min(1, 'Missing required field "role"'),
  description: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
  status: z.string().optional(),
  priority: z.number().optional(),
});

export const declareTasksSchema = z.object({
  tasks: z.array(dagTaskInputSchema).min(1, 'The "tasks" array must not be empty'),
});

export const addTaskSchema = dagTaskInputSchema;

export const taskIdSchema = z.object({
  id: z.string({ message: 'Missing required field "id"' }).min(1, 'Missing required field "id"'),
});

export const completeTaskSchema = z.object({
  id: z.string().optional(),
  summary: z.string().optional(),
  status: z.string().optional(),
  output: z.string().optional(),
});

// ── Validation helper ────────────────────────────────────────────────

/**
 * Parse a JSON string and validate it against a Zod schema.
 * On failure, sends a clear error message to the agent and returns null.
 */
export function parseCommandPayload<T>(
  agent: Agent,
  jsonString: string,
  schema: z.ZodType<T>,
  commandName: string,
): T | null {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch {
    agent.sendMessage(`[System] ${commandName} error: invalid JSON payload. Check syntax and try again.`);
    return null;
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstError = result.error.issues[0];
    const message = firstError?.message || 'Invalid payload';
    // Include path for nested errors (e.g., "tasks[1].role")
    const path = firstError?.path?.length
      ? firstError.path.map((p, i) => typeof p === 'number' ? `[${p}]` : (i > 0 ? `.${String(p)}` : String(p))).join('')
      : '';
    const pathPrefix = path ? ` at "${path}"` : '';
    agent.sendMessage(`[System] ${commandName} validation error${pathPrefix}: ${message}`);
    logger.debug('command', `${commandName} validation failed`, {
      agentId: agent.id,
      errors: result.error.issues.map(i => ({ path: i.path, message: i.message })),
    });
    return null;
  }

  return result.data;
}
