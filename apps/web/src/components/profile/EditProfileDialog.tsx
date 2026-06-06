'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  CircularProgress,
  Box,
  Typography,
  Avatar,
  IconButton,
} from '@mui/material';
import { CloudUpload, Link as LinkIcon, Close } from '@mui/icons-material';
import Script from 'next/script';
import { useThemeTokens } from '@/app/providers';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateUserProfile, type UserProfile } from '@/lib/api';

// Cloudinary's upload widget is attached to window when their CDN script
// loads. We don't want a hard dependency on @types/cloudinary, so this is a
// minimal local typing - only the calls we actually use.
type CloudinaryUploadWidget = {
  open: () => void;
  close: () => void;
};
declare global {
  interface Window {
    cloudinary?: {
      createUploadWidget: (
        options: Record<string, unknown>,
        callback: (error: unknown, result: { event: string; info?: { secure_url?: string } }) => void,
      ) => CloudinaryUploadWidget;
    };
  }
}

const CLOUDINARY_CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const cloudinaryEnabled = Boolean(CLOUDINARY_CLOUD && CLOUDINARY_PRESET);

interface EditProfileDialogProps {
  open: boolean;
  onClose: () => void;
  walletAddress: string;
  profile: UserProfile | null | undefined;
}

/**
 * Self-edit dialog for displayName / avatarUrl / bannerUrl.
 *
 * Image inputs run through a Cloudinary unsigned upload widget when the
 * NEXT_PUBLIC_CLOUDINARY_* env vars are configured; otherwise the field
 * falls back to URL paste so the feature still works in environments
 * without Cloudinary. The widget loads its script lazily via next/script
 * so it doesn't impact the initial profile-page bundle.
 *
 * Validation matches the API's profileUpdateSchema so the user sees the
 * server's "display name taken" / "letters only" error in-place instead
 * of just a generic 400. Empty displayName is sent as `null` so users can
 * clear their alias back to the wallet truncation.
 */
export function EditProfileDialog({ open, onClose, walletAddress, profile }: EditProfileDialogProps) {
  const t = useThemeTokens();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatarUrl ?? '');
  const [bannerUrl, setBannerUrl] = useState(profile?.bannerUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const avatarWidgetRef = useRef<CloudinaryUploadWidget | null>(null);
  const bannerWidgetRef = useRef<CloudinaryUploadWidget | null>(null);

  // Reset local state every time the dialog opens so cancelled edits don't
  // bleed into the next open. We key on `open` to avoid spurious resets
  // when the parent re-renders.
  useEffect(() => {
    if (open) {
      setDisplayName(profile?.displayName ?? '');
      setAvatarUrl(profile?.avatarUrl ?? '');
      setBannerUrl(profile?.bannerUrl ?? '');
      setError(null);
    }
  }, [open, profile?.displayName, profile?.avatarUrl, profile?.bannerUrl]);

  const mutation = useMutation({
    mutationFn: updateUserProfile,
    onSuccess: (response) => {
      // Eagerly push the server's response into the userProfile cache so the
      // ProfileHeader re-renders with the new identity immediately, then also
      // invalidate to trigger a background refetch that picks up any derived
      // fields the server might recompute (rank, level, milestones). Without
      // the setQueryData step the header would briefly keep showing the old
      // wallet truncation until the refetch lands - and on slow links that
      // briefly was several seconds long.
      if (response.success && response.data) {
        queryClient.setQueryData(['userProfile', walletAddress], response);
      }
      queryClient.invalidateQueries({ queryKey: ['userProfile', walletAddress] });
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message || 'Could not save profile');
    },
  });

  const openCloudinary = (target: 'avatar' | 'banner') => {
    if (!cloudinaryEnabled || typeof window === 'undefined' || !window.cloudinary) {
      setError('Image upload is not configured yet. Paste a URL instead.');
      return;
    }
    const refSlot = target === 'avatar' ? avatarWidgetRef : bannerWidgetRef;
    if (!refSlot.current) {
      // Reuse the same widget instance across opens - Cloudinary caches the
      // user's last choice on the same instance, which feels nicer than
      // re-instantiating a fresh widget on every click.
      refSlot.current = window.cloudinary.createUploadWidget(
        {
          cloudName: CLOUDINARY_CLOUD,
          uploadPreset: CLOUDINARY_PRESET,
          sources: ['local', 'url', 'camera'],
          multiple: false,
          // Cropping ratios match what we render below: 1:1 for avatar,
          // ~5:1 for banner. Cloudinary's cropping_aspect_ratio is the
          // ONLY way to nudge users into a usable crop pre-upload.
          cropping: true,
          croppingAspectRatio: target === 'avatar' ? 1 : 5,
          showSkipCropButton: false,
          maxFileSize: 5_000_000, // 5MB
          clientAllowedFormats: ['png', 'jpg', 'jpeg', 'webp', 'gif'],
        },
        (err, result) => {
          if (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
            return;
          }
          if (result?.event === 'success' && result.info?.secure_url) {
            if (target === 'avatar') setAvatarUrl(result.info.secure_url);
            else setBannerUrl(result.info.secure_url);
          }
        },
      );
    }
    refSlot.current.open();
  };

  const handleSave = () => {
    setError(null);
    mutation.mutate({
      walletAddress,
      // Empty string → clear (null). Trim so trailing-space typos don't
      // leak into the unique constraint.
      displayName: displayName.trim() === '' ? null : displayName.trim(),
      avatarUrl: avatarUrl.trim() === '' ? null : avatarUrl.trim(),
      bannerUrl: bannerUrl.trim() === '' ? null : bannerUrl.trim(),
    });
  };

  return (
    <>
      {/* Lazy-load the Cloudinary widget only when the dialog is opened.
          Strategy=lazyOnload defers it past page interactive so the profile
          tab paints fast even when the script is large. */}
      {open && cloudinaryEnabled && (
        <Script
          src="https://upload-widget.cloudinary.com/global/all.js"
          strategy="lazyOnload"
        />
      )}
      <Dialog
        open={open}
        onClose={mutation.isPending ? undefined : onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { background: t.bg.surfaceAlt, border: t.surfaceBorder, boxShadow: t.surfaceShadow, borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Edit profile
          <IconButton size="small" onClick={onClose} disabled={mutation.isPending}>
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            {/* Banner preview + edit */}
            <Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: t.text.tertiary, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Banner
              </Typography>
              <Box
                sx={{
                  height: 90,
                  borderRadius: 1.5,
                  border: `1px solid ${t.border.medium}`,
                  backgroundImage: bannerUrl ? `url(${bannerUrl})` : 'url(/Banner/bannerr-empty.png)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              />
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                {cloudinaryEnabled && (
                  <Button
                    size="small"
                    startIcon={<CloudUpload sx={{ fontSize: 16 }} />}
                    onClick={() => openCloudinary('banner')}
                    sx={{ textTransform: 'none', fontSize: '0.78rem' }}
                  >
                    Upload
                  </Button>
                )}
                <TextField
                  size="small"
                  fullWidth
                  placeholder={cloudinaryEnabled ? 'or paste image URL' : 'Paste image URL'}
                  value={bannerUrl}
                  onChange={(e) => setBannerUrl(e.target.value)}
                  InputProps={{
                    startAdornment: <LinkIcon sx={{ fontSize: 14, color: t.text.quaternary, mr: 0.75 }} />,
                  }}
                />
              </Box>
            </Box>

            {/* Avatar preview + edit */}
            <Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: t.text.tertiary, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Avatar
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar
                  src={avatarUrl || undefined}
                  sx={{ width: 64, height: 64, border: `1px solid ${t.border.medium}` }}
                />
                <Box sx={{ flex: 1, display: 'flex', gap: 1 }}>
                  {cloudinaryEnabled && (
                    <Button
                      size="small"
                      startIcon={<CloudUpload sx={{ fontSize: 16 }} />}
                      onClick={() => openCloudinary('avatar')}
                      sx={{ textTransform: 'none', fontSize: '0.78rem' }}
                    >
                      Upload
                    </Button>
                  )}
                  <TextField
                    size="small"
                    fullWidth
                    placeholder={cloudinaryEnabled ? 'or paste image URL' : 'Paste image URL'}
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    InputProps={{
                      startAdornment: <LinkIcon sx={{ fontSize: 14, color: t.text.quaternary, mr: 0.75 }} />,
                    }}
                  />
                </Box>
              </Box>
            </Box>

            {/* Display name */}
            <Box>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: t.text.tertiary, mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Display name
              </Typography>
              <TextField
                size="small"
                fullWidth
                placeholder="e.g. bitcoin_maxi"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                inputProps={{ maxLength: 20 }}
                helperText="3–20 chars. Letters, numbers, space, _ or -. Leave blank to use your wallet."
              />
            </Box>

            {error && (
              <Typography sx={{ fontSize: '0.8rem', color: t.down, fontWeight: 600 }}>
                {error}
              </Typography>
            )}

            {!cloudinaryEnabled && (
              <Typography sx={{ fontSize: '0.7rem', color: t.text.quaternary }}>
                Image upload not configured - set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME +
                NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET to enable the in-app uploader.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={mutation.isPending} sx={{ color: 'text.secondary', textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={mutation.isPending}
            variant="contained"
            sx={{
              backgroundColor: t.up,
              color: t.text.contrast,
              '&:hover': { backgroundColor: t.up, filter: 'brightness(1.15)' },
              fontWeight: 700,
              textTransform: 'none',
              borderRadius: '2px',
            }}
          >
            {mutation.isPending ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
