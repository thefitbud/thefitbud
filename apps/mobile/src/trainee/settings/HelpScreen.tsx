import { useState } from "react";
import { Linking, View } from "react-native";
import { Mail, MessageCircle } from "lucide-react-native";
import { whatsappHref } from "@fitbud/core";
import { BottomSheet } from "../../components/BottomSheet";
import { Button } from "../../components/Button";
import { Text } from "../../components/Text";
import { useConfig } from "../../providers/ConfigProvider";
import { ThemeScope, useTheme } from "../../providers/ThemeProvider";
import { reportError } from "../../lib/reportError";
import { buildSupportMailto, DEFAULT_SUPPORT_EMAIL } from "../../lib/support";
import { M2Group, M2Page, M2Row } from "./m2";

type Props = {
  onBack: () => void;
  coachName: string;
  coachWhatsappE164: string | null | undefined;
  /** False once coaching ended: the coach row goes. */
  coachingActive: boolean;
};

async function copyText(value: string): Promise<boolean> {
  const clipboard = (
    globalThis as { navigator?: { clipboard?: { writeText?: (v: string) => Promise<void> } } }
  ).navigator?.clipboard;
  if (!clipboard?.writeText) return false;
  await clipboard.writeText(value);
  return true;
}

/** TR-20e Help: email the FitBud team, or message the coach (a wa.me draft). */
function HelpScreenBody({ onBack, coachName, coachWhatsappE164, coachingActive }: Props) {
  const theme = useTheme();
  const { config } = useConfig();
  const supportEmail = config?.supportEmail ?? DEFAULT_SUPPORT_EMAIL;
  const coachFirst = coachName.trim().split(/\s+/)[0] || "your coach";
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function emailTeam() {
    const url = buildSupportMailto({
      supportEmail,
      screenId: "TR-20e",
      role: "trainee",
      extra: "Screen name: Help",
    });
    const can = await Linking.canOpenURL(url).catch(() => false);
    if (can) {
      await Linking.openURL(url).catch((err: unknown) => reportError("Help.email", err));
      return;
    }
    setCopied(null);
    setFallbackOpen(true);
  }

  const showCoach = coachingActive && Boolean(coachWhatsappE164);

  return (
    <M2Page title="Help" onBack={onBack} testID="help">
      <M2Group>
        <M2Row
          icon={<Mail color={theme.colors.ink2} size={20} strokeWidth={1.9} />}
          label="Email the FitBud team"
          hint={`${supportEmail} · replies in 1 day`}
          onPress={() => {
            void emailTeam();
          }}
        />
        {showCoach ? (
          <M2Row
            icon={<MessageCircle color={theme.colors.ink2} size={20} strokeWidth={1.9} />}
            label={`Message ${coachFirst}`}
            hint="For your plan, food or workouts"
            accessibilityLabel={`Message ${coachFirst} on WhatsApp`}
            onPress={() => {
              const href = whatsappHref({
                phoneE164: coachWhatsappE164 ?? "",
                draftText: `Hi ${coachFirst}, I have a question.`,
              });
              void Linking.openURL(href).catch((err: unknown) =>
                reportError("Help.whatsapp", err),
              );
            }}
          />
        ) : null}
      </M2Group>
      <Text tone="ink3" style={{ fontSize: 15, lineHeight: 21, paddingHorizontal: 4 }}>
        {showCoach
          ? `Questions about your plan go to ${coachFirst}. Questions about the app go to the FitBud team.`
          : "Questions about the app go to the FitBud team."}
      </Text>

      <BottomSheet
        visible={fallbackOpen}
        title="Email support"
        subtitle="We'll get back to you within a day."
        onDismiss={() => setFallbackOpen(false)}
      >
        <Text variant="body" style={{ marginBottom: 8 }}>
          {supportEmail}
        </Text>
        {copied ? (
          <Text tone="ink3" style={{ marginBottom: 8 }}>
            {copied}
          </Text>
        ) : null}
        <View style={{ gap: 8 }}>
          <Button
            label="Copy address"
            variant="secondary"
            onPress={() => {
              void copyText(supportEmail).then((ok) => {
                setCopied(ok ? `Email address copied: ${supportEmail}` : supportEmail);
              });
            }}
          />
        </View>
      </BottomSheet>
    </M2Page>
  );
}

/** HelpScreen in the system theme (Z12-49): its own styles read the scope. */
export function HelpScreen(props: Parameters<typeof HelpScreenBody>[0]) {
  return (
    <ThemeScope scheme="system">
      <HelpScreenBody {...props} />
    </ThemeScope>
  );
}
