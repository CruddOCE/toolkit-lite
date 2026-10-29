package com.example.navapp.car;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Lets the web app report navigation state to the car screen:
// NavState.update({ active, instruction, distanceM }) from map.js.
@CapacitorPlugin(name = "NavState")
public class NavStatePlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        String instruction = call.getString("instruction", "");
        Integer distanceM = call.getInt("distanceM", 0);
        NavState.update(active, instruction, distanceM == null ? 0 : distanceM);
        call.resolve(new JSObject());
    }
}
