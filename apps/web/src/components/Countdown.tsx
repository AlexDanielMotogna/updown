'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Box, Typography } from '@mui/material';

interface CountdownProps {
  targetDate: string | Date;
  label?: string;
  onComplete?: () => void;
  compact?: boolean;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

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

export function Countdown({ targetDate, label, onComplete, compact = false }: CountdownProps) {
  // Memoize the target timestamp to avoid recreating on each render
  const targetMs = useMemo(() => {
    const date = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
    return date.getTime();
  }, [targetDate]);

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calculateTimeLeft(targetMs));
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    // Update immediately
    setTimeLeft(calculateTimeLeft(targetMs));

    const timer = setInterval(() => {
      const newTimeLeft = calculateTimeLeft(targetMs);
      setTimeLeft(newTimeLeft);

      if (newTimeLeft.total <= 0) {
        clearInterval(timer);
        onCompleteRef.current?.();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetMs]);

  const isExpired = timeLeft.total <= 0;
  const isUrgent = timeLeft.total > 0 && timeLeft.total < 5 * 60 * 1000;

  const timeUnits = [
    { value: timeLeft.days, label: 'DAYS', show: timeLeft.days > 0 },
    { value: timeLeft.hours, label: 'HRS', show: true },
    { value: timeLeft.minutes, label: 'MIN', show: true },
    { value: timeLeft.seconds, label: 'SEC', show: true },
  ].filter(unit => unit.show);

  if (compact) {
    return (
      <Box>
        {label && (
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}
          >
            {label}
          </Typography>
        )}
        <Typography
          sx={{
            fontVariantNumeric: 'tabular-nums',
            fontSize: '1.1rem',
            fontWeight: 500,
            color: isExpired ? 'text.disabled' : isUrgent ? '#F59E0B' : 'text.primary',
          }}
        >
          {isExpired ? (
            'Expired'
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

  return (
    <Box>
      {label && (
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', display: 'block', mb: 1.5, textAlign: 'center' }}
        >
          {label}
        </Typography>
      )}

      {isExpired ? (
        <Typography
          variant="h6"
          sx={{ color: 'text.disabled', textAlign: 'center' }}
        >
          Expired
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, justifyContent: 'center' }}>
          {timeUnits.map((unit) => (
            <Box
              key={unit.label}
              sx={{
                minWidth: { xs: 48, sm: 56 },
                p: 1.5,
                borderRadius: 1,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                textAlign: 'center',
              }}
            >
              <Typography
                sx={{
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: { xs: '1.2rem', sm: '1.5rem' },
                  fontWeight: 400,
                  color: isUrgent ? '#F59E0B' : 'text.primary',
                  lineHeight: 1,
                }}
              >
                {unit.value.toString().padStart(2, '0')}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.65rem',
                  letterSpacing: '0.1em',
                }}
              >
                {unit.label}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
