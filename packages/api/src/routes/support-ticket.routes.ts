import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import * as supportTicketService from '../services/support-ticket.service';
import { createAppError } from '../middleware/error.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import {
  adminCreateSupportTicketSchema,
  assignSupportTicketSchema,
  createSupportTicketSchema,
  mySupportTicketListQuerySchema,
  supportAccountIdParamsSchema,
  supportTicketListQuerySchema,
  supportTicketIdParamsSchema,
  supportTicketMessageSchema,
  updateSupportTicketPrioritySchema,
  updateSupportTicketStatusSchema,
} from '../validators/support-ticket.validators';

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
  validationMiddleware({ query: supportTicketListQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        page, limit, status, type, priority, assignedAgentId, unassigned, active,
        search, bookingId, projectId, businessAccountId, userId, relatedCustomerId, relatedProviderId,
      } =
        req.query as unknown as {
          page: number;
          limit: number;
          status?: string;
          type?: string;
          priority?: string;
          assignedAgentId?: string;
          unassigned?: boolean;
          active?: boolean;
          search?: string;
          bookingId?: string;
          projectId?: string;
          businessAccountId?: string;
          userId?: string;
          relatedCustomerId?: string;
          relatedProviderId?: string;
        };
      const result = await supportTicketService.listTickets({
        page,
        limit,
        status,
        type,
        priority,
        assignedAgentId,
        unassigned,
        active,
        search,
        bookingId,
        projectId,
        businessAccountId,
        userId,
        relatedCustomerId,
        relatedProviderId,
      });
      const tickets = result.tickets.map((ticket) =>
        supportTicketService.maskTicketForRole(ticket, req.user!.role),
      );
      res.json({ success: true, data: tickets, meta: { total: result.total, page, limit } });
    } catch (error) {
      next(error);
    }
  },
);

// Named assignment choices for the admin support workspace. This literal
// route must stay before '/:id' so "agents" cannot be captured as a ticket ID.
router.get(
  '/agents',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const agents = await supportTicketService.listAssignableAgents();
      res.json({ success: true, data: agents });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/summary',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await supportTicketService.getSupportQueueSummary();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// Server-confirmed case-owner identity for the agent-created case form. This
// deliberately excludes phone and email and must remain before the '/:id'
// ticket route so the literal account-context segment cannot be captured.
router.get(
  '/account-context/:id',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  validationMiddleware({ params: supportAccountIdParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await supportTicketService.getSupportAccountContext(
        getParamId(req),
        req.user!.role,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// Create a case on behalf of a customer or provider after the support agent
// has opened that account in the admin workspace. Keeping this as an explicit
// admin route preserves the acting-admin audit trail and prevents a caller
// from changing the owner on the normal self-service endpoint.
router.post(
  '/admin',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  validationMiddleware(adminCreateSupportTicketSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const {
        userId, type, priority, subject, description, bookingId, projectId, businessAccountId,
      } = req.body;
      const ticket = await supportTicketService.createTicket({
        userId,
        type,
        priority,
        subject,
        description,
        bookingId,
        projectId,
        businessAccountId,
        createdByAdminId: req.user!.userId,
      });
      res.status(201).json({ success: true, data: ticket });
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
  validationMiddleware({ query: mySupportTicketListQuerySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { page, limit, status } = req.query as unknown as {
        page: number;
        limit: number;
        status?: string;
      };
      const result = await supportTicketService.listMyTickets({
        userId: req.user!.userId,
        page,
        limit,
        status,
      });
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
  validationMiddleware({ params: supportTicketIdParamsSchema }),
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
  '/:id/history',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  validationMiddleware({ params: supportTicketIdParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await supportTicketService.getTicketStatusHistory(getParamId(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  validationMiddleware({ params: supportTicketIdParamsSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const ticket = await supportTicketService.getTicketById(id);
      if (!ticket) throw createAppError('Ticket not found.', 404);
      const messages = await supportTicketService.getTicketMessages(id);
      const maskedTicket = supportTicketService.maskTicketForRole(ticket, req.user!.role);
      res.json({ success: true, data: { ...maskedTicket, messages } });
    } catch (error) {
      next(error);
    }
  },
);

// Create ticket (any authenticated user)
router.post(
  '/',
  authMiddleware,
  validationMiddleware(createSupportTicketSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { type, priority, subject, description, bookingId, projectId, businessAccountId } = req.body;
      const ticket = await supportTicketService.createTicket({
        userId: req.user!.userId,
        type,
        priority,
        subject,
        description,
        bookingId,
        projectId,
        businessAccountId,
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
  validationMiddleware({ params: supportTicketIdParamsSchema, body: supportTicketMessageSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { message, isInternalNote } = req.body;

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

      const senderRole = role === 'provider_staff' ? 'provider' : role;
      const msg = await supportTicketService.addMessage({
        ticketId: getParamId(req),
        senderId: req.user!.userId,
        senderRole,
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
  validationMiddleware({ params: supportTicketIdParamsSchema, body: updateSupportTicketStatusSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { status, resolutionNotes, workflowNote } = req.body;
      const ticket = await supportTicketService.updateTicketStatus(
        getParamId(req),
        status,
        resolutionNotes,
        { adminId: req.user!.userId, workflowNote },
      );
      res.json({ success: true, data: ticket });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id/priority',
  authMiddleware,
  rbacMiddleware('admin', 'super_admin'),
  validationMiddleware({ params: supportTicketIdParamsSchema, body: updateSupportTicketPrioritySchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { priority, workflowNote } = req.body;
      const ticket = await supportTicketService.updateTicketPriority(
        getParamId(req),
        priority,
        { adminId: req.user!.userId, workflowNote },
      );
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
  validationMiddleware({ params: supportTicketIdParamsSchema, body: assignSupportTicketSchema }),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { agentId } = req.body;
      const ticket = await supportTicketService.assignTicket(
        getParamId(req),
        agentId,
        req.user!.userId,
      );
      res.json({ success: true, data: ticket });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
