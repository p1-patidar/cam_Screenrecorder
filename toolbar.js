const { ipcRenderer } = require('electron');

const buttons = {
    cursor: document.getElementById('cursorBtn'),
    pen: document.getElementById('penBtn'),
    rect: document.getElementById('rectBtn'),
    circle: document.getElementById('circleBtn'),
    circle: document.getElementById('circleBtn'),
    arrow: document.getElementById('arrowBtn'),
    clear: document.getElementById('clearBtn')
};

const swatches = document.querySelectorAll('.color-swatch');

let currentTool = 'cursor'; // Default to cursor so mouse passes through
let currentColor = '#ef4444';

// Tool Selection
function setActiveTool(tool) {
    currentTool = tool;

    // Update UI
    Object.values(buttons).forEach(btn => {
        if (btn) btn.classList.remove('active');
    });
    if (buttons[tool]) buttons[tool].classList.add('active');

    // Send to Main -> Drawing Window
    ipcRenderer.send('toolkit-action', {
        type: 'set-tool',
        tool: tool
    });
}

buttons.cursor.addEventListener('click', () => setActiveTool('cursor'));
buttons.pen.addEventListener('click', () => setActiveTool('pen'));
buttons.rect.addEventListener('click', () => setActiveTool('rect'));
buttons.circle.addEventListener('click', () => setActiveTool('circle'));
buttons.arrow.addEventListener('click', () => setActiveTool('arrow'));

// Board Controls
const boardButtons = {
    white: document.getElementById('boardWhiteBtn'),
    black: document.getElementById('boardBlackBtn'),
    none: document.getElementById('boardNoneBtn')
};

function setBoard(type) {
    // Update UI
    Object.values(boardButtons).forEach(btn => btn.classList.remove('active'));
    if (boardButtons[type]) boardButtons[type].classList.add('active');

    let color = 'transparent';
    if (type === 'white') color = '#ffffff';
    if (type === 'black') color = '#000000';

    ipcRenderer.send('toolkit-action', {
        type: 'set-background',
        color: color
    });
}

boardButtons.white.addEventListener('click', () => setBoard('white'));
boardButtons.black.addEventListener('click', () => setBoard('black'));
boardButtons.white.addEventListener('click', () => setBoard('white'));
boardButtons.black.addEventListener('click', () => setBoard('black'));
boardButtons.none.addEventListener('click', () => setBoard('none'));

// Clear Button
buttons.clear.addEventListener('click', () => {
    ipcRenderer.send('toolkit-action', { type: 'clear' });
});

// Size Slider
const sizeSlider = document.getElementById('sizeSlider');
sizeSlider.addEventListener('input', (e) => {
    const size = e.target.value;
    ipcRenderer.send('toolkit-action', {
        type: 'set-size',
        size: parseInt(size)
    });
});

// Color Selection
swatches.forEach(swatch => {
    swatch.addEventListener('click', (e) => {
        const color = e.target.dataset.color;
        currentColor = color;

        // Update UI
        swatches.forEach(s => s.classList.remove('active'));
        e.target.classList.add('active');

        ipcRenderer.send('toolkit-action', {
            type: 'set-color',
            color: color
        });
    });
});

// Window Controls
const expandedView = document.getElementById('expanded-view');
const minimizedView = document.getElementById('minimized-view');
const minimizeBtn = document.getElementById('minimizeBtn');
const closeBtn = document.getElementById('closeBtn');

if (minimizeBtn) {
    minimizeBtn.addEventListener('click', () => {
        expandedView.style.display = 'none';
        minimizedView.style.display = 'flex';
        ipcRenderer.send('toolkit-action', {
            type: 'resize-toolbar',
            width: 60,
            height: 60
        });
    });
}

if (minimizedView) {
    minimizedView.addEventListener('click', () => {
        minimizedView.style.display = 'none';
        expandedView.style.display = 'flex';
        ipcRenderer.send('toolkit-action', {
            type: 'resize-toolbar',
            width: 1000,
            height: 60
        });
    });
}

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        ipcRenderer.send('toolkit-action', { type: 'close' });
    });
}

// Handle global ESC key from main process
ipcRenderer.on('force-cursor-mode', () => {
    currentTool = 'cursor';
    // Update UI
    Object.values(buttons).forEach(btn => {
        if (btn) btn.classList.remove('active');
    });
    if (buttons.cursor) buttons.cursor.classList.add('active');
    console.log('[Toolbar] Forced cursor mode via ESC');
});

// Reset logic for when toolbar is re-opened
ipcRenderer.on('reset-toolbar', () => {
    // Force expanded view
    if (minimizedView.style.display !== 'none') {
        minimizedView.style.display = 'none';
        expandedView.style.display = 'flex';
        // Resize window back to normal
        ipcRenderer.send('toolkit-action', {
            type: 'resize-toolbar',
            width: 1000,
            height: 60
        });
    }
});

// --- Recording Controls ---
const startBtn = document.getElementById('startToolBtn');
const stopBtn = document.getElementById('stopToolBtn');
const downloadBtn = document.getElementById('downloadToolBtn');
const timeoutInput = document.getElementById('timeoutInput');
const shapeToggleBtn = document.getElementById('shapeToggleBtn');
const shapeIconCircle = document.getElementById('shapeIconCircle');
const shapeIconSquare = document.getElementById('shapeIconSquare');
const focusBtn = document.getElementById('focusToolBtn');

if (startBtn) {
    startBtn.addEventListener('click', () => {
        ipcRenderer.send('control-action', { type: 'start' });
    });
}

if (stopBtn) {
    stopBtn.addEventListener('click', () => {
        ipcRenderer.send('control-action', { type: 'stop' });
    });
}

if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
        ipcRenderer.send('control-action', { type: 'download' });
    });
}

if (focusBtn) {
    focusBtn.addEventListener('click', () => {
        ipcRenderer.send('control-action', { type: 'maximize-camera' });
    });
}

timeoutInput.addEventListener('change', (e) => {
    let value = parseInt(e.target.value);
    if (value < 1) value = 1;
    if (value > 60) value = 60;
    e.target.value = value;
    ipcRenderer.send('control-action', { type: 'set-timeout', value: value });
});

// Shape Toggle Logic
let currentShape = 'circle';
shapeToggleBtn.addEventListener('click', () => {
    currentShape = currentShape === 'circle' ? 'square' : 'circle';
    updateShapeUI();
    ipcRenderer.send('control-action', { type: 'set-shape', shape: currentShape });
});

function updateShapeUI() {
    if (currentShape === 'circle') {
        shapeIconCircle.style.display = 'block';
        shapeIconSquare.style.display = 'none';
        shapeToggleBtn.title = "Overlay: Circle";
    } else {
        shapeIconCircle.style.display = 'none';
        shapeIconSquare.style.display = 'block';
        shapeToggleBtn.title = "Overlay: Square";
    }
}

// --- State Updates from Main/Recorder ---
ipcRenderer.on('recording-state-update', (event, state) => {
    console.log('[Toolbar] Received state update:', state);
    if (state.hasOwnProperty('isRecording')) {
        if (state.isRecording) {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'flex'; // Use flex to center icon
            downloadBtn.disabled = true;
        } else {
            startBtn.style.display = 'flex';
            stopBtn.style.display = 'none';
            downloadBtn.disabled = !state.canDownload;
        }
    }

    // Sync settings if provided (e.g. on startup)
    if (state.overlayShape) {
        currentShape = state.overlayShape;
        updateShapeUI();
    }
    if (state.inactivityTimeout) {
        timeoutInput.value = state.inactivityTimeout;
    }
});

// Initialize with Pen tool selected by default
setActiveTool('pen');
