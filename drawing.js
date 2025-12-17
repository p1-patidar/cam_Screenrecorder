const { ipcRenderer } = require('electron');

const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');

let isDrawing = false;
let currentTool = 'pen'; // Default to pen
let currentColor = '#ef4444';
let lineWidth = 4;

// Resize canvas to full screen
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Initialize with mouse capture enabled (pen mode by default)
document.body.classList.remove('pointer-events-none');
ipcRenderer.send('set-drawing-ignore-mouse', false);

// ESC key as escape hatch - always switch to cursor mode
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        currentTool = 'cursor';
        ipcRenderer.send('set-drawing-ignore-mouse', true);
        console.log('[Drawing] ESC pressed - switched to cursor mode');
    }
});

// Drawing Logic
let startX, startY;
let savedImageData;

// Drawing Logic
function startDrawing(e) {
    if (currentTool === 'cursor') return;
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;

    ctx.beginPath();
    ctx.moveTo(startX, startY);

    // Save current canvas state for shapes
    if (['rect', 'circle', 'arrow'].includes(currentTool)) {
        savedImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    if (currentTool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = 20;
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = currentColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }
}

function draw(e) {
    if (!isDrawing) return;
    if (currentTool === 'cursor') return;

    if (currentTool === 'pen' || currentTool === 'eraser') {
        ctx.lineTo(e.clientX, e.clientY);
        ctx.stroke();
    } else if (['rect', 'circle', 'arrow'].includes(currentTool)) {
        // Restore state to clear previous preview
        ctx.putImageData(savedImageData, 0, 0);
        ctx.beginPath();

        const currentX = e.clientX;
        const currentY = e.clientY;

        if (currentTool === 'rect') {
            const width = currentX - startX;
            const height = currentY - startY;
            ctx.strokeRect(startX, startY, width, height);
        } else if (currentTool === 'circle') {
            const radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
            ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
            ctx.stroke();
        } else if (currentTool === 'arrow') {
            // Draw line
            ctx.moveTo(startX, startY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();

            // Draw arrow head
            const headLength = 15;
            const angle = Math.atan2(currentY - startY, currentX - startX);
            ctx.beginPath();
            ctx.moveTo(currentX, currentY);
            ctx.lineTo(currentX - headLength * Math.cos(angle - Math.PI / 6), currentY - headLength * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(currentX, currentY);
            ctx.lineTo(currentX - headLength * Math.cos(angle + Math.PI / 6), currentY - headLength * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
        }
    }
}

function stopDrawing() {
    isDrawing = false;
}

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

// IPC Handlers
ipcRenderer.on('set-tool', (event, tool) => {
    currentTool = tool;
    if (tool === 'cursor') {
        document.body.classList.add('pointer-events-none');
        // We need to tell main process to make window ignore mouse events
        // so user can click through to desktop.
        // BUT, if we do setIgnoreMouseEvents(true), we can't detect when to switch back?
        // Actually, the Toolbar is separate. The Toolbar stays interactive.
        // So we can toggle ignoreMouseEvents on this window based on tool.
        ipcRenderer.send('set-drawing-ignore-mouse', true);
    } else {
        document.body.classList.remove('pointer-events-none');
        ipcRenderer.send('set-drawing-ignore-mouse', false);
    }
});

ipcRenderer.on('set-color', (event, color) => {
    currentColor = color;
});

ipcRenderer.on('clear', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

ipcRenderer.on('set-background', (event, color) => {
    document.body.style.backgroundColor = color;
});

ipcRenderer.on('set-size', (event, size) => {
    lineWidth = size;
});
