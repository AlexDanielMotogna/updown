import { Router, type Router as RouterType } from 'express';
import { adminAuth, requireSuper } from '../../middleware/admin-auth';
import { adminHealthRouter } from './health';
import { adminPoolsRouter } from './pools';
import { adminFinanceRouter } from './finance';
import { adminUsersRouter } from './users';
import { adminEventsRouter } from './events';
import { adminActionsRouter } from './actions';
import { adminTournamentsRouter } from './tournaments';
import { adminCategoriesRouter } from './categories';
import { adminPayoutsRouter, adminWalletRouter } from './payouts';
import { adminSportsRouter } from './sports-explorer';
import { adminPolymarketRouter } from './polymarket-explorer';
import { adminResolutionMetricsRouter } from './resolution-metrics';
import { adminReferralsRouter } from './referrals';
import { adminResolutionInspectorRouter } from './resolution-inspector';
import { adminResolutionSuggestionsRouter } from './resolution-suggestions';
import { adminLiquidityBotRouter } from './liquidity-bot';
import { adminPoolCreationRouter } from './pool-creation';
import { adminBuilderRevenueRouter } from './builder-revenue';
import { adminXPosterRouter } from './x-poster';
import { adminWorldCupRouter } from './worldcup';
import { adminMarketingRouter } from './marketing';
import { adminEconomyRouter } from './economy';

export const adminRouter: RouterType = Router();

// All admin routes require API key auth
adminRouter.use(adminAuth);

// Verify endpoint — returns the caller's role so the UI can gate tabs.
adminRouter.get('/verify', (req, res) => {
  res.json({ success: true, message: 'Authenticated', role: req.adminRole ?? 'super' });
});

// Marketing asset browser: available to BOTH super admins and the marketing role.
adminRouter.use('/marketing', adminMarketingRouter);

// Everything below this line requires the super-admin key.
adminRouter.use(requireSuper);

adminRouter.use('/health', adminHealthRouter);
adminRouter.use('/pools', adminPoolsRouter);
adminRouter.use('/finance', adminFinanceRouter);
adminRouter.use('/users', adminUsersRouter);
adminRouter.use('/events', adminEventsRouter);
adminRouter.use('/actions', adminActionsRouter);
adminRouter.use('/tournaments', adminTournamentsRouter);
adminRouter.use('/categories', adminCategoriesRouter);
adminRouter.use('/payouts', adminPayoutsRouter);
adminRouter.use('/wallet', adminWalletRouter);
adminRouter.use('/sports', adminSportsRouter);
adminRouter.use('/polymarket', adminPolymarketRouter);
adminRouter.use('/resolution-metrics', adminResolutionMetricsRouter);
adminRouter.use('/referrals', adminReferralsRouter);
adminRouter.use('/resolution-inspector', adminResolutionInspectorRouter);
adminRouter.use('/resolution-suggestions', adminResolutionSuggestionsRouter);
adminRouter.use('/liquidity-bot', adminLiquidityBotRouter);
adminRouter.use('/pool-creation', adminPoolCreationRouter);
adminRouter.use('/builder-revenue', adminBuilderRevenueRouter);
adminRouter.use('/x-poster', adminXPosterRouter);
adminRouter.use('/worldcup', adminWorldCupRouter);
adminRouter.use('/economy', adminEconomyRouter);
