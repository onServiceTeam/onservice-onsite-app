import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validationMiddleware } from '../middleware/validation.middleware';
import { createAddressSchema, updateAddressSchema } from '../validators/address.validators';
import * as addressService from '../services/address.service';
import { createAppError } from '../middleware/error.middleware';

const router = Router();

function getParamId(req: AuthenticatedRequest): string {
  const id = req.params.id;
  if (typeof id !== 'string' || !id) throw createAppError('Address ID is required.', 400);
  return id;
}

router.get(
  '/',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const addresses = await addressService.getUserAddresses(req.user!.userId);
      res.json({ success: true, data: addresses.map(addressService.formatAddress) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/',
  authMiddleware,
  validationMiddleware(createAddressSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const address = await addressService.createAddress({
        userId: req.user!.userId,
        ...req.body,
      });
      res.status(201).json({ success: true, data: addressService.formatAddress(address) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const address = await addressService.getAddressById(id, req.user!.userId);
      res.json({ success: true, data: addressService.formatAddress(address) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id',
  authMiddleware,
  validationMiddleware(updateAddressSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      const address = await addressService.updateAddress(id, req.user!.userId, req.body);
      res.json({ success: true, data: addressService.formatAddress(address) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id',
  authMiddleware,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = getParamId(req);
      await addressService.deleteAddress(id, req.user!.userId);
      res.json({ success: true, data: { message: 'Address deleted.' } });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
