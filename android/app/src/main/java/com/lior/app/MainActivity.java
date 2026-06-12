package com.lior.app;

import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Must run before super.onCreate so the bridge knows the plugin.
        registerPlugin(ShareTargetPlugin.class);
        super.onCreate(savedInstanceState);

        // System share sheet → Lior (cold start delivery).
        ShareTargetPlugin.handleSendIntent(getContentResolver(), getIntent());

        configureEdgeToEdgeSystemBars();
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);

        // Keep screen on while app is in foreground (prevents 60fps throttle from
        // idle-detection on some OEMs like Samsung and OnePlus).
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // High refresh rate: pick the display mode with the highest refresh rate.
        // API 23 (Android 6) added Display.Mode and preferredDisplayModeId.
        // On 90/120Hz panels (Pixel 6+, S22+, etc.) this unlocks the higher rate
        // for the WKWebView compositor — without it many devices default to 60fps.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Display display = getWindowManager().getDefaultDisplay();
            Display.Mode[] supportedModes = display.getSupportedModes();
            Display.Mode bestMode = display.getMode(); // current default

            for (Display.Mode mode : supportedModes) {
                if (mode.getRefreshRate() > bestMode.getRefreshRate()) {
                    bestMode = mode;
                }
            }

            WindowManager.LayoutParams params = getWindow().getAttributes();
            params.preferredDisplayModeId = bestMode.getModeId();
            getWindow().setAttributes(params);
        }

        // Android 11+ setFrameRate hint on the window surface. This is a
        // supplementary signal — preferredDisplayModeId above is the primary one.
        // Surface.setFrameRate requires Surface access; the safest approach for
        // Capacitor is to set it via WindowManager (done above). No additional
        // API call needed here.
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // System share sheet → Lior while the app is already running
        // (launchMode is singleTask, so warm shares arrive here).
        ShareTargetPlugin.handleSendIntent(getContentResolver(), intent);
    }

    private void configureEdgeToEdgeSystemBars() {
        Window window = getWindow();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams params = window.getAttributes();
            params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(params);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
        }

        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }

        window.getDecorView().setSystemUiVisibility(flags);
    }
}
