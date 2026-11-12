package online.dainn.parkvision;

import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String FILE_PROVIDER_SUFFIX = ".fileprovider";
    private static final String APK_DIRECTORY = "updates";
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 60_000;
    private static final int BUFFER_SIZE = 32 * 1024;
    private static final String ALLOWED_DOWNLOAD_HOST = "s3-parking.dainn.online";
    // The driver APK is a few MB; refuse anything near the server's upload cap
    // instead of filling the device before the checksum can be compared.
    private static final long MAX_APK_BYTES = 200L * 1024 * 1024;

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("versionName", BuildConfig.VERSION_NAME);
        result.put("versionCode", BuildConfig.VERSION_CODE);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("downloadUrl");
        String expectedSha256 = call.getString("sha256");
        if (!isAllowedDownload(downloadUrl) || !isSha256(expectedSha256)) {
            call.reject("Invalid update download");
            return;
        }
        new Thread(() -> {
            try {
                File apk = download(downloadUrl, expectedSha256);
                getActivity().runOnUiThread(() -> openInstaller(apk));
                call.resolve();
            } catch (Exception error) {
                call.reject("Update download failed", error);
            }
        }).start();
    }

    private static boolean isSha256(String value) {
        return value != null && value.matches("[0-9a-fA-F]{64}");
    }

    private static boolean isAllowedDownload(String value) {
        try {
            URI uri = URI.create(value);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && ALLOWED_DOWNLOAD_HOST.equalsIgnoreCase(uri.getHost())
                    && uri.getUserInfo() == null
                    && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (IllegalArgumentException error) {
            return false;
        }
    }

    private File download(String downloadUrl, String expectedSha256) throws Exception {
        File directory = new File(getContext().getCacheDir(), APK_DIRECTORY);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("Cannot create update cache directory");
        }
        File output = new File(directory, "parkvision-update.apk");
        // A previous run may have left a verified or partial APK behind.
        //noinspection ResultOfMethodCallIgnored
        output.delete();
        HttpURLConnection connection = (HttpURLConnection) new URL(downloadUrl).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(false);
        try {
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                throw new IOException("Update server returned HTTP " + status);
            }
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long total = 0;
            try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
                 FileOutputStream outputStream = new FileOutputStream(output)) {
                byte[] buffer = new byte[BUFFER_SIZE];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > MAX_APK_BYTES) {
                        throw new IOException("Update file is larger than expected");
                    }
                    digest.update(buffer, 0, count);
                    outputStream.write(buffer, 0, count);
                }
            } catch (IOException error) {
                //noinspection ResultOfMethodCallIgnored
                output.delete();
                throw error;
            }
            String actual = toHex(digest.digest());
            if (!actual.equalsIgnoreCase(expectedSha256)) {
                // Never leave an unverified APK in the cache.
                //noinspection ResultOfMethodCallIgnored
                output.delete();
                throw new IOException("Update checksum mismatch");
            }
            return output;
        } finally {
            connection.disconnect();
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            result.append(String.format(Locale.ROOT, "%02x", value));
        }
        return result.toString();
    }

    private void openInstaller(File apk) {
        String authority = getContext().getPackageName() + FILE_PROVIDER_SUFFIX;
        Uri uri = FileProvider.getUriForFile(getContext(), authority, apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }
}
