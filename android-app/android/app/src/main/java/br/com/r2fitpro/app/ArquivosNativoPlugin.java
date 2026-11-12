package br.com.r2fitpro.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;

/**
 * Arquivos gerados pelo site (PDF, imagem, exportação de dados): o WebView do app não baixa arquivos,
 * então o site manda o conteúdo para cá e o Android abre "Compartilhar" (salvar no Drive, WhatsApp, e-mail...).
 */
@CapacitorPlugin(name = "ArquivosNativo")
public class ArquivosNativoPlugin extends Plugin {
    @PluginMethod
    public void compartilhar(PluginCall call) {
        String base64 = call.getString("base64");
        String nome = call.getString("nome", "arquivo");
        String mime = call.getString("mime", "application/octet-stream");
        if (base64 == null || base64.isEmpty()) { call.reject("Arquivo vazio"); return; }
        try {
            String seguro = nome.replaceAll("[^A-Za-z0-9._-]", "_");
            File pasta = new File(getContext().getCacheDir(), "compartilhar");
            if (!pasta.exists() && !pasta.mkdirs()) throw new Exception("pasta");
            File arq = new File(pasta, seguro);
            try (FileOutputStream out = new FileOutputStream(arq)) { out.write(Base64.decode(base64, Base64.DEFAULT)); }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", arq);
            Intent enviar = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent escolher = Intent.createChooser(enviar, call.getString("titulo", "Salvar ou enviar"));
            escolher.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(escolher);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não foi possível abrir o compartilhamento", e);
        }
    }
}
