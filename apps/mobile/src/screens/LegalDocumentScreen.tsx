import { useCallback, useState, type ReactNode } from "react";
import { Linking, Modal, Pressable, View } from "react-native";
import { ExternalLink, TriangleAlert } from "lucide-react-native";
import { spacing } from "@fitbud/ui-mobile";
import {
  LEGAL_BANNER,
  LEGAL_COUNSEL_SIGNOFF,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED,
  isLegalInForce,
} from "@fitbud/core";
import type { Block, Inline } from "../../../../docs/legal/published/markdown";
import { inlineText } from "../../../../docs/legal/published/markdown";
import { Text } from "../components/Text";
import {
  LEGAL_DOC_LIST,
  LEGAL_ENTRY_PATHS,
  legalDocByPath,
  legalDocumentBlocks,
  legalUrl,
  type LegalPath,
} from "../lib/legalLinks";
import { reportError } from "../lib/reportError";
import { createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { M2Group, M2Page, M2Row } from "../trainee/settings/m2";

/**
 * In-app legal documents (Z14-27, D-W14-31): the same published text as the
 * public web pages, shown in the app so no native module and no extra build is
 * needed, and reachable signed out (sign-in, Accept invite) and signed in
 * (More, Privacy). Counsel has not approved the text, so every document keeps
 * its "pending counsel review, not yet in force" banner until sign-off is
 * recorded in `legal-config.ts`.
 */

function openExternal(href: string) {
  void Linking.openURL(href).catch((err: unknown) => reportError("Legal.link", err));
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  const styles = useStyles();
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "text":
            return node.value;
          case "br":
            return "\n";
          case "strong":
            return (
              <Text key={i} style={styles.strong}>
                <Inlines nodes={node.children} />
              </Text>
            );
          case "em":
            return (
              <Text key={i} style={styles.em}>
                <Inlines nodes={node.children} />
              </Text>
            );
          case "code":
            return (
              <Text key={i} style={styles.code}>
                {node.value}
              </Text>
            );
          case "mark":
            // A value still "To be confirmed": highlighted, with the words as the cue.
            return (
              <Text key={i} style={styles.tbc} testID="legal-tbc">
                <Inlines nodes={node.children} />
              </Text>
            );
          case "link":
            return (
              <Text
                key={i}
                accessibilityRole="link"
                style={styles.link}
                onPress={() => openExternal(node.href)}
              >
                <Inlines nodes={node.children} />
              </Text>
            );
        }
      })}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  const styles = useStyles();
  switch (block.type) {
    case "heading":
      return (
        <Text
          accessibilityRole="header"
          style={block.level <= 2 ? styles.h2 : block.level === 3 ? styles.h3 : styles.h4}
        >
          <Inlines nodes={block.inline} />
        </Text>
      );
    case "paragraph":
      return (
        <Text style={styles.body}>
          <Inlines nodes={block.inline} />
        </Text>
      );
    case "list":
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.item}>
              <Text style={styles.bullet}>{block.ordered ? `${i + 1}.` : "•"}</Text>
              <Text style={[styles.body, styles.itemText]}>
                <Inlines nodes={item} />
              </Text>
            </View>
          ))}
        </View>
      );
    case "table":
      // A phone has no room for columns: each row becomes a small card, with the
      // column heading in front of every value after the first.
      return (
        <View style={styles.list}>
          {block.rows.map((row, r) => (
            <View key={r} style={styles.rowCard}>
              {row.map((cell, c) =>
                c === 0 ? (
                  <Text key={c} style={styles.rowTitle}>
                    <Inlines nodes={cell} />
                  </Text>
                ) : (
                  <Text key={c} style={styles.rowLine}>
                    <Text style={styles.rowKey}>{inlineText(block.header[c] ?? [])}: </Text>
                    <Inlines nodes={cell} />
                  </Text>
                ),
              )}
            </View>
          ))}
        </View>
      );
    case "quote":
      return (
        <View style={styles.quote}>
          <Text style={styles.body}>
            <Inlines nodes={block.inline} />
          </Text>
        </View>
      );
    case "rule":
      return <View style={styles.rule} />;
  }
}

function Banner() {
  const styles = useStyles();
  const theme = useTheme();
  if (isLegalInForce(LEGAL_COUNSEL_SIGNOFF)) return null;
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${LEGAL_BANNER.title}. ${LEGAL_BANNER.text}`}
      style={styles.banner}
      testID="legal-draft-notice"
    >
      <TriangleAlert color={theme.colors.warn} size={20} strokeWidth={2} />
      <Text style={styles.bannerText}>
        <Text style={styles.strong}>{LEGAL_BANNER.title}. </Text>
        {LEGAL_BANNER.text}
      </Text>
    </View>
  );
}

/** One legal document: nav bar with Back, dates, banner, the text, then "Open in browser". */
export function LegalDocumentScreen({
  path,
  onBack,
}: {
  path: LegalPath;
  onBack: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const doc = legalDocByPath(path);
  const blocks = legalDocumentBlocks(path);
  if (!doc) return null;
  return (
    <M2Page title={doc.title} onBack={onBack} testID={`legal-doc-${doc.slug}`}>
      <Text style={styles.dates} testID="legal-dates">
        Effective {LEGAL_EFFECTIVE_DATE} · Last updated {LEGAL_LAST_UPDATED}
      </Text>
      <Banner />
      <View style={styles.doc}>
        {blocks.map((block, i) => (
          <BlockView key={i} block={block} />
        ))}
      </View>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${doc.title}, open in your browser`}
        onPress={() => openExternal(legalUrl(path))}
        style={styles.browser}
        testID="legal-open-in-browser"
      >
        <ExternalLink color={theme.colors.coachInk} size={18} strokeWidth={2} />
        <Text style={styles.link}>Open in browser</Text>
      </Pressable>
    </M2Page>
  );
}

/** Every document, as rows (Legal list from More, Privacy and the sign-in footer). */
export function LegalDocumentList({
  onOpen,
  paths,
}: {
  onOpen: (path: LegalPath) => void;
  paths?: readonly LegalPath[];
}) {
  const docs = LEGAL_DOC_LIST.filter((d) => !paths || paths.includes(d.path));
  return (
    <M2Group>
      {docs.map((doc) => (
        <M2Row
          key={doc.path}
          label={doc.title}
          hint={doc.summary}
          onPress={() => onOpen(doc.path)}
          testID={`legal-row-${doc.slug}`}
        />
      ))}
    </M2Group>
  );
}

function LegalIndexScreen({
  onOpen,
  onBack,
}: {
  onOpen: (path: LegalPath) => void;
  onBack: () => void;
}) {
  return (
    <M2Page
      title="Legal"
      subtitle="The terms and policies for FitBud."
      onBack={onBack}
      testID="legal-index"
    >
      <Banner />
      <LegalDocumentList onOpen={onOpen} />
    </M2Page>
  );
}

type LegalView = { kind: "closed" } | { kind: "index" } | { kind: "doc"; path: LegalPath; fromIndex: boolean };

/**
 * Opens legal documents inside the app. Render `modal` once in the screen;
 * call `open(path)` for one document or `openIndex()` for the list. Back from a
 * document opened from the list returns to the list.
 */
export function useLegalDocument(): {
  open: (path: LegalPath) => void;
  openIndex: () => void;
  modal: ReactNode;
} {
  const [view, setView] = useState<LegalView>({ kind: "closed" });
  const close = useCallback(() => setView({ kind: "closed" }), []);
  const open = useCallback(
    (path: LegalPath) => setView({ kind: "doc", path, fromIndex: false }),
    [],
  );
  const openIndex = useCallback(() => setView({ kind: "index" }), []);
  const modal = (
    <Modal
      animationType="slide"
      visible={view.kind !== "closed"}
      onRequestClose={() => {
        if (view.kind === "doc" && view.fromIndex) setView({ kind: "index" });
        else close();
      }}
    >
      {view.kind === "index" ? (
        <LegalIndexScreen
          onOpen={(path) => setView({ kind: "doc", path, fromIndex: true })}
          onBack={close}
        />
      ) : view.kind === "doc" ? (
        <LegalDocumentScreen
          path={view.path}
          onBack={() => (view.fromIndex ? setView({ kind: "index" }) : close())}
        />
      ) : null}
    </Modal>
  );
  return { open, openIndex, modal };
}

/**
 * "Terms · Privacy · Health notice" with each opening in the app. Used where a
 * person has not signed in: sign-in and Accept invite. Reading is enough; this
 * adds no consent step.
 */
export function LegalEntryLinks({
  onOpen,
  lead,
}: {
  onOpen: (path: LegalPath) => void;
  /** Words before the links, for example "Before you join, read". */
  lead?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.entry} testID="legal-entry-links">
      {lead ? (
        <Text tone="ink3" style={styles.entryText}>
          {lead}
        </Text>
      ) : null}
      <View style={styles.entryRow}>
        {LEGAL_ENTRY_PATHS.map((path, i) => {
          const doc = legalDocByPath(path);
          if (!doc) return null;
          return (
            <View key={path} style={styles.entryItem}>
              {i > 0 ? (
                <Text tone="ink3" style={styles.entryText}>
                  ·
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${doc.title}, opens in the app`}
                style={styles.entryLink}
                onPress={() => onOpen(path)}
              >
                <Text tone="ink3" style={[styles.entryText, styles.entryUnderline]}>
                  {doc.label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((t) => ({
  dates: { color: t.colors.ink3, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  banner: {
    alignItems: "flex-start",
    backgroundColor: t.colors.warnTint,
    borderColor: t.colors.warn,
    borderRadius: 12,
    borderStyle: "dashed",
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginVertical: spacing.md,
    padding: 12,
  },
  bannerText: { color: t.colors.warn, flex: 1, fontSize: 14, lineHeight: 20 },
  doc: { gap: spacing.md },
  body: { color: t.colors.ink2, fontSize: 15, lineHeight: 23 },
  strong: { fontWeight: "700" },
  em: { fontStyle: "italic" },
  code: { fontSize: 13 },
  tbc: {
    backgroundColor: t.colors.warnTint,
    color: t.colors.warn,
    fontWeight: "700",
  },
  link: { color: t.colors.coachInk, fontWeight: "600", textDecorationLine: "underline" },
  h2: { color: t.colors.ink, fontSize: 19, fontWeight: "700", lineHeight: 26, marginTop: spacing.lg },
  h3: { color: t.colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 23, marginTop: spacing.md },
  h4: { color: t.colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22, marginTop: spacing.sm },
  list: { gap: spacing.sm },
  item: { flexDirection: "row", gap: 8 },
  bullet: { color: t.colors.ink3, fontSize: 15, lineHeight: 23, minWidth: 18 },
  itemText: { flex: 1 },
  rowCard: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  rowTitle: { color: t.colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  rowLine: { color: t.colors.ink2, fontSize: 14, lineHeight: 21 },
  rowKey: { color: t.colors.ink3, fontWeight: "600" },
  quote: {
    borderLeftColor: t.colors.line2,
    borderLeftWidth: 3,
    paddingLeft: 12,
  },
  rule: { backgroundColor: t.colors.line2, height: 1, marginVertical: spacing.sm },
  browser: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 8,
    marginTop: spacing.lg,
    minHeight: 44,
  },
  entry: { alignItems: "center" },
  entryRow: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  entryItem: { alignItems: "center", flexDirection: "row", gap: 4 },
  entryText: { fontSize: 14, lineHeight: 19, textAlign: "center" },
  entryUnderline: { textDecorationLine: "underline" },
  entryLink: { justifyContent: "center", minHeight: 44, paddingHorizontal: 4 },
}));
