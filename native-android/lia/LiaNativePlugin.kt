package app.lia.lia

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.BatteryManager
import android.content.IntentFilter
import android.provider.Settings
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "LiaNative")
class LiaNativePlugin : Plugin() {
    private fun acc(call: PluginCall): LiaAccessibilityService? = LiaAccessibilityService.instance ?: run {
        context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.reject("Ative a Lia em Acessibilidade")
        null
    }

    @PluginMethod fun startBackground(call: PluginCall) {
        val i = Intent(context, LiaForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i) else context.startService(i)
        call.resolve()
    }

    @PluginMethod fun stopBackground(call: PluginCall) {
        context.stopService(Intent(context, LiaForegroundService::class.java))
        call.resolve()
    }

    @PluginMethod fun showBubble(call: PluginCall) {
        if (!Settings.canDrawOverlays(context)) {
            context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return call.reject("Permita sobrepor outros apps")
        }
        context.startService(Intent(context, LiaBubbleService::class.java))
        call.resolve()
    }

    @PluginMethod fun hideBubble(call: PluginCall) {
        context.stopService(Intent(context, LiaBubbleService::class.java))
        call.resolve()
    }

    @PluginMethod fun openApp(call: PluginCall) {
        val requested = call.getString("name")?.trim().orEmpty()
        if (requested.isBlank()) {
            call.reject("Informe o nome do aplicativo")
            return
        }
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val candidates = packageManager.queryIntentActivities(launcher, 0)
        val match = candidates.firstOrNull {
            it.loadLabel(packageManager).toString().equals(requested, ignoreCase = true)
        } ?: candidates.firstOrNull {
            it.loadLabel(packageManager).toString().contains(requested, ignoreCase = true)
        }
        val selected = match
        if (selected == null) {
            call.reject("Não encontrei um aplicativo instalado chamado ${requested}")
            return
        }
        val packageName = selected.activityInfo.packageName
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        if (launch == null) {
            call.reject("O aplicativo ${requested} não possui uma tela de inicialização disponível")
            return
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(launch)
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                call.resolve(JSObject().put("ok", true).put("name", selected.loadLabel(packageManager).toString()).put("package", packageName))
            }, 650)
        } catch (error: Exception) {
            call.reject("Não consegui abrir ${requested}", error)
        }
    }

    @PluginMethod fun readScreen(call: PluginCall) {
        val service = acc(call) ?: return
        call.resolve(JSObject()
            .put("app", LiaAccessibilityService.foreground)
            .put("lastEventAt", LiaAccessibilityService.lastEventAt)
            .put("tree", service.readTree()))
    }

    private fun dispatch(call: PluginCall, service: LiaAccessibilityService, x1: Float, y1: Float, x2: Float, y2: Float, duration: Long, label: String) {
        val accepted = service.gesture(x1, y1, x2, y2, duration) { completed ->
            if (completed) call.resolve()
            else call.reject("O Android cancelou $label")
        }
        if (!accepted) call.reject("O Android recusou $label")
    }

    @PluginMethod fun tap(call: PluginCall) {
        val service = acc(call) ?: return
        val x = call.getFloat("x", 0f) ?: 0f
        val y = call.getFloat("y", 0f) ?: 0f
        dispatch(call, service, x, y, x, y, 60, "o toque")
    }

    @PluginMethod fun longPress(call: PluginCall) {
        val service = acc(call) ?: return
        val x = call.getFloat("x", 0f) ?: 0f
        val y = call.getFloat("y", 0f) ?: 0f
        dispatch(call, service, x, y, x, y, 800, "o toque longo")
    }

    @PluginMethod fun swipe(call: PluginCall) {
        val service = acc(call) ?: return
        val x1 = call.getFloat("x1", 500f) ?: 500f
        val y1 = call.getFloat("y1", 1500f) ?: 1500f
        val x2 = call.getFloat("x2", 500f) ?: 500f
        val y2 = call.getFloat("y2", 500f) ?: 500f
        dispatch(call, service, x1, y1, x2, y2, 300, "o gesto")
    }

    @PluginMethod fun clickText(call: PluginCall) {
        val service = acc(call) ?: return
        call.resolve(JSObject().put("ok", service.clickText(call.getString("text") ?: "")))
    }

    @PluginMethod fun setText(call: PluginCall) {
        val service = acc(call) ?: return
        val value = call.getString("text") ?: ""
        call.resolve(JSObject().put("ok", service.setText(value)))
    }

    @PluginMethod fun scroll(call: PluginCall) {
        val service = acc(call) ?: return
        val forward = call.getBoolean("forward", true) ?: true
        call.resolve(JSObject().put("ok", service.scroll(forward)))
    }

    @PluginMethod fun goBack(call: PluginCall) {
        val service = acc(call) ?: return
        call.resolve(JSObject().put("ok", service.goBack()))
    }

    @PluginMethod fun readNotifications(call: PluginCall) {
        val enabled = (Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: "").contains(context.packageName)
        if (!enabled) {
            context.startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return call.reject("Permita o acesso às notificações para a Lia")
        }
        call.resolve(JSObject().put("items", JSArray(LiaNotificationListener.drain().toString())))
    }

    @PluginMethod fun batteryStatus(call: PluginCall) {
        try {
            val manager = context.getSystemService(android.content.Context.BATTERY_SERVICE) as BatteryManager
            val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val levelFromIntent = intent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = intent?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
            val propertyLevel = if (Build.VERSION.SDK_INT >= 21) manager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) else -1
            val level = when {
                propertyLevel in 0..100 -> propertyLevel
                levelFromIntent >= 0 && scale > 0 -> ((levelFromIntent * 100f) / scale).toInt().coerceIn(0, 100)
                else -> -1
            }
            if (level < 0) {
                call.reject("O Android não disponibilizou o nível da bateria")
                return
            }
            val statusCode = intent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            val charging = statusCode == BatteryManager.BATTERY_STATUS_CHARGING || statusCode == BatteryManager.BATTERY_STATUS_FULL
            val plugged = (intent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0) != 0
            val status = when (statusCode) {
                BatteryManager.BATTERY_STATUS_CHARGING -> "carregando"
                BatteryManager.BATTERY_STATUS_FULL -> "cheia"
                BatteryManager.BATTERY_STATUS_DISCHARGING -> "descarregando"
                BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "não está carregando"
                else -> "estado desconhecido"
            }
            call.resolve(JSObject().put("level", level).put("charging", charging).put("plugged", plugged).put("status", status))
        } catch (error: Exception) {
            call.reject("Não consegui consultar a bateria do Android", error)
        }
    }

    @PluginMethod fun deviceState(call: PluginCall) {
        val pm = context.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager
        call.resolve(JSObject().put("screenOn", pm.isInteractive).put("app", LiaAccessibilityService.foreground))
    }
}
