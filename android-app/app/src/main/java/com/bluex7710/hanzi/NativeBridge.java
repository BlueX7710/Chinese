package com.bluex7710.hanzi;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.text.TextUtils;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Exposed to the web app as window.HanziNative. */
public class NativeBridge {
    private final Activity activity;
    private final WebView web;
    private TextToSpeech tts;
    private volatile boolean voiceReady;

    NativeBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        tts = new TextToSpeech(activity, status -> {
            if (status != TextToSpeech.SUCCESS) return;
            int result = tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
            voiceReady = result >= TextToSpeech.LANG_AVAILABLE;
            tts.setSpeechRate(0.8f);
            if (voiceReady) {
                web.post(() -> web.evaluateJavascript("window.onNativeVoice && onNativeVoice()", null));
            }
        });
    }

    void shutdown() {
        tts.shutdown();
    }

    static String labelFor(Context c, String pkg) {
        PackageManager pm = c.getPackageManager();
        try {
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return pkg;
        }
    }

    // ---- speech ----

    @JavascriptInterface
    public boolean hasVoice() {
        return voiceReady;
    }

    @JavascriptInterface
    public void speak(String text) {
        if (voiceReady) tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "word");
    }

    // ---- lesson state ----

    @JavascriptInterface
    public void lessonDone(String date) {
        Prefs.setDone(activity, date);
    }

    // ---- app blocking ----

    /** Every app with a launcher icon, as JSON [{pkg, label}], sorted by name. */
    @JavascriptInterface
    public String getApps() {
        PackageManager pm = activity.getPackageManager();
        Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> found = pm.queryIntentActivities(launcher, 0);
        Set<String> seen = new HashSet<>();
        List<JSONObject> apps = new ArrayList<>();
        for (ResolveInfo ri : found) {
            String pkg = ri.activityInfo.packageName;
            if (pkg.equals(activity.getPackageName()) || !seen.add(pkg)) continue;
            try {
                apps.add(new JSONObject().put("pkg", pkg).put("label", ri.loadLabel(pm).toString()));
            } catch (JSONException ignored) {
                // put() only throws for non-finite numbers.
            }
        }
        apps.sort((a, b) -> a.optString("label").compareToIgnoreCase(b.optString("label")));
        return new JSONArray(apps).toString();
    }

    @JavascriptInterface
    public String getBlockedApps() {
        return new JSONArray(Prefs.blocked(activity)).toString();
    }

    @JavascriptInterface
    public void setBlockedApps(String json) {
        Set<String> pkgs = new HashSet<>();
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) pkgs.add(arr.getString(i));
        } catch (JSONException e) {
            return;
        }
        Prefs.setBlocked(activity, pkgs);
    }

    @JavascriptInterface
    public boolean isBlockerOn() {
        String enabled = Settings.Secure.getString(
                activity.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (TextUtils.isEmpty(enabled)) return false;
        ComponentName me = new ComponentName(activity, BlockerService.class);
        for (String s : enabled.split(":")) {
            ComponentName c = ComponentName.unflattenFromString(s);
            if (me.equals(c)) return true;
        }
        return false;
    }

    @JavascriptInterface
    public void openBlockerSettings() {
        activity.startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
    }

    @JavascriptInterface
    public void openAppSettings() {
        // Sideloaded apps on Android 13+ need "Allow restricted settings" from here first.
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.fromParts("package", activity.getPackageName(), null));
        activity.startActivity(i);
    }

    @JavascriptInterface
    public void openApp(String pkg) {
        Intent i = activity.getPackageManager().getLaunchIntentForPackage(pkg);
        if (i != null) activity.startActivity(i);
    }
}
