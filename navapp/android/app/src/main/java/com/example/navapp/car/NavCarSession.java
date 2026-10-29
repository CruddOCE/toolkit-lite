package com.example.navapp.car;

import android.content.Intent;
import androidx.annotation.NonNull;
import androidx.car.app.Screen;
import androidx.car.app.Session;

public class NavCarSession extends Session {

    @NonNull
    @Override
    public Screen onCreateScreen(@NonNull Intent intent) {
        return new NavScreen(getCarContext());
    }
}
