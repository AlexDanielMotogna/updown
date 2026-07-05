import { API_BASE_URL } from './constants';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Pool {
  id: string;
  poolId: string;
  asset: string;
  interval: string;
  durationSeconds: number;
  // CANCELLED added 2026-06-03 - PM pools that couldn't be resolved
  // (Polymarket retired the market AND neither Gamma nor CTF could give
  // an outcome) end up here. winner stays null; bets refunded on-chain
  // or 0-bet → account closed. The web surface routes this through
  // CancelledCard, never DeterminingCard.
  status: 'UPCOMING' | 'JOINING' | 'ACTIVE' | 'RESOLVED' | 'CLAIMABLE' | 'CANCELLED';
  startTime: string;
  endTime: string;
  lockTime: string;
  strikePrice: string | null;
  finalPrice: string | null;
  totalUp: string;
  totalDown: string;
  totalDraw: string;
  totalPool: string;
  winner: 'UP' | 'DOWN' | 'DRAW' | null;
  betCount: number;
  upCount: number;
  downCount: number;
  drawCount: number;
  numSides: number;
  poolType: 'CRYPTO' | 'SPORTS' | 'POLYMARKET';
  matchId?: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  homeTeamCrest?: string | null;
  awayTeamCrest?: string | null;
  league?: string | null;
  matchAnalysis?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  marketOdds?: number | null;
  clobTokenIds?: string | null;
  tags?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PoolDetail extends Pool {
  odds: {
    up: string;
    down: string;
  };
  priceSnapshots: Array<{
    id: string;
    type: string;
    price: string;
    timestamp: string;
    source: string;
  }>;
}

export interface Bet {
  id: string;
  poolId: string;
  walletAddress: string;
  side: 'UP' | 'DOWN' | 'DRAW';
  amount: string;
  /** Time-weight of this bet (mirror of on-chain UserBet.weight). Null on
   *  legacy bets. Used with the pool's weighted* totals to project the
   *  time-weighted payout. */
  weight?: string | null;
  depositTx: string | null;
  claimed: boolean;
  claimTx: string | null;
  payoutAmount: string | null;
  isWinner: boolean | null;
  // Auto-payout state - populated by the scheduler when AUTO_PAYOUT is on
  // for this pool's category. Stays at defaults on manual-claim bets.
  payoutFailed?: boolean;
  payoutAttempts?: number;
  lastAttemptedAt?: string | null;
  createdAt: string;
  pool: {
    id: string;
    poolId: string;
    asset: string;
    interval: string;
    status: string;
    startTime: string;
    endTime: string;
    strikePrice: string | null;
    finalPrice: string | null;
    winner: 'UP' | 'DOWN' | null;
    poolType?: string;
    league?: string | null;
    homeTeam?: string | null;
    awayTeam?: string | null;
    homeTeamCrest?: string | null;
    awayTeamCrest?: string | null;
    // Pool totals for parimutuel math - used by /profile to render the
    // potential payout on active bets at the current pool odds.
    totalUp?: string;
    totalDown?: string;
    totalDraw?: string;
    // Per-side time-weight sums - used to project a weighted potential
    // payout for active positions (matches the on-chain claim formula).
    weightedUp?: string | null;
    weightedDown?: string | null;
    weightedDraw?: string | null;
    betCount?: number;
  };
}

export interface ClaimableBets {
  bets: Bet[];
  summary: {
    count: number;
    totalClaimable: string;
  };
}

export interface DepositAccounts {
  accounts: {
    pool: string;
    userBet: string;
    vault: string;
    userTokenAccount: string;
    user: string;
    tokenProgram: string;
    systemProgram: string;
  };
  args: {
    side: { up: object } | { down: object };
    amount: string;
  };
  programId: string;
  pool: {
    id: string;
    poolId: string;
    asset: string;
    lockTime: string;
  };
}

export interface ClaimResponse {
  transaction: string; // base64 partially-signed tx
  bet: {
    id: string;
    side: string;
    amount: string;
    grossPayout: string;
    fee: string;
    feeBps: number;
    expectedPayout: string;
  };
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data = await response.json();
  return data;
}

// Pool endpoints
export async function fetchPools(params?: {
  asset?: string;
  interval?: string;
  status?: string;
  type?: string;
  league?: string;
  tag?: string;
  page?: number;
  limit?: number;
}): Promise<ApiResponse<Pool[]>> {
  const searchParams = new URLSearchParams();
  if (params?.asset) searchParams.set('asset', params.asset);
  if (params?.interval) searchParams.set('interval', params.interval);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.type) searchParams.set('type', params.type);
  if (params?.league) searchParams.set('league', params.league);
  if (params?.tag) searchParams.set('tag', params.tag);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  const query = searchParams.toString();
  return fetchApi<Pool[]>(`/api/pools${query ? `?${query}` : ''}`);
}

export async function fetchPool(id: string): Promise<ApiResponse<PoolDetail>> {
  return fetchApi<PoolDetail>(`/api/pools/${id}`);
}

export interface PoolSearchResult {
  id: string;
  status: string;
  poolType: string;
  league: string | null;
  asset: string;
  interval: string;
  homeTeam: string | null;
  awayTeam: string | null;
  homeTeamCrest: string | null;
  startTime: string;
}

export async function searchPools(q: string): Promise<ApiResponse<PoolSearchResult[]>> {
  return fetchApi<PoolSearchResult[]>(`/api/pools/search?q=${encodeURIComponent(q)}`);
}

export async function fetchTrendingPools(): Promise<ApiResponse<Pool[]>> {
  return fetchApi<Pool[]>('/api/pools/trending');
}

// Bet endpoints
export async function fetchBets(
  wallet: string,
  params?: { page?: number; limit?: number }
): Promise<ApiResponse<Bet[]>> {
  const searchParams = new URLSearchParams({ wallet });
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  return fetchApi<Bet[]>(`/api/bets?${searchParams.toString()}`);
}

export async function fetchClaimableBets(
  wallet: string
): Promise<ApiResponse<ClaimableBets>> {
  return fetchApi<ClaimableBets>(`/api/bets/claimable?wallet=${wallet}`);
}

// Notification endpoints
export interface DbNotification {
  id: string;
  walletAddress: string;
  type: string;
  title: string;
  message: string;
  severity: string;
  poolId: string | null;
  poolType: string | null;
  read: boolean;
  createdAt: string;
}

export async function fetchNotifications(wallet: string): Promise<ApiResponse<DbNotification[]>> {
  return fetchApi<DbNotification[]>(`/api/notifications?wallet=${wallet}`);
}

export async function markNotificationRead(id: string): Promise<ApiResponse<void>> {
  return fetchApi<void>(`/api/notifications/${id}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead(wallet: string): Promise<ApiResponse<void>> {
  return fetchApi<void>('/api/notifications/read-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wallet }),
  });
}

// Transaction endpoints
export async function prepareDeposit(params: {
  poolId: string;
  walletAddress: string;
  side: 'UP' | 'DOWN' | 'DRAW';
  amount: number;
}): Promise<ApiResponse<DepositAccounts>> {
  return fetchApi<DepositAccounts>('/api/transactions/deposit', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function prepareGaslessDeposit(params: {
  poolId: string;
  walletAddress: string;
  side: 'UP' | 'DOWN' | 'DRAW';
  amount: number;
}): Promise<ApiResponse<{ tx: string; poolId: string; side: string; asset: string; lockTime: string }>> {
  return fetchApi('/api/transactions/prepare-gasless-deposit', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function confirmDeposit(params: {
  poolId: string;
  walletAddress: string;
  txSignature: string;
  side: 'UP' | 'DOWN' | 'DRAW';
}): Promise<ApiResponse<{ betId: string; status: string }>> {
  return fetchApi('/api/transactions/confirm-deposit', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function prepareClaim(params: {
  poolId: string;
  walletAddress: string;
}): Promise<ApiResponse<ClaimResponse>> {
  return fetchApi<ClaimResponse>('/api/transactions/claim', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function confirmClaim(params: {
  betId: string;
  txSignature: string;
}): Promise<ApiResponse<{ betId: string; payoutAmount: string; status: string }>> {
  return fetchApi('/api/transactions/confirm-claim', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ─── User / Rewards endpoints ────────────────────────────────────────────────

// ─── Referral types ──────────────────────────────────────────────────────────

export interface ReferralStats {
  referralCode: string;
  totalReferrals: number;
  totalEarned: string;
  unpaidBalance: string;
  referrals: Array<{
    wallet: string;
    displayName: string | null;
    avatarUrl: string | null;
    joinedAt: string;
    earned: string;
  }>;
}

export interface ReferralEarningEntry {
  id: string;
  referredWallet: string;
  poolId: string;
  feeAmount: string;
  commissionAmount: string;
  paid: boolean;
  paidTx: string | null;
  createdAt: string;
}

export interface ReferralPayoutEntry {
  id: string;
  amount: string;
  txSignature: string | null;
  status: string;
  createdAt: string;
}

export interface UserProfile {
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  referralCode: string | null;
  level: number;
  title: string;
  totalXp: string;
  xpForCurrentLevel: string;
  xpForNextLevel: string;
  xpToNextLevel: string;
  xpProgress: number;
  coinsBalance: string;
  coinsLifetime: string;
  coinsRedeemed: string;
  /** Streak-saver inventory (consumable that protects the streak on a loss). */
  streakSavers: number;
  /** Currently-equipped cosmetics (at most one per kind). */
  equippedCosmetics: EquippedCosmetic[];
  feeBps: number;
  feePercent: string;
  coinMultiplier: number;
  nextLevel: {
    level: number;
    title: string;
    feePercent: string;
    coinMultiplier: number;
  } | null;
  rank: number | null;
  totalUsers: number | null;
  /** Server-computed level unlock milestones. Each entry comes pre-flagged
   *  with whether the user has already reached the level - the UI just
   *  picks the right colour/icon and renders the strip. */
  milestones: Array<{
    level: number;
    title: string;
    xpRequired: string;
    feePercent: string;
    coinMultiplier: number;
    unlocked: boolean;
  }>;
  stats: {
    totalBets: number;
    totalWins: number;
    /** Number of refunded bets - excluded from winRate denominator. */
    totalRefunded?: number;
    winRate: string;
    totalWagered: string;
    totalWon: string;
    /** Lifetime stake minus refunds - what the Volume Staked tile shows. */
    volumeStaked?: string;
    /** Realized P&L from settled non-refund bets. Active stakes don't move it. */
    netPnl?: string;
    /** Bets that reached a real resolution (drives the reward progress). */
    settledBets?: number;
    currentStreak: number;
    bestStreak: number;
  };
  /** Testing-campaign reward progress; null when the campaign is off. */
  testingReward?: {
    type: string;
    threshold: number;
    amount: number;
    progress: number;
    unlocked: boolean;
  } | null;
  createdAt: string;
}

export interface RewardEntry {
  id: string;
  type: 'XP' | 'COINS';
  reason: string;
  amount: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CategoryStatEntry {
  category: string;
  bets: number;
  wins: number;
  winRate: string;
  wagered: string;
  won: string;
}

export interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  /** Self-edited identity from the profile. Both null until the user
   *  customises them; the leaderboard then prefers them over the wallet
   *  truncation / gradient avatar fallback. */
  displayName: string | null;
  avatarUrl: string | null;
  level: number;
  title: string;
  totalXp: string;
  coinsLifetime: string;
  totalBets: number;
  totalWins: number;
  bestStreak: number;
  // Kalshi-style boards (micro-USDC strings).
  totalWagered?: string;
  totalWon?: string;
  profit?: string;
}

export type LeaderboardSort = 'xp' | 'coins' | 'level' | 'profit' | 'volume' | 'predictions';

export interface ReferralLeaderboardEntry {
  rank: number;
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  validReferrals: number;
  totalReferrals: number;
  prize: number;
}
export type ReferralLeaderboardResponse = ApiResponse<ReferralLeaderboardEntry[]> & { self?: ReferralLeaderboardEntry | null };

export async function fetchReferralLeaderboard(wallet?: string): Promise<ReferralLeaderboardResponse> {
  const q = wallet ? `?wallet=${encodeURIComponent(wallet)}` : '';
  return fetchApi<ReferralLeaderboardEntry[]>(`/api/referrals/leaderboard${q}`) as Promise<ReferralLeaderboardResponse>;
}

export interface MilestoneTier {
  key: string;
  label: string;
  targetUsers: number;
  rewardPool: number; // display UP
  status: 'active' | 'completed';
  completedAt: string | null;
  icon: string | null;
}
export interface MilestoneContributor {
  rank: number;
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  settledBets: number;
}
export interface MilestoneState {
  totalUsers: number;
  activeThreshold: number;
  milestones: MilestoneTier[];
  contributors: MilestoneContributor[];
  self: { settledBets: number; qualified: boolean } | null;
}
export async function fetchMilestones(wallet?: string): Promise<ApiResponse<MilestoneState>> {
  const q = wallet ? `?wallet=${encodeURIComponent(wallet)}` : '';
  return fetchApi<MilestoneState>(`/api/milestones${q}`);
}

export interface LineupPlayer {
  id: string | null;
  name: string;
  number: string | null;
  position: string | null;
  positionShort: string | null;
  cutout: string | null;
  substitute: boolean;
}
export interface SideLineup {
  team: string | null;
  formation: string | null;
  starters: LineupPlayer[];
  subs: LineupPlayer[];
}
export interface EventLineup {
  hasData: boolean;
  home: SideLineup | null;
  away: SideLineup | null;
}
export async function fetchLineup(matchId: string): Promise<ApiResponse<EventLineup>> {
  return fetchApi<EventLineup>(`/api/lineups/${encodeURIComponent(matchId)}`);
}

export interface LiveMeta { activeCount: number; wageredToday: string; }
export type LivePoolsResponse = ApiResponse<Pool[]> & { meta?: LiveMeta };
export async function fetchLivePools(params: { sort: string; category: string; limit?: number }): Promise<LivePoolsResponse> {
  const q = new URLSearchParams({ sort: params.sort, category: params.category, limit: String(params.limit ?? 40) });
  return fetchApi<Pool[]>(`/api/pools/live?${q.toString()}`) as Promise<LivePoolsResponse>;
}

export async function registerUser(
  walletAddress: string,
): Promise<ApiResponse<UserProfile>> {
  return fetchApi('/api/users/register', {
    method: 'POST',
    body: JSON.stringify({ walletAddress }),
  });
}

export async function fetchUserProfile(
  wallet: string,
): Promise<ApiResponse<UserProfile>> {
  return fetchApi<UserProfile>(`/api/users/profile?wallet=${wallet}`);
}

export interface UpdateUserProfileBody {
  walletAddress: string;
  /** Pass `null` to clear, omit to leave unchanged. */
  displayName?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
}

export async function updateUserProfile(
  body: UpdateUserProfileBody,
): Promise<ApiResponse<UserProfile>> {
  return fetchApi<UserProfile>('/api/users/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export interface StreakSaverResult {
  streakSavers: number;
  coinsBalance: string;
  spent: string;
}

export type CosmeticKind = 'BADGE' | 'FRAME' | 'TITLE' | 'NAME_COLOR';

export interface CosmeticEntry {
  id: string;
  sku: string;
  kind: CosmeticKind;
  name: string;
  price: string; // stored units (display = /100)
  value: string; // hex color / icon / title text, interpreted per kind
  owned: boolean;
  equipped: boolean;
}

export interface EquippedCosmetic {
  sku: string;
  kind: CosmeticKind;
  name: string;
  value: string;
}

/** Cosmetics store: catalog + this wallet's owned/equipped flags. */
export async function fetchCosmetics(wallet: string): Promise<ApiResponse<CosmeticEntry[]>> {
  return fetchApi<CosmeticEntry[]>(`/api/users/cosmetics?wallet=${wallet}`);
}

/** Buy a cosmetic (burns UP Coins). */
export async function buyCosmetic(
  body: { walletAddress: string; sku: string; idempotencyKey?: string },
): Promise<ApiResponse<{ cosmeticId: string; coinsBalance: string }>> {
  return fetchApi('/api/users/cosmetics', { method: 'POST', body: JSON.stringify(body) });
}

/** Equip / unequip an owned cosmetic (one active per kind). */
export async function equipCosmetic(
  body: { walletAddress: string; cosmeticId: string; equipped: boolean },
): Promise<ApiResponse<{ equipped: boolean }>> {
  return fetchApi('/api/users/cosmetics/equip', { method: 'PATCH', body: JSON.stringify(body) });
}

export type BoostKind = 'XP' | 'COINS';

export interface BoostProductEntry {
  sku: string;
  kind: BoostKind;
  multiplierBps: number;
  durationHours: number;
  price: string; // stored units
  label: string;
}

export interface ActiveBoostEntry {
  kind: BoostKind;
  sku: string;
  multiplierBps: number;
  expiresAt: string;
}

export interface BoostStateResponse {
  products: BoostProductEntry[];
  active: ActiveBoostEntry[];
}

/** Boost store: catalog + this wallet's currently-active boosts. */
export async function fetchBoosts(wallet: string): Promise<ApiResponse<BoostStateResponse>> {
  return fetchApi<BoostStateResponse>(`/api/users/boosts?wallet=${wallet}`);
}

/** Buy a time-limited XP/COINS boost (burns UP Coins). */
export async function buyBoost(
  body: { walletAddress: string; sku: string; idempotencyKey?: string },
): Promise<ApiResponse<{ kind: BoostKind; expiresAt: string; coinsBalance: string }>> {
  return fetchApi('/api/users/boosts', { method: 'POST', body: JSON.stringify(body) });
}

/** Buy streak-saver consumables with UP Coins. `walletAddress` in the body is the
 *  auth signal (same convention as the other /api/users routes). */
export async function buyStreakSaver(
  body: { walletAddress: string; quantity?: number; idempotencyKey?: string },
): Promise<ApiResponse<StreakSaverResult>> {
  return fetchApi<StreakSaverResult>('/api/users/streak-saver', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchRewardHistory(
  wallet: string,
  params?: { type?: 'XP' | 'COINS'; page?: number; limit?: number },
): Promise<ApiResponse<RewardEntry[]>> {
  const searchParams = new URLSearchParams({ wallet });
  if (params?.type) searchParams.set('type', params.type);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  return fetchApi<RewardEntry[]>(`/api/users/rewards?${searchParams.toString()}`);
}

export async function fetchUserCategoryStats(
  wallet: string,
): Promise<ApiResponse<CategoryStatEntry[]>> {
  return fetchApi<CategoryStatEntry[]>(`/api/users/category-stats?wallet=${wallet}`);
}

// ─── Trading (HyperLiquid fills persisted in trade_fills) ────────────────────

export interface TradeFillRow {
  id: string;
  coin: string;
  side: 'BUY' | 'SELL';
  dir: string | null;
  px: string;
  sz: string;
  notionalUsd: string;
  feeUsd: string;
  pnlUsd: string | null;
  time: number;
}

export interface TradingSummary {
  realizedPnlUsd: number;
  volumeUsd: number;
  feesUsd: number;
  trades: number;
  closedTrades: number;
  winRate: number;
  wins: number;
  losses: number;
  bestCoin: { coin: string; pnl: number } | null;
  worstCoin: { coin: string; pnl: number } | null;
  pnlCurve: Array<{ t: number; pnl: number }>;
}

export type TradingHistoryResponse = ApiResponse<TradeFillRow[]> & { total?: number; page?: number; limit?: number };

export async function fetchTradingSummary(wallet: string): Promise<ApiResponse<TradingSummary>> {
  return fetchApi<TradingSummary>(`/api/exchange/trades/summary?wallet=${encodeURIComponent(wallet)}`);
}

/** Live open position from HyperLiquid (clearinghouseState), shape matches exchange-core. */
export interface TradingPositionRow {
  symbol: string;
  side: 'LONG' | 'SHORT';
  amount: string;
  entryPrice: string;
  markPrice: string;
  leverage: number;
  unrealizedPnl: string;
  liquidationPrice: string;
  metadata?: { positionValue?: string | number } | null;
}

export async function fetchTradingPositions(wallet: string): Promise<ApiResponse<TradingPositionRow[]>> {
  return fetchApi<TradingPositionRow[]>(`/api/exchange/positions?wallet=${encodeURIComponent(wallet)}`);
}

export async function fetchTradingHistory(
  wallet: string,
  params?: { page?: number; limit?: number },
): Promise<TradingHistoryResponse> {
  const q = new URLSearchParams({ wallet, page: String(params?.page ?? 0), limit: String(params?.limit ?? 10) });
  return fetchApi<TradeFillRow[]>(`/api/exchange/trades?${q.toString()}`) as Promise<TradingHistoryResponse>;
}

export type LeaderboardResponse = ApiResponse<LeaderboardEntry[]> & { self?: LeaderboardEntry | null };

export async function fetchLeaderboard(
  params?: { sort?: LeaderboardSort; page?: number; limit?: number; wallet?: string },
): Promise<LeaderboardResponse> {
  const searchParams = new URLSearchParams();
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.wallet) searchParams.set('wallet', params.wallet);
  const query = searchParams.toString();
  return fetchApi<LeaderboardEntry[]>(`/api/users/leaderboard${query ? `?${query}` : ''}`) as Promise<LeaderboardResponse>;
}

// ─── Referral endpoints ──────────────────────────────────────────────────────

export async function resolveReferralCode(
  code: string,
): Promise<ApiResponse<{ referrerWallet: string }>> {
  return fetchApi<{ referrerWallet: string }>(`/api/referrals/resolve?code=${encodeURIComponent(code)}`);
}

export async function acceptReferralApi(
  walletAddress: string,
  referralCode: string,
  deviceFingerprint?: string,
): Promise<ApiResponse<{ status: string }>> {
  return fetchApi('/api/referrals/accept', {
    method: 'POST',
    body: JSON.stringify({ walletAddress, referralCode, deviceFingerprint }),
  });
}

export async function fetchReferralStats(
  wallet: string,
): Promise<ApiResponse<ReferralStats>> {
  return fetchApi<ReferralStats>(`/api/referrals/stats?wallet=${wallet}`);
}

export async function fetchReferralEarnings(
  wallet: string,
  params?: { page?: number; limit?: number },
): Promise<ApiResponse<ReferralEarningEntry[]>> {
  const searchParams = new URLSearchParams({ wallet });
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  return fetchApi<ReferralEarningEntry[]>(`/api/referrals/earnings?${searchParams.toString()}`);
}

export async function fetchReferralPayouts(
  wallet: string,
): Promise<ApiResponse<ReferralPayoutEntry[]>> {
  return fetchApi<ReferralPayoutEntry[]>(`/api/referrals/payouts?wallet=${wallet}`);
}

export async function claimReferralPayout(
  walletAddress: string,
): Promise<ApiResponse<{ payoutId: string; amount: string; status: string }>> {
  return fetchApi('/api/referrals/claim', {
    method: 'POST',
    body: JSON.stringify({ walletAddress }),
  });
}

// ─── Squad endpoints ────────────────────────────────────────────────────────

export interface Squad {
  id: string;
  name: string;
  inviteCode: string;
  creatorWallet: string;
  maxMembers: number;
  memberCount: number;
  poolCount: number;
  activePoolCount: number;
  role: 'OWNER' | 'MEMBER';
  joinedAt: string;
  createdAt: string;
}

export interface SquadDetail {
  id: string;
  name: string;
  inviteCode: string;
  creatorWallet: string;
  maxMembers: number;
  memberCount: number;
  poolCount: number;
  members: SquadMemberEntry[];
  createdAt: string;
}

export interface SquadMemberEntry {
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'OWNER' | 'MEMBER';
  joinedAt: string;
}

export interface SquadInviteInfo {
  id: string;
  name: string;
  memberCount: number;
  maxMembers: number;
}

export interface SquadChatMessage {
  id: string;
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  content: string;
  createdAt: string;
}

export interface SquadLeaderboardEntry {
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'OWNER' | 'MEMBER';
  totalBets: number;
  totalWins: number;
  totalWagered: string;
  netPnl: string;
}

export interface SquadPool extends Pool {
  squadId: string | null;
  maxBettors: number | null;
}

export async function fetchSquads(wallet: string): Promise<ApiResponse<Squad[]>> {
  return fetchApi<Squad[]>(`/api/squads?wallet=${wallet}`);
}

export async function fetchSquad(id: string, wallet: string): Promise<ApiResponse<SquadDetail>> {
  return fetchApi<SquadDetail>(`/api/squads/${id}?wallet=${wallet}`);
}

export async function createSquad(params: {
  wallet: string;
  name: string;
}): Promise<ApiResponse<Squad>> {
  return fetchApi<Squad>('/api/squads', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function joinSquad(params: {
  wallet: string;
  inviteCode: string;
}): Promise<ApiResponse<{ squadId: string; squadName: string; role: string }>> {
  return fetchApi('/api/squads/join', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function resolveSquadInvite(code: string): Promise<ApiResponse<SquadInviteInfo>> {
  return fetchApi<SquadInviteInfo>(`/api/squads/resolve?code=${code}`);
}

export async function leaveSquad(squadId: string, wallet: string): Promise<ApiResponse<{ message: string }>> {
  return fetchApi(`/api/squads/${squadId}/leave`, {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  });
}

export async function kickSquadMember(
  squadId: string,
  targetWallet: string,
  ownerWallet: string,
): Promise<ApiResponse<{ message: string }>> {
  return fetchApi(`/api/squads/${squadId}/members/${targetWallet}?wallet=${ownerWallet}`, {
    method: 'DELETE',
  });
}

export async function fetchSquadPools(squadId: string, wallet: string): Promise<ApiResponse<SquadPool[]>> {
  return fetchApi<SquadPool[]>(`/api/squads/${squadId}/pools?wallet=${wallet}`);
}

export async function createSquadPool(params: {
  squadId: string;
  wallet: string;
  asset: string;
  durationSeconds: number;
  maxBettors?: number;
}): Promise<ApiResponse<{ poolId: string }>> {
  const { squadId, ...body } = params;
  return fetchApi(`/api/squads/${squadId}/pools`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function prepareSquadPool(params: {
  squadId: string;
  wallet: string;
  asset: string;
  durationSeconds: number;
  maxBettors?: number;
}): Promise<ApiResponse<{
  transaction: string;
  poolId: string;
  strikePrice: string;
  asset: string;
  intervalKey: string;
  startTime: number;
  endTime: number;
  lockTime: number;
}>> {
  const { squadId, ...body } = params;
  return fetchApi(`/api/squads/${squadId}/pools/prepare`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function confirmSquadPool(params: {
  squadId: string;
  wallet: string;
  txSignature: string;
  poolId: string;
  asset: string;
  intervalKey: string;
  durationSeconds: number;
  startTime: number;
  endTime: number;
  lockTime: number;
  strikePrice: string;
  maxBettors?: number;
}): Promise<ApiResponse<{ poolId: string }>> {
  const { squadId, ...body } = params;
  return fetchApi(`/api/squads/${squadId}/pools/confirm`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function cancelSquadPool(squadId: string, poolId: string, wallet: string): Promise<ApiResponse<unknown>> {
  return fetchApi(`/api/squads/${squadId}/pools/${poolId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ wallet }),
  });
}

export async function fetchSquadMessages(
  squadId: string,
  wallet: string,
  params?: { before?: string; limit?: number },
): Promise<ApiResponse<SquadChatMessage[]>> {
  const searchParams = new URLSearchParams({ wallet });
  if (params?.before) searchParams.set('before', params.before);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  return fetchApi<SquadChatMessage[]>(`/api/squads/${squadId}/messages?${searchParams.toString()}`);
}

export async function sendSquadMessage(
  squadId: string,
  params: { wallet: string; content: string },
): Promise<ApiResponse<SquadChatMessage>> {
  return fetchApi<SquadChatMessage>(`/api/squads/${squadId}/messages`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function fetchSquadLeaderboard(
  squadId: string,
  wallet: string,
): Promise<ApiResponse<SquadLeaderboardEntry[]>> {
  return fetchApi<SquadLeaderboardEntry[]>(`/api/squads/${squadId}/leaderboard?wallet=${wallet}`);
}

// ─── Status endpoint ────────────────────────────────────────────────────────

export interface ServiceStatus {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency?: number;
  details?: string;
}

export interface SystemStatus {
  overall: 'operational' | 'degraded' | 'partial_outage';
  services: ServiceStatus[];
  uptime: number;
  timestamp: string;
  responseTime: number;
}

export async function fetchSystemStatus(): Promise<ApiResponse<SystemStatus>> {
  return fetchApi<SystemStatus>('/api/health/status');
}

export interface DayStatus {
  date: string;
  status: 'operational' | 'degraded' | 'down' | 'no_data';
  uptime: number;
}

export interface ServiceHistory {
  name: string;
  days: DayStatus[];
  uptimePercent: number;
}

export interface UptimeHistory {
  history: ServiceHistory[];
}

export async function fetchUptimeHistory(): Promise<ApiResponse<UptimeHistory>> {
  return fetchApi<UptimeHistory>('/api/health/history');
}

// ─── Tournaments ─────────────────────────────────────────────────────────────

export interface TournamentPrize {
  id: string;
  name: string;
  asset: string;
  prizePool: string;
  prizeClaimedTx: string | null;
  completedAt: string | null;
}

export interface TournamentClaimResult {
  prizeAmount: string;
  feeAmount: string;
  txSignature: string;
}

export interface TournamentSummary {
  id: string;
  name: string;
  asset: string;
  entryFee: string;
  size: number;
  matchDuration: number;
  predictionWindow: number;
  scheduledAt: string | null;
  status: string;
  currentRound: number;
  totalRounds: number;
  prizePool: string;
  winnerWallet: string | null;
  prizeClaimedTx: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  participantCount: number;
  participantWallets?: string[];
  _count?: { participants: number };
  tournamentType?: string;
  sport?: string | null;
  league?: string | null;
  sideLabels?: string[];
}

export interface TournamentMatchData {
  id: string;
  round: number;
  matchIndex: number;
  player1Wallet: string | null;
  player2Wallet: string | null;
  player1Prediction: string | null;
  player2Prediction: string | null;
  player1PredictedAt: string | null;
  player2PredictedAt: string | null;
  player1TotalGoals?: number | null;
  player2TotalGoals?: number | null;
  player1Score?: number | null;
  player2Score?: number | null;
  predictionDeadline: string | null;
  startTime: string | null;
  endTime: string | null;
  strikePrice: string | null;
  finalPrice: string | null;
  winnerWallet: string | null;
  status: string;
}

export interface TournamentFixture {
  id: string;
  round: number;
  fixtureIndex: number;
  footballMatchId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest?: string | null;
  awayTeamCrest?: string | null;
  kickoff?: string | null;
  resultHome?: number | null;
  resultAway?: number | null;
  resultOutcome?: string | null;
  status: string;
}

export interface TournamentBracket {
  tournament: TournamentSummary;
  participants: Array<{
    walletAddress: string;
    displayName: string | null;
    avatarUrl: string | null;
    seed: number;
    eliminatedRound: number | null;
  }>;
  rounds: Record<number, TournamentMatchData[]>;
  fixtures?: Record<number, TournamentFixture[]>;
}

export async function fetchTournaments(status?: string, type?: string): Promise<ApiResponse<TournamentSummary[]>> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (type) params.set('type', type);
  const query = params.toString() ? `?${params.toString()}` : '';
  return fetchApi<TournamentSummary[]>(`/api/tournaments${query}`);
}

export async function fetchTournamentBracket(id: string, wallet?: string): Promise<ApiResponse<TournamentBracket>> {
  const query = wallet ? `?wallet=${wallet}` : '';
  return fetchApi<TournamentBracket>(`/api/tournaments/${id}/bracket${query}`);
}

export async function submitTournamentPrediction(
  tournamentId: string,
  matchId: string,
  walletAddress: string,
  prediction: number,
): Promise<ApiResponse<{ started: boolean }>> {
  return fetchApi<{ started: boolean }>(`/api/tournaments/${tournamentId}/matches/${matchId}/predict`, {
    method: 'POST',
    body: JSON.stringify({ walletAddress, prediction }),
  });
}

export async function fetchActiveTournamentBanner(): Promise<ApiResponse<TournamentSummary | null>> {
  return fetchApi<TournamentSummary | null>('/api/tournaments/active-banner');
}

export interface TournamentRegisterAccounts {
  entryFee: string;
  asset: string;
  name: string;
  usePda?: boolean;
  accounts: {
    authorityTokenAccount?: string;
    userTokenAccount: string;
    usdcMint: string;
    tournamentPda?: string;
    vaultPda?: string;
    participantPda?: string;
    programId?: string;
  };
}

export async function prepareTournamentRegister(tournamentId: string, walletAddress: string): Promise<ApiResponse<TournamentRegisterAccounts>> {
  return fetchApi<TournamentRegisterAccounts>(`/api/tournaments/${tournamentId}/prepare-register`, {
    method: 'POST',
    body: JSON.stringify({ walletAddress }),
  });
}

export async function registerForTournament(tournamentId: string, walletAddress: string, depositTx: string): Promise<ApiResponse<unknown>> {
  return fetchApi(`/api/tournaments/${tournamentId}/register`, {
    method: 'POST',
    body: JSON.stringify({ walletAddress, depositTx }),
  });
}

export async function fetchMyTournamentPrizes(wallet: string): Promise<ApiResponse<TournamentPrize[]>> {
  return fetchApi<TournamentPrize[]>(`/api/tournaments/my-prizes?wallet=${wallet}`);
}

export async function claimTournamentPrize(tournamentId: string, walletAddress: string): Promise<ApiResponse<TournamentClaimResult>> {
  return fetchApi<TournamentClaimResult>(`/api/tournaments/${tournamentId}/claim-prize`, {
    method: 'POST',
    body: JSON.stringify({ walletAddress }),
  });
}

// ── World Cup predictions (free-to-play) ──
export type WorldCupStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED';
export type WorldCupPhase = 'REGULATION' | 'EXTRA_TIME' | 'PENALTIES';

export interface WorldCupMatch {
  matchId: string;
  round: string | null;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  kickoff: string | null;
  status: WorldCupStatus;
  homeScore: number | null;
  awayScore: number | null;
  progress: string | null;
  phase: WorldCupPhase | null;
}

export async function fetchWorldCupMatches(): Promise<ApiResponse<WorldCupMatch[]>> {
  return fetchApi<WorldCupMatch[]>('/api/worldcup/matches');
}

export interface WorldCupPredictionDto {
  matchId: string;
  homeScore: number;
  awayScore: number;
  phase: WorldCupPhase;
}
export interface WorldCupIdentity {
  provider?: string;
  xHandle?: string;
  email?: string;
  displayName?: string;
}

export async function fetchMyWorldCupPredictions(token: string): Promise<ApiResponse<WorldCupPredictionDto[]>> {
  return fetchApi<WorldCupPredictionDto[]>('/api/worldcup/predictions', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function saveWorldCupPrediction(
  token: string,
  body: { matchId: string; homeScore: number; awayScore: number; phase: WorldCupPhase; identity?: WorldCupIdentity },
): Promise<ApiResponse<WorldCupPredictionDto>> {
  return fetchApi<WorldCupPredictionDto>('/api/worldcup/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}
