import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, X, Zap } from 'lucide-react';
import { createPortal } from 'react-dom';
import { ThinkingOrb } from 'thinking-orbs';

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
                        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-gray-800/80 bg-[#0a0a0a] shadow-[0_18px_70px_rgba(76,29,149,0.28)]"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="kubiq-pro-title"
                    >
                        <div className="absolute -left-32 -top-32 h-64 w-64 rounded-full bg-purple-600/20 blur-3xl" />
                        <div className="absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-blue-600/20 blur-3xl" />

                        <div className="relative z-10 flex flex-col items-center p-8 text-center">
                            <button
                                type="button"
                                onClick={onClose}
                                className="absolute right-4 top-4 rounded-full bg-gray-800/50 p-1.5 text-gray-500 transition-colors hover:bg-gray-700/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                                aria-label="Close kubiq Pro dialog"
                            >
                                <X className="h-5 w-5" />
                            </button>

                            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-purple-400/20 bg-purple-500/10 shadow-[0_12px_34px_rgba(124,58,237,0.22)]">
                                <ThinkingOrb state="solving" size={64} theme="dark" color="#a78bfa" />
                            </div>

                            <h2 id="kubiq-pro-title" className="mb-2 text-3xl font-bold text-white">
                                Unlock <span className="text-purple-400">kubiq Pro</span>
                            </h2>
                            <p className="mb-8 max-w-sm text-sm leading-6 text-gray-400">
                                Unlock AI diagnostics and log summarization with your preferred AI provider.
                            </p>

                            <div className="mb-8 w-full space-y-4 rounded-xl border border-gray-800/50 bg-gray-900/50 p-5 text-left">
                                <div className="flex items-center gap-3 text-sm text-gray-300">
                                    <CheckCircle2 className="h-5 w-5 shrink-0 text-purple-400" />
                                    <span>Instant AI root cause analysis</span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-gray-300">
                                    <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-400" />
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
                                className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-3 font-medium text-white shadow-[0_10px_28px_rgba(99,102,241,0.28)] transition-all hover:-translate-y-0.5 hover:from-purple-500 hover:to-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                            >
                                View kubiq Pro plans
                            </a>
                            <p className="mt-5 inline-block rounded-md border border-gray-700/50 bg-gray-800/30 px-3 py-1.5 text-xs font-medium text-gray-400">
                                Already have a license? Add <code className="text-purple-400">KUBIQ_LICENSE_KEY</code> to your environment.
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
