/**
 * Client Settings tab sections (W13-10, D-WEB-3, frames W-209, W-IP07, W-181,
 * W-146). The sub-nav lists seven sections; each has a stable hash so other
 * screens (and old links) can deep-link into it.
 *
 * Hash ids: `#basic` (Client details), `#subscription` (Package and payments),
 * `#coaching` (Coaching setup), `#checkins` (Check-ins), `#reminders`,
 * `#onboarding` (Onboarding answers) and `#danger` (Danger zone).
 * `#relationship` is kept as an alias of `#danger`: it was the Coaching
 * relationship section, whose End coaching action moved to the Danger zone.
 *
 * Sections share a panel where the frames draw them together: Client details,
 * Package and payments and the Danger zone are one scroll (W-209 / iPad);
 * Coaching setup and Check-ins are one form with one Save (W-IP07).
 */
export type SettingsSectionId =
  | "basic"
  | "subscription"
  | "coaching"
  | "checkins"
  | "reminders"
  | "onboarding"
  | "danger";

export type SettingsPanelId = "details" | "coaching" | "reminders" | "onboarding";

export type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  panel: SettingsPanelId;
};

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: "basic", label: "Client details", panel: "details" },
  { id: "subscription", label: "Package and payments", panel: "details" },
  { id: "coaching", label: "Coaching setup", panel: "coaching" },
  { id: "checkins", label: "Check-ins", panel: "coaching" },
  { id: "reminders", label: "Reminders", panel: "reminders" },
  { id: "onboarding", label: "Onboarding answers", panel: "onboarding" },
  { id: "danger", label: "Danger zone", panel: "details" },
] as const;

/** Old ids that still land on a section. */
const HASH_ALIASES: Record<string, SettingsSectionId> = {
  relationship: "danger",
};

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = "basic";

/** `#subscription` → "subscription"; unknown or empty → Client details. */
export function sectionFromHash(hash: string): SettingsSectionId {
  const raw = hash.replace(/^#/, "").trim();
  const id = HASH_ALIASES[raw] ?? raw;
  return SETTINGS_SECTIONS.some((section) => section.id === id)
    ? (id as SettingsSectionId)
    : DEFAULT_SETTINGS_SECTION;
}

export function panelForSection(id: SettingsSectionId): SettingsPanelId {
  return SETTINGS_SECTIONS.find((section) => section.id === id)?.panel ?? "details";
}

/**
 * The first section of each panel opens at the top of the tab (the client
 * header stays in view); the others are scrolled to.
 */
export function isFirstSectionOfPanel(id: SettingsSectionId): boolean {
  const panel = panelForSection(id);
  return SETTINGS_SECTIONS.find((section) => section.panel === panel)?.id === id;
}

export function settingsSectionLabel(id: SettingsSectionId): string {
  return SETTINGS_SECTIONS.find((section) => section.id === id)?.label ?? "Client details";
}

/** The DOM id each section's container carries, for scrolling and `aria-labelledby`. */
export function sectionElementId(id: SettingsSectionId): string {
  return `cs-${id}`;
}

export function clientSettingsHref(
  relationshipId: string,
  section?: SettingsSectionId,
): string {
  const base = `/clients/${relationshipId}/settings`;
  return section ? `${base}#${section}` : base;
}
