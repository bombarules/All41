package com.orbit.hub;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.ContentValues;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.widget.Toast;
import android.net.Uri;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class MainActivity extends Activity {

    // The app's own pages are served at this https address from inside the APK,
    // so the Mapbox key (which only allows bombarules.github.io) works offline-first.
    static final String HOST = "bombarules.github.io";
    static final String PREFIX = "/park-universe/";
    static final String START = "https://" + HOST + PREFIX + "index.html";

    private WebView web;
    private static final int REQ_HOME_ROLE = 7;
    private static final int REQ_PROJECTION = 42;
    private static final int REQ_FILE = 51;
    private static final int REQ_SAVE = 52;
    private static final int REQ_LOCATION = 53;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private String pendingText;
    private byte[] pendingBytes;
    private String pendingMime = "text/csv";
    private String pendingCode;
    private String pendingName;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);
        web.setWebViewClient(new AppClient());
        web.addJavascriptInterface(new Bridge(), "BombaNative");
        // Bridges the built-in apps were written for: PoolCommand and VoluntTold.
        web.addJavascriptInterface(new PoolBridge(), "PoolBridge");
        web.addJavascriptInterface(new AppBridge(), "AndroidApp");
        web.setWebChromeClient(new FileChooser());
        ShareService.sink = status -> {
            if (web != null) {
                final String js = "window.bombaShareStatus&&window.bombaShareStatus("
                        + status.toString() + ")";
                web.post(() -> web.evaluateJavascript(js, null));
            }
        };
        if (savedInstanceState == null) {
            web.loadUrl(START);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK) {
                    if (data != null && data.getData() != null) result = new Uri[]{data.getData()};
                    else if (cameraUri != null) result = new Uri[]{cameraUri};
                } else if (cameraUri != null) {
                    try { getContentResolver().delete(cameraUri, null, null); } catch (Exception ignored) { }
                }
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            cameraUri = null;
            return;
        }
        if (requestCode == REQ_SAVE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && (pendingText != null || pendingBytes != null)) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData())) {
                    if (os != null) os.write(pendingBytes != null ? pendingBytes : pendingText.getBytes(StandardCharsets.UTF_8));
                    Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(this, "Couldn't save the file", Toast.LENGTH_LONG).show();
                }
            }
            pendingText = null;
            pendingBytes = null;
            return;
        }
        if (requestCode != REQ_PROJECTION) return;
        if (resultCode == RESULT_OK && data != null && pendingCode != null) {
            Intent svc = new Intent(this, ShareService.class);
            svc.putExtra(ShareService.EXTRA_RESULT_CODE, resultCode);
            svc.putExtra(ShareService.EXTRA_RESULT_DATA, data);
            svc.putExtra(ShareService.EXTRA_CODE, pendingCode);
            svc.putExtra(ShareService.EXTRA_NAME, pendingName);
            startForegroundService(svc);
        } else {
            try {
                JSONObject s = new JSONObject();
                s.put("state", "error");
                s.put("message", "Sharing was cancelled");
                ShareService.lastStatusJson = s.toString();
                if (ShareService.sink != null) ShareService.sink.onShareStatus(s);
            } catch (Exception ignored) {
            }
        }
        pendingCode = null;
        pendingName = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQ_LOCATION && geoCallback != null) {
            boolean ok = false;
            for (int r : results) if (r == PackageManager.PERMISSION_GRANTED) ok = true;
            geoCallback.invoke(geoOrigin, ok, false);
            geoCallback = null;
            geoOrigin = null;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Home button pressed while Park Universe is the home app: back to the map.
        if (web != null) {
            web.post(() -> {
                String u = web.getUrl();
                if (u == null || !u.startsWith(START)) web.loadUrl(START);   // inside an app: back to the map
                else web.evaluateJavascript("window.bombaHome&&window.bombaHome()", null);
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private boolean isDefaultHome() {
        Intent home = new Intent(Intent.ACTION_MAIN);
        home.addCategory(Intent.CATEGORY_HOME);
        ResolveInfo info = getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
        return info != null && info.activityInfo != null
                && getPackageName().equals(info.activityInfo.packageName);
    }

    private void openHomeSwitch() {
        // Not the home app yet: the system asks with its own dialog (Android 10+).
        if (!isDefaultHome() && Build.VERSION.SDK_INT >= 29) {
            RoleManager rm = (RoleManager) getSystemService(ROLE_SERVICE);
            if (rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME)
                    && !rm.isRoleHeld(RoleManager.ROLE_HOME)) {
                startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), REQ_HOME_ROLE);
                return;
            }
        }
        // Already home (switch back) or older Android: system home settings list.
        try {
            startActivity(new Intent(Settings.ACTION_HOME_SETTINGS));
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }

    private static boolean ours(Uri u) {
        if (u == null) return false;
        if ("file".equals(u.getScheme())) return true;
        return "https".equals(u.getScheme()) && HOST.equals(u.getHost())
                && u.getPath() != null && u.getPath().startsWith(PREFIX);
    }

    private static String mime(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }

    /** Serves the APK's assets at https://bombarules.github.io/park-universe/ and sends other links to the phone. */
    private class AppClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if ("https".equals(u.getScheme()) && HOST.equals(u.getHost())
                    && u.getPath() != null && u.getPath().startsWith(PREFIX)) {
                String path = u.getPath().substring(PREFIX.length());
                if (path.isEmpty()) path = "index.html";
                Map<String, String> headers = new HashMap<>();
                headers.put("Access-Control-Allow-Origin", "*");
                headers.put("Cache-Control", "no-cache");
                try {
                    InputStream in = getAssets().open(path);
                    String type = mime(path);
                    boolean text = type.startsWith("text/") || type.endsWith("javascript") || type.endsWith("json") || type.endsWith("svg+xml");
                    return new WebResourceResponse(type, text ? "UTF-8" : null, 200, "OK", headers, in);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", headers,
                            new ByteArrayInputStream(new byte[0]));
                }
            }
            return super.shouldInterceptRequest(view, req);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (ours(u)) return false;
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, u);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch (Exception ignored) {
            }
            return true;
        }
    }

    /** Photo picker for the apps' "add photo" buttons; uses the camera when the page asks for it. */
    private class FileChooser extends WebChromeClient {
        /** GPS for the asset inventory: only our own pages may ask, and Android asks the person once. */
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            Uri o = Uri.parse(origin);
            if (!"https".equals(o.getScheme()) || !HOST.equals(o.getHost())) { callback.invoke(origin, false, false); return; }
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                callback.invoke(origin, true, false);
            } else {
                geoCallback = callback;
                geoOrigin = origin;
                requestPermissions(new String[]{android.Manifest.permission.ACCESS_FINE_LOCATION,
                        android.Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
            }
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            cameraUri = null;
            String[] types = params.getAcceptTypes();
            String type = (types != null && types.length > 0 && types[0] != null && !types[0].isEmpty()) ? types[0] : "*/*";
            Intent intent = null;
            if (params.isCaptureEnabled() && Build.VERSION.SDK_INT >= 29 && type.startsWith("image")) {
                try {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Images.Media.DISPLAY_NAME, "park_" + System.currentTimeMillis() + ".jpg");
                    v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                    v.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Park Universe");
                    cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                    if (cameraUri != null) {
                        intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    }
                } catch (Exception e) {
                    cameraUri = null;
                }
            }
            if (intent == null) {
                Intent get = new Intent(Intent.ACTION_GET_CONTENT);
                get.addCategory(Intent.CATEGORY_OPENABLE);
                get.setType(type);
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) get.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                intent = Intent.createChooser(get, "Choose a file");
            }
            try {
                startActivityForResult(intent, REQ_FILE);
                return true;
            } catch (Exception e) {
                fileCallback.onReceiveValue(null);
                fileCallback = null;
                return false;
            }
        }
    }

    /** PoolCommand: share CSV exports and backups, keep the screen on, report the app version. */
    public class PoolBridge {
        @JavascriptInterface
        public void share(final String title, final String text) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_SUBJECT, title);
                send.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(send, title));
            });
        }

        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }

    /** VoluntTold + Park Universe: save files through Android's "save as" screen. */
    public class AppBridge {
        @JavascriptInterface
        public void saveBase64(final String name, final String mime, final String b64) {
            try {
                pendingBytes = Base64.decode(b64, Base64.DEFAULT);
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Couldn't save the file", Toast.LENGTH_LONG).show());
                return;
            }
            pendingText = null;
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(i, REQ_SAVE);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Couldn't save the file", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public void saveText(final String name, final String text) {
            pendingText = text;
            pendingBytes = null;
            String n = name == null ? "" : name.toLowerCase();
            final String type = n.endsWith(".geojson") || n.endsWith(".json") ? "application/json" : "text/csv";
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(type);
                i.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(i, REQ_SAVE);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Couldn't save the file", Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    /** Bridge the page's existing UI expects, under its original name. */
    public class Bridge {

        @JavascriptInterface
        public void requestApps() {
            new Thread(() -> {
                JSONArray arr = new JSONArray();
                try {
                    PackageManager pm = getPackageManager();
                    Intent main = new Intent(Intent.ACTION_MAIN);
                    main.addCategory(Intent.CATEGORY_LAUNCHER);
                    List<ResolveInfo> apps = pm.queryIntentActivities(main, 0);
                    List<ResolveInfo> sorted = new ArrayList<>(apps);
                    Collections.sort(sorted, new ResolveInfo.DisplayNameComparator(pm));
                    for (ResolveInfo ri : sorted) {
                        JSONObject o = new JSONObject();
                        o.put("label", String.valueOf(ri.loadLabel(pm)));
                        o.put("pkg", ri.activityInfo.packageName);
                        o.put("icon", iconDataUri(pm, ri));
                        arr.put(o);
                    }
                } catch (Exception ignored) {
                }
                final String js = "window.bombaApps&&window.bombaApps(" + arr.toString() + ")";
                web.post(() -> web.evaluateJavascript(js, null));
            }).start();
        }

        private String iconDataUri(PackageManager pm, ResolveInfo ri) {
            try {
                Drawable d = ri.loadIcon(pm);
                int size = 96;
                Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bmp);
                d.setBounds(0, 0, size, size);
                d.draw(canvas);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
                return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void launch(final String pkg) {
            runOnUiThread(() -> {
                try {
                    Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
                    if (i != null) {
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i);
                    }
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void pickWallpaper() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_SET_WALLPAPER);
                    startActivity(Intent.createChooser(i, "Wallpaper"));
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void homeSettings() {
            runOnUiThread(MainActivity.this::openHomeSwitch);
        }

        @JavascriptInterface
        public void startScreenShare(final String code, final String name) {
            runOnUiThread(() -> {
                pendingCode = code;
                pendingName = name;
                MediaProjectionManager mpm =
                        (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
                startActivityForResult(mpm.createScreenCaptureIntent(), REQ_PROJECTION);
            });
        }

        @JavascriptInterface
        public void stopScreenShare() {
            stopService(new Intent(MainActivity.this, ShareService.class));
            ShareService.lastStatusJson = "{}";
        }

        @JavascriptInterface
        public void setKeepAwake(final boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public String shareState() {
            return ShareService.lastStatusJson;
        }
    }
}
