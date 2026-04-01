# Theme Centralization & Light Mode Plan

> Auditoría: 156 archivos leídos, ~120 con colores hardcodeados.
> No hay Tailwind — todo es MUI sx/style + hex/rgba inline.

---

## 1. Estado Actual

### Fuentes de verdad (parciales)

| Archivo | Qué define |
|---------|-----------|
| `lib/constants.ts` | 5 colores: UP, DOWN, DRAW, GAIN, ACCENT |
| `app/providers.tsx` | MUI darkTheme palette completo |
| `app/admin/layout.tsx` | MUI theme separado para admin |
| `app/layout.tsx` | `#0B0F14` hardcoded en `<html>` |
| `tournament-utils.ts` | BG, SURFACE, BORDER, PREDICT_COLOR |
| `lib/format.ts` | Status color mappings |
| `lib/confetti.ts` | GOLD, WHITE |

**Problema:** ~120 archivos repiten colores inline. Cambiar el fondo requiere editar 30+ archivos.

---

## 2. Plan de Implementación

### Fase 1: `lib/theme.ts` — Single Source of Truth
- Crear archivo con: palette primitivos, dark tokens, light tokens, `withAlpha()` helper
- Re-exportar UP_COLOR etc. para backward compat temporal

### Fase 2: Theme Context + MUI Integration
- `ThemeModeContext` en providers.tsx con localStorage persistence
- `useThemeMode()` hook: `{ mode, toggle, setMode }`
- `useThemeTokens()` hook: devuelve tokens activos
- MUI theme generado dinámicamente desde tokens
- Admin layout usa tokens compartidos

### Fase 3: Migrar componentes (8 tiers por prioridad)

| Tier | Archivos | Descripción |
|------|----------|-------------|
| 1 | 5 | Layout & global (AppShell, Header, MobileBottomNav, Notifications) |
| 2 | 16 | Core betting UI (BetCard, BetForm, PoolCard, SideSelector, etc.) |
| 3 | 20 | Sports & tournaments (6 sports + 14 tournament) |
| 4 | 16 | Profile, leaderboard, squads |
| 5 | 15 | Charts, AI bot, misc components |
| 6 | 14 | Pages (home, docs, match, pool, etc.) |
| 7 | 11 | Admin panel |
| 8 | 3 | Utilities (format.ts, confetti.ts, tournament-utils.ts) |

### Fase 4: Theme Toggle UI
- Botón sun/moon en Header
- `transition: background-color 0.3s, color 0.3s`
- Meta theme-color dinámico

### Fase 5: Cleanup
- Eliminar colores de constants.ts, tournament-utils.ts
- Eliminar aliases (NEON_RED, CYAN, etc.)

---

## 3. Light Theme — Valores Propuestos

| Token | Dark | Light |
|-------|------|-------|
| bg.app | `#0B0F14` | `#F8FAFC` |
| bg.surface | `#111820` | `#FFFFFF` |
| bg.surfaceAlt | `#0D1219` | `#F1F5F9` |
| bg.tooltip | `#1a1f2e` | `#1E293B` (stays dark) |
| text.primary | `#FFFFFF` | `#0F172A` |
| text.secondary | `rgba(255,255,255,0.5)` | `rgba(15,23,42,0.6)` |
| border.default | `rgba(255,255,255,0.06)` | `rgba(15,23,42,0.1)` |
| up | `#4ADE80` | `#22C55E` |
| down | `#F87171` | `#EF4444` |
| gain | `#22C55E` | `#16A34A` |
| accent | `#F59E0B` | `#D97706` |

---

## 4. Riesgos

| Riesgo | Mitigación |
|--------|-----------|
| Flash of wrong theme (SSR) | Script inline en `<head>` que lee localStorage |
| Privy modal theme | Sincronizar `theme` prop con mode |
| Canvas charts | Re-render al cambiar theme |
| `${color}XX` hex alpha | `withAlpha()` helper |
| 120 archivos que editar | Migración incremental por tiers |
