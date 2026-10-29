package com.example.navapp.car;

import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Session;
import androidx.car.app.validation.HostValidator;

// Entry point Android Auto starts when the app is opened on the car screen.
// Android Auto only accepts navigation apps that declare the NAVIGATION category
// in the manifest (see AndroidManifest.xml).
public class NavCarService extends CarAppService {

    @NonNull
    @Override
    public HostValidator createHostValidator() {
        // Debug build only, so the Desktop Head Unit can connect. A release build
        // must replace this with a validator that lists the Android Auto hosts.
        return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR;
    }

    @NonNull
    @Override
    public Session onCreateSession() {
        return new NavCarSession();
    }
}
