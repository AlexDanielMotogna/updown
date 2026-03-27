"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROGRAM_ID = void 0;
exports.getPoolPDA = getPoolPDA;
exports.getVaultPDA = getVaultPDA;
exports.getUserBetPDA = getUserBetPDA;
exports.getTournamentPDA = getTournamentPDA;
exports.getTournamentVaultPDA = getTournamentVaultPDA;
exports.getTournamentParticipantPDA = getTournamentParticipantPDA;
const web3_js_1 = require("@solana/web3.js");
// Program ID - Devnet deployment
exports.PROGRAM_ID = new web3_js_1.PublicKey('HnqB6ahdTEGwJ624D6kaeoSxUS2YwNoq1Cn5Kt9KQBTD');
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
 * Derive UserBet PDA
 */
function getUserBetPDA(pool, user) {
    return web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('bet'), pool.toBuffer(), user.toBuffer()], exports.PROGRAM_ID);
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
