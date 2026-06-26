# Plan — Solana gasless + no-popup bet flow (fee-payer relayer + silent embedded signing)

Estado: **PROPUESTA** (scoped contra `main`, 2026-06-26). No implementado. Equivalente Solana
de lo que montamos en EVM (smart wallet + paymaster) → aquí: **relayer fee-payer + firma
silenciosa de la embedded wallet**. Objetivo: el usuario apuesta sin popup y **sin necesitar SOL**.

## Objetivo
1. **Sin popup**: la Privy embedded Solana wallet co-firma la tx del deposit en silencio.
2. **Sin SOL**: la autoridad (relayer) paga el fee de la tx + cualquier rent, así el usuario
   necesita **0 SOL**. (Fees Solana ~$0.001 → patrocinar es trivial; no hace falta un
   "paymaster en USDC" tipo Octane.)

## Mapa del código actual (main)
- **Privy** `apps/web/src/app/providers.tsx:253-273`: `walletChainType:'solana-only'`,
  `embeddedWallets.solana.createOnLogin:'all-users'`. **NO** hay flag de silent-signing.
- **Web deposit** `apps/web/src/hooks/useTransactions.ts:77-202`: el CLIENTE construye la ix
  (`buildDepositIx`), pone **`transaction.feePayer = publicKey`** (← el usuario paga) y firma+envía
  vía `useWalletBridge.sendTransaction` → embedded path = `embeddedSend({transaction,connection})`
  (firma Y envía).
- **useWalletBridge** `apps/web/src/hooks/useWalletBridge.ts:62-118`: `isEmbedded` → `embeddedSend`
  (silent sign+send). External → adapter (popup).
- **API** `apps/api/src/routes/deposits.ts:37`: `/deposit` devuelve **solo la lista de accounts**
  (no construye tx). `/confirm-deposit:173` verifica el txSignature on-chain + registra el bet.
- **solana-client** `packages/solana-client/src/instructions/index.ts:98-125`: `buildDepositIx` →
  `user` es `isSigner:true`; `userTokenAccount` = ATA USDC del user.
- **Fee payer server** `apps/api/src/utils/onchain.ts:22-51` `sendAndConfirm(ixs, payer: Keypair)`:
  ya firma server-side con la autoridad como feePayer (claims/refunds). No hay relayer para
  deposits de usuario.
- **ATA** `deposits.ts:128`: solo **deriva** la ATA, NO la crea (el deposit fallaría si no existe).
  `auto-claim.ts:68-73` ya usa `getOrCreateAssociatedTokenAccount` con la autoridad de payer.
- **Anchor deposit** `programs/parimutuel_pools/src/instructions/deposit.rs:9-48`:
  `user: Signer` + **`user_bet`: `#[account(init_if_needed, payer = user, ...)]`** ← **el rent del
  user_bet lo paga el `user`, no el feePayer de la tx**. Este es el matiz clave.

## Los dos costes de un deposit (y quién los cubre)
| Coste | Monto | Hoy | Gasless |
|---|---|---|---|
| Fee de la tx | ~0.000005 SOL ($0.001) | user (feePayer) | **autoridad** (feePayer) — sin cambio de programa |
| Rent `user_bet` (solo 1ª vez por pool+side) | ~0.0015 SOL | user (`payer=user`) | ver opciones ↓ |
| Rent ATA USDC (si no existe) | ~0.002 SOL | falla si no existe | autoridad crea la ATA (no requiere programa) |

## Cómo cubrir el rent del `user_bet` (las 2 opciones)
**Opción A — Sin tocar el programa (recomendada para el spike): financiar el rent en la MISMA tx.**
El relayer construye una tx con instrucciones en orden:
1. (si user_bet no existe) `SystemProgram.transfer(authority → user, userBetRent)`
2. (si ATA no existe) `createAssociatedTokenAccount(payer=authority, owner=user)`
3. `buildDepositIx(...)` (user como signer)

`feePayer = authority`. La instrucción 1 le da al user exactamente el rent ANTES de que la ix 3
lo gaste (`payer=user`) → el user nunca necesita SOL previo. Atómico. La autoridad partial-firma
(feePayer + transfer + ATA), el user co-firma en silencio, se envía.
- ✅ Cero cambios de programa / redeploy.
- ⚠️ Al cerrar el user_bet, el rent vuelve al `user` (pequeño "windfall" que financió la autoridad).
  Aceptable en testnet; ajustable en el cierre/rent-recovery.

**Opción B — Cambiar el programa (más limpio a largo plazo): `payer = fee_payer`.**
Añadir un account `fee_payer: Signer` al deposit y `#[account(init_if_needed, payer = fee_payer)]`.
El relayer es el fee_payer y paga el rent directo (sin transfer hack; el rent vuelve al relayer al
cerrar). Requiere **upgrade del programa + redeploy** + actualizar `buildDepositIx`/account list/IDL.
→ Dejar para después; empezar con A.

## Implementación (Opción A)
1. **Privy (web)** `providers.tsx`: activar firma silenciosa de la embedded wallet (equivalente a
   `showWalletUIs:false` de EVM; verificar el flag exacto del SDK Solana de Privy). Validar que la
   embedded wallet pueda **`signTransaction` (solo firmar, no enviar)** en silencio.
2. **API** `routes/deposits.ts`: nuevo `POST /prepare-gasless-deposit` (o flag en `/deposit`):
   - Reusa la lógica de accounts actual.
   - `getOrCreateAssociatedTokenAccount(authority, usdcMint, user)` si falta (autoridad paga ATA).
   - Detecta si `user_bet` existe (getAccountInfo del PDA); si no, prepend `SystemProgram.transfer`.
   - Construye Tx: feePayer=authority, recentBlockhash, [transfer?, ataCreate?, depositIx].
   - `tx.partialSign(authority)`. Devuelve `tx.serialize({requireAllSignatures:false})` en base64.
3. **Web** `useTransactions.ts` + `useWalletBridge.ts`:
   - `deposit()` → llama al nuevo endpoint, deserializa la tx, la embedded wallet hace
     **`signTransaction` (silencioso)** para añadir la firma del user, y el cliente la envía
     (`connection.sendRawTransaction`) o la manda a un `/submit`.
   - Quitar `transaction.feePayer = publicKey` (ahora lo pone el server = authority).
4. **confirm-deposit**: sin cambios.
5. **Sin cambios** en el programa Anchor ni en solana-client buildDepositIx.

## Notas
- **No hay problema de nonce** como en EVM: en Solana cada tx lleva su blockhash, la autoridad
  partial-firma por request (stateless). No necesita serialización de nonce.
- **Coste para ti (autoridad)**: ~0.000005 SOL/bet (fee) + ~0.0015 SOL la 1ª vez por pool+side
  (rent, recuperable). Negligible.
- **Octane (paymaster en USDC)**: over-engineering aquí; los fees Solana son ~$0.001. Solo si
  algún día quieres que el usuario pague el fee en USDC en vez de patrocinarlo.
- **Verificar antes de implementar**: el flag exacto de silent-signing del Privy Solana SDK y que
  `signTransaction` (no send) esté disponible para embedded — es el único punto con incertidumbre.

## Esfuerzo estimado
Moderado: 1 endpoint API (build+partialSign), cambios en el hook web (sign-only + submit), 1 flag
Privy. Sin redeploy de programa (Opción A). ~medio día + prueba e2e en devnet.
