package com.thefitbud.liveactivity

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * The Android half of the local `LiveActivity` module (LA3).
 *
 * Android has no Live Activity: the same JS calls drive an ongoing
 * notification instead (frame 27-android), posted on the `workout` channel
 * that src/notifications/androidChannels.ts creates. Local only — no push, no
 * network, no API call from here (D-B7, D-W2-5), exactly like iOS.
 *
 * KEEP IN SYNC with ios/LiveActivityModule.swift and with the module type in
 * modules/live-activity/index.ts: JS calls one module name on both platforms.
 */

/** JS → native shape of the activity's static attributes. */
class WorkoutAttributesRecord : Record {
    @Field var workoutName: String = ""

    /** fitbud://workout/{assignmentId}; the notification's Open button. */
    @Field var openUrl: String = ""
}

/** JS → native shape of the content state (the iOS ContentState fields). */
class WorkoutStateRecord : Record {
    @Field var exerciseName: String = ""
    @Field var setIndex: Int = 1
    @Field var setCount: Int = 1
    @Field var kilograms: Double = 0.0
    @Field var reps: Int = 0
    @Field var planKilograms: Double = 0.0
    @Field var planReps: Int = 0
    @Field var lastKilograms: Double? = null
    @Field var lastReps: Int? = null
    @Field var loggedLine: String? = null
    @Field var finished: Boolean = false

    /** Rest is iOS-only for now; LA3c adds the Android countdown (D-W3-3). */
    @Field var restEndsAt: Double? = null

    @Field var restSeconds: Int? = null

    fun toState(openUrl: String): WorkoutSetNotification.SetState =
        WorkoutSetNotification.SetState(
            exerciseName = exerciseName,
            setIndex = setIndex,
            setCount = setCount,
            kilograms = kilograms,
            reps = reps,
            planKilograms = planKilograms,
            planReps = planReps,
            lastKilograms = lastKilograms,
            lastReps = lastReps,
            loggedLine = loggedLine,
            finished = finished,
            openUrl = openUrl,
        )
}

class LiveActivityModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    private val store: WorkoutSetStore
        get() = WorkoutSetStore(context)

    override fun definition() = ModuleDefinition {
        Name("LiveActivity")

        /** False when the trainee turned notifications, or the channel, off. */
        Function("isSupported") {
            WorkoutSetNotification.notificationsEnabled(context)
        }

        /**
         * Posts (or replaces) the ongoing workout notification and returns its
         * id, or null when notifications are off. One workout at a time, as on
         * iOS: a second start replaces the first.
         */
        AsyncFunction("start") { attributes: WorkoutAttributesRecord, state: WorkoutStateRecord ->
            if (!WorkoutSetNotification.notificationsEnabled(context)) {
                null
            } else {
                val next = state.toState(attributes.openUrl)
                store.writeState(next)
                // A previous workout's confirmation line has no place here.
                WorkoutSetNotification.cancelAll(context)
                WorkoutSetNotification.show(context, next)
                WorkoutSetNotification.NOTIFICATION_ID.toString()
            }
        }

        /**
         * Redraws the running notification from the app's state. The openUrl
         * is kept from `start`: the app does not resend it.
         */
        AsyncFunction("update") { state: WorkoutStateRecord ->
            val current = store.readState() ?: return@AsyncFunction
            val next = state.toState(current.openUrl)
            store.writeState(next)
            if (next.finished) {
                WorkoutSetNotification.cancel(context)
            } else {
                WorkoutSetNotification.show(context, next)
            }
        }

        /**
         * Removes both notifications — the ongoing one and the last logged
         * line — so no card is left behind. Rows already written stay for the
         * drain; ending the session never discards a logged set.
         */
        AsyncFunction("end") { _: WorkoutStateRecord? ->
            store.clearState()
            WorkoutSetNotification.cancelAll(context)
        }

        /**
         * Android has no rest countdown yet (D-W3-3 puts it in LA3c), so this
         * only answers whether the notification is up.
         */
        Function("restState") {
            mapOf("running" to (store.readState() != null))
        }

        /**
         * The rows the notification's Log set button wrote, oldest first, with
         * the running workout's `openUrl` so the app knows which workout they
         * belong to. The same shape the iOS module returns.
         */
        Function("readOutbox") {
            val rows =
                store.rows().map { row ->
                    mapOf(
                        OutboxRow.KEY_OPERATION to row.operation,
                        OutboxRow.KEY_EXERCISE_NAME to row.exerciseName,
                        OutboxRow.KEY_SET_INDEX to row.setIndex,
                        OutboxRow.KEY_KILOGRAMS to row.kilograms,
                        OutboxRow.KEY_REPS to row.reps,
                    )
                }
            val result = mutableMapOf<String, Any>("rows" to rows)
            store.readState()?.openUrl?.takeIf { it.isNotBlank() }?.let { result["openUrl"] = it }
            result
        }

        /**
         * Drops the first `count` rows — the drained ones — and keeps the
         * rest, including any a button appended while the app was draining.
         */
        Function("removeOutbox") { count: Int ->
            store.removeFirst(count)
        }
    }
}
