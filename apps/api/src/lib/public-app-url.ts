/** Build the public app origin for invite deep links (scheme from ENVIRONMENT). */
export function publicAppOrigin(env: {
  APP_HOST?: string;
  ENVIRONMENT?: string;
}): string {
  const raw = (env.APP_HOST ?? "localhost:5173").trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(raw)) return raw;
  const local =
    !env.ENVIRONMENT ||
    env.ENVIRONMENT === "local" ||
    env.ENVIRONMENT === "development" ||
    env.ENVIRONMENT === "dev";
  const scheme = local ? "http" : "https";
  return `${scheme}://${raw}`;
}

export function invitePublicUrl(
  env: { APP_HOST?: string; ENVIRONMENT?: string },
  token: string,
): string {
  return `${publicAppOrigin(env)}/i/${token}`;
}
