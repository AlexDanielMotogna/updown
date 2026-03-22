'use client';

import { useEffect, useState } from 'react';
import { Box, Container, Typography, CircularProgress, Tooltip } from '@mui/material';
import {
  fetchSystemStatus,
  fetchUptimeHistory,
  type SystemStatus,
  type ServiceHistory,
} from '@/lib/api';
import { UP_COLOR, ACCENT_COLOR, DOWN_COLOR } from '@/lib/constants';

const STATUS_COLORS: Record<string, string> = {
  operational: UP_COLOR,
  degraded: ACCENT_COLOR,
  down: DOWN_COLOR,
  no_data: 'rgba(255,255,255,0.08)',
};

const OVERALL_LABELS: Record<string, { label: string; color: string }> = {
  operational: { label: 'All Systems Operational', color: UP_COLOR },
  degraded: { label: 'Some Services Degraded', color: ACCENT_COLOR },
  partial_outage: { label: 'Partial Outage', color: DOWN_COLOR },
};

function StatusDot({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || UP_COLOR;
  return (
    <Box sx={{ position: 'relative', width: 12, height: 12, flexShrink: 0 }}>
      {status === 'operational' && (
        <Box
          sx={{
            position: 'absolute',
            inset: -2,
            borderRadius: '50%',
            bgcolor: `${color}30`,
            animation: 'statusPulse 2s infinite',
            '@keyframes statusPulse': {
              '0%, 100%': { transform: 'scale(1)', opacity: 1 },
              '50%': { transform: 'scale(1.5)', opacity: 0 },
            },
          }}
        />
      )}
      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color, position: 'relative' }} />
    </Box>
  );
}

function UptimeBars({ service }: { service: ServiceHistory }) {
  const currentStatus = service.days.length > 0
    ? service.days[service.days.length - 1].status
    : 'no_data';
  const statusLabel = currentStatus === 'operational' ? 'Operational'
    : currentStatus === 'degraded' ? 'Degraded'
    : currentStatus === 'down' ? 'Down'
    : 'No Data';

  return (
    <Box sx={{ py: 2.5 }}>
      {/* Header: dot + name + uptime % */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StatusDot status={currentStatus} />
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>
            {service.name}
          </Typography>
        </Box>
        <Typography
          sx={{
            fontSize: '0.8rem',
            fontWeight: 600,
            color: UP_COLOR,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {service.uptimePercent === 100 ? '100' : service.uptimePercent.toFixed(3)}% uptime
        </Typography>
      </Box>

      {/* 90-day bar grid */}
      <Box
        sx={{
          display: 'flex',
          gap: '2px',
          height: 32,
          alignItems: 'stretch',
        }}
      >
        {service.days.map((day, i) => (
          <Tooltip
            key={day.date}
            title={
              <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{day.date}</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', textTransform: 'capitalize' }}>
                  {day.status === 'no_data' ? 'No data' : day.status}
                </Typography>
              </Box>
            }
            arrow
            placement="top"
            slotProps={{
              tooltip: {
                sx: {
                  bgcolor: '#1a1f2e',
                  border: '1px solid rgba(255,255,255,0.1)',
                  '& .MuiTooltip-arrow': { color: '#1a1f2e' },
                },
              },
            }}
          >
            <Box
              sx={{
                flex: 1,
                borderRadius: '2px',
                bgcolor: STATUS_COLORS[day.status] || STATUS_COLORS.no_data,
                opacity: day.status === 'no_data' ? 1 : 0.85,
                transition: 'opacity 0.15s',
                cursor: 'pointer',
                '&:hover': { opacity: 1 },
              }}
            />
          </Tooltip>
        ))}
      </Box>

      {/* Labels: 90 days ago — Today */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>
          90 days ago
        </Typography>
        <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>
          Today
        </Typography>
      </Box>
    </Box>
  );
}

export default function StatusPage() {
  const [live, setLive] = useState<SystemStatus | null>(null);
  const [history, setHistory] = useState<ServiceHistory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchAll = async () => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        fetchSystemStatus(),
        fetchUptimeHistory(),
      ]);
      if (statusRes.data) {
        setLive(statusRes.data);
        setError(false);
      } else {
        setError(true);
      }
      if (historyRes.data) {
        setHistory(historyRes.data.history);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, []);

  const overallCfg = live ? OVERALL_LABELS[live.overall] : null;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#080B11' }}>
      <Container maxWidth={false} sx={{ py: { xs: 3, md: 5 }, pb: { xs: 6, md: 8 }, px: { xs: 1.5, sm: 4, md: 6, lg: 10 } }}>

        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} sx={{ color: UP_COLOR }} />
          </Box>
        )}

        {/* Error — API unreachable */}
        {!loading && error && (
          <Box
            sx={{
              bgcolor: '#0D1219',
              borderRadius: 2,
              px: { xs: 2.5, md: 3.5 },
              py: 4,
              textAlign: 'center',
            }}
          >
            <StatusDot status="down" />
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: DOWN_COLOR, mt: 2 }}>
              Unable to reach API
            </Typography>
            <Typography sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', mt: 0.5 }}>
              The server may be down or undergoing maintenance
            </Typography>
          </Box>
        )}

        {/* Status loaded */}
        {!loading && live && (
          <>
            {/* Overall banner */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: { xs: 2.5, md: 3.5 },
                py: 2.5,
                bgcolor: '#0D1219',
                borderRadius: 2,
                mb: 3,
              }}
            >
              <StatusDot status={live.overall === 'partial_outage' ? 'down' : live.overall} />
              <Typography sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, fontWeight: 700, color: overallCfg?.color }}>
                {overallCfg?.label}
              </Typography>
            </Box>

            {/* Service uptime bars */}
            <Box
              sx={{
                bgcolor: '#0D1219',
                borderRadius: 2,
                px: { xs: 2, md: 3.5 },
                py: 1,
              }}
            >
              {(history || []).map((service, i) => (
                <Box key={service.name}>
                  <UptimeBars service={service} />
                  {i < (history?.length ?? 0) - 1 && (
                    <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }} />
                  )}
                </Box>
              ))}

              {/* Fallback: if no history yet, show live services as bars with just today */}
              {!history && live.services.map((svc, i) => (
                <Box key={svc.name}>
                  <UptimeBars
                    service={{
                      name: svc.name,
                      uptimePercent: svc.status === 'operational' ? 100 : svc.status === 'degraded' ? 99 : 0,
                      days: Array.from({ length: 90 }, (_, j) => ({
                        date: new Date(Date.now() - (89 - j) * 86400000).toISOString().slice(0, 10),
                        status: j === 89 ? svc.status : 'no_data' as const,
                        uptime: 100,
                      })),
                    }}
                  />
                  {i < live.services.length - 1 && (
                    <Box sx={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }} />
                  )}
                </Box>
              ))}
            </Box>

            {/* Footer info */}
            <Box sx={{ mt: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>
                Checked every 5 minutes · Auto-refreshes every 30s
              </Typography>
              <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', fontVariantNumeric: 'tabular-nums' }}>
                Response: {live.responseTime}ms
              </Typography>
            </Box>
          </>
        )}

      </Container>
    </Box>
  );
}
