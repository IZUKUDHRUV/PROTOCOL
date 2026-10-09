package com.example.whatdidimiss

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class WhatsAppNotificationListener : NotificationListenerService() {
    private val sender = Executors.newSingleThreadExecutor()

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (!CompanionPreferences.enabled(this)) return
        if (sbn.packageName !in WHATSAPP_PACKAGES) return

        val extras = sbn.notification?.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
        val text = (
            extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_TEXT)
            )?.toString()?.trim().orEmpty()

        if (text.isBlank() || isHiddenPreview(text)) return

        val endpoint = CompanionPreferences.endpoint(this)
        val token = CompanionPreferences.token(this)
        if (!endpoint.startsWith("https://") || token.isNullOrBlank()) return

        sender.execute {
            forward(endpoint, token, title.ifBlank { "WhatsApp notification" }, text)
        }
    }

    override fun onDestroy() {
        sender.shutdown()
        super.onDestroy()
    }

    private fun isHiddenPreview(text: String): Boolean {
        val normalized = text.trim().lowercase()
        return normalized in HIDDEN_PREVIEWS ||
            normalized.matches(Regex("\\d+ new messages?( from .+)?")) ||
            normalized.matches(Regex("\\d+ messages? from .+"))
    }

    private fun forward(endpoint: String, token: String, senderName: String, text: String) {
        val url = URL("${endpoint.trimEnd('/')}/api/companion/events")
        val connection = (url.openConnection() as? HttpURLConnection) ?: return
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 8_000
            connection.readTimeout = 8_000
            connection.doOutput = true
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            val body = JSONObject()
                .put("sender", senderName.take(120))
                .put("text", text.take(4_000))
                .toString()
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            connection.responseCode
        } catch (_: Exception) {
            // Notification content is deliberately never written to logs.
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        private val WHATSAPP_PACKAGES = setOf("com.whatsapp", "com.whatsapp.w4b")
        private val HIDDEN_PREVIEWS = setOf(
            "whatsapp",
            "new message",
            "new messages",
            "message",
            "messages",
            "content hidden",
            "notification content hidden",
        )
    }
}
