/**
 * The pieces of the active workout log (Z12-45): nav, stats strip, exercise
 * blocks, set rows, the rest bar and the banners. Layout and colour follow
 * the v3 kit (`docs/design/v3/kit-v3.css`: .wnav, .wstats, .ex, .sgrid, .sr,
 * .restbar); every colour is a theme token so the log follows light and dark.
 */
import { useRef, type ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  EllipsisVertical,
  Medal,
  Pause,
  SkipForward,
  Target,
  Timer,
  Trophy,
} from "lucide-react-native";
import { formatNumber } from "@fitbud/core";
import { Text } from "../../../components/Text";
import {
  createThemedStyles,
  shadowColor,
  useTheme,
  withAlpha,
} from "../../../providers/ThemeProvider";
import {
  displayLoad,
  isBodyweightLabel,
  loadCellIsKg,
  type KeypadField,
  type SetDraft,
} from "../../../workout/shared";

const TARGET = 44;

/** W-20: full offline header line — must not truncate at 360 dp / 393 pt. */
export const OFFLINE_NAV_LINE = "Offline · sets save on your phone";

/* ------------------------------------------------------------------ nav */

export function LogNav({
  title,
  subtitle,
  offline,
  paused,
  onMinimise,
  onPauseToggle,
  onFinish,
}: {
  title: string;
  subtitle: string | null;
  /** W-20: the API could not be reached when last tried. */
  offline: boolean;
  paused: boolean;
  onMinimise: () => void;
  onPauseToggle: () => void;
  onFinish: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.navBlock}>
      <View style={styles.nav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Minimise workout"
          onPress={onMinimise}
          hitSlop={6}
          style={styles.circBtn}
        >
          <ChevronDown color={theme.colors.ink} size={20} strokeWidth={2.2} />
        </Pressable>
        <View style={styles.navTitle}>
          <Text variant="headline" numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {!offline && subtitle ? (
            <Text variant="caption" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {/* W-19: Pause is a labelled control on the far side from Back. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={paused ? "Resume workout" : "Pause workout"}
          onPress={onPauseToggle}
          hitSlop={4}
          style={styles.navPill}
        >
          <Text style={styles.navPillText}>{paused ? "Resume" : "Pause"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Finish workout"
          onPress={onFinish}
          hitSlop={4}
          style={[styles.navPill, styles.navPillBrand]}
        >
          <Text style={[styles.navPillText, styles.navPillBrandText]}>Finish</Text>
        </Pressable>
      </View>
      {/* Own row so the full offline line wraps at phone widths (W-20). */}
      {offline ? (
        <Text variant="caption" style={styles.offlineLine} numberOfLines={2}>
          <Text variant="caption" tone="warn" style={styles.strong}>
            Offline
          </Text>
          {" · sets save on your phone"}
        </Text>
      ) : null}
    </View>
  );
}

/* ---------------------------------------------------------------- stats */

export function LogStats({
  clock,
  volumeKg,
  setsDone,
  setsTotal,
  paused,
}: {
  clock: string;
  volumeKg: number;
  setsDone: number;
  setsTotal: number;
  paused: boolean;
}) {
  const styles = useStyles();
  const share = setsTotal > 0 ? Math.min(1, setsDone / setsTotal) : 0;
  return (
    <View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text variant="caption">Duration</Text>
          <Text
            variant="numberMd"
            tone={paused ? "warn" : "brand"}
            accessibilityLabel={`Duration ${clock}`}
          >
            {clock}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="caption">Volume</Text>
          <Text variant="numberMd">
            {formatNumber(volumeKg)}
            <Text style={styles.unit}> kg</Text>
          </Text>
        </View>
        <View style={styles.stat}>
          <Text variant="caption">Sets</Text>
          <Text variant="numberMd" accessibilityLabel={`${setsDone} of ${setsTotal} sets`}>
            {setsDone}
            <Text style={styles.unit}> / {setsTotal}</Text>
          </Text>
        </View>
      </View>
      <View style={styles.prog} accessibilityElementsHidden>
        <View style={[styles.progFill, { width: `${Math.round(share * 1000) / 10}%` }]} />
      </View>
    </View>
  );
}

/* -------------------------------------------------------------- banners */

/** W-19: "Paused. The timer stopped at 23:14." with Resume. */
export function PausedBanner({
  clock,
  onResume,
}: {
  clock: string;
  onResume: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.pausedBanner} accessibilityRole="alert">
      <Pause color={theme.colors.warn} size={18} strokeWidth={2.2} />
      <Text style={styles.pausedText}>Paused. The timer stopped at {clock}.</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Resume"
        onPress={onResume}
        hitSlop={10}
        style={styles.pausedAction}
      >
        <Text style={styles.pausedActionText}>Resume</Text>
      </Pressable>
    </View>
  );
}

/** W-12: the record just set. Decorative motion-free; it leaves on its own. */
export function RecordBanner({ detail }: { detail: string }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.record} accessibilityRole="alert">
      <View style={styles.recordIcon}>
        <Trophy color={theme.colors.pr} size={21} strokeWidth={2.2} />
      </View>
      <View style={styles.flex1}>
        <Text variant="bodyStrong" tone="prInk">
          New personal record
        </Text>
        <Text variant="subhead" tone="prInk2" numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------- exercise */

/** Kit `.collapsed`: a finished (or folded) exercise as one line. */
export function CollapsedExercise({
  name,
  line,
  done,
  skipped,
  onPress,
}: {
  name: string;
  line: string;
  done: boolean;
  skipped: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${line}. Show sets`}
      onPress={onPress}
      style={styles.collapsed}
    >
      <View style={[styles.tile, done && !skipped ? styles.tileDone : null]}>
        {skipped ? (
          <SkipForward color={theme.colors.ink3} size={18} strokeWidth={2.2} />
        ) : done ? (
          <Check color={theme.colors.done} size={20} strokeWidth={2.6} />
        ) : (
          <Dumbbell color={theme.colors.brand} size={20} strokeWidth={2} />
        )}
      </View>
      <View style={styles.flex1}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="subhead" numberOfLines={1} style={styles.collapsedLine}>
          {line}
        </Text>
      </View>
      <ChevronDown color={theme.colors.ink3} size={20} strokeWidth={2} />
    </Pressable>
  );
}

/** Kit `.exh` + `.wchips` + `.cue`: an open exercise's head. */
export function ExerciseHead({
  name,
  planLine,
  restLine,
  cue,
  coachInitials,
  canFold,
  onFold,
  onMenu,
}: {
  name: string;
  planLine: string;
  /** "1:30", or null when the plan sets no rest. */
  restLine: string | null;
  cue: string | null;
  coachInitials: string;
  canFold: boolean;
  onFold: () => void;
  onMenu: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View>
      <View style={styles.exh}>
        <View style={styles.tile}>
          <Dumbbell color={theme.colors.brand} size={20} strokeWidth={2} />
        </View>
        <Text style={styles.exName} numberOfLines={2} accessibilityRole="header">
          {name}
        </Text>
        {canFold ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Hide sets of ${name}`}
            onPress={onFold}
            style={styles.iconHit}
          >
            <ChevronUp color={theme.colors.ink3} size={20} strokeWidth={2} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More for ${name}`}
          onPress={onMenu}
          style={styles.iconHit}
        >
          <EllipsisVertical color={theme.colors.ink2} size={20} strokeWidth={2.2} />
        </Pressable>
      </View>
      <View style={styles.chips}>
        {planLine ? (
          <View style={[styles.chip, styles.chipPlan]}>
            <Target color={theme.colors.coachInk} size={15} strokeWidth={2.2} />
            <Text style={[styles.chipText, styles.chipPlanText]}>{planLine}</Text>
          </View>
        ) : null}
        {restLine ? (
          <View style={styles.chip} accessibilityLabel={`Rest ${restLine}`}>
            <Timer color={theme.colors.ink} size={15} strokeWidth={2.2} />
            <Text style={styles.chipText}>{restLine}</Text>
          </View>
        ) : null}
      </View>
      {cue ? (
        <View style={styles.cue}>
          <View style={styles.coachAv}>
            <Text style={styles.coachAvText}>{coachInitials}</Text>
          </View>
          <Text style={styles.cueText}>{cue}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Kit `.sgrid.shd`: the column labels of the set table. */
export function SetTableHead({ bodyweight }: { bodyweight: boolean }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.sgridHead} accessibilityElementsHidden>
      <Text variant="label" style={styles.colSn}>
        Set
      </Text>
      <Text variant="label" style={styles.colPrev}>
        Previous
      </Text>
      {bodyweight ? null : (
        <Text variant="label" style={[styles.colKg, styles.center]}>
          kg
        </Text>
      )}
      <Text
        variant="label"
        style={[bodyweight ? styles.colRepsWide : styles.colReps, styles.center]}
      >
        Reps
      </Text>
      <View style={[styles.colCk, styles.centerBox]}>
        <Check color={theme.colors.ink3} size={15} strokeWidth={2.6} />
      </View>
    </View>
  );
}

export type SetRowState = "done" | "cur" | "up" | "skip";

export type LogSetRowSet = {
  id: string;
  order: number;
  prescribedReps: number | null;
  prescribedLoadLabel: string | null;
  actualReps: number | null;
  actualLoadLabel: string | null;
};

/**
 * One set (kit `.sr`). `done` and `skip` rows open the set sheet (W-13);
 * `cur` and `up` rows carry the load and reps cells and the tick. Swiping a
 * row that is still to do reveals Skip (W-08); the set number opens the same
 * action for anyone who cannot swipe.
 */
export function LogSetRow({
  set,
  number,
  state,
  draft,
  /** True while the cells still show the coach's targets, untouched. */
  target,
  activeField,
  previousLabel,
  record,
  disabled,
  onOpenField,
  onLog,
  onOpenSheet,
  onSkip,
}: {
  set: LogSetRowSet;
  /** 1-based position in the exercise. */
  number: number;
  state: SetRowState;
  draft: SetDraft;
  target: boolean;
  activeField: KeypadField | null;
  previousLabel: string;
  record: boolean;
  disabled: boolean;
  onOpenField: (field: KeypadField) => void;
  onLog: () => void;
  onOpenSheet: () => void;
  onSkip: () => void;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const swipeRef = useRef<Swipeable>(null);
  const open = state === "cur" || state === "up";
  const bodyweight = open
    ? draft.bodyweight
    : isBodyweightLabel(set.actualLoadLabel ?? set.prescribedLoadLabel);
  const rowStyle =
    state === "done"
      ? styles.srDone
      : state === "cur"
        ? styles.srCur
        : state === "skip"
          ? styles.srSkip
          : null;
  const doneLoad = displayLoad(set.actualLoadLabel ?? set.prescribedLoadLabel);
  const doneReps = set.actualReps ?? set.prescribedReps;

  const openLoad =
    draft.load.trim() !== ""
      ? `${draft.load} kg`
      : isBodyweightLabel(set.prescribedLoadLabel)
        ? ""
        : displayLoad(set.prescribedLoadLabel);
  const openReps = draft.reps.trim() || "—";
  const logValues =
    bodyweight || openLoad === ""
      ? `${openReps} reps`
      : `${openLoad} × ${openReps}`;

  const cell = (field: KeypadField) => {
    // A load the plan gives as text ("RPE 7") shows as written until a
    // weight is typed; nothing is invented for it.
    const planText =
      field === "load" && !isBodyweightLabel(set.prescribedLoadLabel)
        ? displayLoad(set.prescribedLoadLabel)
        : "";
    const typed = field === "load" ? draft.load : draft.reps;
    const value = typed.trim() !== "" ? typed : planText;
    const empty = value.trim() === "";
    const label =
      field === "load"
        ? `Set ${number} load: ${empty ? "none" : `${value}${loadCellIsKg(draft) ? " kg" : ""}`}`
        : `Set ${number} reps: ${empty ? "none" : value}`;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        onPress={() => onOpenField(field)}
        hitSlop={{ top: 6, bottom: 6 }}
        style={[
          field === "load"
            ? styles.colKg
            : bodyweight
              ? styles.colRepsWide
              : styles.colReps,
          styles.cell,
          state === "cur" ? styles.cellCur : styles.cellUp,
          state === "cur" && activeField === field ? styles.cellFocus : null,
        ]}
      >
        <Text
          style={[
            styles.cellText,
            empty ? styles.cellPlaceholder : target ? styles.cellGhost : null,
          ]}
          numberOfLines={1}
        >
          {empty ? (field === "load" ? "kg" : "reps") : value}
        </Text>
      </Pressable>
    );
  };

  const row = (
    <View style={[styles.sr, rowStyle]}>
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Set ${number} options`}
          onPress={onOpenSheet}
          style={[styles.colSn, styles.snHit]}
        >
          <View style={styles.sn}>
            <Text style={styles.snText}>{number}</Text>
          </View>
        </Pressable>
      ) : (
        <View style={[styles.colSn, styles.snHit]}>
          <View style={[styles.sn, state === "done" ? styles.snDone : null]}>
            <Text style={styles.snText}>{number}</Text>
          </View>
        </View>
      )}
      <View style={[styles.colPrev, styles.prevRow]}>
        <Text style={styles.prevText} numberOfLines={1}>
          {previousLabel}
        </Text>
        {record ? (
          <View style={styles.prTag} accessibilityLabel="Personal record">
            <Medal color={theme.colors.pr} size={12} strokeWidth={2.4} />
            <Text style={styles.prTagText}>PR</Text>
          </View>
        ) : null}
      </View>
      {open ? (
        <>
          {bodyweight ? null : cell("load")}
          {cell("reps")}
          <Pressable
            accessibilityRole="button"
            // Says what the tick logs: "Log set 3 · 40 kg × 10".
            accessibilityLabel={`Log set ${number} · ${logValues}`}
            disabled={disabled}
            onPress={onLog}
            style={[styles.colCk, styles.ckHit]}
          >
            <View style={[styles.ck, state === "cur" ? styles.ckCur : styles.ckUp]}>
              <Check
                color={state === "cur" ? theme.colors.brand : theme.colors.ink4}
                size={18}
                strokeWidth={2.8}
              />
            </View>
          </Pressable>
        </>
      ) : (
        <>
          {state === "skip" ? (
            <Text
              style={[
                bodyweight ? styles.colRepsWide : styles.colSkipWide,
                styles.center,
                styles.skipText,
              ]}
            >
              Skipped
            </Text>
          ) : (
            <>
              {bodyweight ? null : (
                <Text style={[styles.colKg, styles.center, styles.cellText]}>
                  {doneLoad}
                </Text>
              )}
              <Text
                style={[
                  bodyweight ? styles.colRepsWide : styles.colReps,
                  styles.center,
                  styles.cellText,
                ]}
              >
                {doneReps ?? "—"}
              </Text>
            </>
          )}
          <View style={[styles.colCk, styles.ckHit]}>
            <View style={[styles.ck, state === "done" ? styles.ckDone : styles.ckUp]}>
              {state === "done" ? (
                <Check color={theme.colors.onBrand} size={18} strokeWidth={2.8} />
              ) : (
                <SkipForward color={theme.colors.ink4} size={16} strokeWidth={2.4} />
              )}
            </View>
          </View>
        </>
      )}
    </View>
  );

  if (!open) {
    const summary =
      state === "skip"
        ? "skipped"
        : `${bodyweight ? "" : `${doneLoad} kg × `}${doneReps ?? "—"}${bodyweight ? " reps" : ""}, logged`;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Set ${number}, ${summary}${record ? ", personal record" : ""}. Change`}
        disabled={disabled}
        onPress={onOpenSheet}
      >
        {row}
      </Pressable>
    );
  }

  // react-native-web has no Swipeable: the set number offers the same action.
  if (Platform.OS === "web" || disabled) return row;

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      overshootRight={false}
      rightThreshold={40}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Skip set ${number}`}
          onPress={() => {
            swipeRef.current?.close();
            onSkip();
          }}
          style={styles.swipeSkip}
        >
          <SkipForward color={theme.colors.onBrand} size={18} strokeWidth={2.2} />
          <Text style={styles.swipeText}>Skip</Text>
        </Pressable>
      )}
    >
      {row}
    </Swipeable>
  );
}

/** "Purple values are Rahul’s targets. Tap ✓ to log them as is." */
export function TargetLegend({ coachFirst }: { coachFirst: string }) {
  const styles = useStyles();
  const owner = coachFirst === "your coach" ? "your coach’s" : `${coachFirst}’s`;
  return (
    <View style={styles.legend}>
      <View style={styles.legendDot} />
      <Text variant="caption" style={styles.flex1}>
        Purple values are {owner} targets. Tap ✓ to log them as is.
      </Text>
    </View>
  );
}

/** Kit `.wsep`: the band between two exercises. */
export function ExerciseSeparator() {
  const styles = useStyles();
  return <View style={styles.wsep} />;
}

/* ------------------------------------------------------------- rest bar */

/** W-05a: the running rest. `clock` and `fraction` come from `restCountdown.ts`. */
export function RestBar({
  clock,
  fraction,
  label,
  onLess,
  onMore,
  onSkip,
}: {
  clock: string;
  /** Share of the rest already spent, 0 to 1. */
  fraction: number;
  label: string;
  onLess: () => void;
  onMore: () => void;
  onSkip: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.restbar}>
      <View style={styles.restTrack} accessibilityElementsHidden>
        <View
          style={[styles.restFill, { width: `${Math.round(fraction * 1000) / 10}%` }]}
        />
      </View>
      <View style={styles.flex1}>
        <Text style={styles.restLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text
          style={styles.restClock}
          accessibilityRole="timer"
          accessibilityLabel={`Rest, ${clock} left`}
        >
          {clock}
        </Text>
      </View>
      <RestKey label="−15" accessibilityLabel="15 seconds less" onPress={onLess} />
      <RestKey label="+15" accessibilityLabel="15 seconds more" onPress={onMore} />
      <RestKey label="Skip" accessibilityLabel="Skip rest" onPress={onSkip} solid />
    </View>
  );
}

function RestKey({
  label,
  accessibilityLabel,
  onPress,
  solid = false,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  solid?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8 }}
      style={[styles.rb, solid ? styles.rbSolid : null]}
    >
      <Text style={[styles.rbText, solid ? styles.rbSolidText : null]}>{label}</Text>
    </Pressable>
  );
}

/** W-05b: the rest is over; what comes next, and OK to put it away. */
export function RestDoneBar({
  next,
  onOk,
}: {
  next: string;
  onOk: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.restbar, styles.restDone]} accessibilityRole="alert">
      <View style={styles.flex1}>
        <Text style={styles.restDoneLabel}>Rest done</Text>
        <Text style={styles.restDoneNext} numberOfLines={1}>
          {next}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="OK"
        onPress={onOk}
        hitSlop={{ top: 8, bottom: 8 }}
        style={[styles.rb, styles.rbOk]}
      >
        <Text style={[styles.rbText, styles.rbOkText]}>OK</Text>
      </Pressable>
    </View>
  );
}

/** A plain row wrapper so callers can pad list content like the kit's `.ex`. */
export function ExercisePad({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <View style={styles.ex}>{children}</View>;
}

const useStyles = createThemedStyles((t) => ({
  flex1: { flex: 1, minWidth: 0 },
  strong: { fontWeight: "600" },
  center: { textAlign: "center" },
  centerBox: { alignItems: "center", justifyContent: "center" },

  navBlock: { backgroundColor: t.colors.card },
  nav: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  circBtn: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  navTitle: { flex: 1, minWidth: 0 },
  offlineLine: {
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  navPill: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  navPillText: {
    ...t.text.bodyStrong.style,
    color: t.colors.ink,
    fontSize: 15,
  },
  navPillBrand: { backgroundColor: t.colors.brand },
  navPillBrandText: { color: t.colors.onBrand },

  stats: {
    backgroundColor: t.colors.card,
    flexDirection: "row",
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  stat: { flex: 1 },
  unit: {
    ...t.text.subhead.style,
    color: t.colors.ink3,
    fontSize: 14,
  },
  prog: { backgroundColor: t.colors.fill, height: 3 },
  progFill: {
    backgroundColor: t.colors.brand,
    borderBottomRightRadius: 2,
    borderTopRightRadius: 2,
    height: 3,
  },

  pausedBanner: {
    alignItems: "center",
    backgroundColor: t.colors.warnTint,
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    minHeight: TARGET,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pausedText: {
    ...t.text.subhead.style,
    color: t.colors.warnInk,
    flex: 1,
  },
  pausedAction: { justifyContent: "center", minHeight: 28 },
  pausedActionText: {
    ...t.text.bodyStrong.style,
    color: t.colors.warnInk,
    fontSize: 14,
  },

  record: {
    alignItems: "center",
    backgroundColor: t.colors.prTint,
    borderColor: t.colors.prTint2,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: shadowColor(t),
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: t.scheme === "dark" ? 0 : 0.18,
    shadowRadius: 26,
  },
  recordIcon: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },

  ex: { paddingHorizontal: 16 },
  collapsed: {
    alignItems: "center",
    borderBottomColor: t.colors.line,
    borderBottomWidth: 0.5,
    flexDirection: "row",
    gap: 12,
    minHeight: 62,
    paddingHorizontal: 16,
  },
  collapsedLine: { fontSize: 13.5 },
  tile: {
    alignItems: "center",
    backgroundColor: t.colors.brandTint,
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  tileDone: { backgroundColor: t.colors.doneTint },
  exh: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    minHeight: 56,
  },
  exName: {
    ...t.text.headline.style,
    color: t.colors.brand,
    flex: 1,
  },
  iconHit: {
    alignItems: "center",
    height: TARGET,
    justifyContent: "center",
    marginRight: -10,
    width: TARGET,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  chip: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 10,
    flexDirection: "row",
    gap: 6,
    height: 32,
    paddingHorizontal: 11,
  },
  chipPlan: { backgroundColor: t.colors.coachTint },
  chipText: {
    ...t.text.bodyStrong.style,
    color: t.colors.ink,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  chipPlanText: { color: t.colors.coachInk },
  cue: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    marginBottom: 2,
    marginTop: 10,
  },
  coachAv: {
    alignItems: "center",
    backgroundColor: t.colors.coach,
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  coachAvText: {
    color: t.colors.onCoach,
    fontSize: 10,
    fontWeight: "700",
  },
  cueText: {
    ...t.text.subhead.style,
    color: t.colors.ink,
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },

  sgridHead: {
    alignItems: "center",
    columnGap: 8,
    flexDirection: "row",
    height: 30,
    marginTop: 8,
  },
  sr: {
    alignItems: "center",
    backgroundColor: t.colors.card,
    columnGap: 8,
    flexDirection: "row",
    height: 48,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  srDone: { backgroundColor: t.colors.doneRow },
  srCur: { backgroundColor: t.colors.rowCur },
  srSkip: { backgroundColor: t.colors.rowSkip },
  colSn: { width: 34 },
  colPrev: { flex: 1, minWidth: 0 },
  colKg: { width: 72 },
  colReps: { width: 60 },
  colRepsWide: { width: 140 },
  colSkipWide: { width: 140 },
  colCk: { width: 40 },
  snHit: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
  },
  sn: {
    alignItems: "center",
    backgroundColor: t.colors.fill,
    borderRadius: 8,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  snDone: { backgroundColor: t.colors.snDone },
  snText: {
    color: t.colors.ink,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  prevRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  prevText: {
    color: t.colors.ink3,
    flexShrink: 1,
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  prTag: {
    alignItems: "center",
    backgroundColor: t.colors.prTint,
    borderRadius: 6,
    flexDirection: "row",
    gap: 2,
    height: 19,
    paddingLeft: 4,
    paddingRight: 6,
  },
  prTagText: { color: t.colors.pr, fontSize: 11, fontWeight: "700" },
  cell: {
    alignItems: "center",
    borderRadius: 10,
    // 36 pt cell in a 48 pt row; the row's height is the touch target.
    height: 36,
    justifyContent: "center",
  },
  cellCur: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.line2,
    borderWidth: 1,
  },
  cellFocus: { borderColor: t.colors.brand, borderWidth: 2 },
  cellUp: { backgroundColor: t.colors.fill },
  cellText: {
    color: t.colors.ink,
    fontSize: 17,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
    letterSpacing: -0.25,
  },
  cellGhost: { color: t.colors.ghost },
  cellPlaceholder: { color: t.colors.ink4, fontWeight: "500" },
  skipText: { color: t.colors.ink3, fontSize: 15, fontWeight: "500" },
  ckHit: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
  },
  ck: {
    alignItems: "center",
    borderRadius: 9,
    height: 32,
    justifyContent: "center",
    width: 36,
  },
  ckDone: { backgroundColor: t.colors.done },
  ckCur: {
    backgroundColor: t.colors.card,
    borderColor: t.colors.brand,
    borderWidth: 1.5,
  },
  ckUp: { backgroundColor: t.colors.fill },
  swipeSkip: {
    alignItems: "center",
    backgroundColor: t.colors.ink3,
    height: 48,
    justifyContent: "center",
    width: 84,
  },
  swipeText: { color: t.colors.onBrand, fontSize: 12.5, fontWeight: "600" },
  legend: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  legendDot: {
    backgroundColor: t.colors.ghost,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  wsep: {
    backgroundColor: t.colors.bg,
    borderBottomWidth: 0.5,
    borderColor: t.colors.line,
    borderTopWidth: 0.5,
    height: 8,
    marginTop: 18,
  },

  restbar: {
    alignItems: "center",
    backgroundColor: t.colors.navy,
    borderRadius: 20,
    flexDirection: "row",
    gap: 12,
    height: 60,
    marginHorizontal: 12,
    overflow: "hidden",
    paddingLeft: 16,
    paddingRight: 10,
    shadowColor: shadowColor(t),
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: t.scheme === "dark" ? 0 : 0.28,
    shadowRadius: 30,
  },
  restTrack: {
    backgroundColor: withAlpha(t.colors.white, 0.12),
    bottom: 0,
    height: 3,
    left: 0,
    position: "absolute",
    right: 0,
  },
  restFill: { backgroundColor: t.colors.coral, height: 3 },
  restLabel: {
    color: withAlpha(t.colors.white, 0.65),
    fontSize: 12,
    fontWeight: "500",
  },
  restClock: {
    color: t.colors.white,
    fontSize: 22,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  rb: {
    alignItems: "center",
    backgroundColor: withAlpha(t.colors.white, 0.12),
    borderRadius: 12,
    height: 40,
    justifyContent: "center",
    minWidth: 48,
    paddingHorizontal: 12,
  },
  rbText: {
    color: t.colors.white,
    fontSize: 14.5,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  rbSolid: { backgroundColor: t.colors.white },
  rbSolidText: { color: t.colors.fixedNavy },
  restDone: { backgroundColor: t.colors.done },
  restDoneLabel: {
    color: t.colors.onBrand,
    fontSize: 12,
    fontWeight: "500",
    opacity: 0.8,
  },
  restDoneNext: {
    color: t.colors.onBrand,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  rbOk: { backgroundColor: t.colors.onBrand },
  rbOkText: { color: t.colors.done },
}));
