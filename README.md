# Screen & Camera Recorder - Desktop App

## Running the App

### Development Mode
To run the app in development mode:
```bash
cd "/Users/pp/Desktop/Mini Project/cam_Screenrecorder"
npm start
```

### Building the App

To create a standalone macOS application:
```bash
npm run build
```

This will create:
- A `.dmg` installer in the `dist` folder
- A `.zip` file with the app

After building, you can:
1. Double-click the `.dmg` file to install
2. Drag the app to your Applications folder
3. Launch from Applications like any other Mac app

### Building for All Platforms
```bash
npm run build:all
```
This builds for macOS, Windows, and Linux.

## Installation

1. **Build the app** (see above)
2. **Open the DMG** file from the `dist` folder
3. **Drag** the app to your Applications folder
4. **Launch** from Applications

## Features

All web features are preserved in the desktop app:
- ✅ Screen recording
- ✅ Camera overlay with smart view switching
- ✅ Draggable camera position
- ✅ Device selection (camera & microphone)
- ✅ Live preview
- ✅ HD quality recording

## Permissions

On first launch, macOS will ask for:
- **Screen Recording** permission
- **Camera** permission
- **Microphone** permission

Grant all permissions for the app to work properly.

## File Structure

```
cam_Screenrecorder/
├── main.js           # Electron main process
├── index.html        # App UI
├── style.css         # Styling
├── recorder.js       # Recording logic
├── package.json      # App configuration
├── assets/
│   └── icon.png     # App icon
└── dist/            # Build output (after building)
```

## Troubleshooting

### App won't open
- Right-click the app → Open → Click "Open" in the dialog
- Go to System Preferences → Security & Privacy → Allow the app

### No camera/mic devices showing
- Check System Preferences → Security & Privacy → Camera/Microphone
- Make sure the app has permissions

### Build fails
- Make sure you have Xcode Command Line Tools installed:
  ```bash
  xcode-select --install
  ```

## Development

The app is built with:
- **Electron** - Desktop app framework
- **HTML/CSS/JS** - Web technologies
- **Canvas API** - Video compositing
- **MediaRecorder** - Recording engine

## Updates

To update the app code:
1. Edit the files (index.html, style.css, recorder.js)
2. Run `npm start` to test
3. Run `npm run build` to create new build

---

Made with ❤️ using Electron
