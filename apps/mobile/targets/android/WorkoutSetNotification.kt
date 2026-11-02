package com.thefitbud.liveactivity

import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * The ongoing workout notification of mockup 27-android. Expo web does not
 * compile this file; a dev build does, through the local Expo module
 * (modules/live-activity/android, LA3), which puts this directory on its
 * source path.
 *
 * Collapsed height stays within the 48 dp system template (the system draws it
 * from the content title and text). Expanded is at most 252 dp.
 * Android 12 and later still wrap the custom view in the system template
 * (NotificationCompat.DecoratedCustomViewStyle).
 *
 * Buttons are PendingIntents, not LiveActivityIntent:
 * - Less / more weight steps by 2.5 kg
 * - Fewer / more reps steps by 1
 * - Log set writes workout.log_set and advances to the next set
 * - Open uses the fitbud://workout/{assignmentId} deep link
 *
 * With rest on (LA3c, D-W3-3, frame 27-android-rest.png) the same notification
 * shows a rest countdown with Skip rest instead of the set controls, and goes
 * back to the next set when the trainee skips. The countdown is a Chronometer
 * counting down to `restEndsAt`: the device counts, so rest costs no repost
 * per second and no timer in JS. Rest itself is decided by the app, exactly as
 * on iOS (27c) — the notification never starts a rest of its own.
 *
 * A logged set collapses to one line ("Set 2 logged · 22.5 kg × 10"), shown as
 * its own short notification while the ongoing one moves to the next set.
 */
object WorkoutSetNotification {
    const val CHANNEL_ID = "workout"
    const val ACTION_LESS_WEIGHT = "com.thefitbud.mobile.workout.LESS_WEIGHT"
    const val ACTION_MORE_WEIGHT = "com.thefitbud.mobile.workout.MORE_WEIGHT"
    const val ACTION_FEWER_REPS = "com.thefitbud.mobile.workout.FEWER_REPS"
    const val ACTION_MORE_REPS = "com.thefitbud.mobile.workout.MORE_REPS"
    const val ACTION_LOG_SET = "com.thefitbud.mobile.workout.LOG_SET"
    const val ACTION_SKIP_REST = "com.thefitbud.mobile.workout.SKIP_REST"
    const val WEIGHT_STEP_KG = 2.5

    /** The ongoing set notification; one workout at a time, so one id. */
    const val NOTIFICATION_ID = 7301

    /** The short "Set n logged · …" confirmation that follows a logged set. */
    const val LOGGED_NOTIFICATION_ID = 7302

    /**
     * Shown next to the app name in the system header while the trainee is on
     * a set ("FitBud · Workout · now", frame
     * 27-android-trainee-workout-notif.png). During rest the header carries
     * the workout name and the countdown instead ("FitBud · Lower body B",
     * frame 27-android-rest.png), so each frame's header is what the trainee
     * sees in that state.
     */
    const val SUB_TEXT = "Workout"

    /** The rest state's collapsed title; the countdown sits in the header. */
    const val REST_TITLE = "Rest"

    data class SetState(
        val exerciseName: String,
        val setIndex: Int,
        val setCount: Int,
        val kilograms: Double,
        val reps: Int,
        val planKilograms: Double,
        val planReps: Int,
        /** Null when there is no previous value: no "Last" line is shown. */
        val lastKilograms: Double?,
        val lastReps: Int?,
        val loggedLine: String?,
        val finished: Boolean,
        val openUrl: String,
        /** "Lower body B": the header during rest (frame 27-android-rest). */
        val workoutName: String = "",
        /**
         * End of the running rest, epoch ms, or null when there is no rest
         * (LA1c's field, same meaning on both platforms). The app sends one
         * update when rest starts and one when it ends or is skipped.
         */
        val restEndsAt: Long? = null,
        /** Full rest length in seconds, as the app set it. */
        val restSeconds: Int? = null,
    )

    /** True while a rest countdown is still running at `now` (epoch ms). */
    fun resting(state: SetState, now: Long = System.currentTimeMillis()): Boolean {
        if (state.finished) return false
        val endsAt = state.restEndsAt ?: return false
        return endsAt > now
    }

    /**
     * Skip rest, from the notification's own button. It clears rest and
     * nothing else: the set, the values and the outbox are untouched, so the
     * trainee lands on the next set exactly as the countdown running out would
     * have left them.
     */
    fun skipRest(state: SetState): SetState = state.copy(restEndsAt = null, restSeconds = null)

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
            // A new set never inherits the previous set's countdown; the app
            // sends the next rest, as it does for a set logged in the app.
            restEndsAt = null,
            restSeconds = null,
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

    /** "Romanian deadlift · Set 2 of 3" (frame 27-android). */
    fun titleLine(state: SetState): String =
        "${state.exerciseName} · Set ${state.setIndex} of ${state.setCount}"

    /** "Last: 20 kg × 10", or null when the trainee has no previous value. */
    fun lastLine(state: SetState): String? {
        val kilograms = state.lastKilograms ?: return null
        val reps = state.lastReps ?: return null
        return "Last: ${formatKg(kilograms)} kg × $reps"
    }

    /** "22.5 kg × 10" — what the collapsed template shows when there is no "Last". */
    fun valuesLine(state: SetState): String =
        "${formatKg(state.kilograms)} kg × ${state.reps}"

    /** "Next · Romanian deadlift · Set 3 of 3" (frame 27-android-rest). */
    fun nextLine(state: SetState): String = "Next · ${titleLine(state)}"

    /** The Skip rest button's label for TalkBack: what skipping leads to. */
    fun skipRestDescription(state: SetState): String =
        "Skip rest, next: ${titleLine(state)}, ${valuesLine(state)}"

    /** "Log set 2" (the ✓ is drawn in the layout, so the label stays readable). */
    fun logSetLabel(state: SetState): String = "Log set ${state.setIndex}"

    /**
     * The ongoing notification. Not dismissible while the workout runs, no
     * sound (the channel is DEFAULT importance and this is a silent update),
     * and it opens the workout when tapped.
     */
    fun build(context: Context, state: SetState): Notification {
        if (resting(state)) return buildResting(context, state)
        val expanded = RemoteViews(context.packageName, R.layout.fitbud_workout_set)
        expanded.setTextViewText(R.id.fitbud_workout_title, titleLine(state))

        val last = lastLine(state)
        if (last == null) {
            expanded.setViewVisibility(R.id.fitbud_workout_last, android.view.View.GONE)
        } else {
            expanded.setViewVisibility(R.id.fitbud_workout_last, android.view.View.VISIBLE)
            expanded.setTextViewText(R.id.fitbud_workout_last, last)
        }

        expanded.setTextViewText(R.id.fitbud_workout_weight, formatKg(state.kilograms))
        expanded.setTextViewText(R.id.fitbud_workout_reps, state.reps.toString())
        expanded.setTextViewText(R.id.fitbud_workout_log, "✓ ${logSetLabel(state)}")

        expanded.setContentDescription(R.id.fitbud_workout_weight_down, "Less weight, 2.5 kg")
        expanded.setContentDescription(R.id.fitbud_workout_weight_up, "More weight, 2.5 kg")
        expanded.setContentDescription(R.id.fitbud_workout_reps_down, "Fewer reps")
        expanded.setContentDescription(R.id.fitbud_workout_reps_up, "More reps")
        expanded.setContentDescription(
            R.id.fitbud_workout_log,
            "${logSetLabel(state)}, ${valuesLine(state)}",
        )
        expanded.setContentDescription(R.id.fitbud_workout_open, "Open the workout")

        expanded.setOnClickPendingIntent(
            R.id.fitbud_workout_weight_down,
            action(context, ACTION_LESS_WEIGHT, REQUEST_LESS_WEIGHT),
        )
        expanded.setOnClickPendingIntent(
            R.id.fitbud_workout_weight_up,
            action(context, ACTION_MORE_WEIGHT, REQUEST_MORE_WEIGHT),
        )
        expanded.setOnClickPendingIntent(
            R.id.fitbud_workout_reps_down,
            action(context, ACTION_FEWER_REPS, REQUEST_FEWER_REPS),
        )
        expanded.setOnClickPendingIntent(
            R.id.fitbud_workout_reps_up,
            action(context, ACTION_MORE_REPS, REQUEST_MORE_REPS),
        )
        expanded.setOnClickPendingIntent(
            R.id.fitbud_workout_log,
            action(context, ACTION_LOG_SET, REQUEST_LOG_SET),
        )
        val open = openIntent(context, state.openUrl)
        if (open != null) {
            expanded.setOnClickPendingIntent(R.id.fitbud_workout_open, open)
        } else {
            expanded.setViewVisibility(R.id.fitbud_workout_open, android.view.View.GONE)
        }

        val builder =
            NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(smallIcon(context))
                .setSubText(SUB_TEXT)
                .setContentTitle(titleLine(state))
                .setContentText(last ?: valuesLine(state))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                // The frame's header reads "FitBud · Workout · now": the time
                // is part of it. Every redraw is a fresh post, so it stays
                // "now" while the trainee is working through the set.
                .setShowWhen(true)
                .setCategory(NotificationCompat.CATEGORY_WORKOUT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCustomBigContentView(expanded)
                .setStyle(NotificationCompat.DecoratedCustomViewStyle())
        if (open != null) builder.setContentIntent(open)
        return builder.build()
    }

    /**
     * The same ongoing notification during rest (frame 27-android-rest.png):
     * the countdown, what was just logged, what comes next, Skip rest and
     * Open. No set controls — the trainee is resting, not entering a set.
     *
     * The countdown is a Chronometer, in the big view and in the system header
     * (setUsesChronometer + setChronometerCountDown, API 24+): the device
     * counts down on its own, so one post covers the whole rest. Nothing here
     * reposts per second, and no JS timer drives it.
     *
     * The frame's thin progress bar under the countdown is not drawn: a
     * RemoteViews progress bar cannot follow a clock, so it could only be a
     * value frozen at the moment of posting, sitting beside a countdown that
     * is live. Deviation reported in the PR.
     */
    private fun buildResting(context: Context, state: SetState): Notification {
        val endsAt = state.restEndsAt ?: return build(context, skipRest(state))
        val expanded = RemoteViews(context.packageName, R.layout.fitbud_workout_rest)
        // The Chronometer counts on the elapsed-realtime clock, so the wall
        // clock end is carried over to it once, here.
        val base = android.os.SystemClock.elapsedRealtime() + (endsAt - System.currentTimeMillis())
        expanded.setChronometer(R.id.fitbud_rest_timer, base, null, true)
        expanded.setChronometerCountDown(R.id.fitbud_rest_timer, true)

        val logged = state.loggedLine
        if (logged == null) {
            expanded.setViewVisibility(R.id.fitbud_rest_logged, android.view.View.GONE)
        } else {
            expanded.setViewVisibility(R.id.fitbud_rest_logged, android.view.View.VISIBLE)
            expanded.setTextViewText(R.id.fitbud_rest_logged, logged)
        }

        expanded.setTextViewText(R.id.fitbud_rest_next, nextLine(state))
        expanded.setTextViewText(R.id.fitbud_rest_next_weight, formatKg(state.kilograms))
        expanded.setTextViewText(R.id.fitbud_rest_next_reps, "× ${state.reps}")
        expanded.setContentDescription(
            R.id.fitbud_rest_next_row,
            "${nextLine(state)}, ${valuesLine(state)}",
        )

        expanded.setContentDescription(R.id.fitbud_rest_skip, skipRestDescription(state))
        expanded.setContentDescription(R.id.fitbud_rest_open, "Open the workout")
        expanded.setOnClickPendingIntent(
            R.id.fitbud_rest_skip,
            action(context, ACTION_SKIP_REST, REQUEST_SKIP_REST),
        )
        val open = openIntent(context, state.openUrl)
        if (open != null) {
            expanded.setOnClickPendingIntent(R.id.fitbud_rest_open, open)
        } else {
            expanded.setViewVisibility(R.id.fitbud_rest_open, android.view.View.GONE)
        }

        val builder =
            NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(smallIcon(context))
                // "FitBud · Lower body B" in the rest frame's header, against
                // "FitBud · Workout" on a set: each frame's own header.
                .setSubText(state.workoutName.ifBlank { SUB_TEXT })
                .setContentTitle(REST_TITLE)
                .setContentText(logged ?: nextLine(state))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                // The header's own countdown, next to the app name.
                .setShowWhen(true)
                .setWhen(endsAt)
                .setUsesChronometer(true)
                .setChronometerCountDown(true)
                .setCategory(NotificationCompat.CATEGORY_WORKOUT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCustomBigContentView(expanded)
                .setStyle(NotificationCompat.DecoratedCustomViewStyle())
        if (open != null) builder.setContentIntent(open)
        return builder.build()
    }

    /** "Set 1 logged · 20 kg × 10" on its own line, dismissible (frame 27-android). */
    fun buildLogged(context: Context, state: SetState, loggedLine: String): Notification {
        val open = openIntent(context, state.openUrl)
        val builder =
            NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(smallIcon(context))
                .setContentTitle(loggedLine)
                .setAutoCancel(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_WORKOUT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        if (open != null) builder.setContentIntent(open)
        return builder.build()
    }

    /** No-op when the trainee has notifications off, which is never worked around. */
    @SuppressLint("MissingPermission")
    fun show(context: Context, state: SetState) {
        if (!notificationsEnabled(context)) return
        ensureChannel(context)
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, build(context, state))
    }

    @SuppressLint("MissingPermission")
    fun showLogged(context: Context, state: SetState, loggedLine: String) {
        if (!notificationsEnabled(context)) return
        ensureChannel(context)
        NotificationManagerCompat.from(context)
            .notify(LOGGED_NOTIFICATION_ID, buildLogged(context, state, loggedLine))
    }

    /** Takes the ongoing notification down; the logged line stays, as in the frame. */
    fun cancel(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    /**
     * Takes both down. The session is over — after the last set the ongoing
     * notification goes but the confirmation stays until here, so the trainee
     * is never left with a card to swipe away by hand.
     */
    fun cancelAll(context: Context) {
        val manager = NotificationManagerCompat.from(context)
        manager.cancel(NOTIFICATION_ID)
        manager.cancel(LOGGED_NOTIFICATION_ID)
    }

    /**
     * False when the trainee turned FitBud's notifications — or the workout
     * channel — off, or has not granted POST_NOTIFICATIONS on Android 13+.
     */
    fun notificationsEnabled(context: Context): Boolean {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return false
        // Absent is not "off": ensureChannel creates it on the way to posting.
        val channel = manager.getNotificationChannel(CHANNEL_ID) ?: return true
        return channel.importance != android.app.NotificationManager.IMPORTANCE_NONE
    }

    /**
     * src/notifications/androidChannels.ts creates this channel at app start,
     * but the button receiver runs with no JS runtime — after a force-stop it
     * is the first thing to post — and a notification on a channel that does
     * not exist is dropped. Creating one that already exists changes nothing,
     * and re-creating a channel the trainee turned off does not turn it back
     * on: the system keeps their importance.
     *
     * KEEP IN SYNC with the `workout` entry in
     * apps/mobile/src/notifications/androidChannels.ts (TR-16 §4).
     */
    private fun ensureChannel(context: Context) {
        val channel =
            NotificationChannelCompat.Builder(
                CHANNEL_ID,
                NotificationManagerCompat.IMPORTANCE_DEFAULT,
            )
                .setName("Workout reminders")
                .setDescription("When a workout isn't logged after your usual time.")
                .build()
        NotificationManagerCompat.from(context).createNotificationChannel(channel)
    }

    private const val REQUEST_LESS_WEIGHT = 7311
    private const val REQUEST_MORE_WEIGHT = 7312
    private const val REQUEST_FEWER_REPS = 7313
    private const val REQUEST_MORE_REPS = 7314
    private const val REQUEST_LOG_SET = 7315
    private const val REQUEST_OPEN = 7316
    private const val REQUEST_SKIP_REST = 7317

    /** An explicit, app-private broadcast: no other app can press these buttons. */
    private fun action(context: Context, action: String, requestCode: Int): PendingIntent {
        val intent =
            Intent(context, WorkoutSetActionReceiver::class.java)
                .setAction(action)
                .setPackage(context.packageName)
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** fitbud://workout/{assignmentId}, handled by the app's deep link routing. */
    private fun openIntent(context: Context, openUrl: String): PendingIntent? {
        if (openUrl.isBlank()) return null
        val intent =
            Intent(Intent.ACTION_VIEW, Uri.parse(openUrl))
                .setPackage(context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(
            context,
            REQUEST_OPEN,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /**
     * The FitBud mark, white on transparent (res/drawable/ic_fitbud_notification).
     *
     * It ships with the module rather than being resolved by name: the app has
     * no expo-notifications config plugin and so no generated
     * `notification_icon`, and the launcher icon is an adaptive icon with an
     * opaque background layer, which the shade — which draws a small icon as
     * an alpha silhouette — would render as a solid blob. The launcher icon
     * stays as a last resort only, because a notification without a small icon
     * throws.
     */
    private fun smallIcon(context: Context): Int {
        val icon = R.drawable.ic_fitbud_notification
        return try {
            context.resources.getResourceTypeName(icon)
            icon
        } catch (error: android.content.res.Resources.NotFoundException) {
            context.applicationInfo.icon
        }
    }

    private fun formatKg(value: Double): String {
        val rounded = kotlin.math.round(value * 10.0) / 10.0
        return if (rounded % 1.0 == 0.0) rounded.toInt().toString() else rounded.toString()
    }
}
