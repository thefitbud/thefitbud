import ActivityKit
import AppIntents
import Foundation

// Compiled into BOTH the FitBudLiveActivity widget and the FitBud app target
// (Z14-5, D-W14-12). @bacons/apple-targets links every file in a target's
// `_shared` folder to the main app as well (re-run prebuild after adding,
// renaming or removing a file here). A LiveActivityIntent is performed in the
// app's process, so its type must exist in the app: with widget-only
// membership the lock-screen Log button did nothing.
//
// Everything here must compile on its own in the app target: no widget views,
// no colours, nothing from the files next to this folder. The app target
// still supports iOS 15.1, hence the availability on each ActivityKit type.
// The App Group constant comes from GeneratedAppGroup.swift, which
// plugins/withLiveActivity.js writes into this folder on every prebuild.

/// Shared with the Expo app through the App Group. The app drains it into the
/// sync outbox (src/notifications/liveActivityOutbox.ts). Expo web cannot read it.
enum LiveActivityOutbox {
  /// Per-variant App Group, compiled in from GeneratedAppGroup.swift. Not read
  /// from Info.plist: @bacons/apple-targets 0.2.1 ignores a target's
  /// `infoPlist`, so in the widget bundle that lookup is nil.
  static let suite = FitBudAppGroup.identifier
  static let key = "liveActivityOutbox"

  /// Darwin notification posted after a row is appended. The app's
  /// LiveActivityModule observes it and emits `onOutboxRow` to JS, so a
  /// running app drains at once. Scoped by App Group so a staging intent never
  /// wakes the production app.
  static var appendedNotificationName: String { "\(suite).liveActivityOutbox.appended" }

  static func append(exerciseName: String, setIndex: Int, kilograms: Double, reps: Int) {
    let defaults = UserDefaults(suiteName: suite)
    var rows = defaults?.array(forKey: key) as? [[String: Any]] ?? []
    rows.append([
      "operation": "workout.log_set",
      "exerciseName": exerciseName,
      "setIndex": setIndex,
      "kilograms": kilograms,
      "reps": reps,
    ])
    defaults?.set(rows, forKey: key)
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      CFNotificationName(appendedNotificationName as CFString),
      nil,
      nil,
      true
    )
  }
}

func formatKg(_ value: Double) -> String {
  let rounded = (value * 10).rounded() / 10
  if rounded == rounded.rounded() {
    return String(Int(rounded))
  }
  return String(format: "%.1f", rounded)
}

/// Bodyweight (kg ≤ 0) → "12 reps"; weighted → "40 kg × 10". Never "0 kg".
func formatLoad(kilograms: Double, reps: Int) -> String {
  if kilograms <= 0 {
    return "\(reps) reps"
  }
  return "\(formatKg(kilograms)) kg × \(reps)"
}

/// Optimistic lock-screen line before JS replaces it. Omits when reps resolve to 0.
func optimisticLoggedLine(setIndex: Int, kilograms: Double, reps: Int, planReps: Int) -> String? {
  let effectiveReps = reps > 0 ? reps : planReps
  guard effectiveReps > 0 else { return nil }
  return "Set \(setIndex) logged · \(formatLoad(kilograms: kilograms, reps: effectiveReps))"
}

// KEEP IN SYNC: apps/mobile/modules/live-activity/ios/LiveActivityModule.swift
// declares a copy of FitBudWorkoutAttributes for the module. ActivityKit
// matches the copies by type name and Codable shape: every field name and type
// must match (app.config.test.ts compares them).
@available(iOS 16.1, *)
struct FitBudWorkoutAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var exerciseName: String
    var setIndex: Int
    var setCount: Int
    var kilograms: Double
    var reps: Int
    var planKilograms: Double
    var planReps: Int
    /// Nil when there is no previous value: no "Last" is shown.
    var lastKilograms: Double?
    var lastReps: Int?
    var loggedLine: String?
    var finished: Bool
    /// Rest after a logged set (frame 27c). The device counts down to it.
    var restEndsAt: Date?
    /// Full rest length, for the progress bar.
    var restSeconds: Int?
    /// From JS (`lastExercise === false`). While true, LogSetIntent must not
    /// set `finished` (Z12-48 / Z12-57, ISSUE-MAP #1 / #11).
    var moreExercisesRemain: Bool
  }

  var workoutName: String
  /// fitbud://workout/{assignmentId}?active=1 (or query fallback). Tile + Open.
  var openUrl: String
  /// When the activity started; drives the TR-15d elapsed timer.
  var startedAt: Date
}

@available(iOS 17.0, *)
struct LogSetIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Log set"
  /// Runs on the lock screen. iOS still asks for Face ID on the first tap.
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Exercise") var exerciseName: String
  @Parameter(title: "Set") var setIndex: Int
  @Parameter(title: "Kilograms") var kilograms: Double
  @Parameter(title: "Reps") var reps: Int

  init() {
    self.exerciseName = "Romanian deadlift"
    self.setIndex = 2
    self.kilograms = 22.5
    self.reps = 10
  }

  init(exerciseName: String, setIndex: Int, kilograms: Double, reps: Int) {
    self.exerciseName = exerciseName
    self.setIndex = setIndex
    self.kilograms = kilograms
    self.reps = reps
  }

  func perform() async throws -> some IntentResult {
    LiveActivityOutbox.append(
      exerciseName: exerciseName,
      setIndex: setIndex,
      kilograms: kilograms,
      reps: reps
    )
    for activity in Activity<FitBudWorkoutAttributes>.activities {
      var state = activity.content.state
      guard !state.finished else { continue }
      if let logged = optimisticLoggedLine(
        setIndex: setIndex,
        kilograms: kilograms,
        reps: reps,
        planReps: state.planReps
      ) {
        state.loggedLine = logged
      }
      let effectiveReps = reps > 0 ? reps : state.planReps
      if effectiveReps > 0 {
        state.lastKilograms = kilograms
        state.lastReps = effectiveReps
      }
      let next = state.setIndex + 1
      if next > state.setCount {
        // Never end the workout while more exercises remain; JS owns advance.
        if !state.moreExercisesRemain {
          state.finished = true
        }
      } else {
        state.setIndex = next
        state.kilograms = state.planKilograms
        state.reps = state.planReps
      }
      await activity.update(ActivityContent(state: state, staleDate: nil))
    }
    return .result()
  }
}

@available(iOS 17.0, *)
struct AdjustWeightIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Adjust weight"
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Direction") var direction: Int

  init() { self.direction = 1 }
  init(direction: Int) { self.direction = direction }

  func perform() async throws -> some IntentResult {
    for activity in Activity<FitBudWorkoutAttributes>.activities {
      var state = activity.content.state
      guard !state.finished else { continue }
      let step = direction >= 0 ? 2.5 : -2.5
      let next = max(0, state.kilograms + step)
      state.kilograms = (next * 10).rounded() / 10
      await activity.update(ActivityContent(state: state, staleDate: nil))
    }
    return .result()
  }
}

@available(iOS 17.0, *)
struct AdjustRepsIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Adjust reps"
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Direction") var direction: Int

  init() { self.direction = 1 }
  init(direction: Int) { self.direction = direction }

  func perform() async throws -> some IntentResult {
    for activity in Activity<FitBudWorkoutAttributes>.activities {
      var state = activity.content.state
      guard !state.finished else { continue }
      state.reps = max(0, state.reps + (direction >= 0 ? 1 : -1))
      await activity.update(ActivityContent(state: state, staleDate: nil))
    }
    return .result()
  }
}

/// Skip on the rest view (27c). Clears rest on the activity only: it logs
/// nothing and writes no outbox row. The app ends its own rest when it is
/// next active and sees the activity has none.
@available(iOS 17.0, *)
struct SkipRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Skip rest"
  static var openAppWhenRun: Bool = false

  init() {}

  func perform() async throws -> some IntentResult {
    for activity in Activity<FitBudWorkoutAttributes>.activities {
      var state = activity.content.state
      guard state.restEndsAt != nil else { continue }
      state.restEndsAt = nil
      state.restSeconds = nil
      await activity.update(ActivityContent(state: state, staleDate: nil))
    }
    return .result()
  }
}
