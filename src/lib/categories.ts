export type Cat = { id: string; name: string; parent_id: string | null };

/** Top-level categories followed by their subcategories, labelled "Parent › Child". */
export function catOptions(cats: Cat[]) {
  const out: { id: string; label: string }[] = [];
  for (const c of cats.filter((x) => !x.parent_id)) {
    out.push({ id: c.id, label: c.name });
    for (const s of cats.filter((x) => x.parent_id === c.id)) out.push({ id: s.id, label: `${c.name} › ${s.name}` });
  }
  return out;
}

/** Suggested reorder: fill up to max stock, or double the minimum when no max is set. */
export function reorderQty(stock: number, min: number, max: number) {
  if (stock > min) return 0;
  const target = max > 0 ? max : min * 2;
  return Math.max(0, Math.ceil(target - stock));
}
