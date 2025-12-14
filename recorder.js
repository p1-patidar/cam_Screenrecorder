// Application State
const state = {
    screenStream: null,
    cameraStream: null,
    localCameraStream: null, // For direct recording
    audioStream: null,
    // Recording state
    isRecording: false,
    mediaRecorder: null,
    recordedChunks: [],
    recordedBlob: null,
    recordedUrl: null,
    startTime: 0,
    timerInterval: null,
    inactivityTimer: null,
    lastInputTime: 0,

    // Overlay settings (persistent)
    overlayShape: 'circle', // 'circle' or 'square'
    overlaySize: 150, // Size in pixels

    // Quality settings (persistent)
    resolution: 'native', // 'native', '1080', '720'
    videoBitrate: 8000000, // 8 Mbps
    audioBitrate: 256000 // 256 kbps
};

const MIN_SIZE = 100;
const MAX_SIZE = 500;
const RESIZE_MARGIN = 15; // Pixels from edge to trigger resize cursor

// Canvas and context
let canvas, ctx;
let previewCanvas, previewCtx;

// Camera dimensions for full view (camera-only mode)
const FULL_WIDTH = 300;
const FULL_HEIGHT = 225;
const MARGIN = 20;

// DOM Elements
let cameraSelect, micSelect, startBtn, stopBtn, downloadBtn, statusText, timer, inactivityTimeoutInput;
let resolutionSelect, videoBitrateSelect, audioBitrateSelect;
let overlayShapeRadios, overlaySizeValue;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Renderer] DOMContentLoaded');
    console.log('[Renderer] window.electronAPI available:', !!window.electronAPI);

    // Check if electronAPI is available
    if (!window.electronAPI) {
        console.error('[Renderer] electronAPI not available! Preload script may not have loaded.');
        alert('Error: Electron API not available. Please run the app using "npm start" instead of the built version.');
        return;
    }

    // Get DOM elements
    cameraSelect = document.getElementById('cameraSelect');
    micSelect = document.getElementById('micSelect');
    startBtn = document.getElementById('startBtn');
    stopBtn = document.getElementById('stopBtn');
    downloadBtn = document.getElementById('downloadBtn');
    toolkitBtn = document.getElementById('toolkitBtn'); // Get toolkitBtn
    videoSelectBtn = document.getElementById('videoSelectBtn'); // Get videoSelectBtn
    statusText = document.getElementById('statusText');
    timer = document.getElementById('timer');

    inactivityTimeoutInput = document.getElementById('inactivityTimeout');
    resolutionSelect = document.getElementById('resolutionSelect');
    videoBitrateSelect = document.getElementById('videoBitrateSelect');
    audioBitrateSelect = document.getElementById('audioBitrateSelect');
    overlayShapeRadios = document.getElementsByName('overlayShape');
    // overlaySizeValue = document.getElementById('overlay-size-value'); // Not in HTML
    previewCanvas = document.getElementById('previewCanvas');
    previewCtx = previewCanvas.getContext('2d');

    // Toolkit Toggle
    if (toolkitBtn) {
        toolkitBtn.addEventListener('click', () => {
            window.electronAPI.toggleToolkit();
        });
    }

    // Add event listeners for device selection
    if (cameraSelect) {
        cameraSelect.addEventListener('change', () => {
            saveDeviceSettings();
            initializeStreams();
        });
    }
    if (micSelect) {
        micSelect.addEventListener('change', () => {
            saveDeviceSettings();
            initializeStreams();
        });
    }

    // Initialize UI
    startBtn.disabled = false;

    // Load overlay settings from localStorage
    loadOverlaySettings();

    // Load inactivity settings from localStorage
    loadInactivitySettings();
    inactivityTimeoutInput.addEventListener('change', saveInactivitySettings);

    // Load quality settings from localStorage
    loadQualitySettings();

    // Event listeners for quality settings
    resolutionSelect.addEventListener('change', onQualitySettingChange);
    videoBitrateSelect.addEventListener('change', onQualitySettingChange);
    audioBitrateSelect.addEventListener('change', onQualitySettingChange);

    // Enumerate devices
    await enumerateDevices();

    // Event listeners
    startBtn.addEventListener('click', startRecording);
    stopBtn.addEventListener('click', stopRecording);
    downloadBtn.addEventListener('click', downloadVideo);

    // Overlay settings event listeners
    overlayShapeRadios.forEach(radio => {
        radio.addEventListener('change', onOverlayShapeChange);
    });

    // Listen for global input activity from main process
    window.electronAPI.onGlobalInputActivity(() => {
        onUserInput();
    });
});

// Enumerate available media devices
async function enumerateDevices() {
    try {
        // First, request permissions to access camera and microphone
        // This is required for device labels to be visible
        updateStatus('Requesting permissions...');

        let permissionStream;
        try {
            permissionStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
        } catch (permError) {
            console.warn('Initial permission request failed:', permError);
            updateStatus('Please grant camera and microphone permissions');
            // Show alert to guide user
            alert('Please grant camera and microphone permissions to see available devices.\n\nClick "Start Recording" to try again.');
            return;
        }

        // Now enumerate devices - labels will be available
        const devices = await navigator.mediaDevices.enumerateDevices();

        // Stop the permission stream
        permissionStream.getTracks().forEach(track => track.stop());

        // Clear existing options (keep the placeholder)
        cameraSelect.innerHTML = '<option value="">Select Camera...</option>';
        micSelect.innerHTML = '<option value="">Select Microphone...</option>';

        // Filter cameras
        const cameras = devices.filter(device => device.kind === 'videoinput');
        cameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            option.text = camera.label || `Camera ${cameraSelect.length + 1}`;
            cameraSelect.appendChild(option);
        });

        // Filter microphones
        const mics = devices.filter(device => device.kind === 'audioinput');
        mics.forEach(mic => {
            const option = document.createElement('option');
            option.value = mic.deviceId;
            option.text = mic.label || `Microphone ${micSelect.length + 1}`;
            micSelect.appendChild(option);
        });

        // Load saved device settings
        loadDeviceSettings();

        // If no camera selected (no saved setting or saved device missing), select first available
        if (!cameraSelect.value && cameras.length > 0) {
            cameraSelect.selectedIndex = 1; // Index 0 is placeholder
        }

        // If no mic selected, select first available
        if (!micSelect.value && mics.length > 0) {
            micSelect.selectedIndex = 1;
        }

        // Initialize streams if devices are selected
        if (cameraSelect.value && micSelect.value) {
            initializeStreams();
        }

        updateStatus('Ready to record');

    } catch (error) {
        console.error('Error enumerating devices:', error);
        updateStatus('Error finding devices: ' + error.message);
    }
}

// Save device selection to localStorage
function saveDeviceSettings() {
    if (cameraSelect.value) localStorage.setItem('selectedCamera', cameraSelect.value);
    if (micSelect.value) localStorage.setItem('selectedMic', micSelect.value);
}

// Load device selection from localStorage
function loadDeviceSettings() {
    const savedCamera = localStorage.getItem('selectedCamera');
    const savedMic = localStorage.getItem('selectedMic');

    if (savedCamera) {
        // Check if the saved camera still exists
        const exists = Array.from(cameraSelect.options).some(opt => opt.value === savedCamera);
        if (exists) cameraSelect.value = savedCamera;
    }

    if (savedMic) {
        // Check if the saved mic still exists
        const exists = Array.from(micSelect.options).some(opt => opt.value === savedMic);
        if (exists) micSelect.value = savedMic;
    }
}

// Load overlay settings from localStorage
function loadOverlaySettings() {
    try {
        const savedShape = localStorage.getItem('overlayShape');
        const savedSize = localStorage.getItem('overlaySize');

        if (savedShape) {
            state.overlayShape = savedShape;
            // Update radio button
            overlayShapeRadios.forEach(radio => {
                radio.checked = radio.value === savedShape;
            });
        }

        if (savedSize) {
            state.overlaySize = parseInt(savedSize);
        }

        console.log('[Settings] Loaded overlay settings:', state.overlayShape, state.overlaySize);
    } catch (error) {
        console.error('[Settings] Error loading overlay settings:', error);
    }
}

// Save overlay settings to localStorage
function saveOverlaySettings() {
    try {
        localStorage.setItem('overlayShape', state.overlayShape);
        localStorage.setItem('overlaySize', state.overlaySize.toString());
        console.log('[Settings] Saved overlay settings:', state.overlayShape, state.overlaySize);
    } catch (error) {
        console.error('[Settings] Error saving overlay settings:', error);
    }
}

// Handle overlay shape change
function onOverlayShapeChange(event) {
    state.overlayShape = event.target.value;
    saveOverlaySettings();
    window.electronAPI.updateOverlayShape(state.overlayShape);
    console.log('[Settings] Overlay shape changed to:', state.overlayShape);
}

// Load quality settings from localStorage
function loadQualitySettings() {
    const savedResolution = localStorage.getItem('resolution');
    const savedVideoBitrate = localStorage.getItem('videoBitrate');
    const savedAudioBitrate = localStorage.getItem('audioBitrate');

    if (savedResolution) {
        state.resolution = savedResolution;
        resolutionSelect.value = savedResolution;
    }
    if (savedVideoBitrate) {
        state.videoBitrate = parseInt(savedVideoBitrate);
        videoBitrateSelect.value = savedVideoBitrate;
    }
    if (savedAudioBitrate) {
        state.audioBitrate = parseInt(savedAudioBitrate);
        audioBitrateSelect.value = savedAudioBitrate;
    }
}

// Save quality settings to localStorage
function saveQualitySettings() {
    localStorage.setItem('resolution', state.resolution);
    localStorage.setItem('videoBitrate', state.videoBitrate);
    localStorage.setItem('audioBitrate', state.audioBitrate);
}

// Load inactivity settings from localStorage
function loadInactivitySettings() {
    const savedTimeout = localStorage.getItem('inactivityTimeout');
    if (savedTimeout) {
        inactivityTimeoutInput.value = savedTimeout;
        console.log('[Settings] Loaded inactivity timeout:', savedTimeout);
    }
}

// Save inactivity settings to localStorage
function saveInactivitySettings() {
    localStorage.setItem('inactivityTimeout', inactivityTimeoutInput.value);
    console.log('[Settings] Saved inactivity timeout:', inactivityTimeoutInput.value);
}

// Handle quality setting change
function onQualitySettingChange(event) {
    state.resolution = resolutionSelect.value;
    state.videoBitrate = parseInt(videoBitrateSelect.value);
    state.audioBitrate = parseInt(audioBitrateSelect.value);
    saveQualitySettings();
    console.log('[Settings] Quality settings updated:', state.resolution, state.videoBitrate, state.audioBitrate);

    // Re-initialize streams if resolution changed
    if (event.target === resolutionSelect) {
        initializeStreams();
    }
}

// Initialize streams (for preview and recording)
async function initializeStreams() {
    try {
        updateStatus('Initializing preview...');

        // Get selected devices
        const cameraId = cameraSelect.value;
        const micId = micSelect.value;

        if (!cameraId || !micId) {
            console.log('[Streams] Waiting for device selection');
            return false;
        }

        // Cleanup existing streams
        cleanup();

        // Get screen stream using Electron's desktopCapturer
        const sources = await window.electronAPI.getSources({
            types: ['screen'], // Force screen only to ensure we capture overlays
            thumbnailSize: { width: 150, height: 150 }
        });

        if (sources.length === 0) {
            throw new Error('No screen sources available');
        }

        console.log('[Streams] Available sources:', sources.map(s => s.name));
        const primaryScreen = sources.find(source => source.name === 'Entire Screen' || source.name === 'Screen 1') || sources[0];
        console.log('[Streams] Selected source:', primaryScreen.name, primaryScreen.id);

        // Get screen stream
        // Get screen stream
        const constraints = {
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: primaryScreen.id
                }
            }
        };

        if (state.resolution === '1080') {
            constraints.video.mandatory.minWidth = 1920;
            constraints.video.mandatory.maxWidth = 1920;
            constraints.video.mandatory.minHeight = 1080;
            constraints.video.mandatory.maxHeight = 1080;
        } else if (state.resolution === '720') {
            constraints.video.mandatory.minWidth = 1280;
            constraints.video.mandatory.maxWidth = 1280;
            constraints.video.mandatory.minHeight = 720;
            constraints.video.mandatory.maxHeight = 720;
        } else {
            // Native - use high max values to capture full screen
            constraints.video.mandatory.minWidth = 1280;
            constraints.video.mandatory.maxWidth = 3840; // 4K support
            constraints.video.mandatory.minHeight = 720;
            constraints.video.mandatory.maxHeight = 2160;
        }

        state.screenStream = await navigator.mediaDevices.getUserMedia(constraints);

        // Get camera stream - NO LONGER NEEDED IN MAIN WINDOW
        // We open the overlay window instead
        window.electronAPI.openOverlay({
            deviceId: cameraId,
            shape: state.overlayShape
        });

        // ALSO get local camera stream for direct recording (high quality, no artifacts)
        try {
            state.localCameraStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: { exact: cameraId },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });
            console.log('[Streams] Local camera stream acquired for direct recording');
        } catch (e) {
            console.warn('[Streams] Failed to get local camera stream:', e);
        }

        // Get microphone stream
        // Get microphone stream
        try {
            state.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: { exact: micId },
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                    // Removed sampleRate constraint to avoid OverconstrainedError
                },
                video: false
            });
        } catch (e) {
            console.warn('Failed with advanced audio constraints, trying basic:', e);
            // Fallback to basic constraints
            state.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: { exact: micId }
                },
                video: false
            });
        }

        // Set up canvas for compositing
        setupCanvas();

        // Start rendering loop (always on for preview)
        startRendering();

        updateStatus('Ready to record');
        previewCanvas.classList.add('active');
        startBtn.disabled = false;

        return true;

    } catch (error) {
        console.error('Error initializing streams:', error);
        updateStatus('Error initializing: ' + error.message);
        cleanup(); // Ensure partial state is cleaned up
        return false;
    }
}

// Start recording
async function startRecording() {
    try {
        if (!state.screenStream || !state.audioStream) {
            const initialized = await initializeStreams();
            if (!initialized) return;
        }

        // Ensure overlay is open
        const cameraId = cameraSelect.value;
        if (cameraId) {
            window.electronAPI.openOverlay({
                deviceId: cameraId,
                shape: state.overlayShape
            });
        }

        // Clear previous recording data
        state.recordedChunks = [];
        state.recordedBlob = null;
        state.recordedUrl = null;

        // Start recording the canvas
        await window.electronAPI.startRecordingStream();
        await startMediaRecorder();

        // Update UI
        state.isRecording = true;
        state.startTime = Date.now();
        startTimer();
        startBtn.disabled = true;
        stopBtn.disabled = false;
        downloadBtn.disabled = true;
        updateStatus('Recording...');
        document.querySelector('.status-dot').classList.add('recording');

        // Start global input monitoring
        await window.electronAPI.startInputMonitoring();
        console.log('[Renderer] Started global input monitoring');

        // Start inactivity timer
        resetInactivityTimer();

    } catch (error) {
        console.error('Error starting recording:', error);
        updateStatus('Failed to start recording: ' + error.message);
        cleanup();
    }
}

// Setup canvas for compositing
function setupCanvas() {
    const screenTrack = state.screenStream.getVideoTracks()[0];
    const settings = screenTrack.getSettings();

    // Create offscreen canvas for recording
    canvas = document.createElement('canvas');
    canvas.width = settings.width || 1920;
    canvas.height = settings.height || 1080;
    ctx = canvas.getContext('2d'); // Removed willReadFrequently: true for better hardware acceleration performance

    // Setup preview canvas
    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
}

// Start rendering loop
function startRendering() {
    console.log('[Renderer] Starting rendering loop');

    const videoScreen = document.createElement('video');
    videoScreen.srcObject = state.screenStream;
    videoScreen.autoplay = true;
    videoScreen.muted = true;
    videoScreen.playsInline = true;

    // Camera video element removed (handled by overlay)

    // Local camera video element
    const videoCamera = document.createElement('video');
    if (state.localCameraStream) {
        videoCamera.srcObject = state.localCameraStream;
        videoCamera.autoplay = true;
        videoCamera.muted = true;
        videoCamera.playsInline = true;
        videoCamera.play().catch(e => console.error('[Renderer] Camera video play error:', e));
    }

    console.log('[Renderer] Created video elements');
    console.log('[Renderer] Screen stream tracks:', state.screenStream.getTracks().length);

    // Force play
    videoScreen.play().catch(e => console.error('[Renderer] Screen video play error:', e));

    let frameCount = 0;
    function render() {
        // Stop if screen stream is gone
        if (!state.screenStream) {
            console.log('[Renderer] Stopping render loop - streams gone');
            return;
        }

        frameCount++;
        if (frameCount % 300 === 0) { // Log every ~5 seconds
            console.log('[Renderer] Rendering frame', frameCount, 'Time:', new Date().toLocaleTimeString());
        }

        try {
            // Check recording mode
            if (state.cameraMode === 'camera-only' && state.localCameraStream && videoCamera.readyState >= 2) {
                // Direct Camera Recording
                // Draw camera feed scaled to fit canvas
                // Maintain aspect ratio
                const hRatio = canvas.width / videoCamera.videoWidth;
                const vRatio = canvas.height / videoCamera.videoHeight;
                const ratio = Math.min(hRatio, vRatio); // Fit inside
                // const ratio = Math.max(hRatio, vRatio); // Cover (crop) - better for full screen feel

                // Let's use "Cover" strategy to fill the screen
                const centerShift_x = (canvas.width - videoCamera.videoWidth * ratio) / 2;
                const centerShift_y = (canvas.height - videoCamera.videoHeight * ratio) / 2;

                // Clear canvas first
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.drawImage(videoCamera, 0, 0, videoCamera.videoWidth, videoCamera.videoHeight,
                    centerShift_x, centerShift_y, videoCamera.videoWidth * ratio, videoCamera.videoHeight * ratio);

            } else {
                // Screen Recording (with overlay handled by OS/Electron capture)
                if (videoScreen.readyState >= 2) {
                    ctx.drawImage(videoScreen, 0, 0, canvas.width, canvas.height);
                }
            }

            // Copy to preview canvas
            previewCtx.drawImage(canvas, 0, 0);
        } catch (error) {
            console.error('[Renderer] Error in render loop:', error);
        }

        requestAnimationFrame(render);
    }

    // Start rendering immediately
    console.log('[Renderer] Starting animation frame loop');
    requestAnimationFrame(render);
}

// Auto-initialize streams when devices are selected
// Event listeners moved to DOMContentLoaded to ensure elements exist
// See bottom of file or init function

// Draw camera overlay (circle or square) when showing screen
function drawCameraOverlay(videoCamera) {
    ctx.save();

    // Calculate center crop to avoid distortion
    const videoWidth = videoCamera.videoWidth;
    const videoHeight = videoCamera.videoHeight;
    const size = state.overlaySize;

    // We want a square crop from the center of the video
    const minDim = Math.min(videoWidth, videoHeight);
    const sx = (videoWidth - minDim) / 2;
    const sy = (videoHeight - minDim) / 2;
    const sWidth = minDim;
    const sHeight = minDim;

    if (state.overlayShape === 'circle') {
        // Circle overlay
        const radius = size / 2;
        const centerX = state.cameraX + radius;
        const centerY = state.cameraY + radius;

        // Create circular clipping path
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        // Draw camera feed (center cropped)
        ctx.drawImage(videoCamera, sx, sy, sWidth, sHeight, state.cameraX, state.cameraY, size, size);

        ctx.restore();

        // Draw border
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        // Square overlay with rounded corners
        const borderRadius = 12;

        // Create rounded rectangle clipping path
        ctx.beginPath();
        ctx.moveTo(state.cameraX + borderRadius, state.cameraY);
        ctx.lineTo(state.cameraX + size - borderRadius, state.cameraY);
        ctx.quadraticCurveTo(state.cameraX + size, state.cameraY, state.cameraX + size, state.cameraY + borderRadius);
        ctx.lineTo(state.cameraX + size, state.cameraY + size - borderRadius);
        ctx.quadraticCurveTo(state.cameraX + size, state.cameraY + size, state.cameraX + size - borderRadius, state.cameraY + size);
        ctx.lineTo(state.cameraX + borderRadius, state.cameraY + size);
        ctx.quadraticCurveTo(state.cameraX, state.cameraY + size, state.cameraX, state.cameraY + size - borderRadius);
        ctx.lineTo(state.cameraX, state.cameraY + borderRadius);
        ctx.quadraticCurveTo(state.cameraX, state.cameraY, state.cameraX + borderRadius, state.cameraY);
        ctx.closePath();
        ctx.clip();

        // Draw camera feed (center cropped)
        ctx.drawImage(videoCamera, sx, sy, sWidth, sHeight, state.cameraX, state.cameraY, size, size);

        ctx.restore();

        // Draw border
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(state.cameraX + borderRadius, state.cameraY);
        ctx.lineTo(state.cameraX + size - borderRadius, state.cameraY);
        ctx.quadraticCurveTo(state.cameraX + size, state.cameraY, state.cameraX + size, state.cameraY + borderRadius);
        ctx.lineTo(state.cameraX + size, state.cameraY + size - borderRadius);
        ctx.quadraticCurveTo(state.cameraX + size, state.cameraY + size, state.cameraX + size - borderRadius, state.cameraY + size);
        ctx.lineTo(state.cameraX + borderRadius, state.cameraY + size);
        ctx.quadraticCurveTo(state.cameraX, state.cameraY + size, state.cameraX, state.cameraY + size - borderRadius);
        ctx.lineTo(state.cameraX, state.cameraY + borderRadius);
        ctx.quadraticCurveTo(state.cameraX, state.cameraY, state.cameraX + borderRadius, state.cameraY);
        ctx.stroke();
    }
}

// Start MediaRecorder
async function startMediaRecorder() {
    // Get canvas stream
    const canvasStream = canvas.captureStream(60); // 60 FPS for smoother recording

    // Combine audio tracks
    const audioTracks = [];

    // Add screen audio if available
    const screenAudioTrack = state.screenStream.getAudioTracks()[0];
    if (screenAudioTrack) {
        audioTracks.push(screenAudioTrack);
    }

    // Add microphone audio
    if (state.audioStream) {
        const micAudioTrack = state.audioStream.getAudioTracks()[0];
        if (micAudioTrack) {
            audioTracks.push(micAudioTrack);
        }
    }

    // Add audio tracks to canvas stream
    audioTracks.forEach(track => canvasStream.addTrack(track));

    // Create MediaRecorder with high quality settings
    // Create MediaRecorder with high quality settings
    const options = {
        mimeType: 'video/webm;codecs=h264', // Try H.264 first for fast remuxing
        videoBitsPerSecond: state.videoBitrate,
        audioBitsPerSecond: state.audioBitrate
    };

    // Fallback logic
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn('[Recorder] H.264 not supported, falling back to VP9');
        options.mimeType = 'video/webm;codecs=vp9,opus';
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn('[Recorder] VP9 not supported, falling back to VP8');
        options.mimeType = 'video/webm;codecs=vp8,opus';
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn('[Recorder] VP8 not supported, falling back to default');
        options.mimeType = 'video/webm';
    }

    console.log('[Recorder] Using mimeType:', options.mimeType);
    state.recordingMimeType = options.mimeType; // Store for main process

    state.mediaRecorder = new MediaRecorder(canvasStream, options);

    state.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
            // Stream data to main process instead of storing in array
            const buffer = await event.data.arrayBuffer();
            window.electronAPI.writeRecordingChunk(new Uint8Array(buffer));
        }
    };

    state.mediaRecorder.onstop = async () => {
        // Stop the stream and get the file path
        const tempFilePath = await window.electronAPI.stopRecordingStream();

        // Store path for download
        state.recordedUrl = tempFilePath;

        downloadBtn.disabled = false;
        updateStatus('Recording saved! Click Download to save the video.');
    };

    state.mediaRecorder.start(1000); // Collect data every 1 second (larger chunks are fine for streaming)
}

// Stop recording
async function stopRecording() {
    if (!state.isRecording) return;

    state.isRecording = false;

    // Stop global input monitoring
    await window.electronAPI.stopInputMonitoring();
    console.log('[Renderer] Stopped global input monitoring');

    // Stop media recorder
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
    }

    // Stop timer
    stopTimer();

    // Cleanup
    cleanup();

    // Update UI
    startBtn.disabled = false;
    stopBtn.disabled = true;
    document.querySelector('.status-dot').classList.remove('recording');
}

// Download video
async function downloadVideo() {
    if (!state.recordedUrl) return;

    try {
        updateStatus('Preparing video...');
        console.log('[Renderer] Starting MP4 conversion');

        // Create timestamp for filename
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const mp4Filename = `recording_${timestamp}.mp4`;

        // The file is already saved at state.recordedUrl (temp path)
        const tempWebmPath = state.recordedUrl;

        // Convert to MP4 using ffmpeg
        console.log('[Renderer] Converting to MP4');
        updateStatus('Converting to MP4...');
        // Pass the temp path and the desired output filename
        // Pass the temp path, desired output filename, and the mimeType used
        await window.electronAPI.convertToMP4(tempWebmPath, mp4Filename, state.recordingMimeType);

        console.log('[Renderer] Conversion complete!');
        updateStatus(`Video saved! Check Downloads / recording_${timestamp}.mp4`);

    } catch (error) {
        console.error('[Renderer] Error converting to MP4:', error);
        updateStatus('Error converting to MP4. Saving as WebM instead...');

        // Fallback to WebM download (copy the temp file to downloads)
        // Since we can't easily "download" a local path via <a> tag if web security is on (though it's off here),
        // we might need another IPC or just tell the user where it is.
        // But since we have the path, we can just use shell.showItemInFolder or similar if we had access.
        // For now, let's try to read it back to a blob if we really need to "download" it via browser,
        // OR just leave it in temp and tell the user.
        // Better: Ask main process to copy it to downloads.

        // Simpler fallback: Just alert the user
        alert(`Conversion failed. The raw recording is at: ${state.recordedUrl}`);
    }
}

// User input detection
function onUserInput(event) {
    if (!state.isRecording) return;

    // Ignore input if dragging camera
    if (state.isDragging) return;

    state.lastInputTime = Date.now();

    // If we were in camera-only mode, switch back to screen-with-camera
    if (state.cameraMode === 'camera-only') {
        console.log('[Camera] Switching to SCREEN-WITH-CAMERA mode (user input)');
        state.cameraMode = 'screen-with-camera';
        window.electronAPI.setOverlayMode('mini');
    }

    // Reset inactivity timer
    resetInactivityTimer();
}

// Reset inactivity timer
function resetInactivityTimer() {
    if (state.inactivityTimer) {
        clearTimeout(state.inactivityTimer);
    }

    // Get timeout value from UI (in seconds), convert to milliseconds
    const timeoutSeconds = parseInt(inactivityTimeoutInput.value) || 3;
    const timeoutMs = timeoutSeconds * 1000;

    state.inactivityTimer = setTimeout(() => {
        if (Date.now() - state.lastInputTime >= timeoutMs) {
            // Switch to camera-only mode
            console.log('[Camera] Switching to CAMERA-ONLY mode (inactivity timeout)');
            state.cameraMode = 'camera-only';
            window.electronAPI.setOverlayMode('full');
        }
    }, timeoutMs);
}

// Canvas drag and resize handlers - REMOVED (Handled by Overlay Window)
// drawCameraOverlay - REMOVED (Handled by Overlay Window)

// Timer functions
function startTimer() {
    state.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        timer.textContent = `${minutes}:${seconds} `;
    }, 1000);
}

function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

// Update status
function updateStatus(message) {
    statusText.textContent = message;
}

// Cleanup
function cleanup() {
    if (state.screenStream) {
        state.screenStream.getTracks().forEach(track => track.stop());
        state.screenStream = null;
    }
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
        state.cameraStream = null;
    }
    if (state.audioStream) {
        state.audioStream.getTracks().forEach(track => track.stop());
        state.audioStream = null;
    }
    if (state.inactivityTimer) {
        clearTimeout(state.inactivityTimer);
        state.inactivityTimer = null;
    }
}
