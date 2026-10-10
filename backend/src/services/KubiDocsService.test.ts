import { describe, expect, it } from '@jest/globals';
import { KubiDocsService } from './KubiDocsService';

describe('official kubiq documentation extraction', () => {
  it('extracts article sections with official source anchors and excludes scripts', () => {
    const result = KubiDocsService.extract('<main><nav>Unrelated navigation</nav><div class="docs-prose max-w-none"><h2 id="authentication">Authentication</h2><p>kubiq supports native authentication and passkeys for users.</p><script>secretScript()</script></div></main><footer>Not article text</footer>', 'configuration');
    expect(result).toHaveLength(1);
    expect(result[0].href).toBe('https://kubiq.priyanshumodi.in/docs/configuration#authentication');
    expect(result[0].text).not.toMatch(/secretScript|Unrelated navigation|Not article/);
  });
  it('does not treat error pages as documentation', () => {
    expect(KubiDocsService.extract('<html>Server error</html>', 'configuration')).toEqual([]);
  });
  it('preserves table row and cell boundaries for configuration values', () => {
    const result = KubiDocsService.extract('<main><div class="docs-prose"><h2>Authentication</h2><table><tr><td>KEYCLOAK_CLIENT_ID</td><td>kubiq</td></tr><tr><td>RP_ID</td><td>dashboard hostname</td></tr></table></div></main>', 'configuration');
    expect(result[0].text).toContain('KEYCLOAK_CLIENT_ID | kubiq |\n');
    expect(result[0].text).toContain('RP_ID | dashboard hostname');
  });
});
