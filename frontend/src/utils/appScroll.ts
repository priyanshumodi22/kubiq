/** Support both desktop app-content scrolling and mobile document scrolling. */
export function scrollAppContentToTop(behavior: ScrollBehavior = 'smooth'): void {
    document.getElementById('app-content')?.scrollTo?.({ top: 0, behavior });
    window.scrollTo({ top: 0, behavior });
}
