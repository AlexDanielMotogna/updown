# Plan — Unify bet card design (Crypto → adopt Sports/PM "simple" look)

Estado: **PROPUESTA** (analizado, sin implementar). Branch: `feature/solana-gasless`.
Fecha: 2026-06-27. Acción SOLO en Crypto; **pool y sports NO se tocan**.

## Objetivo
El bet card de **sports/PM** (match/[id] + ThreeWaySelector) tiene un diseño simple
y limpio que gusta. El de **crypto** (`components/pool/PlaceBetCard.tsx`) usa otro
approach (radios más redondos, pesos 800, input grande con adornos, presets en grid,
payout con tooltips, botón UPPERCASE). Hay que **alinear crypto al look de sports** y,
de paso, **centralizar** los primitivos del bet form para que haya una sola fuente de
verdad de estilo.

## Hallazgo
El **selector de lado ya está unificado de facto**: `SideCard` (crypto) ≈
`ThreeWaySelector` (sports) — misma card vertical, `py 1.5`, radius `5px`, label
0.85/700, % 1rem/800, total 0.7/500. No se toca (salvo extraerlo a compartido, opcional).

## Spec objetivo (tokens del card de sports/PM)
- **Radius**: `5px` en todo (input, presets, payout box, botón).
- **Input monto**: `size="small"`, `fontSize 0.9rem`, `bgcolor t.border.subtle`, sin borde,
  placeholder "Amount (USDC)".
- **Presets**: flex row (`gap 0.5`, `flex 1`), `0.75rem`/600, `5px`, activo = `hover.emphasis`.
- **Línea balance**: `Balance: $X USDC`, `0.75rem`/600.
- **Payout box**: `bgcolor t.hover.light`, `5px`, filas "Estimated payout" (0.75 label /
  0.85·700·gain valor) + "Multiplier" (0.85).
- **Botón**: `0.8rem`/700, `5px`, `textTransform: none`, `bgcolor = sideColor`.

## Plan (Opción recomendada: centralizar primitivos + reconstruir crypto)
1. **Nuevos componentes compartidos** en `apps/web/src/components/bet/`:
   - `BetPresetRow` (presets flex, spec sports).
   - `BetAmountInput` (input simple, spec sports; prop opcional para el sufijo/placeholder).
   - `BetPayoutBox` (box "Estimated payout" + una fila secundaria configurable).
   - `BetSubmitButton` (botón spec sports: color de lado, label, spinner, estados).
   Todos tipados y sin lógica de negocio (presentacionales).
2. **Reconstruir `PlaceBetCard`** usando esos compartidos → hereda el look de sports.
   Mantener lo crypto-específico (header con AssetIcon, badge time-weight, odds) PERO
   renderizado con el estilo simple (radius 5px, pesos 700, sin uppercase). Ver decisión ↓.
3. **Sports/pool**: NO se tocan ahora. Los compartidos quedan diseñados para que sports
   pueda migrar después sin cambio visual (centralización real, follow-up opcional).

## Decisión abierta (a confirmar al accionar)
El de sports es "super simple". El de crypto tiene **info extra** (badge time-weight ×N,
"Current odds", header con icono/título, adornos $/USDC). Dos caminos:
- **A. Conservar la info crypto, solo restilizar** → mismo look (radius/pesos/botón) pero
  mantiene time-weight + odds + header. Más informativo, menos minimalista.
- **B. Stripear a "bare simple" como sports** → quitar header/time-weight/odds, dejar solo
  selector + input + presets + payout simple + botón. Idéntico de minimalista a sports,
  pero pierde el time-weight (que es feature de crypto).
Recomendación: **A** (restilizar conservando time-weight/odds, que son valor real de crypto)
— mismo "feel" simple sin perder funcionalidad. Confirmar con el usuario.

## Archivos
- NUEVO `components/bet/BetPresetRow.tsx`, `BetAmountInput.tsx`, `BetPayoutBox.tsx`, `BetSubmitButton.tsx`.
- EDIT `components/pool/PlaceBetCard.tsx` (reconstruir con los compartidos + spec sports).
- (Opcional follow-up) migrar el bet form de `app/match/[id]/page.tsx` + `MatchBetModal`/
  `CryptoPoolModal`/`LiveBetPanel` a los compartidos para single-source.

## Esfuerzo
Medio: 4 componentes pequeños + reescribir el render de PlaceBetCard. Sin lógica nueva
(misma data/handlers). Riesgo bajo (presentacional). ~media sesión + revisión visual.
