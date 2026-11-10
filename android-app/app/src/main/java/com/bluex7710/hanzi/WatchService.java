package com.bluex7710.hanzi;

import android.app.AppOpsManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.Process;
import android.os.SystemClock;
import android.provider.Settings;

/**
 * The app blocker. Checks which app is in front a couple of times a second (through "usage
 * access") and, if it's on the blocked list and today's lesson isn't done, opens the lesson on top
 * of it (which needs "display over other apps").
 *
 * Deliberately not an accessibility service: Play Protect refuses to install sideloaded apps that
 * declare one.
 */
public class WatchService extends Service {
    private static final String CHANNEL = "blocker";
    private static final int NOTIFICATION_ID = 2;
    private static final long WATCHING_MS = 600;
    private static final long SCREEN_OFF_MS = 5_000;
    private static final long LESSON_DONE_MS = 60_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable tick = this::check;
    private long lastChecked;
    private long lastRedirect;
    private String inFront = "";

    @SuppressWarnings("deprecation") // the replacement, unsafeCheckOpNoThrow, needs API 29
    static boolean hasUsageAccess(Context c) {
        AppOpsManager ops = c.getSystemService(AppOpsManager.class);
        int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    static boolean canShowOnTop(Context c) {
        return Settings.canDrawOverlays(c);
    }

    static boolean ready(Context c) {
        return hasUsageAccess(c) && canShowOnTop(c);
    }

    /** Starts the blocker if both permissions are granted. Safe to call any time. */
    static void start(Context c) {
        if (!ready(c)) return;
        try {
            c.startForegroundService(new Intent(c, WatchService.class));
        } catch (RuntimeException e) {
            // Android won't always let a background app start a service; opening the app starts it.
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(
                new NotificationChannel(CHANNEL, "App blocker", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle("App blocker is on")
                .setContentText("Blocked apps open your lesson until today's is done.")
                .setContentIntent(open)
                .setOngoing(true)
                .build();
        startForeground(NOTIFICATION_ID, n);
        lastChecked = System.currentTimeMillis();
        handler.post(tick);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void check() {
        if (!ready(this)) {
            stopSelf();
            return;
        }
        long delay = WATCHING_MS;
        if (Prefs.isDoneToday(this)) {
            delay = LESSON_DONE_MS;
        } else if (!getSystemService(PowerManager.class).isInteractive()) {
            delay = SCREEN_OFF_MS;
        } else {
            String pkg = appInFront();
            if (!pkg.equals(getPackageName()) && Prefs.blocked(this).contains(pkg)) redirect(pkg);
        }
        handler.postDelayed(tick, delay);
    }

    /** The package of the app most recently brought to the front. */
    @SuppressWarnings("deprecation") // MOVE_TO_FOREGROUND is ACTIVITY_RESUMED under its pre-API-29 name
    private String appInFront() {
        long now = System.currentTimeMillis();
        UsageStatsManager usage = getSystemService(UsageStatsManager.class);
        UsageEvents events = usage.queryEvents(Math.max(lastChecked - 1_000, now - 10_000), now);
        UsageEvents.Event event = new UsageEvents.Event();
        while (events.hasNextEvent()) {
            events.getNextEvent(event);
            if (event.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) inFront = event.getPackageName();
        }
        lastChecked = now;
        return inFront;
    }

    private void redirect(String pkg) {
        long now = SystemClock.elapsedRealtime();
        if (now - lastRedirect < 1_500) return;
        lastRedirect = now;
        Intent lesson = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_BLOCKED, pkg);
        startActivity(lesson);
    }
}
