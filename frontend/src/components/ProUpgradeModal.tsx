import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, X, Zap } from 'lucide-react';
import { createPortal } from 'react-dom';
import { AiStatusOrb } from './AiStatusOrb';

interface ProUpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ProUpgradeModal({ isOpen, onClose }: ProUpgradeModalProps) {
    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
                    onClick={onClose}
                    role="presentation"
                >
                    <motion.div
                        initial={{ scale: 0.94, y: 18, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.94, y: 18, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#090b0f] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="kubiq-pro-title"
                    >
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
                        <div className="absolute left-1/2 top-0 h-56 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

                        <div className="relative z-10 flex flex-col items-center p-8 text-center">
                            <button
                                type="button"
                                onClick={onClose}
                                className="absolute right-4 top-4 rounded-full border border-white/5 bg-white/5 p-1.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                aria-label="Close kubiq Pro dialog"
                            >
                                <X className="h-5 w-5" />
                            </button>

                            <div className="mb-5" aria-hidden="true">
                                <AiStatusOrb activity="pro" size={64} />
                            </div>

                            <h2 id="kubiq-pro-title" className="mb-2 text-3xl font-bold text-white">
                                Unlock <span className="text-primary">kubiq Pro</span>
                            </h2>
                            <p className="mb-8 max-w-sm text-sm leading-6 text-gray-400">
                                Unlock AI diagnostics and log summarization with your preferred AI provider.
                            </p>

                            <div className="mb-8 w-full space-y-4 rounded-xl border border-white/8 bg-white/[0.035] p-5 text-left">
                                <div className="flex items-center gap-3 text-sm text-gray-300">
                                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                                    <span>Instant AI root cause analysis</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-300">
                                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                                    <span>Anomaly and pattern detection</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-300">
                                    <Zap className="h-5 w-5 shrink-0 text-yellow-400" />
                                    <span><strong>BYOK:</strong> OpenAI, Anthropic, and Gemini</span>
                                </div>
                            </div>

                            <a
                                href="https://kubiq.priyanshumodi.in/pricing"
                                target="_blank"
                                rel="noreferrer"
                                className="flex w-full items-center justify-center rounded-xl border border-blue-300/15 bg-primary px-6 py-3 font-medium text-white shadow-[0_12px_30px_rgba(37,99,235,0.22)] transition-all hover:-translate-y-0.5 hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                            >
                                View kubiq Pro plans
                            </a>
                            <p className="mt-5 inline-block rounded-md border border-gray-700/50 bg-gray-800/30 px-3 py-1.5 text-xs font-medium text-gray-400">
                                Already have a license? Add <code className="text-primary">KUBIQ_LICENSE_KEY</code> to your environment.
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
