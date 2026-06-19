'use client';

import { useEffect, type ReactNode } from 'react';

/** Minimal centered modal with backdrop. */
const WIDTHS = { sm: 'w-[380px]', md: 'w-[460px]', lg: 'w-[560px]' } as const;

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: keyof typeof WIDTHS;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className={`relative z-10 ${WIDTHS[size]} max-w-[94vw] animate-fade-in card-elevated p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-surface-100">{title}</h3>
          <button onClick={onClose} className="text-lg text-surface-400 hover:text-surface-100" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
