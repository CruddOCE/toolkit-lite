// Builds the debug APK: syncs web/ into the Capacitor Android project, runs Gradle,
// and copies the result to dist/navapp-debug.apk. With --install it also pushes the
// APK to a connected phone (over Wi-Fi debugging on this PC, since USB adb does not
// work here) and launches it.
//
// JAVA_HOME and ANDROID_HOME are set for this process only, so nothing on the
// machine's global environment or PATH gets touched. Same approach as gatebreaker.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const DIST = path.join(ROOT, 'dist');
const APK_OUT = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const APK = path.join(DIST, 'navapp-debug.apk');
const APP_ID = 'com.example.navapp';

const LOCAL = process.env.LOCALAPPDATA || '';
// Java's Unix domain sockets fail under AppData on this PC ("Unable to establish
// loopback connection"), so Gradle is pointed at a gitignored folder inside the project.
const SOCKET_DIR = path.join(ROOT, '.jdk-sock');
const env = Object.assign({}, process.env, {
  JAVA_HOME: process.env.JAVA_HOME || path.join(LOCAL, 'Programs', 'jdk-21'),
  ANDROID_HOME: process.env.ANDROID_HOME || path.join(LOCAL, 'Android', 'Sdk'),
  JAVA_TOOL_OPTIONS: ((process.env.JAVA_TOOL_OPTIONS || '') + ' -Djdk.net.unixdomain.tmpdir=' + SOCKET_DIR).trim(),
});
const ADB = path.join(env.ANDROID_HOME, 'platform-tools', 'adb.exe');

function run(line, cwd) {
  console.log('> ' + line);
  // Pre-quoted command line through the shell: npx and gradlew are .cmd/.bat files,
  // which spawn cannot launch directly on Windows.
  const r = spawnSync(line, { cwd: cwd || ROOT, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error('Failed: ' + line + ' (exit ' + r.status + ')');
    process.exit(r.status || 1);
  }
}

function checkTools() {
  const missing = [];
  if (!fs.existsSync(path.join(env.JAVA_HOME, 'bin', 'java.exe'))) missing.push('Java 21 at ' + env.JAVA_HOME);
  if (!fs.existsSync(path.join(env.ANDROID_HOME, 'platforms'))) missing.push('Android SDK at ' + env.ANDROID_HOME);
  if (missing.length) {
    console.error('Missing build tools:\n  ' + missing.join('\n  '));
    process.exit(1);
  }
}

// The phone has no server, so the API base points at the PC on the same Wi-Fi.
// The Android build writes it into web/js/config.js, then puts the original back.
const CONFIG = path.join(ROOT, 'web', 'js', 'config.js');

function build() {
  checkTools();
  fs.mkdirSync(SOCKET_DIR, { recursive: true });
  const original = fs.readFileSync(CONFIG, 'utf8');
  const apiBase = process.env.NAV_API_BASE || '';
  if (apiBase) {
    if (!/^https?:\/\//.test(apiBase)) throw new Error('NAV_API_BASE must start with http:// or https://');
    fs.writeFileSync(CONFIG, original.replace("window.NAV_API_BASE = '';", "window.NAV_API_BASE = '" + apiBase + "';"));
    console.log('API base for this build: ' + apiBase);
  }
  try {
    run('npx cap sync android');
    run('"' + path.join(ANDROID, 'gradlew.bat') + '" assembleDebug', ANDROID);
  } finally {
    fs.writeFileSync(CONFIG, original);
  }
  fs.mkdirSync(DIST, { recursive: true });
  fs.copyFileSync(APK_OUT, APK);
  console.log('APK ready: ' + path.relative(ROOT, APK));
}

function install() {
  if (!fs.existsSync(APK)) throw new Error('no APK yet, run without --install first');
  // adb devices lists each connected phone; the Wi-Fi one shows as ip:port.
  const list = spawnSync(`"${ADB}" devices`, { env, shell: true, encoding: 'utf8' });
  // Windows adb prints CRLF line endings, so trim before matching the state column.
  const devices = (list.stdout || '').split('\n').slice(1).map((l) => l.trim()).filter((l) => /\sdevice$/.test(l));
  if (devices.length === 0) {
    console.error('No phone connected. Turn on Wireless debugging, then run: adb connect <ip:port>');
    process.exit(1);
  }
  // A phone can show up under more than one mDNS name; any one of them addresses the same device.
  // Prefer the entry without a "(2)" suffix; that is the plain service name adb accepts as -s.
  const pick = devices.find((d) => !/\(\d+\)/.test(d)) || devices[0];
  const serial = pick.replace(/\s+device$/, '');
  if (devices.length > 1) console.log('Several entries for the phone, using ' + serial);
  run(`"${ADB}" -s "${serial}" install -r "${APK}"`);
  run(`"${ADB}" -s "${serial}" shell monkey -p ${APP_ID} -c android.intent.category.LAUNCHER 1`);
}

if (process.argv.includes('--install')) {
  install();
} else {
  build();
}
