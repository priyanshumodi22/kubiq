import path from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { isPathSafe } from './pathSecurity';

describe('log directory safety', () => {
  it.each([
    '/etc', '/root', '/boot', '/dev', '/proc', '/sys',
    String.raw`C:\Windows`, String.raw`C:\Program Files`, String.raw`C:\Program Files (x86)`,
  ])('rejects blocked directory %s and its children', blocked => {
    expect(isPathSafe(blocked)).toBe(false);
    expect(isPathSafe(path.join(blocked, 'private.log'))).toBe(false);
  });

  it('rejects parent traversal even when the path starts outside blocked directories', () => {
    expect(isPathSafe('logs/../private.log')).toBe(false);
  });

  it('allows an ordinary application log directory and glob', () => {
    expect(isPathSafe(path.resolve('application-logs', 'server.log'))).toBe(true);
    expect(isPathSafe(path.resolve('application-logs', '*.log'))).toBe(true);
  });
});
