package com.saferoute.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.telephony.SmsManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * SafeRoute Hardware Button Emergency Guard & Continuous Live Location Dispatcher.
 *
 * Key Capabilities:
 * 1. Physical Power Button SOS: Toggling screen on/off 2 or 3 times triggers emergency alert while locked.
 * 2. Silent Hardware Trigger: Dispatches emergency SMS & cloud sync without sounding the audible siren.
 * 3. Accurate GPS Engine: Verifies freshness of coordinates and obtains best available GPS lock.
 * 4. Continuous Live Tracking: Sends periodic location update SMS while emergency session is active.
 * 5. Structured Alert Headers: Prefixes messages with [SAFEROUTE-SOS] for receiver app siren triggers.
 * 6. Dual-Sync Cloud Backup: Non-blocking background sync to Spring Boot REST backend.
 */
public class HardwareTriggerService extends Service {
    private static final String TAG = "HardwareTriggerService";

    public static final String ACTION_STOP_SOS = "com.saferoute.app.ACTION_STOP_SOS";
    public static final String ACTION_TRIGGER_SOS = "com.saferoute.app.ACTION_TRIGGER_SOS";

    private static final String CHANNEL_GUARD_ID = "SafeRouteHardwareGuardChannel";
    private static final String CHANNEL_EMERGENCY_ID = "SafeRouteActiveEmergencyChannel";
    private static final int GUARD_NOTIF_ID = 9111;
    private static final int EMERGENCY_NOTIF_ID = 9112;

    private BroadcastReceiver hardwareReceiver;
    private LocationListener locationListener;
    public static volatile Location currentBestLocation = null;

    private long lastPowerPressTime = 0;
    private int powerPressCount = 0;
    private long lastVolumePressTime = 0;
    private int volumePressCount = 0;
    private long lastSosTriggerTime = 0;

    private static final long POWER_PRESS_WINDOW_MS = 3800;  // 3.8s window for rapid power presses
    private static final long VOLUME_PRESS_WINDOW_MS = 3500; // 3.5s window for rapid volume presses
    private static final long SOS_COOLDOWN_MS = 4000;        // 4s cooldown between consecutive triggers

    // Active Emergency Live Location Session State
    private static volatile boolean isEmergencySessionActive = false;
    private static volatile Location lastSentLocation = null;
    private static Handler liveTrackingHandler = null;
    private static Runnable liveTrackingRunnable = null;
    private static int liveUpdateCount = 0;
    private static final int MAX_LIVE_UPDATES = 6;              // Cap updates to avoid exhausting SMS quota
    private static final long LIVE_UPDATE_INTERVAL_MS = 180000; // 3 minutes between periodic updates

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels();
        startForegroundGuard();
        initLocationListener();
        registerHardwareTriggerReceiver();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                // Guard channel (low importance, quiet ongoing badge)
                NotificationChannel guardChannel = new NotificationChannel(
                        CHANNEL_GUARD_ID,
                        "Hardware Button Safety Guard",
                        NotificationManager.IMPORTANCE_LOW
                );
                guardChannel.setDescription("Monitors power button gestures for emergency SOS dispatch");
                manager.createNotificationChannel(guardChannel);

                // Active Emergency channel (high priority heads-up notification)
                NotificationChannel emergencyChannel = new NotificationChannel(
                        CHANNEL_EMERGENCY_ID,
                        "Active Emergency SOS Tracking",
                        NotificationManager.IMPORTANCE_HIGH
                );
                emergencyChannel.setDescription("Shows active live location sharing status and cancellation button");
                manager.createNotificationChannel(emergencyChannel);
            }
        }
    }

    private void startForegroundGuard() {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, openAppIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        SharedPreferences prefs = getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
        int threshold = prefs.getInt("power_press_threshold", 3);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_GUARD_ID)
                .setContentTitle("🛡️ SafeRoute Hardware Guard Active")
                .setContentText("Press Power button " + threshold + " times quickly for Silent SOS SMS dispatch")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(pendingIntent)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(GUARD_NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(GUARD_NOTIF_ID, notification);
        }
    }

    private void initLocationListener() {
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return;

            locationListener = new LocationListener() {
                @Override
                public void onLocationChanged(Location location) {
                    if (location != null) {
                        currentBestLocation = location;
                        try {
                            SharedPreferences prefs = getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
                            prefs.edit()
                                    .putString("last_known_lat", String.valueOf(location.getLatitude()))
                                    .putString("last_known_lng", String.valueOf(location.getLongitude()))
                                    .putLong("last_known_time", location.getTime())
                                    .apply();
                        } catch (Exception ignored) {}
                    }
                }
                @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
                @Override public void onProviderEnabled(String provider) {}
                @Override public void onProviderDisabled(String provider) {}
            };

            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1500, 2, locationListener);
                }
                if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                    lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000, 2, locationListener);
                }

                Location lastGps = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                Location lastNet = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
                if (lastGps != null) {
                    currentBestLocation = lastGps;
                } else if (lastNet != null) {
                    currentBestLocation = lastNet;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Location listener init error: " + e.getMessage());
        }
    }

    private void registerHardwareTriggerReceiver() {
        hardwareReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent != null ? intent.getAction() : null;
                if (Intent.ACTION_SCREEN_ON.equals(action) || Intent.ACTION_SCREEN_OFF.equals(action)) {
                    long now = System.currentTimeMillis();

                    // Cooldown guard to prevent repeated rapid alerts from a single gesture
                    if (now - lastSosTriggerTime < SOS_COOLDOWN_MS) {
                        powerPressCount = 0;
                        return;
                    }

                    if (now - lastPowerPressTime <= POWER_PRESS_WINDOW_MS) {
                        powerPressCount++;
                    } else {
                        powerPressCount = 1;
                    }
                    lastPowerPressTime = now;

                    SharedPreferences prefs = context.getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
                    int requiredPresses = prefs.getInt("power_press_threshold", 3);
                    if (requiredPresses < 2) requiredPresses = 2;

                    Log.d(TAG, "Power button toggle: " + powerPressCount + " / " + requiredPresses);

                    if (powerPressCount >= requiredPresses) {
                        powerPressCount = 0;
                        lastSosTriggerTime = now;

                        // Distinct Morse code SOS haptic feedback (... --- ...)
                        vibrateSosPattern(context);

                        // Initiate Immediate Hardware SOS
                        handleEmergencyTrigger(context);
                    }
                } else if ("android.media.VOLUME_CHANGED_ACTION".equals(action)) {
                    long now = System.currentTimeMillis();

                    if (now - lastSosTriggerTime < SOS_COOLDOWN_MS) {
                        volumePressCount = 0;
                        return;
                    }

                    if (now - lastVolumePressTime <= VOLUME_PRESS_WINDOW_MS) {
                        volumePressCount++;
                    } else {
                        volumePressCount = 1;
                    }
                    lastVolumePressTime = now;

                    SharedPreferences prefs = context.getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
                    int requiredPresses = prefs.getInt("power_press_threshold", 3);
                    if (requiredPresses < 2) requiredPresses = 2;

                    Log.d(TAG, "Volume button toggle: " + volumePressCount + " / " + requiredPresses);

                    if (volumePressCount >= requiredPresses) {
                        volumePressCount = 0;
                        lastSosTriggerTime = now;

                        vibrateSosPattern(context);
                        handleEmergencyTrigger(context);
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction("android.media.VOLUME_CHANGED_ACTION");
        registerReceiver(hardwareReceiver, filter);
    }

    /**
     * Vibrate distinct SOS pattern: ... --- ... (Morse Code)
     */
    private static void vibrateSosPattern(Context context) {
        try {
            Vibrator v = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) {
                // ... --- ... (short=150ms, long=350ms)
                long[] pattern = {0, 150, 100, 150, 100, 150, 250, 350, 100, 350, 100, 350, 250, 150, 100, 150, 100, 150};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createWaveform(pattern, -1));
                } else {
                    v.vibrate(pattern, -1);
                }
            }
        } catch (Exception ignored) {}
    }

    /**
     * Entry point when an emergency SOS is triggered (via hardware button or in-app trigger)
     */
    public static void handleEmergencyTrigger(Context context) {
        isEmergencySessionActive = true;
        liveUpdateCount = 0;

        // 1. Send the primary high-accuracy SOS SMS immediately
        sendEmergencyLocationSMS(context, false);

        // 2. Audible siren is strictly manual via the Siren button - NOT triggered by hardware SOS
        // (Siren remains independent and is only activated when user manually taps Siren button)

        // 3. Display the ongoing Active Emergency notification with "I am safe" action
        showActiveEmergencyNotification(context);

        // 4. Start continuous live location tracking updates
        startLiveTrackingSession(context);

        // 5. Background cloud sync to Spring Boot REST backend
        syncSosToBackend(context);
    }

    /**
     * Automatically triggers loud siren alarm if user has siren enabled in settings
     */
    private static void playSirenIfConfigured(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
            boolean sirenEnabled = prefs.getBoolean("siren_on_hardware_sos", true);
            if (sirenEnabled) {
                Intent sirenIntent = new Intent(context, SirenService.class);
                sirenIntent.setAction(SirenService.ACTION_START_SIREN);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(sirenIntent);
                } else {
                    context.startService(sirenIntent);
                }
                Log.i(TAG, "Audible Siren started on emergency hardware trigger");
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not start SirenService on SOS: " + e.getMessage());
        }
    }

    /**
     * Helper to safely obtain SmsManager across Android versions
     */
    private static SmsManager getSafeSmsManager(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                SmsManager manager = context.getSystemService(SmsManager.class);
                if (manager != null) return manager;
            } catch (Exception ignored) {}
        }
        return SmsManager.getDefault();
    }

    /**
     * Displays a persistent high-priority notification allowing user to stop live tracking.
     */
    private static void showActiveEmergencyNotification(Context context) {
        try {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            // Stop SOS action
            Intent stopIntent = new Intent(context, HardwareTriggerService.class);
            stopIntent.setAction(ACTION_STOP_SOS);
            PendingIntent stopPi = PendingIntent.getService(
                    context, 2, stopIntent,
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
            );

            // Open app action
            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent openPi = PendingIntent.getActivity(
                    context, 0, openIntent,
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
            );

            Notification notification = new NotificationCompat.Builder(context, CHANNEL_EMERGENCY_ID)
                    .setContentTitle("🚨 SafeRoute SOS Live Tracking Active")
                    .setContentText("Emergency SMS dispatched. Sharing ongoing GPS location updates.")
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setOngoing(true)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setContentIntent(openPi)
                    .addAction(android.R.drawable.ic_menu_close_clear_cancel, "✅ I Am Safe (Stop SOS)", stopPi)
                    .build();

            manager.notify(EMERGENCY_NOTIF_ID, notification);
        } catch (Exception e) {
            Log.e(TAG, "Failed posting active emergency notification: " + e.getMessage());
        }
    }

    /**
     * Starts continuous periodic live location updates while emergency session is active.
     */
    private static void startLiveTrackingSession(final Context context) {
        stopLiveTrackingSession(); // Clear any existing runner

        liveTrackingHandler = new Handler(Looper.getMainLooper());
        liveTrackingRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isEmergencySessionActive) return;

                liveUpdateCount++;
                if (liveUpdateCount <= MAX_LIVE_UPDATES) {
                    // Send periodic live GPS update if user has moved significantly or every interval
                    sendEmergencyLocationSMS(context, true);

                    // Schedule next update
                    if (liveTrackingHandler != null && isEmergencySessionActive) {
                        liveTrackingHandler.postDelayed(this, LIVE_UPDATE_INTERVAL_MS);
                    }
                } else {
                    // Max updates reached, keep guard active but stop repeated SMS
                    Log.i(TAG, "Max live SOS SMS updates reached (" + MAX_LIVE_UPDATES + ").");
                }
            }
        };

        // Post first update after LIVE_UPDATE_INTERVAL_MS
        liveTrackingHandler.postDelayed(liveTrackingRunnable, LIVE_UPDATE_INTERVAL_MS);
    }

    public static void stopLiveTrackingSession() {
        if (liveTrackingHandler != null && liveTrackingRunnable != null) {
            liveTrackingHandler.removeCallbacks(liveTrackingRunnable);
        }
        liveTrackingHandler = null;
        liveTrackingRunnable = null;
    }

    /**
     * Cancels active emergency session and sends optional safe status.
     */
    public static void cancelEmergencySession(Context context) {
        isEmergencySessionActive = false;
        stopLiveTrackingSession();

        // Stop Siren immediately if sounding
        try {
            Intent stopSiren = new Intent(context, SirenService.class);
            stopSiren.setAction(SirenService.ACTION_STOP_SIREN);
            context.startService(stopSiren);
        } catch (Exception ignored) {}

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancel(EMERGENCY_NOTIF_ID);
        }

        // Send resolution SMS to emergency contacts
        sendResolutionSMS(context);
    }

    /**
     * Obtains the most accurate fresh location and dispatches SMS.
     * @param isPeriodicUpdate true if this is a follow-up periodic tracking update
     */
    public static void sendEmergencyLocationSMS(Context context, boolean isPeriodicUpdate) {
        try {
            // 1. Fetch recipients
            List<String> recipients = getRecipients(context);
            if (recipients.isEmpty()) {
                Log.w(TAG, "No emergency contacts configured.");
                showNoContactsAlert(context);
                return;
            }

            // 2. Acquire freshest available GPS location
            Location loc = getFreshestLocation(context);

            double lat = 0.0;
            double lng = 0.0;
            float accuracy = 0.0f;
            boolean hasCoordinates = false;
            boolean isLive = false;

            if (loc != null) {
                lat = loc.getLatitude();
                lng = loc.getLongitude();
                accuracy = loc.getAccuracy();
                long ageMs = System.currentTimeMillis() - loc.getTime();
                isLive = (ageMs < 120000); // Fresh if under 2 minutes old
                hasCoordinates = (lat != 0.0 || lng != 0.0);
            }

            // 3. Check if location has actually changed for periodic updates
            if (isPeriodicUpdate && lastSentLocation != null && loc != null) {
                float distMoved = loc.distanceTo(lastSentLocation);
                if (distMoved < 40.0f) {
                    Log.i(TAG, "User has moved only " + distMoved + "m. Skipping redundant update SMS.");
                    return;
                }
            }

            if (loc != null) {
                lastSentLocation = new Location(loc);
            }

            // 4. Construct standardized emergency message
            String gmapsLink = hasCoordinates
                    ? String.format(Locale.US, "https://maps.google.com/?q=%.6f,%.6f", lat, lng)
                    : "(Acquiring GPS fix...)";

            String header = isPeriodicUpdate ? "[SAFEROUTE-UPDATE]" : "[SAFEROUTE-SOS]";
            String accuracyText = hasCoordinates && accuracy > 0 ? String.format(Locale.US, " (±%dm accuracy)", Math.round(accuracy)) : "";
            String statusText = isLive ? "LIVE GPS" : "LAST KNOWN GPS";

            String message;
            if (isPeriodicUpdate) {
                message = String.format(Locale.US,
                        "%s 🚨 Updated Location: %s%s [%s]. Sent via SafeRoute.",
                        header, gmapsLink, accuracyText, statusText);
            } else {
                message = String.format(Locale.US,
                        "%s 🚨 EMERGENCY SOS! I need immediate help. My %s is: %s%s. Sent via SafeRoute.",
                        header, statusText, gmapsLink, accuracyText);
            }

            // 5. Verify SEND_SMS permission
            boolean hasSmsPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) == PackageManager.PERMISSION_GRANTED;
            if (!hasSmsPermission) {
                Log.e(TAG, "SEND_SMS permission not granted. Launching interactive SMS fallback & showing permission alert.");
                showPermissionAlert(context);
                openSmsAppFallback(context, recipients, message);
                return;
            }

            // 6. Send SMS to all registered contacts
            SmsManager smsManager = getSafeSmsManager(context);
            ArrayList<String> parts = smsManager.divideMessage(message);

            for (String phone : recipients) {
                try {
                    if (parts.size() > 1) {
                        smsManager.sendMultipartTextMessage(phone, null, parts, null, null);
                    } else {
                        smsManager.sendTextMessage(phone, null, message, null, null);
                    }
                    Log.i(TAG, "Dispatched SOS SMS to: " + phone + " [Header: " + header + "]");
                } catch (Exception smsEx) {
                    Log.e(TAG, "Failed sending background SMS to " + phone + " (" + smsEx.getMessage() + "). Opening native SMS fallback.");
                    openSmsAppFallback(context, recipients, message);
                    break;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error in sendEmergencyLocationSMS: " + e.getMessage(), e);
        }
    }

    /**
     * Fallback to open device SMS composer when background sending is restricted by phone OS
     */
    public static void openSmsAppFallback(Context context, List<String> recipients, String message) {
        try {
            String phone = (recipients != null && !recipients.isEmpty()) ? recipients.get(0) : "";
            android.net.Uri uri = android.net.Uri.parse("smsto:" + phone);
            Intent intent = new Intent(Intent.ACTION_SENDTO, uri);
            intent.putExtra("sms_body", message);
            intent.putExtra(Intent.EXTRA_TEXT, message);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            context.startActivity(intent);
            Log.i(TAG, "Opened fallback native SMS composer for: " + phone);
        } catch (Exception e) {
            Log.e(TAG, "Could not open fallback SMS composer: " + e.getMessage());
        }
    }

    /**
     * Sends resolution SMS when user cancels emergency mode.
     */
    private static void sendResolutionSMS(Context context) {
        try {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) return;
            List<String> recipients = getRecipients(context);
            if (recipients.isEmpty()) return;

            String safeMsg = "[SAFEROUTE-SAFE] ✅ EMERGENCY RESOLVED: I am now safe. The SafeRoute distress session has ended. Thank you!";
            SmsManager smsManager = getSafeSmsManager(context);
            ArrayList<String> parts = smsManager.divideMessage(safeMsg);

            for (String phone : recipients) {
                try {
                    if (parts.size() > 1) {
                        smsManager.sendMultipartTextMessage(phone, null, parts, null, null);
                    } else {
                        smsManager.sendTextMessage(phone, null, safeMsg, null, null);
                    }
                } catch (Exception ignored) {}
            }
        } catch (Exception ignored) {}
    }

    /**
     * Evaluates location from live listener, GPS provider, Network provider, and preferences.
     * Returns the freshest and most accurate location available.
     */
    private static Location getFreshestLocation(Context context) {
        Location best = currentBestLocation;

        try {
            LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            if (lm != null && ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                Location gps = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                Location net = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);

                if (isBetterLocation(gps, best)) {
                    best = gps;
                }
                if (isBetterLocation(net, best)) {
                    best = net;
                }
            }
        } catch (SecurityException ignored) {}

        // Fallback to cached SharedPreferences
        if (best == null) {
            try {
                SharedPreferences prefs = context.getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
                if (prefs.contains("last_known_lat") && prefs.contains("last_known_lng")) {
                    Location cached = new Location("cached");
                    cached.setLatitude(Double.parseDouble(prefs.getString("last_known_lat", "0")));
                    cached.setLongitude(Double.parseDouble(prefs.getString("last_known_lng", "0")));
                    cached.setTime(prefs.getLong("last_known_time", System.currentTimeMillis() - 3600000));
                    if (cached.getLatitude() != 0.0 || cached.getLongitude() != 0.0) {
                        best = cached;
                    }
                }
            } catch (Exception ignored) {}
        }

        return best;
    }

    private static boolean isBetterLocation(Location candidate, Location currentBest) {
        if (candidate == null) return false;
        if (currentBest == null) return true;

        long timeDiff = candidate.getTime() - currentBest.getTime();
        boolean isSignificantlyNewer = timeDiff > 60000;
        boolean isSignificantlyOlder = timeDiff < -60000;
        boolean isNewer = timeDiff > 0;

        if (isSignificantlyNewer) return true;
        if (isSignificantlyOlder) return false;

        int accuracyDiff = (int) (candidate.getAccuracy() - currentBest.getAccuracy());
        boolean isLessAccurate = accuracyDiff > 0;
        boolean isMoreAccurate = accuracyDiff < 0;

        if (isMoreAccurate) return true;
        if (isNewer && !isLessAccurate) return true;

        return false;
    }

    private static List<String> getRecipients(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
        String primaryPhone = prefs.getString("emergency_contact_phone", null);
        String allPhones = prefs.getString("emergency_contact_phones", null);

        List<String> recipients = new ArrayList<>();
        if (allPhones != null && !allPhones.trim().isEmpty()) {
            for (String p : allPhones.split(",")) {
                String clean = p.replaceAll("[^0-9+]", "").trim();
                if (!clean.isEmpty() && !recipients.contains(clean)) {
                    recipients.add(clean);
                }
            }
        }
        if (primaryPhone != null && !primaryPhone.trim().isEmpty()) {
            String cleanPrimary = primaryPhone.replaceAll("[^0-9+]", "").trim();
            if (!cleanPrimary.isEmpty() && !recipients.contains(cleanPrimary)) {
                recipients.add(cleanPrimary);
            }
        }
        return recipients;
    }

    /**
     * Non-blocking background sync to Spring Boot REST backend (/api/sos/alerts)
     */
    private static void syncSosToBackend(final Context context) {
        new Thread(() -> {
            try {
                Location loc = getFreshestLocation(context);
                double lat = loc != null ? loc.getLatitude() : 0.0;
                double lng = loc != null ? loc.getLongitude() : 0.0;
                if (lat == 0.0 && lng == 0.0) return;

                URL url = new URL("http://10.0.2.2:8080/api/sos/alerts"); // 10.0.2.2 for Android emulator or localhost
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; utf-8");
                conn.setConnectTimeout(3000);
                conn.setReadTimeout(3000);
                conn.setDoOutput(true);

                String jsonInput = String.format(Locale.US, "{\"lat\":%.6f,\"lng\":%.6f,\"note\":\"Hardware SOS Button Trigger\"}", lat, lng);
                try (OutputStream os = conn.getOutputStream()) {
                    byte[] input = jsonInput.getBytes(StandardCharsets.UTF_8);
                    os.write(input, 0, input.length);
                }

                int code = conn.getResponseCode();
                Log.d(TAG, "Backend SOS sync response code: " + code);
                conn.disconnect();
            } catch (Exception e) {
                // Non-critical: network might be off during emergency, SMS is the primary lifeline
                Log.d(TAG, "Backend sync notice (offline or unreachable): " + e.getMessage());
            }
        }).start();
    }

    private static void showPermissionAlert(Context context) {
        try {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                Intent intent = new Intent(context, MainActivity.class);
                intent.putExtra("open_sms_permission", true);
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                PendingIntent pi = PendingIntent.getActivity(context, 0, intent, Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

                Intent settingsIntent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                settingsIntent.setData(android.net.Uri.fromParts("package", context.getPackageName(), null));
                settingsIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                PendingIntent settingsPi = PendingIntent.getActivity(context, 1, settingsIntent, Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

                Notification notif = new NotificationCompat.Builder(context, CHANNEL_GUARD_ID)
                        .setContentTitle("⚠️ SafeRoute: SMS Permission Blocked")
                        .setContentText("Tap here to allow SMS permission so SOS alerts can be dispatched automatically.")
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setPriority(NotificationCompat.PRIORITY_MAX)
                        .setContentIntent(pi)
                        .addAction(android.R.drawable.ic_menu_preferences, "Open Settings", settingsPi)
                        .setAutoCancel(true)
                        .build();
                manager.notify(GUARD_NOTIF_ID + 2, notif);
            }
        } catch (Exception ignored) {}
    }

    private static void showNoContactsAlert(Context context) {
        try {
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                Intent intent = new Intent(context, MainActivity.class);
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                PendingIntent pi = PendingIntent.getActivity(context, 0, intent, Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

                Notification notif = new NotificationCompat.Builder(context, CHANNEL_GUARD_ID)
                        .setContentTitle("⚠️ SafeRoute: No Emergency Contacts")
                        .setContentText("Tap here to configure emergency contacts in SafeRoute.")
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setContentIntent(pi)
                        .setAutoCancel(true)
                        .build();
                manager.notify(GUARD_NOTIF_ID + 3, notif);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_TRIGGER_SOS.equals(action)) {
                vibrateSosPattern(this);
                handleEmergencyTrigger(this);
            } else if (ACTION_STOP_SOS.equals(action)) {
                cancelEmergencySession(this);
            }
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopLiveTrackingSession();
        if (locationListener != null) {
            try {
                LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
                if (lm != null) lm.removeUpdates(locationListener);
            } catch (Exception ignored) {}
            locationListener = null;
        }

        if (hardwareReceiver != null) {
            try {
                unregisterReceiver(hardwareReceiver);
            } catch (Exception ignored) {}
            hardwareReceiver = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
