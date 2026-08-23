/**
 * Pool Scheduler Configuration
 * Defines which assets and intervals to create pools for
 */

export interface PoolTemplate {
  asset: string;
  intervalKey: string; // Interval identifier: '3m', '5m', '15m', '1h'
  interval: number; // Duration in seconds
  cronExpression: string; // When to create new pools
  joinWindowSeconds: number; // How long users can deposit before lock
  lockBufferSeconds: number; // Buffer between lock and start
}

export interface SchedulerConfig {
  enabled: boolean;
  templates: PoolTemplate[];
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
    // Default: 4 intervals x 3 assets = 12 templates
    const ASSETS = ['BTC', 'ETH', 'SOL'];
    // joinWindowSeconds = interval so the JOINING countdown matches the pool duration
    // lockBufferSeconds = 0 so lock and start happen simultaneously
    // This gives clean transitions: JOINING(3m) → ACTIVE(3m) → RESOLVED
    const INTERVAL_CONFIGS: Omit<PoolTemplate, 'asset'>[] = [
      {
        intervalKey: '3m',
        interval: 180,
        cronExpression: '*/3 * * * *',
        joinWindowSeconds: 180,
        lockBufferSeconds: 0,
      },
      {
        intervalKey: '5m',
        interval: 300,
        cronExpression: '*/5 * * * *',
        joinWindowSeconds: 300,
        lockBufferSeconds: 0,
      },
      {
        intervalKey: '15m',
        interval: 900,
        cronExpression: '*/15 * * * *',
        joinWindowSeconds: 900,
        lockBufferSeconds: 0,
      },
      {
        intervalKey: '1h',
        interval: 3600,
        cronExpression: '0 * * * *',
        joinWindowSeconds: 3600,
        lockBufferSeconds: 0,
      },
    ];

    templates = ASSETS.flatMap((asset) =>
      INTERVAL_CONFIGS.map((cfg) => ({ asset, ...cfg }))
    );
  }

  // NOTE: there is no price-source knob here. The provider is chosen in
  // packages/market-data/src/factory.ts from MARKET_DATA_PROVIDER. A `priceSource`
  // field used to be read from a PRICE_SOURCE env var that nothing consumed, so
  // the config advertised a switch that did nothing while production ran a
  // different provider than the value suggested.
  return {
    enabled,
    templates,
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
