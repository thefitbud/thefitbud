import { useCallback } from "react";
import { View } from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { TrainerNote } from "@fitbud/contracts";
import { formatPersonName } from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { CardRow, ListScreen, PagedListFooter } from "../../components/ListScreen";
import { HeaderBack } from "../../components/HeaderBack";
import { Text } from "../../components/Text";
import { reportError } from "../../lib/reportError";
import { createThemedStyles } from "../../providers/ThemeProvider";
import { usePagedList } from "../usePagedList";
import { NoteRow } from "./NoteRow";

/** D-W14-26: 30 per page. */
export const NOTES_PAGE_SIZE = 30;

type Props = {
  relationshipId: string;
  displayName: string;
  onBack: () => void;
};

function isOfflineError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  return err instanceof ApiClientError && err.status === 0;
}

/**
 * TM-03k: every coach note for one client, newest first, 30 per page by
 * cursor (Z14-20), with who can see each one. Read-only: adding a note is the
 * profile's action row.
 */
export function NotesScreen({ relationshipId, displayName, onBack }: Props) {
  const styles = useStyles();
  const { api } = useAuth();
  const first = formatPersonName(displayName).split(" ")[0] ?? "";

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const page = await api.listTrainerNotes(relationshipId, {
        limit: NOTES_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      });
      return { items: page.items, nextCursor: page.nextCursor ?? null };
    },
    [api, relationshipId],
  );

  const paged = usePagedList<TrainerNote>({
    queryKey: relationshipId,
    fetchPage,
    getKey: (note) => note.id,
    isOffline: isOfflineError,
    onError: (err) => {
      if (!isOfflineError(err)) reportError("client-notes.load", err);
    },
  });

  const header = (
    <View>
      <View style={styles.nav}>
        <HeaderBack onPress={onBack} label={first || undefined} />
      </View>
      <Text variant="title" accessibilityRole="header" style={styles.title}>
        Notes
      </Text>
    </View>
  );

  const empty = paged.loading ? (
    <View testID="notes-loading" style={styles.skelWrap}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.skel} />
      ))}
    </View>
  ) : paged.error && paged.items.length === 0 ? (
    <Text style={styles.note}>
      {paged.error === "offline"
        ? "You're offline. Pull down to try again."
        : "Couldn't load the notes. Pull down to try again."}
    </Text>
  ) : paged.items.length === 0 ? (
    <Text style={styles.note}>No notes yet.</Text>
  ) : null;

  return (
    <ListScreen<TrainerNote>
      v3
      title="Notes"
      testID="client-notes"
      data={paged.items}
      keyExtractor={(note) => note.id}
      header={header}
      empty={empty}
      listFooter={
        <PagedListFooter
          loadingMore={paged.loadingMore}
          failure={paged.moreError}
          onRetry={paged.retryMore}
        />
      }
      refreshing={paged.refreshing}
      onRefresh={paged.refresh}
      onEndReached={paged.loadMore}
      renderItem={({ item, index }) => (
        <CardRow
          first={index === 0}
          last={index === paged.items.length - 1}
          style={styles.row}
        >
          <NoteRow note={item} first={first} />
        </CardRow>
      )}
    />
  );
}

const useStyles = createThemedStyles((t) => ({
  nav: { alignItems: "center", flexDirection: "row", marginBottom: 4 },
  title: { marginBottom: t.spacing.md },
  row: { paddingBottom: 12, paddingHorizontal: 12 },
  note: { color: t.colors.ink3, fontSize: 14, lineHeight: 20, paddingVertical: 16 },
  skelWrap: { gap: 10 },
  skel: { backgroundColor: t.colors.skel1, borderRadius: 14, height: 72 },
}));
