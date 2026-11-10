package br.com.r2fitpro.app;

import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.SoundPool;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Toca as falas do contador no horário certo, fora do navegador: segue com a tela bloqueada e com o app
 * em segundo plano (o ContadorServico mantém o processo vivo). Cada fala pede foco de áudio "pode abaixar",
 * então a música abaixa só durante a fala, como num app de navegação.
 */
public final class ContadorMotor {
    public static final class Cue {
        final double t;
        final String clip;
        Cue(double t, String clip) { this.t = t; this.clip = clip; }
    }

    private static ContadorMotor instancia;
    private static final Object TOKEN = new Object();

    public static synchronized ContadorMotor get(Context c) {
        if (instancia == null) instancia = new ContadorMotor(c.getApplicationContext());
        return instancia;
    }

    private final Context ctx;
    private final Handler h = new Handler(Looper.getMainLooper());
    private final AudioManager am;
    private final AudioAttributes atributos;
    private SoundPool pool;
    private final Map<String, Integer> ids = new HashMap<>();
    private final Map<String, Long> duracaoMs = new HashMap<>();
    private int pendentes = 0;
    private Runnable prontoAtual;
    private float volume = 1f;
    private boolean mudo = false;
    private boolean comFoco = false;
    private AudioFocusRequest pedidoFoco;
    private final Runnable soltar = this::soltarFoco;
    private String titulo = "Contador";

    private ContadorMotor(Context ctx) {
        this.ctx = ctx;
        this.am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        this.atributos = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
        criarPool();
    }

    private void criarPool() {
        pool = new SoundPool.Builder().setMaxStreams(4).setAudioAttributes(atributos).build();
        pool.setOnLoadCompleteListener((p, id, status) -> carregou());
    }

    /** Grava os clipes (WAV) e carrega no SoundPool; `pronto` roda quando todos estiverem carregados. */
    public void preparar(Map<String, byte[]> clipes, Map<String, Double> duracoes, Runnable pronto) throws Exception {
        File dir = new File(ctx.getCacheDir(), "contador");
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("sem pasta de cache");
        List<String> novos = new ArrayList<>();
        for (String k : clipes.keySet()) if (!ids.containsKey(k)) novos.add(k);
        if (novos.isEmpty()) { pronto.run(); return; }
        synchronized (this) { pendentes = novos.size(); prontoAtual = pronto; }
        for (String k : novos) {
            File f = new File(dir, "clip_" + Integer.toHexString(k.hashCode()) + "_" + k.length() + ".wav");
            try (FileOutputStream out = new FileOutputStream(f)) { out.write(clipes.get(k)); }
            Double d = duracoes.get(k);
            duracaoMs.put(k, d != null ? Math.round(d * 1000) : 1500L);
            ids.put(k, pool.load(f.getAbsolutePath(), 1));
        }
        // Segurança: se algum carregamento não avisar, segue em 4 s
        h.postDelayed(() -> { synchronized (this) { if (pendentes > 0) { pendentes = 1; } } carregou(); }, 4000);
    }

    private void carregou() {
        Runnable r = null;
        synchronized (this) {
            if (pendentes <= 0) return;
            pendentes--;
            if (pendentes == 0) { r = prontoAtual; prontoAtual = null; }
        }
        if (r != null) r.run();
    }

    /** Agenda as falas a partir de `desde` segundos do cronograma (retomar depois de pausa usa o mesmo). */
    public void tocar(List<Cue> cues, double desde, String titulo) {
        h.removeCallbacksAndMessages(TOKEN);
        this.titulo = titulo != null ? titulo : "Contador";
        long base = SystemClock.uptimeMillis();
        long fim = base;
        for (Cue c : cues) {
            if (c.t < desde - 0.05) continue;
            long quando = base + Math.max(0, Math.round((c.t - desde) * 1000));
            h.postAtTime(() -> falar(c.clip), TOKEN, quando);
            Long d = duracaoMs.get(c.clip);
            fim = Math.max(fim, quando + (d != null ? d : 1500L));
        }
        // Depois da última fala, desliga o serviço sozinho
        h.postAtTime(this::encerrarServico, TOKEN, fim + 1500);
        iniciarServico();
    }

    public void pausar() {
        h.removeCallbacksAndMessages(TOKEN);
        pool.autoPause();
        soltarFoco();
    }

    public void parar() {
        h.removeCallbacksAndMessages(TOKEN);
        pool.autoPause();
        soltarFoco();
        encerrarServico();
    }

    public void setVolume(float v, boolean m) { volume = Math.max(0f, Math.min(1f, v)); mudo = m; }

    private void falar(String clip) {
        Integer id = ids.get(clip);
        if (id == null) return;
        pegarFoco();
        float v = mudo ? 0f : volume;
        pool.play(id, v, v, 1, 0, 1f);
        Long d = duracaoMs.get(clip);
        h.removeCallbacks(soltar);
        // Mantém a música abaixada entre falas próximas (5, 4, 3...) e devolve logo depois
        h.postDelayed(soltar, (d != null ? d : 1500L) + 600);
    }

    private void pegarFoco() {
        if (comFoco) return;
        int r;
        if (Build.VERSION.SDK_INT >= 26) {
            if (pedidoFoco == null) {
                pedidoFoco = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(atributos).setWillPauseWhenDucked(false).setOnAudioFocusChangeListener(f -> {}).build();
            }
            r = am.requestAudioFocus(pedidoFoco);
        } else {
            r = am.requestAudioFocus(f -> {}, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        }
        comFoco = r == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void soltarFoco() {
        h.removeCallbacks(soltar);
        if (!comFoco) return;
        if (Build.VERSION.SDK_INT >= 26 && pedidoFoco != null) am.abandonAudioFocusRequest(pedidoFoco);
        else am.abandonAudioFocus(null);
        comFoco = false;
    }

    private void iniciarServico() {
        Intent i = new Intent(ctx, ContadorServico.class).putExtra("titulo", titulo);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
    }

    private void encerrarServico() {
        soltarFoco();
        ctx.stopService(new Intent(ctx, ContadorServico.class));
    }
}
