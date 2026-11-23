package com.huangguo.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.huangguo.app.plugins.Media3PlayerPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(Media3PlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
