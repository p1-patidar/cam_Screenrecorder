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
    stopRecordingStream: () => {
        console.log('[Preload] stopRecordingStream called');
        return ipcRenderer.invoke('stop-recording-stream');
    },
    convertToMP4: (webmPath, mp4Path) => {
        console.log('[Preload] convertToMP4 called');
        return ipcRenderer.invoke('convert-to-mp4', webmPath, mp4Path);
    },
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
