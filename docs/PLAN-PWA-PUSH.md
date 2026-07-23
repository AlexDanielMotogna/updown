# PLAN — PWA completa + Web Push

Estado: **IMPLEMENTED** (2026-07-07) en branch `feature/pwa-push` (off `main`).
Typecheck web+api+terminal ✅, lint ✅. Falta: env VAPID en Railway + prueba en dispositivo real.

## Resumen de lo implementado
- **Terminal instalable**: `apps/terminal/public/manifest.json` + `manifest`/`viewport`/`appleWebApp` en `layout.tsx`.
- **API push**: dep `web-push`, modelo `PushSubscription` + migración `20260707000000_add_push_subscriptions`,
  servicio `apps/api/src/services/webpush.ts` (`sendPushToWallet`, poda de subs 404/410, disabled si no hay VAPID),
  rutas `GET /vapid-key`, `POST /subscribe`, `POST /unsubscribe` en `routes/notifications.ts`.
- **Wiring**: push disparado desde `createNotification` (cubre rewards/torneos/refunds/bet-paid via WS)
  + `notifyPoolResolved` + `notifyPoolClaimable`. Fire-and-forget, nunca bloquea resolución.
- **Cliente web**: `apps/web/public/sw.js` (push + notificationclick, sin caché), hook
  `usePushNotifications` (máquina de estados incl. `needs-install` para iOS), helpers en `lib/api.ts`,
  toggle "Enable/Turn off" en `NotificationPanel`.
- **Env**: VAPID en `apps/api/.env(.example)` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en `apps/web/.env(.example)`.

## Pendiente (manual, no-código)
- [ ] Poner las 3 VAPID en Railway API (`VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT`) y
      `NEXT_PUBLIC_VAPID_PUBLIC_KEY` en Railway web (recordar: `NEXT_PUBLIC_*` necesita ARG/ENV en Docker).
- [ ] Migración a prod/dev DB: `prisma migrate deploy` (truco temp-dir de reference_railway_db_urls).
- [ ] Probar en Android Chrome (push directo) + iOS instalado (Add-to-Home-Screen, 16.4+).
- [ ] CSP: al añadir las security headers, permitir el SW y el push endpoint.

---

## Plan original (referencia)

## Objetivo

Convertir la PWA "a medias" actual en una PWA instalable y **notificable**:
1. `apps/terminal` instalable (hoy no tiene manifest).
2. Service worker en `apps/web` (hoy: cero).
3. Web Push enganchado a las notificaciones que **ya se persisten en DB** — mismo evento que
   hoy escribe la notificación, mañana además dispara el push.

## Qué existe hoy (auditoría 2026-07-07)

- `apps/web/public/manifest.json` ✅ (standalone, iconos 48/512 + maskable, `appleWebApp.capable`).
- `apps/terminal` — **sin manifest, sin metadata PWA**.
- Service worker — **ninguno** en todo el repo (sin `next-pwa`/workbox/serwist).
- Notificaciones ya centralizadas en `apps/api/src/services/notifications.ts`:
  - `createNotification()` (single) y `prisma.notification.createMany()` (bulk).
  - Modelo `Notification` en `schema.prisma:858` (keyed por `walletAddress`).
  - Ruta `apps/api/src/routes/notifications.ts` (auth simple por `wallet` param, sin firma).
- **No** hay dependencias de push (`web-push`, VAPID) en ningún package.json.

## Decisión de arquitectura: SW manual, no next-pwa

Una app de betting en tiempo real **no gana nada con caché offline** (offline = inútil). Lo único
que necesitamos del SW es `push` + `notificationclick`. Meter `next-pwa`/Workbox añade precaching
que **pelearía con el sistema VersionGate/`BUILD_ID`** existente (`apps/web/next.config.js` ya
gestiona bundles stale por git SHA). Por eso: **service worker mínimo escrito a mano**, sin Workbox.

⚠️ **iOS**: Web Push en iOS solo funciona si la PWA está **instalada** (Add to Home Screen) y en
iOS 16.4+. En Safari-navegador normal NO hay push. Hay que gestionar el prompt de permiso solo
tras instalar, y mostrar un hint de "instala para recibir avisos".

---

## Fase 0 — Setup (5 min)
- [ ] `git checkout -b feature/pwa-push` desde `main` (evita chocar con el chat de worldcup que
      tiene `MatchRow.tsx` sin commitear).

## Fase 1 — Terminal instalable (~30 min, sin riesgo)
- [ ] Crear `apps/terminal/public/manifest.json` (copiar el de web, cambiar `name`/`start_url` a
      la home del terminal, mismos iconos `/updown-logos/*`).
- [ ] Añadir `manifest`, `themeColor`, `appleWebApp` a la metadata de `apps/terminal/src/app/layout.tsx`
      (hoy no los tiene).
- **Entregable**: trade.updown.my instalable a pantalla de inicio.

## Fase 2 — Infra de Push en la API (~1 día)
- [ ] `pnpm --filter api add web-push` (+ `@types/web-push`).
- [ ] Generar par VAPID una vez (`npx web-push generate-vapid-keys`). Guardar en env:
      `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:...`.
- [ ] Modelo Prisma nuevo (una wallet = varios dispositivos = varias subs):
      ```prisma
      model PushSubscription {
        id            String   @id @default(uuid())
        walletAddress String   @map("wallet_address")
        endpoint      String   @unique
        p256dh        String
        auth          String
        userAgent     String?  @map("user_agent")
        createdAt     DateTime @default(now()) @map("created_at")
        @@index([walletAddress])
        @@map("push_subscriptions")
      }
      ```
  - [ ] `prisma migrate dev` (local) → `migrate deploy` (dev/prod vía el truco de temp-dir).
- [ ] Servicio `apps/api/src/services/webpush.ts`:
      - `sendPushToWallet(wallet, { title, body, url, tag })` → busca subs, envía con `web-push`,
        y **borra subs que devuelven 404/410** (expiradas).
- [ ] Rutas en `notifications.ts`:
      - `GET  /api/notifications/vapid-key` → devuelve la public key (para el cliente).
      - `POST /api/notifications/subscribe` `{ wallet, subscription }` → upsert por endpoint.
      - `POST /api/notifications/unsubscribe` `{ endpoint }`.

## Fase 3 — Enganchar push a los eventos (~medio día)
- [ ] En `services/notifications.ts`, tras cada escritura a DB, disparar push (fire-and-forget,
      nunca bloquear la resolución de pools):
      - `createNotification()` → 1 push a esa wallet.
      - `notifyPoolResolved()` / `notifyPoolClaimable()` → push por wallet del batch.
      - `notifyBetPaid()` → push "You won $X".
      Patrón: envolver en `void sendPushToWallet(...).catch(...)`, igual que hoy con los errores.
- [ ] El `url` del push apunta al pool (`/pool/:id` o la ruta que use el detalle) para deep-link
      al abrir.

## Fase 4 — Cliente web (SW + suscripción) (~1 día)
- [ ] `apps/web/public/sw.js` (vanilla, ~40 líneas): handlers `push` (muestra notificación) y
      `notificationclick` (abre/enfoca la `url`). Sin caché.
- [ ] `apps/web/src/hooks/usePushNotifications.ts`:
      - Registrar SW, `Notification.requestPermission()`, `pushManager.subscribe({ userVisibleOnly,
        applicationServerKey })` con la VAPID public key, POST a `/subscribe`.
      - Detectar iOS-no-instalado y devolver estado `needs-install`.
- [ ] UI de opt-in: botón/toggle "Activar avisos" en el panel de notificaciones existente
      (no pedir permiso al cargar — pedirlo tras una acción del usuario, p.ej. tras su primer bet).
- [ ] Hint de "Instala la app para recibir avisos" cuando `needs-install`.

## Fase 5 — Prod / cierre
- [ ] Env vars VAPID en Railway (web: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; api: las 3 VAPID).
      Recordatorio deploy-perf: `NEXT_PUBLIC_*` necesita ARG/ENV en Docker o se hornea `undefined`.
- [ ] CSP: cuando se añadan las security headers pendientes
      ([project_privy_prod_security_headers]), el SW y el push endpoint deben quedar permitidos.
- [ ] Verificar en dispositivo real: Android Chrome (push directo) + iOS instalado (push solo PWA).

## Fuera de alcance (a propósito)
- Caché offline / precaching (inútil para betting en tiempo real; además choca con VersionGate).
- Wrapper nativo (Capacitor) → decisión aparte cuando se quiera estar en las stores.
- Web push en el terminal (fase 2ª; el terminal usa HL, notificaciones distintas).

## Estimación total
Terminal manifest ½ día · Push infra API 1 día · Wiring ½ día · Cliente web 1 día · prod ½ día
≈ **3-4 días** de trabajo real.
