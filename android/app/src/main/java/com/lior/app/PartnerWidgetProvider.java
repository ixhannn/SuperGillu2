package com.lior.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RadialGradient;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.os.Build;
import android.widget.RemoteViews;

import java.io.File;

/**
 * PartnerWidgetProvider — the home-screen widget ("Editorial" design): the partner's
 * latest photo with a soft gradient scrim and an elegant "N / DAYS TOGETHER" count.
 *
 * Everything is composed into ONE bitmap in Java (center-cropped photo → vignette →
 * top + bottom gradient scrims → typeset count with a soft sheen → rounded corners +
 * hairline frame) rather than stacked as RemoteViews. That is the only way to get a
 * smooth multi-stop dithered scrim, letter-spaced light-weight type with a drop
 * shadow, and anti-aliased rounding that renders identically on every launcher. Data
 * is pushed from the web layer through {@link LiorWidgetPlugin}; tapping opens the app.
 */
public class PartnerWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "lior_widget";
    static final String KEY_DAYS = "days";
    static final String KEY_PARTNER = "partnerName";
    static final String KEY_HAS_IMAGE = "hasImage";
    static final String IMAGE_FILE = "widget_partner.png";

    /** Composition resolution. 480² ARGB ≈ 0.9MB — sharp type, under the RemoteViews Binder budget. */
    private static final int TILE_PX = 480;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            renderWidget(context, manager, id);
        }
    }

    /** Re-render every placed instance — called from the JS bridge after data changes. */
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        ComponentName component = new ComponentName(context, PartnerWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        if (ids == null) return;
        for (int id : ids) {
            renderWidget(context, manager, id);
        }
    }

    private static void renderWidget(Context context, AppWidgetManager manager, int id) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.partner_widget);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        int days = prefs.getInt(KEY_DAYS, 0);
        String partnerName = prefs.getString(KEY_PARTNER, "");

        Bitmap shown = null;
        Bitmap photo = null;
        try {
            photo = prefs.getBoolean(KEY_HAS_IMAGE, false) ? decodeImage(context) : null;
            Bitmap comp = buildComposition(context, photo, days);
            Bitmap tile = roundAndFrame(comp);
            if (tile != null) {
                if (comp != null) comp.recycle();
                shown = tile;
            } else {
                shown = comp; // rounding fell through — keep the square composition
            }
        } catch (Throwable t) {
            // A render must never crash the home screen — fall back to the placeholder.
            shown = null;
        } finally {
            if (photo != null && !photo.isRecycled()) photo.recycle();
        }

        if (shown != null) {
            views.setImageViewBitmap(R.id.widget_image, shown);
        } else {
            views.setImageViewResource(R.id.widget_image, R.drawable.widget_placeholder);
        }

        // setCharSequence invokes View.setContentDescription by name — works on every API
        // (RemoteViews.setContentDescription itself only exists on API 31+).
        String desc = days + (days == 1 ? " day" : " days") + " together"
            + (partnerName.isEmpty() ? "" : " with " + partnerName);
        views.setCharSequence(R.id.widget_image, "setContentDescription", desc);

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pending = PendingIntent.getActivity(context, 0, launch, flags);
            views.setOnClickPendingIntent(R.id.widget_root, pending);
        }

        manager.updateAppWidget(id, views);

        // Safe now: updateAppWidget() marshalled the bitmap into the RemoteViews.
        if (shown != null) shown.recycle();
    }

    /**
     * Compose the full tile: photo (or warm placeholder) → vignette → top + bottom
     * gradient scrims → "N" + "DAYS TOGETHER" typeset bottom-left. Square, un-rounded.
     */
    private static Bitmap buildComposition(Context ctx, Bitmap photo, int days) {
        int size = TILE_PX;
        Bitmap comp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(comp);

        if (photo != null) {
            drawCenterCrop(canvas, photo, size);
        } else {
            // Premium empty state: a warm brand-pink wash, not a blank box.
            Paint bg = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.DITHER_FLAG);
            bg.setShader(new LinearGradient(0, 0, size, size, 0xFFF6B9CE, 0xFFE07FA3, Shader.TileMode.CLAMP));
            canvas.drawRect(0, 0, size, size, bg);
        }

        // Edge vignette — frames the photo with a barely-there darkening.
        Paint vignette = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.DITHER_FLAG);
        vignette.setShader(new RadialGradient(size * 0.5f, size * 0.45f, size * 0.75f,
            new int[] { 0x00000000, 0x00000000, 0x33100A0E }, new float[] { 0f, 0.6f, 1f },
            Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, size, size, vignette);

        // A whisper of top scrim — keeps a bright sky from fighting the rounded top edge.
        Paint topScrim = new Paint(Paint.DITHER_FLAG);
        topScrim.setShader(new LinearGradient(0, 0, 0, size * 0.32f,
            new int[] { 0x1F100610, 0x00100610 }, new float[] { 0f, 1f }, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, size, size * 0.32f, topScrim);

        // Bottom scrim — a graceful four-stop rise so the count is always legible.
        Paint scrim = new Paint(Paint.DITHER_FLAG);
        scrim.setShader(new LinearGradient(0, size * 0.30f, 0, size,
            new int[] { 0x00100610, 0x0E100610, 0x42100610, 0xE3100610 },
            new float[] { 0f, 0.42f, 0.72f, 1f }, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, size, size, scrim);

        float padL = size * 0.085f;
        float padB = size * 0.078f;

        // Label: quiet, uppercase, wide tracking — the soft second line.
        Paint labelPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
        labelPaint.setColor(0xB3FFFFFF);
        labelPaint.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        labelPaint.setTextSize(size * 0.042f);
        labelPaint.setLetterSpacing(0.2f);
        labelPaint.setShadowLayer(size * 0.01f, 0f, size * 0.003f, 0x4D000000);
        float labelBaseline = size - padB;
        canvas.drawText("DAYS TOGETHER", padL, labelBaseline, labelPaint);

        // Number: the hero — light weight, tight tracking, a top-down sheen + soft shadow.
        Paint numberPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
        numberPaint.setColor(0xFFFFFFFF);
        numberPaint.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
        numberPaint.setTextSize(size * 0.150f);
        numberPaint.setLetterSpacing(-0.02f);
        numberPaint.setShadowLayer(size * 0.022f, 0f, size * 0.007f, 0x80000000);
        Paint.FontMetrics lm = labelPaint.getFontMetrics();
        Paint.FontMetrics nm = numberPaint.getFontMetrics();
        float labelTop = labelBaseline + lm.ascent;
        float numberBaseline = labelTop - size * 0.022f - nm.descent;
        String num = String.valueOf(days);
        Rect nb = new Rect();
        numberPaint.getTextBounds(num, 0, num.length(), nb);
        numberPaint.setShader(new LinearGradient(0, numberBaseline + nb.top, 0, numberBaseline + nb.bottom,
            0xFFFFFFFF, 0xFFF3E7EC, Shader.TileMode.CLAMP));
        canvas.drawText(num, padL, numberBaseline, numberPaint);

        return comp;
    }

    /** Round the composed tile (anti-aliased) and add a hairline inner frame for a premium edge. */
    private static Bitmap roundAndFrame(Bitmap src) {
        if (src == null) return null;
        int w = src.getWidth();
        int h = src.getHeight();
        if (w <= 0 || h <= 0) return null;
        float radius = Math.min(w, h) * 0.12f;
        Bitmap out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);

        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setShader(new BitmapShader(src, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP));
        canvas.drawRoundRect(new RectF(0, 0, w, h), radius, radius, fill);

        Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
        stroke.setStyle(Paint.Style.STROKE);
        float sw = Math.max(1.5f, w * 0.0032f);
        stroke.setStrokeWidth(sw);
        stroke.setColor(0x1FFFFFFF);
        float inset = sw / 2f;
        canvas.drawRoundRect(new RectF(inset, inset, w - inset, h - inset), radius, radius, stroke);

        return out;
    }

    /** Draw a bitmap into a size×size square, scaled to fill and centered (centerCrop). */
    private static void drawCenterCrop(Canvas canvas, Bitmap bmp, int size) {
        int w = bmp.getWidth();
        int h = bmp.getHeight();
        if (w <= 0 || h <= 0) return;
        float scale = Math.max((float) size / w, (float) size / h);
        float dw = w * scale;
        float dh = h * scale;
        float left = (size - dw) / 2f;
        float top = (size - dh) / 2f;
        Paint p = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.DITHER_FLAG);
        canvas.drawBitmap(bmp, null, new RectF(left, top, left + dw, top + dh), p);
    }

    private static Bitmap decodeImage(Context context) {
        try {
            File file = new File(context.getFilesDir(), IMAGE_FILE);
            if (!file.exists()) return null;
            return BitmapFactory.decodeFile(file.getAbsolutePath());
        } catch (Exception e) {
            return null;
        }
    }
}
