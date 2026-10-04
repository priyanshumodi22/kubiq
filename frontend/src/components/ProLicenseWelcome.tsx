import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BrainCircuit, CheckCircle2, FileSearch, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ThinkingOrb } from 'thinking-orbs';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';

type ProStatus = {
  active: boolean;
  licenseFingerprint: string | null;
};

export default function ProLicenseWelcome() {
  const { isAuthenticated, user } = useAuth();
  const [status, setStatus] = useState<ProStatus | null>(null);

  const userIdentity = user?.id || user?.username || user?.email;
  const storageKey = status?.licenseFingerprint && userIdentity
    ? `kubiq_pro_welcome_seen:${userIdentity}:${status.licenseFingerprint}`
    : null;
  const isOpen = Boolean(status?.active && storageKey && !localStorage.getItem(storageKey));

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
    setStatus(null);
  }, [storageKey]);

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
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
          role="presentation"
          onClick={dismiss}
        >
          <motion.section
            initial={{ scale: 0.95, y: 18, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 18, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#090b0f] p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kubiq-pro-welcome-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent" />
            <div className="absolute left-1/2 top-0 h-56 w-80 -translate-x-1/2 rounded-full bg-emerald-400/8 blur-3xl" />
            <button
              type="button"
              onClick={dismiss}
              className="absolute right-4 top-4 rounded-full border border-white/5 bg-white/5 p-1.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              aria-label="Close kubiq Pro welcome"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative mb-4 flex justify-center" aria-hidden="true">
              <ThinkingOrb state="solving" size={64} theme="dark" color="#34d399" />
            </div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">kubiq Pro is active</p>
            <h2 id="kubiq-pro-welcome-title" className="text-3xl font-bold text-white">Your AI workspace is ready.</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-400">
              Your license is verified. You can now use kubiq Pro AI features across logs and Kubernetes diagnostics.
            </p>

            <div className="my-7 grid gap-3 text-left sm:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-white/[0.035] p-4">
                <FileSearch className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm font-medium text-gray-200">Log summaries</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.035] p-4">
                <BrainCircuit className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm font-medium text-gray-200">AI diagnostics</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.035] p-4">
                <CheckCircle2 className="mb-3 h-5 w-5 text-emerald-400" />
                <p className="text-sm font-medium text-gray-200">License verified</p>
              </div>
            </div>

            <button
              type="button"
              onClick={dismiss}
              className="w-full rounded-xl border border-emerald-300/15 bg-emerald-500 px-6 py-3 font-semibold text-[#04110d] shadow-[0_12px_30px_rgba(16,185,129,0.18)] transition-all hover:-translate-y-0.5 hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Start using kubiq Pro
            </button>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
