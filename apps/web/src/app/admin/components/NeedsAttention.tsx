'use client';

import { SubTabs } from './SubTabs';
import { ZombiePools } from './ZombiePools';
import { StuckPmPools } from './StuckPmPools';
import { StuckKnockoutPools } from './StuckKnockoutPools';

/**
 * Unified "Needs Attention" section (Phase 2 of PLAN-ADMIN-RESTRUCTURE). Folds
 * the three previously-scattered stuck-pool queues — zombie sports pools, stuck
 * Polymarket pools, and stuck knockout pools — into one place under sub-tabs.
 * (A later pass can collapse them into a single source-parametrized table.)
 */
export function NeedsAttention() {
  return (
    <SubTabs
      tabs={[
        { id: 'zombies', label: 'Zombie / stuck', render: () => <ZombiePools /> },
        { id: 'predictions', label: 'Predictions (PM)', render: () => <StuckPmPools /> },
        { id: 'knockouts', label: 'Knockouts', render: () => <StuckKnockoutPools /> },
      ]}
    />
  );
}
