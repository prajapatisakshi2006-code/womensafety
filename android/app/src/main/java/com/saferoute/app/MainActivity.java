package com.saferoute.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQ_CODE = 8801;

    // Volume button emergency trigger detection
    private long lastVolumePressTime = 0;
    private int volumePressCount = 0;
    private static final long VOLUME_PRESS_WINDOW_MS = 3000;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeSirenPlugin.class);
        super.onCreate(savedInstanceState);

        // Allow activity to display over lock screen if awakened
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }

        // Check and request essential emergency permissions
        checkAndRequestPermissions();

        // Check if launched from permission notification
        handleIntent(getIntent());

        // Start background hardware trigger guard service
        startHardwareTriggerService();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("open_sms_permission", false)) {
            showSmsPermissionExplanationDialog();
        }
    }

    private void checkAndRequestPermissions() {
        List<String> needed = new ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.SEND_SMS);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQ_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQ_CODE || requestCode == 8802) {
            boolean smsGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
            if (!smsGranted) {
                showSmsPermissionExplanationDialog();
            }
            startHardwareTriggerService();
        }
    }

    public void showSmsPermissionExplanationDialog() {
        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("⚠️ SMS Permission Required for SOS")
                .setMessage("Your phone is currently not allowing SafeRoute to send SMS.\n\nTo ensure pressing the Power or Volume button immediately dispatches distress texts with your live GPS location, please tap 'Open Settings' and set SMS permission to 'Allow'.")
                .setPositiveButton("Open Settings", (dialog, which) -> {
                    try {
                        Intent intent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        intent.setData(android.net.Uri.fromParts("package", getPackageName(), null));
                        startActivity(intent);
                    } catch (Exception ignored) {}
                })
                .setNegativeButton("Later", null)
                .show();
    }

    private void startHardwareTriggerService() {
        try {
            Intent guardIntent = new Intent(this, HardwareTriggerService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(guardIntent);
            } else {
                startService(guardIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    /**
     * Intercept physical volume buttons (Volume Down & Volume Up) as an auxiliary hardware SOS trigger.
     * Rapidly pressing volume buttons triggers emergency SOS dispatch immediately.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int action = event.getAction();
        int keyCode = event.getKeyCode();

        if (action == KeyEvent.ACTION_DOWN && (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == KeyEvent.KEYCODE_VOLUME_UP)) {
            long now = System.currentTimeMillis();
            if (now - lastVolumePressTime <= VOLUME_PRESS_WINDOW_MS) {
                volumePressCount++;
            } else {
                volumePressCount = 1;
            }
            lastVolumePressTime = now;

            int requiredPresses = getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE)
                    .getInt("power_press_threshold", 3);
            if (requiredPresses < 2) requiredPresses = 2;

            if (volumePressCount >= requiredPresses) {
                volumePressCount = 0;
                // Dispatch Immediate Emergency SOS
                HardwareTriggerService.handleEmergencyTrigger(this);
                return true; // Consume event to prevent accidental volume spam
            }
        }

        return super.dispatchKeyEvent(event);
    }
}
