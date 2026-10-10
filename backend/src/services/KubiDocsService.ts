import axios from 'axios';

const ORIGIN = 'https://kubiq.priyanshumodi.in';
const GUIDES = ['quick-start', 'configuration', 'apm', 'node-agent', 'python-agent', 'kubernetes', 'deployment-files'];
type Passage = { title: string; href: string; text: string };

const plainText = (html: string) => html.replace(/<\/(td|th)>/gi, ' | ').replace(/<\/(tr|p|li|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(?:39|x27);/g, "'").replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').trim();

/** Only published, allowlisted kubiq pages are fetched; never a user-provided URL. */
export class KubiDocsService {
  private static cache: Passage[] = [];
  private static expires = 0;
  private static pending: Promise<void> | undefined;

  static extract(html: string, slug: string): Passage[] {
    const safe = html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const article = safe.match(/<div[^>]*class="[^"]*docs-prose[^"]*"[^>]*>([\s\S]*?)(?:<\/main>|$)/i)?.[1];
    if (!article) return [];
    return article.split(/(?=<h2\b)/i).map(section => {
      const heading = section.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
      const anchor = section.match(/<h2\b[^>]*id="([a-z0-9-]+)"/i)?.[1];
      return { title: heading ? plainText(heading[1]) : slug.replace(/-/g, ' '), href: `${ORIGIN}/docs/${slug}${anchor ? `#${anchor}` : ''}`, text: plainText(section).slice(0, 8000) };
    }).filter(item => item.text.length > 30);
  }

  static async search(question: string): Promise<Passage[]> {
    if (Date.now() >= this.expires) {
      if (!this.pending) this.pending = this.refresh().finally(() => { this.pending = undefined; });
      await this.pending;
    }
    const words = [...new Set(question.toLowerCase().match(/[a-z0-9-]{3,}/g) || [])].filter(word => !['how', 'does', 'what', 'the', 'kubiq', 'docs', 'documentation', 'explain', 'can', 'you', 'with', 'about', 'please'].includes(word));
    const ranked = this.cache.map(item => ({ item, score: words.reduce((sum, word) => sum + (item.title.toLowerCase().includes(word) ? 5 : 0) + (item.text.toLowerCase().includes(word) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score);
    return ranked.filter(result => result.score > 0 && result.score >= (ranked[0]?.score || 0) / 2).slice(0, 3).map(result => result.item);
  }

  private static async refresh(): Promise<void> {
    const results = await Promise.all(GUIDES.map(async slug => {
      try {
        const response = await axios.get<string>(`${ORIGIN}/docs/${slug}`, { timeout: 6000, maxContentLength: 1_000_000, maxRedirects: 0, responseType: 'text' });
        return this.extract(response.data, slug);
      } catch { return []; }
    }));
    this.cache = results.flat();
    this.expires = Date.now() + (this.cache.length ? 3_600_000 : 60_000);
  }
}
