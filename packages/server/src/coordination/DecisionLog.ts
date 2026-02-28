import { EventEmitter } from 'events';
import { eq, asc, and, inArray } from 'drizzle-orm';
import type { Database } from '../db/database.js';
import { decisions } from '../db/schema.js';

export type DecisionStatus = 'recorded' | 'confirmed' | 'rejected';

export interface Decision {
  id: string;
  agentId: string;
  agentRole: string;
  leadId: string | null;
  title: string;
  rationale: string;
  needsConfirmation: boolean;
  status: DecisionStatus;
  confirmedAt: string | null;
  timestamp: string;
}

function rowToDecision(row: typeof decisions.$inferSelect): Decision {
  return {
    id: row.id,
    agentId: row.agentId,
    agentRole: row.agentRole,
    leadId: row.leadId,
    title: row.title,
    rationale: row.rationale ?? '',
    needsConfirmation: row.needsConfirmation === 1,
    status: row.status as DecisionStatus,
    confirmedAt: row.confirmedAt,
    timestamp: row.createdAt!,
  };
}

export class DecisionLog extends EventEmitter {
  private db: Database;

  constructor(db: Database) {
    super();
    this.db = db;
  }

  add(agentId: string, agentRole: string, title: string, rationale: string, needsConfirmation = false, leadId?: string): Decision {
    const id = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();

    this.db.drizzle.insert(decisions).values({
      id,
      agentId,
      agentRole,
      leadId: leadId || null,
      title,
      rationale,
      needsConfirmation: needsConfirmation ? 1 : 0,
      status: 'recorded',
      createdAt: timestamp,
    }).run();

    const decision: Decision = { id, agentId, agentRole, leadId: leadId || null, title, rationale, needsConfirmation, status: 'recorded', confirmedAt: null, timestamp };
    this.emit('decision', decision);
    return decision;
  }

  getAll(): Decision[] {
    return this.db.drizzle
      .select()
      .from(decisions)
      .orderBy(asc(decisions.createdAt))
      .all()
      .map(rowToDecision);
  }

  getByAgent(agentId: string): Decision[] {
    return this.db.drizzle
      .select()
      .from(decisions)
      .where(eq(decisions.agentId, agentId))
      .orderBy(asc(decisions.createdAt))
      .all()
      .map(rowToDecision);
  }

  getByAgents(agentIds: string[]): Decision[] {
    if (agentIds.length === 0) return [];
    return this.db.drizzle
      .select()
      .from(decisions)
      .where(inArray(decisions.agentId, agentIds))
      .orderBy(asc(decisions.createdAt))
      .all()
      .map(rowToDecision);
  }

  getByLeadId(leadId: string): Decision[] {
    return this.db.drizzle
      .select()
      .from(decisions)
      .where(eq(decisions.leadId, leadId))
      .orderBy(asc(decisions.createdAt))
      .all()
      .map(rowToDecision);
  }

  getNeedingConfirmation(): Decision[] {
    return this.db.drizzle
      .select()
      .from(decisions)
      .where(and(eq(decisions.needsConfirmation, 1), eq(decisions.status, 'recorded')))
      .orderBy(asc(decisions.createdAt))
      .all()
      .map(rowToDecision);
  }

  getById(id: string): Decision | undefined {
    const row = this.db.drizzle
      .select()
      .from(decisions)
      .where(eq(decisions.id, id))
      .get();
    return row ? rowToDecision(row) : undefined;
  }

  confirm(id: string): Decision | undefined {
    const existing = this.getById(id);
    if (!existing || existing.status !== 'recorded') return existing;
    const confirmedAt = new Date().toISOString();
    this.db.drizzle
      .update(decisions)
      .set({ status: 'confirmed', confirmedAt })
      .where(eq(decisions.id, id))
      .run();
    const decision = this.getById(id);
    if (decision) this.emit('decision:confirmed', decision);
    return decision;
  }

  reject(id: string): Decision | undefined {
    const existing = this.getById(id);
    if (!existing || existing.status !== 'recorded') return existing;
    const confirmedAt = new Date().toISOString();
    this.db.drizzle
      .update(decisions)
      .set({ status: 'rejected', confirmedAt })
      .where(eq(decisions.id, id))
      .run();
    const decision = this.getById(id);
    if (decision) this.emit('decision:rejected', decision);
    return decision;
  }

  clear(): void {
    this.db.drizzle.delete(decisions).run();
  }
}
