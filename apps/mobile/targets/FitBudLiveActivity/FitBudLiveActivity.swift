import ActivityKit
import AppIntents
import Foundation
import SwiftUI
import WidgetKit

/// Shared with the Expo app through the App Group. A dev build drains this
/// into the sync outbox. Expo web cannot read it.
enum LiveActivityOutbox {
  /// Per-variant App Group, compiled in from GeneratedAppGroup.swift, which
  /// plugins/withLiveActivity.js writes on every prebuild. It is not read from
  /// Info.plist: @bacons/apple-targets 0.2.1 ignores a target's `infoPlist`, so
  /// in the widget bundle that lookup is nil and the rows would go to the
  /// widget's own defaults, where the app can never read them.
  static let suite = FitBudAppGroup.identifier
  static let key = "liveActivityOutbox"

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
  }
}

// MARK: - Colours (v3 tokens; Live Activity cannot import packages/tokens)

private enum FitBudLA {
  /// light.coach / mock Target colour (~#5B43B9 sampled from TR-15d).
  static let coach = Color(red: 84 / 255, green: 72 / 255, blue: 200 / 255)
  /// light.coralStrong (#EE456E).
  static let coral = Color(red: 238 / 255, green: 69 / 255, blue: 110 / 255)
  static let secondary = Color.secondary
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

/// Fraction through the current exercise's sets (workout-wide progress needs a
/// JS field; TR-15d's bar is still coral and readable from this).
func setProgressFraction(_ state: FitBudWorkoutAttributes.ContentState) -> CGFloat {
  guard state.setCount > 0 else { return 0 }
  return min(1, CGFloat(state.setIndex) / CGFloat(state.setCount))
}

// KEEP IN SYNC: apps/mobile/modules/live-activity/ios/LiveActivityModule.swift
// declares a copy of FitBudWorkoutAttributes for the app. ActivityKit matches
// the two by type name and Codable shape: every field name and type must match.
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

/// True while rest has time left. The app sends restEndsAt as the activity's
/// staleDate, so iOS redraws when it passes and the set view comes back
/// without the app running.
func isResting(_ context: ActivityViewContext<FitBudWorkoutAttributes>) -> Bool {
  guard let endsAt = context.state.restEndsAt, !context.state.finished else { return false }
  return !context.isStale && endsAt > Date()
}

/// Frame 27c: rest countdown, progress, logged line, next set, Skip.
struct LiveActivityRestView: View {
  let context: ActivityViewContext<FitBudWorkoutAttributes>

  var body: some View {
    let state = context.state
    let endsAt = state.restEndsAt ?? Date()
    let startedAt = endsAt.addingTimeInterval(-Double(state.restSeconds ?? 0))
    VStack(alignment: .leading, spacing: 6) {
      Text("FitBud · \(context.attributes.workoutName)")
        .font(.caption)
        .lineLimit(2)
      HStack(spacing: 0) {
        Text("Rest · ")
        Text(timerInterval: Date()...max(endsAt, Date()), countsDown: true)
          .monospacedDigit()
      }
      .font(.headline)
      .lineLimit(2)
      Text(restLoggedLine(state))
        .font(.subheadline)
        .lineLimit(2)
      ProgressView(timerInterval: min(startedAt, endsAt)...endsAt, countsDown: false) {
        EmptyView()
      } currentValueLabel: {
        EmptyView()
      }
      .tint(FitBudLA.coral)
      HStack {
        Text("Next \(formatLoad(kilograms: state.kilograms, reps: state.reps))")
          .font(.title2.bold())
          .lineLimit(2)
        Spacer()
        if #available(iOS 17.0, *) {
          Button(intent: SkipRestIntent()) {
            // Touch target at least 44 pt (CLAUDE.md); 27c draws a ~50 pt circle.
            Text("Skip")
              .frame(minWidth: 44, minHeight: 44)
              .padding(.horizontal, 4)
          }
          .buttonStyle(.bordered)
          .buttonBorderShape(.circle)
          .accessibilityLabel("Skip rest")
        }
      }
    }
  }
}

/// Show JS's `loggedLine` as sent (including crossing). Do not invent a
/// "Next: set n of m" that drops the exercise name (ISSUE-MAP #11).
func restLoggedLine(_ state: FitBudWorkoutAttributes.ContentState) -> String {
  if let logged = state.loggedLine, !logged.isEmpty {
    return logged
  }
  return "Next: \(state.exerciseName), set \(state.setIndex) of \(state.setCount)"
}

struct FitBudLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: FitBudWorkoutAttributes.self) { context in
      Group {
        if isResting(context) {
          LiveActivityRestView(context: context)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        } else {
          LiveActivityLockView(context: context)
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .widgetURL(openLink(context.attributes.openUrl))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text("FitBud · \(context.attributes.workoutName)")
            .font(.caption2)
            .lineLimit(2)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if isResting(context), let endsAt = context.state.restEndsAt {
            Text(timerInterval: Date()...max(endsAt, Date()), countsDown: true)
              .monospacedDigit()
              .font(.caption)
              .lineLimit(2)
          } else {
            Text(context.attributes.startedAt, style: .timer)
              .monospacedDigit()
              .font(.caption)
              .lineLimit(2)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          if isResting(context) {
            LiveActivityRestView(context: context)
          } else {
            LiveActivityExpandedView(context: context)
          }
        }
      } compactLeading: {
        Image("AppIcon")
          .resizable()
          .frame(width: 22, height: 22)
          .clipShape(RoundedRectangle(cornerRadius: 5))
      } compactTrailing: {
        if isResting(context), let endsAt = context.state.restEndsAt {
          Text(timerInterval: Date()...max(endsAt, Date()), countsDown: true)
            .monospacedDigit()
            .frame(maxWidth: 44)
            .lineLimit(2)
        } else {
          Text("Set \(context.state.setIndex)/\(context.state.setCount)")
            .lineLimit(2)
        }
      } minimal: {
        Text("\(context.state.setIndex)")
          .lineLimit(2)
      }
    }
  }
}

private func openLink(_ raw: String) -> URL {
  URL(string: raw) ?? URL(string: "fitbud://today/self")!
}

/// TR-15d lock-screen tile: fixed 160 pt, every text lineLimit(2).
private struct LiveActivityLockView: View {
  let context: ActivityViewContext<FitBudWorkoutAttributes>

  var body: some View {
    let state = context.state
    let displayReps = state.reps > 0 ? state.reps : state.planReps
    let targetLoad = formatLoad(kilograms: state.kilograms, reps: displayReps)
    let logLabel = "Log \(targetLoad)"

    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        Text("FitBud · \(context.attributes.workoutName)")
          .font(.caption)
          .lineLimit(2)
        Spacer(minLength: 8)
        Text(context.attributes.startedAt, style: .timer)
          .font(.caption)
          .monospacedDigit()
          .multilineTextAlignment(.trailing)
          .lineLimit(2)
      }

      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(state.exerciseName)
          .font(.headline)
          .lineLimit(2)
        Spacer(minLength: 8)
        Text("Set \(state.setIndex) of \(state.setCount)")
          .font(.subheadline)
          .foregroundStyle(FitBudLA.secondary)
          .lineLimit(2)
      }

      HStack(alignment: .firstTextBaseline, spacing: 12) {
        if let kg = state.lastKilograms, let reps = state.lastReps {
          Text("Last \(formatLoad(kilograms: kg, reps: reps))")
            .font(.subheadline)
            .foregroundStyle(FitBudLA.secondary)
            .lineLimit(2)
        }
        Text("Target \(formatLoad(kilograms: state.planKilograms, reps: state.planReps > 0 ? state.planReps : state.reps))")
          .font(.subheadline)
          .foregroundStyle(FitBudLA.coach)
          .lineLimit(2)
        Spacer(minLength: 0)
      }

      if let logged = state.loggedLine, !logged.isEmpty {
        Text(logged)
          .font(.caption)
          .lineLimit(2)
      }

      HStack(spacing: 8) {
        if !state.finished {
          if #available(iOS 17.0, *) {
            Button(intent: LogSetIntent(
              exerciseName: state.exerciseName,
              setIndex: state.setIndex,
              kilograms: state.kilograms,
              reps: displayReps
            )) {
              HStack(spacing: 6) {
                Image(systemName: "checkmark")
                Text(logLabel)
                  .lineLimit(2)
              }
              .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 26 / 255, green: 18 / 255, blue: 72 / 255))
            .accessibilityLabel(logLabel)
          }
        } else {
          Text(targetLoad)
            .font(.title3.bold())
            .lineLimit(2)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        }
        Link(destination: openLink(context.attributes.openUrl)) {
          Text("Open")
            .font(.subheadline.weight(.semibold))
            .frame(minWidth: 56, minHeight: 44)
            .padding(.horizontal, 8)
        }
        .buttonStyle(.bordered)
        .accessibilityLabel("Open workout")
      }

      GeometryReader { geo in
        ZStack(alignment: .leading) {
          Capsule()
            .fill(FitBudLA.coral.opacity(0.25))
          Capsule()
            .fill(FitBudLA.coral)
            .frame(width: max(4, geo.size.width * setProgressFraction(state)))
        }
      }
      .frame(height: 3)
      .accessibilityLabel("Set progress")
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
    .frame(height: 160, alignment: .topLeading)
  }
}

private struct LiveActivityExpandedView: View {
  let context: ActivityViewContext<FitBudWorkoutAttributes>

  var body: some View {
    let state = context.state
    let logLabel = "Log \(formatLoad(kilograms: state.kilograms, reps: state.reps > 0 ? state.reps : state.planReps))"

    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        Text(state.exerciseName)
          .font(.headline)
          .lineLimit(2)
        Spacer(minLength: 8)
        Text("Set \(state.setIndex) of \(state.setCount)")
          .font(.subheadline)
          .lineLimit(2)
      }
      HStack(spacing: 12) {
        if let kg = state.lastKilograms, let reps = state.lastReps {
          Text("Last \(formatLoad(kilograms: kg, reps: reps))")
            .font(.caption)
            .foregroundStyle(FitBudLA.secondary)
            .lineLimit(2)
        }
        Text("Target \(formatLoad(kilograms: state.planKilograms, reps: state.planReps > 0 ? state.planReps : state.reps))")
          .font(.caption)
          .foregroundStyle(FitBudLA.coach)
          .lineLimit(2)
      }
      if let logged = state.loggedLine, !logged.isEmpty {
        Text(logged)
          .font(.caption2)
          .lineLimit(2)
      }
      if !state.finished {
        HStack(spacing: 8) {
          if #available(iOS 17.0, *) {
            Button(intent: AdjustWeightIntent(direction: -1)) { Text("−").frame(minWidth: 44, minHeight: 44) }
              .accessibilityLabel("Less weight")
            Text(formatLoad(kilograms: state.kilograms, reps: state.reps > 0 ? state.reps : state.planReps))
              .lineLimit(2)
            Button(intent: AdjustWeightIntent(direction: 1)) { Text("+").frame(minWidth: 44, minHeight: 44) }
              .accessibilityLabel("More weight")
            Spacer(minLength: 4)
            Link("Open", destination: openLink(context.attributes.openUrl))
              .frame(minWidth: 44, minHeight: 44)
            Button(intent: LogSetIntent(
              exerciseName: state.exerciseName,
              setIndex: state.setIndex,
              kilograms: state.kilograms,
              reps: state.reps > 0 ? state.reps : state.planReps
            )) {
              Text(logLabel)
                .lineLimit(2)
                .frame(minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
          }
        }
      }
    }
  }
}
