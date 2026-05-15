package com.djess.memo

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri

class MemoWidget : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            updateWidget(context, appWidgetManager, id)
        }
    }

    companion object {
        fun updateWidget(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int) {
            val prefs: SharedPreferences = context.getSharedPreferences("memo_widget_prefs", Context.MODE_PRIVATE)
            val text = prefs.getString("last_memo", null)
            val date = prefs.getString("last_date", "")

            val views = RemoteViews(context.packageName, R.layout.widget_memo)

            if (text.isNullOrBlank()) {
                views.setTextViewText(R.id.widget_text, "Aucun mémo")
                views.setTextViewText(R.id.widget_date, "")
            } else {
                val display = if (text.length > 120) text.take(120) + "…" else text
                views.setTextViewText(R.id.widget_text, display)
                views.setTextViewText(R.id.widget_date, date ?: "")
            }

            // Tap → ouvre l'app
            val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            val pending = PendingIntent.getActivity(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.widget_root, pending)

            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }
}
