package app.lia.lia

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "LiaNative")
class LiaNativePlugin : Plugin() {
    private fun acc(call: PluginCall): LiaAccessibilityService? = LiaAccessibilityService.instance ?: run {
        context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.reject("Ative a Lia em Acessibilidade"); null
    }
    @PluginMethod fun startBackground(call: PluginCall) {
        val i = Intent(context, LiaForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i) else context.startService(i)
        call.resolve()
    }
    @PluginMethod fun stopBackground(call: PluginCall) { context.stopService(Intent(context, LiaForegroundService::class.java)); call.resolve() }
    @PluginMethod fun showBubble(call: PluginCall) {
        if (!Settings.canDrawOverlays(context)) {
            context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return call.reject("Permita sobrepor outros apps")
        }
        context.startService(Intent(context, LiaBubbleService::class.java)); call.resolve()
    }
    @PluginMethod fun hideBubble(call: PluginCall) { context.stopService(Intent(context, LiaBubbleService::class.java)); call.resolve() }
    @PluginMethod fun readScreen(call: PluginCall) {
        val s = acc(call) ?: return
        call.resolve(JSObject().put("app", LiaAccessibilityService.foreground).put("tree", JSArray(s.readTree().toString())))
    }
    @PluginMethod fun tap(call: PluginCall) {
        val s = acc(call) ?: return
        val x = call.getFloat("x", 0f)!!; val y = call.getFloat("y", 0f)!!
        s.gesture(x, y, x, y, 60); call.resolve()
    }
    @PluginMethod fun swipe(call: PluginCall) {
        val s = acc(call) ?: return
        s.gesture(call.getFloat("x1")!!, call.getFloat("y1")!!, call.getFloat("x2")!!, call.getFloat("y2")!!, 300); call.resolve()
    }
    @PluginMethod fun clickText(call: PluginCall) {
        val s = acc(call) ?: return
        call.resolve(JSObject().put("ok", s.clickText(call.getString("text") ?: "")))
    }
    @PluginMethod fun readNotifications(call: PluginCall) {
        val enabled = (Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners") ?: "").contains(context.packageName)
        if (!enabled) {
            context.startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return call.reject("Permita o acesso às notificações para a Lia")
        }
        call.resolve(JSObject().put("items", JSArray(LiaNotificationListener.drain().toString())))
    }
    @PluginMethod fun deviceState(call: PluginCall) {
        val pm = context.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager
        call.resolve(JSObject().put("screenOn", pm.isInteractive).put("app", LiaAccessibilityService.foreground))
    }
}
