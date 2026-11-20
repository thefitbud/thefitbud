import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Check, Search } from "lucide-react-native";
import { formatPersonName } from "@fitbud/core";
import type { ColorTokens } from "@fitbud/tokens";
import { fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { initialsFromName } from "../../components/m2";
import { ThemeScope, createThemedStyles, useTheme } from "../../providers/ThemeProvider";

export type ActivityClientOption = {
  relationshipId: string;
  displayName: string;
};

function avatars(c: ColorTokens) {
  return [
    { backgroundColor: c.av1Bg, color: c.av1Fg },
    { backgroundColor: c.av2Bg, color: c.av2Fg },
    { backgroundColor: c.av3Bg, color: c.av3Fg },
    { backgroundColor: c.av4Bg, color: c.av4Fg },
    { backgroundColor: c.av5Bg, color: c.av5Fg },
    { backgroundColor: c.av6Bg, color: c.av6Fg },
  ] as const;
}

function avatarTone(name: string, c: ColorTokens) {
  const list = avatars(c);
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return list[code % list.length] ?? list[0]!;
}

type Props = {
  visible: boolean;
  clients: ActivityClientOption[];
  selectedId: string | null;
  onSelect: (client: ActivityClientOption | null) => void;
  onDismiss: () => void;
};

/** TM-09d: pick one client to scope the activity feed. */
export function ClientPickerSheet(props: Props) {
  return (
    <ThemeScope scheme="system" drivesSystemBars={false}>
      <ClientPickerSheetBody {...props} />
    </ThemeScope>
  );
}

function ClientPickerSheetBody({
  visible,
  clients,
  selectedId,
  onSelect,
  onDismiss,
}: Props) {

  const theme = useTheme();
  const styles = useStyles();
  const [query, setQuery] = useState("");
  const [draftId, setDraftId] = useState<string | null>(selectedId);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((client) =>
      client.displayName.toLowerCase().includes(q),
    );
  }, [clients, query]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      onShow={() => {
        setDraftId(selectedId);
        setQuery("");
      }}
    >
      <Pressable
        style={styles.scrim}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      />
      <View style={styles.sheet} accessibilityRole="summary">
        <View style={styles.nav}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onSelect(null);
              onDismiss();
            }}
          >
            <Text style={styles.link}>Clear</Text>
          </Pressable>
          <Text style={styles.title}>Show activity for</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const picked =
                clients.find((client) => client.relationshipId === draftId) ??
                null;
              onSelect(picked);
              onDismiss();
            }}
          >
            <Text style={styles.link}>Done</Text>
          </Pressable>
        </View>
        <View style={styles.search}>
          <Search color={theme.colors.ink3} size={18} strokeWidth={2} />
          <TextInput
            accessibilityLabel="Search clients"
            value={query}
            onChangeText={setQuery}
            placeholder="Search clients"
            placeholderTextColor={theme.colors.ink3}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        <ScrollView style={styles.list}>
          {filtered.map((client) => {
            const name = formatPersonName(client.displayName);
            const tone = avatarTone(name, theme.colors);
            const selected = draftId === client.relationshipId;
            return (
              <Pressable
                key={client.relationshipId}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setDraftId(client.relationshipId)}
                style={styles.row}
              >
                <View
                  style={[styles.avatar, { backgroundColor: tone.backgroundColor }]}
                >
                  <Text style={[styles.avatarText, { color: tone.color }]}>
                    {initialsFromName(name)}
                  </Text>
                </View>
                <Text style={styles.name}>{name}</Text>
                {selected ? (
                  <View style={styles.check}>
                    <Check color={theme.colors.card} size={16} strokeWidth={2.6} />
                  </View>
                ) : (
                  <View style={styles.checkOff} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((t) => ({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: t.colors.scrim,
  },
  sheet: {
    backgroundColor: t.colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    bottom: 0,
    left: 0,
    maxHeight: "72%",
    paddingBottom: 28,
    paddingHorizontal: 16,
    paddingTop: 12,
    position: "absolute",
    right: 0,
  },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
  },
  title: {
    color: t.colors.ink,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  link: {
    color: t.colors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
    minWidth: 48,
  },
  search: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    height: 44,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  searchInput: { color: t.colors.ink, flex: 1, fontSize: 16 },
  list: { marginTop: 8 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 56,
    paddingVertical: 8,
  },
  avatar: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  avatarText: { fontFamily: fontFamilySemiBold, fontSize: 13 },
  name: {
    color: t.colors.ink,
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  check: {
    alignItems: "center",
    backgroundColor: t.colors.ink,
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  checkOff: {
    borderColor: t.colors.line,
    borderRadius: 14,
    borderWidth: 1.5,
    height: 28,
    width: 28,
  },
}));
