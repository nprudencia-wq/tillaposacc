export function randCheckoutEnabled(rate: number, confirmedRate: number | null | undefined) {
  return Number.isFinite(rate) && rate > 0 && confirmedRate != null && rate === confirmedRate;
}

export function reciprocalRate(rate: number) {
  return Number.isFinite(rate) && rate > 0 ? 1 / rate : null;
}