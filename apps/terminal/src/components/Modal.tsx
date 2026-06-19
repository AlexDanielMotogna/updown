'use client';

import { useEffect, type ReactNode } from 'react';

/** Minimal centered modal with backdrop. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-80 max-w-full animate-fade-in card-elevated p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-surface-100">{title}</h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-100" aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
