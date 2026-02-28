import { EventEmitter } from 'events';
import { eq, desc, asc, gt, sql, inArray } from 'drizzle-orm';
import { Database } from '../db/database.js';
import { activityLog } from '../db/schema.js';
import { logger } from '../utils/logger.js';

export type ActionType =
  | 'file_edit'
  | 'file_read'
  | 'decision_made'
  | 'task_started'
  | 'task_completed'
  | 'sub_agent_spawned'
  | 'agent_killed'
  | 'lock_acquired'
  | 'lock_released'
  | 'lock_denied'
  | 'message_sent'
  | 'delegated'
  | 'error';

export interface ActivityEntry {
  id: number;
  agentId: string;
  agentRole: string;
  actionType: ActionType;
  summary: string;
  details: Record<string, any>;
  timestamp: string;
}

export class ActivityLedger extends EventEmitter {
  private db: Database;

  constructor(db: Database) {
    super();
    this.db = db;
  }

  log(
    agentId: string,
    agentRole: string,
    actionType: ActionType,
    summary: string,
    details: Record<string, any> = {},
  ): ActivityEntry {
    const detailsJson = JSON.stringify(details);
    const result = this.db.drizzle
      .insert(activityLog)
      .values({ agentId, agentRole, actionType, summary, details: detailsJson })
      .run();
    const row = this.db.drizzle
      .select()
      .from(activityLog)
      .where(eq(activityLog.id, Number(result.lastInsertRowid)))
      .get();
    const entry = this._mapRow(row);
    this.emit('activity', entry);
    return entry;
  }

  getRecent(limit: number = 50): ActivityEntry[] {
    const rows = this.db.drizzle
      .select()
      .from(activityLog)
      .orderBy(desc(activityLog.id))
      .limit(limit)
      .all();
    return rows.map((row) => this._mapRow(row));
  }

  getByAgent(agentId: string, limit: number = 50): ActivityEntry[] {
    const rows = this.db.drizzle
      .select()
      .from(activityLog)
      .where(eq(activityLog.agentId, agentId))
      .orderBy(desc(activityLog.id))
      .limit(limit)
      .all();
    return rows.map((row) => this._mapRow(row));
  }

  getByType(actionType: ActionType, limit: number = 50): ActivityEntry[] {
    const rows = this.db.drizzle
      .select()
      .from(activityLog)
      .where(eq(activityLog.actionType, actionType))
      .orderBy(desc(activityLog.id))
      .limit(limit)
      .all();
    return rows.map((row) => this._mapRow(row));
  }

  getSince(timestamp: string): ActivityEntry[] {
    const rows = this.db.drizzle
      .select()
      .from(activityLog)
      .where(gt(activityLog.timestamp, timestamp))
      .orderBy(asc(activityLog.id))
      .all();
    return rows.map((row) => this._mapRow(row));
  }

  getSummary(): {
    totalActions: number;
    byAgent: Record<string, number>;
    byType: Record<string, number>;
    recentFiles: string[];
  } {
    const totalRow = this.db.drizzle
      .select({ count: sql<number>`count(*)` })
      .from(activityLog)
      .get();
    const totalActions = totalRow?.count ?? 0;

    const agentRows = this.db.drizzle
      .select({ agentId: activityLog.agentId, count: sql<number>`count(*)` })
      .from(activityLog)
      .groupBy(activityLog.agentId)
      .all();
    const byAgent: Record<string, number> = {};
    for (const row of agentRows) {
      byAgent[row.agentId] = row.count;
    }

    const typeRows = this.db.drizzle
      .select({ actionType: activityLog.actionType, count: sql<number>`count(*)` })
      .from(activityLog)
      .groupBy(activityLog.actionType)
      .all();
    const byType: Record<string, number> = {};
    for (const row of typeRows) {
      byType[row.actionType] = row.count;
    }

    const fileRows = this.db.drizzle
      .select({ details: activityLog.details })
      .from(activityLog)
      .where(inArray(activityLog.actionType, ['file_edit', 'file_read']))
      .orderBy(desc(activityLog.id))
      .limit(50)
      .all();
    const recentFiles: string[] = [];
    const seen = new Set<string>();
    for (const row of fileRows) {
      try {
        const parsed = JSON.parse(row.details ?? '{}');
        const file = parsed.file ?? parsed.path;
        if (file && !seen.has(file)) {
          seen.add(file);
          recentFiles.push(file);
        }
      } catch (err) {
        logger.debug('activity', 'Failed to parse activity details JSON', { error: (err as Error).message });
      }
    }

    return { totalActions, byAgent, byType, recentFiles };
  }

  prune(keepCount: number = 10000): void {
    this.db.run(
      'DELETE FROM activity_log WHERE id NOT IN (SELECT id FROM activity_log ORDER BY id DESC LIMIT ?)',
      [keepCount],
    );
  }

  private _mapRow(row: any): ActivityEntry {
    let details: Record<string, any> = {};
    try {
      details = JSON.parse(row.details ?? '{}');
    } catch (err) {
      logger.debug('activity', 'Failed to parse activity row details', { error: (err as Error).message });
      details = {};
    }
    return {
      id: row.id,
      agentId: row.agentId,
      agentRole: row.agentRole,
      actionType: row.actionType as ActionType,
      summary: row.summary,
      details,
      timestamp: row.timestamp,
    };
  }
}
