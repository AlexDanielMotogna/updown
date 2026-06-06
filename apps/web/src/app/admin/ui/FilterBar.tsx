'use client';

/**
 * Search + active-filter-chip primitive for list-style tabs. Three search
 * patterns in the wild (instant local / instant remote / on-submit) - this
 * standardises on debounced text with optional chip row underneath.
 *
 * - debounceMs > 0: emits onChange after the debounce window
 *   (use for queries that hit the backend).
 * - debounceMs = 0 (default): emits on every keystroke for local filtering.
 *
 * activeChips show as removable pills; clicking the X calls
 * `chip.onRemove`.
 */
import { Box, InputAdornment, TextField, Chip, type TextFieldProps } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useEffect, useRef, useState } from 'react';
import { darkTokens as t } from '@/lib/theme';
import { LAYOUT_TOKENS } from './tokens';

export interface FilterChip {
  key: string;
  label: string;
  onRemove?: () => void;
}

export interface FilterBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  activeChips?: FilterChip[];
  textFieldProps?: Omit<TextFieldProps, 'value' | 'onChange' | 'placeholder'>;
}

export function FilterBar({ value, onChange, placeholder = 'Search…', debounceMs = 0, activeChips, textFieldProps }: FilterBarProps) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;

  // Keep local input in sync when parent resets the value (e.g. clear button).
  useEffect(() => { setLocal(value); }, [value]);

  const handle = (next: string) => {
    setLocal(next);
    if (debounceMs <= 0) {
      latestOnChange.current(next);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latestOnChange.current(next), debounceMs);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: LAYOUT_TOKENS.inlineButtonGap }}>
      <TextField
        size="small"
        fullWidth
        value={local}
        onChange={(e) => handle(e.target.value)}
        placeholder={placeholder}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 18, color: t.text.tertiary }} />
            </InputAdornment>
          ),
        }}
        {...textFieldProps}
        sx={{
          '& .MuiInputBase-root': {
            bgcolor: t.bg.input,
            borderRadius: LAYOUT_TOKENS.radiusInput,
            fontSize: '0.85rem',
          },
          '& .MuiOutlinedInput-notchedOutline': { borderColor: t.border.medium },
          ...textFieldProps?.sx,
        }}
      />
      {activeChips && activeChips.length > 0 ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {activeChips.map(chip => (
            <Chip
              key={chip.key}
              label={chip.label}
              size="small"
              onDelete={chip.onRemove}
              sx={{
                height: 22, fontSize: '0.7rem',
                bgcolor: t.hover.medium,
                color: t.text.primary,
                borderRadius: 1,
              }}
            />
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
