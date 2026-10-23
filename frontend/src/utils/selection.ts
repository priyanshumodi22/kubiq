export type SelectionUpdate<T> = (selected: readonly T[], item: T) => T[];

/** Preserve controlled-checkbox semantics without mutating the existing selection. */
export function addSelection<T>(selected: readonly T[], item: T): T[] {
  return [...selected, item];
}

export function removeSelection<T>(selected: readonly T[], item: T): T[] {
  return selected.filter(entry => entry !== item);
}
