package com.example.whatdidimiss

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object CompanionPreferences {
    private const val PREFS = "companion_settings"
    private const val KEY_ALIAS = "what_did_i_miss_companion_token"
    private const val TOKEN = "encrypted_token"
    private const val TOKEN_IV = "token_iv"
    private const val ENDPOINT = "endpoint"
    private const val ENABLED = "forwarding_enabled"

    fun endpoint(context: Context): String = prefs(context).getString(ENDPOINT, "") ?: ""
    fun enabled(context: Context): Boolean = prefs(context).getBoolean(ENABLED, false)

    fun save(context: Context, endpoint: String, token: String, enabled: Boolean) {
        val encrypted = encrypt(token)
        prefs(context).edit()
            .putString(ENDPOINT, endpoint.trim().trimEnd('/'))
            .putString(TOKEN, Base64.encodeToString(encrypted.first, Base64.NO_WRAP))
            .putString(TOKEN_IV, Base64.encodeToString(encrypted.second, Base64.NO_WRAP))
            .putBoolean(ENABLED, enabled)
            .apply()
    }

    fun token(context: Context): String? {
        val settings = prefs(context)
        val cipherText = settings.getString(TOKEN, null) ?: return null
        val iv = settings.getString(TOKEN_IV, null) ?: return null
        return runCatching {
            decrypt(
                Base64.decode(cipherText, Base64.NO_WRAP),
                Base64.decode(iv, Base64.NO_WRAP),
            )
        }.getOrNull()
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun encrypt(value: String): Pair<ByteArray, ByteArray> {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        return cipher.doFinal(value.toByteArray(Charsets.UTF_8)) to cipher.iv
    }

    private fun decrypt(value: ByteArray, iv: ByteArray): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(value), Charsets.UTF_8)
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }
}
