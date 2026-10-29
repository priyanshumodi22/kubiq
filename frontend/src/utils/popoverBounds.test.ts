import { describe, expect, it } from 'vitest';
import { popoverBounds } from './popoverBounds';

describe('portaled picker viewport bounds', () => {
    it.each([{ width: 360, height: 640 }, { width: 640, height: 360 }, { width: 1440, height: 900 }])('keeps an edge-triggered picker reachable in $width x $height', viewport => {
        const bounds = popoverBounds({ top: viewport.height - 20, left: viewport.width - 30, width: 480 }, viewport);
        expect(bounds.top).toBeGreaterThanOrEqual(16);
        expect(bounds.left).toBeGreaterThanOrEqual(16);
        expect(bounds.left + bounds.width).toBeLessThanOrEqual(viewport.width - 16);
        expect(bounds.top + bounds.maxHeight).toBeLessThanOrEqual(viewport.height - 16);
        expect(bounds.maxHeight).toBeGreaterThanOrEqual(Math.min(320, viewport.height - 32));
    });
    it('preserves an unobstructed trigger position and supports compact menus', () => {
        expect(popoverBounds({ top: 100, left: 80, width: 180 }, { width: 1200, height: 900 }, 220)).toEqual({ top: 100, left: 80, width: 180, maxHeight: 784 });
    });
});
