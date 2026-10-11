package app.lia.lia

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

class LiaAccessibilityService : AccessibilityService() {
    companion object { var instance: LiaAccessibilityService? = null; var foreground: String = "" }
    override fun onServiceConnected() { instance = this }
    override fun onDestroy() { instance = null; super.onDestroy() }
    override fun onInterrupt() {}
    override fun onAccessibilityEvent(e: AccessibilityEvent?) {
        if (e?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) foreground = e.packageName?.toString() ?: ""
    }

    fun readTree(): JSONArray {
        val out = JSONArray()
        fun walk(n: AccessibilityNodeInfo?, depth: Int) {
            if (n == null || depth > 25 || out.length() > 400) return
            val t = n.text?.toString() ?: n.contentDescription?.toString()
            if (!t.isNullOrBlank() || n.isClickable) {
                val r = android.graphics.Rect(); n.getBoundsInScreen(r)
                out.put(JSONObject().put("text", t ?: "").put("click", n.isClickable).put("x", r.centerX()).put("y", r.centerY()))
            }
            for (i in 0 until n.childCount) walk(n.getChild(i), depth + 1)
        }
        walk(rootInActiveWindow, 0)
        return out
    }

    fun gesture(x1: Float, y1: Float, x2: Float, y2: Float, ms: Long) {
        val p = Path().apply { moveTo(x1, y1); lineTo(x2, y2) }
        dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(p, 0, ms)).build(), null, null)
    }

    fun clickText(text: String): Boolean {
        val n = rootInActiveWindow?.findAccessibilityNodeInfosByText(text)?.firstOrNull() ?: return false
        var c: AccessibilityNodeInfo? = n
        while (c != null && !c.isClickable) c = c.parent
        return c?.performAction(AccessibilityNodeInfo.ACTION_CLICK) ?: false
    }
}
