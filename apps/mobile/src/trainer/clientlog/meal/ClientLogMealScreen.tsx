import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import type { MealAssignment } from "@fitbud/contracts";
import { formatCivilDate, formatPersonName, labelFor } from "@fitbud/core";
import { colors } from "@fitbud/ui-mobile";
import { useAuth } from "../../../auth/AuthProvider";
import { Screen } from "../../../components/Screen";
import { Text } from "../../../components/Text";
import { createIdempotencyKey } from "../../../lib/idempotency";
import { localDateInTimezone } from "../../../lib/dates";
import { reportError } from "../../../lib/reportError";
import { FoodSearchScreen } from "../../../trainee/FoodSearchScreen";
import { SomethingDifferentSheet } from "../../../trainee/SomethingDifferentSheet";
import { dateStrip } from "../model";
import { DateStrip, EndedView, ErrorBox, LogHeader, ReloadButton, SaveButton, shared, useLogSave } from "./LogShell";
import {
  NOTE_MAX,
  OUTCOMES,
  authorshipLabel,
  buildCoachDeviateBody,
  buildMealBody,
  isChanged,
  isComplete,
  isFoodListEntry,
  mealsOn,
  putCoachMeal,
  setOutcome,
  startDraft,
  type CoachDeviateBody,
  type MealDraft,
} from "./model";

type Props = {
  relationshipId: string;
  displayName: string;
  /** Ended clients are read-only (frame d5). */
  ended: boolean;
  /** The client's calendar decides "today" and the 7-day window. */
  clientZone: string;
  onBack: () => void;
  /** Called after a save, with the toast text. */
  onSaved: (message: string) => void;
};

type DifferentView = "closed" | "menu" | "food_search";

export function ClientLogMealScreen({ relationshipId, displayName, ended, clientZone, onBack, onSaved }: Props) {
  const { api } = useAuth();
  const name = formatPersonName(displayName);
  const first = name.split(" ")[0] || name;
  const today = localDateInTimezone(clientZone);
  const strip = useMemo(() => dateStrip(today), [today]);
  const [date, setDate] = useState(today);
  const [meals, setMeals] = useState<MealAssignment[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MealDraft>(startDraft(null));
  const [different, setDifferent] = useState<DifferentView>("closed");
  const { save, setSave, newEntry, run } = useLogSave("client-log.meal");

  const load = useCallback(async () => {
    setLoadFailed(false);
    setMeals(null);
    try {
      const page = await api.listMealAssignments(relationshipId, { fromDate: date, toDate: date });
      setMeals(page.items);
    } catch (err) {
      reportError("client-log.meals", err);
      setLoadFailed(true);
    }
  }, [api, relationshipId, date]);

  useEffect(() => {
    if (!ended) void load();
  }, [ended, load]);

  const offered = useMemo(() => mealsOn(meals ?? [], date), [meals, date]);
  const meal = offered.find((m) => m.id === pickedId) ?? offered[0] ?? null;
  const existing = meal?.compliance ?? null;
  const foodList = isFoodListEntry(existing);

  // A different meal or version is a different logical entry: reset the draft and the
  // idempotency key during render, so no click can land between a render and a reset.
  const formKey = `${meal?.id ?? "none"}:${existing?.recordVersion ?? "new"}`;
  const [seenKey, setSeenKey] = useState(formKey);
  if (seenKey !== formKey) {
    setSeenKey(formKey);
    setDraft(startDraft(existing));
    setDifferent("closed");
    newEntry();
  }

  function change(next: MealDraft) {
    setDraft(next);
    if (save.state === "failed" && !save.stale) setSave({ state: "idle" });
  }

  function pickOutcome(outcome: (typeof OUTCOMES)[number]) {
    const next = setOutcome(draft, outcome);
    change(next);
    // Z12-52: Modified opens TR-08a; each option has its own editor.
    if (outcome === "modified" && !foodList) {
      setDifferent("menu");
    } else {
      setDifferent("closed");
    }
  }

  const canSave =
    meal != null &&
    save.state !== "saving" &&
    draft.outcome !== "modified" &&
    isComplete(draft) &&
    isChanged(draft, existing) &&
    !(save.state === "failed" && save.stale);

  // Trainee food-list entries: only the note is editable (D-W6-40).
  const canSaveFoodListNote =
    meal != null &&
    foodList &&
    save.state !== "saving" &&
    draft.outcome === "modified" &&
    draft.deviationKind === "logged_foods" &&
    isChanged(draft, existing) &&
    !(save.state === "failed" && save.stale);

  async function doSave() {
    if (!meal || !(canSave || canSaveFoodListNote)) return;
    await run(async (key) => {
      await putCoachMeal(api, meal.id, date, buildMealBody(draft, existing), key);
      return existing ? "Edited by you" : "Logged by you";
    }, onSaved);
  }

  async function saveCoachDeviate(body: CoachDeviateBody) {
    if (!meal) return;
    const key = createIdempotencyKey();
    await putCoachMeal(api, meal.id, date, buildCoachDeviateBody(body, existing), key);
  }

  function afterDifferentSaved() {
    setDifferent("closed");
    onSaved(existing ? "Edited by you" : "Logged by you");
  }

  const header = <LogHeader title="Log meal" name={name} onBack={onBack} />;
  if (ended) {
    return (
      <Screen title="" showHeader={false} chrome="app">
        <EndedView header={header} first={first} noun="meals" onBack={onBack} />
      </Screen>
    );
  }

  // Full-screen TR-26a when the coach picks "Log it myself".
  if (different === "food_search" && meal) {
    return (
      <FoodSearchScreen
        assignment={meal}
        relationshipId={relationshipId}
        authorMode="coach"
        clientName={name}
        onBack={() => setDifferent("menu")}
        onSaved={afterDifferentSaved}
        onCoachSave={saveCoachDeviate}
      />
    );
  }

  // TR-08a / TR-08b / TR-08c for in-person Something different (Z12-52).
  if (different === "menu" && meal) {
    return (
      <SomethingDifferentSheet
        assignment={meal}
        relationshipId={relationshipId}
        variant="screen"
        authorMode="coach"
        clientName={name}
        coachName={name}
        onCancel={() => setDifferent("closed")}
        onDone={afterDifferentSaved}
        onOpenFoodSearch={() => setDifferent("food_search")}
        onCoachSave={saveCoachDeviate}
      />
    );
  }

  const authorship = authorshipLabel(existing);
  const footer = meal ? (
    <SaveButton
      save={save}
      canSave={canSave || canSaveFoodListNote}
      idleLabel={existing ? "Save changes" : "Save meal"}
      onPress={() => void doSave()}
    />
  ) : undefined;

  return (
    <Screen title="" showHeader={false} chrome="app" footer={footer}>
      {header}
      {save.state === "failed" ? <ErrorBox message={save.message} /> : null}
      <DateStrip
        strip={strip}
        date={date}
        zone={clientZone}
        noun="meals"
        onPick={(d) => {
          setDate(d);
          setPickedId(null);
          setDifferent("closed");
        }}
      />
      <Text style={[shared.label, shared.labelGap]}>Meal</Text>
      {loadFailed ? (
        <View style={shared.card}>
          <Text style={shared.cardTitle}>Couldn’t load the meals</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={shared.pill}>
            <Text style={shared.pillText}>Try again</Text>
          </Pressable>
        </View>
      ) : meals == null ? (
        <View style={[shared.card, { minHeight: 80 }]} />
      ) : offered.length === 0 ? (
        <View style={shared.card}>
          <Text style={shared.cardTitle}>Nothing planned on {formatCivilDate(date)}</Text>
          <Text style={shared.cardSub}>There is no meal to log on this day.</Text>
        </View>
      ) : (
        <>
          <View style={shared.chips}>
            {offered.map((m) => {
              const on = m.id === meal?.id;
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setPickedId(m.id);
                    setDifferent("closed");
                  }}
                  style={[shared.pill, on ? shared.pillOn : null]}
                >
                  <Text style={shared.pillText}>{m.mealName}</Text>
                </Pressable>
              );
            })}
          </View>
          {meal ? (
            <View style={shared.card}>
              <Text style={shared.cardTitle}>{meal.mealName}</Text>
              <Text style={shared.cardSub}>
                Planned for {formatCivilDate(meal.localDate)}
                {existing ? ` · ${labelFor("meal_compliance_outcome", existing.outcome)}` : ""}
                {authorship ? ` · ${authorship}` : ""}
              </Text>
            </View>
          ) : null}
          <Text style={[shared.label, shared.labelGap]}>Outcome</Text>
          <View style={shared.chips}>
            {OUTCOMES.map((o) => {
              const on = draft.outcome === o;
              const locked = foodList && o !== "modified";
              return (
                <Pressable
                  key={o}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: locked || foodList }}
                  disabled={foodList}
                  onPress={() => pickOutcome(o)}
                  style={[shared.pill, on ? shared.pillOn : null, locked ? shared.pillOff : null]}
                >
                  <Text style={shared.pillText}>{labelFor("meal_compliance_outcome", o)}</Text>
                </Pressable>
              );
            })}
          </View>
          {draft.outcome === "modified" && foodList ? (
            <Text style={shared.cardSub}>
              {first} logged the foods for this meal, so only the note can be changed.
            </Text>
          ) : null}
          {draft.outcome === "modified" && !foodList ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Something different"
              onPress={() => setDifferent("menu")}
              style={[shared.pill, shared.pillOn, { alignSelf: "flex-start", marginTop: 8 }]}
            >
              <Text style={shared.pillText}>Something different</Text>
            </Pressable>
          ) : null}
          {draft.outcome !== "modified" || foodList ? (
            <>
              <Text style={[shared.label, shared.labelGap]}>Note</Text>
              <TextInput
                accessibilityLabel="Note"
                value={draft.notes}
                onChangeText={(notes) => change({ ...draft, notes })}
                maxLength={NOTE_MAX}
                multiline
                placeholderTextColor={colors.midGrey}
                style={[shared.input, shared.inputMulti]}
              />
            </>
          ) : null}
        </>
      )}
      {save.state === "failed" && save.stale ? (
        <ReloadButton
          onPress={() => {
            setSave({ state: "idle" });
            void load();
          }}
        />
      ) : null}
    </Screen>
  );
}
