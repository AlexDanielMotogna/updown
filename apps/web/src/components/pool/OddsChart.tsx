'use client';

/**
 * Dual/triple line probability chart powered by TradingView Lightweight
 * Charts. Replaces ~600 lines of hand-rolled SVG that paid every tick in
 * React reconciles and never got the y-scale animation right.
 *
 * Public props are unchanged so call sites (MarketCard, FeaturedHero,
 * /pool/[id], /match/[id]) don't have to be touched.
 *
 * Each side is rendered as an Area series so the percentages read as
 * filled probability ribbons (Kalshi/Polymarket house style). The chart
 * handles its own crosshair, time axis, value axis, and y-scale tween;
 * we just wire data in via setData / update.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Box, Typography, CircularProgress, IconButton, Popover } from '@mui/material';
import { Settings } from '@mui/icons-material';
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type AreaData,
  type UTCTimestamp,
  CrosshairMode,
  LineStyle,
  LineType,
  LastPriceAnimationMode,
} from 'lightweight-charts';
import { getSocket, connectSocket } from '@/lib/socket';
import { useThemeTokens } from '@/app/providers';

interface OddsPoint {
  t: number;        // seconds since epoch
  p: number;        // up share (0..1)
  down?: number;    // 3-way pools only
  draw?: number;    // 3-way pools only
}

type Source = 'polymarket' | 'updown';

interface OddsChartProps {
  poolId: string;
  question?: string | null;
  currentOdds?: number | null;
  totalUp?: string;
  totalDown?: string;
  /** 3-way pools pass the draw stake so the chart's percentages use the
   *  full pool denominator and match what the cards show. */
  totalDraw?: string;
  /** Lock the data source (hides the source toggle). */
  lockSource?: Source;
  /** Hide the header controls (used by the trending hero card). */
  hideControls?: boolean;
  /** When the pool has no bets yet, seed a gentle baseline curve so the
   *  chart still renders instead of an empty-state placeholder. */
  seedDefault?: boolean;
  /** 3-way pool (sports home/draw/away) - render a third area for draw. */
  threeWay?: boolean;
  /** Inline labels next to each outcome on the legend. */
  labels?: { up?: string; down?: string; draw?: string };
  /** Crests / icon URLs to render inside the hover tooltip - team
   *  badges for sports, the question thumbnail for PM, an asset icon
   *  for crypto. Each side is optional; missing icons render a coloured
   *  dot fallback so the tooltip never breaks. */
  icons?: { up?: string | null; down?: string | null; draw?: string | null };
  /** Background colour the chart is rendered on top of. Used by the
   *  "future dim" hover overlay, the crosshair marker cutout and the
   *  loading/empty overlays so they blend into the surrounding surface.
   *  Defaults to the page background (t.bg.app) - the /match page case.
   *  The trending hero card sits on t.bg.surface and passes that so the
   *  hover shadow matches its own card colour instead of the page. */
  surfaceColor?: string;
  /** Spread the series edge-to-edge (fitContent) instead of anchoring the
   *  right edge to "now". Used by the wide trending hero so the line fills
   *  the full chart width instead of leaving a flat seeded gap on the left. */
  fitData?: boolean;
}

const CHART_H = 300;
const MAX_UPDOWN_POINTS = 100;

function formatPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function toUtc(seconds: number): UTCTimestamp {
  return Math.floor(seconds) as UTCTimestamp;
}

export function OddsChart({
  poolId,
  totalUp,
  totalDown,
  totalDraw,
  lockSource,
  hideControls,
  seedDefault,
  threeWay,
  labels,
  icons,
  surfaceColor,
  fitData,
}: OddsChartProps) {
  const t = useThemeTokens();
  // The colour the chart blends into (hover dim, crosshair cutout, overlays).
  // Defaults to the page background; surfaces like the hero card override it.
  const dimBg = surfaceColor ?? t.bg.app;
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const upSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const downSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const drawSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const [pmHistory, setPmHistory] = useState<OddsPoint[]>([]);
  const [udHistory, setUdHistory] = useState<OddsPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source>(lockSource ?? 'updown');
  const [showUp, setShowUp] = useState(true);
  const [showDown, setShowDown] = useState(true);
  const [showDraw, setShowDraw] = useState(true);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);
  // Pixel-Y of each visible series' last data point, recomputed any time
  // Pixel coords of each series' last data point ("the tip of the line")
  // plus its X - used to render the per-line endpoint badges. The y-axis
  // never collides with the badge because `timeScale.rightOffset` is set
  // high enough to keep the line tip permanently away from the right
  // edge; we don't need any flip/clamp gymnastics on the badge itself.
  const [endpointCoords, setEndpointCoords] = useState<{
    x?: number;
    up?: number;
    down?: number;
    draw?: number;
  }>({});

  // Width / height of the chart's axis gutters - used to constrain the
  // "future dim" hover overlay so it only covers the plot area (the
  // canvas) and never bleeds over the y-axis tick labels on the right or
  // the x-axis tick labels at the bottom.
  const [axisInsets, setAxisInsets] = useState<{ right: number; bottom: number }>({ right: 0, bottom: 0 });

  // Hover state - per-line Y at the cursor X (so each line can paint its
  // own little badge stuck to its own curve, not a single combined card).
  // We pre-compute every Y inside the crosshair callback because LWC's
  // priceToCoordinate isn't reactive and we want the badges to track the
  // crosshair magnet, not the raw cursor position.
  const [hoverState, setHoverState] = useState<
    | {
        x: number;
        ts?: number;
        upValue?: number;
        upY?: number;
        downValue?: number;
        downY?: number;
        drawValue?: number;
        drawY?: number;
      }
    | null
  >(null);

  // ── Polymarket data: fetch + 30s refresh ────────────────────────────
  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    const fetchHistory = () => {
      fetch(`${API}/api/pools/${poolId}/odds-history?interval=max&fidelity=60`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.data?.history) setPmHistory(data.data.history);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    fetchHistory();
    const iv = setInterval(fetchHistory, 30_000);
    return () => clearInterval(iv);
  }, [poolId]);

  // ── UpDown data: real cumulative-odds curve from the bet stream ─────
  // Server derives the curve from the bet table: anchor at startTime − 5m
  // at the default share, then one point per bet at running cumulative
  // share. Live WS ticks below append the latest point in the same shape.
  //
  // Fallbacks (we ALWAYS end up with at least 2 points so the chart never
  // sits as an empty box):
  //   1. API responds with non-empty history → use it.
  //   2. API responds with `[]` → flat baseline at the default share.
  //   3. fetch throws (API down, network) → same flat baseline.
  useEffect(() => {
    if (!poolId) return;
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    let cancelled = false;
    const seedFlat = () => {
      const defShare = threeWay ? 1 / 3 : 0.5;
      const now = Math.floor(Date.now() / 1000);
      setUdHistory([
        { t: now - 300, p: defShare, ...(threeWay && { down: defShare, draw: defShare }) },
        { t: now, p: defShare, ...(threeWay && { down: defShare, draw: defShare }) },
      ]);
    };
    fetch(`${API}/api/pools/${poolId}/bets-odds-history`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const hist = data?.data?.history;
        if (data?.success && Array.isArray(hist) && hist.length >= 2) {
          setUdHistory(hist as OddsPoint[]);
        } else if (seedDefault) {
          seedFlat();
        }
      })
      .catch(() => {
        // API down / CORS / network error - still draw a baseline if the
        // caller opted in. Without this the chart used to render as an
        // empty box on offline / cold-API loads.
        if (!cancelled && seedDefault) seedFlat();
      });
    return () => { cancelled = true; };
  }, [poolId, seedDefault, threeWay]);

  // ── UpDown data: WebSocket live updates ─────────────────────────────
  const addUdPoint = useCallback((up: number, down: number, draw: number = 0) => {
    const total = up + down + draw;
    if (total === 0) return;
    setUdHistory(prev => {
      const pUp = up / total;
      const nowSec = Math.floor(Date.now() / 1000);
      const point: OddsPoint = { t: nowSec, p: pUp };
      if (threeWay) {
        point.down = down / total;
        point.draw = draw / total;
      }
      const last = prev[prev.length - 1];
      // LWC requires STRICTLY ascending timestamps. Two updates in the
      // same wall-clock second (seed + first prop tick, or two fast WS
      // events) used to throw "data must be asc ordered" because we just
      // appended. Replace the tail when its second-resolution timestamp
      // matches; only push when the clock has actually advanced.
      if (last) {
        const lastSec = Math.floor(last.t);
        if (lastSec === nowSec) {
          const replaced = prev.slice(0, -1).concat([point]);
          return replaced;
        }
        // Also dedupe by value when nothing materially changed - there's
        // no point appending a third 50% on a quiet market.
        if (Math.abs(last.p - pUp) < 0.001) return prev;
      }
      const next = [...prev, point];
      return next.length > MAX_UPDOWN_POINTS ? next.slice(-MAX_UPDOWN_POINTS) : next;
    });
  }, [threeWay]);

  useEffect(() => {
    if (!poolId) return;
    const socket = getSocket();
    connectSocket();
    const onUpdate = (data: { id: string; totalUp: string; totalDown: string; totalDraw?: string }) => {
      if (data.id !== poolId) return;
      addUdPoint(Number(data.totalUp), Number(data.totalDown), Number(data.totalDraw || 0));
    };
    socket.on('pool:updated', onUpdate);
    return () => { socket.off('pool:updated', onUpdate); };
  }, [poolId, addUdPoint]);

  useEffect(() => {
    addUdPoint(Number(totalUp || 0), Number(totalDown || 0), Number(totalDraw || 0));
  }, [totalUp, totalDown, totalDraw, addUdPoint]);

  // Source selection with cross-fallback: if the user is on Polymarket
  // but that side has no data (pool not connected to a CLOB market, or
  // upstream API down), silently render the UpDown bet stream so the
  // chart never sits empty just because one of the two sources came
  // back blank. Same trick the other way around. useMemo is mandatory
  // here - without it `history` is a fresh array reference every render
  // and the upData/downData memos thrash, which in turn re-fires the
  // setData effect and quietly tanks the chart.
  const history = useMemo<OddsPoint[]>(() => {
    if (source === 'polymarket') {
      return pmHistory.length > 0 ? pmHistory : udHistory;
    }
    return udHistory.length > 0 ? udHistory : pmHistory;
  }, [source, pmHistory, udHistory]);
  const isLive = source === 'updown';

  // Resolved here (early) so the chart's series-config effect can use them
  // for the inline "Yes 65% / No 35%" axis tags. Falls back to the
  // probability-market defaults when the caller doesn't supply names.
  const upLabel = labels?.up ?? 'Yes';
  const downLabel = labels?.down ?? 'No';
  const drawLabel = labels?.draw ?? 'Draw';

  // ── Memoised LWC datasets ───────────────────────────────────────────
  // Defensive dedupe: collapse equal-second points to a single entry
  // (keeping the *last* value seen). Polymarket history is well-sorted but
  // can repeat seconds; our own seed + first prop tick can also collide
  // on the same wall-clock second. LWC throws "data must be asc ordered"
  // when timestamps repeat, so we normalise here once instead of guarding
  // at every callsite.
  const buildAreaData = (project: (h: OddsPoint) => number): AreaData[] => {
    const out: AreaData[] = [];
    let prevSec = -1;
    for (const h of history) {
      const sec = Math.floor(h.t);
      const value = project(h);
      // Same second → overwrite the tail (last write wins).
      if (sec === prevSec) {
        out[out.length - 1] = { time: toUtc(sec), value };
        continue;
      }
      // Out-of-order point → drop it. LWC's strict-ascending invariant
      // would otherwise blow up the chart.
      if (sec < prevSec) continue;
      out.push({ time: toUtc(sec), value });
      prevSec = sec;
    }
    // Extend the line all the way to "now" by repeating the last value at
    // the current timestamp. Without this, the chart dead-ends at the
    // last bet's time and the right half of the panel looks empty -
    // Polymarket holds the line flat to "now" so the reading always
    // matches the current displayed percentage.
    if (out.length > 0) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec > prevSec + 1) {
        out.push({ time: toUtc(nowSec), value: out[out.length - 1].value });
      }
    }
    return out;
  };
  const upData = useMemo<AreaData[]>(
    () => buildAreaData(h => h.p),
    [history],
  );
  const downData = useMemo<AreaData[]>(
    () => buildAreaData(h => h.down ?? (1 - h.p)),
    [history],
  );
  const drawData = useMemo<AreaData[]>(
    () => (threeWay ? buildAreaData(h => h.draw ?? 0) : []),
    [history, threeWay],
  );

  // ── Create chart once ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: t.text.dimmed,
        fontFamily: 'var(--font-satoshi), "Satoshi", -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 10,
        // Drop the TradingView attribution badge - Polymarket / Kalshi
        // ship a clean chart, ours should too.
        attributionLogo: false,
      },
      // Global price formatter for the y-axis ticks. The right-edge
      // 0 / 0.25 / 0.5 / 0.75 / 1 grid would otherwise read as raw
      // decimals; this turns them into "0% / 25% / 50% / 75% / 100%"
      // to match the per-series labels.
      localization: {
        priceFormatter: (price: number) => `${Math.round(price * 100)}%`,
        // Time scale labels go to mono numerics so 17:49 / 18:04 align
        // vertically the way every modern fintech axis does.
        timeFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        },
      },
      // Grid off - Polymarket / Kalshi don't draw vertical or horizontal
      // gridlines on their probability charts. The y-axis tick labels are
      // enough of an anchor for the eye.
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        // Normal mode hugs the actual cursor rather than snapping to the
        // nearest bar - feels less twitchy on a thin probability series
        // with only a handful of points.
        mode: CrosshairMode.Normal,
        vertLine: {
          color: t.border.strong,
          width: 1,
          style: LineStyle.Solid,
          labelVisible: true,
          labelBackgroundColor: t.bg.surfaceAlt,
        },
        horzLine: {
          color: t.border.strong,
          width: 1,
          style: LineStyle.Dotted,
          labelBackgroundColor: t.bg.surfaceAlt,
        },
      },
      rightPriceScale: {
        // Borderless price axis - the labels alone do the work, no rule.
        borderVisible: false,
        // Generous top/bottom margins so the lines never kiss the edges
        // and the area gradient has room to fade out cleanly.
        scaleMargins: { top: 0.12, bottom: 0.12 },
        autoScale: true,
        // Wide enough for the "Yes 65%" / "No 35%" inline tags Kalshi
        // and Polymarket put at the end of each line.
        minimumWidth: 60,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        // Permanent gap between the last data point and the y-axis so
        // the endpoint badge always has room.
        rightOffset: 80,
        // Lighter labels (every other tick) to match the Polymarket pace.
        minBarSpacing: 4,
        // Tick label formatter - LWC defaults to UTC for the X axis ticks
        // even when localization.timeFormatter is set (that one only
        // affects the crosshair label). Without this override the bottom
        // axis would render UTC times while the hover tooltip showed
        // local time - confusing and inconsistent. We branch on tick type
        // so "MMM d" reads as a day at long zoom-out and "HH:mm" reads as
        // a time at intra-day zoom.
        tickMarkFormatter: (time: number, tickMarkType: number) => {
          const d = new Date(time * 1000);
          // TickMarkType: 0=Year, 1=Month, 2=DayOfMonth, 3=Time, 4=TimeWithSeconds
          if (tickMarkType >= 3) {
            return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
          }
          if (tickMarkType === 2) {
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          }
          if (tickMarkType === 1) {
            return d.toLocaleDateString(undefined, { month: 'short' });
          }
          return d.getFullYear().toString();
        },
      },
      autoSize: true,
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    // Subscribe to crosshair: we render one floating badge per line
    // (Polymarket-style "the badge follows its own curve") rather than
    // the single combined card. To do that we resolve each line's
    // pixel-Y *at the magnet-snapped point* here, since
    // priceToCoordinate is not reactive and we need it inside the
    // callback anyway.
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.time == null) {
        setHoverState(null);
        return;
      }
      const next: {
        x: number;
        ts?: number;
        upValue?: number; upY?: number;
        downValue?: number; downY?: number;
        drawValue?: number; drawY?: number;
      } = {
        x: param.point.x,
        ts: typeof param.time === 'number' ? param.time : undefined,
      };
      const safeY = (series: ISeriesApi<'Area'> | null, value: number | undefined) => {
        if (!series || value == null) return undefined;
        try {
          const y = series.priceToCoordinate(value);
          return y != null && Number.isFinite(y) ? y : undefined;
        } catch {
          return undefined;
        }
      };
      if (upSeriesRef.current) {
        const d = param.seriesData.get(upSeriesRef.current) as AreaData | undefined;
        if (d) {
          next.upValue = d.value;
          next.upY = safeY(upSeriesRef.current, d.value);
        }
      }
      if (downSeriesRef.current) {
        const d = param.seriesData.get(downSeriesRef.current) as AreaData | undefined;
        if (d) {
          next.downValue = d.value;
          next.downY = safeY(downSeriesRef.current, d.value);
        }
      }
      if (drawSeriesRef.current) {
        const d = param.seriesData.get(drawSeriesRef.current) as AreaData | undefined;
        if (d) {
          next.drawValue = d.value;
          next.drawY = safeY(drawSeriesRef.current, d.value);
        }
      }
      setHoverState(next);
    });

    return () => {
      upSeriesRef.current = null;
      downSeriesRef.current = null;
      drawSeriesRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mirror theme tweaks without re-creating the chart ───────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: { textColor: t.text.tertiary },
      grid: { vertLines: { color: t.border.subtle }, horzLines: { color: t.border.subtle } },
      rightPriceScale: { borderColor: t.border.subtle },
      timeScale: { borderColor: t.border.subtle },
    });
  }, [t.text.tertiary, t.border.subtle]);

  // ── Series attach/detach for each side, gated by show flags ─────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Shared options for every probability series - Kalshi/Polymarket
    // signature is the stairs-shaped step line (each trade is a discrete
    // jump, not a smoothed curve), the percent-formatted axis tag at the
    // endpoint, and the continuous last-value pulse for liveness.
    //
    // priceFormat MUST be 'custom' here, not 'percent'. LWC's 'percent'
    // type means "percent change from the first bar" (a TradingView-style
    // PnL formatter) - passing it 0..1 probability values made the axis
    // tag and crosshair label render NaN. The custom formatter just
    // multiplies the raw probability by 100 and rounds - exactly what
    // every Polymarket/Kalshi chart does.
    const pctFormatter = (p: number) => `${Math.round(p * 100)}%`;
    const probSeriesOptions = (color: string) => ({
      lineColor: color,
      // Two-stop gradient that fades to nothing at the bottom - the
      // signature soft glow you see on Limitless / Polymarket charts.
      // Heavier top (alpha 33 ≈ 0.20) keeps the leading edge readable,
      // bottom (alpha 00) lets the surface bleed through.
      topColor: `${color}33`,
      bottomColor: `${color}00`,
      lineWidth: 2 as const,
      // Step lines - the Kalshi / Polymarket signature. Every bet is a
      // discrete event so the curve should jump vertically at the
      // moment a trade lands rather than interpolate smoothly across the
      // gap. Reads as a "ledger of decisions" rather than a continuous
      // flow.
      lineType: LineType.WithSteps,
      // No title / lastValueVisible - we render our own endpoint badges
      // in HTML so we can put a team crest next to the percentage.
      priceLineVisible: false,
      lastValueVisible: false,
      // Hollow marker dot with a cutout border in the chart background -
      // the dot reads as a punched hole on the line rather than a blob.
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerBorderColor: dimBg,
      crosshairMarkerBackgroundColor: color,
      lastPriceAnimation: LastPriceAnimationMode.Continuous,
      priceFormat: {
        type: 'custom' as const,
        formatter: pctFormatter,
        minMove: 0.01,
      },
    });

    // UP
    if (showUp && !upSeriesRef.current) {
      upSeriesRef.current = chart.addSeries(AreaSeries, probSeriesOptions(t.up));
    } else if (!showUp && upSeriesRef.current) {
      chart.removeSeries(upSeriesRef.current);
      upSeriesRef.current = null;
    } else if (showUp && upSeriesRef.current) {
      // Keep the visible label fresh when the consumer changes `labels`
      // mid-mount (e.g. team name resolves after the initial render).
      upSeriesRef.current.applyOptions(probSeriesOptions(t.up));
    }

    // DOWN
    if (showDown && !downSeriesRef.current) {
      downSeriesRef.current = chart.addSeries(AreaSeries, probSeriesOptions(t.down));
    } else if (!showDown && downSeriesRef.current) {
      chart.removeSeries(downSeriesRef.current);
      downSeriesRef.current = null;
    } else if (showDown && downSeriesRef.current) {
      downSeriesRef.current.applyOptions(probSeriesOptions(t.down));
    }

    // DRAW (3-way only)
    if (threeWay && showDraw && !drawSeriesRef.current) {
      drawSeriesRef.current = chart.addSeries(AreaSeries, probSeriesOptions(t.draw));
    } else if ((!threeWay || !showDraw) && drawSeriesRef.current) {
      chart.removeSeries(drawSeriesRef.current);
      drawSeriesRef.current = null;
    } else if (threeWay && showDraw && drawSeriesRef.current) {
      drawSeriesRef.current.applyOptions(probSeriesOptions(t.draw));
    }
  }, [showUp, showDown, showDraw, threeWay, t.up, t.down, t.draw, upLabel, downLabel, drawLabel]);

  // ── Push data + autofit on each refresh ─────────────────────────────
  useEffect(() => {
    try {
      if (upSeriesRef.current) upSeriesRef.current.setData(upData);
      if (downSeriesRef.current) downSeriesRef.current.setData(downData);
      if (drawSeriesRef.current) drawSeriesRef.current.setData(drawData);
    } catch (err) {
      // LWC throws synchronously on assertions like "data must be asc
      // ordered". Catching here keeps the chart alive so a stray bad
      // point doesn't blank the whole panel.
      console.warn('[OddsChart] setData failed:', err);
    }

    // Extend the visible X range from the first data point to *now*.
    // fitContent() ends at the last data point - when Polymarket's last
    // tick is a few hours old (their CLOB returns one row per hour), the
    // chart used to dead-end mid-screen and look "half-empty". Anchoring
    // the right edge to nowSec instead matches Polymarket / Kalshi's
    // "still at this percentage as of right now" feel. We bracket with
    // try/catch + an explicit `from < to` guard so a bad pair never
    // crashes LWC's strict assertions.
    try {
      const chart = chartRef.current;
      const firstTime = upData[0]?.time;
      if (chart && fitData) {
        // Wide hero: skip the flat seeded lead-in (no bets yet) and spread the
        // real movement edge-to-edge so the line fills the whole width.
        const base = upData[0]?.value;
        const moveIdx = upData.findIndex(p => p.value !== base);
        const from = moveIdx > 0 ? upData[moveIdx - 1].time : upData[0]?.time;
        const to = upData[upData.length - 1]?.time;
        if (from != null && to != null && Number(to) > Number(from)) {
          chart.timeScale().setVisibleRange({ from, to });
        } else {
          chart.timeScale().fitContent();
        }
      } else if (chart && firstTime != null) {
        const nowSec = Math.floor(Date.now() / 1000) as UTCTimestamp;
        if (Number(nowSec) > Number(firstTime)) {
          chart.timeScale().setVisibleRange({ from: firstTime, to: nowSec });
        } else {
          chart.timeScale().fitContent();
        }
      }
    } catch (err) {
      console.warn('[OddsChart] setVisibleRange failed, falling back to fitContent:', err);
      try { chartRef.current?.timeScale().fitContent(); } catch { /* ignore */ }
    }

    // Pixel-Y of each line's last point - computed via the series'
    // priceToCoordinate. LWC computes the price scale lazily after
    // setData, and on larger series (e.g. 700+ Polymarket points) the
    // first RAF is too early - priceToCoordinate returns null and the
    // endpoint badges never appear. We schedule TWO measure passes: one
    // on the next frame for the seed/short-data path, and a backup at
    // 200ms for the heavy data path. Each pass overwrites the previous
    // result, so a successful late measure beats an early null.
    const measureOnce = () => {
      const next: { x?: number; up?: number; down?: number; draw?: number } = {};
      const safeY = (series: ISeriesApi<'Area'> | null, val: number | undefined) => {
        if (!series || val == null) return null;
        try {
          const y = series.priceToCoordinate(val);
          return y != null && Number.isFinite(y) ? y : null;
        } catch {
          return null;
        }
      };
      const lastUp = upData[upData.length - 1];
      const lastDown = downData[downData.length - 1];
      const lastDraw = drawData[drawData.length - 1];
      const lastTime = lastUp?.time ?? lastDown?.time ?? lastDraw?.time;
      if (lastTime != null && chartRef.current) {
        try {
          const x = chartRef.current.timeScale().timeToCoordinate(lastTime);
          if (x != null && Number.isFinite(x)) next.x = x;
        } catch { /* skip */ }
      }
      const yUp = safeY(upSeriesRef.current, lastUp?.value);
      const yDown = safeY(downSeriesRef.current, lastDown?.value);
      const yDraw = safeY(drawSeriesRef.current, lastDraw?.value);
      if (yUp != null) next.up = yUp;
      if (yDown != null) next.down = yDown;
      if (yDraw != null) next.draw = yDraw;
      setEndpointCoords(prev => {
        if (prev.x === next.x && prev.up === next.up && prev.down === next.down && prev.draw === next.draw) return prev;
        return next;
      });
      // Capture axis gutter sizes too so the past-dim overlay can avoid
      // them. LWC owns the layout so we ask it directly rather than
      // hard-coding magic px values.
      if (chartRef.current) {
        try {
          const rightW = chartRef.current.priceScale('right').width();
          const bottomH = chartRef.current.timeScale().height();
          setAxisInsets(prev => {
            if (prev.right === rightW && prev.bottom === bottomH) return prev;
            return { right: Number.isFinite(rightW) ? rightW : 0, bottom: Number.isFinite(bottomH) ? bottomH : 0 };
          });
        } catch { /* skip */ }
      }
    };
    const raf = requestAnimationFrame(measureOnce);
    const t1 = window.setTimeout(measureOnce, 200);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
    };
  }, [upData, downData, drawData]);

  // Recompute endpoint coords on container resize - the chart re-lays-out
  // internally, so our pixel coords are stale until we ask again.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const next: { x?: number; up?: number; down?: number; draw?: number } = {};
      const lastUp = upData[upData.length - 1];
      const lastDown = downData[downData.length - 1];
      const lastDraw = drawData[drawData.length - 1];
      const lastTime = lastUp?.time ?? lastDown?.time ?? lastDraw?.time;
      if (lastTime != null && chartRef.current) {
        try {
          const x = chartRef.current.timeScale().timeToCoordinate(lastTime);
          if (x != null && Number.isFinite(x)) next.x = x;
        } catch { /* skip */ }
      }
      if (upSeriesRef.current && lastUp?.value != null) {
        const y = upSeriesRef.current.priceToCoordinate(lastUp.value);
        if (y != null && Number.isFinite(y)) next.up = y;
      }
      if (downSeriesRef.current && lastDown?.value != null) {
        const y = downSeriesRef.current.priceToCoordinate(lastDown.value);
        if (y != null && Number.isFinite(y)) next.down = y;
      }
      if (drawSeriesRef.current && lastDraw?.value != null) {
        const y = drawSeriesRef.current.priceToCoordinate(lastDraw.value);
        if (y != null && Number.isFinite(y)) next.draw = y;
      }
      setEndpointCoords(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [upData, downData, drawData]);

  // ── Header readout values ───────────────────────────────────────────
  const last = history.length > 0 ? history[history.length - 1] : null;
  const readout = hoverState
    ? { up: hoverState.upValue, down: hoverState.downValue, draw: hoverState.drawValue, ts: hoverState.ts }
    : (last ? { up: last.p, down: last.down ?? (1 - last.p), draw: last.draw, ts: last.t } : null);

  // NOTE: do not early-return the spinner here. The chart-creation effect
  // runs after the chart's `containerRef` lands in the DOM; an early return
  // means the container never mounts on first render, the effect sees a
  // null ref, and it never re-runs (empty deps). We render the container
  // unconditionally and overlay both the spinner and the "no data"
  // placeholder via absolute positioning further down.
  const showInitialSpinner = loading && source === 'polymarket' && history.length === 0;

  return (
    <Box>
      {!hideControls && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {/* Source toggle. UpDown first + active by default; the external
                odds curve is surfaced as "Market sentiment" (we don't brand a
                competitor on our own chart). Hidden when locked. */}
            {!lockSource && (
              <Box sx={{ display: 'flex', bgcolor: t.border.subtle, borderRadius: '6px', overflow: 'hidden' }}>
                {(['updown', 'polymarket'] as const).map(s => (
                  <Box
                    key={s}
                    onClick={() => setSource(s)}
                    sx={{
                      px: 1.5, py: 0.5, cursor: 'pointer',
                      fontSize: '0.65rem', fontWeight: 700,
                      color: source === s ? t.text.primary : t.text.dimmed,
                      bgcolor: source === s ? t.border.strong : 'transparent',
                      transition: 'all 0.15s',
                      '&:hover': { bgcolor: t.border.default },
                    }}
                  >
                    {s === 'polymarket' ? 'Market sentiment' : 'UpDown'}
                  </Box>
                ))}
              </Box>
            )}
            {isLive && (
              <>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: t.up, animation: 'oddsPulse 1.5s infinite', '@keyframes oddsPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
                <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, color: t.text.muted }}>LIVE</Typography>
              </>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {readout && (
              <>
                <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: t.up, fontVariantNumeric: 'tabular-nums' }}>
                  {formatPct(readout.up ?? 0)}
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.down, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                  {formatPct(readout.down ?? 1 - (readout.up ?? 0))}
                </Typography>
                {threeWay && readout.draw != null && (
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.draw, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>
                    {formatPct(readout.draw)}
                  </Typography>
                )}
              </>
            )}
            <IconButton
              size="small"
              onClick={(e) => setSettingsAnchor(settingsAnchor ? null : e.currentTarget)}
              sx={{ color: t.text.muted, p: 0.5, '&:hover': { color: t.text.secondary } }}
            >
              <Settings sx={{ fontSize: 16 }} />
            </IconButton>
            <Popover
              open={!!settingsAnchor}
              anchorEl={settingsAnchor}
              onClose={() => setSettingsAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              PaperProps={{ sx: { bgcolor: t.bg.chart, border: `1px solid ${t.border.medium}`, borderRadius: '8px', p: 1.5, minWidth: 140 } }}
            >
              {[
                { label: upLabel, color: t.up, active: showUp, toggle: () => setShowUp(v => !v) },
                { label: downLabel, color: t.down, active: showDown, toggle: () => setShowDown(v => !v) },
                ...(threeWay ? [{ label: drawLabel, color: t.draw, active: showDraw, toggle: () => setShowDraw(v => !v) }] : []),
              ].map(opt => (
                <Box
                  key={opt.label}
                  onClick={opt.toggle}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1, py: 0.75, px: 0.5, cursor: 'pointer',
                    borderRadius: '4px', '&:hover': { bgcolor: t.border.subtle },
                  }}
                >
                  <Box sx={{
                    width: 14, height: 14, borderRadius: '3px',
                    border: `2px solid ${opt.color}`,
                    bgcolor: opt.active ? opt.color : 'transparent',
                    opacity: opt.active ? 1 : 0.3,
                    transition: 'all 0.15s',
                  }} />
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: opt.active ? t.text.primary : t.text.dimmed }}>
                    {opt.label}
                  </Typography>
                </Box>
              ))}
            </Popover>
          </Box>
        </Box>
      )}

      {/* Chart canvas - the container ALWAYS mounts so LWC can create the
          chart on first paint; the "no data" placeholder layers on top via
          absolute positioning until the first datapoint lands. Mounting the
          ref conditionally was the bug behind "trending sports renders an
          empty box" - the chart-creation effect ran once on mount, found a
          null ref, and never re-ran when history later filled. */}
      <Box sx={{ width: '100%', height: CHART_H, position: 'relative' }}>
        <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
        {/* "Future dim" overlay - Polymarket / Kalshi style. Paints a
            semi-transparent gradient over the chart area FROM the cursor
            X to the right edge, so the user reads "the past is what I'm
            inspecting (vivid), the future relative to this hover point
            is dimmed". The gradient starts transparent right at the
            cursor (so the active line stays crisp) and fades to a solid
            dim on the right edge. pointer-events: none so the crosshair
            still tracks the cursor. */}
        {hoverState && history.length > 0 && (
          <Box
            sx={{
              position: 'absolute',
              left: hoverState.x,
              top: 0,
              // `right` and `bottom` carve out the chart's axis gutters
              // so the dim only paints over the actual plot area (the
              // canvas with the lines). Y-axis labels on the right and
              // x-axis labels at the bottom stay vivid.
              right: axisInsets.right,
              bottom: axisInsets.bottom,
              background: `linear-gradient(to right, ${dimBg}00 0%, ${dimBg}DC 3%, ${dimBg}DC 100%)`,
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        )}
        {/* Endpoint badges - pinned to the *tip of each line* (X coord
            of the last data point via timeToCoordinate, Y from each
            series' priceToCoordinate). On hover we hide the endpoint
            badges and let the per-line cursor badges below take over,
            so we never paint two badges at once for the same series. */}
        {history.length > 0 && !hoverState && endpointCoords.x != null &&
          (
            [
              { key: 'up', show: showUp, y: endpointCoords.up, value: upData[upData.length - 1]?.value, color: t.up, icon: icons?.up ?? null, label: upLabel },
              { key: 'down', show: showDown, y: endpointCoords.down, value: downData[downData.length - 1]?.value, color: t.down, icon: icons?.down ?? null, label: downLabel },
              ...(threeWay
                ? [{ key: 'draw', show: showDraw, y: endpointCoords.draw, value: drawData[drawData.length - 1]?.value, color: t.draw, icon: icons?.draw ?? null, label: drawLabel }]
                : []),
            ].filter(b => b.show && b.y != null && b.value != null) as Array<{
              key: string; show: true; y: number; value: number; color: string; icon: string | null; label: string;
            }>
          ).map(badge => (
            <LineEndBadge
              key={badge.key}
              x={endpointCoords.x!}
              y={badge.y}
              value={badge.value}
              color={badge.color}
              icon={badge.icon}
              label={badge.label}
              themeBorderSubtle={t.border.subtle}
            />
          ))
        }
        {/* Per-line hover badges - one per series, each anchored to its
            own curve at the snapped X. Lets users read both outcomes at
            once without parsing a stacked tooltip card. */}
        {hoverState && history.length > 0 &&
          (
            [
              { key: 'up', show: showUp, y: hoverState.upY, value: hoverState.upValue, color: t.up, icon: icons?.up ?? null, label: upLabel },
              { key: 'down', show: showDown, y: hoverState.downY, value: hoverState.downValue, color: t.down, icon: icons?.down ?? null, label: downLabel },
              ...(threeWay
                ? [{ key: 'draw', show: showDraw, y: hoverState.drawY, value: hoverState.drawValue, color: t.draw, icon: icons?.draw ?? null, label: drawLabel }]
                : []),
            ].filter(b => b.show && b.y != null && b.value != null) as Array<{
              key: string; show: true; y: number; value: number; color: string; icon: string | null; label: string;
            }>
          ).map(badge => (
            <LineEndBadge
              key={badge.key}
              x={hoverState.x}
              y={badge.y}
              value={badge.value}
              color={badge.color}
              icon={badge.icon}
              label={badge.label}
              themeBorderSubtle={t.border.subtle}
            />
          ))
        }
        {showInitialSpinner && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: dimBg,
              pointerEvents: 'none',
            }}
          >
            <CircularProgress size={24} sx={{ color: t.text.muted }} />
          </Box>
        )}
        {!showInitialSpinner && history.length === 0 && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: dimBg,
              pointerEvents: 'none',
            }}
          >
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: t.text.muted }}>
              {source === 'updown' ? 'No predictions yet - be the first!' : 'No market data available'}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * Per-line tip badge: icon + percentage in a colour-bordered pill, painted
 * at (x, y) inside the chart container. Used both for the static endpoint
 * (last datapoint) and the dynamic hover-tracking badge - same component
 * so the two states are visually identical.
 *
 * Auto-flips left of the X anchor when there isn't horizontal room (e.g.
 * the cursor is near the right edge of the chart) so the badge never
 * spills off-canvas. Y is clamped to keep it inside the plot area.
 */
function LineEndBadge({
  x, y, value, color, icon, label, themeBorderSubtle,
}: {
  x: number;
  y: number;
  value: number;
  color: string;
  icon: string | null;
  label: string;
  themeBorderSubtle: string;
}) {
  // The chart's `rightOffset` is already wide enough to host the badge
  // without ever colliding with the y-axis, so we just sit 8px to the
  // right of the line tip and clamp the Y inside the plot area.
  const left = x + 8;
  const top = Math.max(4, Math.min(y - 11, CHART_H - 26));
  return (
    <Box
      sx={{
        position: 'absolute',
        left,
        top,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        pl: 0.4,
        pr: 0.75,
        py: 0.3,
        borderRadius: '999px',
        bgcolor: 'rgba(8, 13, 22, 0.92)',
        border: `1px solid ${color}66`,
        boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
        // Bumped to 10 so LWC's own axis labels never paint over the
        // badge. The canvas itself is z-index 0 but LWC ships a small DOM
        // sublayer for the price scale that defaults to a higher stack
        // order - 10 puts us safely above either.
        zIndex: 10,
        fontFamily: 'var(--font-satoshi), "Satoshi", -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {icon ? (
        <Box
          component="img"
          src={icon}
          alt=""
          sx={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `1px solid ${themeBorderSubtle}` }}
        />
      ) : (
        <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color, mx: '4px', flexShrink: 0 }} />
      )}
      <span title={label} style={{ fontSize: '0.72rem', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {Math.round(value * 100)}%
      </span>
    </Box>
  );
}
