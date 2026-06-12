package com.lior.app;

import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Receives ACTION_SEND image intents (system share sheet → Lior) and hands
 * the image to the web layer.
 *
 * Cold start: the payload is parked in {@code pendingShare}; the web app
 * pulls it with {@code getPendingShare()} once it has booted.
 * Warm start (app already running): a {@code shareReceived} event is fired
 * at the live WebView in addition to parking the payload.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    /** Hard cap on shared image size pushed across the JS bridge. */
    private static final long MAX_SHARED_BYTES = 15L * 1024 * 1024;

    private static JSObject pendingShare;
    private static ShareTargetPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        JSObject result = pendingShare != null ? pendingShare : new JSObject();
        pendingShare = null;
        call.resolve(result);
    }

    /** Called by MainActivity from onCreate/onNewIntent. */
    static void handleSendIntent(ContentResolver resolver, Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !type.startsWith("image/")) return;
        Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (stream == null) return;

        try (InputStream input = resolver.openInputStream(stream)) {
            if (input == null) return;
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[64 * 1024];
            long total = 0;
            int read;
            while ((read = input.read(chunk)) != -1) {
                total += read;
                if (total > MAX_SHARED_BYTES) return;
                buffer.write(chunk, 0, read);
            }

            String resolvedType = resolver.getType(stream);
            JSObject payload = new JSObject();
            payload.put("mimeType", resolvedType != null ? resolvedType : type);
            payload.put("base64", Base64.encodeToString(buffer.toByteArray(), Base64.NO_WRAP));

            pendingShare = payload;
            if (instance != null && instance.getBridge() != null) {
                instance.notifyListeners("shareReceived", payload);
            }
        } catch (Exception ignored) {
            // A failed share import must never crash the launch path.
        }
    }
}
