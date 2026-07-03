package com.shounak.flux;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Draw behind system bars (status bar + navigation bar)
        // Content renders edge-to-edge; use env(safe-area-inset-*) in CSS for padding
        EdgeToEdge.enable(this);

        // System bars auto-hide after a moment, reappear on swipe
        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );

        // Make the navigation bar match the app background so it blends in
        getWindow().setNavigationBarColor(android.graphics.Color.parseColor("#181715"));
    }
}
