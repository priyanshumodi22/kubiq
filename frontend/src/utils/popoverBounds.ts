type PopoverRect = { top: number; left: number; width: number };
type Viewport = { width: number; height: number };

/** Keep portaled controls within the visible viewport, including short phones. */
export function popoverBounds(rect: Readonly<PopoverRect>, viewport: Readonly<Viewport>, preferredHeight = 320) {
    const width = Math.min(rect.width, Math.max(0, viewport.width - 32));
    const height = Math.min(preferredHeight, Math.max(0, viewport.height - 32));
    const top = Math.max(16, Math.min(rect.top, viewport.height - height - 16));
    const left = Math.max(16, Math.min(rect.left, viewport.width - width - 16));
    return { top, left, width, maxHeight: Math.max(0, viewport.height - top - 16) };
}
