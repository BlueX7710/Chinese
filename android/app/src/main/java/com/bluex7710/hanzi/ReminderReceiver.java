package com.bluex7710.hanzi;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.Calendar;

/** Nags you at 7pm every day if today's lesson isn't done. */
public class ReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL = "reminder";
    private static final int REMINDER_HOUR = 19;

    static void schedule(Context c) {
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, REMINDER_HOUR);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);

        PendingIntent pi = PendingIntent.getBroadcast(c, 0, new Intent(c, ReminderReceiver.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        AlarmManager am = c.getSystemService(AlarmManager.class);
        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            schedule(c);
            return;
        }
        if (Prefs.isDoneToday(c)) return;

        NotificationManager nm = c.getSystemService(NotificationManager.class);
        nm.createNotificationChannel(
                new NotificationChannel(CHANNEL, "Daily reminder", NotificationManager.IMPORTANCE_HIGH));
        PendingIntent open = PendingIntent.getActivity(c, 0, new Intent(c, MainActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle("你还没学习！ You haven't studied today")
                .setContentText("Your streak dies at midnight. Do today's lesson now.")
                .setContentIntent(open)
                .setAutoCancel(true)
                .build();
        nm.notify(1, n);
    }
}
