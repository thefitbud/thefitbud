package com.thefitbud.liveactivity

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The TR-15d notification's rules (Z14-5, D-W14-12). JVM only: run from the
 * prebuilt Android project with ./gradlew :live-activity:testDebugUnitTest.
 * The channel settings and the layout are also checked from source by
 * apps/mobile/app.config.test.ts, which CI runs.
 */
class WorkoutSetNotificationTest {
    private val romanianDeadlift =
        WorkoutSetNotification.SetState(
            exerciseName = "Romanian deadlift",
            setIndex = 3,
            setCount = 3,
            kilograms = 40.0,
            reps = 10,
            planKilograms = 40.0,
            planReps = 10,
            lastKilograms = 42.5,
            lastReps = 10,
            loggedLine = null,
            finished = false,
            openUrl = "fitbud://workout/4b7e2d10-1c3a-4f5e-8d9c-2a1b0c3d4e5f?active=1",
            workoutName = "Lower body B",
            startedAt = 1_763_100_000_000,
        )

    @Test
    fun postsOnTheLiveWorkoutChannelNotTheReminders() {
        assertEquals("workout_live", WorkoutSetNotification.CHANNEL_ID)
        assertEquals("Live workout", WorkoutSetNotification.CHANNEL_NAME)
        assertFalse(WorkoutSetNotification.CHANNEL_ID == "workout")
    }

    @Test
    fun onlyLogAndSkipRestActionsRemain() {
        assertEquals("com.thefitbud.mobile.workout.LOG_SET", WorkoutSetNotification.ACTION_LOG_SET)
        assertEquals("com.thefitbud.mobile.workout.SKIP_REST", WorkoutSetNotification.ACTION_SKIP_REST)
        val actions =
            WorkoutSetNotification::class.java.declaredFields
                .filter { it.name.startsWith("ACTION_") }
                .map { it.name }
                .sorted()
        assertEquals(listOf("ACTION_LOG_SET", "ACTION_SKIP_REST"), actions)
    }

    @Test
    fun linesReadLikeTheFrame() {
        val state = romanianDeadlift
        assertEquals("Set 3 of 3", WorkoutSetNotification.setLine(state))
        assertEquals("Last 42.5 kg × 10", WorkoutSetNotification.lastLine(state))
        assertEquals("Target 40 kg × 10", WorkoutSetNotification.targetLine(state))
        assertEquals("Log 40 kg × 10", WorkoutSetNotification.logSetLabel(state))
        assertEquals(
            "Last 42.5 kg × 10 · Target 40 kg × 10",
            WorkoutSetNotification.lastAndTargetLine(state),
        )
    }

    @Test
    fun noLastWithoutAPreviousSetAndBodyweightReadsAsReps() {
        val state =
            romanianDeadlift.copy(
                exerciseName = "Push-up",
                kilograms = 0.0,
                planKilograms = 0.0,
                reps = 12,
                planReps = 12,
                lastKilograms = null,
                lastReps = null,
            )
        assertNull(WorkoutSetNotification.lastLine(state))
        assertEquals("Target 12 reps", WorkoutSetNotification.lastAndTargetLine(state))
        assertEquals("Log 12 reps", WorkoutSetNotification.logSetLabel(state))
    }

    @Test
    fun logOnTheLastSetFinishesOnlyWhenNoExerciseRemains() {
        val last = WorkoutSetNotification.logSet(romanianDeadlift)
        assertTrue(last.finished)
        assertEquals("Set 3 logged · 40 kg × 10", last.loggedLine)

        val more = WorkoutSetNotification.logSet(romanianDeadlift.copy(moreExercisesRemain = true))
        assertFalse(more.finished)
        assertEquals(romanianDeadlift.startedAt, more.startedAt)
    }

    @Test
    fun progressFollowsTheSets() {
        assertEquals(Pair(3, 1), WorkoutSetNotification.progress(romanianDeadlift.copy(setIndex = 1)))
        assertEquals(Pair(1, 0), WorkoutSetNotification.progress(romanianDeadlift.copy(setIndex = 0, setCount = 0)))
    }
}
