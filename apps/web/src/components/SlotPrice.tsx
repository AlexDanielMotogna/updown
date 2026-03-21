'use client';

import { useRef, useEffect, useState, memo } from 'react';
import { Box } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';

const DIGITS = '0123456789';
const DIGIT_HEIGHT = 1; // em units

interface SlotDigitProps {
  char: string;
  color: string;
}

/** Single character column that rolls like a slot reel */
const SlotDigit = memo(function SlotDigit({ char, color }: SlotDigitProps) {
  const isDigit = DIGITS.includes(char);
  const idx = isDigit ? Number(char) : -1;
  const prevIdx = useRef(idx);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (isDigit && prevIdx.current !== idx && prevIdx.current >= 0) {
      setRolling(true);
      const t = setTimeout(() => setRolling(false), 400);
      prevIdx.current = idx;
      return () => clearTimeout(t);
    }
    prevIdx.current = idx;
  }, [idx, isDigit]);

  // Static characters ($, comma, dot)
  if (!isDigit) {
    return (
      <Box
        component="span"
        sx={{
          display: 'inline-block',
          width: char === ',' ? '0.35em' : char === '.' ? '0.35em' : '0.65em',
          textAlign: 'center',
          color,
          transition: 'color 0.15s ease',
        }}
      >
        {char}
      </Box>
    );
  }

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        width: '0.65em',
        height: `${DIGIT_HEIGHT}em`,
        overflow: 'hidden',
        position: 'relative',
        verticalAlign: 'bottom',
      }}
    >
      <motion.span
        animate={{ y: `${-idx * DIGIT_HEIGHT}em` }}
        transition={
          rolling
            ? { type: 'spring', stiffness: 200, damping: 18, mass: 0.8 }
            : { duration: 0 }
        }
        style={{
          display: 'block',
          position: 'absolute',
          left: 0,
          right: 0,
          color,
          transition: 'color 0.15s ease',
        }}
      >
        {DIGITS.split('').map((d) => (
          <span
            key={d}
            style={{
              display: 'block',
              height: `${DIGIT_HEIGHT}em`,
              lineHeight: `${DIGIT_HEIGHT}em`,
              textAlign: 'center',
            }}
          >
            {d}
          </span>
        ))}
      </motion.span>
    </Box>
  );
});

interface SlotPriceProps {
  value: string | null;
  color?: string;
}

export const SlotPrice = memo(function SlotPrice({ value, color = 'inherit' }: SlotPriceProps) {
  if (!value) {
    return <span style={{ color: 'rgba(255,255,255,0.4)' }}>---</span>;
  }

  const formatted = `$${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline' }}>
      <AnimatePresence mode="popLayout">
        {formatted.split('').map((char, i) => (
          <motion.span
            key={`${i}-${char}`}
            initial={false}
            style={{ display: 'inline-block' }}
          >
            <SlotDigit char={char} color={color} />
          </motion.span>
        ))}
      </AnimatePresence>
    </Box>
  );
});
