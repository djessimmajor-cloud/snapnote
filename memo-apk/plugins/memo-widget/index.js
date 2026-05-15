const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const withMemoWidget = (config) => {
  // 1. Copie les fichiers res + kotlin dans le projet Android
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const pluginDir = path.join(__dirname, 'android', 'src', 'main');
      const androidDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main');

      // res
      copyDir(path.join(pluginDir, 'res'), path.join(androidDir, 'res'));

      // kotlin
      const ktSrc = path.join(pluginDir, 'kotlin', 'com', 'djess', 'memo', 'MemoWidget.kt');
      const ktDest = path.join(androidDir, 'java', 'com', 'djess', 'memo', 'MemoWidget.kt');
      fs.mkdirSync(path.dirname(ktDest), { recursive: true });
      fs.copyFileSync(ktSrc, ktDest);

      return cfg;
    },
  ]);

  // 2. Injecte le receiver dans AndroidManifest.xml
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    if (!app.receiver) app.receiver = [];

    const alreadyAdded = app.receiver.some(
      (r) => r.$?.['android:name'] === 'com.djess.memo.MemoWidget'
    );

    if (!alreadyAdded) {
      app.receiver.push({
        $: {
          'android:name': 'com.djess.memo.MemoWidget',
          'android:exported': 'true',
          'android:label': 'Mémo Widget',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/widget_info',
            },
          },
        ],
      });
    }

    return cfg;
  });

  return config;
};

module.exports = withMemoWidget;
