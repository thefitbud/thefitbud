const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Start of a civil date as a UTC timestamp for datetime query filters. */
export function civilDateStart(value: string): string | undefined {
  if (!CIVIL_DATE.test(value)) return undefined;
  return `${value}T00:00:00.000Z`;
}

/** End of a civil date as a UTC timestamp for datetime query filters. */
export function civilDateEnd(value: string): string | undefined {
  if (!CIVIL_DATE.test(value)) return undefined;
  return `${value}T23:59:59.999Z`;
}
