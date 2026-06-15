import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PublicKey, type TransactionInstruction } from '@solana/web3.js';
import {
  buildInitializePoolIx, buildDepositIx, buildResolveIx, buildResolveWithWinnerIx,
  buildClaimIx, buildRefundIx, buildRefundBettorIx, buildCloseLosingBetIx,
  buildSweepVaultDustIx, buildClosePoolIx, buildForceClosePoolIx,
  buildInitializeTournamentIx, buildRegisterParticipantIx, buildClaimTournamentPrizeIx,
  buildCancelTournamentIx, buildRefundParticipantIx, buildCloseTournamentIx,
} from 'solana-client';

// solana-client hand-writes each instruction's 8-byte discriminator
// (Buffer.from([...])). Anchor derives them as sha256("global:<name>")[0..8];
// a typo or a rename that doesn't update the constant produces a discriminator
// the program rejects — every call to that money-path instruction would fail
// on-chain. This pins the actual bytes the built instruction carries to the
// canonical sighash, so any drift fails CI instead of production.

/** Anchor instruction sighash: first 8 bytes of sha256("global:<snake_name>"). */
function sighash(name: string): Buffer {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

const P = PublicKey.default;
const SEED = new Uint8Array(32);

// Each built instruction paired with its canonical on-chain name. Dummy args —
// only the leading discriminator matters here.
const CASES: Array<[string, TransactionInstruction]> = [
  ['initialize_pool', buildInitializePoolIx(P, P, P, P, SEED, 'BTC', 0, 0, 0, 0, 2)],
  ['deposit', buildDepositIx(P, P, P, P, P, 0, 0n)],
  ['resolve', buildResolveIx(P, P, 0n, 0n)],
  ['resolve_with_winner', buildResolveWithWinnerIx(P, P, 0)],
  ['claim', buildClaimIx(P, P, P, P, P, P, P, 0, 0)],
  ['refund', buildRefundIx(P, P, P, P, P, P, 0)],
  ['refund_bettor', buildRefundBettorIx(P, P, P, P, P, P, 0)],
  ['close_losing_bet', buildCloseLosingBetIx(P, P, P, P, 0)],
  ['sweep_vault_dust', buildSweepVaultDustIx(P, P, P, P)],
  ['close_pool', buildClosePoolIx(P, P, P)],
  ['force_close_pool', buildForceClosePoolIx(P, P)],
  ['initialize_tournament', buildInitializeTournamentIx(P, P, P, P, SEED, 0n, 0)],
  ['register_participant', buildRegisterParticipantIx(P, P, P, P, P)],
  ['claim_tournament_prize', buildClaimTournamentPrizeIx(P, P, P, P, P, P, P)],
  ['cancel_tournament', buildCancelTournamentIx(P, P)],
  ['refund_participant', buildRefundParticipantIx(P, P, P, P, P, P)],
  ['close_tournament', buildCloseTournamentIx(P, P, P)],
];

describe('on-chain instruction discriminators match Anchor sighash', () => {
  for (const [name, ix] of CASES) {
    it(`${name} carries sha256("global:${name}")[0..8]`, () => {
      expect(Buffer.from(ix.data.subarray(0, 8))).toEqual(sighash(name));
    });
  }
});

// Cross-check against the committed IDL (the artifact `anchor build` emits and
// the on-chain program is generated from). Read via fs so the test doesn't
// depend on the package re-exporting the JSON.
const idl: { instructions: Array<{ name: string; discriminator: number[] }> } = JSON.parse(
  readFileSync(join(__dirname, '../../../packages/solana-client/src/idl/parimutuel_pools.json'), 'utf8'),
);

describe('committed IDL is consistent with the built instructions', () => {
  it('every IDL discriminator equals its sighash', () => {
    for (const i of idl.instructions) {
      expect(Buffer.from(i.discriminator), i.name).toEqual(sighash(i.name));
    }
  });

  it('every built instruction that has an IDL entry matches the IDL discriminator', () => {
    const byName = new Map(idl.instructions.map(i => [i.name, Buffer.from(i.discriminator)]));
    for (const [name, ix] of CASES) {
      const idlDisc = byName.get(name);
      if (idlDisc) expect(Buffer.from(ix.data.subarray(0, 8)), name).toEqual(idlDisc);
    }
  });

  it('documents which built instructions are missing from the committed IDL (IDL lag)', () => {
    const idlNames = new Set(idl.instructions.map(i => i.name));
    const missing = CASES.map(([name]) => name).filter(n => !idlNames.has(n));
    // The IDL JSON predates the rent-recovery instructions; this is a known lag,
    // not a discriminator bug (the sighash tests above cover these). Pinned so a
    // future `anchor build` that regenerates the IDL trips this and prompts an
    // update of the expectation.
    expect(missing.sort()).toEqual(['close_losing_bet', 'refund_bettor', 'sweep_vault_dust']);
  });
});
