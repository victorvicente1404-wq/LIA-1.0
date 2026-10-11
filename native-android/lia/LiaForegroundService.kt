package app.lia.lia

import android.app.*
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/** Mantém o processo vivo (Lia Link + escuta) com uma notificação discreta. */
class LiaForegroundService : Service() {
    override fun onBind(i: Intent?): IBinder? = null
    override fun onStartCommand(i: Intent?, f: Int, id: Int): Int {
        val ch = "lia_bg"
        if (Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager::class.java)
            .createNotificationChannel(NotificationChannel(ch, "Lia ativa", NotificationManager.IMPORTANCE_MIN))
        val open = PendingIntent.getActivity(this, 0, packageManager.getLaunchIntentForPackage(packageName), PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(this, ch).setContentTitle("Lia está por perto")
            .setSmallIcon(applicationInfo.icon).setOngoing(true).setContentIntent(open)
            .setPriority(NotificationCompat.PRIORITY_MIN).build()
        startForeground(1404, n)
        return START_STICKY
    }
}
