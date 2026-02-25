import { v4 as uuid } from 'uuid';
import type { Database } from '../db/database.js';

export interface ConversationThread {
  id: string;
  agentId: string;
  taskId?: string;
  createdAt: string;
}

export interface ThreadMessage {
  id: number;
  conversationId: string;
  sender: string;
  content: string;
  timestamp: string;
}

export class ConversationStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  createThread(agentId: string, taskId?: string): ConversationThread {
    const id = uuid();
    this.db.run(
      'INSERT INTO conversations (id, agent_id, task_id) VALUES (?, ?, ?)',
      [id, agentId, taskId || null],
    );
    return { id, agentId, taskId, createdAt: new Date().toISOString() };
  }

  addMessage(conversationId: string, sender: string, content: string): ThreadMessage {
    const result = this.db.run(
      'INSERT INTO messages (conversation_id, sender, content) VALUES (?, ?, ?)',
      [conversationId, sender, content],
    );
    return {
      id: Number(result.lastInsertRowid),
      conversationId,
      sender,
      content,
      timestamp: new Date().toISOString(),
    };
  }

  getThreadsByAgent(agentId: string): ConversationThread[] {
    return this.db.all<any>(
      'SELECT id, agent_id AS agentId, task_id AS taskId, created_at AS createdAt FROM conversations WHERE agent_id = ? ORDER BY created_at DESC',
      [agentId],
    );
  }

  getMessages(conversationId: string, limit = 100): ThreadMessage[] {
    return this.db.all<any>(
      'SELECT id, conversation_id AS conversationId, sender, content, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT ?',
      [conversationId, limit],
    );
  }

  getRecentMessages(agentId: string, limit = 50): ThreadMessage[] {
    return this.db.all<any>(
      `SELECT m.id, m.conversation_id AS conversationId, m.sender, m.content, m.timestamp
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       WHERE c.agent_id = ?
       ORDER BY m.timestamp DESC LIMIT ?`,
      [agentId, limit],
    );
  }
}
