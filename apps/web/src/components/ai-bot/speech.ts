import type { AnalysisResult } from '@/lib/technical-analysis';
import type { PacificaPriceData } from '@/hooks/usePacificaPrices';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PoolStatus = 'UPCOMING' | 'JOINING' | 'ACTIVE' | 'RESOLVED' | 'CLAIMABLE';

export interface ChatMessage {
  id: number;
  text: string;
  sender: 'bot' | 'user';
}

// ---------------------------------------------------------------------------
// Text cleaning for speech synthesis
// ---------------------------------------------------------------------------

function cleanTextForSpeech(text: string): string {
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu, '')
    .replace(/\*+/g, '')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#_~`>|]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Voice selection (cached per session)
// ---------------------------------------------------------------------------

let cachedVoice: SpeechSynthesisVoice | null = null;
let voiceSearched = false;

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', () => {
    voiceSearched = false;
    cachedVoice = null;
  });
}

function getConsistentVoice(): SpeechSynthesisVoice | null {
  if (voiceSearched) return cachedVoice;
  voiceSearched = true;

  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;

  const priorities = [
    /google uk english male/i,
    /microsoft david/i,
    /daniel/i,
    /google us english/i,
    /microsoft mark/i,
    /microsoft zira/i,
    /english.*male/i,
    /en-us/i,
    /en-gb/i,
  ];

  for (const pattern of priorities) {
    const match = voices.find((v) => pattern.test(v.name) || pattern.test(v.lang));
    if (match) {
      cachedVoice = match;
      return cachedVoice;
    }
  }

  cachedVoice = voices.find((v) => v.lang.startsWith('en')) || voices[0];
  return cachedVoice;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function speakRobotic(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  speechSynthesis.cancel();

  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return;

  const utter = new SpeechSynthesisUtterance(cleaned);
  utter.rate = 1.0;
  utter.pitch = 0.3;
  utter.lang = 'en-US';

  const voice = getConsistentVoice();
  if (voice) utter.voice = voice;

  speechSynthesis.speak(utter);
}

export async function fetchAiReply(
  message: string,
  analysis: AnalysisResult | null,
  asset: string,
  poolStatus: PoolStatus,
  timeframe: string,
  chatHistory: ChatMessage[],
  priceData?: PacificaPriceData | null,
): Promise<string> {
  const history = chatHistory.slice(-10).map((m) => ({
    role: m.sender === 'user' ? 'user' as const : 'assistant' as const,
    content: m.text,
  }));

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, asset, poolStatus, analysis, timeframe, history, priceData }),
  });

  const data = await res.json();
  return data.reply || 'BZZT... Something went wrong with my circuits.';
}
