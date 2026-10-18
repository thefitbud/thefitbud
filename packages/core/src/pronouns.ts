/** Possessive pronoun from the client's gender/pronoun field. Fallback: "their". */
export function possessivePronoun(
  genderOrPronoun: string | null | undefined,
): string {
  const raw = (genderOrPronoun ?? "").trim().toLowerCase();
  if (
    raw === "female" ||
    raw === "woman" ||
    raw === "f" ||
    raw === "she" ||
    raw === "her"
  ) {
    return "her";
  }
  if (
    raw === "male" ||
    raw === "man" ||
    raw === "m" ||
    raw === "he" ||
    raw === "his"
  ) {
    return "his";
  }
  if (raw === "their" || raw === "they") return "their";
  return "their";
}
