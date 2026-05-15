package com.djess.memo

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MemoWidgetModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "MemoWidget"

    @ReactMethod
    fun updateWidget(text: String, timestamp: Double) {
        val ctx: Context = reactContext
        val prefs: SharedPreferences = ctx.getSharedPreferences("memo_widget_prefs", Context.MODE_PRIVATE)

        val date = SimpleDateFormat("d MMM · HH:mm", Locale.FRENCH).format(Date(timestamp.toLong()))
        prefs.edit()
            .putString("last_memo", text)
            .putString("last_date", date)
            .apply()

        val manager = AppWidgetManager.getInstance(ctx)
        val ids = manager.getAppWidgetIds(ComponentName(ctx, MemoWidget::class.java))
        for (id in ids) {
            MemoWidget.updateWidget(ctx, manager, id)
        }
    }
}
