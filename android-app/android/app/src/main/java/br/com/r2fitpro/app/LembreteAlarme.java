package br.com.r2fitpro.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Hora de um lembrete: agenda o próximo, pergunta ao servidor se ainda vale e mostra a notificação. */
public class LembreteAlarme extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String acao = intent.getAction();
        if ("br.com.r2fitpro.app.ROTINA".equals(acao)) {
            // Rotina de ergogênicos: mostra o aviso (texto já vem pronto, discreto ou não) e agenda o próximo
            JSONObject item = Lembretes.itemRotina(c, String.valueOf(intent.getStringExtra("id")));
            if (item == null) return;
            Lembretes.mostrar(c, ("r" + item.optString("id")).hashCode(), item.optString("titulo", "Lembrete da sua rotina ⏰"),
                item.optString("corpo", "Você tem um item para hoje. Toque para ver."), "/ergogenicos");
            Lembretes.agendarRotina(c, item);
            return;
        }
        if (acao != null && !acao.equals("br.com.r2fitpro.app.LEMBRETE")) {
            // Celular ligou de novo, app atualizado ou mudou o horário: reagenda tudo
            if (Lembretes.ativo(c)) Lembretes.agendarTodos(c);
            Lembretes.agendarRotinaTodos(c);
            return;
        }
        String id = intent.getStringExtra("id");
        String tipo = intent.getStringExtra("tipo");
        if (id == null || tipo == null || !Lembretes.ativo(c)) return;
        JSONObject item = Lembretes.item(c, id);
        if (item == null) return;
        Lembretes.agendar(c, item);
        final PendingResult fim = goAsync();
        new Thread(() -> {
            try { consultarEMostrar(c, id, tipo); } finally { fim.finish(); }
        }).start();
    }

    private static void consultarEMostrar(Context c, String id, String tipo) {
        String[] p = Lembretes.padrao(tipo);
        try {
            HttpURLConnection con = (HttpURLConnection) new URL(Lembretes.API).openConnection();
            con.setRequestMethod("POST");
            con.setConnectTimeout(8000);
            con.setReadTimeout(8000);
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            JSONObject corpo = new JSONObject().put("token", Lembretes.token(c)).put("tipo", tipo);
            try (OutputStream out = con.getOutputStream()) { out.write(corpo.toString().getBytes(StandardCharsets.UTF_8)); }
            int status = con.getResponseCode();
            if (status == 200) {
                JSONObject r = new JSONObject(ler(con.getInputStream()));
                if (!r.optBoolean("mostrar", false)) return; // já registrou (ou sem Premium): não toca
                Lembretes.mostrar(c, id.hashCode(), r.optString("titulo", p[0]), r.optString("corpo", p[1]), r.optString("url", p[2]));
                return;
            }
        } catch (Exception ignorado) { /* sem internet: mostra o texto padrão */ }
        Lembretes.mostrar(c, id.hashCode(), p[0], p[1], p[2]);
    }

    private static String ler(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
        return b.toString("UTF-8");
    }
}
