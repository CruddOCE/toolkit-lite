package com.example.navapp;

import android.os.Bundle;
import com.example.navapp.car.NavStatePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins must be registered before the bridge starts.
        registerPlugin(NavStatePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
