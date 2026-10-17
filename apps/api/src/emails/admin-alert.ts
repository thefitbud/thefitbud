export function adminAlertEmailSubject(title: string): string {
  return `[FitBud alert] ${title}`;
}

export function adminAlertEmailBody(body: string): string {
  return body;
}
