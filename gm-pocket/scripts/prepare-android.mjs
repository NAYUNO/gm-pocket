// Génère et personnalise le projet Android (dossier android/, non versionné).
// Utilisé par la compilation automatique GitHub ; peut aussi tourner en local.
//   - crée le projet Capacitor s'il n'existe pas
//   - icônes et écran de démarrage depuis mobile/assets
//   - thème bleu roi / or, splash Android 12+, permissions micro + appareil photo
//   - signature avec mobile/gmpocket.keystore (pour pouvoir mettre à jour l'appli sans la désinstaller)
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(root, 'android');
const res = path.join(android, 'app/src/main/res');
const mobile = path.join(root, 'mobile');

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function patch(file, fn) {
  const before = readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) writeFileSync(file, after);
}

// 1. Projet Android
if (!existsSync(android)) run('npx', ['cap', 'add', 'android']);

// 2. Icônes + image de démarrage (Android 11 et moins)
run('npx', [
  '--yes', '@capacitor/assets@3.0.5', 'generate', '--android', '--assetPath', 'mobile/assets',
  '--iconBackgroundColor', '#0e1f5b', '--iconBackgroundColorDark', '#0e1f5b',
  '--splashBackgroundColor', '#0e1f5b', '--splashBackgroundColorDark', '#0e1f5b',
]);
// Les variantes « mode sombre » sont identiques : inutile de les embarquer.
for (const d of readdirSync(res)) if (d.includes('night')) rmSync(path.join(res, d), { recursive: true, force: true });

// 3. Thème, couleurs, icône du splash Android 12+
copyFileSync(path.join(mobile, 'styles.xml'), path.join(res, 'values/styles.xml'));
copyFileSync(path.join(mobile, 'colors.xml'), path.join(res, 'values/colors.xml'));
mkdirSync(path.join(res, 'drawable-nodpi'), { recursive: true });
copyFileSync(path.join(mobile, 'assets/splash-icon.png'), path.join(res, 'drawable-nodpi/splash_icon.png'));
patch(path.join(res, 'values/ic_launcher_background.xml'), (s) => s.replace(/#[0-9A-Fa-f]{6}/, '#0E1F5B'));

// 4. Permissions : appareil photo (livrets) et micro (questions à l'oral)
patch(path.join(android, 'app/src/main/AndroidManifest.xml'), (s) =>
  s.includes('RECORD_AUDIO')
    ? s
    : s.replace(
        '<uses-permission android:name="android.permission.INTERNET" />',
        `<uses-permission android:name="android.permission.INTERNET" />
    <!-- Photos des livrets de règles -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <!-- Questions à l'oral (reconnaissance vocale) -->
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <queries>
        <intent>
            <action android:name="android.speech.RecognitionService" />
        </intent>
        <intent>
            <action android:name="android.intent.action.TTS_SERVICE" />
        </intent>
    </queries>`
      )
);

// 5. Version + signature
const versionCode = Number(process.env.VERSION_CODE || 1);
patch(path.join(android, 'app/build.gradle'), (s) => {
  s = s.replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]*"/, `versionName "1.0.${versionCode}"`);
  if (!s.includes('signingConfigs')) {
    s = s.replace(
      '    buildTypes {',
      `    signingConfigs {
        gmpocket {
            storeFile file('../../mobile/gmpocket.keystore')
            storePassword 'gmpocket'
            keyAlias 'gmpocket'
            keyPassword 'gmpocket'
        }
    }
    buildTypes {`
    );
    s = s.replace('            minifyEnabled false', `            minifyEnabled false
            signingConfig signingConfigs.gmpocket`);
  }
  return s;
});

console.log(`Projet Android prêt (version 1.0.${versionCode}).`);
