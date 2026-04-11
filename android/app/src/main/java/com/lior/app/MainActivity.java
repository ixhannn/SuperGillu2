package com.lior.app;

import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
}
