# App Android do R2 Fit Pro

O app abre o próprio site (https://r2fitpro.com.br), então tudo o que é publicado na Vercel já aparece no app,
sem gerar APK novo. A parte nativa existe para o que o navegador não deixa:

- **Contador nativo** (`ContadorNativoPlugin`, `ContadorMotor`, `ContadorServico`): as falas tocam fora do navegador,
  continuam com a tela bloqueada (serviço em primeiro plano com notificação "contador ativo") e abaixam a música
  só durante cada fala (foco de áudio "pode abaixar", como app de navegação). O site detecta o app por
  `window.Capacitor` (`src/lib/nativo.ts`) e o `TreinoPlayer` usa o modo `nativo`.
- **Avisos no relógio**: a cada fase (TRABALHO, DESCANSO, fim) o app solta uma notificação curta que vibra e
  some ao fim da fase (canal "Fases do treino (relógio)"). O celular repassa ao relógio/pulseira pareado.
  A notificação fixa do contador mostra a fase atual e não vai para o relógio. Chave "Avisos no relógio" nas
  opções de som do treino (só dentro do app).
- **Lembretes** (`Lembretes`, `LembreteAlarme`, `LembretesNativoPlugin`): o Web Push não funciona dentro do app,
  então os horários salvos em Lembretes viram alarmes do Android (reagendados ao reiniciar o celular). Na hora,
  o app pergunta à Edge Function `r2-app` (`/lembrete`) se ainda vale avisar (refeição já registrada não toca);
  sem internet, mostra o aviso padrão. O aparelho é registrado em `push_inscricoes` com endereço
  `https://app.r2fitpro.com.br/android/<hash>` (`/inscrever`, `/desinscrever`), que o envio por Web Push ignora.
- Tela sempre ligada durante o contador, câmera para o código de barras.

Só é preciso gerar APK novo quando muda algo nesta pasta (código nativo, ícone, permissões).

## Gerar o APK

```bash
cd android-app
npm install
npx cap sync android
cd android
echo "sdk.dir=/opt/android-sdk" > local.properties   # Android SDK com platform 36 e build-tools 36
R2_ASSINATURA=/caminho/assinatura.properties ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

Antes de gerar de novo, aumente `versionCode` (e `versionName`) em `android/app/build.gradle`.
Depois copie o APK para `public/baixar/r2-fit-pro.apk` (download em https://r2fitpro.com.br/baixar/r2-fit-pro.apk)
e atualize `public/baixar/versao.json` (`versionCode`, `versionName`, `novidades`). Ao publicar o site, quem
estiver com uma versão menor vê o aviso "Nova versão do R2 Fit Pro" (`src/components/AvisoAtualizacaoApp.tsx`);
o botão abre o download pelo navegador do celular (endereço r2-fit-pro.vercel.app, fora do app).

## Assinatura

A chave (`r2fitpro-android.jks`) e as senhas **não ficam no repositório** (ele é público). O arquivo
`assinatura.properties` tem `storeFile`, `storePassword`, `keyAlias` e `keyPassword`. Uma cópia fica guardada
com o dono do app. Sem a mesma chave, o Android não aceita a atualização por cima (é preciso desinstalar antes).
Na Play Store, a chave final fica com o Google (Play App Signing) e esta vira a chave de envio.
