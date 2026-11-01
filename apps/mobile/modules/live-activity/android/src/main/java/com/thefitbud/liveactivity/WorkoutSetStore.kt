package com.thefitbud.liveactivity

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * One row the notification's "Log set" button appended (LA3).
 *
 * KEEP IN SYNC with the iOS widget's row
 * (targets/FitBudLiveActivity/FitBudLiveActivity.swift) and with
 * NativeOutboxRow in modules/live-activity/index.ts: the shared drain
 * (src/notifications/liveActivityOutbox.ts, LA2) reads both platforms'
 * rows with the same code, and only drains `workout.log_set`.
 */
internal data class OutboxRow(
    val operation: String,
    val exerciseName: String,
    val setIndex: Int,
    val kilograms: Double,
    val reps: Int,
) {
    fun toJson(): JSONObject =
        JSONObject()
            .put(KEY_OPERATION, operation)
            .put(KEY_EXERCISE_NAME, exerciseName)
            .put(KEY_SET_INDEX, setIndex)
            .put(KEY_KILOGRAMS, kilograms)
            .put(KEY_REPS, reps)

    companion object {
        /** The only operation the drain acts on (D-W3-5 maps it to workout.complete_set). */
        const val LOG_SET = "workout.log_set"

        const val KEY_OPERATION = "operation"
        const val KEY_EXERCISE_NAME = "exerciseName"
        const val KEY_SET_INDEX = "setIndex"
        const val KEY_KILOGRAMS = "kilograms"
        const val KEY_REPS = "reps"

        /**
         * Only the five fields the notification writes, typed for JS. An
         * unreadable row keeps its position (JS clears a leading prefix by
         * count) but reads as unusable: an empty exercise name or set index 0,
         * which the drain keeps instead of logging.
         */
        fun fromJson(json: JSONObject): OutboxRow =
            OutboxRow(
                operation = json.optString(KEY_OPERATION, ""),
                exerciseName = json.optString(KEY_EXERCISE_NAME, ""),
                setIndex = json.optInt(KEY_SET_INDEX, 0),
                kilograms = json.optDouble(KEY_KILOGRAMS, 0.0).let { if (it.isNaN()) 0.0 else it },
                reps = json.optInt(KEY_REPS, 0),
            )
    }
}

/**
 * The running workout notification's state and its outbox, in the app's own
 * SharedPreferences (LA3).
 *
 * Android has no App Group: the notification's buttons are handled by
 * WorkoutSetActionReceiver inside the app's process, so the plain app-private
 * preferences are both the receiver's and the module's store. Writes use
 * commit(), because the receiver's process can be torn down as soon as
 * onReceive returns.
 *
 * Nothing here is sensitive: an exercise name, a set index and the values the
 * trainee entered, the same four values the iOS widget writes.
 */
internal class WorkoutSetStore(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** The state the notification is currently showing, or null when none runs. */
    fun readState(): WorkoutSetNotification.SetState? {
        synchronized(LOCK) {
            val raw = prefs.getString(KEY_STATE, null) ?: return null
            return try {
                stateFromJson(JSONObject(raw))
            } catch (error: Exception) {
                null
            }
        }
    }

    fun writeState(state: WorkoutSetNotification.SetState) {
        synchronized(LOCK) {
            prefs.edit().putString(KEY_STATE, stateToJson(state).toString()).commit()
        }
    }

    fun clearState() {
        synchronized(LOCK) { prefs.edit().remove(KEY_STATE).commit() }
    }

    /** The rows waiting for the app, oldest first. */
    fun rows(): List<OutboxRow> {
        synchronized(LOCK) {
            return rowsLocked().map { OutboxRow.fromJson(it) }
        }
    }

    fun appendRow(row: OutboxRow) {
        synchronized(LOCK) {
            val raw = prefs.getString(KEY_OUTBOX, null)
            val array =
                try {
                    if (raw == null) JSONArray() else JSONArray(raw)
                } catch (error: Exception) {
                    JSONArray()
                }
            array.put(row.toJson())
            prefs.edit().putString(KEY_OUTBOX, array.toString()).commit()
        }
    }

    /**
     * Drops the first `count` rows — the ones the app drained — and keeps the
     * rest, including any the notification appended while the app was
     * draining. Returns how many were removed.
     *
     * The leading-prefix rule is what makes the shared drain safe: it stops at
     * the first row it cannot place, so every row it enqueued is inside the
     * prefix cleared here, and a kept row keeps its position and so its
     * idempotency key (LA2).
     */
    fun removeFirst(count: Int): Int {
        synchronized(LOCK) {
            if (count <= 0) return 0
            val current = rowsLocked()
            val removed = minOf(count, current.size)
            if (removed <= 0) return 0
            val kept = JSONArray()
            for (row in current.drop(removed)) kept.put(row)
            prefs.edit().putString(KEY_OUTBOX, kept.toString()).commit()
            return removed
        }
    }

    private fun rowsLocked(): List<JSONObject> {
        val raw = prefs.getString(KEY_OUTBOX, null) ?: return emptyList()
        val array =
            try {
                JSONArray(raw)
            } catch (error: Exception) {
                return emptyList()
            }
        return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
    }

    companion object {
        private const val PREFS_NAME = "fitbud.live_activity"
        private const val KEY_STATE = "workoutSetState"

        /** Same key name as the iOS App Group array, for one mental model. */
        private const val KEY_OUTBOX = "liveActivityOutbox"

        private val LOCK = Any()

        fun stateToJson(state: WorkoutSetNotification.SetState): JSONObject =
            JSONObject()
                .put("exerciseName", state.exerciseName)
                .put("setIndex", state.setIndex)
                .put("setCount", state.setCount)
                .put("kilograms", state.kilograms)
                .put("reps", state.reps)
                .put("planKilograms", state.planKilograms)
                .put("planReps", state.planReps)
                .put("lastKilograms", state.lastKilograms ?: JSONObject.NULL)
                .put("lastReps", state.lastReps ?: JSONObject.NULL)
                .put("loggedLine", state.loggedLine ?: JSONObject.NULL)
                .put("finished", state.finished)
                .put("openUrl", state.openUrl)

        fun stateFromJson(json: JSONObject): WorkoutSetNotification.SetState =
            WorkoutSetNotification.SetState(
                exerciseName = json.optString("exerciseName", ""),
                setIndex = json.optInt("setIndex", 1),
                setCount = json.optInt("setCount", 1),
                kilograms = json.optDouble("kilograms", 0.0),
                reps = json.optInt("reps", 0),
                planKilograms = json.optDouble("planKilograms", 0.0),
                planReps = json.optInt("planReps", 0),
                lastKilograms = if (json.isNull("lastKilograms")) null else json.optDouble("lastKilograms"),
                lastReps = if (json.isNull("lastReps")) null else json.optInt("lastReps"),
                loggedLine = if (json.isNull("loggedLine")) null else json.optString("loggedLine"),
                finished = json.optBoolean("finished", false),
                openUrl = json.optString("openUrl", ""),
            )
    }
}
