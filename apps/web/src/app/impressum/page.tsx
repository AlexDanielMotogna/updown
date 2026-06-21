'use client';

import { Box, Container, Typography } from '@mui/material';
import { AppShell } from '@/components';
import { useThemeTokens } from '@/app/providers';

function SectionLabel({ children }: { children: React.ReactNode }) {
  const t = useThemeTokens();
  return (
    <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: t.text.soft, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1.5, mt: 4, px: { xs: 1.5, sm: 0 } }}>
      {children}
    </Typography>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  const t = useThemeTokens();
  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, py: { xs: 1.25, sm: 1 }, px: { xs: 1, sm: 1.5 }, gap: { xs: 0.25, sm: 1 }, borderBottom: `1px solid ${t.border.subtle}` }}>
      <Typography sx={{ fontSize: { xs: '0.8rem', sm: '0.9rem' }, color: t.text.rich }}>{label}</Typography>
      <Typography sx={{ fontSize: { xs: '0.78rem', sm: '0.9rem' }, fontWeight: 500, color: t.text.vivid, textAlign: { xs: 'left', sm: 'right' } }}>{value}</Typography>
    </Box>
  );
}

export default function ImpressumPage() {
  const t = useThemeTokens();
  return (
    <AppShell centered>
      <Container maxWidth="md" sx={{ py: { xs: 3, sm: 5 } }}>
        <Typography sx={{ fontSize: { xs: '1.4rem', sm: '1.8rem' }, fontWeight: 800, color: t.text.vivid, mb: 0.5 }}>
          Legal Notice (Impressum)
        </Typography>
        <Typography sx={{ fontSize: '0.9rem', color: t.text.rich, lineHeight: 1.7, mb: 1 }}>
          Information according to § 5 ECG and disclosure obligation according to § 25 MedienG.
          UpDown (updown.my) is operated by MOTOGNA Tech Studio.
        </Typography>

        <SectionLabel>Company Information</SectionLabel>
        <Box>
          <DataRow label="Company" value="MOTOGNA Tech Studio" />
          <DataRow label="Owner" value="Alex Daniel Motogna" />
          <DataRow label="Address" value="Murzgasse 2/13, 8600 Bruck an der Mur, Austria" />
        </Box>

        <SectionLabel>Contact</SectionLabel>
        <Box>
          <DataRow label="Email" value={<Box component="a" href="mailto:alex@motogna.tech" sx={{ color: t.up, textDecoration: 'none' }}>alex@motogna.tech</Box>} />
          <DataRow label="Phone" value="+43 660 175 9059" />
        </Box>

        <SectionLabel>Business Registration</SectionLabel>
        <Box>
          <DataRow label="Business type" value="Einzelunternehmen (Sole Proprietorship)" />
          <DataRow label="Trade" value="Services in automatic data processing and information technology" />
          <DataRow label="GISA Number" value="39260086" />
          <DataRow label="Registration date" value="26.01.2026" />
          <DataRow label="Supervisory Authority" value="Bezirkshauptmannschaft Bruck-Mürzzuschlag" />
        </Box>
      </Container>
    </AppShell>
  );
}
