'use client';

import { useState } from 'react';
import { Modal } from './Modal';
import { IS_TESTNET } from '@/lib/api';

/** Deposit instructions. HL credits your account from USDC bridged on Arbitrum;
 * on testnet you fund via the faucet. (Programmatic bridging can come later.) */
export function DepositModal({ open, onClose, evmAddress }: { open: boolean; onClose: () => void; evmAddress?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Deposit USDC">
      <div className="space-y-3 text-sm text-surface-300">
        {IS_TESTNET ? (
          <p>
            On testnet, fund your account with the HyperLiquid faucet:{' '}
            <a className="text-info hover:underline" href="https://app.hyperliquid-testnet.xyz/drip" target="_blank" rel="noreferrer">
              testnet faucet ↗
            </a>
          </p>
        ) : (
          <p>Send <span className="text-surface-100">USDC on Arbitrum</span> to your account address below; HyperLiquid credits it automatically.</p>
        )}

        <div>
          <div className="mb-1 text-xs text-surface-400">Your account</div>
          <div className="flex items-center gap-2 rounded border border-surface-800 bg-[#1c1c23] px-2 py-1.5">
            <span className="truncate font-mono text-xs text-surface-100">{evmAddress ?? 'not connected'}</span>
            {evmAddress && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(evmAddress);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="ml-auto rounded border border-surface-700 px-2 py-0.5 text-xs text-surface-300 hover:bg-surface-800"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
