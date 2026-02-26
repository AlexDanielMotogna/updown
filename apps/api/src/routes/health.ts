import { Router, type Router as RouterType } from 'express';

export const healthRouter: RouterType = Router();

healthRouter.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
  });
});
