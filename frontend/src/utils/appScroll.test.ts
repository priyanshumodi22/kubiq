// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollAppContentToTop } from './appScroll';
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
describe('app scroll ownership', () => {
    it('resets the desktop content region and mobile document without changing the route', () => {
        const main = document.createElement('main'); main.id = 'app-content';
        const contentScroll = vi.fn(); main.scrollTo = contentScroll; document.body.append(main);
        const documentScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        scrollAppContentToTop('auto');
        expect(contentScroll).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
        expect(documentScroll).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
    });
    it('supports standalone views without an app shell', () => {
        const documentScroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        scrollAppContentToTop();
        expect(documentScroll).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });
});
