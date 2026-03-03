# Bug Audit — Parimutuel Pools

Analisis exhaustivo del codigo logico. Ordenado por severidad.

---

## CRITICAL — Rompen funcionalidad core

### BUG-01: Race condition en resolvePool — doble resolucion de pools

**Archivos:** `apps/api/src/scheduler/pool-scheduler.ts` lineas 514-672

**Problema:** El scheduler corre cada 2 segundos. `resolvePool()` hace un REST API call a Pacifica (`getSpotPrice`) ANTES de actualizar el status a RESOLVED. Si el API call tarda >2s, el proximo tick del scheduler encuentra el mismo pool (aun ACTIVE) y lo resuelve de nuevo con un precio mas reciente. La segunda escritura sobreescribe la primera.

**Efecto:** En un mercado alcista, el precio del segundo intento siempre es mayor → UP gana sistematicamente. Esto explica el bug "siempre gana UP".

**Fix:** Atomic claim con `updateMany WHERE status=ACTIVE` antes de hacer el API call. Ya implementado en el archivo pero no commiteado.

---

### BUG-02: Single-bettor path pone finalPrice = strikePrice

**Archivo:** `apps/api/src/scheduler/pool-scheduler.ts` linea 567

```typescript
finalPrice: pool.strikePrice, // BUG: precio falso
```

**Problema:** Cuando hay 0-1 apostadores, el final price se setea al strike price en vez del precio real del mercado. El frontend muestra `$66,853.20 → $66,853.20` lo cual es incorrecto e imposible.

**Efecto:** El usuario ve un resultado que no refleja el mercado real. Muestra "DOWN WINS" con precios identicos — confuso y rompe confianza.

**Fix:** Siempre hacer el fetch del precio real antes de resolver, independientemente del numero de apostadores.

---

### BUG-03: wallet:refund se emite a TODOS los clientes

**Archivo:** `apps/api/src/websocket/index.ts` lineas 199-207

```typescript
export function emitRefund(walletAddress: string, data: { ... }): void {
  if (io) {
    io.emit('wallet:refund', { walletAddress, ...data }); // BUG: broadcast global
  }
}
```

**Problema:** `io.emit()` envia a TODOS los clientes conectados. Wallet A ve el refund de Wallet B.

**Efecto combinado con BUG-04:** Cualquier usuario conectado recibe notificaciones de refund de otros usuarios.

---

### BUG-04: useNotifications no filtra wallet:refund por wallet

**Archivo:** `apps/web/src/hooks/useNotifications.ts` lineas 65-72

```typescript
const onRefund = (payload: { poolId?: string; amount?: string; message?: string }) => {
  push(buildNotification('REFUND_RECEIVED', { ... }));
  // BUG: no verifica si el refund es para el wallet conectado
};
```

**Problema:** El handler acepta TODOS los eventos `wallet:refund` sin verificar que el `walletAddress` del payload coincida con el wallet conectado actualmente.

**Nota:** `useUsdcBalance.ts` linea 32 SI hace el check correctamente: `if (data.walletAddress === publicKey.toBase58())`. Pero `useNotifications` no.

**Fix:** Comparar `payload.walletAddress` con el wallet del usuario antes de push.

---

### BUG-05: confirm-deposit no verifica status del pool

**Archivo:** `apps/api/src/routes/transactions.ts` lineas 210-412

**Problema:** El endpoint `/confirm-deposit` no verifica que el pool este en status JOINING. Un deposito podria confirmarse despues de que el pool ya este ACTIVE, RESOLVED, o CLAIMABLE.

**Efecto:** Apuestas fantasma — dinero depositado en pools ya resueltos, sin posibilidad de ganar.

**Fix:** Agregar check: `if (pool.status !== 'JOINING') return 400`.

---

### BUG-06: bet.create y pool.update no son atomicos

**Archivo:** `apps/api/src/routes/transactions.ts` lineas 353-375

```typescript
const bet = await prisma.bet.create({ ... });    // Step 1
await prisma.pool.update({ ... increment ... });  // Step 2 — puede fallar
```

**Problema:** Si el `pool.update` falla despues de que el bet fue creado, el bet existe pero los totales del pool no se actualizan. Los odds y payouts se calculan mal.

**Fix:** Usar `prisma.$transaction([...])` para agrupar ambas operaciones.

---

## HIGH — Afectan UX significativamente

### BUG-07: No se emite pool update despues de confirm-deposit

**Archivo:** `apps/api/src/routes/transactions.ts` linea 393

**Problema:** Despues de confirmar un deposito y actualizar los totales del pool, no se llama a `emitPoolUpdate()`. Otros clientes viendo el mismo pool no ven los totales actualizados en tiempo real.

**Efecto:** Un usuario en el pool detail page no ve que otra persona aposto hasta el proximo refetch (10 segundos).

**Fix:** Agregar `emitPoolUpdate(pool.id, { id: pool.id, totalUp: ..., totalDown: ... })` despues del update.

---

### BUG-08: pool:status se emite doble — al room Y globalmente

**Archivo:** `apps/api/src/websocket/index.ts` lineas 180-184

```typescript
io.to(`pool:${poolId}`).emit('pool:status', data);  // al room
io.emit('pool:status', data);                         // a todos
```

**Problema:** Los clientes suscritos al room del pool reciben el evento DOS veces. Esto causa notificaciones duplicadas en el frontend para usuarios que estan viendo el pool detail page.

**Fix:** Usar solo `io.emit` (global) ya que el frontend ya filtra por poolId. O usar rooms exclusivamente y que el frontend se una al room correcto.

---

### BUG-09: setTimeout para RESOLVED → CLAIMABLE es fragil

**Archivo:** `apps/api/src/scheduler/pool-scheduler.ts` lineas 655-668

```typescript
setTimeout(async () => {
  await prisma.pool.update({ ... status: PoolStatus.CLAIMABLE });
}, 5000);
```

**Problema:** Si el servidor se reinicia dentro de los 5 segundos, el pool queda en RESOLVED para siempre. Nadie puede hacer claim.

**Fix:** El scheduler deberia tener un cron que busque pools RESOLVED con `updatedAt` > 5 segundos y los transicione a CLAIMABLE.

---

### BUG-10: USDC_MINT defaults inconsistentes

**Archivos:**
- `apps/api/src/routes/transactions.ts` linea 22: default = `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`
- `apps/api/src/scheduler/pool-scheduler.ts` linea 22: default = `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

**Problema:** Si `USDC_MINT` no esta en environment, el scheduler usa mainnet USDC y las transactions usan devnet USDC. Los vault PDAs no coinciden → transferencias van a vaults diferentes → depositos "no encontrados".

**Fix:** Centralizar USDC_MINT en un solo config file.

---

### BUG-11: Deposit notification no incluye asset name

**Archivo:** `apps/web/src/hooks/useTransactions.ts` linea ~175

```typescript
notifStore.push(buildNotification('DEPOSIT_SUCCESS', { poolId, side }));
// Falta: asset
```

**Efecto:** Toast muestra "UP on pool" en vez de "UP on BTC".

---

## MEDIUM — Problemas logicos menores

### BUG-12: Pools vacios reciben winner = UP por defecto

**Archivo:** `apps/api/src/scheduler/pool-scheduler.ts` linea 562

```typescript
const winner = soleBet ? soleBet.side : Side.UP;
```

**Problema:** Pools con 0 bets reciben `winner = UP`. Estos aparecen en el LiveResultsSidebar como "UP WINS" con $0.00 — confuso.

**Fix:** Para pools con 0 bets, no setear winner. O mejor: no emitir pool:status para pools vacios.

---

### BUG-13: LiveResultsSidebar muestra pools sin bets

**Archivo:** `apps/web/src/components/LiveResultsSidebar.tsx` linea 35

```typescript
const pools = (data?.data ?? []).filter(
  (p) => p.status === 'RESOLVED' || p.status === 'CLAIMABLE'
).slice(0, MAX_VISIBLE);
```

**Problema:** No filtra por `betCount > 0`. Pools vacios con "UP WINS $0.00" llenan el sidebar.

**Fix:** Agregar `.filter(p => p.betCount > 0)`.

---

### BUG-14: activeWallet puede flickear entre embedded y external

**Archivo:** `apps/web/src/hooks/useWalletBridge.ts` lineas 25-33

**Problema:** `activeWallet` depende de `standardWallets`. Cuando el standard adapter se auto-conecta (unos segundos post-load), `activeWallet` flipea de embedded a external, cambiando `publicKey` mid-session. Queries en vuelo podrian tener el wallet equivocado.

**Mitigacion:** Agregar un flag `walletStable` que solo sea true despues de un delay o cuando standardWallets se estabilice.

---

### BUG-15: useNotifications corre useBets sin wallet

**Archivo:** `apps/web/src/hooks/useNotifications.ts` linea 13

```typescript
const betsQuery = useBets({ limit: 50 });
```

**Problema:** `useNotifications` se monta en `providers.tsx` globalmente. `useBets` tiene `enabled: !!wallet`, asi que sin wallet la query no ejecuta. Pero el hook igual se suscribe a WebSocket events. Sin wallet, `userPoolIds` esta vacio → las notificaciones de pool:status se filtran bien. PERO `wallet:refund` no tiene filtro → se muestran refunds de otros usuarios (ver BUG-04).

---

### BUG-16: Dedup de notificaciones solo compara type + poolId

**Archivo:** `apps/web/src/stores/notificationStore.ts` lineas 51-57

```typescript
const isDupe = existing.some(
  (n) => n.type === input.type && n.poolId === input.poolId && now - n.createdAt < DEDUP_WINDOW_MS,
);
```

**Problema:** Notificaciones sin `poolId` (como DEPOSIT_FAILED) se deduplican por type solamente. Dos depositos fallidos diferentes en rapida sucesion → el segundo se pierde.

**Fix:** Incluir `message` en el check de dedup, o usar un hash del contenido.

---

## LOW — Mejoras de robustez

### BUG-17: confirm-deposit no valida que walletAddress firmo la transaccion

**Archivo:** `apps/api/src/routes/transactions.ts`

**Problema:** El endpoint confia en que el `walletAddress` enviado por el frontend es quien firmo la TX. No verifica los signers de la transaccion on-chain. Un atacante podria enviar el txSignature de otra persona.

**Fix:** Verificar que `walletAddress` esta en los signers de la transaccion.

---

### BUG-18: processResolutions no es concurrency-safe entre procesos

**Archivo:** `apps/api/src/scheduler/pool-scheduler.ts`

**Problema:** Si se despliegan multiples instancias del API (horizontal scaling), ambas ejecutarian el scheduler. Sin distributed locking, ambas resolverian los mismos pools.

**Fix:** Usar pg advisory locks o un job queue como BullMQ.

---

### BUG-19: activatePool tambien tiene race condition (mismo patron que BUG-01)

**Archivo:** `apps/api/src/scheduler/pool-scheduler.ts` lineas 384-438

**Problema:** El strike price se captura DESPUES de fetchear el precio del API. Si el scheduler tick corre dos veces, el strike price se sobreescribe con un valor ligeramente diferente.

**Fix:** Atomic claim (ya implementado en el archivo pero no commiteado).

---

## Resumen

| ID | Severidad | Componente | Descripcion corta | Estado |
|----|-----------|------------|-------------------|--------|
| 01 | CRITICAL | Scheduler | Race condition → doble resolucion, UP siempre gana | FIXED — atomic claim con updateMany |
| 02 | CRITICAL | Scheduler | finalPrice = strikePrice para single-bettor | FIXED — siempre fetch precio real |
| 03 | CRITICAL | WebSocket | wallet:refund broadcast a todos | MITIGATED — frontend filtra por wallet (BUG-04) |
| 04 | CRITICAL | Frontend | useNotifications no filtra refund por wallet | FIXED — compara walletAddress |
| 05 | CRITICAL | API | confirm-deposit no verifica pool status | FIXED — check status === JOINING |
| 06 | CRITICAL | API | bet.create + pool.update no atomicos | FIXED — prisma.$transaction |
| 07 | HIGH | API | No emitPoolUpdate despues de deposit | FIXED — emitPoolUpdate con totals |
| 08 | HIGH | WebSocket | pool:status emitido doble (room + global) | FIXED — solo io.emit global |
| 09 | HIGH | Scheduler | setTimeout fragil para RESOLVED → CLAIMABLE | FIXED — processClaimableTransitions cron |
| 10 | HIGH | API | USDC_MINT defaults inconsistentes | FIXED — mismo default EPjFWdd5... |
| 11 | HIGH | Frontend | Deposit notification sin asset name | FIXED — pasa pool.asset |
| 12 | MEDIUM | Scheduler | Pools vacios → winner = UP | FIXED — no asigna winner si 0 bets |
| 13 | MEDIUM | Frontend | LiveResultsSidebar muestra pools vacios | FIXED — filtra totalPool !== '0' |
| 14 | MEDIUM | Frontend | activeWallet flickea embedded ↔ external | FIXED (prev commit) — verifica standardWallets |
| 15 | MEDIUM | Frontend | useNotifications mounts useBets sin wallet | MITIGATED — BUG-04 fix previene notifs erroneas |
| 16 | MEDIUM | Frontend | Dedup notificaciones insuficiente | FIXED — incluye message en dedup |
| 17 | LOW | API | No valida signer de TX en confirm-deposit | FIXED — verifica signers on-chain |
| 18 | LOW | Scheduler | No concurrency-safe multi-instancia | FIXED — pg_try_advisory_lock en crons |
| 19 | LOW | Scheduler | activatePool tiene misma race condition | FIXED — atomic claim con updateMany |
