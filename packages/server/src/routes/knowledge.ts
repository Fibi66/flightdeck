import { Router } from 'express';
import { logger } from '../utils/logger.js';
import type { AppContext } from './context.js';
import type { KnowledgeCategory } from '../knowledge/types.js';

const VALID_CATEGORIES = new Set<string>(['core', 'episodic', 'procedural', 'semantic']);

function isValidCategory(cat: string): cat is KnowledgeCategory {
  return VALID_CATEGORIES.has(cat);
}

export function knowledgeRoutes(ctx: AppContext): Router {
  const { knowledgeStore, hybridSearchEngine, memoryCategoryManager, trainingCapture } = ctx;
  const router = Router();

  // --- Knowledge CRUD ---

  /** List knowledge entries for a project, optionally filtered by category */
  router.get('/projects/:id/knowledge', (req, res) => {
    if (!knowledgeStore) return res.status(503).json({ error: 'Knowledge store not available' });
    const projectId = req.params.id;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;

    if (category && !isValidCategory(category)) {
      return res.status(400).json({ error: `Invalid category: ${category}. Must be one of: core, episodic, procedural, semantic` });
    }

    const entries = category
      ? knowledgeStore.getByCategory(projectId, category as KnowledgeCategory)
      : knowledgeStore.getAll(projectId);
    res.json(entries);
  });

  /** Search knowledge entries using full-text search */
  router.get('/projects/:id/knowledge/search', (req, res) => {
    const projectId = req.params.id;
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) return res.status(400).json({ error: 'Query parameter "q" is required' });

    // Prefer hybrid search if available, fall back to FTS5-only
    if (hybridSearchEngine) {
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const limit = req.query.limit ? Math.min(parseInt(String(req.query.limit), 10) || 20, 100) : 20;
      const categories = category && isValidCategory(category) ? [category as KnowledgeCategory] : undefined;

      const results = hybridSearchEngine.search(projectId, query, { categories, limit });
      return res.json(results);
    }

    if (!knowledgeStore) return res.status(503).json({ error: 'Knowledge store not available' });
    const limit = req.query.limit ? Math.min(parseInt(String(req.query.limit), 10) || 20, 100) : 20;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const entries = knowledgeStore.search(projectId, query, {
      limit,
      category: category && isValidCategory(category) ? category as KnowledgeCategory : undefined,
    });
    res.json(entries);
  });

  /** Get category stats for a project */
  router.get('/projects/:id/knowledge/stats', (req, res) => {
    if (!memoryCategoryManager) return res.status(503).json({ error: 'Knowledge manager not available' });
    const stats = memoryCategoryManager.getCategoryStats(req.params.id);
    res.json(stats);
  });

  /** Get training summary (corrections + feedback) for a project */
  router.get('/projects/:id/knowledge/training', (req, res) => {
    if (!trainingCapture) return res.status(503).json({ error: 'Training capture not available' });
    const summary = trainingCapture.getTrainingSummary(req.params.id);
    res.json(summary);
  });

  /** Create or update a knowledge entry */
  router.post('/projects/:id/knowledge', (req, res) => {
    if (!memoryCategoryManager) return res.status(503).json({ error: 'Knowledge manager not available' });
    const projectId = req.params.id;
    const { category, key, content, metadata } = req.body;

    if (!category || !key || !content) {
      return res.status(400).json({ error: 'category, key, and content are required' });
    }
    if (!isValidCategory(category)) {
      return res.status(400).json({ error: `Invalid category: ${category}. Must be one of: core, episodic, procedural, semantic` });
    }

    // Validate via category manager (enforces read-only core, max limits, etc.)
    const validationError = memoryCategoryManager.validateMemory(projectId, category, key, content);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    try {
      const entry = memoryCategoryManager.putMemory(projectId, category, key, content, metadata);
      logger.info({ module: 'knowledge', msg: 'Knowledge entry created', projectId, category, key });
      res.status(201).json(entry);
    } catch (err: any) {
      logger.error({ module: 'knowledge', msg: 'Failed to create knowledge entry', err: err.message });
      res.status(400).json({ error: err.message });
    }
  });

  /** Delete a knowledge entry */
  router.delete('/projects/:id/knowledge/:category/:key', (req, res) => {
    if (!memoryCategoryManager) return res.status(503).json({ error: 'Knowledge manager not available' });
    const { id: projectId, category, key } = req.params;

    if (!isValidCategory(category)) {
      return res.status(400).json({ error: `Invalid category: ${category}` });
    }

    const deleted = memoryCategoryManager.deleteMemory(projectId, category as KnowledgeCategory, key);
    if (!deleted) return res.status(404).json({ error: 'Entry not found' });

    logger.info({ module: 'knowledge', msg: 'Knowledge entry deleted', projectId, category, key });
    res.json({ ok: true });
  });

  return router;
}
