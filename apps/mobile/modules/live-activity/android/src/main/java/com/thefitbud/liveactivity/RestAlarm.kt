package com.thefitbud.liveactivity

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/**
 * When the ongoing workout notification has to be redrawn because a rest ended
 * (LA3d).
 *
 * The countdown in the notification is a system `Chronometer` with a base in
 * the future (LA3c). A `Chronometer` does not stop at its base: it keeps
 * ticking and renders negative elapsed time, so a rest that ends while the app
 * is frozen by Doze or an OEM task killer leaves "-0:14" on the trainee's lock
 * screen until they open the app. The app cannot prevent that, because the
 * whole point of the frozen case is that no JS runs.
 *
 * So the transition is scheduled on the device instead: one alarm, set for the
 * rest's end instant, onto [RestEndReceiver], which redraws the same
 * notification in its next-set state — the state LA3c already specifies for
 * "at zero or on Skip" and frame 27-android-trainee-workout-notif.png already
 * shows. Nothing polls, nothing counts in JS, and no rest is shortened.
 *
 * The alarm is inexact ([AlarmManager.setAndAllowWhileIdle]): it is allowed to
 * fire in Doze without `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM`, neither of
 * which this app holds and neither of which is worth a store review for
 * repainting a notification.
 *
 * What inexact costs, stated plainly because it is the half that does not
 * favour this fix: `setAndAllowWhileIdle` is both imprecise and rate limited —
 * while the device is idle, Android delivers roughly one such alarm per app
 * per 9 minutes, and inexact alarms are batched. A rest is 60-120 seconds, so
 * on a frozen device the repaint can land minutes after the rest's end
 * instant, and the negative Chronometer stays on the lock screen for that
 * window.
 *
 * So this turns "negative until the trainee opens the app" into "negative for
 * a bounded window", not "stops at zero". That is accepted: the alternative is
 * an exact-alarm permission the trainee is asked about and the stores review.
 * A device check that sees a negative countdown linger briefly after a rest
 * ends on a frozen phone is seeing expected behaviour, not a failure; a
 * countdown that stays negative until the app is opened is the defect.
 */
internal object RestAlarm {
    /** Only this receiver's own alarm; never sent by anything else. */
    const val ACTION_REST_ENDED = "com.thefitbud.mobile.workout.REST_ENDED"

    /** Distinct from the button request codes in WorkoutSetNotification. */
    private const val REQUEST_REST_END = 7318

    /**
     * The pure rule, mirrored from `restAlarmPlan` in
     * src/notifications/restCountdown.ts.
     *
     * KEEP IN SYNC with that file. Kotlin cannot run in this repo's CI, so
     * restCountdown.test.ts is where these rules are actually checked.
     */
    data class Plan(val cancelExisting: Boolean, val fireAtMs: Long?)

    /**
     * `cancelExisting` is always true: every state the module is given
     * replaces the one before it, so a rest that was skipped, shortened,
     * logged past, finished or ended never leaves a stale repaint scheduled.
     */
    fun plan(state: WorkoutSetNotification.SetState?, now: Long): Plan {
        if (state == null) return Plan(cancelExisting = true, fireAtMs = null)
        val endsAt = state.restEndsAt
        val running = WorkoutSetNotification.resting(state, now)
        return Plan(cancelExisting = true, fireAtMs = if (running) endsAt else null)
    }

    /**
     * Applies [plan] for `state`: drops whatever was scheduled and, when a
     * rest is still running, schedules the repaint at its end.
     *
     * Every path that writes the stored state calls this — `start`, `update`
     * and `end` in LiveActivityModule, and every button in
     * WorkoutSetActionReceiver — so the schedule can never outlive the state
     * it was made for.
     */
    fun apply(
        context: Context,
        state: WorkoutSetNotification.SetState?,
        now: Long = System.currentTimeMillis(),
    ) {
        val plan = plan(state, now)
        if (plan.cancelExisting) cancel(context)
        val fireAt = plan.fireAtMs ?: return
        val manager = alarmManager(context) ?: return
        manager.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            fireAt,
            pendingIntent(context, PendingIntent.FLAG_UPDATE_CURRENT),
        )
    }

    /** Drops any scheduled repaint. Safe when there is none. */
    fun cancel(context: Context) {
        val existing = existingPendingIntent(context) ?: return
        alarmManager(context)?.cancel(existing)
        existing.cancel()
    }

    private fun alarmManager(context: Context): AlarmManager? =
        context.applicationContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager

    /** Explicit and app-private: no other app can trigger the repaint. */
    private fun intent(context: Context): Intent =
        Intent(context.applicationContext, RestEndReceiver::class.java)
            .setAction(ACTION_REST_ENDED)
            .setPackage(context.packageName)

    private fun pendingIntent(context: Context, flags: Int): PendingIntent =
        PendingIntent.getBroadcast(
            context.applicationContext,
            REQUEST_REST_END,
            intent(context),
            flags or PendingIntent.FLAG_IMMUTABLE,
        )

    /** Null when nothing is scheduled: FLAG_NO_CREATE never makes one. */
    private fun existingPendingIntent(context: Context): PendingIntent? =
        PendingIntent.getBroadcast(
            context.applicationContext,
            REQUEST_REST_END,
            intent(context),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
        )
}
