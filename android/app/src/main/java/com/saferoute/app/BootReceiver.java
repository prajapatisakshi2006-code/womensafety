package com.saferoute.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Automatically starts the SafeRoute HardwareTriggerService when the device boots up.
 * This ensures the power button SOS trigger works even after a phone reboot without
 * requiring the user to open the app first.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "SafeRouteBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Log.i(TAG, "Device boot completed. Initializing SafeRoute HardwareTriggerService...");
            try {
                Intent serviceIntent = new Intent(context, HardwareTriggerService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to start HardwareTriggerService on boot: " + e.getMessage(), e);
            }
        }
    }
}
