import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Activity, Boxes, FileText, History, Plus, Send, ShieldCheck, Trash2, Waypoints, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/api';
import { ProUpgradeModal } from './ProUpgradeModal';
import { KubiAvatar } from './KubiAvatar';
import { KubiActivity } from './KubiActivity';
import { recordKubiStep } from './kubiActivityState';
import './KubiPanel.css';
import { kubiStateForEvent, type KubiAvatarState } from './kubiAvatarState';

type Evidence = { type: string; label: string; href: string };
type Message = { id: string; role: 'user' | 'assistant'; content: string; createdAt: string; evidence?: Evidence[]; clarification?: { options: string[] } };
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: string };
type Status = { enabled: boolean; proActive: boolean; providerConfigured: boolean; reason?: string };

const suggestions = [
  'Which services are unhealthy right now?',
  'Show recent errors for my service',
  'Which traces are slow in the last hour?',
  'What do these Kubernetes pod events indicate?',
];

export function KubiPanel() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<string | null>(null);
  const [avatarState, setAvatarState] = useState<KubiAvatarState>('idle');
  const [draft, setDraft] = useState('');
  const [draftEvidence, setDraftEvidence] = useState<Evidence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<KubiAvatarState[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reducedMotion = useReducedMotion();

  const isAvailable = Boolean(status?.enabled && status?.proActive && status?.providerConfigured);
  const messages = useMemo(() => [
    ...(conversation?.messages || []),
    ...(pendingQuestion ? [{ id: 'kubi-question', role: 'user' as const, content: pendingQuestion, createdAt: '' }] : []),
  ], [conversation, pendingQuestion]);

  const refreshStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    try { setStatus(await apiClient.getKubiStatus()); } catch { setStatus({ enabled: false, proActive: false, providerConfigured: false, reason: 'KUBI_UNAVAILABLE' }); }
  }, [isAuthenticated]);

  const refreshHistory = async () => {
    setHistoryLoading(true); setHistoryError(null);
    try { setHistory(await apiClient.getKubiConversations()); } catch { setHistoryError('Could not load history. Close and reopen it to retry.'); }
    finally { setHistoryLoading(false); }
  };

  useEffect(() => { refreshStatus(); }, [refreshStatus]);
  useEffect(() => { if (open && historyOpen && isAvailable) refreshHistory(); }, [open, historyOpen, isAvailable]);
  useEffect(() => {
    if (open && nearBottom.current && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [open, draft, pendingQuestion, phase, messages.length]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const closePanel = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const navigateFromKubi = (href?: string) => {
    if (!href) return;
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
      const appRelativeHref = href.startsWith('/') ? `${basePath}${href}` : href;
      const destination = new URL(appRelativeHref, window.location.origin);
      if (destination.protocol !== 'http:' && destination.protocol !== 'https:') return;
      closePanel();
      window.location.assign(destination.href);
    } catch {
      setError('That kubi reference is not a valid link.');
    }
  };

  const selectConversation = async (id: string) => {
    if (busyRef.current || historyBusy) return;
    setHistoryBusy(true);
    try { setConversation(await apiClient.getKubiConversation(id)); resetActivity(); setHistoryOpen(false); } catch { setHistoryError('That kubi conversation is no longer available.'); }
    finally { setHistoryBusy(false); }
  };

  const resetActivity = () => {
    setPendingQuestion(''); setDraft(''); setDraftEvidence([]); setSteps([]); setError(null); setAvatarState('idle');
    nearBottom.current = true;
  };
  const newConversation = () => {
    if (busyRef.current || historyBusy) return;
    resetActivity(); setConversation(null); setHistoryOpen(false); setConfirmClear(false); inputRef.current?.focus();
  };

  const ask = async (event?: FormEvent, suggested?: string) => {
    event?.preventDefault();
    const question = (suggested || input).trim();
    if (!question || busyRef.current || historyBusy) return;
    if (!isAvailable) { setUpgradeOpen(true); return; }

    busyRef.current = true;
    resetActivity(); setHistoryOpen(false); setInput(''); setPendingQuestion(question); setSteps(['thinking']); setPhase('Understanding your question'); setAvatarState('thinking');
    let currentState: KubiAvatarState = 'thinking';
    try {
      let current = conversation;
      if (!current) {
        current = await apiClient.createKubiConversation(question.slice(0, 80));
        setConversation(current);
      }
      if (!current) throw new Error('Unable to create kubi conversation.');
      const conversationId = current.id;
      let terminalEvent = false;
      await apiClient.streamKubiMessage(conversationId, question, async (eventName, data) => {
        if (terminalEvent) return;
        currentState = kubiStateForEvent(currentState, eventName, data.state);
        setAvatarState(currentState);
        const eventState = currentState;
        setSteps(previous => recordKubiStep(previous, eventState));
        if (eventName === 'status') setPhase(data.label || data.state);
        if (eventName === 'answer_delta') { setPhase('Writing the answer'); setDraft(previous => previous + (data.text || '')); }
        if (eventName === 'evidence') setDraftEvidence(previous => [...previous, data]);
        if (eventName === 'error') { terminalEvent = true; setError(data.message || 'kubi could not complete that request.'); setInput(question); setPhase(null); }
        if (eventName === 'done') {
          terminalEvent = true;
          const updated = await apiClient.getKubiConversation(conversationId);
          setConversation(updated); setPendingQuestion(''); setDraft(''); setDraftEvidence([]); setPhase(null);
        }
      });
      if (!terminalEvent) throw new Error('kubi stream ended before completion.');
    } catch {
      setError('kubi could not reach the server. Check your connection and try again.');
      setPhase(null);
      setAvatarState('error');
      setInput(question);
    } finally { busyRef.current = false; }
  };

  const clearHistory = async () => {
    if (busyRef.current || historyBusy) return;
    setHistoryBusy(true);
    try { await apiClient.clearKubiConversations(); resetActivity(); setConversation(null); setHistory([]); setHistoryOpen(false); setConfirmClear(false); }
    catch { setHistoryError('History could not be deleted. Please try again.'); }
    finally { setHistoryBusy(false); }
  };

  if (!isAuthenticated) return null;

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => isAvailable ? setOpen(true) : setUpgradeOpen(true)}
        className="kubi-launcher" hidden={open}
        aria-label="Ask kubi">
        <span className="kubi-thought">Ask kubi</span><KubiAvatar size={76} paused={open} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.aside initial={{ x: reducedMotion ? 0 : '100%' }} animate={{ x: 0 }} exit={{ x: reducedMotion ? 0 : '100%' }} transition={reducedMotion ? { duration: 0 } : { type: 'spring', damping: 30, stiffness: 300 }}
            className="kubi-panel" role="dialog" aria-label="kubi assistant">
            <header className="kubi-header">
              <div className="kubi-identity"><KubiAvatar size={44} state={avatarState} /><div><h2>kubi<span className="kubi-pro">Pro</span></h2><p>Your observability companion</p></div></div>
              <div className="kubi-tools">
                <button type="button" onClick={newConversation} disabled={Boolean(phase) || historyBusy} className="kubi-icon-button" aria-label="New kubi conversation" title="New conversation"><Plus size={19} /></button>
                <button type="button" onClick={() => { setHistoryOpen(value => !value); setConfirmClear(false); }} className="kubi-icon-button" aria-label="kubi conversation history" aria-expanded={historyOpen} title="History"><History size={19} /></button>
                <button type="button" onClick={closePanel} className="kubi-icon-button" aria-label="Close kubi" title="Close"><X size={20} /></button>
              </div>
            </header>

            {historyOpen && <div className="kubi-history">
              <div className="kubi-history-heading"><span>Private history · 90 days</span><button type="button" disabled={Boolean(phase) || historyBusy || !history.length} onClick={() => setConfirmClear(true)} className="kubi-icon-button" aria-label="Clear kubi history"><Trash2 size={16} /></button></div>
              {confirmClear && <div className="kubi-clear-confirm"><p>Delete all your kubi conversations? This cannot be undone.</p><div><button type="button" disabled={historyBusy} onClick={() => setConfirmClear(false)}>Cancel</button><button type="button" disabled={historyBusy} onClick={clearHistory}>{historyBusy ? 'Deleting…' : 'Delete history'}</button></div></div>}
              {historyError && <p className="kubi-error" role="alert">{historyError}</p>}
              {historyLoading ? <p role="status" className="kubi-history-empty">Loading conversations…</p> : history.length ? history.map(item => <button type="button" key={item.id} disabled={Boolean(phase) || historyBusy} onClick={() => selectConversation(item.id)} className="kubi-history-item"><span>{item.title}</span><small>{new Date(item.updatedAt).toLocaleString()}</small></button>) : !historyError && <p className="kubi-history-empty">Your conversations will appear here.</p>}
            </div>}

            <div ref={bodyRef} className="kubi-body" onScroll={event => { const el = event.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
              {!messages.length && <div className="kubi-welcome"><div className="kubi-stage"><KubiAvatar size={170} /></div><h3>Let’s look <span>into it.</span></h3><p>Bring a question. I’ll follow the signals across your services, logs, traces and Kubernetes.</p><div className="kubi-suggestions">{suggestions.map((suggestion, index) => {
                const Icon = [Activity, FileText, Waypoints, Boxes][index];
                return <button key={suggestion} type="button" onClick={() => ask(undefined, suggestion)} className="kubi-suggestion"><span><Icon size={16} />{['Services', 'Logs', 'Traces', 'Kubernetes'][index]}</span><p>{suggestion}</p></button>;
              })}</div></div>}
              <div className="kubi-conversation">{messages.map(message => <div key={message.id} className={message.role === 'user' ? 'kubi-user-message' : 'kubi-answer'}>
                {message.role === 'assistant' ? <><div className="kubi-answer-author"><KubiAvatar size={30} paused />kubi{Boolean(message.evidence?.length) && <span>{message.evidence?.some(item => item.type === 'documentation') ? 'From kubiq docs' : 'From your telemetry'}</span>}</div><ReactMarkdown components={{ a: ({ href, children }) => <button type="button" onClick={() => navigateFromKubi(href)} className="kubi-inline-link">{children}</button>, img: ({ alt }) => <span>{alt || 'Image omitted'}</span> }}>{message.content}</ReactMarkdown></> : message.content}
                {message.clarification && <div className="kubi-clarification" role="group" aria-label="Clarification choices">{message.clarification.options.map(option => <button key={option} type="button" disabled={Boolean(phase) || historyBusy || message.id !== messages[messages.length - 1]?.id} onClick={() => void ask(undefined, option)}>{option}</button>)}<small>You can also type your answer below.</small></div>}
                {message.evidence?.length ? <details className="kubi-evidence" open><summary>{message.evidence.length} evidence reference{message.evidence.length === 1 ? '' : 's'}</summary><div className="kubi-evidence-links">{message.evidence.map((item, index) => <button type="button" key={`${item.href}-${index}`} onClick={() => navigateFromKubi(item.href)}><FileText size={14} /><span>{item.label}</span></button>)}</div></details> : null}
              </div>)}</div>
              {steps.includes('searching') && <KubiActivity state={avatarState} steps={steps} phase={phase} />}
              {phase && !steps.includes('searching') && <div className="kubi-understanding" role="status"><KubiAvatar size={32} state="thinking" /><span>Understanding your question…</span></div>}
              {draft && <article className="kubi-answer"><div className="kubi-answer-author">kubi<span>{phase ? 'Composing' : 'Partial answer'}</span></div><ReactMarkdown components={{ a: ({ href, children }) => <button type="button" onClick={() => navigateFromKubi(href)} className="kubi-inline-link">{children}</button>, img: ({ alt }) => <span>{alt || 'Image omitted'}</span> }}>{draft}</ReactMarkdown>{draftEvidence.length > 0 && <div className="kubi-evidence-links">{draftEvidence.map((item, index) => <button type="button" key={`${item.href}-${index}`} onClick={() => navigateFromKubi(item.href)}><FileText size={14} /><span>{item.label}</span></button>)}</div>}</article>}
            </div>

            <footer className="kubi-footer">{error && <p role="alert" className="kubi-error">{error}</p>}<form noValidate onSubmit={ask} className="kubi-composer"><label htmlFor="kubi-question">Ask kubi</label><div className="kubi-composer-row"><textarea id="kubi-question" ref={inputRef} value={input} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} rows={2} maxLength={4000} placeholder={messages.length ? 'Ask a follow-up…' : 'What would you like to investigate?'} aria-describedby="kubi-trust" /><button type="submit" disabled={!input.trim() || Boolean(phase) || historyBusy} className="kubi-send" aria-label="Send kubi question"><Send size={18} /></button></div></form><p id="kubi-trust" className="kubi-trust"><ShieldCheck size={12} />Read-only · Permitted evidence only</p></footer>
          </motion.aside>
        )}
      </AnimatePresence>
      <ProUpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} unavailableReason={status?.reason === 'AI_NOT_CONFIGURED' || status?.reason === 'DISABLED' ? status.reason : undefined} />
    </>
  );
}
