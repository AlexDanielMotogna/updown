'use client';

import { SubTabs } from './SubTabs';
import { FinancialOverview } from './FinancialOverview';
import { PayoutManagement } from './PayoutManagement';

/**
 * Unified "Finance" section (Phase 2 of PLAN-ADMIN-RESTRUCTURE). Money/treasury
 * lived split across two top-level tabs (Finance + Payouts); they're the same
 * domain, so they now share one section with sub-tabs: Overview (volume/fees)
 * and Payouts (queue/failed/wallet).
 */
export function FinanceSection() {
  return (
    <SubTabs
      tabs={[
        { id: 'overview', label: 'Overview', render: () => <FinancialOverview /> },
        { id: 'payouts', label: 'Payouts', render: () => <PayoutManagement /> },
      ]}
    />
  );
}
