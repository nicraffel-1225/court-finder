// Parses a provider's combined "Court name (detail)" facility label — see
// lib/courts/lta.ts and lib/courts/proagenda.ts, which pack a court's own
// name and its surface/type into one string — into the two parts the
// design shows separately: the court's name, and whatever's in brackets.
export function parseFacilityLabel(facilityName: string): { name: string; detail: string | null } {
  // Non-greedy name + greedy detail, so a detail that itself contains
  // parentheses (e.g. ProAgenda's "Acrylic (Poraflex)") still splits at the
  // first " (" rather than failing to match at all.
  const match = /^(.*?)\s\((.+)\)$/.exec(facilityName);
  if (!match) return { name: facilityName, detail: null };
  return { name: match[1], detail: match[2] };
}
