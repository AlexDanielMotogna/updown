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
  status: 'UPCOMING' | 'JOINING' | 'ACTIVE' | 'RESOLVED' | 'CLAIMABLE';
  startTime: string;
  endTime: string;
  lockTime: string;
  strikePrice: string | null;
  finalPrice: string | null;
  totalUp: string;
  totalDown: string;
  totalPool: string;
  winner: 'UP' | 'DOWN' | null;
  betCount: number;
  upCount: number;
  downCount: number;
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
  side: 'UP' | 'DOWN';
  amount: string;
  depositTx: string | null;
  claimed: boolean;
  claimTx: string | null;
  payoutAmount: string | null;
  isWinner: boolean | null;
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

export interface ClaimAccounts {
  accounts: {
    pool: string;
    userBet: string;
    vault: string;
    userTokenAccount: string;
    user: string;
    tokenProgram: string;
  };
  programId: string;
  bet: {
    id: string;
    side: string;
    amount: string;
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
  page?: number;
  limit?: number;
}): Promise<ApiResponse<Pool[]>> {
  const searchParams = new URLSearchParams();
  if (params?.asset) searchParams.set('asset', params.asset);
  if (params?.interval) searchParams.set('interval', params.interval);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  const query = searchParams.toString();
  return fetchApi<Pool[]>(`/api/pools${query ? `?${query}` : ''}`);
}

export async function fetchPool(id: string): Promise<ApiResponse<PoolDetail>> {
  return fetchApi<PoolDetail>(`/api/pools/${id}`);
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

// Transaction endpoints
export async function prepareDeposit(params: {
  poolId: string;
  walletAddress: string;
  side: 'UP' | 'DOWN';
  amount: number;
}): Promise<ApiResponse<DepositAccounts>> {
  return fetchApi<DepositAccounts>('/api/transactions/deposit', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function confirmDeposit(params: {
  poolId: string;
  walletAddress: string;
  txSignature: string;
  side: 'UP' | 'DOWN';
}): Promise<ApiResponse<{ betId: string; status: string }>> {
  return fetchApi('/api/transactions/confirm-deposit', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function prepareClaim(params: {
  poolId: string;
  walletAddress: string;
}): Promise<ApiResponse<ClaimAccounts>> {
  return fetchApi<ClaimAccounts>('/api/transactions/claim', {
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

export async function executeClaim(params: {
  poolId: string;
  walletAddress: string;
}): Promise<ApiResponse<{ betId: string; payoutAmount: string; txSignature: string; status: string }>> {
  return fetchApi('/api/transactions/execute-claim', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ─── User / Rewards endpoints ────────────────────────────────────────────────

export interface UserProfile {
  walletAddress: string;
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
  feeBps: number;
  feePercent: string;
  stats: {
    totalBets: number;
    totalWins: number;
    winRate: string;
    totalWagered: string;
    currentStreak: number;
    bestStreak: number;
  };
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

export interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  level: number;
  title: string;
  totalXp: string;
  coinsLifetime: string;
  totalBets: number;
  totalWins: number;
  bestStreak: number;
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

export async function fetchLeaderboard(
  params?: { sort?: 'xp' | 'coins' | 'level'; page?: number; limit?: number },
): Promise<ApiResponse<LeaderboardEntry[]>> {
  const searchParams = new URLSearchParams();
  if (params?.sort) searchParams.set('sort', params.sort);
  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  const query = searchParams.toString();
  return fetchApi<LeaderboardEntry[]>(`/api/users/leaderboard${query ? `?${query}` : ''}`);
}
