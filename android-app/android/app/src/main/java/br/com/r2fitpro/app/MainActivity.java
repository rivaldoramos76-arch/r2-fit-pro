package br.com.r2fitpro.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ContadorNativoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
