package app.lia.lia

import android.app.Service
import android.content.Intent
import android.graphics.PixelFormat
import android.os.IBinder
import android.view.*
import android.widget.ImageView

/** Bolha flutuante: arraste para mover, toque para abrir a Lia. */
class LiaBubbleService : Service() {
    private var view: View? = null
    override fun onBind(i: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate()
        val wm = getSystemService(WINDOW_SERVICE) as WindowManager
        val lp = WindowManager.LayoutParams(160, 160, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, PixelFormat.TRANSLUCENT).apply { gravity = Gravity.TOP or Gravity.START; x = 20; y = 400 }
        val img = ImageView(this).apply { setImageResource(applicationInfo.icon) }
        var sx = 0; var sy = 0; var tx = 0f; var ty = 0f; var moved = false
        img.setOnTouchListener { _, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { sx = lp.x; sy = lp.y; tx = e.rawX; ty = e.rawY; moved = false }
                MotionEvent.ACTION_MOVE -> { lp.x = sx + (e.rawX - tx).toInt(); lp.y = sy + (e.rawY - ty).toInt(); moved = true; wm.updateViewLayout(img, lp) }
                MotionEvent.ACTION_UP -> if (!moved || (Math.abs(e.rawX - tx) < 10 && Math.abs(e.rawY - ty) < 10))
                    startActivity(packageManager.getLaunchIntentForPackage(packageName)!!.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            true
        }
        wm.addView(img, lp); view = img
    }
    override fun onDestroy() { view?.let { (getSystemService(WINDOW_SERVICE) as WindowManager).removeView(it) }; super.onDestroy() }
}
