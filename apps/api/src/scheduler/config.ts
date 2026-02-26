/**
 * Pool Scheduler Configuration
 * Defines which assets and intervals to create pools for
 */

export interface PoolTemplate {
  asset: string;
  interval: number; // Duration in seconds
  cronExpression: string; // When to create new pools
  joinWindowSeconds: number; // How long users can deposit before lock
}

export interface SchedulerConfig {
  enabled: boolean;
  templates: PoolTemplate[];
  priceSource: string;
}

/**
 * Default scheduler configuration
 * Can be overridden via environment variables
 */
export function getSchedulerConfig(): SchedulerConfig {
  const enabled = process.env.SCHEDULER_ENABLED !== 'false';

  // Parse templates from environment or use defaults
  const templatesJson = process.env.POOL_TEMPLATES;
  let templates: PoolTemplate[];

  if (templatesJson) {
    templates = JSON.parse(templatesJson);
  } else {
    // Default: hourly pools for BTC and ETH
    templates = [
      {
        asset: 'BTC',
        interval: 3600, // 1 hour
        cronExpression: '0 * * * *', // Every hour at :00
        joinWindowSeconds: 3000, // 50 minutes to join (10 min buffer before lock)
      },
      {
        asset: 'ETH',
        interval: 3600, // 1 hour
        cronExpression: '0 * * * *', // Every hour at :00
        joinWindowSeconds: 3000, // 50 minutes to join
      },
    ];
  }

  return {
    enabled,
    templates,
    priceSource: process.env.PRICE_SOURCE || 'pacifica',
  };
}

/**
 * Get allowlist of supported assets
 */
export function getSupportedAssets(): string[] {
  const config = getSchedulerConfig();
  return [...new Set(config.templates.map(t => t.asset))];
}

/**
 * Validate asset is supported
 */
export function isAssetSupported(asset: string): boolean {
  return getSupportedAssets().includes(asset);
}
