function civilDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900) return null;
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Completed years as of a civil today. Null when the birth date is missing, invalid, or in the future. */
export function deriveAge(
  dateOfBirth: string | null | undefined,
  today: string,
): number | null {
  if (!dateOfBirth) return null;
  const birth = civilDate(dateOfBirth);
  const current = civilDate(today);
  if (!birth || !current) return null;
  let age = current.year - birth.year;
  if (
    current.month < birth.month ||
    (current.month === birth.month && current.day < birth.day)
  ) {
    age -= 1;
  }
  if (age < 0) return null;
  return age;
}
