/**
 * TM-03f: Goal, intake and limitations (read-only summary; full answers on web).
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import {
  ChevronRight,
  FileText,
  TriangleAlert,
} from "lucide-react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  ClientWorkspace,
  OnboardingFormResponse,
} from "@fitbud/contracts";
import { formatPersonName } from "@fitbud/core";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { useAuth } from "../../auth/AuthProvider";
import { ErrorBanner } from "../../components/ErrorBanner";
import { Screen } from "../../components/Screen";
import { Text } from "../../components/Text";
import { trainerWebUrl } from "../../lib/legalLinks";
import { reportError } from "../../lib/reportError";
import {
  coachingRows,
  contactRows,
  heightFromAnswers,
  intakeRows,
  intakeSubmittedLabel,
  limitationBlock,
  type InfoRow,
} from "./infoModel";
import { createThemedStyles, useTheme } from "../../providers/ThemeProvider";

type Props = {
  relationshipId: string;
  displayName: string;
  workspace?: ClientWorkspace | null;
  onBack: () => void;
};

export function ClientInfoScreen({
  relationshipId,
  displayName,
  workspace: workspaceProp = null,
  onBack,
}: Props) {

  const theme = useTheme();
  const styles = useStyles();
  const { api } = useAuth();
  const [workspace, setWorkspace] = useState<ClientWorkspace | null>(
    workspaceProp,
  );
  const [intake, setIntake] = useState<OnboardingFormResponse | null>(null);
  const [startWeightKg, setStartWeightKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const ws =
        workspaceProp ?? (await api.getClientWorkspace(relationshipId));
      setWorkspace(ws);

      let response: OnboardingFormResponse | null = null;
      try {
        response = await api.getOnboardingResponse(relationshipId);
      } catch (err) {
        if (!(err instanceof ApiClientError && err.status === 404)) {
          reportError("clientInfo.intake", err);
        }
      }
      setIntake(response);

      let start: number | null = null;
      try {
        const metrics = await api.getProgressMetrics(relationshipId, {
          keys: ["weight"],
          range: "all",
        });
        const weight = metrics.series.find((s) => s.key === "weight");
        const first = weight?.points
          ?.slice()
          .sort((a, b) => a.localDate.localeCompare(b.localDate))[0];
        if (first && typeof first.value === "number") start = first.value;
      } catch (err) {
        reportError("clientInfo.progress", err);
      }
      setStartWeightKg(start);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Couldn't load client info.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, relationshipId, workspaceProp]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const name = formatPersonName(
    workspace?.header.traineeDisplayName || displayName,
  );
  const first = name.split(" ")[0] || name;
  const answers = intake?.answers ?? null;
  const coaching = workspace
    ? coachingRows({
        workspace,
        startWeightKg,
        heightCm: heightFromAnswers(answers),
      })
    : [];
  const limitation = limitationBlock(answers);
  const intakeSummary = intakeRows(answers);
  const contact = workspace ? contactRows(workspace) : [];
  const submitted = intakeSubmittedLabel(intake);

  return (
    <Screen
      v3
      title={`${first} · info`}
      chrome="app"
      showHeader={false}
      refreshing={false}
      onRefresh={() => {
        setLoading(true);
        void load();
      }}
    >
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.navBtn}
        >
          <Text style={styles.navChevron}>‹</Text>
        </Pressable>
        <Text style={styles.navTitle} accessibilityRole="header">
          {`${first} · info`}
        </Text>
        <View style={styles.navBtn} />
      </View>

      {error ? <ErrorBanner message={error} /> : null}
      {loading && !workspace ? (
        <View style={styles.skel}>
          <View style={styles.skelBar} />
          <View style={styles.skelBar} />
        </View>
      ) : null}

      {workspace ? (
        <>
          <Section title="Coaching">
            {coaching.map((row) => (
              <InfoLine key={row.label} row={row} />
            ))}
          </Section>

          {limitation ? (
            <Section title="Limitations and injuries">
              <View style={styles.limitChip}>
                <TriangleAlert
                  color={theme.colors.warn}
                  size={12}
                  strokeWidth={2.2}
                />
                <Text style={styles.limitChipText}>Limitation</Text>
              </View>
              <Text style={styles.limitBody}>{limitation.body}</Text>
              <Text style={styles.limitFooter}>{limitation.footer}</Text>
            </Section>
          ) : null}

          <Section title="Intake">
            {intakeSummary.map((row) => (
              <InfoLine key={row.label} row={row} />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Intake answers on FitBud web"
              onPress={() =>
                void Linking.openURL(
                  `${trainerWebUrl()}/clients/${relationshipId}`,
                )
              }
              style={styles.intakeRow}
            >
              <View style={styles.intakeIcon}>
                <FileText
                  color={theme.colors.ink2}
                  size={18}
                  strokeWidth={2}
                />
              </View>
              <View style={styles.intakeBody}>
                <Text style={styles.intakeTitle}>Intake answers</Text>
                <Text style={styles.intakeSub}>
                  {submitted ?? "Open on FitBud web"}
                </Text>
              </View>
              <ChevronRight
                color={theme.colors.ink3}
                size={18}
                strokeWidth={2}
              />
            </Pressable>
          </Section>

          <Section title="Contact">
            {contact.map((row) => (
              <InfoLine key={row.label} row={row} />
            ))}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {

  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function InfoLine({ row }: { row: InfoRow }) {

  const styles = useStyles();
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{row.label}</Text>
      <Text style={styles.lineValue}>{row.value}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  nav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  navBtn: {
    alignItems: "center",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  navChevron: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 28,
    lineHeight: 32,
    marginTop: -2,
  },
  navTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
    fontWeight: "600",
  },
  section: { marginBottom: 16 },
  sectionTitle: {
    color: t.colors.ink3,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: t.colors.card,
    borderRadius: 16,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  line: {
    borderBottomColor: t.colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  lineLabel: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontWeight: "600",
    maxWidth: "42%",
  },
  lineValue: {
    color: t.colors.ink2,
    flex: 1,
    fontSize: 15,
    textAlign: "right",
  },
  limitChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: t.colors.warnTint,
    borderRadius: 999,
    flexDirection: "row",
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  limitChipText: {
    color: t.colors.warnInk,
    fontSize: 12,
    fontWeight: "600",
  },
  limitBody: {
    color: t.colors.ink,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 10,
    paddingBottom: 6,
  },
  limitFooter: {
    color: t.colors.ink3,
    fontSize: 12,
    marginBottom: 12,
  },
  intakeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  intakeIcon: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  intakeBody: { flex: 1, minWidth: 0 },
  intakeTitle: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 15,
    fontWeight: "600",
  },
  intakeSub: { color: t.colors.ink3, fontSize: 13, marginTop: 2 },
  skel: { gap: 10, marginTop: 12 },
  skelBar: {
    backgroundColor: t.colors.skel1,
    borderRadius: 8,
    height: 48,
  },
}));
