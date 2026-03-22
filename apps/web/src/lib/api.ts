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

// ─── Referral endpoints ──────────────────────────────────────────────────────

export async function resolveReferralCode(
  code: string,
): Promise<ApiResponse<{ referrerWallet: string }>> {
  return fetchApi<{ referrerWallet: string }>(`/api/referrals/resolve?code=${encodeURIComponent(code)}`);
}

export async function acceptReferralApi(
  walletAddress: string,
  referralCode: string,
): Promise<ApiResponse<{ status: string }>> {
  return fetchApi('/api/referrals/accept', {
    method: 'POST',
    body: JSON.stringify({ walletAddress, referralCode }),
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
  content: string;
  createdAt: string;
}

export interface SquadLeaderboardEntry {
  walletAddress: string;
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
