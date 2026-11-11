package br.com.r2fitpro.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.security.SecureRandom;
import java.util.Calendar;

/**
 * Lembretes do app: os horários ficam guardados no aparelho e cada um vira um alarme do Android.
 * Na hora, o LembreteAlarme pergunta ao servidor se o lembrete ainda vale (ex.: almoço já registrado não toca).
 */
public final class Lembretes {
    static final String API = "https://pzmhlxhdqghamyxgegwq.supabase.co/functions/v1/r2-api/app/lembrete";
    static final String SITE = "https://r2fitpro.com.br";
    private static final String PREFS = "r2_lembretes";
    private static final String CANAL = "lembretes";

    private Lembretes() {}

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** Identificador aleatório deste aparelho (gerado uma vez). */
    static String token(Context c) {
        SharedPreferences p = prefs(c);
        String t = p.getString("token", null);
        if (t == null) {
            byte[] b = new byte[32];
            new SecureRandom().nextBytes(b);
            StringBuilder sb = new StringBuilder();
            for (byte x : b) sb.append(String.format("%02x", x));
            t = sb.toString();
            p.edit().putString("token", t).apply();
        }
        return t;
    }

    static boolean ativo(Context c) { return prefs(c).getBoolean("ativo", false); }

    static void definirAtivo(Context c, boolean v) {
        if (!v) cancelarTodos(c);
        prefs(c).edit().putBoolean("ativo", v).apply();
        if (v) agendarTodos(c);
    }

    /** Troca a lista de horários: [{ id, tipo, hora, minuto, dias: [0..6] }] (0 = domingo). */
    static void definirItens(Context c, JSONArray itens) {
        cancelarTodos(c);
        prefs(c).edit().putString("itens", itens.toString()).apply();
        if (ativo(c)) agendarTodos(c);
    }

    static JSONArray itens(Context c) {
        try { return new JSONArray(prefs(c).getString("itens", "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    static void agendarTodos(Context c) {
        JSONArray l = itens(c);
        for (int i = 0; i < l.length(); i++) {
            JSONObject o = l.optJSONObject(i);
            if (o != null) agendar(c, o);
        }
    }

    static void cancelarTodos(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        JSONArray l = itens(c);
        for (int i = 0; i < l.length(); i++) {
            JSONObject o = l.optJSONObject(i);
            if (o != null) am.cancel(intencao(c, o));
        }
    }

    static JSONObject item(Context c, String id) {
        JSONArray l = itens(c);
        for (int i = 0; i < l.length(); i++) {
            JSONObject o = l.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) return o;
        }
        return null;
    }

    private static PendingIntent intencao(Context c, JSONObject o) {
        Intent i = new Intent(c, LembreteAlarme.class)
            .setAction("br.com.r2fitpro.app.LEMBRETE")
            .putExtra("id", o.optString("id"))
            .putExtra("tipo", o.optString("tipo"));
        return PendingIntent.getBroadcast(c, o.optString("id").hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Próximo horário do lembrete (hoje ou nos próximos dias escolhidos). */
    static long proximo(JSONObject o, long agora) {
        JSONArray dias = o.optJSONArray("dias");
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(agora);
        cal.set(Calendar.HOUR_OF_DAY, o.optInt("hora"));
        cal.set(Calendar.MINUTE, o.optInt("minuto"));
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        for (int d = 0; d < 8; d++) {
            int dow = cal.get(Calendar.DAY_OF_WEEK) - 1; // 0 = domingo
            boolean dia = dias == null || dias.length() == 0;
            if (dias != null) for (int k = 0; k < dias.length(); k++) if (dias.optInt(k, -1) == dow) dia = true;
            if (dia && cal.getTimeInMillis() > agora + 30_000) return cal.getTimeInMillis();
            cal.add(Calendar.DAY_OF_MONTH, 1);
        }
        return -1;
    }

    static void agendar(Context c, JSONObject o) {
        long quando = proximo(o, System.currentTimeMillis());
        if (quando < 0) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        // Funciona mesmo com o celular em repouso (pode atrasar alguns minutos para poupar bateria)
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, intencao(c, o));
    }

    private static void canal(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CANAL) == null) {
            NotificationChannel ch = new NotificationChannel(CANAL, "Lembretes", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Refeições, água, treino e peso nos horários que você escolheu");
            nm.createNotificationChannel(ch);
        }
    }

    static void mostrar(Context c, int id, String titulo, String corpo, String url) {
        canal(c);
        Intent abrir = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra("url", url);
        PendingIntent pi = PendingIntent.getActivity(c, id, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(1000 + Math.abs(id % 100000), new NotificationCompat.Builder(c, CANAL)
            .setSmallIcon(R.drawable.ic_stat_contador)
            .setContentTitle(titulo)
            .setContentText(corpo)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(corpo))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build());
    }

    // --- Avisos com data e texto prontos, em grupos que o site troca inteiros ---
    // "rotina" (ergogênicos): na data da próxima vez e no horário; sem marcar como feito, repete no dia seguinte.
    // "semana" (treino perdido): uma vez só, na manhã seguinte ao dia de treino que ficou sem treino.

    static final String ROTINA = "rotina", SEMANA = "semana";
    private static String grupoValido(String g) { return SEMANA.equals(g) ? SEMANA : ROTINA; }

    static void definirAvisos(Context c, String grupo, JSONArray itens) {
        grupo = grupoValido(grupo);
        cancelarAvisos(c, grupo);
        prefs(c).edit().putString(grupo, itens.toString()).apply();
        for (int i = 0; i < itens.length(); i++) {
            JSONObject o = itens.optJSONObject(i);
            if (o != null) agendarAviso(c, grupo, o);
        }
    }

    static JSONArray avisos(Context c, String grupo) {
        try { return new JSONArray(prefs(c).getString(grupoValido(grupo), "[]")); } catch (Exception e) { return new JSONArray(); }
    }

    static JSONObject itemAviso(Context c, String grupo, String id) {
        JSONArray l = avisos(c, grupo);
        for (int i = 0; i < l.length(); i++) {
            JSONObject o = l.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) return o;
        }
        return null;
    }

    static void agendarAvisosTodos(Context c) {
        for (String grupo : new String[] { ROTINA, SEMANA }) {
            JSONArray l = avisos(c, grupo);
            for (int i = 0; i < l.length(); i++) {
                JSONObject o = l.optJSONObject(i);
                if (o != null) agendarAviso(c, grupo, o);
            }
        }
    }

    private static void cancelarAvisos(Context c, String grupo) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        JSONArray l = avisos(c, grupo);
        for (int i = 0; i < l.length(); i++) {
            JSONObject o = l.optJSONObject(i);
            if (o != null) am.cancel(intencaoAviso(c, grupo, o));
        }
    }

    private static PendingIntent intencaoAviso(Context c, String grupo, JSONObject o) {
        Intent i = new Intent(c, LembreteAlarme.class).setAction("br.com.r2fitpro.app.ROTINA")
            .putExtra("id", o.optString("id")).putExtra("grupo", grupo);
        String prefixo = SEMANA.equals(grupo) ? "s" : "r";
        return PendingIntent.getBroadcast(c, (prefixo + o.optString("id")).hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Data (AAAA-MM-DD) no horário; se já passou: aviso único → -1 (não avisa); rotina → hoje ou amanhã no horário. */
    static long proximoAviso(JSONObject o, long agora, boolean unico) {
        Calendar cal = Calendar.getInstance();
        try {
            String[] d = o.optString("data").split("-");
            cal.set(Integer.parseInt(d[0]), Integer.parseInt(d[1]) - 1, Integer.parseInt(d[2]), o.optInt("hora"), o.optInt("minuto"), 0);
        } catch (Exception e) {
            if (unico) return -1;
            cal.setTimeInMillis(agora);
            cal.set(Calendar.HOUR_OF_DAY, o.optInt("hora"));
            cal.set(Calendar.MINUTE, o.optInt("minuto"));
            cal.set(Calendar.SECOND, 0);
        }
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() > agora + 30_000) return cal.getTimeInMillis();
        if (unico) return -1;
        Calendar hoje = Calendar.getInstance();
        hoje.setTimeInMillis(agora);
        hoje.set(Calendar.HOUR_OF_DAY, o.optInt("hora"));
        hoje.set(Calendar.MINUTE, o.optInt("minuto"));
        hoje.set(Calendar.SECOND, 0);
        hoje.set(Calendar.MILLISECOND, 0);
        if (hoje.getTimeInMillis() <= agora + 30_000) hoje.add(Calendar.DAY_OF_MONTH, 1);
        return hoje.getTimeInMillis();
    }

    static void agendarAviso(Context c, String grupo, JSONObject o) {
        long quando = proximoAviso(o, System.currentTimeMillis(), SEMANA.equals(grupo));
        if (quando < 0) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, quando, intencaoAviso(c, grupo, o));
    }

    /** Texto usado se o servidor não responder (sem internet): melhor lembrar do que ficar quieto. */
    static String[] padrao(String tipo) {
        switch (tipo) {
            case "cafe": return new String[] { "Bom dia! ☀️", "Já tomou café? Registre no diário para manter a meta em dia.", "/calorias" };
            case "almoco": return new String[] { "Hora do almoço 🍽️", "Registre o que você vai comer e veja quanto falta para a meta.", "/calorias" };
            case "lanche": return new String[] { "Hora do lanche 🍎", "Não esqueça de registrar o lanche no diário.", "/calorias" };
            case "jantar": return new String[] { "Hora do jantar 🌙", "Registre o jantar e feche o dia dentro da meta.", "/calorias" };
            case "agua": return new String[] { "Beba água 💧", "Um copo agora ajuda a bater a meta de hoje.", "/calorias" };
            case "treino": return new String[] { "Hora do treino 💪", "Seu treino de hoje está esperando. Bora?", "/treino" };
            case "peso": return new String[] { "Dia de pesar ⚖️", "Registre seu peso para acompanhar a evolução no gráfico.", "/peso" };
            default: return new String[] { "R2 Fit Pro", "Lembrete", "/dashboard" };
        }
    }
}
