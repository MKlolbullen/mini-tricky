const { app, BrowserWindow, Menu, Tray, shell, dialog, nativeTheme, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// ── Constants ──────────────────────────────────────────────────────
const APP_NAME = 'mini-tricky';
const BACKEND_PORT = 5000;
const DEV_SERVER_URL = process.env.MINI_TRICKY_DEV_SERVER_URL || 'http://127.0.0.1:5173';
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const IS_DEV = !app.isPackaged;

let mainWindow = null;
let tray = null;
let backendProcess = null;
let isQuitting = false;

// ── Window State Persistence ─────────────────────────────────────
function loadWindowState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return { width: 1680, height: 980, x: undefined, y: undefined, isMaximized: false, isFullScreen: false };
}

function saveWindowState() {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const state = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: mainWindow.isMaximized(),
    isFullScreen: mainWindow.isFullScreen(),
  };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch { /* ignore */ }
}

// ── Backend Process Management ───────────────────────────────────
function getBundledPython() {
  // In packaged mode, prefer the Python runtime bundled by the release
  // workflow into backend/runtime/python/ via python-build-standalone.
  const runtime = path.join(process.resourcesPath, 'backend', 'runtime', 'python');
  const exe = process.platform === 'win32'
    ? path.join(runtime, 'python.exe')
    : path.join(runtime, 'bin', 'python3');
  try {
    return fs.existsSync(exe) ? exe : null;
  } catch {
    return null;
  }
}

function startBackend() {
  if (backendProcess) return;

  const backendDir = IS_DEV
    ? path.join(__dirname, '..', 'backend')
    : path.join(process.resourcesPath, 'backend');

  const systemPython = process.platform === 'win32' ? 'python' : 'python3';
  const pythonCmd = IS_DEV
    ? systemPython
    : (getBundledPython() || systemPython);

  backendProcess = spawn(pythonCmd, [
    '-m', 'uvicorn', 'src.main:app',
    '--host', '127.0.0.1',
    '--port', String(BACKEND_PORT),
    ...(IS_DEV ? ['--reload'] : []),
  ], {
    cwd: backendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  backendProcess.stdout?.on('data', (data) => {
    if (IS_DEV) process.stdout.write(`[backend] ${data}`);
  });

  backendProcess.stderr?.on('data', (data) => {
    if (IS_DEV) process.stderr.write(`[backend] ${data}`);
  });

  backendProcess.on('close', (code) => {
    if (!isQuitting) {
      console.error(`Backend exited with code ${code}`);
      backendProcess = null;
    }
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err.message);
    backendProcess = null;
  });
}

function stopBackend() {
  if (!backendProcess) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t']);
    } else {
      backendProcess.kill('SIGTERM');
      setTimeout(() => {
        try { backendProcess?.kill('SIGKILL'); } catch { /* ignore */ }
      }, 3000);
    }
  } catch { /* ignore */ }
  backendProcess = null;
}

// ── Wait for Backend ─────────────────────────────────────────────
async function waitForBackend(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const http = require('http');
      await new Promise((resolve, reject) => {
        const req = http.get(`${BACKEND_URL}/api/health`, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

// ── Application Menu ─────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: APP_NAME,
      submenu: [
        { label: `About ${APP_NAME}`, role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('navigate', 'settings'),
        },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { isQuitting = true; app.quit(); } },
      ],
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Workflow',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('action', 'new-workflow'),
        },
        {
          label: 'Save Workflow',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.send('action', 'save-workflow'),
        },
        { type: 'separator' },
        {
          label: 'Import Workflow...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const { filePaths } = await dialog.showOpenDialog(mainWindow, {
              filters: [{ name: 'JSON', extensions: ['json'] }],
              properties: ['openFile'],
            });
            if (filePaths.length > 0) {
              const content = fs.readFileSync(filePaths[0], 'utf8');
              mainWindow?.webContents.send('import-workflow', content);
            }
          },
        },
        {
          label: 'Export Workflow...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.send('action', 'export-workflow'),
        },
      ],
    },
    {
      label: 'Workflow',
      submenu: [
        {
          label: 'Run',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.send('action', 'run-workflow'),
        },
        {
          label: 'Stop',
          accelerator: 'CmdOrCtrl+.',
          click: () => mainWindow?.webContents.send('action', 'stop-workflow'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Console',
          accelerator: 'CmdOrCtrl+`',
          click: () => mainWindow?.webContents.send('action', 'toggle-console'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Builder',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.webContents.send('navigate', 'builder'),
        },
        {
          label: 'Templates',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.webContents.send('navigate', 'templates'),
        },
        {
          label: 'Runs',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow?.webContents.send('navigate', 'runs'),
        },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow?.webContents.send('navigate', 'settings'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Full Screen',
          accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'GitHub Repository',
          click: () => shell.openExternal('https://github.com/MKlolbullen/mini-tricky'),
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/MKlolbullen/mini-tricky/issues'),
        },
        { type: 'separator' },
        {
          label: 'Backend API Docs',
          click: () => shell.openExternal(`${BACKEND_URL}/docs`),
        },
        {
          label: 'Open Data Directory',
          click: () => shell.openPath(app.getPath('userData')),
        },
      ],
    },
  ];

  // macOS adjustments
  if (process.platform === 'darwin') {
    template[0].submenu.splice(1, 0,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
    );
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── System Tray ──────────────────────────────────────────────────
function createTray() {
  // Use a simple text-based tray on platforms where icon may not exist
  try {
    tray = new Tray(path.join(__dirname, 'tray-icon.png'));
  } catch {
    // No tray icon available, skip tray creation
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Window', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'New Workflow', click: () => { mainWindow?.show(); mainWindow?.webContents.send('action', 'new-workflow'); } },
    { label: 'Run Current', click: () => { mainWindow?.show(); mainWindow?.webContents.send('action', 'run-workflow'); } },
    { type: 'separator' },
    {
      label: 'Backend Status',
      enabled: false,
      label: backendProcess ? 'Backend: Running' : 'Backend: Stopped',
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setToolTip(APP_NAME);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

// ── Main Window ──────────────────────────────────────────────────
function createMainWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#060d18',
    title: APP_NAME,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 12, y: 12 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  // Restore maximized/fullscreen state
  if (state.isFullScreen) {
    mainWindow.setFullScreen(true);
  } else if (state.isMaximized) {
    mainWindow.maximize();
  }

  // Show when ready to prevent flicker
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Save window state on changes
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('close', (e) => {
    saveWindowState();
    // On macOS, hide instead of closing unless quitting
    if (process.platform === 'darwin' && !isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // External link handler
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load content
  if (IS_DEV) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }
}

// ── IPC Handlers ─────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(),
    name: app.getName(),
    platform: process.platform,
    arch: process.arch,
    dataPath: app.getPath('userData'),
    isPackaged: app.isPackaged,
    backendUrl: BACKEND_URL,
  }));

  ipcMain.handle('get-backend-status', () => ({
    running: backendProcess !== null && !backendProcess.killed,
    pid: backendProcess?.pid,
    port: BACKEND_PORT,
  }));

  ipcMain.handle('restart-backend', async () => {
    stopBackend();
    startBackend();
    const ok = await waitForBackend(15000);
    return { ok };
  });

  ipcMain.handle('toggle-fullscreen', () => {
    mainWindow?.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow?.isFullScreen();
  });

  ipcMain.handle('show-save-dialog', async (_event, options) => {
    return dialog.showSaveDialog(mainWindow, options);
  });

  ipcMain.handle('show-open-dialog', async (_event, options) => {
    return dialog.showOpenDialog(mainWindow, options);
  });

  ipcMain.handle('write-file', async (_event, filePath, content) => {
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true };
  });

  ipcMain.handle('read-file', async (_event, filePath) => {
    return fs.readFileSync(filePath, 'utf8');
  });
}

// ── App Lifecycle ────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Force dark theme
  nativeTheme.themeSource = 'dark';

  // Start backend
  startBackend();

  // Setup IPC, menu, tray
  setupIPC();
  buildMenu();
  createTray();

  // Wait for backend to be ready
  const backendReady = await waitForBackend();
  if (!backendReady) {
    console.warn('Backend did not start in time. Launching UI anyway.');
  }

  // Create main window
  createMainWindow();

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    isQuitting = true;
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  saveWindowState();
  stopBackend();
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
