export function otpEmailSubject(code: string): string {
  return `Your FitBud code: ${code}`;
}

export function otpEmailBody(code: string): string {
  return `Your FitBud verification code is ${code}. It expires in 10 minutes.`;
}
