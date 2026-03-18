'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useMotionValue } from 'framer-motion';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Hook for making a fixed-position element draggable with localStorage persistence.
 * Returns motion props to spread onto a <motion.div> wrapper.
 */
export function useDraggablePosition(storageKey: string, elementSize = 56) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const constraintsRef = useRef({ top: 0, left: 0, right: 0, bottom: 0 });
  const [constraints, setConstraints] = useState(constraintsRef.current);

  const updateConstraints = useCallback(() => {
    if (typeof window === 'undefined') return;
    const c = {
      top: -(window.innerHeight - elementSize),
      left: -(window.innerWidth - elementSize),
      right: window.innerWidth - elementSize,
      bottom: window.innerHeight - elementSize,
    };
    constraintsRef.current = c;
    setConstraints(c);
  }, [elementSize]);

  // Load saved position on mount and compute initial constraints
  useEffect(() => {
    updateConstraints();
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const pos = JSON.parse(saved);
        const maxX = window.innerWidth - elementSize;
        const maxY = window.innerHeight - elementSize;
        x.set(clamp(pos.x ?? 0, -maxX, maxX));
        y.set(clamp(pos.y ?? 0, -maxY, maxY));
      }
    } catch {
      // ignore malformed data
    }
  }, [storageKey, elementSize, x, y, updateConstraints]);

  // Clamp on window resize so element stays in bounds
  useEffect(() => {
    const handleResize = () => {
      updateConstraints();
      const maxX = window.innerWidth - elementSize;
      const maxY = window.innerHeight - elementSize;
      x.set(clamp(x.get(), -maxX, maxX));
      y.set(clamp(y.get(), -maxY, maxY));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [elementSize, x, y, updateConstraints]);

  const onDragEnd = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ x: x.get(), y: y.get() }));
    } catch {
      // storage full or unavailable
    }
  }, [storageKey, x, y]);

  return {
    motionProps: {
      drag: true as const,
      dragConstraints: constraints,
      dragMomentum: false,
      dragElastic: 0,
      onDragEnd,
      style: { x, y },
    },
  };
}
