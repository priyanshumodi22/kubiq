/** Keyboard navigation only; selection remains the owning control's responsibility. */
export function listboxIndex(key: string, current: number, count: number): number | undefined {
  if (count === 0) return undefined;
  switch (key) {
    case 'ArrowDown': return (current + 1) % count;
    case 'ArrowUp': return current <= 0 ? count - 1 : current - 1;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return undefined;
  }
}
