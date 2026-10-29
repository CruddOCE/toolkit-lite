package com.example.navapp.car;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.Distance;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.Template;
import androidx.car.app.navigation.NavigationManager;
import androidx.car.app.navigation.model.Maneuver;
import androidx.car.app.navigation.model.NavigationTemplate;
import androidx.car.app.navigation.model.RoutingInfo;
import androidx.car.app.navigation.model.Step;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;

// The car screen. It shows the phone's next instruction and distance using
// Google's navigation template, which is the only layout a navigation app may
// show while driving. Without a route it shows a message instead.
public class NavScreen extends Screen implements NavState.Listener {

    public NavScreen(@NonNull CarContext carContext) {
        super(carContext);
        NavState.addListener(this);
        getLifecycle().addObserver(new DefaultLifecycleObserver() {
            @Override
            public void onDestroy(@NonNull LifecycleOwner owner) {
                NavState.removeListener(NavScreen.this);
            }
        });
    }

    @Override
    public void onChanged() {
        invalidate();
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        if (!NavState.isActive()) {
            return new MessageTemplate.Builder("Start a route on your phone to see directions here.")
                    .setTitle("navapp")
                    .setHeaderAction(Action.APP_ICON)
                    .build();
        }

        getCarContext().getCarService(NavigationManager.class).navigationStarted();

        Step step = new Step.Builder(NavState.getInstruction())
                .setManeuver(new Maneuver.Builder(Maneuver.TYPE_UNKNOWN).build())
                .build();
        RoutingInfo routing = new RoutingInfo.Builder()
                .setCurrentStep(step, Distance.create(NavState.getDistanceM(), Distance.UNIT_METERS))
                .build();

        return new NavigationTemplate.Builder()
                .setNavigationInfo(routing)
                .build();
    }
}
