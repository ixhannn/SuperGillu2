package com.lior.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/**
 * LiorWidget — bridge the web layer uses to feed {@link PartnerWidgetProvider}.
 *
 * The web layer (services/widget.ts) resolves the partner's latest photo to a
 * base64 data URI + computes days-together, then calls update(...). We decode and
 * DOWNSCALE the image (RemoteViews bitmaps must stay small — the whole widget
 * collection shares a ~1MB Binder transaction), persist it + the numbers, and
 * re-render every placed widget. Mirrors the LiorHaptics plugin pattern.
 */
@CapacitorPlugin(name = "LiorWidget")
public class LiorWidgetPlugin extends Plugin {

    private static final int MAX_EDGE_PX = 480;

    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        if (ctx == null) {
            call.resolve();
            return;
        }
        try {
            int days = call.getInt("days", 0);
            String partnerName = call.getString("partnerName", "");
            String image = call.getString("image", null); // data URI, or null to keep the current one
            boolean clearImage = Boolean.TRUE.equals(call.getBoolean("clearImage", false));

            SharedPreferences.Editor editor = ctx
                .getSharedPreferences(PartnerWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit();
            editor.putInt(PartnerWidgetProvider.KEY_DAYS, days);
            editor.putString(PartnerWidgetProvider.KEY_PARTNER, partnerName);

            if (clearImage) {
                // The partner has no current photo — drop the stale one rather than
                // leaving a ghost of a since-deleted moment on the home screen.
                new File(ctx.getFilesDir(), PartnerWidgetProvider.IMAGE_FILE).delete();
                editor.putBoolean(PartnerWidgetProvider.KEY_HAS_IMAGE, false);
            } else if (image != null && image.length() > 0) {
                editor.putBoolean(PartnerWidgetProvider.KEY_HAS_IMAGE, saveImage(ctx, image));
            }
            editor.apply();

            PartnerWidgetProvider.updateAll(ctx);
        } catch (Exception ignored) {
            // A widget update must never crash the bridge — degrade silently.
        }
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        Context ctx = getContext();
        if (ctx != null) {
            ctx.getSharedPreferences(PartnerWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit().clear().apply();
            new File(ctx.getFilesDir(), PartnerWidgetProvider.IMAGE_FILE).delete();
            PartnerWidgetProvider.updateAll(ctx);
        }
        call.resolve();
    }

    /** Decode a base64 data URI, downscale to <= MAX_EDGE_PX, and save as PNG in filesDir. */
    private boolean saveImage(Context ctx, String dataUri) {
        FileOutputStream out = null;
        try {
            int comma = dataUri.indexOf(',');
            String base64 = comma >= 0 ? dataUri.substring(comma + 1) : dataUri;
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);

            int sample = 1;
            int largerEdge = Math.max(bounds.outWidth, bounds.outHeight);
            while (largerEdge > 0 && (largerEdge / sample) > MAX_EDGE_PX) {
                sample *= 2;
            }

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
            if (bitmap == null) return false;

            File file = new File(ctx.getFilesDir(), PartnerWidgetProvider.IMAGE_FILE);
            out = new FileOutputStream(file);
            bitmap.compress(Bitmap.CompressFormat.PNG, 92, out);
            out.flush();
            bitmap.recycle();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            if (out != null) {
                try { out.close(); } catch (Exception ignored) { }
            }
        }
    }
}
