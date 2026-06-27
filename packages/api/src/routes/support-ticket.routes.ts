import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import * as supportTicketService from '../services/support-ticket.service';
import { createAppError } from '../middleware/error.middleware';
import { platformConfig } from '../config/platform.config';

const router = Router();

function getParamId(req: AuthenticatedRequest): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id) throw createAppError('Ticket ID is required.', 400);
  return id;
}

// List tickets (admin/support agents)
router.get(
  '/',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || platformConfig.defaultPageSize, platformConfig.maxPageSize);
      const { status, type, priority, assignedAgentId } = req.query as Record<string, string | undefined>;
      const result = await supportTicketService.listTickets({ page, limit, status, type, priority, assignedAgentId });
      res.json({ success: true, data: result.tickets, meta: { total: result.total, page, limit } });
    } catch (error) {
      next(error);
    }
  },
);

// ── Owner-scoped routes (any authenticated user, their OWN tickets) ──
// Registered BEFORE '/:id' so the literal '/mine' segment is not captured
// as an :id param by the admin route below.

// List the caller's own tickets (in-app "My support requests" inbox)
router.get(
  '/mine',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || platformConfig.defaultPageSize, platformConfig.maxPageSize);
      const { status } = req.query as Record<string, string | undefined>;
      const result = await supportTicketService.listMyTickets({ userId: req.user!.userId, page, limit, status });
      res.json({ success: true, data: result.tickets, meta: { total: result.total, page, limit } });
    } catch (error) {
      next(error);
    }
  },
);

// Get one of the caller's own tickets + its customer-visible messages
router.get(
  '/mine/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const ticket = await supportTicketService.getTicketById(id);
      // 404 (not 403) when the ticket is missing OR belongs to someone else —
      // never confirm the existence of another user's ticket.
      if (!ticket || ticket.user_id !== req.user!.userId) {
        throw createAppError('Ticket not found.', 404);
      }
      // includeInternal = false: hide admin internal notes from the customer.
      const messages = await supportTicketService.getTicketMessages(id, false);
      res.json({ success: true, data: { ...ticket, messages } });
    } catch (error) {
      next(error);
    }
  },
);

// Get single ticket with messages
router.get(
  '/:id',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const ticket = await supportTicketService.getTicketById(id);
      if (!ticket) throw createAppError('Ticket not found.', 404);
      const messages = await supportTicketService.getTicketMessages(id);
      res.json({ success: true, data: { ...ticket, messages } });
    } catch (error) {
      next(error);
    }
  },
);

// Create ticket (any authenticated user)
router.post(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { type, priority, subject, description, bookingId } = req.body;
      if (!type || !subject || !description) {
        throw createAppError('Type, subject, and description are required.', 400);
      }
      const ticket = await supportTicketService.createTicket({
        userId: req.user!.userId,
        type,
        priority: priority || 'medium',
        subject,
        description,
        bookingId,
      });
      res.status(201).json({ success: true, data: ticket });
    } catch (error) {
      next(error);
    }
  },
);

// Add message to ticket
router.post(
  '/:id/messages',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { message, isInternalNote } = req.body;
      if (!message) throw createAppError('Message is required.', 400);

      const ticket = await supportTicketService.getTicketById(getParamId(req));
      if (!ticket) throw createAppError('Ticket not found.', 404);

      const role = req.user!.role;
      const isAdmin = role === 'admin' || role === 'super_admin';

      // Only ticket owner or admins can message
      if (!isAdmin && ticket.user_id !== req.user!.userId) {
        throw createAppError('You do not have access to this ticket.', 403);
      }

      // Only admins can post internal notes
      if (isInternalNote && !isAdmin) {
        throw createAppError('Only admins can post internal notes.', 403);
      }

      const msg = await supportTicketService.addMessage({
        ticketId: getParamId(req),
        senderId: req.user!.userId,
        senderRole: role,
        message,
        isInternalNote: isInternalNote && isAdmin,
      });
      res.status(201).json({ success: true, data: msg });
    } catch (error) {
      next(error);
    }
  },
);

// Update ticket status
router.patch(
  '/:id/status',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { status, resolutionNotes } = req.body;
      if (!status) throw createAppError('Status is required.', 400);
      const ticket = await supportTicketService.updateTicketStatus(getParamId(req), status, resolutionNotes);
      res.json({ success: true, data: ticket });
    } catch (error) {
      next(error);
    }
  },
);

// Assign ticket to agent
router.patch(
  '/:id/assign',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { agentId } = req.body;
      if (!agentId) throw createAppError('Agent ID is required.', 400);
      const ticket = await supportTicketService.assignTicket(getParamId(req), agentId);
      res.json({ success: true, data: ticket });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
