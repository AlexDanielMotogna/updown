'use client';

import { useState } from 'react';
import { Box, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { darkTokens as t } from '@/lib/theme';

export interface NavItem {
  id: string;
  label: string;
}
export interface NavGroup {
  group: string;
  items: NavItem[];
}

/**
 * Grouped sidebar navigation for the admin panel (replaces the flat 17-tab bar).
 * Presentational: parent owns the active id + component rendering. Used inline on
 * desktop and inside a Drawer on mobile. Groups are collapsible (default open).
 */
export function AdminSidebar({
  groups,
  activeId,
  onSelect,
}: {
  groups: NavGroup[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <Box component="nav" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, py: 1 }}>
      {groups.map(g => {
        const isCollapsed = !!collapsed[g.group];
        return (
          <Box key={g.group}>
            <Box
              onClick={() => setCollapsed(c => ({ ...c, [g.group]: !c[g.group] }))}
              sx={{
                display: 'flex', alignItems: 'center', gap: 0.5,
                px: 1.5, py: 0.75, cursor: 'pointer', userSelect: 'none',
                color: t.text.secondary, fontSize: '0.68rem', fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                '&:hover': { color: t.text.primary },
              }}
            >
              {isCollapsed ? <ChevronRightIcon sx={{ fontSize: 15 }} /> : <ExpandMoreIcon sx={{ fontSize: 15 }} />}
              {g.group}
            </Box>
            <Collapse in={!isCollapsed}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, pb: 0.75 }}>
                {g.items.map(it => {
                  const active = it.id === activeId;
                  return (
                    <Box
                      key={it.id}
                      component="button"
                      onClick={() => onSelect(it.id)}
                      sx={{
                        textAlign: 'left', border: 'none', cursor: 'pointer',
                        borderRadius: 1, ml: 1.25, mr: 1, px: 1.25, py: 0.8,
                        fontSize: '0.85rem', fontWeight: active ? 600 : 400,
                        fontFamily: 'inherit',
                        bgcolor: active ? `${t.accent}1f` : 'transparent',
                        color: active ? t.text.primary : t.text.secondary,
                        borderLeft: `2px solid ${active ? t.accent : 'transparent'}`,
                        transition: 'background-color 0.12s, color 0.12s',
                        '&:hover': { bgcolor: active ? `${t.accent}29` : `${t.text.primary}0d`, color: t.text.primary },
                      }}
                    >
                      {it.label}
                    </Box>
                  );
                })}
              </Box>
            </Collapse>
          </Box>
        );
      })}
    </Box>
  );
}
