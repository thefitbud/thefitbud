import { useConfig } from "../../lib/config";

const APP_VERSION = "0.0.0";
const SCREEN_NAME = "Help";
const SCREEN_ID = "TW-28";

function supportMailto(supportEmail: string): string {
  const subject = encodeURIComponent(
    `FitBud support · Trainer web · ${SCREEN_ID} ${SCREEN_NAME}`,
  );
  const body = encodeURIComponent(
    `\n\n---\nApp: Trainer web\nVersion: ${APP_VERSION}\nRole: trainer\nScreen: ${SCREEN_ID} ${SCREEN_NAME}\nLocal time: ${new Date().toISOString()}`,
  );
  return `mailto:${supportEmail}?subject=${subject}&body=${body}`;
}

export function SettingsHelpPage() {
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? "tech@thefitbud.com";
  return (
    <div className="settings-panel">
      <h2>Help</h2>
      <a
        className="settings-help-row button-secondary"
        href={supportMailto(supportEmail)}
      >
        Email FitBud support
      </a>
      <p className="muted help-promise">
        We&apos;ll get back to you within a day.
      </p>
    </div>
  );
}
