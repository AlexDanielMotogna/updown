'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { motion } from 'framer-motion';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface CountdownProps {
  targetDate: string | Date;
  label?: string;
  onComplete?: () => void;
  compact?: boolean;
  /** Override font size for compact mode */
  compactFontSize?: string | object;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

type Phase = 'calm' | 'heating' | 'critical' | 'final';

function calculateTimeLeft(targetMs: number): TimeLeft {
  const difference = targetMs - Date.now();

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / (1000 * 60)) % 60),
    seconds: Math.floor((difference / 1000) % 60),
    total: difference,
  };
}

function getPhase(totalMs: number): Phase {
  if (totalMs <= 0) return 'calm';
  if (totalMs <= 10 * 1000) return 'final';
  if (totalMs <= 60 * 1000) return 'critical';
  if (totalMs <= 5 * 60 * 1000) return 'heating';
  return 'calm';
}

export function Countdown({ targetDate, label, onComplete, compact = false, compactFontSize }: CountdownProps) {
  const t = useThemeTokens();
  const targetMs = useMemo(() => {
    const date = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
    return date.getTime();
  }, [targetDate]);

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calculateTimeLeft(targetMs));
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [tickFlash, setTickFlash] = useState(false);
  const prevSeconds = useRef(timeLeft.seconds);

  useEffect(() => {
    setTimeLeft(calculateTimeLeft(targetMs));

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const newTimeLeft = calculateTimeLeft(targetMs);
      setTimeLeft(newTimeLeft);
      if (newTimeLeft.total <= 0) {
        if (intervalId) clearInterval(intervalId);
        onCompleteRef.current?.();
      }
    };

    const msToNextSecond = 1000 - (Date.now() % 1000);
    const alignTimeout = setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 1000);
    }, msToNextSecond);

    return () => {
      clearTimeout(alignTimeout);
      if (intervalId) clearInterval(intervalId);
    };
  }, [targetMs]);

  // Tick flash for final phase
  const phase = getPhase(timeLeft.total);
  useEffect(() => {
    if (phase === 'final' && timeLeft.seconds !== prevSeconds.current) {
      setTickFlash(true);
      const t = setTimeout(() => setTickFlash(false), 200);
      prevSeconds.current = timeLeft.seconds;
      return () => clearTimeout(t);
    }
    prevSeconds.current = timeLeft.seconds;
  }, [timeLeft.seconds, phase]);

  const isExpired = timeLeft.total <= 0;

  const timeUnits = [
    { value: timeLeft.days, label: 'DAYS', show: timeLeft.days > 0 },
    { value: timeLeft.hours, label: 'HRS', show: true },
    { value: timeLeft.minutes, label: 'MIN', show: true },
    { value: timeLeft.seconds, label: 'SEC', show: true },
  ].filter(unit => unit.show);

  // Phase-specific label suffix
  const phaseLabel = (() => {
    if (!label) return label;
    if (phase === 'heating') return `${label} CLOSING SOON`;
    if (phase === 'critical') return `${label} CLOSING SOON`;
    if (phase === 'final') return 'LAST SECONDS';
    return label;
  })();

  // Phase-specific number color
  const numberColor = (() => {
    if (phase === 'final') return t.down;
    if (phase === 'critical') return t.error;
    if (phase === 'heating') return t.accent;
    return 'text.primary';
  })();

  if (compact) {
    return (
      <Box>
        <Typography
          sx={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: compactFontSize ?? '0.85rem',
            fontWeight: compactFontSize ? 700 : 500,
            color: isExpired ? 'text.disabled' : numberColor,
            transition: 'all 0.3s ease',
          }}
        >
          {isExpired ? (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              <CircularProgress size={12} sx={{ color: 'text.secondary' }} />
              Resolving...
            </Box>
          ) : (
            timeUnits.map((unit, i) => (
              <span key={unit.label}>
                {unit.value.toString().padStart(2, '0')}
                {i < timeUnits.length - 1 ? ':' : ''}
              </span>
            ))
          )}
        </Typography>
      </Box>
    );
  }

  const containerSx = {};

  // Box background per phase
  const boxBg = (() => {
    if (phase === 'final') return withAlpha(t.down, 0.19);
    if (phase === 'critical') return withAlpha(t.down, 0.13);
    if (phase === 'heating') return withAlpha(t.accent, 0.08);
    return t.hover.default;
  })();

  // Box shadow per phase
  const boxShadow = (() => {
    if (phase === 'final') return `0 0 12px ${withAlpha(t.down, 0.25)}, inset 0 0 8px ${withAlpha(t.down, 0.08)}`;
    if (phase === 'critical') return `0 0 8px ${withAlpha(t.down, 0.15)}`;
    return 'none';
  })();

  return (
    <Box sx={containerSx}>
      {phaseLabel && (
        <Typography
          variant="caption"
          sx={{
            color: phase === 'final' ? t.down : phase === 'critical' ? t.error : phase === 'heating' ? t.accent : 'text.secondary',
            display: 'block',
            mb: 1.5,
            textAlign: 'center',
            fontWeight: phase !== 'calm' ? 600 : 400,
            letterSpacing: phase !== 'calm' ? '0.15em' : '0.1em',
            transition: 'all 0.3s ease',
          }}
        >
          {phaseLabel}
        </Typography>
      )}

      {isExpired ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 1 }}>
          <CircularProgress size={24} sx={{ color: t.accent }} />
          <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', fontWeight: 500, letterSpacing: '0.05em' }}>
            Resolving pool...
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, justifyContent: 'center' }}>
          {timeUnits.map((unit) => (
            <motion.div
              key={unit.label}
              animate={
                phase === 'final' && unit.label === 'SEC'
                  ? { scale: [1, 1.15, 1] }
                  : phase === 'critical' && unit.label === 'SEC'
                  ? { x: [-2, 2, -2, 0] }
                  : {}
              }
              transition={
                phase === 'final'
                  ? { duration: 0.3, ease: 'easeOut' }
                  : { duration: 0.2, ease: 'easeOut' }
              }
            >
            <Box
              sx={{
                minWidth: { xs: 48, sm: 56 },
                p: 1.5,
                borderRadius: 0,
                background: boxBg,
                border: 'none',
                textAlign: 'center',
                boxShadow,
                transition: 'background 0.4s ease, box-shadow 0.4s ease',
              }}
            >
              <motion.div
                key={`${unit.label}-${timeLeft.seconds}`}
                initial={tickFlash && phase === 'final' ? { backgroundColor: t.text.dimmed } : false}
                animate={{ backgroundColor: 'rgba(255,255,255,0)' }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{ borderRadius: '2px' }}
              >
                <Typography
                  sx={{
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: { xs: '1.2rem', sm: '1.5rem' },
                    fontWeight: 400,
                    color: numberColor,
                    lineHeight: 1,
                    transition: 'color 0.3s ease',
                  }}
                >
                  {unit.value.toString().padStart(2, '0')}
                </Typography>
              </motion.div>
              <Typography
                variant="caption"
                sx={{
                  color: phase !== 'calm' ? numberColor : 'text.secondary',
                  fontSize: '0.65rem',
                  letterSpacing: '0.1em',
                  opacity: phase !== 'calm' ? 0.8 : 1,
                }}
              >
                {unit.label}
              </Typography>
            </Box>
            </motion.div>
          ))}
        </Box>
      )}
    </Box>
  );
}
