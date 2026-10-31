import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// Shared with the Expo app through the App Group. A dev build drains this
/// into the sync outbox. Expo web cannot read it.
enum LiveActivityOutbox {
  /// Per-variant App Group, written to Info.plist by plugins/withLiveActivity.js.
  static let suite = Bundle.main.object(forInfoDictionaryKey: "FitBudAppGroup") as? String
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

func formatKg(_ value: Double) -> String {
  let rounded = (value * 10).rounded() / 10
  if rounded == rounded.rounded() {
    return String(Int(rounded))
  }
  return String(format: "%.1f", rounded)
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
  }

  var workoutName: String
  /// fitbud://workout/{assignmentId}. The host app sets this when it starts the activity.
  var openUrl: String
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
    let logged = "Set \(setIndex) logged · \(formatKg(kilograms)) kg × \(reps)"
    for activity in Activity<FitBudWorkoutAttributes>.activities {
      var state = activity.content.state
      guard !state.finished else { continue }
      state.loggedLine = logged
      state.lastKilograms = kilograms
      state.lastReps = reps
      let next = state.setIndex + 1
      if next > state.setCount {
        state.finished = true
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

/// "Set 2 of 3" or "Set 2 of 3 · Last: 20 kg × 10".
func setProgressText(_ state: FitBudWorkoutAttributes.ContentState) -> String {
  let set = "Set \(state.setIndex) of \(state.setCount)"
  guard let kg = state.lastKilograms, let reps = state.lastReps else { return set }
  return "\(set) · Last: \(formatKg(kg)) kg × \(reps)"
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
      HStack(spacing: 0) {
        Text("Rest · ")
        Text(timerInterval: Date()...max(endsAt, Date()), countsDown: true)
          .monospacedDigit()
      }
      .font(.headline)
      Text(restLoggedLine(state))
        .font(.subheadline)
      ProgressView(timerInterval: min(startedAt, endsAt)...endsAt, countsDown: false) {
        EmptyView()
      } currentValueLabel: {
        EmptyView()
      }
      HStack {
        Text("Next \(formatKg(state.kilograms)) kg × \(state.reps)")
          .font(.title2.bold())
        Spacer()
        if #available(iOS 17.0, *) {
          Button(intent: SkipRestIntent()) {
            Text("Skip")
          }
          .buttonStyle(.bordered)
          .accessibilityLabel("Skip rest")
        }
      }
    }
  }
}

/// "Set 2 logged · 22.5 kg × 10 · Next: set 3 of 3".
func restLoggedLine(_ state: FitBudWorkoutAttributes.ContentState) -> String {
  let next = "Next: set \(state.setIndex) of \(state.setCount)"
  guard let logged = state.loggedLine else { return next }
  return "\(logged) · \(next)"
}

struct FitBudLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: FitBudWorkoutAttributes.self) { context in
      if isResting(context) {
        LiveActivityRestView(context: context)
      } else {
        LiveActivityLockView(context: context)
      }
    } dynamicIsland: { context in
      DynamicIsland {
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
        } else {
          Text("Set \(context.state.setIndex) of \(context.state.setCount)")
        }
      } minimal: {
        Text("\(context.state.setIndex)")
      }
    }
  }
}

private func openLink(_ raw: String) -> URL {
  URL(string: raw) ?? URL(string: "fitbud://today/self")!
}

private struct LiveActivityLockView: View {
  let context: ActivityViewContext<FitBudWorkoutAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("FitBud · \(context.attributes.workoutName)")
        .font(.caption)
      Text(context.state.exerciseName).font(.headline)
      Text(setProgressText(context.state))
        .font(.subheadline)
      if let logged = context.state.loggedLine {
        Text(logged).font(.caption)
      }
      HStack {
        Text("\(formatKg(context.state.kilograms)) kg × \(context.state.reps)")
          .font(.title2.bold())
        Spacer()
        Link("Open", destination: openLink(context.attributes.openUrl))
        if !context.state.finished {
          Button(intent: LogSetIntent(
            exerciseName: context.state.exerciseName,
            setIndex: context.state.setIndex,
            kilograms: context.state.kilograms,
            reps: context.state.reps
          )) {
            Image(systemName: "checkmark")
          }
          .buttonStyle(.borderedProminent)
          .accessibilityLabel("Log set \(context.state.setIndex)")
        }
      }
    }
  }
}

private struct LiveActivityExpandedView: View {
  let context: ActivityViewContext<FitBudWorkoutAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("FitBud · \(context.attributes.workoutName)")
      Text(context.state.exerciseName).font(.headline)
      Text(setProgressText(context.state))
      if let logged = context.state.loggedLine {
        Text(logged).font(.caption)
      }
      if !context.state.finished {
        HStack {
          Button(intent: AdjustWeightIntent(direction: -1)) { Text("−") }
            .accessibilityLabel("Less weight")
          Text("\(formatKg(context.state.kilograms)) kg")
          Button(intent: AdjustWeightIntent(direction: 1)) { Text("+") }
            .accessibilityLabel("More weight")
        }
        HStack {
          Button(intent: AdjustRepsIntent(direction: -1)) { Text("−") }
            .accessibilityLabel("Fewer reps")
          Text("\(context.state.reps) reps")
          Button(intent: AdjustRepsIntent(direction: 1)) { Text("+") }
            .accessibilityLabel("More reps")
        }
        HStack {
          Link("Open", destination: openLink(context.attributes.openUrl))
          Button(intent: LogSetIntent(
            exerciseName: context.state.exerciseName,
            setIndex: context.state.setIndex,
            kilograms: context.state.kilograms,
            reps: context.state.reps
          )) {
            Text("Log set \(context.state.setIndex)")
          }
        }
      }
    }
  }
}
