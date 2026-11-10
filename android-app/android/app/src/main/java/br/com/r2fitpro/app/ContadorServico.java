package br.com.r2fitpro.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/** Serviço em primeiro plano enquanto o contador roda: o Android não congela o app com a tela bloqueada. */
public class ContadorServico extends Service {
    private static final String CANAL = "contador";
    private static final String CANAL_FASES = "fases";
    static final int ID_FIXA = 1, ID_FASE = 2, ID_FASE_B = 3;
    private static int idFase = ID_FASE;
    /** O serviço está rodando (só então a notificação fixa acompanha a fase). */
    private static volatile boolean rodando = false;
    private PowerManager.WakeLock trava;
    private final android.os.Handler espera = new android.os.Handler(android.os.Looper.getMainLooper());
    /** O contador de verdade está tocando (o fim do teste não pode derrubar o serviço dele). */
    static volatile boolean contadorTocando = false;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String titulo = intent != null && intent.getStringExtra("titulo") != null ? intent.getStringExtra("titulo") : "Contador";
        boolean teste = intent != null && intent.getBooleanExtra("teste", false);
        rodando = true;
        Notification n = teste ? fixa(this, "R2 Fit Pro · teste do relógio", "Bloqueie a tela: o aviso chega em instantes")
            : fixa(this, "R2 Fit Pro · contador ativo", titulo);
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID_FIXA, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(ID_FIXA, n);
        if (trava == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            trava = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "r2fitpro:contador");
            trava.setReferenceCounted(false);
        }
        trava.acquire(3 * 60 * 60 * 1000L);
        if (teste) {
            // Teste do relógio com o serviço ativo, como no treino: o celular não congela o app com a tela bloqueada
            long atraso = Math.max(0, Math.min(60, intent.getIntExtra("atraso", 10))) * 1000L;
            android.content.Context c = getApplicationContext();
            espera.postDelayed(() -> avisarFase(c, "⌚ Teste do relógio", "Se apareceu no relógio, os avisos de trabalho e descanso vão chegar.", 15000), atraso);
            espera.postDelayed(() -> { if (!contadorTocando) stopSelf(); }, atraso + 20000);
        }
        return START_NOT_STICKY;
    }

    private static void canais(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT < 26) return;
        if (nm.getNotificationChannel(CANAL) == null) {
            NotificationChannel ch = new NotificationChannel(CANAL, "Contador de treino", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Aparece enquanto o contador está rodando");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CANAL_FASES) == null) {
            NotificationChannel ch = new NotificationChannel(CANAL_FASES, "Fases do treino (relógio)", NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("Um aviso a cada troca de fase (trabalho, descanso), que vibra e aparece no relógio pareado");
            ch.setSound(null, null);
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[] { 0, 250, 120, 250 });
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }

    private static PendingIntent abrirApp(Context c) {
        Intent abrir = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 0, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** Notificação fixa do serviço (sem som); o texto mostra a fase atual. */
    static Notification fixa(Context c, String titulo, String texto) {
        canais(c);
        return new NotificationCompat.Builder(c, CANAL)
            .setSmallIcon(R.drawable.ic_stat_contador)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setContentIntent(abrirApp(c))
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setLocalOnly(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .build();
    }

    /** Aviso de fase: vibra no celular e é repassado ao relógio; some sozinho ao fim da fase. */
    static void avisarFase(Context c, String titulo, String texto, long durMs) {
        canais(c);
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        Notification n = new NotificationCompat.Builder(c, CANAL_FASES)
            .setSmallIcon(R.drawable.ic_stat_contador)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setContentIntent(abrirApp(c))
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setVibrate(new long[] { 0, 250, 120, 250 })
            .setTimeoutAfter(Math.max(3000, durMs + 1500))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
            .build();
        // Cada fase é uma notificação nova (id alternado): os apps de relógio repassam notificação nova,
        // mas muitos ignoram a atualização de uma que já existe. A anterior sai logo depois.
        int anterior = idFase;
        idFase = idFase == ID_FASE ? ID_FASE_B : ID_FASE;
        nm.notify(idFase, n);
        nm.cancel(anterior);
        // A notificação fixa acompanha a fase atual (só com o contador rodando; o teste do relógio não cria uma)
        if (rodando) nm.notify(ID_FIXA, fixa(c, titulo, texto));
    }

    static void limparAvisos(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        nm.cancel(ID_FASE);
        nm.cancel(ID_FASE_B);
    }

    @Override
    public void onDestroy() {
        rodando = false;
        espera.removeCallbacksAndMessages(null);
        if (trava != null && trava.isHeld()) trava.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
