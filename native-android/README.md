# Lia — partes nativas Android (colar no Android Studio)

Copie `lia/*.kt` para `android/app/src/main/java/<seu.pacote>/lia/` e ajuste o `package`.

## AndroidManifest.xml (dentro de `<manifest>`)
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
```
Dentro de `<application>`:
```xml
<service android:name=".lia.LiaForegroundService" android:foregroundServiceType="dataSync" android:exported="false"/>
<service android:name=".lia.LiaBubbleService" android:exported="false"/>
<service android:name=".lia.LiaAccessibilityService" android:exported="false"
    android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
  <intent-filter><action android:name="android.accessibilityservice.AccessibilityService"/></intent-filter>
  <meta-data android:name="android.accessibilityservice" android:resource="@xml/lia_accessibility"/>
</service>
```
Crie `res/xml/lia_accessibility.xml`:
```xml
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
  android:accessibilityEventTypes="typeAllMask" android:accessibilityFeedbackType="feedbackGeneric"
  android:canRetrieveWindowContent="true" android:canPerformGestures="true"
  android:description="@string/app_name"/>
```
Em `MainActivity.kt`: `registerPlugin(LiaNativePlugin::class.java)` antes de `super.onCreate`.

## Uso pelo JS
```ts
import { registerPlugin } from "@capacitor/core";
const LiaNative = registerPlugin<any>("LiaNative");
await LiaNative.startBackground();       // notificação discreta
await LiaNative.showBubble();            // bolha flutuante (pede permissão)
const { tree } = await LiaNative.readScreen();
await LiaNative.tap({ x: 300, y: 800 });
await LiaNative.swipe({ x1: 500, y1: 1500, x2: 500, y2: 500 });
await LiaNative.clickText({ text: "Enviar" });
```
O usuário precisa ativar "Lia" em Configurações → Acessibilidade. A Google Play exige justificativa para esse uso.
Lanterna, vibração, GPS, bateria e rede já funcionam pelo app web, sem código nativo.

## Leitor de notificações
Copie `LiaNotificationListener.kt` e registre no AndroidManifest:
```xml
<service android:name="app.lia.lia.LiaNotificationListener" android:exported="false"
  android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
  <intent-filter><action android:name="android.service.notification.NotificationListenerService"/></intent-filter>
</service>
```
Também adicione `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` e rode `npx cap sync android`.
