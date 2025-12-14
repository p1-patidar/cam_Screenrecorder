const { app, BrowserWindow, ipcMain, desktopCapturer, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        backgroundColor: '#0a0e27',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            enableRemoteModule: false,
            webSecurity: false,  // Disable for local development
            backgroundThrottling: false // Prevent throttling when minimized
        },
        title: 'Screen & Camera Recorder',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        show: false // Wait until ready-to-show
    });

    // Load the index.html
    mainWindow.loadFile('index.html');

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Open DevTools to see errors
    mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Handle media permissions - auto-allow all
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(true); // Allow all permissions
    });
}

// Streaming recording handlers
let recordingStream = null;
let recordingFilePath = null;

// Global input monitoring for camera mode switching
let globalInputMonitor = null;

// App lifecycle
app.whenReady().then(() => {
    // Register IPC handlers after app is ready
    ipcMain.handle('get-sources', async (event, opts) => {
        try {
            console.log('[Main] Getting desktop sources with opts:', opts);
            const sources = await desktopCapturer.getSources(opts);
            console.log('[Main] Found sources:', sources.length);
            return sources;
        } catch (error) {
            console.error('[Main] Error getting sources:', error);
            throw error;
        }
    });

    ipcMain.handle('write-file', async (event, filename, data) => {
        try {
            const tempDir = os.tmpdir();
            const filePath = path.join(tempDir, filename);
            console.log(`[Main] Writing file to ${filePath}`);
            const buffer = Buffer.from(data);
            fs.writeFileSync(filePath, buffer);
            console.log('[Main] File written successfully');
            return filePath;
        } catch (error) {
            console.error('[Main] Error writing file:', error);
            throw error;
        }
    });

    ipcMain.handle('start-recording-stream', async (event) => {
        try {
            const tempDir = os.tmpdir();
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `recording_stream_${timestamp}.webm`;
            recordingFilePath = path.join(tempDir, filename);

            console.log(`[Main] Starting recording stream to ${recordingFilePath}`);
            recordingStream = fs.createWriteStream(recordingFilePath);

            return recordingFilePath;
        } catch (error) {
            console.error('[Main] Error starting recording stream:', error);
            throw error;
        }
    });

    ipcMain.handle('write-recording-chunk', async (event, buffer) => {
        try {
            if (recordingStream) {
                const nodeBuffer = Buffer.from(buffer);
                const canWrite = recordingStream.write(nodeBuffer);

                if (!canWrite) {
                    await new Promise(resolve => recordingStream.once('drain', resolve));
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('[Main] Error writing recording chunk:', error);
            throw error;
        }
    });

    ipcMain.handle('stop-recording-stream', async (event) => {
        try {
            console.log('[Main] Stopping recording stream');
            return new Promise((resolve, reject) => {
                if (recordingStream) {
                    recordingStream.end(() => {
                        recordingStream = null;
                        console.log('[Main] Recording stream closed');
                        resolve(recordingFilePath);
                    });
                } else {
                    resolve(null);
                }
            });
        } catch (error) {
            console.error('[Main] Error stopping recording stream:', error);
            throw error;
        }
    });

    ipcMain.handle('convert-to-mp4', async (event, webmPath, mp4Filename, mimeType) => {
        return new Promise((resolve, reject) => {
            const downloadsPath = app.getPath('downloads');
            const mp4Path = path.join(downloadsPath, mp4Filename);
            console.log('[Main] Converting', webmPath, 'to', mp4Path, 'Source mime:', mimeType);

            let ffmpegCmd;

            if (mimeType && mimeType.includes('h264')) {
                console.log('[Main] Source is H.264, using fast remux (copy)');
                ffmpegCmd = `/opt/homebrew/bin/ffmpeg -i "${webmPath}" -c copy "${mp4Path}" -y`;
            } else {
                console.log('[Main] Source is not H.264, using hardware acceleration');
                ffmpegCmd = `/opt/homebrew/bin/ffmpeg -i "${webmPath}" -c:v h264_videotoolbox -b:v 6000k -c:a aac -b:a 192k "${mp4Path}" -y`;
            }

            exec(ffmpegCmd, (error, stdout, stderr) => {
                if (error) {
                    console.error('[Main] FFmpeg error:', error);
                    console.error('[Main] FFmpeg stderr:', stderr);

                    if (ffmpegCmd.includes('h264_videotoolbox')) {
                        console.log('[Main] Hardware encoding failed, falling back to software libx264');
                        const fallbackCmd = `/opt/homebrew/bin/ffmpeg -i "${webmPath}" -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 192k "${mp4Path}" -y`;
                        exec(fallbackCmd, (err2, out2, stderr2) => {
                            if (err2) {
                                reject(err2);
                            } else {
                                finishConversion();
                            }
                        });
                    } else {
                        reject(error);
                    }
                    return;
                }
                finishConversion();
            });

            function finishConversion() {
                console.log('[Main] Conversion complete');
                try {
                    fs.unlinkSync(webmPath);
                    console.log('[Main] Deleted temporary WebM file');
                } catch (e) {
                    console.warn('[Main] Could not delete WebM file:', e);
                }
                resolve(mp4Path);
            }
        });
    });

    ipcMain.handle('start-input-monitoring', async (event) => {
        console.log('[Main] Starting global input monitoring (powerMonitor)');

        if (globalInputMonitor) {
            clearInterval(globalInputMonitor);
        }

        const { powerMonitor } = require('electron');

        globalInputMonitor = setInterval(() => {
            const idleTime = powerMonitor.getSystemIdleTime();

            if (idleTime === 0) {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('global-input-activity');
                }
            }
        }, 200);

        return true;
    });

    ipcMain.handle('stop-input-monitoring', async (event) => {
        console.log('[Main] Stopping global input monitoring');
        if (globalInputMonitor) {
            clearInterval(globalInputMonitor);
            globalInputMonitor = null;
        }
        return true;
    });
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    // Register ESC as global shortcut to switch drawing toolkit to cursor mode
    globalShortcut.register('Escape', () => {
        if (drawingWindow && drawingWindow.isVisible()) {
            console.log('[Main] ESC pressed - switching to cursor mode');
            drawingWindow.setIgnoreMouseEvents(true, { forward: true });
            // Notify toolbar to update UI
            if (toolbarWindow) {
                toolbarWindow.webContents.send('force-cursor-mode');
            }
            // Also show toolbar if it's hidden
            if (toolbarWindow && !toolbarWindow.isVisible()) {
                toolbarWindow.show();
                toolbarWindow.setAlwaysOnTop(true, 'screen-saver');
            }
        }
    });

    // Cmd+T / Ctrl+T: Toggle toolbar visibility (when stuck with hidden toolbar)
    globalShortcut.register('CommandOrControl+T', () => {
        if (toolbarWindow) {
            if (toolbarWindow.isVisible()) {
                toolbarWindow.hide();
            } else {
                toolbarWindow.show();
                toolbarWindow.setAlwaysOnTop(true, 'screen-saver');
                toolbarWindow.moveTop();
            }
            console.log('[Main] Cmd+T - toggled toolbar visibility');
        }
    });

    // Cmd+Shift+W: Close toolkit entirely (emergency exit)
    globalShortcut.register('CommandOrControl+Shift+W', () => {
        console.log('[Main] Cmd+Shift+W - closing toolkit');
        if (toolbarWindow) toolbarWindow.hide();
        if (drawingWindow) drawingWindow.hide();
    });

    // Cmd+Shift+C: Clear whiteboard (when stuck with all-white screen)
    globalShortcut.register('CommandOrControl+Shift+C', () => {
        console.log('[Main] Cmd+Shift+C - clearing drawing');
        if (drawingWindow) {
            drawingWindow.webContents.send('clear');
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle media access
app.whenReady().then(() => {
    protocol = require('electron').protocol;
    protocol.registerFileProtocol('file', (request, callback) => {
        const pathname = decodeURI(request.url.replace('file:///', ''));
        callback(pathname);
    });
});
// Overlay Window Management
let overlayWindow = null;
let overlayState = {
    mode: 'mini', // 'mini' or 'full'
    shape: 'circle', // 'circle' or 'square'
    lastBounds: { width: 200, height: 200, x: 0, y: 0 } // Default size
};

function createOverlayWindow() {
    if (overlayWindow) return;

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Default position: Bottom-right
    const defaultSize = 200;
    const x = width - defaultSize - 20;
    const y = height - defaultSize - 20;

    overlayWindow = new BrowserWindow({
        width: defaultSize,
        height: defaultSize,
        x: x,
        y: y,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        type: 'panel', // Helps with staying on top
        hasShadow: false,
        resizable: false, // We handle resizing manually via IPC
        webPreferences: {
            nodeIntegration: true, // For simple IPC usage in overlay.js
            contextIsolation: false, // Simplifies overlay.js
            webSecurity: false
        },
        show: false,
        skipTaskbar: true
    });

    // Explicitly ensure it's recordable
    overlayWindow.setContentProtection(false);

    overlayWindow.loadFile('overlay.html');

    // overlayWindow.webContents.openDevTools({ mode: 'detach' });

    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });
}

ipcMain.on('open-overlay', (event, { deviceId, shape }) => {
    if (!overlayWindow) createOverlayWindow();

    overlayWindow.once('ready-to-show', () => {
        overlayWindow.setAlwaysOnTop(true, 'status'); // Ensure it's above drawing layer
        overlayWindow.show();
        overlayWindow.webContents.send('init-overlay', deviceId);
        // Use passed shape or saved state
        const initialShape = shape || overlayState.shape;
        overlayWindow.webContents.send('update-shape', initialShape);
    });

    // If already ready
    if (overlayWindow.isVisible()) {
        overlayWindow.webContents.send('init-overlay', deviceId);
        const currentShape = shape || overlayState.shape;
        overlayWindow.webContents.send('update-shape', currentShape);
    } else {
        overlayWindow.show();
    }
});

ipcMain.on('close-overlay', () => {
    if (overlayWindow) {
        overlayWindow.hide();
        // Don't destroy, just hide to keep state
    }
});

ipcMain.on('update-overlay-shape', (event, shape) => {
    overlayState.shape = shape;
    if (overlayWindow) {
        overlayWindow.webContents.send('update-shape', shape);
    }
});

ipcMain.on('resize-overlay', (event, { width, height }) => {
    if (overlayWindow && overlayState.mode === 'mini') {
        overlayWindow.setSize(width, height);
        // Save size for restoring later
        overlayState.lastBounds.width = width;
        overlayState.lastBounds.height = height;
    }
});

// Track the previous frontmost app for focus restoration
let previousFrontApp = null;

ipcMain.on('set-overlay-mode', (event, mode) => {
    if (!overlayWindow) return;

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();

    if (mode === 'full') {
        // Save current bounds before maximizing
        if (overlayState.mode === 'mini') {
            overlayState.lastBounds = overlayWindow.getBounds();
        }

        // Save the currently active app before going fullscreen
        exec(`osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`, (err, stdout) => {
            if (!err && stdout.trim()) {
                previousFrontApp = stdout.trim();
                console.log('[Main] Saved frontmost app:', previousFrontApp);
            }
        });

        // Use simpleFullscreen to keep it on the same space (so it gets recorded)
        overlayWindow.setSimpleFullScreen(true);
        // Also force bounds to full screen just in case
        const { width, height } = primaryDisplay.bounds;
        overlayWindow.setBounds({ x: 0, y: 0, width, height });

        // Ensure it's on top (standard level to be visible to recorder)
        overlayWindow.setAlwaysOnTop(true);

        // Force square shape for full screen
        overlayWindow.webContents.send('update-shape', 'square');

        // Hide toolkit if visible
        if (toolbarWindow && toolbarWindow.isVisible()) {
            wasToolkitVisible = true;
            toolbarWindow.hide();
            if (drawingWindow) drawingWindow.hide();
        }

    } else if (mode === 'mini') {
        // Restore
        overlayWindow.setSimpleFullScreen(false);
        overlayWindow.setAlwaysOnTop(true); // Restore normal level

        if (overlayState.mode === 'full') {
            overlayWindow.setBounds(overlayState.lastBounds);

            // Restore focus to the previous app (not our app window)
            if (previousFrontApp && previousFrontApp !== 'Electron' && previousFrontApp !== 'Screen & Camera Recorder') {
                console.log('[Main] Restoring focus to:', previousFrontApp);
                exec(`osascript -e 'tell application "${previousFrontApp}" to activate'`, (err) => {
                    if (err) console.warn('[Main] Failed to restore focus:', err);
                });
            }
        }

        // Restore toolkit if it was visible
        if (wasToolkitVisible) {
            if (toolbarWindow) toolbarWindow.show();
            if (drawingWindow) drawingWindow.show();
            wasToolkitVisible = false;
        }
    }
    overlayState.mode = mode;
});

// --- Toolkit Management ---

let toolbarWindow = null;
let drawingWindow = null;
let wasToolkitVisible = false;

function createToolbarWindow() {
    if (toolbarWindow) return;

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.bounds;
    const toolbarWidth = 1000; // Wider default

    toolbarWindow = new BrowserWindow({
        width: toolbarWidth,
        height: 60,
        minWidth: 800, // Prevent squishing
        x: Math.round((screenWidth - toolbarWidth) / 2),
        y: 50, // Top of screen
        type: 'panel', // 'panel' type can appear over fullscreen on macOS
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: true, // Allow resizing
        hasShadow: false,
        visibleOnAllWorkspaces: true, // Show on all Spaces including fullscreen apps
        fullscreenable: false, // Don't allow this window to go fullscreen
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false
    });

    toolbarWindow.loadFile('toolbar.html');

    // CRITICAL: Exclude from screen capture
    // toolbarWindow.setContentProtection(true); // Commented out for debugging - might be hiding other windows?

    toolbarWindow.on('closed', () => {
        toolbarWindow = null;
        if (drawingWindow) drawingWindow.close();
    });
}

function createDrawingWindow() {
    if (drawingWindow) return;

    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    // Leave space at top for toolbar (toolbar is at y:50 with height 60)
    const toolbarAreaHeight = 120;

    drawingWindow = new BrowserWindow({
        x: 0,
        y: toolbarAreaHeight, // Start below toolbar area
        width: width,
        height: height - toolbarAreaHeight, // Reduce height to not exceed screen
        transparent: true,
        frame: false,
        hasShadow: false,
        type: 'panel', // 'panel' type can appear over fullscreen on macOS
        alwaysOnTop: true, // Will be below toolbar
        enableLargerThanScreen: true,
        visibleOnAllWorkspaces: true, // Show on all Spaces including fullscreen apps
        fullscreenable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false
    });

    // Explicitly ensure it's recordable
    drawingWindow.setContentProtection(false);

    drawingWindow.loadFile('drawing.html');

    // Default to cursor mode (ignore mouse events, clicks pass through)
    // User must select a drawing tool to enable drawing
    drawingWindow.setIgnoreMouseEvents(true, { forward: true });

    drawingWindow.on('closed', () => {
        drawingWindow = null;
    });
}

ipcMain.on('toggle-toolkit', () => {
    if (!toolbarWindow) createToolbarWindow();
    if (!drawingWindow) createDrawingWindow();

    if (toolbarWindow.isVisible()) {
        toolbarWindow.hide();
        drawingWindow.hide();
    } else {
        toolbarWindow.show();
        drawingWindow.show();
        // Ensure drawing window is below toolbar but above everything else
        // On macOS, 'screen-saver' level appears over fullscreen apps
        // We want Toolbar > Drawing > Screen

        // Use screen-saver level to appear over fullscreen apps
        toolbarWindow.setAlwaysOnTop(true, 'screen-saver');
        drawingWindow.setAlwaysOnTop(true, 'screen-saver');

        // Bring toolbar to front just in case
        toolbarWindow.moveTop();
    }
});

ipcMain.on('toolkit-action', (event, action) => {
    // Forward action to drawing window
    if (drawingWindow) {
        if (action.type === 'set-tool') {
            drawingWindow.webContents.send('set-tool', action.tool);
        } else if (action.type === 'set-color') {
            drawingWindow.webContents.send('set-color', action.color);
        } else if (action.type === 'clear') {
            drawingWindow.webContents.send('clear');
        } else if (action.type === 'set-background') {
            drawingWindow.webContents.send('set-background', action.color);
        } else if (action.type === 'set-size') {
            drawingWindow.webContents.send('set-size', action.size);
        } else if (action.type === 'resize-toolbar') {
            if (toolbarWindow) {
                // Get current screen center to keep it centered
                const { screen } = require('electron');
                const primaryDisplay = screen.getPrimaryDisplay();
                const { width: screenWidth } = primaryDisplay.bounds;

                // Allow resizing smaller than minWidth for minimize
                if (action.width < 100) {
                    toolbarWindow.setMinimumSize(50, 50);
                } else {
                    toolbarWindow.setMinimumSize(800, 60);
                }

                toolbarWindow.setSize(action.width, action.height);
                toolbarWindow.setPosition(Math.round((screenWidth - action.width) / 2), 50);
            }
        } else if (action.type === 'close') {
            if (toolbarWindow) toolbarWindow.hide();
            if (drawingWindow) drawingWindow.hide();
        }
    }
});

ipcMain.on('set-drawing-ignore-mouse', (event, ignore) => {
    if (drawingWindow) {
        if (ignore) {
            // forward: true means mouse move events are still forwarded (optional)
            drawingWindow.setIgnoreMouseEvents(true, { forward: true });
        } else {
            drawingWindow.setIgnoreMouseEvents(false);
        }
    }
});
