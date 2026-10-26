package com.bluex7710.hanzi;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/** Hosts the lesson web app (bundled in assets/www) in a WebView. */
public class MainActivity extends Activity {
    static final String EXTRA_BLOCKED = "blockedPackage";
    private static final String START_URL = "file:///android_asset/www/index.html";

    private WebView web;
    private NativeBridge bridge;
    private boolean pageLoaded;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                pageLoaded = true;
            }
        });
        bridge = new NativeBridge(this, web);
        web.addJavascriptInterface(bridge, "HanziNative");

        String url = START_URL;
        String pkg = getIntent().getStringExtra(EXTRA_BLOCKED);
        if (pkg != null) {
            url += "?app=" + Uri.encode(pkg) + "&appName=" + Uri.encode(NativeBridge.labelFor(this, pkg));
        }
        web.loadUrl(url);

        ReminderReceiver.schedule(this);
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String pkg = intent.getStringExtra(EXTRA_BLOCKED);
        if (pkg == null || !pageLoaded) return;
        // Tell the already-running page instead of reloading, so a lesson in progress isn't lost.
        String js = "window.onNativeBlocked && onNativeBlocked("
                + JSONObject.quote(pkg) + "," + JSONObject.quote(NativeBridge.labelFor(this, pkg)) + ")";
        web.evaluateJavascript(js, null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Coming back from Android settings: refresh the "app blocker is on/off" state.
        if (pageLoaded) web.evaluateJavascript("window.onNativeResume && onNativeResume()", null);
    }

    @Override
    protected void onDestroy() {
        bridge.shutdown();
        web.destroy();
        super.onDestroy();
    }
}
