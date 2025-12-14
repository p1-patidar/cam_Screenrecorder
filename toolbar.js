const { ipcRenderer } = require('electron');

const buttons = {
    cursor: document.getElementById('cursorBtn'),
    pen: document.getElementById('penBtn'),
    rect: document.getElementById('rectBtn'),
    circle: document.getElementById('circleBtn'),
    arrow: document.getElementById('arrowBtn'),
    eraser: document.getElementById('eraserBtn'),
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
buttons.eraser.addEventListener('click', () => setActiveTool('eraser'));

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
