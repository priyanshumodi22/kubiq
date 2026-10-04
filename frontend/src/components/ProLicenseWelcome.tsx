import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { AiStatusOrb } from './AiStatusOrb';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';

type ProStatus = {
  active: boolean;
  licenseFingerprint: string | null;
};

// Increment only when a materially revised welcome message should be shown once more.
const WELCOME_VERSION = 'v2';

export default function ProLicenseWelcome() {
  const { isAuthenticated, user } = useAuth();
  const [status, setStatus] = useState<ProStatus | null>(null);
  const [isManuallyOpened, setIsManuallyOpened] = useState(false);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(true);

  const userIdentity = user?.id || user?.username || user?.email;
  const storageKey = status?.licenseFingerprint && userIdentity
    ? `kubiq_pro_welcome_seen:${WELCOME_VERSION}:${userIdentity}:${status.licenseFingerprint}`
    : null;
  const isOpen = Boolean(
    status?.active
    && storageKey
    && (isManuallyOpened || !hasSeenWelcome),
  );

  useEffect(() => {
    setHasSeenWelcome(Boolean(storageKey && localStorage.getItem(storageKey)));
  }, [storageKey]);

  useEffect(() => {
    if (!isAuthenticated || !userIdentity) return;

    let cancelled = false;
    apiClient.getProStatus()
      .then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userIdentity]);

  const dismiss = useCallback(() => {
    if (storageKey) localStorage.setItem(storageKey, new Date().toISOString());
    setIsManuallyOpened(false);
    setHasSeenWelcome(true);
  }, [storageKey]);

  useEffect(() => {
    const reopen = () => {
      if (status?.active) setIsManuallyOpened(true);
    };

    window.addEventListener('kubiq-pro-card:open', reopen);
    return () => window.removeEventListener('kubiq-pro-card:open', reopen);
  }, [status?.active]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dismiss, isOpen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={dismiss}
        >
          <motion.section
            initial={{ scale: 0.95, y: 18, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 18, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-primary/35 bg-[linear-gradient(135deg,#101827_0%,#0b0d12_62%,#090b0f_100%)] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kubiq-pro-welcome-title"
            aria-describedby="kubiq-pro-welcome-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-primary/70" />
            <div className="absolute right-5 top-5 sm:right-7 sm:top-7" aria-hidden="true">
              <AiStatusOrb activity="pro" size={64} paused />
            </div>
            <div className="relative max-w-md pr-12 sm:pr-16">
              <p className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-primary">kubiq Pro</p>
              <h2 id="kubiq-pro-welcome-title" className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Welcome to kubiq Pro.
              </h2>
              <p id="kubiq-pro-welcome-description" className="mt-3 text-sm leading-6 text-gray-400">
                Your license is active. AI diagnostics and log summaries are now available in kubiq.
              </p>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-10 gap-y-3 border-t border-white/10 pt-5">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">Status</p>
                <p className="mt-1 text-sm font-medium text-white">License active</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">Access</p>
                <p className="mt-1 text-sm font-medium text-white">AI diagnostics enabled</p>
              </div>
            </div>

            <div className="mt-7 flex justify-end">
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0d12]"
              >
                Continue
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
