package com.bluex7710.hanzi;

import android.content.Context;
import android.net.Uri;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Keeps the lessons up to date without reinstalling the app.
 *
 * The web app always runs from a "www" folder in the app's private storage. It starts as a copy
 * of the files bundled in the APK, and is replaced whenever the website has a newer version, so
 * the app also works offline. Saved progress lives in the WebView's storage and is not touched.
 *
 * The version is the number in docs/sw.js's cache name ("hanzi-v12"), and the files to fetch are
 * that file's FILES list, so the website needs no extra build step.
 */
final class Updater {
    // GitHub Pages may serve the repository root or the docs/ folder; sw.js exists in only one.
    private static final String[] SITES = {
            "https://bluex7710.github.io/Chinese/",
            "https://bluex7710.github.io/Chinese/docs/",
    };
    private static final Pattern VERSION = Pattern.compile("hanzi-v(\\d+)");
    private static final Pattern FILE = Pattern.compile("'\\./([\\w.-]+)'");
    private static final long CHECK_EVERY_MS = 30 * 60 * 1000;
    private static long lastCheck;

    private Updater() {}

    private static File live(Context c) {
        return new File(c.getFilesDir(), "www");
    }

    /** The page to load. Installs the bundled copy first if it is newer than what's on disk. */
    static String startUrl(Context c) {
        try {
            int bundled = versionOf(new String(read(c.getAssets().open("www/sw.js")), StandardCharsets.UTF_8));
            if (installedVersion(c) < bundled) installBundled(c);
        } catch (IOException e) {
            // Fall through: if the copy on disk is unusable, run straight from the APK.
        }
        File index = new File(live(c), "index.html");
        return index.isFile() ? Uri.fromFile(index).toString() : "file:///android_asset/www/index.html";
    }

    /** Looks for a newer version on the website, at most every half hour. Runs onUpdated if one was installed. */
    static void checkInBackground(Context c, Runnable onUpdated) {
        long now = System.currentTimeMillis();
        if (now - lastCheck < CHECK_EVERY_MS) return;
        lastCheck = now;
        Context app = c.getApplicationContext();
        new Thread(() -> {
            try {
                if (download(app)) onUpdated.run();
            } catch (IOException | RuntimeException e) {
                // Offline or the site is down: keep what we have and try again later.
            }
        }).start();
    }

    private static int versionOf(String swJs) {
        Matcher m = VERSION.matcher(swJs);
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }

    private static int installedVersion(Context c) {
        File sw = new File(live(c), "sw.js");
        if (!sw.isFile()) return 0;
        try {
            return versionOf(new String(read(new FileInputStream(sw)), StandardCharsets.UTF_8));
        } catch (IOException e) {
            return 0;
        }
    }

    private static void installBundled(Context c) throws IOException {
        File fresh = emptyDir(c, "www-bundled");
        String[] names = c.getAssets().list("www");
        if (names == null) throw new IOException("no bundled files");
        for (String name : names) write(new File(fresh, name), read(c.getAssets().open("www/" + name)));
        swap(fresh, live(c));
    }

    private static boolean download(Context c) throws IOException {
        for (String site : SITES) {
            byte[] sw = get(site + "sw.js");
            if (sw == null) continue;
            String text = new String(sw, StandardCharsets.UTF_8);
            if (versionOf(text) <= installedVersion(c)) return false;

            // Fetch everything into a spare folder first, so a dropped connection changes nothing.
            File fresh = emptyDir(c, "www-new");
            Matcher m = FILE.matcher(text);
            while (m.find()) {
                byte[] body = get(site + m.group(1));
                if (body == null) throw new IOException("missing " + m.group(1));
                write(new File(fresh, m.group(1)), body);
            }
            if (!new File(fresh, "index.html").isFile() || !new File(fresh, "app.js").isFile()) {
                throw new IOException("incomplete update");
            }
            write(new File(fresh, "sw.js"), sw);
            swap(fresh, live(c));
            return true;
        }
        return false;
    }

    /** The response body, or null if the page doesn't exist. */
    private static byte[] get(String url) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(15_000);
        conn.setUseCaches(false);
        try {
            if (conn.getResponseCode() != 200) return null;
            return read(conn.getInputStream());
        } finally {
            conn.disconnect();
        }
    }

    private static byte[] read(InputStream in) throws IOException {
        try (InputStream stream = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            for (int n; (n = stream.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static void write(File file, byte[] body) throws IOException {
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(body);
        }
    }

    private static File emptyDir(Context c, String name) throws IOException {
        File dir = new File(c.getFilesDir(), name);
        delete(dir);
        if (!dir.mkdirs()) throw new IOException("cannot create " + dir);
        return dir;
    }

    private static void swap(File fresh, File live) throws IOException {
        delete(live);
        if (!fresh.renameTo(live)) throw new IOException("cannot install update");
    }

    private static void delete(File f) {
        File[] children = f.listFiles();
        if (children != null) for (File child : children) delete(child);
        f.delete();
    }
}
