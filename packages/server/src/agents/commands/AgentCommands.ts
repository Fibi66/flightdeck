/**
 * Agent lifecycle command handlers — thin re-export wrapper.
 *
 * Implementation split into:
 * - AgentLifecycle.ts: CREATE_AGENT, DELEGATE, TERMINATE_AGENT, CANCEL_DELEGATION, SPAWN_AGENT
 * - CompletionTracking.ts: notifyParentOfIdle/Completion, getDelegations, cleanup functions
 */
import type { CommandHandlerContext, CommandEntry } from './types.js';
import { getLifecycleCommands } from './AgentLifecycle.js';

export {
  notifyParentOfIdle,
  notifyParentOfCompletion,
  getDelegations,
  clearCompletionTracking,
  completeDelegationsForAgent,
  cleanupStaleDelegations,
} from './CompletionTracking.js';

export function getAgentCommands(ctx: CommandHandlerContext): CommandEntry[] {
  return getLifecycleCommands(ctx);
}
