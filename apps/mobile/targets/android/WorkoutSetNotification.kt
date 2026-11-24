package com.thefitbud.liveactivity

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * The ongoing workout notification: Android's TR-15d lock-screen tile (Z14-5,
 * D-W14-12). Expo web does not compile this file; a dev build does, through
 * the local Expo module (modules/live-activity/android, LA3), which puts this
 * directory on its source path.
 *
 * Layout, as on iOS (targets/FitBudLiveActivity/FitBudLiveActivity.swift):
 * - title row (the system header): "FitBud · Lower body B" and the elapsed
 *   workout timer, a chronometer counting up from the workout's start;
 * - "Romanian deadlift" and "Set 3 of 3";
 * - "Last 42.5 kg × 10" (only when there is a previous set) and
 *   "Target 40 kg × 10" in the coach colour;
 * - "✓ Log 40 kg × 10" and "Open";
 * - the coral progress line through the exercise's sets.
 * There are no ± steppers: Log logs the target shown, exactly like the iOS
 * button. Changing the values is done in the app (Open).
 *
 * Collapsed, the system draws the title, "Romanian deadlift · Set 3 of 3", and
 * the Last/Target line. Expanded is at most 252 dp.
 *
 * It is posted on its own "Live workout" channel (`workout_live`, created here,
 * natively): IMPORTANCE_DEFAULT so it shows on the lock screen and in the
 * shade, silent, no vibration, lock-screen visibility PUBLIC. The "Workout
 * reminders" channel (`workout`) is for reminders only and is no longer used
 * here. There is no foreground service (D-W14-12: it needs a Play
 * health-service declaration; a follow-up if a lock screen still hides this).
 *
 * Buttons are PendingIntents, not LiveActivityIntent:
 * - Log writes workout.log_set and advances to the next set
 * - Open uses the fitbud://workout/{assignmentId} deep link
 *
 * With rest on (LA3c, D-W3-3, frame 27-android-rest.png) the same notification
 * shows a rest countdown with Skip rest instead of the set controls, and goes
 * back to the next set when the trainee skips. The countdown is a Chronometer
 * counting down to `restEndsAt`: the device counts, so rest costs no repost
 * per second and no timer in JS. Rest itself is decided by the app, exactly as
 * on iOS (27c) — the notification never starts a rest of its own.
 * Rest shows the countdown only: no progress bar and no foreground service
 * (D-W3-13, frame 27-android-rest.png).
 *
 * A logged set collapses to one line ("Set 2 logged · 22.5 kg × 10"), shown as
 * its own short notification while the ongoing one moves to the next set.
 */
object WorkoutSetNotification {
    /**
     * The "Live workout" channel (D-W14-12). Its own id, not the reminders'
     * `workout`, so the trainee can keep reminders quiet and still see the
     * running workout, and so the channel's lock-screen setting is its own.
     */
    const val CHANNEL_ID = "workout_live"
    const val CHANNEL_NAME = "Live workout"
    const val CHANNEL_DESCRIPTION = "Your workout while it runs, with Log and Open on the lock screen."

    const val ACTION_LOG_SET = "com.thefitbud.mobile.workout.LOG_SET"
    const val ACTION_SKIP_REST = "com.thefitbud.mobile.workout.SKIP_REST"

    /** The ongoing set notification; one workout at a time, so one id. */
    const val NOTIFICATION_ID = 7301

    /** The short "Set n logged · …" confirmation that follows a logged set. */
    const val LOGGED_NOTIFICATION_ID = 7302

    /** Header text when the app sent no workout name. */
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
        /** "Lower body B": the header, next to the app name. */
        val workoutName: String = "",
        /**
         * End of the running rest, epoch ms, or null when there is no rest
         * (LA1c's field, same meaning on both platforms). The app sends one
         * update when rest starts and one when it ends or is skipped.
         */
        val restEndsAt: Long? = null,
        /** Full rest length in seconds, as the app set it. */
        val restSeconds: Int? = null,
        /**
         * From JS (`lastExercise === false`). While true, logSet must not set
         * finished (Z12-48 / Z12-57).
         */
        val moreExercisesRemain: Boolean = false,
        /**
         * When the workout notification was first posted, epoch ms: the
         * TR-15d elapsed timer counts up from it (iOS: `startedAt`). Null for
         * a state stored by a build before Z14-5; then no timer is shown.
         */
        val startedAt: Long? = null,
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
        val effectiveReps = if (state.reps > 0) state.reps else state.planReps
        val logged =
            if (effectiveReps > 0) {
                "Set ${state.setIndex} logged · ${formatLoad(state.kilograms, effectiveReps)}"
            } else {
                state.loggedLine
            }
        val next = state.setIndex + 1
        val pastLastSet = next > state.setCount
        // Never end the workout while more exercises remain; JS owns advance.
        val finished = pastLastSet && !state.moreExercisesRemain
        return state.copy(
            loggedLine = logged,
            lastKilograms = if (effectiveReps > 0) state.kilograms else state.lastKilograms,
            lastReps = if (effectiveReps > 0) effectiveReps else state.lastReps,
            setIndex = if (pastLastSet) state.setIndex else next,
            kilograms = state.planKilograms,
            reps = state.planReps,
            finished = finished,
            // A new set never inherits the previous set's countdown; the app
            // sends the next rest, as it does for a set logged in the app.
            restEndsAt = null,
            restSeconds = null,
        )
    }

    /** "Set 3 of 3" (TR-15d). */
    fun setLine(state: SetState): String = "Set ${state.setIndex} of ${state.setCount}"

    /** "Romanian deadlift · Set 3 of 3": the collapsed title and the rest view's next line. */
    fun titleLine(state: SetState): String = "${state.exerciseName} · ${setLine(state)}"

    /** "Last 42.5 kg × 10", or null when the trainee has no previous value. */
    fun lastLine(state: SetState): String? {
        val kilograms = state.lastKilograms ?: return null
        val reps = state.lastReps ?: return null
        return "Last ${formatLoad(kilograms, reps)}"
    }

    /** "Target 40 kg × 10": the coach's prescription (iOS falls back to reps the same way). */
    fun targetLine(state: SetState): String {
        val reps = if (state.planReps > 0) state.planReps else state.reps
        return "Target ${formatLoad(state.planKilograms, reps)}"
    }

    /** "Last 42.5 kg × 10 · Target 40 kg × 10": the collapsed text. */
    fun lastAndTargetLine(state: SetState): String =
        listOfNotNull(lastLine(state), targetLine(state)).joinToString(" · ")

    /** "22.5 kg × 10" or "12 reps": what Log will record. */
    fun valuesLine(state: SetState): String {
        val reps = if (state.reps > 0) state.reps else state.planReps
        return formatLoad(state.kilograms, reps)
    }

    /** "Next · Romanian deadlift · Set 3 of 3" (frame 27-android-rest). */
    fun nextLine(state: SetState): String = "Next · ${titleLine(state)}"

    /** The Skip rest button's label for TalkBack: what skipping leads to. */
    fun skipRestDescription(state: SetState): String =
        "Skip rest, next: ${titleLine(state)}, ${valuesLine(state)}"

    /** "Log 40 kg × 10" / "Log 12 reps" (TR-15d; the iOS button's words). */
    fun logSetLabel(state: SetState): String = "Log ${valuesLine(state)}"

    /** Sets done through the exercise, for the progress line (iOS: setProgressFraction). */
    fun progress(state: SetState): Pair<Int, Int> {
        val max = state.setCount.coerceAtLeast(1)
        return Pair(max, state.setIndex.coerceIn(0, max))
    }

    /**
     * The ongoing notification. Not dismissible while the workout runs, no
     * sound (silent post on a silent channel), and it opens the workout when
     * tapped.
     */
    fun build(context: Context, state: SetState): Notification {
        if (resting(state)) return buildResting(context, state)
        val expanded = RemoteViews(context.packageName, R.layout.fitbud_workout_set)
        expanded.setTextViewText(R.id.fitbud_workout_exercise, state.exerciseName)
        expanded.setTextViewText(R.id.fitbud_workout_set, setLine(state))

        val last = lastLine(state)
        if (last == null) {
            expanded.setViewVisibility(R.id.fitbud_workout_last, android.view.View.GONE)
        } else {
            expanded.setViewVisibility(R.id.fitbud_workout_last, android.view.View.VISIBLE)
            expanded.setTextViewText(R.id.fitbud_workout_last, last)
        }
        expanded.setTextViewText(R.id.fitbud_workout_target, targetLine(state))

        val logged = state.loggedLine
        if (logged.isNullOrBlank()) {
            expanded.setViewVisibility(R.id.fitbud_workout_logged, android.view.View.GONE)
        } else {
            expanded.setViewVisibility(R.id.fitbud_workout_logged, android.view.View.VISIBLE)
            expanded.setTextViewText(R.id.fitbud_workout_logged, logged)
        }

        val (max, done) = progress(state)
        expanded.setProgressBar(R.id.fitbud_workout_progress, max, done, false)
        expanded.setContentDescription(
            R.id.fitbud_workout_progress,
            "Set progress, ${setLine(state)}",
        )

        expanded.setTextViewText(R.id.fitbud_workout_log, "✓ ${logSetLabel(state)}")
        expanded.setContentDescription(R.id.fitbud_workout_log, logSetLabel(state))
        expanded.setContentDescription(R.id.fitbud_workout_open, "Open the workout")
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
                // "FitBud · Lower body B" in the title row (TR-15d).
                .setSubText(state.workoutName.ifBlank { SUB_TEXT })
                .setContentTitle(titleLine(state))
                .setContentText(lastAndTargetLine(state))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_WORKOUT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCustomBigContentView(expanded)
                .setStyle(NotificationCompat.DecoratedCustomViewStyle())
        val startedAt = state.startedAt
        if (startedAt != null) {
            // TR-15d's "23:14": the elapsed workout time, counted by the device
            // from one post (a chronometer counting up from `startedAt`).
            builder.setShowWhen(true).setWhen(startedAt).setUsesChronometer(true)
        } else {
            builder.setShowWhen(false)
        }
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
     * There is no progress bar and no foreground service, by decision
     * (D-W3-13, Firoz, 3 Nov 2026), and the redrawn frame
     * 27-android-rest.png shows none. A notification bar only moves when the
     * app reposts, and a rest cannot be reposted reliably: alarms while the
     * device is idle are inexact and rate limited (see RestAlarm), and a
     * foreground service costs battery and needs a declared service type for
     * Play. The Chronometer is kept exact by the system from this one post.
     * Do not add a ProgressBar, setProgress or another alarm for rest.
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
                // "FitBud · Lower body B" in the rest frame's header.
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
     * False when the trainee turned FitBud's notifications — or the Live
     * workout channel — off, or has not granted POST_NOTIFICATIONS on
     * Android 13+.
     */
    fun notificationsEnabled(context: Context): Boolean {
        val manager = NotificationManagerCompat.from(context)
        if (!manager.areNotificationsEnabled()) return false
        // Absent is not "off": ensureChannel creates it on the way to posting.
        val channel = manager.getNotificationChannel(CHANNEL_ID) ?: return true
        return channel.importance != NotificationManager.IMPORTANCE_NONE
    }

    /** The channel's settings, separate from posting so a unit test can read them. */
    fun channel(): NotificationChannel =
        NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = CHANNEL_DESCRIPTION
            // Silent: a running workout never rings or buzzes on an update.
            setSound(null, null)
            enableVibration(false)
            enableLights(false)
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }

    /**
     * Created natively, here, because the button receiver runs with no JS
     * runtime — after a force-stop it is the first thing to post — and a
     * notification on a channel that does not exist is dropped. Creating one
     * that already exists changes nothing, and re-creating a channel the
     * trainee turned off does not turn it back on: the system keeps their
     * settings. minSdk is 26, so NotificationChannel always exists.
     */
    private fun ensureChannel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(channel())
    }

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
     * no generated `notification_icon` for this module to rely on, and the
     * launcher icon is an adaptive icon with an opaque background layer, which
     * the shade — which draws a small icon as an alpha silhouette — would
     * render as a solid blob. The launcher icon stays as a last resort only,
     * because a notification without a small icon throws.
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

    internal fun formatKg(value: Double): String {
        val rounded = kotlin.math.round(value * 10.0) / 10.0
        return if (rounded % 1.0 == 0.0) rounded.toInt().toString() else rounded.toString()
    }

    /** Bodyweight (kg ≤ 0) → "12 reps"; weighted → "40 kg × 10". Never "0 kg". */
    internal fun formatLoad(kilograms: Double, reps: Int): String =
        if (kilograms <= 0.0) "$reps reps" else "${formatKg(kilograms)} kg × $reps"
}
