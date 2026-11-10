package br.com.r2fitpro.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.view.WindowManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/** Ponte do site com o contador nativo (window.Capacitor.Plugins.ContadorNativo). */
@CapacitorPlugin(name = "ContadorNativo")
public class ContadorNativoPlugin extends Plugin {

    /** clipes: { chave: { wav: base64, dur: segundos } } */
    @PluginMethod
    public void preparar(PluginCall call) {
        try {
            JSObject clipes = call.getObject("clipes", new JSObject());
            Map<String, byte[]> dados = new HashMap<>();
            Map<String, Double> dur = new HashMap<>();
            Iterator<String> it = clipes.keys();
            while (it.hasNext()) {
                String k = it.next();
                JSONObject c = clipes.getJSONObject(k);
                dados.put(k, Base64.decode(c.getString("wav"), Base64.DEFAULT));
                dur.put(k, c.optDouble("dur", 1.5));
            }
            ContadorMotor.get(getContext()).preparar(dados, dur, () -> call.resolve());
        } catch (Exception e) {
            call.reject("Não foi possível preparar as vozes", e);
        }
    }

    /** cues: [{ t, clip }], desde (s), volume, mudo, titulo */
    @PluginMethod
    public void tocar(PluginCall call) {
        try {
            JSArray arr = call.getArray("cues", new JSArray());
            List<ContadorMotor.Cue> cues = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                cues.add(new ContadorMotor.Cue(o.getDouble("t"), o.getString("clip")));
            }
            JSArray av = call.getArray("avisos", new JSArray());
            List<ContadorMotor.Aviso> avisos = new ArrayList<>();
            for (int i = 0; i < av.length(); i++) {
                JSONObject o = av.getJSONObject(i);
                avisos.add(new ContadorMotor.Aviso(o.getDouble("t"), o.optString("titulo", ""), o.optString("texto", ""), o.optDouble("dur", 0)));
            }
            ContadorMotor m = ContadorMotor.get(getContext());
            m.setVolume(call.getFloat("volume", 1f), Boolean.TRUE.equals(call.getBoolean("mudo", false)));
            pedirNotificacao();
            m.tocar(cues, avisos, call.getDouble("desde", 0.0), call.getString("titulo", "Contador"));
            call.resolve();
        } catch (Exception e) {
            call.reject("Não foi possível iniciar o contador", e);
        }
    }

    @PluginMethod
    public void pausar(PluginCall call) { ContadorMotor.get(getContext()).pausar(); call.resolve(); }

    @PluginMethod
    public void parar(PluginCall call) { ContadorMotor.get(getContext()).parar(); call.resolve(); }

    @PluginMethod
    public void volume(PluginCall call) {
        ContadorMotor.get(getContext()).setVolume(call.getFloat("volume", 1f), Boolean.TRUE.equals(call.getBoolean("mudo", false)));
        call.resolve();
    }

    /** Tela sempre ligada enquanto o contador está aberto. */
    @PluginMethod
    public void telaLigada(PluginCall call) {
        boolean ligada = Boolean.TRUE.equals(call.getBoolean("ligada", true));
        getActivity().runOnUiThread(() -> {
            if (ligada) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        call.resolve();
    }

    private void pedirNotificacao() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(getActivity(), new String[] { Manifest.permission.POST_NOTIFICATIONS }, 4711);
        }
    }
}
