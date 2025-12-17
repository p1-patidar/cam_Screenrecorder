const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Script loaded');
console.log('[Preload] ipcRenderer available:', !!ipcRenderer);

// Expose IPC method to get desktop sources from main process
contextBridge.exposeInMainWorld('electronAPI', {
    getSources: (opts) => {
        console.log('[Preload] getSources called, sending to main process with opts:', opts);
        return ipcRenderer.invoke('get-sources', opts);
    },
    writeFile: (filePath, data) => {
        console.log('[Preload] writeFile called');
        return ipcRenderer.invoke('write-file', filePath, data);
    },
    startRecordingStream: () => {
        console.log('[Preload] startRecordingStream called');
        return ipcRenderer.invoke('start-recording-stream');
    },
    writeRecordingChunk: (buffer) => {
        // console.log('[Preload] writeRecordingChunk called'); // Commented out to avoid spam
        return ipcRenderer.invoke('write-recording-chunk', buffer);
    },
    stopRecordingStream: () => ipcRenderer.invoke('stop-recording-stream'),
    convertToMP4: (webmPath, mp4Filename, mimeType) => ipcRenderer.invoke('convert-to-mp4', webmPath, mp4Filename, mimeType),

    // Native Recording API
    startNativeRecording: (micLabel) => ipcRenderer.invoke('start-native-recording', micLabel),
    stopNativeRecording: () => ipcRenderer.invoke('stop-native-recording'),

    // Toolbar Control Routing
    onControlAction: (callback) => ipcRenderer.on('control-action', (event, action) => callback(action)),
    sendRecordingState: (state) => ipcRenderer.send('recording-state-update', state),

    startInputMonitoring: () => {
        return ipcRenderer.invoke('start-input-monitoring');
    },
    stopInputMonitoring: () => {
        return ipcRenderer.invoke('stop-input-monitoring');
    },
    onGlobalInputActivity: (callback) => {
        ipcRenderer.on('global-input-activity', callback);
    },

    // Overlay controls
    openOverlay: (data) => ipcRenderer.send('open-overlay', data),
    closeOverlay: () => ipcRenderer.send('close-overlay'),
    updateOverlayShape: (shape) => ipcRenderer.send('update-overlay-shape', shape),
    setOverlayMode: (mode) => ipcRenderer.send('set-overlay-mode', mode),

    // Toolkit controls
    toggleToolkit: () => ipcRenderer.send('toggle-toolkit')
});

console.log('[Preload] electronAPI exposed to window');
