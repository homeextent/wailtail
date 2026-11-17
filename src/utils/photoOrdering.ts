/** Swap adjacent visible items while leaving filtered-out items in their slots. */
export function moveVisiblePhoto<T>(items: T[], index: number, direction: -1 | 1, visible: (item: T) => boolean): T[] {
  const indices = items.flatMap((item, position) => visible(item) ? [position] : []);
  const position = indices.indexOf(index);
  const other = indices[position + direction];
  if (position < 0 || other === undefined) return items;
  const next = [...items];
  [next[index], next[other]] = [next[other], next[index]];
  return next;
}
