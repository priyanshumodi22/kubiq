import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function luminance(hex: string) {
  const channels = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

describe('kubi send control contrast', () => {
  it('keeps white content above 4.5:1 against default and hover backgrounds', () => {
    const css = readFileSync(new URL('./KubiPanel.css', import.meta.url), 'utf8');
    for (const selector of ['.kubi-send', '.kubi-send:hover']) {
      const line = css.split('\n').find(value => value.startsWith(`${selector} {`));
      const color = /background: (#[a-f\d]{6});/.exec(line || '')?.[1];
      expect(color).toBeTruthy();
      expect(1.05 / (luminance(color!) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
