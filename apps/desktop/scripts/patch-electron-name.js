// Patches the dev Electron binary's Info.plist so macOS menu bar shows "Ontograph" instead of "Electron"
// Also copies the app icon into the bundle so the dock shows the correct icon in dev mode.
// Note: the dock tooltip will still say "Electron" in dev — this is expected and fine.
const { execFileSync } = require('child_process');
const { existsSync, copyFileSync } = require('fs');
const path = require('path');

if (process.platform !== 'darwin') process.exit(0);

const electronApp = path.resolve('node_modules/electron/dist/Electron.app');
const plist = `${electronApp}/Contents/Info.plist`;
if (!existsSync(plist)) process.exit(0);

try {
  execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set CFBundleName Ontograph', plist]);
  execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Set CFBundleDisplayName Ontograph', plist]);
} catch {
  // Non-fatal — only affects dev menu bar label
}

// Copy app icon into the Electron.app bundle for dev dock icon
const srcIcon = path.resolve('build/icon.icns');
const destIcon = `${electronApp}/Contents/Resources/electron.icns`;
if (existsSync(srcIcon) && existsSync(`${electronApp}/Contents/Resources`)) {
  try {
    copyFileSync(srcIcon, destIcon);
    execFileSync('touch', [electronApp]);
  } catch {
    // Non-fatal
  }
}
