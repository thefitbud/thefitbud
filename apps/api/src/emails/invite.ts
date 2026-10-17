export function inviteEmailSubject(trainerName: string): string {
  return `${trainerName} invited you to FitBud`;
}

export function inviteEmailBody(inviteUrl: string, trainerName: string): string {
  return `Hi — ${trainerName} invited you to join FitBud.\n\nAccept your invite: ${inviteUrl}\n`;
}
