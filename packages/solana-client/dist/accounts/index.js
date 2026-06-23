"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROGRAM_ID = void 0;
exports.getPoolPDA = getPoolPDA;
exports.getVaultPDA = getVaultPDA;
exports.sideToIndex = sideToIndex;
exports.getUserBetPDA = getUserBetPDA;
exports.getTournamentPDA = getTournamentPDA;
exports.getTournamentVaultPDA = getTournamentVaultPDA;
exports.getTournamentParticipantPDA = getTournamentParticipantPDA;
const web3_js_1 = require("@solana/web3.js");
// Program ID - Devnet deployment
exports.PROGRAM_ID = new web3_js_1.PublicKey('9H7k26HvHHnB4T6ErU7n2wVSFJhS1aigqFQGwvQyVuNG');
/**
 * Derive Pool PDA
 */
function getPoolPDA(poolId) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('pool'), poolId], exports.PROGRAM_ID);
}
/**
 * Derive Vault PDA
 */
function getVaultPDA(poolId) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('vault'), poolId], exports.PROGRAM_ID);
}
/**
 * Map a side label to its on-chain index (UP=0, DOWN=1, DRAW=2) - the single
 * source of truth for the `side` byte used in UserBet PDA seeds and instruction
 * data. Use this everywhere instead of inlining the ternary.
 */
function sideToIndex(side) {
    return side === 'UP' ? 0 : side === 'DOWN' ? 1 : 2;
}
/**
 * Derive UserBet PDA for a given side.
 * The `side` byte (0=Up/Home, 1=Down/Away, 2=Draw) is part of the seeds, so a
 * wallet can hold one independent UserBet account per side (hedge).
 */
function getUserBetPDA(pool, user, side) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bet'), pool.toBuffer(), user.toBuffer(), Buffer.from([side])], exports.PROGRAM_ID);
}
// ── Tournament PDAs ──
function getTournamentPDA(tournamentId) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('tournament'), tournamentId], exports.PROGRAM_ID);
}
function getTournamentVaultPDA(tournamentId) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('tournament_vault'), tournamentId], exports.PROGRAM_ID);
}
function getTournamentParticipantPDA(tournament, user) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('participant'), tournament.toBuffer(), user.toBuffer()], exports.PROGRAM_ID);
}
