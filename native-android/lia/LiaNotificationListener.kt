package app.lia.lia

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

/** Guarda as notificações recentes para a Lia ler (LiaNative.readNotifications). */
class LiaNotificationListener : NotificationListenerService() {
    companion object {
        private val buffer = ArrayList<JSONObject>()
        @Synchronized fun drain(): JSONArray { val a = JSONArray(buffer.map { it }); buffer.clear(); return a }
        @Synchronized fun push(o: JSONObject) { buffer.add(o); if (buffer.size > 100) buffer.removeAt(0) }
    }
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val n = sbn ?: return
        if (n.packageName == packageName) return
        val ex = n.notification.extras
        val label = try { packageManager.getApplicationLabel(packageManager.getApplicationInfo(n.packageName, 0)).toString() } catch (e: Exception) { n.packageName }
        push(JSONObject()
            .put("app", label)
            .put("title", ex.getCharSequence("android.title")?.toString() ?: "")
            .put("body", ex.getCharSequence("android.text")?.toString() ?: "")
            .put("time", n.postTime))
    }
}
