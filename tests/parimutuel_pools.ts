import * as anchor from '@coral-xyz/anchor';
import { Program, BN } from '@coral-xyz/anchor';
import { ParimutuelPools } from '../target/types/parimutuel_pools';
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { expect } from 'chai';
import crypto from 'crypto';

describe('parimutuel_pools', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.ParimutuelPools as Program<ParimutuelPools>;
  const authority = provider.wallet;

  // Test accounts
  let usdcMint: PublicKey;
  let poolId: number[];
  let poolPda: PublicKey;
  let vaultPda: PublicKey;

  // User accounts
  let user1: Keypair;
  let user2: Keypair;
  let user1TokenAccount: PublicKey;
  let user2TokenAccount: PublicKey;
  let authorityTokenAccount: PublicKey;

  // Time settings (relative to now)
  const now = Math.floor(Date.now() / 1000);
  let lockTime: number;
  let startTime: number;
  let endTime: number;

  before(async () => {
    // Create USDC mint
    usdcMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      authority.publicKey,
      null,
      6 // USDC has 6 decimals
    );

    // Create user keypairs
    user1 = Keypair.generate();
    user2 = Keypair.generate();

    // Airdrop SOL to users for transaction fees
    const airdropAmount = 10 * anchor.web3.LAMPORTS_PER_SOL;
    await provider.connection.requestAirdrop(user1.publicKey, airdropAmount);
    await provider.connection.requestAirdrop(user2.publicKey, airdropAmount);

    // Wait for airdrops to confirm
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create token accounts for users
    user1TokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      user1.publicKey
    );

    user2TokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      user2.publicKey
    );

    authorityTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      authority.publicKey
    );

    // Mint USDC to users (1000 USDC each)
    const mintAmount = 1000 * 1_000_000; // 1000 USDC
    await mintTo(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      user1TokenAccount,
      authority.publicKey,
      mintAmount
    );

    await mintTo(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      user2TokenAccount,
      authority.publicKey,
      mintAmount
    );
  });

  beforeEach(async () => {
    // Generate unique pool ID for each test
    poolId = Array.from(crypto.randomBytes(32));

    // Calculate PDAs
    [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('pool'), Buffer.from(poolId)],
      program.programId
    );

    [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), Buffer.from(poolId)],
      program.programId
    );

    // Set time parameters: lock in 60s, start in 120s, end in 180s
    const currentTime = Math.floor(Date.now() / 1000);
    lockTime = currentTime + 60;
    startTime = currentTime + 120;
    endTime = currentTime + 180;
  });

  describe('Initialize Pool', () => {
    it('should initialize a pool successfully', async () => {
      await program.methods
        .initializePool(poolId, 'BTC', new BN(startTime), new BN(endTime), new BN(lockTime))
        .accounts({
          pool: poolPda,
          vault: vaultPda,
          usdcMint: usdcMint,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // Fetch and verify pool state
      const pool = await program.account.pool.fetch(poolPda);
      expect(pool.asset).to.equal('BTC');
      expect(pool.authority.toBase58()).to.equal(authority.publicKey.toBase58());
      expect(pool.totalUp.toNumber()).to.equal(0);
      expect(pool.totalDown.toNumber()).to.equal(0);
      expect(pool.status).to.deep.equal({ joining: {} });
      expect(pool.winner).to.be.null;
    });

    it('should reject invalid time configuration', async () => {
      // Try with lock_time > start_time (invalid)
      const invalidLockTime = startTime + 10;

      try {
        await program.methods
          .initializePool(poolId, 'BTC', new BN(startTime), new BN(endTime), new BN(invalidLockTime))
          .accounts({
            pool: poolPda,
            vault: vaultPda,
            usdcMint: usdcMint,
            authority: authority.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('InvalidTimeConfig');
      }
    });
  });

  describe('Deposit', () => {
    beforeEach(async () => {
      // Initialize pool before each deposit test
      await program.methods
        .initializePool(poolId, 'BTC', new BN(startTime), new BN(endTime), new BN(lockTime))
        .accounts({
          pool: poolPda,
          vault: vaultPda,
          usdcMint: usdcMint,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
    });

    it('should allow deposit on UP side during joining window', async () => {
      const depositAmount = 100 * 1_000_000; // 100 USDC

      const [userBetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('bet'), poolPda.toBuffer(), user1.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .deposit({ up: {} }, new BN(depositAmount))
        .accounts({
          pool: poolPda,
          userBet: userBetPda,
          vault: vaultPda,
          userTokenAccount: user1TokenAccount,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      // Verify pool state
      const pool = await program.account.pool.fetch(poolPda);
      expect(pool.totalUp.toNumber()).to.equal(depositAmount);
      expect(pool.totalDown.toNumber()).to.equal(0);

      // Verify user bet
      const userBet = await program.account.userBet.fetch(userBetPda);
      expect(userBet.side).to.deep.equal({ up: {} });
      expect(userBet.amount.toNumber()).to.equal(depositAmount);
      expect(userBet.claimed).to.be.false;

      // Verify vault received tokens
      const vaultAccount = await getAccount(provider.connection, vaultPda);
      expect(Number(vaultAccount.amount)).to.equal(depositAmount);
    });

    it('should allow deposit on DOWN side', async () => {
      const depositAmount = 50 * 1_000_000; // 50 USDC

      const [userBetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('bet'), poolPda.toBuffer(), user2.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .deposit({ down: {} }, new BN(depositAmount))
        .accounts({
          pool: poolPda,
          userBet: userBetPda,
          vault: vaultPda,
          userTokenAccount: user2TokenAccount,
          user: user2.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc();

      const pool = await program.account.pool.fetch(poolPda);
      expect(pool.totalDown.toNumber()).to.equal(depositAmount);
    });

    it('should reject zero deposit', async () => {
      const [userBetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('bet'), poolPda.toBuffer(), user1.publicKey.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .deposit({ up: {} }, new BN(0))
          .accounts({
            pool: poolPda,
            userBet: userBetPda,
            vault: vaultPda,
            userTokenAccount: user1TokenAccount,
            user: user1.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user1])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('ZeroDeposit');
      }
    });
  });

  describe('Resolve', () => {
    let user1BetPda: PublicKey;
    let user2BetPda: PublicKey;

    beforeEach(async () => {
      // Set times to allow immediate resolution for testing
      const currentTime = Math.floor(Date.now() / 1000);
      lockTime = currentTime + 5;
      startTime = currentTime + 6;
      endTime = currentTime + 7; // Will end in 7 seconds

      await program.methods
        .initializePool(poolId, 'ETH', new BN(startTime), new BN(endTime), new BN(lockTime))
        .accounts({
          pool: poolPda,
          vault: vaultPda,
          usdcMint: usdcMint,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // Both users deposit
      [user1BetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('bet'), poolPda.toBuffer(), user1.publicKey.toBuffer()],
        program.programId
      );

      [user2BetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('bet'), poolPda.toBuffer(), user2.publicKey.toBuffer()],
        program.programId
      );

      // User1 bets UP (100 USDC)
      await program.methods
        .deposit({ up: {} }, new BN(100 * 1_000_000))
        .accounts({
          pool: poolPda,
          userBet: user1BetPda,
          vault: vaultPda,
          userTokenAccount: user1TokenAccount,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      // User2 bets DOWN (50 USDC)
      await program.methods
        .deposit({ down: {} }, new BN(50 * 1_000_000))
        .accounts({
          pool: poolPda,
          userBet: user2BetPda,
          vault: vaultPda,
          userTokenAccount: user2TokenAccount,
          user: user2.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc();
    });

    it('should resolve pool with UP winner when final > strike', async () => {
      // Wait for end_time
      await new Promise(resolve => setTimeout(resolve, 8000));

      const strikePrice = 50000 * 1_000_000; // $50,000
      const finalPrice = 55000 * 1_000_000; // $55,000 (UP wins)

      await program.methods
        .resolve(new BN(strikePrice), new BN(finalPrice))
        .accounts({
          pool: poolPda,
          authority: authority.publicKey,
        })
        .rpc();

      const pool = await program.account.pool.fetch(poolPda);
      expect(pool.status).to.deep.equal({ resolved: {} });
      expect(pool.winner).to.deep.equal({ up: {} });
      expect(pool.strikePrice.toNumber()).to.equal(strikePrice);
      expect(pool.finalPrice.toNumber()).to.equal(finalPrice);
    });

    it('should resolve pool with DOWN winner when final < strike', async () => {
      await new Promise(resolve => setTimeout(resolve, 8000));

      const strikePrice = 50000 * 1_000_000;
      const finalPrice = 45000 * 1_000_000; // DOWN wins

      await program.methods
        .resolve(new BN(strikePrice), new BN(finalPrice))
        .accounts({
          pool: poolPda,
          authority: authority.publicKey,
        })
        .rpc();

      const pool = await program.account.pool.fetch(poolPda);
      expect(pool.winner).to.deep.equal({ down: {} });
    });

    it('should reject resolve from non-authority', async () => {
      await new Promise(resolve => setTimeout(resolve, 8000));

      try {
        await program.methods
          .resolve(new BN(50000), new BN(55000))
          .accounts({
            pool: poolPda,
            authority: user1.publicKey,
          })
          .signers([user1])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('Unauthorized');
      }
    });

    it('should reject resolve before end_time', async () => {
      // Don't wait - try to resolve immediately
      try {
        await program.methods
          .resolve(new BN(50000), new BN(55000))
          .accounts({
            pool: poolPda,
            authority: authority.publicKey,
          })
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('PoolNotEnded');
      }
    });
  });

  describe('Claim', () => {
    let user1BetPda: PublicKey;
    let user2BetPda: PublicKey;
    const user1Deposit = 100 * 1_000_000;
    const user2Deposit = 50 * 1_000_000;

    beforeEach(async () => {
      const currentTime = Math.floor(Date.now() / 1000);
      lockTime = currentTime + 3;
      startTime = currentTime + 4;
      endTime = currentTime + 5;

      await program.methods
        .initializePool(poolId, 'SOL', new BN(startTime), new BN(endTime), new BN(lockTime))
        .accounts({
          pool: poolPda,
          vault: vaultPda,
          usdcMint: usdcMint,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      [user1BetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('bet'), poolPda.toBuffer(), user1.publicKey.toBuffer()],
        program.programId
      );

      [user2BetPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('bet'), poolPda.toBuffer(), user2.publicKey.toBuffer()],
        program.programId
      );

      // User1 bets UP
      await program.methods
        .deposit({ up: {} }, new BN(user1Deposit))
        .accounts({
          pool: poolPda,
          userBet: user1BetPda,
          vault: vaultPda,
          userTokenAccount: user1TokenAccount,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user1])
        .rpc();

      // User2 bets DOWN
      await program.methods
        .deposit({ down: {} }, new BN(user2Deposit))
        .accounts({
          pool: poolPda,
          userBet: user2BetPda,
          vault: vaultPda,
          userTokenAccount: user2TokenAccount,
          user: user2.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc();

      // Wait and resolve with UP winning
      await new Promise(resolve => setTimeout(resolve, 6000));

      await program.methods
        .resolve(new BN(100 * 1_000_000), new BN(110 * 1_000_000)) // UP wins
        .accounts({
          pool: poolPda,
          authority: authority.publicKey,
        })
        .rpc();
    });

    it('should allow winner to claim full pool', async () => {
      const totalPool = user1Deposit + user2Deposit; // 150 USDC
      const balanceBefore = await getAccount(provider.connection, user1TokenAccount);

      await program.methods
        .claim()
        .accounts({
          pool: poolPda,
          userBet: user1BetPda,
          vault: vaultPda,
          userTokenAccount: user1TokenAccount,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user1])
        .rpc();

      const balanceAfter = await getAccount(provider.connection, user1TokenAccount);
      const claimed = Number(balanceAfter.amount) - Number(balanceBefore.amount);

      // User1 should receive entire pool (only UP better)
      expect(claimed).to.equal(totalPool);

      // Verify bet marked as claimed
      const userBet = await program.account.userBet.fetch(user1BetPda);
      expect(userBet.claimed).to.be.true;
    });

    it('should reject claim from loser', async () => {
      try {
        await program.methods
          .claim()
          .accounts({
            pool: poolPda,
            userBet: user2BetPda,
            vault: vaultPda,
            userTokenAccount: user2TokenAccount,
            user: user2.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user2])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('NotWinner');
      }
    });

    it('should prevent double claim', async () => {
      // First claim should succeed
      await program.methods
        .claim()
        .accounts({
          pool: poolPda,
          userBet: user1BetPda,
          vault: vaultPda,
          userTokenAccount: user1TokenAccount,
          user: user1.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([user1])
        .rpc();

      // Second claim should fail
      try {
        await program.methods
          .claim()
          .accounts({
            pool: poolPda,
            userBet: user1BetPda,
            vault: vaultPda,
            userTokenAccount: user1TokenAccount,
            user: user1.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user1])
          .rpc();
        expect.fail('Should have thrown an error');
      } catch (err: any) {
        expect(err.error.errorCode.code).to.equal('AlreadyClaimed');
      }
    });
  });

  describe('Proportional Payout', () => {
    it('should distribute pool proportionally among multiple winners', async () => {
      // Create new users for this test
      const winnerA = Keypair.generate();
      const winnerB = Keypair.generate();

      await provider.connection.requestAirdrop(winnerA.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);
      await provider.connection.requestAirdrop(winnerB.publicKey, 5 * anchor.web3.LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const winnerAToken = await createAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as anchor.Wallet).payer,
        usdcMint,
        winnerA.publicKey
      );

      const winnerBToken = await createAssociatedTokenAccount(
        provider.connection,
        (provider.wallet as anchor.Wallet).payer,
        usdcMint,
        winnerB.publicKey
      );

      // Mint tokens
      await mintTo(provider.connection, (provider.wallet as anchor.Wallet).payer, usdcMint, winnerAToken, authority.publicKey, 500 * 1_000_000);
      await mintTo(provider.connection, (provider.wallet as anchor.Wallet).payer, usdcMint, winnerBToken, authority.publicKey, 500 * 1_000_000);

      // New pool
      const newPoolId = Array.from(crypto.randomBytes(32));
      const [newPoolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('pool'), Buffer.from(newPoolId)],
        program.programId
      );
      const [newVaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), Buffer.from(newPoolId)],
        program.programId
      );

      const currentTime = Math.floor(Date.now() / 1000);

      await program.methods
        .initializePool(newPoolId, 'BTC', new BN(currentTime + 4), new BN(currentTime + 5), new BN(currentTime + 3))
        .accounts({
          pool: newPoolPda,
          vault: newVaultPda,
          usdcMint: usdcMint,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // WinnerA bets 100 USDC on UP
      // WinnerB bets 50 USDC on UP
      // Loser (user2) bets 150 USDC on DOWN
      const [winnerABet] = PublicKey.findProgramAddressSync(
        [Buffer.from('bet'), newPoolPda.toBuffer(), winnerA.publicKey.toBuffer()],
        program.programId
      );
      const [winnerBBet] = PublicKey.findProgramAddressSync(
        [Buffer.from('bet'), newPoolPda.toBuffer(), winnerB.publicKey.toBuffer()],
        program.programId
      );
      const [loserBet] = PublicKey.findProgramAddressSync(
        [Buffer.from('bet'), newPoolPda.toBuffer(), user2.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .deposit({ up: {} }, new BN(100 * 1_000_000))
        .accounts({
          pool: newPoolPda,
          userBet: winnerABet,
          vault: newVaultPda,
          userTokenAccount: winnerAToken,
          user: winnerA.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([winnerA])
        .rpc();

      await program.methods
        .deposit({ up: {} }, new BN(50 * 1_000_000))
        .accounts({
          pool: newPoolPda,
          userBet: winnerBBet,
          vault: newVaultPda,
          userTokenAccount: winnerBToken,
          user: winnerB.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([winnerB])
        .rpc();

      await program.methods
        .deposit({ down: {} }, new BN(150 * 1_000_000))
        .accounts({
          pool: newPoolPda,
          userBet: loserBet,
          vault: newVaultPda,
          userTokenAccount: user2TokenAccount,
          user: user2.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc();

      // Wait and resolve - UP wins
      await new Promise(resolve => setTimeout(resolve, 6000));

      await program.methods
        .resolve(new BN(100), new BN(110))
        .accounts({
          pool: newPoolPda,
          authority: authority.publicKey,
        })
        .rpc();

      // Total pool = 300 USDC
      // UP side = 150 USDC
      // WinnerA should get: (100/150) * 300 = 200 USDC
      // WinnerB should get: (50/150) * 300 = 100 USDC

      const balanceABefore = await getAccount(provider.connection, winnerAToken);

      await program.methods
        .claim()
        .accounts({
          pool: newPoolPda,
          userBet: winnerABet,
          vault: newVaultPda,
          userTokenAccount: winnerAToken,
          user: winnerA.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([winnerA])
        .rpc();

      const balanceAAfter = await getAccount(provider.connection, winnerAToken);
      const payoutA = Number(balanceAAfter.amount) - Number(balanceABefore.amount);

      // Expected: 200 USDC (with potential rounding)
      expect(payoutA).to.equal(200 * 1_000_000);

      const balanceBBefore = await getAccount(provider.connection, winnerBToken);

      await program.methods
        .claim()
        .accounts({
          pool: newPoolPda,
          userBet: winnerBBet,
          vault: newVaultPda,
          userTokenAccount: winnerBToken,
          user: winnerB.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([winnerB])
        .rpc();

      const balanceBAfter = await getAccount(provider.connection, winnerBToken);
      const payoutB = Number(balanceBAfter.amount) - Number(balanceBBefore.amount);

      // Expected: 100 USDC
      expect(payoutB).to.equal(100 * 1_000_000);
    });
  });
});
