// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAvatarFile } from './readAvatarFile';

afterEach(() => vi.unstubAllGlobals());

describe('avatar data URL reading', () => {
  function readerWith(result: string | ArrayBuffer | null, fail = false) {
    class Reader {
      result = result;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        if (fail) this.onerror?.();
        else this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', Reader);
  }

  it('preserves the actual data URL without rewriting it', async () => {
    readerWith('data:image/png;base64,ZmFrZQ==');
    await expect(readAvatarFile(new File(['fake'], 'avatar.png'))).resolves.toBe('data:image/png;base64,ZmFrZQ==');
  });

  it.each([null, new ArrayBuffer(4)])('rejects a non-string FileReader result instead of coercing it', async result => {
    readerWith(result);
    await expect(readAvatarFile(new File(['fake'], 'avatar.png'))).rejects.toThrow('Unable to read image');
  });

  it('propagates read failures to the existing UI error path', async () => {
    readerWith(null, true);
    await expect(readAvatarFile(new File(['fake'], 'avatar.png'))).rejects.toThrow('Unable to read image');
  });
});
