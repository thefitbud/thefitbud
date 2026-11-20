import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, TextInput, View } from "react-native";
import { Check, Plus, Search, WifiOff, X } from "lucide-react-native";
import { ApiClientError } from "@fitbud/api-client";
import type { MealAssignment } from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { formatNumber } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { ErrorBanner } from "../components/ErrorBanner";
import { Screen } from "../components/Screen";
import { Snackbar } from "../components/Snackbar";
import { Text } from "../components/Text";
import { fetchMeFoodRecent } from "../lib/meFoodsApi";
import { plannedRowsFromAssignment, type PlannedRow } from "../lib/plannedMealItems";
import { reportError } from "../lib/reportError";
import { stage1Api } from "../lib/stage1Api";
import { ThemeScope, createThemedStyles, useTheme } from "../providers/ThemeProvider";
import { useSyncEngine } from "../sync/SyncProvider";
import { isNetworkFailure } from "../trainer/attention/offline";
import { CustomFoodScreen } from "./CustomFoodScreen";
import { AteOutForm, type CoachDeviateSave } from "./food/AteOutForm";
import { FoodAmountPicker } from "./food/FoodAmountPicker";
import { FoodNavHeader } from "./food/FoodNavHeader";
import {
  addLine,
  amountWithUnit,
  foodKey,
  formatAmount,
  lineAddedLabel,
  lineChipLabel,
  lineFromPlanRow,
  lineFromSearchItem,
  logTotals,
  searchItemServing,
  toLoggedItem,
  withServingFromDetail,
  type FoodSearchItem,
  type LogLine,
} from "./food/logLines";
import { fetchTraineeFoodDetail } from "./food/foodServingsApi";
import { announceMealSaved } from "./food/mealSavedNotice";
import { deviateMealAssignment, MealSyncError } from "./mealActions";
import { cleanFoodLabel } from "./mealHelpers";
import { nutrientsFromMealPrescription } from "./nutrition";
import { useDeviceOffline } from "./today/queuedLogs";

/** Typing pause before a search goes out. */
const SEARCH_DEBOUNCE_MS = 280;
const SEARCH_LIMIT = 30;

type Props = {
  assignment: MealAssignment;
  relationshipId: string;
  coachName?: string;
  onBack: () => void;
  onSaved: () => void;
  /** Z12-52: coach logs foods in person via the trainer PUT. */
  authorMode?: "trainee" | "coach";
  clientName?: string;
  onCoachSave?: CoachDeviateSave;
};

type Mode =
  | { kind: "search" }
  | { kind: "picker"; item: FoodSearchItem }
  | { kind: "custom"; name: string }
  | { kind: "ate_out" };

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; items: FoodSearchItem[] }
  | { kind: "offline"; items: FoodSearchItem[] }
  | { kind: "error"; message: string };

type AddedToast = { id: number; message: string; before: LogLine[] };

/** A plan food as a search hit, so it can open the amount picker. */
function planRowAsItem(row: PlannedRow): FoodSearchItem | null {
  if (!row.foodId) return null;
  const kcalEach =
    row.kcalPreview != null && row.quantity > 0 ? row.kcalPreview / row.quantity : null;
  return {
    id: row.foodId,
    name: row.label,
    energyKcalScaled: null,
    defaultServingId: row.servingId ?? null,
    source: "library",
    serving: {
      label: row.unitLabel,
      kcalScaled: kcalEach == null ? null : Math.round(kcalEach * NUTRIENT_SCALE),
      proteinScaled: null,
      carbsScaled: null,
      fatScaled: null,
    },
  };
}

function planRowSubtitle(row: PlannedRow): string {
  const amount = amountWithUnit(row.quantity, row.unitLabel);
  return row.kcalPreview != null ? `${amount} · ${formatNumber(row.kcalPreview)} kcal` : amount;
}

function itemSubtitle(item: FoodSearchItem): string {
  const serving = searchItemServing(item);
  return serving.kcal != null
    ? `${serving.label} · ${formatNumber(serving.kcal)} kcal`
    : serving.label;
}

function capitalise(text: string): string {
  const trimmed = text.trim();
  return trimmed ? trimmed[0]!.toUpperCase() + trimmed.slice(1) : trimmed;
}

/** TR-26d hint: a shorter word to try, from a query of more than one word. */
function noMatchBody(query: string): string {
  const words = query.trim().split(/\s+/);
  const shorter = words.length > 1 ? words[words.length - 1] : null;
  return shorter
    ? `Try a shorter word, like “${shorter}”. Or create it with its kcal.`
    : "Try a shorter word. Or create it with its kcal.";
}

/**
 * Log it myself (TR-26a–f). Before typing: the meal's plan foods, then the
 * trainee's recent foods. A tap on + adds the food at once with its default
 * serving (its detail loads in the background); a tap on the row opens the
 * amount picker. A food that is not found is created in place (TR-26e) or the
 * meal is logged as ate out (TR-08c). On save the Diet tab shows the meal
 * logged with a toast (TR-26f).
 */
export function FoodSearchScreen(props: Props) {
  return (
    <ThemeScope scheme="system">
      <FoodSearchBody {...props} />
    </ThemeScope>
  );
}

function FoodSearchBody({
  assignment,
  relationshipId,
  coachName,
  onBack,
  onSaved,
  authorMode = "trainee",
  clientName,
  onCoachSave,
}: Props) {
  const isCoach = authorMode === "coach";
  const styles = useStyles();
  const theme = useTheme();
  const { api, me } = useAuth();
  const sync = useSyncEngine();
  const s1 = useMemo(() => stage1Api(api), [api]);
  const timeZone = me?.timezone ?? "UTC";
  const deviceOffline = useDeviceOffline();

  const mealName = cleanFoodLabel(assignment.mealName);
  const mealLower = mealName.toLowerCase();
  const planKcal = nutrientsFromMealPrescription(assignment).kcal;
  const planRows = useMemo(() => plannedRowsFromAssignment(assignment), [assignment]);

  const [mode, setMode] = useState<Mode>({ kind: "search" });
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const [recent, setRecent] = useState<FoodSearchItem[]>([]);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [toast, setToast] = useState<AddedToast | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastAddAt = useRef(new Map<string, number>());
  const searchSeq = useRef(0);
  const toastSeq = useRef(0);
  const trayScroll = useRef<ScrollView>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  useEffect(() => {
    let active = true;
    fetchMeFoodRecent(api)
      .then((page) => {
        if (active) setRecent(page.items);
      })
      .catch((err: unknown) => {
        // No Recent section; search still works.
        reportError("FoodSearchScreen.recent", err);
      });
    return () => {
      active = false;
    };
  }, [api]);

  /** Foods already on this phone: offline, search filters these (TR-26d). */
  const localFoods = useMemo(() => {
    const seen = new Set<string>();
    const out: FoodSearchItem[] = [];
    for (const item of [
      ...planRows.map(planRowAsItem).filter((i): i is FoodSearchItem => i != null),
      ...recent,
    ]) {
      const key = foodKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [planRows, recent]);

  const localMatches = useCallback(
    (q: string) => {
      const needle = q.trim().toLowerCase();
      return localFoods.filter((item) => item.name.toLowerCase().includes(needle));
    },
    [localFoods],
  );

  const trimmed = query.trim();
  useEffect(() => {
    if (trimmed.length < 2) {
      searchSeq.current += 1;
      setSearch({ kind: "idle" });
      return undefined;
    }
    if (deviceOffline) {
      searchSeq.current += 1;
      setSearch({ kind: "offline", items: localMatches(trimmed) });
      return undefined;
    }
    const seq = ++searchSeq.current;
    setSearch({ kind: "loading" });
    const handle = setTimeout(() => {
      s1.searchMeFoods({ q: trimmed, limit: SEARCH_LIMIT })
        .then((page) => {
          if (seq === searchSeq.current) setSearch({ kind: "done", items: page.items });
        })
        .catch((err: unknown) => {
          if (seq !== searchSeq.current) return;
          if (isNetworkFailure(err)) {
            setSearch({ kind: "offline", items: localMatches(trimmed) });
            return;
          }
          reportError("FoodSearchScreen.search", err);
          setSearch({
            kind: "error",
            message:
              err instanceof ApiClientError ? err.message : "Search didn’t load. Try again.",
          });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [trimmed, deviceOffline, localMatches, s1]);

  const totals = logTotals(lines);
  const quantityByKey = useMemo(
    () => new Map(lines.map((line) => [line.key, line])),
    [lines],
  );

  function showAdded(line: LogLine, before: LogLine[]) {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message: lineAddedLabel(line), before });
    // Keep the just-added chip in view (TR-26b).
    setTimeout(() => trayScroll.current?.scrollToEnd({ animated: true }), 0);
  }

  /** Instant add (TR-26b): the line goes in now; a library food's real serving follows. */
  function quickAdd(next: LogLine) {
    const before = lines;
    const result = addLine(lines, next, lastAddAt.current, Date.now());
    if (!result.added) return;
    setLines(result.lines);
    const added = result.lines.find((line) => line.key === next.key)!;
    showAdded(added, before);
    if (next.source.kind === "library" && !next.servingKnown) {
      const foodId = next.source.foodId;
      fetchTraineeFoodDetail(api, foodId)
        .then((detail) => {
          if (!mounted.current) return;
          setLines((current) =>
            current.map((line) =>
              line.key === next.key ? withServingFromDetail(line, detail) : line,
            ),
          );
        })
        .catch((err: unknown) => {
          // The line keeps the serving the search row showed.
          reportError("FoodSearchScreen.servings", err);
        });
    }
  }

  function addFromPicker(line: LogLine) {
    const before = lines;
    const exists = lines.some((l) => l.key === line.key);
    const next = exists ? lines.map((l) => (l.key === line.key ? line : l)) : [...lines, line];
    lastAddAt.current.set(line.key, Date.now());
    setLines(next);
    setMode({ kind: "search" });
    showAdded(line, before);
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  async function save(toSave: LogLine[]) {
    if (toSave.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    const saved = logTotals(toSave);
    const items = toSave.map(toLoggedItem);
    try {
      if (isCoach) {
        if (!onCoachSave) throw new Error("Coach save is not wired.");
        await onCoachSave({
          deviationKind: "logged_foods",
          notes: null,
          items,
        });
      } else {
        await deviateMealAssignment(
          sync,
          assignment,
          {
            deviationKind: "logged_foods",
            notes: null,
            photoIntent: null,
            items,
          },
          coachName,
          relationshipId,
        );
        announceMealSaved({
          relationshipId,
          assignmentId: assignment.id,
          localDate: assignment.localDate,
          mealName,
          kcal: saved.unknown && saved.kcal === 0 ? null : saved.kcal,
          kind: "logged_foods",
        });
      }
      onSaved();
    } catch (err) {
      reportError("FoodSearchScreen.save", err);
      if (mounted.current) {
        setError(
          err instanceof MealSyncError || err instanceof ApiClientError
            ? err.message
            : "Couldn’t save that meal. Try again.",
        );
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  // Picker / custom / ate-out use Screen so FoodSearchScreen.tsx keeps a
  // `<Screen` for the Maestro harness (scripts/qa/mobile-build.test.mjs).
  // The search list keeps its own sticky FoodNavHeader + tray outside Screen's
  // ScrollView; Results stays a plain Text for the meal-log keyboard dismiss.
  if (mode.kind === "picker") {
    return (
      <Screen v3 chrome="app" showHeader={false} title={mealName}>
        <FoodAmountPicker
          api={api}
          item={mode.item}
          mealName={mealName}
          existing={quantityByKey.get(foodKey(mode.item))}
          onBack={() => setMode({ kind: "search" })}
          onAdd={addFromPicker}
        />
      </Screen>
    );
  }

  if (mode.kind === "custom") {
    return (
      <Screen v3 chrome="app" showHeader={false} title={mealName}>
        <CustomFoodScreen
          mealName={mealName}
          coachName={coachName ?? "Your coach"}
          initialName={mode.name}
          saving={saving}
          onCancel={() => setMode({ kind: "search" })}
          // TR-26e Add logs the meal with the new food (tap map: → TR-26f).
          onAdd={(line) => void save([...lines, line])}
        />
        {error ? (
          <View style={styles.floatingError}>
            <ErrorBanner message={error} />
          </View>
        ) : null}
      </Screen>
    );
  }

  if (mode.kind === "ate_out") {
    return (
      <Screen v3 chrome="app" showHeader={false} title={mealName}>
        <AteOutForm
          assignment={assignment}
          relationshipId={relationshipId}
          coachName={coachName ?? "Your coach"}
          timeZone={timeZone}
          onCancel={() => setMode({ kind: "search" })}
          onSaved={onSaved}
          authorMode={authorMode}
          clientName={clientName}
          onCoachSave={onCoachSave}
        />
      </Screen>
    );
  }

  function renderFoodRow(opts: {
    key: string;
    name: string;
    subtitle: string;
    lineKey: string;
    onOpen: (() => void) | null;
    onAdd: () => void;
  }) {
    const inLog = quantityByKey.get(opts.lineKey);
    const count = inLog && !inLog.grams ? inLog.quantity : inLog ? 1 : 0;
    return (
      <View key={opts.key} style={styles.foodRow} testID={`food-row-${opts.lineKey}`}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={opts.name}
          accessibilityHint={opts.onOpen ? "Choose the amount" : undefined}
          onPress={opts.onOpen ?? opts.onAdd}
          style={({ pressed }) => [styles.foodMain, pressed ? styles.pressed : null]}
        >
          <View style={styles.flex}>
            <Text variant="body">{opts.name}</Text>
            <Text variant="subhead" style={styles.rowSub}>
              {opts.subtitle}
            </Text>
          </View>
          {count > 0 ? (
            <View style={styles.addedTag}>
              <Text variant="caption" tone="done" style={styles.strong}>
                {formatAmount(count)} added
              </Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={inLog ? `Add another ${opts.name}` : `Add ${opts.name}`}
          onPress={opts.onAdd}
          hitSlop={5}
          style={({ pressed }) => [styles.addHit, pressed ? styles.addHitPressed : null]}
          testID={`food-add-${opts.lineKey}`}
        >
          <View style={[styles.addCircle, inLog ? styles.addCircleDone : null]}>
            {inLog ? (
              <Check size={18} strokeWidth={2.6} color={theme.colors.onBrand} />
            ) : (
              <Plus size={18} strokeWidth={2.6} color={theme.colors.brand} />
            )}
          </View>
        </Pressable>
      </View>
    );
  }

  function renderItemRow(item: FoodSearchItem) {
    const key = foodKey(item);
    return renderFoodRow({
      key,
      name: cleanFoodLabel(item.name),
      subtitle: itemSubtitle(item),
      lineKey: key,
      onOpen: () => setMode({ kind: "picker", item }),
      onAdd: () => quickAdd(lineFromSearchItem(item)),
    });
  }

  function renderPlanRow(row: PlannedRow, index: number) {
    const line = lineFromPlanRow(row, index);
    const asItem = planRowAsItem(row);
    return renderFoodRow({
      key: `plan-${index}`,
      name: cleanFoodLabel(row.label),
      subtitle: planRowSubtitle(row),
      lineKey: line.key,
      onOpen: asItem ? () => setMode({ kind: "picker", item: asItem }) : null,
      onAdd: () => quickAdd(line),
    });
  }

  const typing = trimmed.length >= 2;
  const results =
    search.kind === "done" || search.kind === "offline" ? search.items : [];
  const noMatch =
    typing && (search.kind === "done" || search.kind === "offline") && results.length === 0;
  const offline = search.kind === "offline" || (deviceOffline && typing);

  return (
    <SafeAreaView style={styles.safe} testID="food-search-screen">
      <FoodNavHeader
        title={mealName}
        subtitle={planKcal > 0 ? `Plan ${formatNumber(planKcal)} kcal` : undefined}
        onLeft={onBack}
        rightLabel="Save"
        onRight={() => void save(lines)}
        rightDisabled={lines.length === 0}
        busy={saving}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.searchBox}>
          <Search size={18} strokeWidth={2} color={theme.colors.ink3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search Indian foods, brands"
            placeholderTextColor={theme.colors.ink3}
            accessibilityLabel="Search foods"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.searchInput}
            testID="food-search-input"
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery("")}
              style={styles.clearHit}
            >
              <X size={16} strokeWidth={2.4} color={theme.colors.ink4} />
            </Pressable>
          ) : null}
        </View>

        {offline ? (
          <View style={styles.offlineBanner} accessibilityRole="alert">
            <WifiOff size={20} color={theme.colors.ink2} strokeWidth={1.9} />
            <Text variant="body" tone="ink2" style={styles.flex}>
              Offline. Showing foods saved on your phone.
            </Text>
          </View>
        ) : null}
        {error ? <ErrorBanner message={error} /> : null}

        {!typing ? (
          <>
            {planRows.length > 0 ? (
              <>
                <Text variant="label" style={styles.groupLabel}>
                  From your plan
                </Text>
                <View style={styles.group}>{planRows.map(renderPlanRow)}</View>
              </>
            ) : null}
            {recent.length > 0 ? (
              <>
                <Text variant="label" style={styles.groupLabel}>
                  Recently logged
                </Text>
                <View style={styles.group}>{recent.map(renderItemRow)}</View>
              </>
            ) : null}
            <Text variant="caption" style={styles.hint}>
              Tap a food to set katori, piece, cup or grams.
            </Text>
          </>
        ) : search.kind === "error" ? (
          <ErrorBanner message={search.message} />
        ) : noMatch ? (
          <View style={styles.empty} testID="food-search-no-match">
            <View style={styles.emptyIcon}>
              <Search size={26} strokeWidth={2} color={theme.colors.ink3} />
            </View>
            <Text variant="title" style={styles.center}>
              No foods match “{trimmed}”
            </Text>
            <Text variant="subhead" style={styles.center}>
              {noMatchBody(trimmed)}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMode({ kind: "custom", name: capitalise(trimmed) })}
              style={styles.tintBtn}
            >
              <Plus size={18} strokeWidth={2.4} color={theme.colors.brandInk} />
              <Text variant="bodyStrong" tone="brandInk">
                Create “{capitalise(trimmed)}”
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMode({ kind: "ate_out" })}
              style={styles.textBtn}
            >
              <Text variant="bodyStrong" tone="brand">
                Log as Ate out
              </Text>
            </Pressable>
          </View>
        ) : results.length > 0 ? (
          <>
            {/* Plain RN Text: Maestro meal-log.yaml taps "Results" to dismiss the
                keyboard (scripts/qa/mobile-build.test.mjs; no hideKeyboard).
                The harness matches this exact `<Text style={styles.sml}>Results</Text>` form. */}
            <Text style={styles.sml}>Results</Text>
            <View style={styles.group}>{results.map(renderItemRow)}</View>
          </>
        ) : (
          <Text variant="subhead" style={styles.searching}>
            Searching…
          </Text>
        )}
      </ScrollView>

      {toast ? (
        <View style={styles.toastSlot} pointerEvents="box-none">
          <Snackbar
            key={toast.id}
            message={toast.message}
            actionLabel="Undo"
            onAction={() => {
              setLines(toast.before);
              setToast(null);
            }}
            onDismiss={() => setToast(null)}
          />
        </View>
      ) : null}

      {lines.length > 0 ? (
        <View style={styles.tray} testID="food-log-tray">
          <View style={styles.trayHead}>
            <Text variant="bodyStrong">In this log · {lines.length}</Text>
            <Text variant="subhead">
              {totals.unknown ? "at least " : ""}
              {formatNumber(totals.kcal)} kcal
            </Text>
          </View>
          <ScrollView
            ref={trayScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
          >
            {lines.map((line) => (
              <Pressable
                key={line.key}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${lineChipLabel(line)}`}
                onPress={() => removeLine(line.key)}
                hitSlop={4}
                style={styles.chip}
              >
                <Text variant="subhead" tone="brandInk" style={styles.strong}>
                  {lineChipLabel(line)}
                </Text>
                <X size={14} strokeWidth={2.4} color={theme.colors.brandInk} />
              </Pressable>
            ))}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: saving, busy: saving }}
            disabled={saving}
            onPress={() => void save(lines)}
            style={[styles.primary, saving ? styles.busy : null]}
            testID="food-log-save"
          >
            <Text variant="bodyStrong" tone="onBrand">
              Save {mealLower}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((t) => ({
  safe: { backgroundColor: t.colors.bgPlain, flex: 1 },
  body: { paddingBottom: 32, paddingHorizontal: 16, paddingTop: 4 },
  flex: { flex: 1, minWidth: 0 },
  strong: { fontWeight: "600" },
  center: { textAlign: "center" },
  searchBox: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
    minHeight: t.touchTarget,
    paddingLeft: 12,
  },
  searchInput: {
    color: t.colors.ink,
    flex: 1,
    fontSize: 17,
    minHeight: t.touchTarget,
    minWidth: 0,
    paddingVertical: 0,
  },
  clearHit: {
    alignItems: "center",
    height: t.touchTarget,
    justifyContent: "center",
    width: t.touchTarget,
  },
  offlineBanner: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    padding: 14,
  },
  groupLabel: { marginBottom: 6, marginLeft: 2, marginTop: 18 },
  // Inert label Maestro taps to dismiss the keyboard (must stay a plain RN Text).
  sml: {
    color: t.colors.ink3,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginBottom: 6,
    marginLeft: 2,
    marginTop: 18,
    textTransform: "uppercase",
  },
  group: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderRadius: t.radii.group,
    borderWidth: 1,
    overflow: "hidden",
  },
  foodRow: {
    alignItems: "center",
    borderBottomColor: t.colors.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 60,
  },
  foodMain: {
    alignItems: "center",
    alignSelf: "stretch",
    flex: 1,
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
    paddingLeft: 14,
    paddingVertical: 10,
  },
  pressed: { backgroundColor: t.colors.fill },
  rowSub: { fontSize: 13 },
  addedTag: {
    backgroundColor: t.colors.doneTint,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  addHit: {
    alignItems: "center",
    height: t.touchTarget + 4,
    justifyContent: "center",
    marginRight: 6,
    width: t.touchTarget + 4,
  },
  addHitPressed: { opacity: 0.6 },
  addCircle: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  addCircleDone: { backgroundColor: t.colors.done },
  hint: { marginHorizontal: 2, marginVertical: 12 },
  searching: { marginTop: 24, textAlign: "center" },
  empty: { alignItems: "center", gap: 8, marginTop: 48, paddingHorizontal: 12 },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    marginBottom: 4,
    width: 56,
  },
  tintBtn: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: t.colors.brandTint,
    borderRadius: t.radii.button,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 50,
    paddingHorizontal: 16,
  },
  textBtn: {
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
    minHeight: t.touchTarget,
  },
  toastSlot: { paddingHorizontal: 16, paddingBottom: 8 },
  tray: {
    backgroundColor: t.colors.card,
    borderTopColor: t.colors.line2,
    borderTopWidth: 1,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  trayHead: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  chips: { gap: 8, paddingBottom: 12 },
  chip: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 18,
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
  },
  primary: {
    alignItems: "center",
    backgroundColor: t.colors.brand,
    borderRadius: t.radii.button,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  busy: { opacity: 0.6 },
  floatingError: { paddingHorizontal: 20 },
}));
