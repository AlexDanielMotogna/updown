'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Typography, IconButton, InputBase, CircularProgress, useMediaQuery } from '@mui/material';
import { motion } from 'framer-motion';
import { VolumeUp, VolumeOff, Close, Send } from '@mui/icons-material';
import { useMarketAnalysis } from '@/hooks/useMarketAnalysis';
import { useDraggablePosition } from '@/hooks/useDraggablePosition';
import type { PacificaPriceData } from '@/hooks/usePacificaPrices';
import { UP_COLOR } from '@/lib/constants';
import { BotAvatar, type BotState } from './ai-bot/BotAvatar';
import { ChatMessage } from './ai-bot/ChatMessage';
import { SignalCard } from './ai-bot/SignalCard';
import { TypingIndicator } from './ai-bot/TypingIndicator';
import { speakRobotic, fetchAiReply, type PoolStatus, type ChatMessage as ChatMessageType } from './ai-bot/speech';

const CYAN = UP_COLOR;

interface AiAnalyzerBotProps {
  asset: string;
  poolStatus: PoolStatus;
  startTime: string;
  endTime: string;
  winner?: string | null;
  priceData?: PacificaPriceData | null;
}

export function AiAnalyzerBot({ asset, poolStatus, startTime, endTime, winner, priceData }: AiAnalyzerBotProps) {
  const isMobile = useMediaQuery('(max-width:600px)');
  const bubbleSize = isMobile ? 48 : 56;
  const { motionProps } = useDraggablePosition('bot-drag-pos', bubbleSize);
  const [botState, setBotState] = useState<BotState>('MINIMIZED');
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [hasNewResult, setHasNewResult] = useState(false);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);
  const greetingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const botStateRef = useRef(botState);
  botStateRef.current = botState;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const voiceEnabledRef = useRef(voiceEnabled);
  voiceEnabledRef.current = voiceEnabled;

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
        return `BEEP BOOP. Predictions are open. Initializing market scan for ${asset}...`;
      case 'ACTIVE':
        return `BZZT. Predictions are locked. Scanning ${asset} indicators now...`;
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
      const reply = await fetchAiReply(text, analysis, asset, poolStatus, timeframe, messagesRef.current, priceData);
      addBotMessage(reply);
      speakIfEnabled(reply);
    } catch {
      addBotMessage('BZZT... Neural link interrupted. Try again.');
    } finally {
      setIsTyping(false);
    }
  }, [userInput, isTyping, analysis, asset, poolStatus, timeframe, addUserMessage, addBotMessage, speakIfEnabled, priceData]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ---- Effects ----

  useEffect(() => {
    return () => {
      if (greetingTimerRef.current) clearTimeout(greetingTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!analysis) return;

    const currentState = botStateRef.current;

    if (currentState === 'MINIMIZED') {
      setHasNewResult(true);
      return;
    }

    if (!hasPostedAnalysisRef.current) {
      hasPostedAnalysisRef.current = true;
      lastSignalDirRef.current = analysis.signal;

      if (greetingTimerRef.current) {
        clearTimeout(greetingTimerRef.current);
        greetingTimerRef.current = null;
      }

      setBotState('RESULT');
      addBotMessage(analysis.explanation);
      speakIfEnabled(analysis.explanation);
      return;
    }

    if (analysis.signal !== lastSignalDirRef.current) {
      lastSignalDirRef.current = analysis.signal;
      const msg = `[SIGNAL FLIP] Direction changed to ${analysis.signal} at ${analysis.confidence}%. ${analysis.indicators.filter((i) => i.signal === analysis.signal).length} of 5 indicators confirm.`;
      addBotMessage(msg);
      speakIfEnabled(msg);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.signal]);

  useEffect(() => {
    if (botState === 'MINIMIZED') {
      hasPostedAnalysisRef.current = false;
      lastSignalDirRef.current = '';
    } else {
      setHasNewResult(false);
    }
  }, [botState]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Render: Minimized Bubble
  // ---------------------------------------------------------------------------

  if (botState === 'MINIMIZED') {
    return (
      <motion.div
        {...motionProps}
        style={{
          ...motionProps.style,
          position: 'fixed',
          bottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom, 0px))' : 24,
          right: isMobile ? 16 : 24,
          zIndex: 1200,
        }}
      >
        <Box
          onClick={handleOpen}
          sx={{
            width: bubbleSize,
            height: bubbleSize,
            borderRadius: '50%',
            backgroundColor: '#111820',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
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
                border: '2px solid #111820',
              }}
            />
          )}
        </Box>
      </motion.div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Expanded Panel
  // ---------------------------------------------------------------------------

  const panelWidth = isMobile ? '100vw' : 360;
  const panelRight = isMobile ? 0 : 24;
  const panelBottom = isMobile ? 'env(safe-area-inset-bottom, 0px)' : 24;

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
        borderRadius: 0,
        backgroundColor: '#111820',
        border: 'none',
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
            aria-label="Toggle voice"
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
          aria-label="Close analyzer"
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
          <ChatMessage key={msg.id} msg={msg} />
        ))}

        {/* Typing indicator */}
        {isTyping && <TypingIndicator />}

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
            borderRadius: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: 'none',
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
          aria-label="Send message"
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
