/**
 * Keeps the USB port forwards to a connected Android phone alive during
 * development:
 *   8081 → Metro (the JS bundle)
 *   5000 → the backend API
 *
 * `adb reverse` rules vanish whenever the USB connection resets (replugging,
 * switching USB mode, adb restarting, reinstalling the app), after which the
 * app can't reach the backend at 127.0.0.1:5000. This re-adds any missing
 * rule every few seconds.
 *
 *   npm run usb:watch     (leave it running in its own terminal)
 */
const { execFile } = require('child_process');

const PORTS = [8081, 5000];
const INTERVAL_MS = 3000;

function adb(args) {
  return new Promise((resolve) => {
    execFile('adb', args, { timeout: 5000 }, (err, stdout) => resolve(err ? null : stdout));
  });
}

let lastState = null;

async function check() {
  const devices = await adb(['devices']);
  if (devices === null) {
    report('adb not found — is Android platform-tools on your PATH?');
    return;
  }
  const connected = devices.split('\n').slice(1).some((line) => /\tdevice\s*$/.test(line));
  if (!connected) {
    report('Waiting for a phone on USB (with USB debugging allowed)…');
    return;
  }

  const list = (await adb(['reverse', '--list'])) ?? '';
  const missing = PORTS.filter((port) => !list.includes(`tcp:${port} tcp:${port}`));
  for (const port of missing) {
    await adb(['reverse', `tcp:${port}`, `tcp:${port}`]);
  }
  report(
    missing.length
      ? `Restored forward for port ${missing.join(' and ')}`
      : `Phone connected — forwarding ${PORTS.join(' and ')}`,
    missing.length > 0
  );
}

// Only print when something changes, so the terminal stays readable.
function report(message, always = false) {
  if (always || message !== lastState) {
    console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
  }
  lastState = message;
}

check();
setInterval(check, INTERVAL_MS);
