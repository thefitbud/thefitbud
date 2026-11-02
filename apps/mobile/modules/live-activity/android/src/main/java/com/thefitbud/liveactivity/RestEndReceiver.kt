package com.thefitbud.liveactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Redraws the ongoing workout notification when a rest ends (LA3d).
 *
 * Woken by the one-shot alarm [RestAlarm] schedules for the rest's end
 * instant, so the transition happens on the device whether or not the app's JS
 * is alive. Without it, a rest that ends while the app is frozen leaves the
 * notification's `Chronometer` counting past zero into negative time.
 *
 * It decides nothing. It renders the state the app already stored, in the
 * state that state is now in: `WorkoutSetNotification.build` draws the next
 * set as soon as the rest's end has passed, which is exactly what Skip rest
 * and a countdown running out with the app awake already produce (LA3c).
 * No set is logged, no row is written, no rest is started or shortened.
 *
 * Declared, non-exported, in this module's own AndroidManifest.xml, which the
 * Android Gradle plugin merges into the app's. It needs nothing from the app
 * config, unlike WorkoutSetActionReceiver, whose registration
 * plugins/withLiveActivity.js writes.
 */
class RestEndReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != RestAlarm.ACTION_REST_ENDED) return

        // No stored state means the workout is over: `end` cleared it, or the
        // app was uninstalled-and-reinstalled, or data was cleared. A late
        // alarm must never resurrect a notification for a workout that has
        // finished, so this is where it stops.
        val state = WorkoutSetStore(context).readState() ?: return
        if (state.finished) return

        // Fired early — a clock change, or the app extended the rest between
        // the schedule and this moment. Repainting now would end a rest the
        // trainee is still taking, so the repaint is simply moved to the new
        // end instead.
        if (WorkoutSetNotification.resting(state)) {
            RestAlarm.apply(context, state)
            return
        }

        // The rest is over. One repost, in the next-set state. The stored
        // state is left untouched: `resting()` already reads it as finished
        // rest, which is what the app sees through `restState()` when it
        // comes back, so both surfaces agree without a write from here.
        WorkoutSetNotification.show(context, state)
    }
}
