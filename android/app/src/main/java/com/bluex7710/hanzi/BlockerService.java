package com.bluex7710.hanzi;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityEvent;

/**
 * Watches which app comes to the foreground. If it's on the blocked list and today's
 * lesson isn't done, it sends you home and opens the lesson instead.
 */
public class BlockerService extends AccessibilityService {
    private long lastRedirect;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence name = event.getPackageName();
        if (name == null) return;
        String pkg = name.toString();
        if (pkg.equals(getPackageName())) return;
        if (Prefs.isDoneToday(this) || !Prefs.blocked(this).contains(pkg)) return;

        // One app launch fires several window events; redirect once.
        long now = SystemClock.elapsedRealtime();
        if (now - lastRedirect < 1500) return;
        lastRedirect = now;

        performGlobalAction(GLOBAL_ACTION_HOME);
        Intent lesson = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_BLOCKED, pkg);
        startActivity(lesson);
    }

    @Override
    public void onInterrupt() {}
}
