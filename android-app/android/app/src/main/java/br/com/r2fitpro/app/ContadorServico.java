package br.com.r2fitpro.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;

/** Serviço em primeiro plano enquanto o contador roda: o Android não congela o app com a tela bloqueada. */
public class ContadorServico extends Service {
    private static final String CANAL = "contador";
    private PowerManager.WakeLock trava;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CANAL) == null) {
            NotificationChannel c = new NotificationChannel(CANAL, "Contador de treino", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Aparece enquanto o contador está rodando");
            c.setShowBadge(false);
            nm.createNotificationChannel(c);
        }
        String titulo = intent != null && intent.getStringExtra("titulo") != null ? intent.getStringExtra("titulo") : "Contador";
        Intent abrir = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, abrir, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_stat_contador)
            .setContentTitle("R2 Fit Pro · contador ativo")
            .setContentText(titulo)
            .setContentIntent(pi)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(1, n);
        if (trava == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            trava = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "r2fitpro:contador");
            trava.setReferenceCounted(false);
        }
        trava.acquire(3 * 60 * 60 * 1000L);
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (trava != null && trava.isHeld()) trava.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
