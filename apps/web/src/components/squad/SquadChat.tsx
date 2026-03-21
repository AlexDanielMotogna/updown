'use client';

import { useState, useRef, useEffect } from 'react';
import { Box, TextField, IconButton, Typography, Badge, Fab } from '@mui/material';
import Avatar from '@mui/material/Avatar';
import { Send, Chat as ChatIcon, Close, KeyboardArrowDown } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { UP_COLOR, getAvatarUrl } from '@/lib/constants';
import type { SquadChatMessage } from '@/lib/api';

interface SquadChatProps {
  messages: SquadChatMessage[] | undefined;
  onSend: (content: string) => void;
  isSending: boolean;
  currentWallet: string | null;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function shortWallet(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function SquadChat({ messages, onSend, isSending, currentWallet }: SquadChatProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Messages come from API in desc order — reverse for display
  const sorted = [...(messages || [])].reverse();

  // Track unread when closed
  useEffect(() => {
    const count = sorted.length;
    if (!open && count > prevCountRef.current && prevCountRef.current > 0) {
      setUnread((u) => u + (count - prevCountRef.current));
    }
    prevCountRef.current = count;
  }, [sorted.length, open]);

  // Scroll to bottom when opened or new messages arrive while open
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnread(0);
    }
  }, [open, sorted.length]);

  const handleSend = () => {
    if (input.trim()) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleToggle = () => {
    setOpen((o) => !o);
    if (!open) setUnread(0);
  };

  return (
    <>
      {/* Floating chat window */}
      <AnimatePresence>
        {open && (
          <Box
            sx={{
              position: 'fixed',
              bottom: { xs: 'calc(64px + env(safe-area-inset-bottom, 0px) + 56px)', lg: 90 },
              right: { xs: 8, lg: 20 },
              zIndex: 1300,
              width: { xs: 'calc(100vw - 16px)', sm: 380 },
            }}
          >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                height: { xs: 360, md: 480 },
                bgcolor: '#0B0F14',
                border: '1px solid rgba(255,255,255,0.08)',
                overflow: 'hidden',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              {/* Header */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2,
                  py: 1.2,
                  bgcolor: '#0D1219',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  flexShrink: 0,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ChatIcon sx={{ fontSize: 18, color: UP_COLOR }} />
                  <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    Squad Chat
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={() => setOpen(false)}
                  sx={{ color: 'text.secondary', '&:hover': { color: '#fff' } }}
                >
                  <Close sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>

              {/* Messages area */}
              <Box
                sx={{
                  flex: 1,
                  overflowY: 'auto',
                  px: 1.5,
                  py: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.8,
                  '&::-webkit-scrollbar': { width: 3 },
                  '&::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.08)', borderRadius: 2 },
                }}
              >
                {sorted.length === 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                    <Typography sx={{ color: 'text.secondary', fontSize: '0.82rem' }}>
                      No messages yet
                    </Typography>
                  </Box>
                )}
                {sorted.map((msg) => {
                  const isMe = msg.walletAddress === currentWallet;
                  return (
                    <Box
                      key={msg.id}
                      sx={{
                        display: 'flex',
                        flexDirection: isMe ? 'row-reverse' : 'row',
                        gap: 0.8,
                        alignItems: 'flex-end',
                      }}
                    >
                      {!isMe && (
                        <Avatar
                          src={getAvatarUrl(msg.walletAddress)}
                          alt=""
                          sx={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: '1px solid rgba(255,255,255,0.06)' }}
                        />
                      )}
                      <Box
                        sx={{
                          maxWidth: '75%',
                          backgroundColor: isMe ? `${UP_COLOR}12` : 'rgba(255,255,255,0.04)',
                          px: 1.2,
                          py: 0.6,
                        }}
                      >
                        {!isMe && (
                          <Typography sx={{ fontSize: '0.6rem', color: UP_COLOR, fontWeight: 600, lineHeight: 1 }}>
                            {shortWallet(msg.walletAddress)}
                          </Typography>
                        )}
                        <Typography sx={{ fontSize: '0.8rem', wordBreak: 'break-word', lineHeight: 1.45, mt: !isMe ? 0.2 : 0 }}>
                          {msg.content}
                        </Typography>
                        <Typography sx={{ fontSize: '0.55rem', color: 'text.secondary', textAlign: isMe ? 'left' : 'right', mt: 0.1, lineHeight: 1 }}>
                          {formatTime(msg.createdAt)}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
                <div ref={bottomRef} />
              </Box>

              {/* Input area */}
              <Box sx={{ display: 'flex', gap: 0.8, p: 1.2, borderTop: '1px solid rgba(255,255,255,0.06)', bgcolor: '#0D1219', flexShrink: 0 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Type a message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  inputProps={{ maxLength: 500 }}
                  sx={{
                    '& .MuiInputBase-root': { fontSize: '0.82rem', py: 0 },
                    '& .MuiOutlinedInput-root': {
                      bgcolor: 'rgba(255,255,255,0.03)',
                    },
                  }}
                />
                <IconButton
                  onClick={handleSend}
                  disabled={!input.trim() || isSending}
                  size="small"
                  sx={{ color: UP_COLOR, '&:hover': { bgcolor: `${UP_COLOR}15` } }}
                >
                  <Send sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            </Box>
          </motion.div>
          </Box>
        )}
      </AnimatePresence>

      {/* Floating action button */}
      <Box
        sx={{
          position: 'fixed',
          bottom: { xs: 'calc(64px + env(safe-area-inset-bottom, 0px))', lg: 20 },
          right: { xs: 12, lg: 20 },
          zIndex: 1300,
        }}
      >
        <Fab
          onClick={handleToggle}
          size="small"
          sx={{
            width: { xs: 40, lg: 48 },
            height: { xs: 40, lg: 48 },
            minHeight: 0,
            bgcolor: open ? 'rgba(255,255,255,0.1)' : UP_COLOR,
            color: open ? '#fff' : '#000',
            '&:hover': {
              bgcolor: open ? 'rgba(255,255,255,0.15)' : UP_COLOR,
              filter: open ? undefined : 'brightness(1.15)',
            },
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}
        >
          <Badge
            variant="dot"
            invisible={open || unread === 0}
            color="error"
            sx={{
              '& .MuiBadge-badge': {
                width: 10,
                height: 10,
                minWidth: 10,
                borderRadius: '50%',
                border: '2px solid #111820',
              },
            }}
          >
            {open ? <KeyboardArrowDown /> : <ChatIcon />}
          </Badge>
        </Fab>
      </Box>
    </>
  );
}
