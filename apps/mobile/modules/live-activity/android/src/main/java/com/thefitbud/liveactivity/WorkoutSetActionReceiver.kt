package com.thefitbud.liveactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * The workout notification's buttons (LA3, frame 27-android).
 *
 * Registered by plugins/withLiveActivity.js as a non-exported receiver, so
 * only FitBud's own PendingIntents reach it. It runs with the app in any
 * state — including killed — which is why every button works on the stored
 * state alone and writes it back before the notification is redrawn.
 *
 * "Log set" cannot reach the API from here, so it appends one row for the app
 * to drain into the sync outbox (src/notifications/liveActivityOutbox.ts),
 * exactly like the iOS lock-screen button. Nothing here decides anything
 * coaching-related: it records what the trainee entered.
 */
class WorkoutSetActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val store = WorkoutSetStore(context)
        val state = store.readState() ?: return
        when (intent.action) {
            WorkoutSetNotification.ACTION_LESS_WEIGHT ->
                redraw(context, store, WorkoutSetNotification.stepWeight(state, -1))
            WorkoutSetNotification.ACTION_MORE_WEIGHT ->
                redraw(context, store, WorkoutSetNotification.stepWeight(state, 1))
            WorkoutSetNotification.ACTION_FEWER_REPS ->
                redraw(context, store, WorkoutSetNotification.stepReps(state, -1))
            WorkoutSetNotification.ACTION_MORE_REPS ->
                redraw(context, store, WorkoutSetNotification.stepReps(state, 1))
            WorkoutSetNotification.ACTION_LOG_SET -> logSet(context, store, state)
            else -> Unit
        }
    }

    private fun redraw(
        context: Context,
        store: WorkoutSetStore,
        next: WorkoutSetNotification.SetState,
    ) {
        store.writeState(next)
        WorkoutSetNotification.show(context, next)
    }

    /**
     * One tap, one row: the values on screen, against the set the notification
     * is showing. The row is appended before the state advances, so a process
     * death between the two leaves a logged set rather than a lost one; the
     * app's drain dedupes by set, so a row seen twice still logs once (LA2).
     */
    private fun logSet(
        context: Context,
        store: WorkoutSetStore,
        state: WorkoutSetNotification.SetState,
    ) {
        if (state.finished) return
        store.appendRow(
            OutboxRow(
                operation = OutboxRow.LOG_SET,
                exerciseName = state.exerciseName,
                setIndex = state.setIndex,
                kilograms = state.kilograms,
                reps = state.reps,
            ),
        )
        val next = WorkoutSetNotification.logSet(state)
        store.writeState(next)
        next.loggedLine?.let { WorkoutSetNotification.showLogged(context, next, it) }
        if (next.finished) {
            // No set is left to show: the ongoing notification goes and the
            // confirmation line stays, as in the frame. The app ends the
            // session (LA3b), and `end` clears that line too, so the trainee
            // has nothing to swipe away by hand.
            WorkoutSetNotification.cancel(context)
        } else {
            WorkoutSetNotification.show(context, next)
        }
    }
}
