package app.lia.lia

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.accessibilityservice.AccessibilityServiceInfo
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

class LiaAccessibilityService : AccessibilityService() {
    companion object {
        @Volatile var instance: LiaAccessibilityService? = null
        @Volatile var foreground: String = ""
        @Volatile var lastEventAt: Long = 0L
        @Volatile var connectedAt: Long = 0L
    }

    override fun onServiceConnected() {
        instance = this
        connectedAt = System.currentTimeMillis()
        serviceInfo = serviceInfo.apply {
            flags = flags or AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        }
    }

    override fun onDestroy() {
        instance = null
        connectedAt = 0L
        super.onDestroy()
    }

    override fun onInterrupt() {}

    override fun onAccessibilityEvent(e: AccessibilityEvent?) {
        if (e == null) return
        lastEventAt = System.currentTimeMillis()
        if (e.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED ||
            e.eventType == AccessibilityEvent.TYPE_WINDOWS_CHANGED) {
            foreground = e.packageName?.toString() ?: rootInActiveWindow?.packageName?.toString().orEmpty()
        }
    }

    fun readTree(): JSONArray {
        val out = JSONArray()
        fun walk(node: AccessibilityNodeInfo?, depth: Int) {
            if (node == null || depth > 24 || out.length() >= 500) return
            val text = node.text?.toString().orEmpty()
            val description = node.contentDescription?.toString().orEmpty()
            val rect = Rect()
            node.getBoundsInScreen(rect)
            if (text.isNotBlank() || description.isNotBlank() || node.isClickable ||
                node.isEditable || node.isScrollable || node.isFocused) {
                out.put(JSONObject()
                    .put("text", text)
                    .put("description", description)
                    .put("className", node.className?.toString().orEmpty())
                    .put("viewId", node.viewIdResourceName ?: "")
                    .put("clickable", node.isClickable)
                    .put("editable", node.isEditable)
                    .put("focusable", node.isFocusable)
                    .put("focused", node.isFocused)
                    .put("scrollable", node.isScrollable)
                    .put("enabled", node.isEnabled)
                    .put("x", rect.centerX())
                    .put("y", rect.centerY())
                    .put("left", rect.left)
                    .put("top", rect.top)
                    .put("right", rect.right)
                    .put("bottom", rect.bottom))
            }
            for (i in 0 until node.childCount) {
                if (out.length() >= 500) break
                walk(node.getChild(i), depth + 1)
            }
        }
        walk(rootInActiveWindow, 0)
        return out
    }

    fun gesture(
        x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long,
        onComplete: (Boolean) -> Unit
    ): Boolean {
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(x2, y2)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs.coerceIn(40, 5000))
        val callback = object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) = onComplete(true)
            override fun onCancelled(gestureDescription: GestureDescription?) = onComplete(false)
        }
        return dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), callback, null)
    }

    fun clickText(text: String): Boolean {
        if (text.isBlank()) return false
        val matches = rootInActiveWindow?.findAccessibilityNodeInfosByText(text) ?: return false
        for (match in matches) {
            var current: AccessibilityNodeInfo? = match
            var depth = 0
            while (current != null && depth++ < 12) {
                if (current.isEnabled && current.isClickable &&
                    current.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
                current = current.parent
            }
        }
        return false
    }

    private fun findEditable(node: AccessibilityNodeInfo?, depth: Int = 0): AccessibilityNodeInfo? {
        if (node == null || depth > 24) return null
        if (node.isEditable && node.isEnabled) return node
        for (i in 0 until node.childCount) {
            val found = findEditable(node.getChild(i), depth + 1)
            if (found != null) return found
        }
        return null
    }

    fun setText(value: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        val target = if (focused?.isEditable == true) focused else findEditable(root)
        if (target == null || !target.isEnabled) return false
        target.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
        }
        return target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    private fun findScrollable(node: AccessibilityNodeInfo?, depth: Int = 0): AccessibilityNodeInfo? {
        if (node == null || depth > 24) return null
        if (node.isScrollable && node.isEnabled) return node
        for (i in 0 until node.childCount) {
            val found = findScrollable(node.getChild(i), depth + 1)
            if (found != null) return found
        }
        return null
    }

    fun scroll(forward: Boolean): Boolean {
        val target = findScrollable(rootInActiveWindow) ?: return false
        val action = if (forward) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
            else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        return target.performAction(action)
    }

    fun goBack(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)
}
