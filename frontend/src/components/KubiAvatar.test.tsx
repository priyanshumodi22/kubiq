import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  refs: [] as Array<{ current: unknown }>,
}));
vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
  useRef: (value: unknown) => { const ref = { current: value }; harness.refs.push(ref); return ref; },
}));
import { KubiAvatar } from './KubiAvatar';

describe('kubi avatar animation lifecycle', () => {
  let reduced = false;
  let hidden = false;
  let intersect: (entries: Array<{ isIntersecting: boolean }>) => void;
  const disconnect = vi.fn();
  const mediaListeners = new Map<string, () => void>();
  const docListeners = new Map<string, () => void>();
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  let cleanup: (() => void) | void;

  beforeEach(() => {
    harness.effects.length = 0; harness.refs.length = 0;
    reduced = false; hidden = false; sequence = 0;
    frames.clear(); mediaListeners.clear(); docListeners.clear(); disconnect.mockClear();
    vi.stubGlobal('window', { devicePixelRatio: 3, matchMedia: () => ({
      get matches() { return reduced; },
      addEventListener: (name: string, fn: () => void) => mediaListeners.set(name, fn),
      removeEventListener: (name: string) => mediaListeners.delete(name),
    }) });
    vi.stubGlobal('document', {
      get hidden() { return hidden; },
      addEventListener: (name: string, fn: () => void) => docListeners.set(name, fn),
      removeEventListener: (name: string) => docListeners.delete(name),
    });
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++sequence, fn); return sequence; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: typeof intersect) { intersect = callback; }
      observe() { /* visibility controlled by each test */ }
      disconnect = disconnect;
    });
  });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });

  const mount = (paused = false) => {
    KubiAvatar({ paused, size: 48 });
    const context = new Proxy({}, { get: (_target, key) => key === 'createLinearGradient' ? () => ({ addColorStop: vi.fn() }) : vi.fn(), set: () => true });
    const canvas = { width: 48, height: 48, getContext: () => context };
    harness.refs[0].current = canvas;
    harness.effects[0]();
    cleanup = harness.effects[1]();
    return canvas;
  };

  it('caps pixel density and cancels every resource on unmount', () => {
    const canvas = mount();
    expect(canvas.width).toBe(96);
    expect(frames.size).toBe(1);
    cleanup?.(); cleanup = undefined;
    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(mediaListeners.size + docListeners.size).toBe(0);
  });
  it('draws a still avatar with reduced motion and responds to preference changes', () => {
    reduced = true; mount();
    expect(frames.size).toBe(0);
    reduced = false; mediaListeners.get('change')?.();
    expect(frames.size).toBe(1);
    reduced = true; mediaListeners.get('change')?.();
    expect(frames.size).toBe(0);
  });
  it('pauses offscreen and in hidden tabs without duplicating loops on resume', () => {
    mount(); intersect([{ isIntersecting: false }]); expect(frames.size).toBe(0);
    intersect([{ isIntersecting: true }]); expect(frames.size).toBe(1);
    hidden = true; docListeners.get('visibilitychange')?.(); expect(frames.size).toBe(0);
    hidden = false; docListeners.get('visibilitychange')?.(); expect(frames.size).toBe(1);
    docListeners.get('visibilitychange')?.(); expect(frames.size).toBe(1);
  });
  it('does not animate a covered launcher', () => { mount(true); expect(frames.size).toBe(0); });
});
