import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Check, Search } from "lucide-react-native";
import { formatPersonName } from "@fitbud/core";
import { v3LightColors } from "@fitbud/tokens";
import { colors, fontFamilySemiBold } from "@fitbud/ui-mobile";
import { Text } from "../../components/Text";
import { initialsFromName } from "../../components/m2";

export type ActivityClientOption = {
  relationshipId: string;
  displayName: string;
};

const AVATARS = [
  { backgroundColor: v3LightColors.av1Bg, color: v3LightColors.av1Fg },
  { backgroundColor: v3LightColors.av2Bg, color: v3LightColors.av2Fg },
  { backgroundColor: v3LightColors.av3Bg, color: v3LightColors.av3Fg },
  { backgroundColor: v3LightColors.av4Bg, color: v3LightColors.av4Fg },
  { backgroundColor: v3LightColors.av5Bg, color: v3LightColors.av5Fg },
  { backgroundColor: v3LightColors.av6Bg, color: v3LightColors.av6Fg },
] as const;

function avatarTone(name: string) {
  const code = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATARS[code % AVATARS.length] ?? AVATARS[0]!;
}

type Props = {
  visible: boolean;
  clients: ActivityClientOption[];
  selectedId: string | null;
  onSelect: (client: ActivityClientOption | null) => void;
  onDismiss: () => void;
};

/** TM-09d: pick one client to scope the activity feed. */
export function ClientPickerSheet({
  visible,
  clients,
  selectedId,
  onSelect,
  onDismiss,
}: Props) {
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
          <Search color={v3LightColors.ink3} size={18} strokeWidth={2} />
          <TextInput
            accessibilityLabel="Search clients"
            value={query}
            onChangeText={setQuery}
            placeholder="Search clients"
            placeholderTextColor={v3LightColors.ink3}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        <ScrollView style={styles.list}>
          {filtered.map((client) => {
            const name = formatPersonName(client.displayName);
            const tone = avatarTone(name);
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
                    <Check color={colors.white} size={16} strokeWidth={2.6} />
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

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: v3LightColors.scrim,
  },
  sheet: {
    backgroundColor: colors.white,
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
    color: colors.deepNavy,
    fontFamily: fontFamilySemiBold,
    fontSize: 17,
  },
  link: {
    color: v3LightColors.brand,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
    minWidth: 48,
  },
  search: {
    alignItems: "center",
    backgroundColor: v3LightColors.fill,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    height: 44,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  searchInput: { color: colors.deepNavy, flex: 1, fontSize: 16 },
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
    color: colors.deepNavy,
    flex: 1,
    fontFamily: fontFamilySemiBold,
    fontSize: 16,
  },
  check: {
    alignItems: "center",
    backgroundColor: v3LightColors.ink,
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  checkOff: {
    borderColor: v3LightColors.line,
    borderRadius: 14,
    borderWidth: 1.5,
    height: 28,
    width: 28,
  },
});
