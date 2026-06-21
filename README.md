# Screen & Camera Recorder

A native-feeling desktop screen and camera recorder for macOS, built with Electron. Supports simultaneous screen + camera capture with a floating toolbar/overlay and intelligent camera view switching.

## What It Does

- Records the screen and webcam (with overlay/picture-in-picture style camera view)
- Floating toolbar (`toolbar.html`/`toolbar.js`) and overlay window (`overlay.html`/`overlay.js`) for in-recording controls
- Drawing/annotation layer during recording (`drawing.html`/`drawing.js`)
- Native macOS recorder integration (`native-recorder/NativeRecorder.js`, device enumeration via `device-utils.js`)
- Packaged as a standalone macOS app (DMG/ZIP) via Electron Builder, with Windows/Linux build targets also configured

## Tech Stack

- **Framework:** Electron
- **Language:** JavaScript (Node.js + Chromium renderer)
- **Packaging:** electron-builder (mac/win/linux targets)
- **Platform integration:** macOS entitlements (`entitlements.mac.plist`), `Info.plist`

## How to Run

```bash
# Install dependencies
npm install

# Run in development mode
npm start
```

Build a distributable app:
```bash
npm run build        # macOS only (.dmg + .zip in dist/)
npm run build:all     # macOS, Windows, and Linux
```

After building, open the `.dmg` from `dist/` and drag the app into Applications.

There is also a convenience launcher, `Start Recorder.command`, for double-click startup on macOS during development.

## Project Structure

```
main.js                  # Electron main process
preload.js               # Preload script (renderer <-> main bridge)
recorder.js               # Core recording logic
index.html / style.css    # Main app window
toolbar.html / toolbar.js  # Floating recording controls
overlay.html / overlay.js  # Camera overlay window
drawing.html / drawing.js  # Annotation layer
native-recorder/           # macOS-native recording helpers, device utilities
test-devices.js            # Device enumeration test script
assets/                    # App icon
```
