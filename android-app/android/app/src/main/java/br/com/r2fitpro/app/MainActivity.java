package br.com.r2fitpro.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ContadorNativoPlugin.class);
        registerPlugin(LembretesNativoPlugin.class);
        registerPlugin(ArquivosNativoPlugin.class);
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
        // Navega dentro do site já aberto (não recarrega: um treino em andamento continua); se o site não respondeu, carrega a página
        String js = "window.__r2Navegar ? (window.__r2Navegar(" + org.json.JSONObject.quote(url) + "), 'ok') : 'nao'";
        getBridge().getWebView().postDelayed(() -> getBridge().getWebView().evaluateJavascript(js, r -> {
            if (!"\"ok\"".equals(r)) getBridge().getWebView().loadUrl(Lembretes.SITE + url);
        }), atraso);
    }
}
