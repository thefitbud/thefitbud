import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// Shared with the Expo app through the App Group. A dev build drains this
/// into the sync outbox. Expo web cannot read it.
enum LiveActivityOutbox {
  static let suite = "group.com.thefitbud.mobile"
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

struct FitBudWorkoutAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var phase: String
    var exerciseName: String
    var setIndex: Int
    var setCount: Int
    var kilograms: Double
    var reps: Int
    var restEndsAt: Date?
  }

  var workoutName: String
  var exerciseIndex: Int
  var exerciseCount: Int
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
    let restEnds = Date().addingTimeInterval(58)
    for activity in Activity<FitBudWorkoutAttributes>.activities {
      var state = activity.content.state
      state.phase = "rest"
      state.kilograms = kilograms
      state.reps = reps
      state.restEndsAt = restEnds
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
      guard state.phase == "logging" else { continue }
      let next = max(0, state.kilograms + (direction >= 0 ? 2.5 : -2.5))
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
      guard state.phase == "logging" else { continue }
      state.reps = max(0, state.reps + (direction >= 0 ? 1 : -1))
      await activity.update(ActivityContent(state: state, staleDate: nil))
    }
    return .result()
  }
}

@available(iOS 17.0, *)
struct AddRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Add 30 seconds"
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    for activity in Activity<FitBudWorkoutAttributes>.activities {
      var state = activity.content.state
      guard state.phase == "rest" else { continue }
      let end = state.restEndsAt ?? Date()
      state.restEndsAt = end.addingTimeInterval(30)
      await activity.update(ActivityContent(state: state, staleDate: nil))
    }
    return .result()
  }
}

@available(iOS 17.0, *)
struct SkipRestIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Skip rest"
  static var openAppWhenRun: Bool = false

  func perform() async throws -> some IntentResult {
    for activity in Activity<FitBudWorkoutAttributes>.activities {
      var state = activity.content.state
      guard state.phase == "rest" else { continue }
      state.phase = "go"
      state.restEndsAt = nil
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
        if context.state.phase == "rest", let end = context.state.restEndsAt {
          Text(timerInterval: Date()...end, countsDown: true)
        } else {
          Text("Set \(context.state.setIndex)")
        }
      } minimal: {
        Text("\(context.state.setIndex)")
      }
    }
  }
}

private struct LiveActivityLockView: View {
  let context: ActivityViewContext<FitBudWorkoutAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("\(context.attributes.workoutName) · exercise \(context.attributes.exerciseIndex) of \(context.attributes.exerciseCount)")
      Text(context.state.exerciseName).font(.headline)
      if context.state.phase == "logging" {
        Text("Set \(context.state.setIndex) of \(context.state.setCount)")
        HStack {
          Button(intent: AdjustWeightIntent(direction: -1)) { Text("−") }
          Text("\(context.state.kilograms, specifier: "%.1f") kg")
          Button(intent: AdjustWeightIntent(direction: 1)) { Text("+") }
        }
        HStack {
          Button(intent: AdjustRepsIntent(direction: -1)) { Text("−") }
          Text("\(context.state.reps)")
          Button(intent: AdjustRepsIntent(direction: 1)) { Text("+") }
        }
        Button(intent: LogSetIntent(
          exerciseName: context.state.exerciseName,
          setIndex: context.state.setIndex,
          kilograms: context.state.kilograms,
          reps: context.state.reps
        )) {
          Text("Log set \(context.state.setIndex)")
        }
        Link("Adjust in app", destination: URL(string: "fitbud://workout/active")!)
      } else if context.state.phase == "rest", let end = context.state.restEndsAt {
        Text("Set \(context.state.setIndex) logged · \(context.state.kilograms, specifier: "%.1f") kg × \(context.state.reps)")
        Text(timerInterval: Date()...end, countsDown: true)
        HStack {
          Button(intent: AddRestIntent()) { Text("+30 s") }
          Button(intent: SkipRestIntent()) { Text("Skip rest") }
        }
      } else {
        Text("Set \(context.state.setIndex + 1) · Go")
      }
    }
  }
}

private struct LiveActivityExpandedView: View {
  let context: ActivityViewContext<FitBudWorkoutAttributes>

  var body: some View {
    LiveActivityLockView(context: context)
  }
}
