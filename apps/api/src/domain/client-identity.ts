/**
 * Z9-18 (D-W8-10): the name and WhatsApp number a trainer sees for a client.
 *
 * The trainer can keep their own name and contact phone for a client on the
 * coaching relationship (Client settings, PATCH /client-settings/.../basic).
 * Every trainer-facing surface that shows the client's name or builds a WhatsApp
 * draft resolves them here, so Home, Clients, the workspace header and the wa.me
 * drafts agree. Pure functions over rows the caller already loaded for the acting
 * trainer's own relationships; nothing here reads ids from a request.
 */

type RelationshipIdentity = {
  clientDisplayName?: string | null;
  contactPhoneE164?: string | null;
};

function present(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The trainer-set name if there is one, else the client's own profile name.
 * Returns null when neither is set, so each caller keeps its own existing
 * fallback (invitation name, email or "Client").
 */
export function resolveClientDisplayName(
  relationship: RelationshipIdentity,
  profileDisplayName: string | null | undefined,
): string | null {
  return present(relationship.clientDisplayName) ?? present(profileDisplayName);
}

/**
 * The trainer-set contact phone if there is one, else the client's sign-in mobile.
 * Null when neither is set.
 */
export function resolveClientWhatsappE164(
  relationship: RelationshipIdentity,
  signInMobileE164: string | null | undefined,
): string | null {
  return present(relationship.contactPhoneE164) ?? present(signInMobileE164);
}
