/**
 * Keeps kubi a kubiq product assistant instead of a general-purpose chatbot.
 * This gate runs before evidence collection or any provider request.
 */
const PRODUCT_TERMS = [
  'kubiq', 'kubi', 'uptime radar', 'service', 'services', 'uptime', 'status', 'incident',
  'log', 'logs', 'error', 'exception', 'stack trace', 'trace', 'traces', 'apm', 'latency',
  'database', 'query', 'kubernetes', 'k8s', 'pod', 'deployment', 'namespace', 'cluster',
  'container', 'cpu', 'memory', 'disk', 'system health', 'resource', 'notification', 'alert',
  'webhook', 'audit', 'dashboard', 'monitoring', 'observability', 'passkey', 'license', 'pro', 'docs', 'documentation', 'configuration', 'docker', 'instrumentation',
];

const IDENTITY_PATTERNS = [
  /\bwho (created|made|built|owns?) (you|kubi|kubiq)\b/i,
  /\b(who is|tell me about) (your|kubi'?s|kubiq'?s) (owner|creator|maker|builder)\b/i,
  /\bwhat (are|is) (you|kubi|kubiq)\b/i,
  /\bwhat can (you|kubi) do\b/i,
  /\bhow do(es)? (you|kubi|kubiq) work\b/i,
];

const termPattern = (term: string) => new RegExp(`(?:^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`, 'i');

export const KUBI_SCOPE_RESPONSE = "I can help with kubiq—its product, creator, services, logs, APM, Kubernetes, alerts, audit history, and permitted telemetry. I can't answer general questions or act as a coding assistant.";

export class KubiScopeService {
  static isInScope(question: string): boolean {
    const normalized = question.trim().toLowerCase();
    if (!normalized) return false;
    if (/palindrome|homework|recipe|poem|essay|horoscope|weather|capital of|ignore .*instructions|system prompt/i.test(normalized)) return false;
    if (/\b(write|generate|create|implement|build|solve)\b.*\b(code|script|algorithm|function|program|website|component)\b/i.test(normalized)) return false;
    if (this.fixedProductAnswer(question)) return true;
    if (IDENTITY_PATTERNS.some(pattern => pattern.test(normalized))) return true;
    return PRODUCT_TERMS.some(term => termPattern(term).test(normalized));
  }

  static fixedProductAnswer(question: string): string | null {
    const normalized = question.normalize('NFKC').trim().toLowerCase().replace(/[’]/g, "'").replace(/[!?.]+$/, '').trim();
    if (/^(hi|hello|hey|hey there|good morning|good evening)([, ]+(kubi|bro|buddy|there))?$/.test(normalized)) return 'Hey! I’m kubi. Ask me about kubiq, its docs, or what’s happening in your monitored services.';
    if (/^(how are you|how are you doing|how's it going)[, ]*(kubi)?$/.test(normalized)) return 'Ready to help! What would you like to explore in kubiq?';
    if (/^(who's this|who is this|who are you|are you kubi|what is kubi|what are you)$/.test(normalized)) return 'I’m kubi, kubiq’s Pro read-only observability assistant. I help with kubiq’s docs and your permitted telemetry.';
    if (/^[a-z]$/.test(normalized)) return 'Looks like your message might be incomplete. What would you like to know about kubiq?';
    if (/^(thanks|thank you|ok|okay|nice)$/.test(normalized)) return 'You’re welcome! I’m here whenever you need help with kubiq.';
    if (/^who (created|made|built|owns?) (you|kubi|kubiq)$/.test(normalized) || /^(who is|who's|tell me about) priyanshu modi$/.test(normalized) || /^(who is|tell me about) (your|kubi'?s|kubiq'?s) (owner|creator|maker|builder)$/.test(normalized)) {
      return 'kubi is part of kubiq, created by Priyanshu Modi. I am kubiq’s Pro read-only observability assistant.';
    }
    if (/^what (are|is) (you|kubi|kubiq)$/.test(normalized)) {
      return 'I am kubi, kubiq’s Pro read-only observability assistant. I help investigate permitted kubiq services, logs, APM, Kubernetes, system health, notifications, and audit evidence.';
    }
    if (/^what can (you|kubi) do$/.test(normalized) || /^how do(es)? (you|kubi|kubiq) work$/.test(normalized)) {
      return 'I investigate permitted kubiq telemetry and answer about kubiq. I am read-only: I do not modify infrastructure, run commands, restart workloads, or apply configuration.';
    }
    return null;
  }

  static isDocumentationQuestion(question: string): boolean {
    return /\b(docs?|documentation|how|explain|configure|configuration|install|setup|supported|instrumentation|retention|authentication|passkeys?)\b/i.test(question)
      && !/\b(right now|today|recent|currently|last hour|unhealthy|failing|slowest)\b/i.test(question);
  }
}
