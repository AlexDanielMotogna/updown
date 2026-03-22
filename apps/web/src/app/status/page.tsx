'use client';

import { useEffect, useState } from 'react';
import { Box, Container, Typography, CircularProgress } from '@mui/material';
import { AppShell } from '@/components';
import { fetchSystemStatus, type SystemStatus, type ServiceStatus } from '@/lib/api';
import { UP_COLOR, ACCENT_COLOR, DOWN_COLOR } from '@/lib/constants';

const STATUS_CONFIG = {
  operational: { label: 'Operational', color: UP_COLOR },
  degraded: { label: 'Degraded', color: ACCENT_COLOR },
  down: { label: 'Down', color: DOWN_COLOR },
  partial_outage: { label: 'Partial Outage', color: ACCENT_COLOR },
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatusDot({ status }: { status: 'operational' | 'degraded' | 'down' }) {
  const color = STATUS_CONFIG[status].color;
  return (
    <Box sx={{ position: 'relative', width: 10, height: 10, flexShrink: 0 }}>
      {status === 'operational' && (
        <Box
          sx={{
            position: 'absolute', inset: -2,
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
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, position: 'relative' }} />
    </Box>
  );
}

function ServiceRow({ service }: { service: ServiceStatus }) {
  const cfg = STATUS_CONFIG[service.status];
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: { xs: 2, md: 2.5 },
        py: 1.5,
        bgcolor: '#0D1219',
        transition: 'background 0.15s ease',
        '&:hover': { background: 'rgba(255,255,255,0.03)' },
      }}
    >
      <StatusDot status={service.status} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>
          {service.name}
        </Typography>
        {service.details && (
          <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
            {service.details}
          </Typography>
        )}
      </Box>
      {service.latency !== undefined && (
        <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {service.latency}ms
        </Typography>
      )}
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: cfg.color, flexShrink: 0 }}>
        {cfg.label}
      </Typography>
    </Box>
  );
}

export default function StatusPage() {
  const [data, setData] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetchSystemStatus();
      if (res.data) {
        setData(res.data);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setLastChecked(new Date());
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, []);

  const overallCfg = data ? STATUS_CONFIG[data.overall] : null;

  return (
    <AppShell>
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 5 }, pb: { xs: 6, md: 8 }, px: { xs: 0, sm: 3 } }}>

        {/* Header */}
        <Box sx={{ px: { xs: 1.5, sm: 0 }, mb: 4 }}>
          <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, mb: 1 }}>
            System Status
          </Typography>
          {lastChecked && (
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
              Last checked: {lastChecked.toLocaleTimeString()} — auto-refreshes every 30s
            </Typography>
          )}
        </Box>

        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} sx={{ color: UP_COLOR }} />
          </Box>
        )}

        {/* Error — API unreachable */}
        {!loading && error && (
          <Box sx={{ bgcolor: '#0D1219', px: { xs: 2, md: 2.5 }, py: 4, textAlign: 'center' }}>
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
        {!loading && data && (
          <>
            {/* Overall banner */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: { xs: 2, md: 2.5 },
                py: 2.5,
                bgcolor: '#0D1219',
                mb: '3px',
              }}
            >
              <StatusDot status={data.overall === 'partial_outage' ? 'degraded' : data.overall as 'operational' | 'degraded'} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, color: overallCfg?.color }}>
                  {data.overall === 'operational' ? 'All Systems Operational' : data.overall === 'degraded' ? 'Some Services Degraded' : 'Partial Outage'}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)' }}>Uptime</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {formatUptime(data.uptime)}
                </Typography>
              </Box>
            </Box>

            {/* Services */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px', mb: 4 }}>
              {data.services.map((service) => (
                <ServiceRow key={service.name} service={service} />
              ))}
            </Box>

            {/* Response time */}
            <Box sx={{ px: { xs: 1.5, sm: 0 } }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)' }}>
                Status check completed in {data.responseTime}ms
              </Typography>
            </Box>
          </>
        )}

      </Container>
    </AppShell>
  );
}
