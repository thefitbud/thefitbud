import { useConfig } from "../../lib/config";

function supportMailto(screenId: string, supportEmail: string): string {
  const subject = encodeURIComponent(
    `FitBud support · Trainer web · ${screenId}`,
  );
  const body = encodeURIComponent(
    `\n\n---\nApp: Trainer web\nRole: trainer\nScreen: ${screenId}\nLocal time: ${new Date().toISOString()}`,
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
        href={supportMailto("TW-28", supportEmail)}
      >
        Email FitBud support
      </a>
      <p className="muted help-promise">
        We&apos;ll get back to you within a day.
      </p>
    </div>
  );
}
