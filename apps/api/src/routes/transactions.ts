import { Router, type Router as RouterType } from 'express';
import { depositsRouter } from './deposits';
import { claimsRouter } from './claims';

export const transactionsRouter: RouterType = Router();

// Mount deposit and claim sub-routers
transactionsRouter.use(depositsRouter);
transactionsRouter.use(claimsRouter);
