import { Router } from 'express';
import type { AppContext } from './context.js';
import { DebateDetector } from '../coordination/DebateDetector.js';

export function debateRoutes(ctx: AppContext): Router {
  const { activityLedger } = ctx;
  const detector = new DebateDetector(activityLedger);
  const router = Router();

  // GET /api/debates/:leadId — detect debates in recent activity
  router.get('/debates/:leadId', (req, res) => {
    try {
      const { leadId } = req.params;
      const since = req.query.since as string | undefined;
      const debates = detector.detectDebates(leadId, since);
      res.json({ debates, count: debates.length });
    } catch (err) {
      res.status(500).json({ error: 'Failed to detect debates', detail: (err as Error).message });
    }
  });

  return router;
}
