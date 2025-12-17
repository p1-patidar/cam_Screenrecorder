const { ipcRenderer } = require('electron');

const video = document.getElementById('camera-feed');
const container = document.getElementById('camera-container');
const resizeHandle = document.getElementById('resize-handle');

let currentDeviceId = null;

// Listen for initialization
ipcRenderer.on('init-overlay', async (event, deviceId) => {
    console.log('Initializing overlay with device:', deviceId);
    currentDeviceId = deviceId;
    await startCamera(deviceId);
});

// Listen for shape updates
ipcRenderer.on('update-shape', (event, shape) => {
    console.log('Updating shape:', shape);
    if (shape === 'circle') {
        container.classList.remove('shape-square');
        container.classList.add('shape-circle');
    } else {
        container.classList.remove('shape-circle');
        container.classList.add('shape-square');
    }
});

// Listen for mode updates
ipcRenderer.on('set-mode', (event, mode) => {
    console.log('Setting mode:', mode);
    if (mode === 'mini') {
        document.body.classList.add('draggable');
    } else {
        document.body.classList.remove('draggable');
    }
});
// Default to draggable (mini mode start) handled by main process init
// document.body.classList.add('draggable');

// Start camera stream
async function startCamera(deviceId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: { exact: deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });
        video.srcObject = stream;
    } catch (error) {
        console.error('Error starting camera:', error);
    }
}

// Custom Resize Logic
let isResizing = false;
let startX, startY, startWidth, startHeight;

resizeHandle.addEventListener('mousedown', (e) => {
    console.log('Resize handle mousedown');
    isResizing = true;
    startX = e.screenX;
    startY = e.screenY;
    startWidth = window.outerWidth;
    startHeight = window.outerHeight;
    console.log('Start resize:', startWidth, startHeight);

    // Prevent dragging the window
    e.stopPropagation();

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
});

function onMouseMove(e) {
    if (!isResizing) return;

    const deltaX = e.screenX - startX;
    const deltaY = e.screenY - startY;

    // Keep aspect ratio 1:1
    const delta = Math.max(deltaX, deltaY);

    const newSize = Math.max(100, startWidth + delta); // Min size 100px
    const roundedSize = Math.round(newSize);

    // console.log('Resizing to:', roundedSize);
    ipcRenderer.send('resize-overlay', { width: roundedSize, height: roundedSize });
}

function onMouseUp() {
    console.log('Resize handle mouseup');
    isResizing = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
}
