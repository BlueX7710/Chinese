package com.bluex7710.hanzi;

import android.content.Context;
import android.content.SharedPreferences;

import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Native-side state the blocker needs: which apps are blocked, and whether today's lesson is done. */
final class Prefs {
    private static final String FILE = "hanzi";
    private static final String KEY_DONE = "doneDate";
    private static final String KEY_BLOCKED = "blockedApps";

    static final Set<String> DEFAULT_BLOCKED = new HashSet<>(Arrays.asList(
            "com.instagram.android",
            "com.zhiliaoapp.musically", // TikTok
            "com.ss.android.ugc.trill", // TikTok (some regions)
            "com.google.android.youtube",
            "com.facebook.katana",
            "com.twitter.android",
            "com.reddit.frontpage",
            "com.snapchat.android",
            "com.netflix.mediaclient",
            "tv.twitch.android.app"));

    private Prefs() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /** Same yyyy-MM-dd local date format the web app uses. */
    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    static boolean isDoneToday(Context c) {
        return today().equals(prefs(c).getString(KEY_DONE, ""));
    }

    static void setDone(Context c, String date) {
        prefs(c).edit().putString(KEY_DONE, date).apply();
    }

    static Set<String> blocked(Context c) {
        return new HashSet<>(prefs(c).getStringSet(KEY_BLOCKED, DEFAULT_BLOCKED));
    }

    static void setBlocked(Context c, Set<String> pkgs) {
        prefs(c).edit().putStringSet(KEY_BLOCKED, new HashSet<>(pkgs)).apply();
    }
}
