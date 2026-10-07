import { useCallback, useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachingRelationship,
  ProgressSummary,
} from "@fitbud/contracts";
import { colors, radii, spacing } from "@fitbud/ui-mobile";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { PrimaryButton } from "../components/PrimaryButton";
import { Screen } from "../components/Screen";
import { createIdempotencyKey } from "../lib/idempotency";
import {
  MINIMAL_PNG_CONTENT_TYPE,
  minimalPngBytes,
} from "../lib/minimalPng";
import { enqueueAndPush } from "../sync/actions";
import { useSyncEngine } from "../sync/SyncProvider";

function formatMeasurementType(type: string): string {
  return type.replace(/_/g, " ");
}

export function ProgressTab({
  relationship,
}: {
  relationship: CoachingRelationship;
}) {
  const { api } = useAuth();
  const sync = useSyncEngine();
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [weight, setWeight] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getProgressSummary(relationship.id);
      setSummary(result);
    } catch (err) {
      const local = await sync.store.listLocal("measurement");
      if (local.length > 0) {
        setSummary({
          measurements: local
            .filter((row) => !row.tombstone && row.payloadJson)
            .map(
              (row) =>
                JSON.parse(row.payloadJson!) as ProgressSummary["measurements"][number],
            ),
          entries: [],
          media: [],
        });
      } else {
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load progress.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [api, relationship.id, sync]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveWeight() {
    const value = Number(weight);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid body weight in kg.");
      return;
    }
    setActing(true);
    setError(null);
    try {
      const measurementId = createIdempotencyKey();
      await enqueueAndPush(sync, {
        mutationId: measurementId,
        idempotencyKey: measurementId,
        recordId: measurementId,
        operation: "measurement.create",
        payload: {
          coachingRelationshipId: relationship.id,
          id: measurementId,
          body: {
            id: measurementId,
            type: "body_weight_kg",
            value,
            unit: "kg",
          },
        },
        localPayload: {
          id: measurementId,
          coachingRelationshipId: relationship.id,
          type: "body_weight_kg",
          value,
          unit: "kg",
          recordVersion: 0,
        },
      });
      setWeight("");
      await load();
      await sync.pullAndApply().catch(() => undefined);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not save measurement.",
      );
    } finally {
      setActing(false);
    }
  }

  async function addProgressPhoto() {
    setActing(true);
    setError(null);
    try {
      // File uploads are queued separately from structured sync mutations.
      await sync.enqueueFileUpload({
        coachingRelationshipId: relationship.id,
        mediaType: "progress_photo",
        contentType: MINIMAL_PNG_CONTENT_TYPE,
        localUri: "local://progress.png",
        byteSize: minimalPngBytes().byteLength,
      });
      const target = await api.createUploadTarget(
        {
          coachingRelationshipId: relationship.id,
          mediaType: "progress_photo",
          contentType: MINIMAL_PNG_CONTENT_TYPE,
          originalFilename: "progress.png",
        },
        createIdempotencyKey(),
      );
      await api.uploadMediaContent(
        target.uploadUrl,
        minimalPngBytes(),
        MINIMAL_PNG_CONTENT_TYPE,
      );
      await api.createProgressEntry(
        relationship.id,
        {
          entryType: "progress_photo",
          title: "Progress photo",
          mediaAssetId: target.mediaAsset.id,
        },
        createIdempotencyKey(),
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not upload progress photo.",
      );
    } finally {
      setActing(false);
    }
  }

  const measurements = summary?.measurements ?? [];
  const entries = summary?.entries ?? [];
  const media = summary?.media ?? [];
  const empty =
    !loading &&
    measurements.length === 0 &&
    entries.length === 0 &&
    media.length === 0;

  return (
    <Screen
      chrome="app"
      title="Progress"
      subtitle="Measurements and photos you have logged."
    >
      {error ? <ErrorBanner message={error} /> : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Log body weight</Text>
        <TextInput
          accessibilityLabel="Body weight in kilograms"
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
          placeholder="kg"
          placeholderTextColor={colors.midGrey}
          style={styles.input}
        />
        <PrimaryButton
          label={acting ? "Saving…" : "Save weight"}
          disabled={acting}
          onPress={() => {
            void saveWeight();
          }}
        />
        <PrimaryButton
          label={acting ? "Uploading…" : "Add progress photo"}
          variant="secondary"
          disabled={acting}
          onPress={() => {
            void addProgressPhoto();
          }}
        />
      </View>

      {loading ? <Text style={styles.muted}>Loading…</Text> : null}

      {empty ? (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>No progress data yet</Text>
          <Text style={styles.bannerBody}>
            Log a measurement or add a photo. Charts appear only from stored
            values.
          </Text>
        </View>
      ) : null}

      {measurements.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Measurements</Text>
          {measurements.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.rowTitle}>
                {formatMeasurementType(item.type)} · {item.value} {item.unit}
              </Text>
              <Text style={styles.rowMeta}>
                {new Date(item.observedAt).toLocaleString()} · {item.source}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {entries.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Entries</Text>
          {entries.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.rowTitle}>
                {item.title ?? item.entryType.replace(/_/g, " ")}
              </Text>
              <Text style={styles.rowMeta}>
                {new Date(item.observedAt).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {media.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Photos on file</Text>
          {media.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.rowTitle}>
                {item.mediaType.replace(/_/g, " ")} · {item.status}
              </Text>
              <Text style={styles.rowMeta}>
                {item.uploadedAt
                  ? new Date(item.uploadedAt).toLocaleString()
                  : item.createdAt}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <PrimaryButton
        label="Refresh"
        variant="ghost"
        onPress={() => {
          void load();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.xl,
  },
  panelTitle: {
    color: colors.nearBlack,
    fontSize: 16,
    fontWeight: "600",
  },
  input: {
    borderColor: colors.lightGrey,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.nearBlack,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    borderBottomColor: colors.lightGrey,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
    paddingVertical: spacing.sm,
  },
  rowTitle: {
    color: colors.nearBlack,
    fontSize: 15,
    fontWeight: "500",
  },
  rowMeta: {
    color: colors.midGrey,
    fontSize: 13,
  },
  muted: {
    color: colors.midGrey,
  },
  banner: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    gap: spacing.xs,
    padding: spacing.md,
  },
  bannerTitle: {
    color: colors.deepNavy,
    fontSize: 16,
    fontWeight: "600",
  },
  bannerBody: {
    color: colors.midGrey,
    fontSize: 14,
    lineHeight: 20,
  },
});
