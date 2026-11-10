package br.com.r2fitpro.app;

import android.Manifest;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** Lembretes no app Android (window.Capacitor.Plugins.LembretesNativo). */
@CapacitorPlugin(name = "LembretesNativo", permissions = {
    @Permission(alias = "notificacoes", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class LembretesNativoPlugin extends Plugin {

    private String permissao() {
        if (Build.VERSION.SDK_INT < 33) return NotificationManagerCompat.from(getContext()).areNotificationsEnabled() ? "granted" : "denied";
        PermissionState s = getPermissionState("notificacoes");
        if (s == PermissionState.GRANTED) return NotificationManagerCompat.from(getContext()).areNotificationsEnabled() ? "granted" : "denied";
        return s == PermissionState.DENIED ? "denied" : "prompt";
    }

    private JSObject estadoAtual() {
        JSObject r = new JSObject();
        r.put("permissao", permissao());
        r.put("ativo", Lembretes.ativo(getContext()));
        r.put("token", Lembretes.token(getContext()));
        return r;
    }

    @PluginMethod
    public void estado(PluginCall call) { call.resolve(estadoAtual()); }

    /** Pede a permissão de notificação (Android 13+) e liga os lembretes neste aparelho. */
    @PluginMethod
    public void ativar(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notificacoes") != PermissionState.GRANTED) {
            requestPermissionForAlias("notificacoes", call, "aposPermissao");
            return;
        }
        concluirAtivacao(call);
    }

    @PermissionCallback
    private void aposPermissao(PluginCall call) { concluirAtivacao(call); }

    private void concluirAtivacao(PluginCall call) {
        if ("granted".equals(permissao())) Lembretes.definirAtivo(getContext(), true);
        call.resolve(estadoAtual());
    }

    @PluginMethod
    public void desativar(PluginCall call) {
        Lembretes.definirAtivo(getContext(), false);
        call.resolve(estadoAtual());
    }

    /** itens: [{ id, tipo, hora, minuto, dias }] */
    @PluginMethod
    public void agendar(PluginCall call) {
        JSArray itens = call.getArray("itens", new JSArray());
        Lembretes.definirItens(getContext(), itens);
        call.resolve(estadoAtual());
    }

    @PluginMethod
    public void testar(PluginCall call) {
        Lembretes.mostrar(getContext(), 42, "Lembretes ativados ✅", "É assim que os avisos do R2 Fit Pro vão aparecer.", "/lembretes");
        call.resolve();
    }
}
