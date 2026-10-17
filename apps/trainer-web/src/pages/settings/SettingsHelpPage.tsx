import { useConfig } from "../../lib/config";

function supportMailto(screen: string): string {
  const version = "trainer-web";
  const subject = encodeURIComponent("FitBud trainer support");
  const body = encodeURIComponent(
    `App version: ${version}\nRole: trainer\nScreen: ${screen}\n\nDescribe what happened:\n`,
  );
  return `mailto:tech@thefitbud.com?subject=${subject}&body=${body}`;
}

export function SettingsHelpPage() {
  useConfig();
  return (
    <div className="settings-panel">
      <h2>Help</h2>
      <a className="button-secondary" href={supportMailto("/settings/help")}>
        Email FitBud support
      </a>
      <p className="muted help-promise">
        We&apos;ll get back to you within a day.
      </p>
    </div>
  );
}
