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

struct FitBudWorkoutAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var exerciseName: String
    var setIndex: Int
    var setCount: Int
    var kilograms: Double
    var reps: Int
    var planKilograms: Double
    var planReps: Int
    var lastKilograms: Double
    var lastReps: Int
    var loggedLine: String?
    var finished: Bool
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

struct FitBudLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: FitBudWorkoutAttributes.self) { context in
      LiveActivityLockView(context: context)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.bottom) {
          LiveActivityExpandedView(context: context)
        }
      } compactLeading: {
        Image("AppIcon")
          .resizable()
          .frame(width: 22, height: 22)
          .clipShape(RoundedRectangle(cornerRadius: 5))
      } compactTrailing: {
        Text("Set \(context.state.setIndex) of \(context.state.setCount)")
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
      Text("Set \(context.state.setIndex) of \(context.state.setCount) · Last: \(formatKg(context.state.lastKilograms)) kg × \(context.state.lastReps)")
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
      Text("Set \(context.state.setIndex) of \(context.state.setCount) · Last: \(formatKg(context.state.lastKilograms)) kg × \(context.state.lastReps)")
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
