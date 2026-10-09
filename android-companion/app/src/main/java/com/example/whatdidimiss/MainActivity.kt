package com.example.whatdidimiss

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    private lateinit var endpointInput: EditText
    private lateinit var tokenInput: EditText
    private lateinit var forwardingToggle: CheckBox

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        renderSettings()
    }

    private fun renderSettings() {
        val padding = (20 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
        }

        layout.addView(TextView(this).apply {
            text = "What Did I Miss? Companion"
            textSize = 24f
        })
        layout.addView(TextView(this).apply {
            text = "Only WhatsApp notification previews are forwarded, and only while forwarding is enabled. Hidden previews are skipped."
            textSize = 15f
            setPadding(0, padding / 2, 0, padding)
        })

        endpointInput = EditText(this).apply {
            hint = "HTTPS backend URL, e.g. https://your-host"
            setSingleLine(true)
            setText(CompanionPreferences.endpoint(this@MainActivity))
        }
        layout.addView(endpointInput, matchWidth())

        tokenInput = EditText(this).apply {
            hint = "Device bearer token"
            setSingleLine(true)
            inputType = 129
            transformationMethod = android.text.method.PasswordTransformationMethod.getInstance()
        }
        layout.addView(tokenInput, matchWidth())

        forwardingToggle = CheckBox(this).apply {
            text = "Forward WhatsApp notifications"
            isChecked = CompanionPreferences.enabled(this@MainActivity)
        }
        layout.addView(forwardingToggle)

        layout.addView(Button(this).apply {
            text = "Save settings"
            setOnClickListener { saveSettings() }
        })
        layout.addView(Button(this).apply {
            text = "Grant notification access"
            setOnClickListener { startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }
        })
        layout.addView(Button(this).apply {
            text = "Pause and disconnect"
            setOnClickListener {
                forwardingToggle.isChecked = false
                tokenInput.setText("")
                CompanionPreferences.save(this@MainActivity, endpointInput.text.toString(), "", false)
                Toast.makeText(this@MainActivity, "Forwarding paused and token removed", Toast.LENGTH_SHORT).show()
            }
        })

        setContentView(layout)
    }

    private fun saveSettings() {
        val endpoint = endpointInput.text.toString().trim()
        val token = tokenInput.text.toString().trim()
        if (!endpoint.startsWith("https://") || token.isBlank()) {
            Toast.makeText(this, "Enter an HTTPS backend URL and device token", Toast.LENGTH_LONG).show()
            return
        }

        CompanionPreferences.save(this, endpoint, token, forwardingToggle.isChecked)
        tokenInput.setText("")
        Toast.makeText(this, "Settings saved", Toast.LENGTH_SHORT).show()
    }

    private fun matchWidth() = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply {
        bottomMargin = (10 * resources.displayMetrics.density).toInt()
    }
}
