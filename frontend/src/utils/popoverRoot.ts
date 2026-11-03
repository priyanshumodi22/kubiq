/** Keep portalled menus inside the native modal's interactive top layer. */
export function popoverRoot(trigger: HTMLElement | null): HTMLElement {
  return trigger?.closest('dialog') ?? document.body;
}

