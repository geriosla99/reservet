import { Router } from 'express';
import { pool } from '../../shared/database.js';
import { createTablesRepository } from './tables.repository.js';
import { createTablesService } from './tables.service.js';

export function createTablesRouter(service = createTablesService(createTablesRepository(pool))) {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json(await service.list());
  });

  router.post('/', async (req, res) => {
    res.status(201).json(await service.create(req.body));
  });

  router.patch('/:id/status', async (req, res) => {
    res.json(await service.updateStatus(req.params.id, req.body));
  });

  return router;
}
