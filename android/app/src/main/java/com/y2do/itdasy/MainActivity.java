package com.y2do.itdasy;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayIntegrityPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
