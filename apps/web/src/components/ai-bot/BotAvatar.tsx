import type { Signal } from '@/lib/technical-analysis';
import { UP_COLOR, DOWN_COLOR } from '@/lib/constants';

const CYAN = UP_COLOR;
const colorForSignal = (s: Signal) => (s === 'UP' ? CYAN : DOWN_COLOR);

export type BotState = 'MINIMIZED' | 'GREETING' | 'ANALYZING' | 'RESULT';

export function BotAvatar({ size = 40, state, signal }: { size?: number; state: BotState; signal?: Signal }) {
  const eyeColor = state === 'RESULT' && signal ? colorForSignal(signal) : CYAN;
  const isAnalyzing = state === 'ANALYZING';

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <line x1="20" y1="4" x2="20" y2="9" stroke={CYAN} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20" cy="3" r="2" fill={CYAN}>
        <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
      </circle>
      <rect x="6" y="10" width="28" height="22" rx="6" fill="#1a1a2e" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <circle cx="14" cy="21" r="3" fill={eyeColor}>
        {isAnalyzing ? (
          <animate attributeName="cx" values="13;15;13" dur="0.8s" repeatCount="indefinite" />
        ) : (
          <animate attributeName="opacity" values="1;0.6;1" dur="3s" repeatCount="indefinite" />
        )}
      </circle>
      <circle cx="26" cy="21" r="3" fill={eyeColor}>
        {isAnalyzing ? (
          <animate attributeName="cx" values="25;27;25" dur="0.8s" repeatCount="indefinite" />
        ) : (
          <animate attributeName="opacity" values="1;0.6;1" dur="3s" repeatCount="indefinite" />
        )}
      </circle>
      <rect x="15" y="27" width="10" height="1.5" rx="0.75" fill="rgba(255,255,255,0.2)" />
    </svg>
  );
}
