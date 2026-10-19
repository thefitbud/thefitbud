package com.thefitbud.mobile

/**
 * Scaffold for mockup 27-android. Expo web does not compile this file.
 * A dev build, after prebuild, shows it with NotificationCompat.DecoratedCustomViewStyle.
 *
 * Collapsed height stays within the 48 dp system template. Expanded is at most 252 dp.
 * Android 12 and later still wrap the custom view in the system template.
 *
 * Buttons are PendingIntents, not LiveActivityIntent:
 * - Less / more weight steps by 2.5 kg
 * - Fewer / more reps steps by 1
 * - Log set writes workout.log_set and advances to the next set
 * - Open uses the fitbud://workout/{assignmentId} deep link
 *
 * There is no rest timer. A logged set collapses to one line ("Set 2 logged · 22.5 kg × 10").
 */
object WorkoutSetNotification {
    const val CHANNEL_ID = "workout"
    const val ACTION_LESS_WEIGHT = "com.thefitbud.mobile.workout.LESS_WEIGHT"
    const val ACTION_MORE_WEIGHT = "com.thefitbud.mobile.workout.MORE_WEIGHT"
    const val ACTION_FEWER_REPS = "com.thefitbud.mobile.workout.FEWER_REPS"
    const val ACTION_MORE_REPS = "com.thefitbud.mobile.workout.MORE_REPS"
    const val ACTION_LOG_SET = "com.thefitbud.mobile.workout.LOG_SET"
    const val WEIGHT_STEP_KG = 2.5

    data class SetState(
        val exerciseName: String,
        val setIndex: Int,
        val setCount: Int,
        val kilograms: Double,
        val reps: Int,
        val planKilograms: Double,
        val planReps: Int,
        val lastKilograms: Double,
        val lastReps: Int,
        val loggedLine: String?,
        val finished: Boolean,
        val openUrl: String,
    )

    fun logSet(state: SetState): SetState {
        if (state.finished) return state
        val logged =
            "Set ${state.setIndex} logged · ${formatKg(state.kilograms)} kg × ${state.reps}"
        val next = state.setIndex + 1
        val finished = next > state.setCount
        return state.copy(
            loggedLine = logged,
            lastKilograms = state.kilograms,
            lastReps = state.reps,
            setIndex = if (finished) state.setIndex else next,
            kilograms = state.planKilograms,
            reps = state.planReps,
            finished = finished,
        )
    }

    fun stepWeight(state: SetState, direction: Int): SetState {
        if (state.finished) return state
        val next = (state.kilograms + direction * WEIGHT_STEP_KG).coerceAtLeast(0.0)
        val rounded = kotlin.math.round(next * 10.0) / 10.0
        return state.copy(kilograms = rounded)
    }

    fun stepReps(state: SetState, direction: Int): SetState {
        if (state.finished) return state
        return state.copy(reps = (state.reps + direction).coerceAtLeast(0))
    }

    private fun formatKg(value: Double): String {
        val rounded = kotlin.math.round(value * 10.0) / 10.0
        return if (rounded % 1.0 == 0.0) rounded.toInt().toString() else rounded.toString()
    }
}
