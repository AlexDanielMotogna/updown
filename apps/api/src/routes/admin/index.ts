import { Router, type Router as RouterType } from 'express';
import { adminAuth } from '../../middleware/admin-auth';
import { adminHealthRouter } from './health';
import { adminPoolsRouter } from './pools';
import { adminFinanceRouter } from './finance';
import { adminUsersRouter } from './users';
import { adminEventsRouter } from './events';
import { adminActionsRouter } from './actions';
import { adminTournamentsRouter } from './tournaments';
import { adminCategoriesRouter } from './categories';

export const adminRouter: RouterType = Router();

// All admin routes require API key auth
adminRouter.use(adminAuth);

// Verify endpoint (just returns 200 if auth passes)
adminRouter.get('/verify', (_req, res) => {
  res.json({ success: true, message: 'Authenticated' });
});

adminRouter.use('/health', adminHealthRouter);
adminRouter.use('/pools', adminPoolsRouter);
adminRouter.use('/finance', adminFinanceRouter);
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/events', adminEventsRouter);
adminRouter.use('/actions', adminActionsRouter);
adminRouter.use('/tournaments', adminTournamentsRouter);
adminRouter.use('/categories', adminCategoriesRouter);
