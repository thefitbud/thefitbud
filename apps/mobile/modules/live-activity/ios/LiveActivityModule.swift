import ActivityKit
import ExpoModulesCore

// Local updates only (D-B7, D-W2-5): no push token, no APNs, no network.
//
// KEEP IN SYNC: this is a copy of FitBudWorkoutAttributes in
// apps/mobile/targets/FitBudLiveActivity/FitBudLiveActivity.swift.
// ActivityKit matches the app's and the widget's types by type name and
// Codable shape, so every field name and type must stay identical.
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
    var lastKilograms: Double
    var lastReps: Int
    var loggedLine: String?
    var finished: Bool
  }

  var workoutName: String
  /// fitbud://workout/{assignmentId}. The host app sets this when it starts the activity.
  var openUrl: String
}

/// JS → native shape of FitBudWorkoutAttributes (src/notifications/liveActivityNative.ts).
struct WorkoutAttributesRecord: Record {
  @Field var workoutName: String = ""
  @Field var openUrl: String = ""
}

/// JS → native shape of FitBudWorkoutAttributes.ContentState.
struct WorkoutStateRecord: Record {
  @Field var exerciseName: String = ""
  @Field var setIndex: Int = 1
  @Field var setCount: Int = 1
  @Field var kilograms: Double = 0
  @Field var reps: Int = 0
  @Field var planKilograms: Double = 0
  @Field var planReps: Int = 0
  @Field var lastKilograms: Double = 0
  @Field var lastReps: Int = 0
  @Field var loggedLine: String? = nil
  @Field var finished: Bool = false

  @available(iOS 16.1, *)
  func toContentState() -> FitBudWorkoutAttributes.ContentState {
    FitBudWorkoutAttributes.ContentState(
      exerciseName: exerciseName,
      setIndex: setIndex,
      setCount: setCount,
      kilograms: kilograms,
      reps: reps,
      planKilograms: planKilograms,
      planReps: planReps,
      lastKilograms: lastKilograms,
      lastReps: lastReps,
      loggedLine: loggedLine,
      finished: finished
    )
  }
}

public class LiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    /// False below iOS 16.2 or when the user turned Live Activities off.
    Function("isSupported") { () -> Bool in
      return LiveActivityModule.supported()
    }

    /// Starts the workout activity and returns its id, or nil when unsupported.
    /// One activity at a time: a running activity for the same openUrl is
    /// updated and reused; any other running FitBud activity is ended first.
    AsyncFunction("start") { (attributes: WorkoutAttributesRecord, state: WorkoutStateRecord) async throws -> String? in
      guard LiveActivityModule.supported() else { return nil }
      guard #available(iOS 16.2, *) else { return nil }
      let content = ActivityContent(state: state.toContentState(), staleDate: nil)
      var reused: Activity<FitBudWorkoutAttributes>?
      for activity in Activity<FitBudWorkoutAttributes>.activities {
        if reused == nil && activity.attributes.openUrl == attributes.openUrl {
          reused = activity
        } else {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
      }
      if let activity = reused {
        await activity.update(content)
        return activity.id
      }
      let activity = try Activity.request(
        attributes: FitBudWorkoutAttributes(
          workoutName: attributes.workoutName,
          openUrl: attributes.openUrl
        ),
        content: content,
        pushType: nil
      )
      return activity.id
    }

    /// Updates the running activity (there is at most one).
    AsyncFunction("update") { (state: WorkoutStateRecord) async in
      guard LiveActivityModule.supported() else { return }
      guard #available(iOS 16.2, *) else { return }
      let content = ActivityContent(state: state.toContentState(), staleDate: nil)
      for activity in Activity<FitBudWorkoutAttributes>.activities {
        await activity.update(content)
      }
    }

    /// Ends the running activity and removes it from the lock screen.
    AsyncFunction("end") { (finalState: WorkoutStateRecord?) async in
      guard #available(iOS 16.2, *) else { return }
      let content = finalState.map {
        ActivityContent(state: $0.toContentState(), staleDate: nil)
      }
      for activity in Activity<FitBudWorkoutAttributes>.activities {
        await activity.end(content, dismissalPolicy: .immediate)
      }
    }
  }

  static func supported() -> Bool {
    guard #available(iOS 16.2, *) else { return false }
    return ActivityAuthorizationInfo().areActivitiesEnabled
  }
}
