import { Router, Request, Response } from 'express';
import { CloudAdapter } from 'botbuilder';
import {
  notifyTicketCreated,
  notifyTicketUpdated,
  notifyOutageDetected,
  notifyMention,
  notifyAssignment,
} from '../services/notificationService';
import { NotifyTicketPayload, NotifyOutagePayload, MentionPayload, AssignmentPayload } from '../types';
import { config } from '../config';

export function createWebhookRouter(adapter: CloudAdapter): Router {
  const router = Router();

  router.use((req: Request, res: Response, next) => {
    const key = req.headers['x-api-key'] as string | undefined;
    if (!key || key !== config.webhookApiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  /**
   * POST /api/notify/ticket-created
   * Called by rgmc-gateway when a new ticket is submitted.
   *
   * Body: { event: "ticket.created", ticket: Ticket }
   */
  router.post('/ticket-created', async (req: Request, res: Response) => {
    const payload = req.body as NotifyTicketPayload;
    if (!payload?.ticket) {
      res.status(400).json({ error: 'Missing ticket in payload' });
      return;
    }
    try {
      await notifyTicketCreated(payload.ticket, adapter);
      res.json({ success: true, message: 'Notification dispatched' });
    } catch (err) {
      console.error('ticket-created notify error:', err);
      res.status(500).json({ error: 'Failed to dispatch notification' });
    }
  });

  /**
   * POST /api/notify/ticket-updated
   * Called by rgmc-gateway when a ticket is updated (status, assignee, etc.).
   *
   * Body: { event: "ticket.updated", ticket: Ticket, changes: TicketChanges }
   */
  router.post('/ticket-updated', async (req: Request, res: Response) => {
    const payload = req.body as NotifyTicketPayload;
    if (!payload?.ticket) {
      res.status(400).json({ error: 'Missing ticket in payload' });
      return;
    }
    try {
      await notifyTicketUpdated(payload.ticket, payload.changes || {}, adapter);
      res.json({ success: true, message: 'Notification dispatched' });
    } catch (err) {
      console.error('ticket-updated notify error:', err);
      res.status(500).json({ error: 'Failed to dispatch notification' });
    }
  });

  /**
   * POST /api/notify/outage-detected
   * Called by rgmc-gateway when an outage is detected.
   *
   * Body: { event: "outage.detected", outage: Outage, issue_count: number }
   */
  router.post('/outage-detected', async (req: Request, res: Response) => {
    const payload = req.body as NotifyOutagePayload;
    if (!payload?.outage) {
      res.status(400).json({ error: 'Missing outage in payload' });
      return;
    }
    try {
      await notifyOutageDetected(payload.outage, payload.issue_count ?? 2, adapter);
      res.json({ success: true, message: 'Outage notification dispatched' });
    } catch (err) {
      console.error('outage-detected notify error:', err);
      res.status(500).json({ error: 'Failed to dispatch outage notification' });
    }
  });

  /**
   * POST /api/notify/mention
   * Called by rgmc-gateway when a user is @mentioned in a comment.
   *
   * Body: MentionPayload
   */
  router.post('/mention', async (req: Request, res: Response) => {
    const payload = req.body as MentionPayload;
    if (!payload?.mentioned_username || !payload?.entity_type) {
      res.status(400).json({ error: 'Missing mentioned_username or entity_type in payload' });
      return;
    }
    try {
      await notifyMention(payload, adapter);
      res.json({ success: true, message: 'Notification dispatched' });
    } catch (err) {
      console.error('mention notify error:', err);
      res.status(500).json({ error: 'Failed to dispatch notification' });
    }
  });

  /**
   * POST /api/notify/assignment
   * Called by rgmc-gateway when an issue, dev item, or task is assigned to a user.
   *
   * Body: AssignmentPayload
   */
  router.post('/assignment', async (req: Request, res: Response) => {
    const payload = req.body as AssignmentPayload;
    if (!payload?.assigned_username || !payload?.entity_type) {
      res.status(400).json({ error: 'Missing assigned_username or entity_type in payload' });
      return;
    }
    try {
      await notifyAssignment(payload, adapter);
      res.json({ success: true, message: 'Notification dispatched' });
    } catch (err) {
      console.error('assignment notify error:', err);
      res.status(500).json({ error: 'Failed to dispatch notification' });
    }
  });

  /**
   * POST /api/notify
   * Unified endpoint — dispatches based on payload.event field.
   *
   * Body: NotifyTicketPayload | MentionPayload | AssignmentPayload (event + ...)
   */
  router.post('/', async (req: Request, res: Response) => {
    const payload = req.body as { event?: string } & Record<string, unknown>;
    if (!payload?.event) {
      res.status(400).json({ error: 'Missing event in payload' });
      return;
    }
    try {
      if (payload.event === 'ticket.created') {
        const p = payload as unknown as NotifyTicketPayload;
        if (!p.ticket) { res.status(400).json({ error: 'Missing ticket in payload' }); return; }
        await notifyTicketCreated(p.ticket, adapter);
      } else if (payload.event === 'ticket.updated') {
        const p = payload as unknown as NotifyTicketPayload;
        if (!p.ticket) { res.status(400).json({ error: 'Missing ticket in payload' }); return; }
        await notifyTicketUpdated(p.ticket, p.changes || {}, adapter);
      } else if (payload.event === 'mention.created') {
        const p = payload as unknown as MentionPayload;
        if (!p.mentioned_username) { res.status(400).json({ error: 'Missing mentioned_username in payload' }); return; }
        await notifyMention(p, adapter);
      } else if (payload.event === 'assignment.created') {
        const p = payload as unknown as AssignmentPayload;
        if (!p.assigned_username) { res.status(400).json({ error: 'Missing assigned_username in payload' }); return; }
        await notifyAssignment(p, adapter);
      } else {
        res.status(400).json({ error: `Unknown event: ${payload.event}` });
        return;
      }
      res.json({ success: true, message: 'Notification dispatched' });
    } catch (err) {
      console.error('notify error:', err);
      res.status(500).json({ error: 'Failed to dispatch notification' });
    }
  });

  return router;
}
