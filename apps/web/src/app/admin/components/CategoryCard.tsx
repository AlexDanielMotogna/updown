'use client';

import {
  Box, Card, Typography, Button,
} from '@mui/material';
import { darkTokens as dt, withAlpha } from '@/lib/theme';
import { AppSwitch } from '@/components/ui/SegmentedToggle';
import {
  StatusChip as UiStatusChip,
  type StatusKind,
} from '../ui';
import { type Category, TYPE_COLORS } from './category-management-config';

// Picks a StatusKind for the canonical <StatusChip> primitive. Replaces
// the previous local component that re-implemented chip colouring.
function categoryStatus(cat: { enabled: boolean; comingSoon: boolean }): { kind: StatusKind; label: string } {
  if (cat.enabled) return { kind: 'ok', label: 'Active' };
  if (cat.comingSoon) return { kind: 'warning', label: 'Coming soon' };
  return { kind: 'neutral', label: 'Hidden' };
}
function StatusChip({ enabled, comingSoon }: { enabled: boolean; comingSoon: boolean }) {
  const { kind, label } = categoryStatus({ enabled, comingSoon });
  return <UiStatusChip status={kind} label={label} />;
}

export function CategoryCard({ cat, poolCount, onToggle, onToggleComingSoon, onEdit, onDelete }: {
  cat: Category;
  poolCount?: number;
  onToggle: () => void;
  onToggleComingSoon: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card sx={{
      p: 2,
      border: '1px solid',
      borderColor: cat.enabled ? `${TYPE_COLORS[cat.type] || '#fff'}30` : 'rgba(255,255,255,0.06)',
      opacity: cat.enabled ? 1 : 0.7,
      transition: 'all 0.2s',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {cat.badgeUrl ? (
            <Box component="img" src={cat.badgeUrl} alt="" sx={{
              width: 28, height: 28, objectFit: 'contain', borderRadius: '4px',
              ...(cat.type === 'FOOTBALL_LEAGUE' && { bgcolor: 'rgba(13,18,25,0.92)', p: '2px', borderRadius: '50%' }),
            }} />
          ) : (
            <Box sx={{ width: 28, height: 28, borderRadius: '4px', bgcolor: `${cat.color || TYPE_COLORS[cat.type] || '#666'}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cat.color || TYPE_COLORS[cat.type] || '#666' }} />
            </Box>
          )}
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{cat.label}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                {cat.code} {cat.apiSource ? `(${cat.apiSource})` : ''}
              </Typography>
              {poolCount !== undefined && (
                <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: poolCount > 0 ? dt.gain : 'rgba(255,255,255,0.3)' }}>
                  · {poolCount} pool{poolCount === 1 ? '' : 's'}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StatusChip enabled={cat.enabled} comingSoon={cat.comingSoon} />
          <AppSwitch
            checked={cat.enabled}
            onChange={() => onToggle()}
            size="sm"
            tokens={dt}
            accent={TYPE_COLORS[cat.type] || dt.gain}
          />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
          {cat.numSides}-way | {cat.sideLabels.join(' / ')}
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>Coming Soon</Typography>
            <AppSwitch
              checked={cat.comingSoon}
              onChange={() => onToggleComingSoon()}
              disabled={cat.enabled}
              size="sm"
              tokens={dt}
            />
          </Box>
          <Button size="small" onClick={onEdit} sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', textTransform: 'none', minWidth: 0 }}>
            Edit
          </Button>
          <Button size="small" onClick={onDelete} sx={{ fontSize: '0.65rem', color: withAlpha(dt.down, 0.7), textTransform: 'none', minWidth: 0, '&:hover': { color: dt.down } }}>
            Delete
          </Button>
        </Box>
      </Box>
    </Card>
  );
}
