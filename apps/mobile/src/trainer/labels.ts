/** Human-readable labels for persisted / derived statuses. */
export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function typeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

/** Short opaque id fragment for compact mobile lists. */
export function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}
