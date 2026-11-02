package com.saferoute.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Location;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeSiren")
public class NativeSirenPlugin extends Plugin {

    @PluginMethod
    public void setEmergencyContact(PluginCall call) {
        String phone = call.getString("phone");
        if (phone != null) {
            SharedPreferences prefs = getContext().getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
            prefs.edit().putString("emergency_contact_phone", phone).apply();
        }
        call.resolve();
    }

    @PluginMethod
    public void setEmergencyContacts(PluginCall call) {
        String phones = call.getString("phones");
        if (phones != null) {
            SharedPreferences prefs = getContext().getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
            prefs.edit().putString("emergency_contact_phones", phones).apply();
        }
        call.resolve();
    }

    @PluginMethod
    public void setPowerPressThreshold(PluginCall call) {
        Integer count = call.getInt("count");
        if (count != null && (count == 2 || count == 3)) {
            SharedPreferences prefs = getContext().getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
            prefs.edit().putInt("power_press_threshold", count).apply();
        }
        call.resolve();
    }

    @PluginMethod
    public void setHardwareSirenEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", true);
        SharedPreferences prefs = getContext().getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
        prefs.edit().putBoolean("siren_on_hardware_sos", enabled != null ? enabled : true).apply();
        call.resolve();
    }

    @PluginMethod
    public void setUserLoggedIn(PluginCall call) {
        Boolean isLoggedIn = call.getBoolean("isLoggedIn", false);
        String email = call.getString("email", "");
        SharedPreferences prefs = getContext().getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
        prefs.edit()
            .putBoolean("is_user_logged_in", isLoggedIn != null ? isLoggedIn : false)
            .putString("user_email", email != null ? email : "")
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void setLastKnownLocation(PluginCall call) {
        Double lat = call.getDouble("lat");
        Double lng = call.getDouble("lng");
        if (lat != null && lng != null) {
            SharedPreferences prefs = getContext().getSharedPreferences("SafeRoutePrefs", Context.MODE_PRIVATE);
            prefs.edit()
                .putString("last_known_lat", String.valueOf(lat))
                .putString("last_known_lng", String.valueOf(lng))
                .putLong("last_known_time", System.currentTimeMillis())
                .apply();
        }
        call.resolve();
    }

    @PluginMethod
    public void sendEmergencyLocationSMS(PluginCall call) {
        try {
            // Trigger emergency SOS session and SMS dispatch
            HardwareTriggerService.handleEmergencyTrigger(getContext());
            JSObject ret = new JSObject();
            ret.put("status", "sent");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to dispatch emergency SMS: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopLiveTracking(PluginCall call) {
        try {
            HardwareTriggerService.cancelEmergencySession(getContext());
            JSObject ret = new JSObject();
            ret.put("status", "stopped");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to stop live tracking: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getNativeLocation(PluginCall call) {
        Location loc = HardwareTriggerService.currentBestLocation;
        if (loc == null) {
            try {
                android.location.LocationManager lm = (android.location.LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
                if (lm != null) {
                    loc = lm.getLastKnownLocation(android.location.LocationManager.GPS_PROVIDER);
                    if (loc == null) {
                        loc = lm.getLastKnownLocation(android.location.LocationManager.NETWORK_PROVIDER);
                    }
                }
            } catch (Exception ignored) {}
        }
        if (loc != null) {
            JSObject ret = new JSObject();
            ret.put("lat", loc.getLatitude());
            ret.put("lng", loc.getLongitude());
            ret.put("accuracy", (double) loc.getAccuracy());
            ret.put("time", loc.getTime());
            call.resolve(ret);
        } else {
            call.reject("Location not yet locked");
        }
    }

    @PluginMethod
    public void startSiren(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), SirenService.class);
            intent.setAction(SirenService.ACTION_START_SIREN);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            JSObject ret = new JSObject();
            ret.put("status", "started");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to start native siren: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopSiren(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), SirenService.class);
            intent.setAction(SirenService.ACTION_STOP_SIREN);
            getContext().startService(intent);
            JSObject ret = new JSObject();
            ret.put("status", "stopped");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to stop native siren: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkSmsPermission(PluginCall call) {
        boolean granted = androidx.core.content.ContextCompat.checkSelfPermission(
                getContext(), android.Manifest.permission.SEND_SMS) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestSmsPermission(PluginCall call) {
        boolean granted = androidx.core.content.ContextCompat.checkSelfPermission(
                getContext(), android.Manifest.permission.SEND_SMS) == android.content.pm.PackageManager.PERMISSION_GRANTED;
        if (granted) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        } else {
            if (getActivity() != null) {
                androidx.core.app.ActivityCompat.requestPermissions(
                        getActivity(),
                        new String[]{android.Manifest.permission.SEND_SMS, android.Manifest.permission.READ_PHONE_STATE},
                        8802
                );
            }
            JSObject ret = new JSObject();
            ret.put("requested", true);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open settings: " + e.getMessage());
        }
    }
}
