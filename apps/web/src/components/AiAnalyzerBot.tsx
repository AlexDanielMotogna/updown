'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, IconButton, InputBase, CircularProgress, useMediaQuery } from '@mui/material';
import { VolumeUp, VolumeOff, Close, Send } from '@mui/icons-material';
import { useMarketAnalysis } from '@/hooks/useMarketAnalysis';
import type { AnalysisResult, Signal } from '@/lib/technical-analysis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BotState = 'MINIMIZED' | 'GREETING' | 'ANALYZING' | 'RESULT';
type PoolStatus = 'UPCOMING' | 'JOINING' | 'ACTIVE' | 'RESOLVED' | 'CLAIMABLE';

interface AiAnalyzerBotProps {
  asset: string;
  poolStatus: PoolStatus;
  startTime: string;
  endTime: string;
  winner?: string | null;
}

interface ChatMessage {
  id: number;
  text: string;
  sender: 'bot' | 'user';
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const CYAN = '#00E5FF';
const RED = '#FF5252';
const colorForSignal = (s: Signal) => (s === 'UP' ? CYAN : RED);

// ---------------------------------------------------------------------------
// SVG Bot Avatar
// ---------------------------------------------------------------------------

function BotAvatar({ size = 40, state, signal }: { size?: number; state: BotState; signal?: Signal }) {
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

// ---------------------------------------------------------------------------
// Signal Card
// ---------------------------------------------------------------------------

function SignalCard({ analysis }: { analysis: AnalysisResult }) {
  const color = colorForSignal(analysis.signal);

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 1,
        background: analysis.signal === 'UP' ? 'rgba(0, 229, 255, 0.06)' : 'rgba(255, 82, 82, 0.06)',
        border: `1px solid ${analysis.signal === 'UP' ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255, 82, 82, 0.2)'}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color }}>
          {analysis.signal === 'UP' ? '\u25B2' : '\u25BC'} {analysis.signal}
        </Typography>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color }}>
          {analysis.confidence}%
        </Typography>
      </Box>
      <Box sx={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.08)', mb: 1.5, overflow: 'hidden' }}>
        <Box
          sx={{
            height: '100%',
            width: `${analysis.confidence}%`,
            borderRadius: 2,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            transition: 'width 0.5s ease',
          }}
        />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {analysis.indicators.map((ind) => {
          const indColor = colorForSignal(ind.signal);
          return (
            <Box
              key={ind.name}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.25,
                borderRadius: 0.5,
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.03em' }}>
                {ind.name}
              </Typography>
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: indColor }}>
                {ind.signal}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Robotic voice helper
// ---------------------------------------------------------------------------

// Strip markdown, emojis, and special chars that sound bad when spoken
function cleanTextForSpeech(text: string): string {
  return text
    // Remove emojis (Unicode emoji ranges)
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu, '')
    // Remove markdown bold/italic asterisks
    .replace(/\*+/g, '')
    // Remove bracket prefixes like [MODULE] but keep the word
    .replace(/\[([^\]]+)\]/g, '$1')
    // Remove markdown links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove stray special chars
    .replace(/[#_~`>|]/g, '')
    // Collapse multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Cache the selected voice so it's consistent across the session
let cachedVoice: SpeechSynthesisVoice | null = null;
let voiceSearched = false;

// Chrome loads voices asynchronously — reset cache when they arrive
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

  // Priority order: pick the best robotic-sounding voice available
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

  // Fallback: first English voice
  cachedVoice = voices.find((v) => v.lang.startsWith('en')) || voices[0];
  return cachedVoice;
}

function speakRobotic(text: string) {
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

// ---------------------------------------------------------------------------
// AI Chat — calls /api/chat which proxies to Claude
// ---------------------------------------------------------------------------

async function fetchAiReply(
  message: string,
  analysis: AnalysisResult | null,
  asset: string,
  poolStatus: PoolStatus,
  timeframe: string,
  chatHistory: ChatMessage[],
): Promise<string> {
  // Build history in Claude format (last 10 messages)
  const history = chatHistory.slice(-10).map((m) => ({
    role: m.sender === 'user' ? 'user' as const : 'assistant' as const,
    content: m.text,
  }));

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, asset, poolStatus, analysis, timeframe, history }),
  });

  const data = await res.json();
  return data.reply || 'BZZT... Something went wrong with my circuits.';
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AiAnalyzerBot({ asset, poolStatus, startTime, endTime, winner }: AiAnalyzerBotProps) {
  const isMobile = useMediaQuery('(max-width:600px)');
  const [botState, setBotState] = useState<BotState>('MINIMIZED');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [hasNewResult, setHasNewResult] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);
  const greetingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to read current state inside effects without adding to deps
  const botStateRef = useRef(botState);
  botStateRef.current = botState;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;

  // Track if we've posted the initial analysis to prevent duplicates
  const hasPostedAnalysisRef = useRef(false);
  const lastSignalDirRef = useRef<string>('');

  const supportsVoice = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const { analysis, timeframe, loading } = useMarketAnalysis({
    asset,
    startTime,
    endTime,
    enabled: botState !== 'MINIMIZED',
  });

  // ---- Helpers ----

  const addBotMessage = useCallback((text: string) => {
    msgIdRef.current += 1;
    setMessages((prev) => [...prev, { id: msgIdRef.current, text, sender: 'bot' }]);
  }, []);

  const addUserMessage = useCallback((text: string) => {
    msgIdRef.current += 1;
    setMessages((prev) => [...prev, { id: msgIdRef.current, text, sender: 'user' }]);
  }, []);

  const speakIfEnabled = useCallback((text: string) => {
    if (voiceEnabledRef.current) speakRobotic(text);
  }, []);

  // ---- Contextual greeting ----

  const getGreeting = useCallback(() => {
    switch (poolStatus) {
      case 'JOINING':
        return `BEEP BOOP. Betting is open. Initializing market scan for ${asset}...`;
      case 'ACTIVE':
        return `BZZT. Bets are locked. Scanning ${asset} indicators now...`;
      case 'RESOLVED':
      case 'CLAIMABLE':
        return `BIP. Pool resolved${winner ? ` \u2014 ${winner} won` : ''}. Loading post-mortem analysis for ${asset}...`;
      default:
        return `BEEP. Powering up. Scanning ${asset} on ${timeframe} timeframe...`;
    }
  }, [asset, poolStatus, winner, timeframe]);

  // ---- Open / Close ----

  const handleOpen = useCallback(() => {
    if (botState !== 'MINIMIZED') return;
    setBotState('GREETING');
    setMessages([]);
    hasPostedAnalysisRef.current = false;
    lastSignalDirRef.current = '';

    const greeting = getGreeting();
    addBotMessage(greeting);
    speakIfEnabled(greeting);

    greetingTimerRef.current = setTimeout(() => {
      setBotState('ANALYZING');
      addBotMessage('SCANNING... Running RSI, MACD, EMA, Bollinger, Momentum...');
    }, 1500);
  }, [botState, addBotMessage, getGreeting, speakIfEnabled]);

  const handleClose = useCallback(() => {
    setBotState('MINIMIZED');
    if (greetingTimerRef.current) {
      clearTimeout(greetingTimerRef.current);
      greetingTimerRef.current = null;
    }
    if (supportsVoice) speechSynthesis.cancel();
  }, [supportsVoice]);

  // ---- User sends a message (AI-powered) ----

  const handleSend = useCallback(async () => {
    const text = userInput.trim();
    if (!text || isTyping) return;

    addUserMessage(text);
    setUserInput('');
    setIsTyping(true);

    try {
      const reply = await fetchAiReply(text, analysis, asset, poolStatus, timeframe, messagesRef.current);
      addBotMessage(reply);
      speakIfEnabled(reply);
    } catch {
      addBotMessage('BZZT... Neural link interrupted. Try again.');
    } finally {
      setIsTyping(false);
    }
  }, [userInput, isTyping, analysis, asset, poolStatus, timeframe, addUserMessage, addBotMessage, speakIfEnabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ---- Cleanup timer on unmount ----

  useEffect(() => {
    return () => {
      if (greetingTimerRef.current) clearTimeout(greetingTimerRef.current);
    };
  }, []);

  // ---- Analysis ready → post ONCE, then only on signal flip ----
  // Deps: ONLY analysis?.signal. This fires when:
  //   1. analysis goes from null → object (signal changes from undefined → 'UP'/'DOWN')
  //   2. signal flips direction
  // It does NOT fire on confidence changes or candle ticks.

  useEffect(() => {
    if (!analysis) return;

    const currentState = botStateRef.current;

    if (currentState === 'MINIMIZED') {
      setHasNewResult(true);
      return;
    }

    // First analysis: post the full explanation
    if (!hasPostedAnalysisRef.current) {
      hasPostedAnalysisRef.current = true;
      lastSignalDirRef.current = analysis.signal;

      // Cancel the greeting timer — analysis arrived before it fired
      if (greetingTimerRef.current) {
        clearTimeout(greetingTimerRef.current);
        greetingTimerRef.current = null;
      }

      setBotState('RESULT');
      addBotMessage(analysis.explanation);
      speakIfEnabled(analysis.explanation);
      return;
    }

    // Signal direction flipped (UP↔DOWN)
    if (analysis.signal !== lastSignalDirRef.current) {
      lastSignalDirRef.current = analysis.signal;
      const msg = `[SIGNAL FLIP] Direction changed to ${analysis.signal} at ${analysis.confidence}%. ${analysis.indicators.filter((i) => i.signal === analysis.signal).length} of 5 indicators confirm.`;
      addBotMessage(msg);
      speakIfEnabled(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.signal]);

  // Reset tracking when panel closes
  useEffect(() => {
    if (botState === 'MINIMIZED') {
      hasPostedAnalysisRef.current = false;
      lastSignalDirRef.current = '';
    } else {
      setHasNewResult(false);
    }
  }, [botState]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Render: Minimized Bubble
  // ---------------------------------------------------------------------------

  if (botState === 'MINIMIZED') {
    return (
      <Box
        onClick={handleOpen}
        sx={{
          position: 'fixed',
          bottom: isMobile ? 16 : 24,
          right: isMobile ? 16 : 24,
          width: isMobile ? 48 : 56,
          height: isMobile ? 48 : 56,
          borderRadius: '50%',
          backgroundColor: '#141414',
          border: `1px solid ${CYAN}33`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 1200,
          boxShadow: `0 0 20px ${CYAN}22`,
          animation: 'botBreathe 3s ease-in-out infinite, botPulseGlow 2s ease-in-out infinite',
          transition: 'transform 0.2s ease',
          '&:hover': { transform: 'scale(1.1)' },
          '@keyframes botBreathe': {
            '0%, 100%': { transform: 'scale(1)' },
            '50%': { transform: 'scale(1.05)' },
          },
          '@keyframes botPulseGlow': {
            '0%, 100%': { boxShadow: `0 0 20px ${CYAN}22` },
            '50%': { boxShadow: `0 0 30px ${CYAN}44` },
          },
        }}
      >
        <BotAvatar size={isMobile ? 30 : 36} state="MINIMIZED" />
        {hasNewResult && (
          <Box
            sx={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: CYAN,
              border: '2px solid #141414',
            }}
          />
        )}
      </Box>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Expanded Panel
  // ---------------------------------------------------------------------------

  const panelWidth = isMobile ? '100vw' : 360;
  const panelRight = isMobile ? 0 : 24;
  const panelBottom = isMobile ? 0 : 24;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: panelBottom,
        right: panelRight,
        width: panelWidth,
        maxHeight: isMobile ? '70vh' : 520,
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: isMobile ? '16px 16px 0 0' : 2,
        backgroundColor: '#141414',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 20px ${CYAN}11`,
        overflow: 'hidden',
        animation: 'panelExpand 0.3s ease-out',
        '@keyframes panelExpand': {
          from: { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
          to: { opacity: 1, transform: 'translateY(0) scale(1)' },
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.5,
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          flexShrink: 0,
        }}
      >
        <BotAvatar size={28} state={botState} signal={analysis?.signal} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>AI Analyzer</Typography>
          <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)' }}>
            {loading ? 'Scanning...' : timeframe + ' timeframe'}
          </Typography>
        </Box>
        {supportsVoice && (
          <IconButton
            size="small"
            onClick={() => setVoiceEnabled((v) => !v)}
            sx={{
              color: voiceEnabled ? CYAN : 'rgba(255,255,255,0.3)',
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.04)' },
            }}
          >
            {voiceEnabled ? <VolumeUp sx={{ fontSize: 18 }} /> : <VolumeOff sx={{ fontSize: 18 }} />}
          </IconButton>
        )}
        <IconButton
          size="small"
          onClick={handleClose}
          sx={{
            color: 'rgba(255,255,255,0.4)',
            '&:hover': { backgroundColor: 'rgba(255,255,255,0.04)' },
          }}
        >
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* Messages Area */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 2,
          py: 1.5,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          minHeight: 100,
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.1)', borderRadius: 2 },
        }}
      >
        {messages.map((msg) => (
          <Box
            key={msg.id}
            sx={{
              display: 'flex',
              justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              animation: 'fadeSlideIn 0.3s ease-out',
              '@keyframes fadeSlideIn': {
                from: { opacity: 0, transform: 'translateY(10px)' },
                to: { opacity: 1, transform: 'translateY(0)' },
              },
            }}
          >
            {msg.sender === 'bot' ? (
              <Box sx={{ display: 'flex', gap: 1, maxWidth: '90%' }}>
                <Box
                  sx={{
                    width: 6,
                    minHeight: 6,
                    borderRadius: '50%',
                    backgroundColor: CYAN,
                    mt: 0.8,
                    flexShrink: 0,
                    opacity: 0.6,
                  }}
                />
                <Typography
                  sx={{
                    fontSize: '0.78rem',
                    color: 'rgba(255,255,255,0.75)',
                    lineHeight: 1.5,
                    fontWeight: 300,
                  }}
                >
                  {msg.text}
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  maxWidth: '80%',
                  px: 1.5,
                  py: 0.75,
                  borderRadius: '12px 12px 2px 12px',
                  backgroundColor: 'rgba(0, 229, 255, 0.1)',
                  border: '1px solid rgba(0, 229, 255, 0.15)',
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.78rem',
                    color: 'rgba(255,255,255,0.85)',
                    lineHeight: 1.5,
                    fontWeight: 400,
                  }}
                >
                  {msg.text}
                </Typography>
              </Box>
            )}
          </Box>
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: CYAN,
                opacity: 0.6,
              }}
            />
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              {[0, 1, 2].map((i) => (
                <Box
                  key={i}
                  sx={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    backgroundColor: 'rgba(255,255,255,0.3)',
                    animation: `typingDot 1s ease-in-out ${i * 0.15}s infinite`,
                    '@keyframes typingDot': {
                      '0%, 100%': { opacity: 0.3 },
                      '50%': { opacity: 1 },
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* Signal Card */}
      {analysis && (
        <Box sx={{ px: 2, pb: 1, flexShrink: 0 }}>
          <SignalCard analysis={analysis} />
        </Box>
      )}

      {/* Chat Input */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1.5,
          py: 1,
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          flexShrink: 0,
        }}
      >
        <InputBase
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything..."
          disabled={isTyping}
          sx={{
            flex: 1,
            fontSize: '0.78rem',
            color: 'rgba(255,255,255,0.85)',
            px: 1.5,
            py: 0.5,
            borderRadius: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            '& input::placeholder': {
              color: 'rgba(255,255,255,0.3)',
              opacity: 1,
            },
          }}
        />
        <IconButton
          size="small"
          onClick={handleSend}
          disabled={!userInput.trim() || isTyping}
          sx={{
            color: userInput.trim() && !isTyping ? CYAN : 'rgba(255,255,255,0.15)',
            '&:hover': { backgroundColor: 'rgba(0, 229, 255, 0.08)' },
          }}
        >
          {isTyping ? (
            <CircularProgress size={16} sx={{ color: CYAN }} />
          ) : (
            <Send sx={{ fontSize: 18 }} />
          )}
        </IconButton>
      </Box>
    </Box>
  );
}
