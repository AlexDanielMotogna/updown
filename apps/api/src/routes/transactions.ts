import { Router, type Router as RouterType } from 'express';
import { depositsRouter } from './deposits';
import { claimsRouter } from './claims';
import { faucetRouter } from './faucet';

export const transactionsRouter: RouterType = Router();

// Mount deposit, claim, and faucet sub-routers
transactionsRouter.use(depositsRouter);
transactionsRouter.use(claimsRouter);
transactionsRouter.use(faucetRouter);
