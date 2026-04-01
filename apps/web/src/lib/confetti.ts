import confetti from 'canvas-confetti';
import { darkTokens, palette } from '@/lib/theme';

/** Gold/green burst for wins (TransactionModal success, POOL_WON toast) */
export function fireWinConfetti() {
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { y: 0.6 },
    colors: [darkTokens.gain, palette.gold, palette.white],
  });
}

/** Bigger shower for successful claim payouts */
export function fireClaimConfetti() {
  const end = Date.now() + 600;
  const colors = [darkTokens.gain, palette.gold, palette.white];

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}
