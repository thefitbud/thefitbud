import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { Measurement } from "@fitbud/contracts";
import { formatCivilDate, formatPersonName, labelFor } from "@fitbud/core";
import { colors } from "@fitbud/ui-mobile";
import { useAuth } from "../../../auth/AuthProvider";
import { Screen } from "../../../components/Screen";
import { Text } from "../../../components/Text";
import { localDateInTimezone } from "../../../lib/dates";
import { reportError } from "../../../lib/reportError";
import { dateStrip, performedAtFor } from "../model";
import { DateStrip, EndedView, ErrorBox, LogHeader, ReloadButton, SaveButton, shared, useLogSave } from "../meal/LogShell";
import {
  TYPES,
  authorshipLabel,
  buildCreateBody,
  buildEditBody,
  draftFor,
  fixedUnit,
  isComplete,
  measurementsOn,
  newDraft,
  patchCoachMeasurement,
  type MeasurementDraft,
} from "./model";

type Props = {
  relationshipId: string;
  displayName: string;
  ended: boolean;
  clientZone: string;
  onBack: () => void;
  onSaved: (message: string) => void;
};

export function ClientLogMeasurementScreen({ relationshipId, displayName, ended, clientZone, onBack, onSaved }: Props) {
  const { api } = useAuth();
  const name = formatPersonName(displayName);
  const first = name.split(" ")[0] || name;
  const today = localDateInTimezone(clientZone);
  const strip = useMemo(() => dateStrip(today), [today]);
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<Measurement[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  /** null = a new measurement; otherwise the one being edited. */
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MeasurementDraft>(newDraft());
  const { save, setSave, newEntry, run } = useLogSave("client-log.measurement");

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const out: Measurement[] = [];
      let cursor: string | undefined;
      // The 7-day window is a handful of rows; a few pages cover any client.
      for (let i = 0; i < 5; i += 1) {
        const page = await api.listMeasurements(relationshipId, { cursor, limit: 100 });
        out.push(...page.items);
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      setItems(out);
    } catch (err) {
      reportError("client-log.measurements", err);
      setLoadFailed(true);
    }
  }, [api, relationshipId]);

  useEffect(() => {
    if (!ended) void load();
  }, [ended, load]);

  const onDate = useMemo(() => measurementsOn(items ?? [], date, clientZone), [items, date, clientZone]);
  const editing = editId ? (onDate.find((m) => m.id === editId) ?? null) : null;

  function pick(id: string | null) {
    setEditId(id);
    const m = id ? onDate.find((x) => x.id === id) : null;
    setDraft(m ? draftFor(m) : newDraft());
    newEntry();
  }

  function change(next: MeasurementDraft) {
    setDraft(next);
    if (save.state === "failed" && !save.stale) setSave({ state: "idle" });
  }

  const editBody = editing ? buildEditBody(draft, editing) : null;
  const canSave =
    save.state !== "saving" &&
    isComplete(draft) &&
    (editing ? editBody != null : true) &&
    !(save.state === "failed" && save.stale);

  async function doSave() {
    if (!canSave) return;
    await run(async (key) => {
      if (editing) {
        await patchCoachMeasurement(api, editing.id, editBody!);
        return "Edited by you";
      }
      await api.createMeasurement(
        relationshipId,
        buildCreateBody(draft, performedAtFor(date, today, clientZone, new Date())),
        key,
      );
      return "Logged by you";
    }, onSaved);
  }

  const header = <LogHeader title="Log measurement" name={name} onBack={onBack} />;
  if (ended) {
    return (
      <Screen title="" showHeader={false} chrome="app">
        <EndedView header={header} first={first} noun="measurements" onBack={onBack} />
      </Screen>
    );
  }

  const fixed = fixedUnit(draft.type);
  const footer = (
    <SaveButton save={save} canSave={canSave} idleLabel={editing ? "Save changes" : "Save measurement"} onPress={() => void doSave()} />
  );

  return (
    <Screen title="" showHeader={false} chrome="app" footer={footer}>
      {header}
      {save.state === "failed" ? <ErrorBox message={save.message} /> : null}
      <DateStrip
        strip={strip}
        date={date}
        zone={clientZone}
        noun="measurements"
        onPick={(d) => {
          setDate(d);
          setEditId(null);
          setDraft(newDraft());
          newEntry();
        }}
      />
      {loadFailed ? (
        <View style={[shared.card, { marginTop: 16 }]}>
          <Text style={shared.cardTitle}>Couldn’t load the measurements</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={shared.pill}>
            <Text style={shared.pillText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {items == null && !loadFailed ? <View style={[shared.card, { marginTop: 16, minHeight: 80 }]} /> : null}
      {onDate.length > 0 ? (
        <>
          <Text style={[shared.label, shared.labelGap]}>Logged on {formatCivilDate(date)}</Text>
          {onDate.map((m) => {
            const on = m.id === editId;
            const who = authorshipLabel(m);
            return (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${labelFor("measurement_type", m.type)} ${m.value} ${m.unit}`}
                onPress={() => pick(on ? null : m.id)}
                style={[shared.card, shared.rowCard, on ? shared.pillOn : null]}
              >
                <View style={shared.flex}>
                  <Text style={shared.cardTitle}>{labelFor("measurement_type", m.type)}</Text>
                  <Text style={shared.cardSub}>
                    {m.value} {m.unit}
                    {who ? ` · ${who}` : ""}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </>
      ) : null}
      <Text style={[shared.label, shared.labelGap]}>{editing ? "Change value" : "Measurement"}</Text>
      {!editing ? (
        <View style={shared.chips}>
          {TYPES.map((t) => {
            const on = draft.type === t;
            return (
              <Pressable
                key={t}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => change({ ...draft, type: t })}
                style={[shared.pill, on ? shared.pillOn : null]}
              >
                <Text style={shared.pillText}>{labelFor("measurement_type", t)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={shared.cardSub}>{labelFor("measurement_type", draft.type)}</Text>
      )}
      <Text style={[shared.label, shared.labelGap]}>Value{fixed ? ` (${fixed})` : ""}</Text>
      <TextInput
        accessibilityLabel="Value"
        value={draft.value}
        onChangeText={(value) => change({ ...draft, value })}
        keyboardType="decimal-pad"
        placeholderTextColor={colors.midGrey}
        style={shared.input}
      />
      {fixed == null ? (
        <>
          <Text style={[shared.label, shared.labelGap]}>Unit</Text>
          <TextInput
            accessibilityLabel="Unit"
            value={draft.unit}
            onChangeText={(unit) => change({ ...draft, unit })}
            maxLength={32}
            placeholderTextColor={colors.midGrey}
            style={shared.input}
          />
        </>
      ) : null}
      {save.state === "failed" && save.stale ? (
        <ReloadButton
          onPress={() => {
            setSave({ state: "idle" });
            setEditId(null);
            setDraft(newDraft());
            void load();
          }}
        />
      ) : null}
    </Screen>
  );
}
