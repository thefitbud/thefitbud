import ActivityKit
import ExpoModulesCore

// Local updates only (D-B7, D-W2-5): no push token, no APNs, no network.
//
// KEEP IN SYNC: this is a copy of FitBudWorkoutAttributes in
// apps/mobile/targets/FitBudLiveActivity/_shared/LiveActivityIntents.swift
// (compiled into the widget and the app target; app.config.test.ts compares them).
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
    /// set `finished` (Z12-48 / Z12-57).
    var moreExercisesRemain: Bool
  }

  var workoutName: String
  /// fitbud://workout/{assignmentId}. The host app sets this when it starts the activity.
  var openUrl: String
  /// When the activity started; drives the TR-15d elapsed timer on the widget.
  var startedAt: Date
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
  @Field var lastKilograms: Double? = nil
  @Field var lastReps: Int? = nil
  @Field var loggedLine: String? = nil
  @Field var finished: Bool = false
  /// Epoch milliseconds from JS.
  @Field var restEndsAt: Double? = nil
  @Field var restSeconds: Int? = nil
  /// From JS (`lastExercise === false`). Default false until Z12-48 payloads land.
  @Field var moreExercisesRemain: Bool = false

  /// Rest end as a Date, only while it is in the future and the set isn't the last.
  var restEndDate: Date? {
    guard !finished, let ms = restEndsAt else { return nil }
    let date = Date(timeIntervalSince1970: ms / 1000)
    return date > Date() ? date : nil
  }

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
      finished: finished,
      restEndsAt: restEndDate,
      restSeconds: restEndDate == nil ? nil : restSeconds,
      moreExercisesRemain: moreExercisesRemain
    )
  }

  /// iOS redraws the activity when rest ends, so the widget shows the next
  /// set without the app running.
  @available(iOS 16.2, *)
  func toContent() -> ActivityContent<FitBudWorkoutAttributes.ContentState> {
    ActivityContent(state: toContentState(), staleDate: restEndDate)
  }
}

/// Rows the lock-screen "Log set" button appended to the shared App Group
/// (LogSetIntent in targets/FitBudLiveActivity/_shared/LiveActivityIntents.swift
/// writes them). The app drains them into the sync outbox when it becomes
/// active (LA2), and at once when `onOutboxRow` fires (Z14-8 wires that);
/// the widget never talks to the API.
enum LiveActivityOutboxStore {
  static let key = "liveActivityOutbox"

  /// Per-variant App Group, written to the app's Info.plist by
  /// plugins/withLiveActivity.js. Nil in Expo Go or a build without it.
  static var suite: String? {
    guard
      let suite = Bundle.main.object(forInfoDictionaryKey: "FitBudAppGroup") as? String,
      !suite.isEmpty
    else { return nil }
    return suite
  }

  /// The read and the clear do nothing without an App Group.
  static var defaults: UserDefaults? {
    guard let suite else { return nil }
    return UserDefaults(suiteName: suite)
  }

  /// KEEP IN SYNC with `LiveActivityOutbox.appendedNotificationName` in
  /// targets/FitBudLiveActivity/_shared/LiveActivityIntents.swift: the Darwin
  /// notification the intent posts after appending a row.
  static var appendedNotificationName: String? {
    guard let suite else { return nil }
    return "\(suite).liveActivityOutbox.appended"
  }

  static func rows() -> [[String: Any]] {
    (defaults?.array(forKey: key) as? [[String: Any]]) ?? []
  }

  /// Only the fields the widget writes, typed for JS. A malformed row keeps
  /// its position (JS clears a prefix by count) but reads as unusable: an
  /// empty exercise name or set index 0, which JS keeps instead of logging.
  static func sanitized(_ row: [String: Any]) -> [String: Any] {
    let kilograms = (row["kilograms"] as? Double) ?? Double((row["kilograms"] as? Int) ?? 0)
    return [
      "operation": (row["operation"] as? String) ?? "",
      "exerciseName": (row["exerciseName"] as? String) ?? "",
      "setIndex": (row["setIndex"] as? Int) ?? 0,
      "kilograms": kilograms,
      "reps": (row["reps"] as? Int) ?? 0,
    ]
  }
}

/// Darwin notification callback. A C function pointer cannot capture, so the
/// module comes back through the observer pointer it registered with.
private func liveActivityOutboxAppended(
  _ center: CFNotificationCenter?,
  _ observer: UnsafeMutableRawPointer?,
  _ name: CFNotificationName?,
  _ object: UnsafeRawPointer?,
  _ userInfo: CFDictionary?
) {
  guard let observer else { return }
  Unmanaged<LiveActivityModule>.fromOpaque(observer).takeUnretainedValue().outboxRowAppended()
}

public class LiveActivityModule: Module {
  private var observingOutbox = false

  public func definition() -> ModuleDefinition {
    Name("LiveActivity")

    /// `{ count }` after LogSetIntent appended a row to the App Group (Z14-5,
    /// D-W14-12). The intent runs in the app's process (it is compiled into the
    /// app target too) or in the widget's, and posts a Darwin notification
    /// either way. Rows themselves are still read with `readOutbox`.
    Events("onOutboxRow")

    OnStartObserving {
      self.startObservingOutbox()
    }

    OnStopObserving {
      self.stopObservingOutbox()
    }

    OnDestroy {
      self.stopObservingOutbox()
    }

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
      let content = state.toContent()
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
          openUrl: attributes.openUrl,
          startedAt: Date()
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
      let content = state.toContent()
      for activity in Activity<FitBudWorkoutAttributes>.activities {
        await activity.update(content)
      }
    }

    /// The running activity's rest, read when the app becomes active: if Skip
    /// was tapped on the lock screen, the app ends its own rest (LA1c).
    Function("restState") { () -> [String: Any] in
      guard #available(iOS 16.2, *) else { return ["running": false] }
      guard let activity = Activity<FitBudWorkoutAttributes>.activities.first else {
        return ["running": false]
      }
      guard let endsAt = activity.content.state.restEndsAt, endsAt > Date() else {
        return ["running": true]
      }
      return ["running": true, "restEndsAt": endsAt.timeIntervalSince1970 * 1000]
    }

    /// The App Group rows the lock-screen Log set button wrote, oldest first,
    /// with the running activity's `openUrl` so the app knows which workout
    /// they belong to. Empty rows when there is no App Group or no activity.
    Function("readOutbox") { () -> [String: Any] in
      let rows = LiveActivityOutboxStore.rows().map { LiveActivityOutboxStore.sanitized($0) }
      var result: [String: Any] = ["rows": rows]
      if let openUrl = LiveActivityModule.runningOpenUrl() {
        result["openUrl"] = openUrl
      }
      return result
    }

    /// Drops the first `count` rows (the ones the app drained) and keeps the
    /// rest, including any the widget appended while the app was draining.
    /// Returns how many were removed.
    Function("removeOutbox") { (count: Int) -> Int in
      guard count > 0, let defaults = LiveActivityOutboxStore.defaults else { return 0 }
      var rows = LiveActivityOutboxStore.rows()
      let removed = min(count, rows.count)
      guard removed > 0 else { return 0 }
      rows.removeFirst(removed)
      defaults.set(rows, forKey: LiveActivityOutboxStore.key)
      return removed
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

  private func startObservingOutbox() {
    guard !observingOutbox, let name = LiveActivityOutboxStore.appendedNotificationName else {
      return
    }
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      liveActivityOutboxAppended,
      name as CFString,
      nil,
      .deliverImmediately
    )
    observingOutbox = true
  }

  private func stopObservingOutbox() {
    guard observingOutbox else { return }
    CFNotificationCenterRemoveEveryObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque()
    )
    observingOutbox = false
  }

  /// Tells JS a row is waiting. Only the count: no workout data in the event.
  fileprivate func outboxRowAppended() {
    sendEvent("onOutboxRow", ["count": LiveActivityOutboxStore.rows().count])
  }

  /// The running activity's `fitbud://?workout=<assignmentId>` link, which is
  /// how the app identifies the workout an outbox row belongs to.
  static func runningOpenUrl() -> String? {
    guard #available(iOS 16.2, *) else { return nil }
    return Activity<FitBudWorkoutAttributes>.activities.first?.attributes.openUrl
  }

  static func supported() -> Bool {
    guard #available(iOS 16.2, *) else { return false }
    return ActivityAuthorizationInfo().areActivitiesEnabled
  }
}
