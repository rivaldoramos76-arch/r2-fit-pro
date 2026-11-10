package br.com.r2fitpro.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ContadorNativoPlugin.class);
        registerPlugin(LembretesNativoPlugin.class);
        super.onCreate(savedInstanceState);
        abrirDestino(getIntent(), 1500);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        abrirDestino(intent, 0);
    }

    /** Toque numa notificação de lembrete: abre a tela certa (ex.: /calorias). */
    private void abrirDestino(Intent intent, long atraso) {
        if (intent == null) return;
        String url = intent.getStringExtra("url");
        if (url == null || !url.startsWith("/") || getBridge() == null) return;
        intent.removeExtra("url");
        getBridge().getWebView().postDelayed(() -> getBridge().getWebView().loadUrl(Lembretes.SITE + url), atraso);
    }
}
