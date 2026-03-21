'use client';

import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { GAIN_COLOR, ACCENT_COLOR, UP_COINS_DIVISOR } from '@/lib/constants';

interface RewardPopupItem {
  id: string;
  xp: number;
  coins: number;
  levelUp: boolean;
  level: number;
}

let popupCounter = 0;

/**
 * Floating "+XP / +Coins" animation.
 * Call `showRewardPopup()` from anywhere to trigger.
 */
const listeners = new Set<(item: RewardPopupItem) => void>();

export function showRewardPopup(data: { xp: number; coins: number; levelUp: boolean; level: number }) {
  const item: RewardPopupItem = { ...data, id: `rp-${++popupCounter}` };
  listeners.forEach((fn) => fn(item));
}

export function RewardPopup() {
  const [items, setItems] = useState<RewardPopupItem[]>([]);

  useEffect(() => {
    const handler = (item: RewardPopupItem) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      }, 3000);
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 80,
        right: 24,
        zIndex: 1500,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence>
        {items.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.4 }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 0.25,
              }}
            >
              {item.xp > 0 && (
                <Typography
                  sx={{
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: GAIN_COLOR,
                    textShadow: `0 0 12px ${GAIN_COLOR}60`,
                  }}
                >
                  +{item.xp} XP
                </Typography>
              )}
              {item.coins > 0 && (
                <Typography
                  sx={{
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: ACCENT_COLOR,
                    textShadow: `0 0 12px ${ACCENT_COLOR}60`,
                  }}
                >
                  +{(item.coins / UP_COINS_DIVISOR).toFixed(2)} UP
                </Typography>
              )}
              {item.levelUp && (
                <Typography
                  sx={{
                    fontSize: '1rem',
                    fontWeight: 800,
                    color: '#fff',
                    textShadow: `0 0 16px ${ACCENT_COLOR}80`,
                  }}
                >
                  LEVEL UP! Lv.{item.level}
                </Typography>
              )}
            </Box>
          </motion.div>
        ))}
      </AnimatePresence>
    </Box>
  );
}
