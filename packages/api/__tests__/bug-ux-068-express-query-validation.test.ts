import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validationMiddleware } from '../src/middleware/validation.middleware';

it('Bug UX-068 — parsed query values reach Express 5 route handlers without assigning to its getter', async () => {
  const app = express();
  app.get(
    '/cases',
    validationMiddleware({ query: z.object({ page: z.coerce.number().int().min(1).default(1) }) }),
    (req, res) => res.json({ page: req.query.page, type: typeof req.query.page }),
  );

  const response = await request(app).get('/cases?page=3');

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ page: 3, type: 'number' });
});
