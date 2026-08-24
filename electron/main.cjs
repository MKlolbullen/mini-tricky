const { app, BrowserWindow, Menu, Tray, shell, dialog, nativeTheme, ipcMain, session } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

// ── Constants ──────────────────────────────────────────────────────
const APP_NAME = 'mini-tricky';
const BACKEND_PORT = 5000;
const DEV_SERVER_URL = process.env.MINI_TRICKY_DEV_SERVER_URL || 'http://127.0.0.1:5173';
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');
const IS_DEV = !app.isPackaged;
const SESSION_TOKEN = crypto.randomBytes(32).toString('hex');
const MAX_IPC_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTERNAL_HOSTS = new Set(['github.com', 'www.github.com']);
const approvedFilePaths = new Set();

function resolveIconPath(basename) {
  const candidates = IS_DEV
    ? [path.join(__dirname, '..', 'build', basename)]
    : [
        path.join(process.resourcesPath, 'build', basename),
        path.join(process.resourcesPath, 'app', 'build', basename),
        path.join(__dirname, '..', 'build', basename),
      ];
  for (const candidate of candidates) {
    try { if (fs.existsSync(candidate)) return candidate; } catch { /* ignore */ }
  }
  return null;
}

const APP_ICON = resolveIconPath('icon.png');
const TRAY_ICON = path.join(__dirname, 'tray-icon.png');

let mainWindow = null;
let tray = null;
let backendProcess = null;
let isQuitting = false;

// ── Trust helpers ──────────────────────────────────────────────────
function isTrustedRendererUrl(rawUrl) {
  try {
    const candidate = new URL(rawUrl);
    if (IS_DEV) {
      const expected = new URL(DEV_SERVER_URL);
      return candidate.protocol === expected.protocol && candidate.host === expected.host;
    }
    return candidate.protocol === 'file:';
  } catch {
    return false;
  }
}

function assertTrustedSender(event) {
  const senderUrl = event.senderFrame?.url || event.sender?.getURL?.() || '';
  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error('Rejected IPC request from an untrusted renderer');
  }
}

function isAllowedExternalUrl(rawUrl) {
  try {
    const candidate = new URL(rawUrl);
    return candidate.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(candidate.hostname);
  } catch {
    return false;
  }
}

function approveFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const resolved = path.resolve(filePath);
  approvedFilePaths.add(resolved);
  return resolved;
}

function requireApprovedFilePath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path');
  }
  const resolved = path.resolve(filePath);
  if (!approvedFilePaths.has(resolved)) {
    throw new Error('File access denied: select the path through an open/save dialog first');
  }
  return resolved;
}

function configureContentSecurityPolicy() {
  if (IS_DEV) return;

  // @monaco-editor/react currently loads Monaco's AMD assets from jsDelivr by
  // default. Keep that dependency narrowly scoped in CSP until Monaco is
  // bundled locally; do not widen script/connect policy to arbitrary HTTPS.
  const monacoCdn = 'https://cdn.jsdelivr.net';
  const policy = [
    "default-src 'self'",
    `script-src 'self' ${monacoCdn}`,
    `style-src 'self' 'unsafe-inline' ${monacoCdn}`,
    "img-src 'self' data: blob:",
    `font-src 'self' data: ${monacoCdn}`,
    `connect-src ${BACKEND_URL} ws://127.0.0.1:${BACKEND_PORT} ${monacoCdn}`,
    "worker-src 'self' blob:",
    "child-src blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}

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
  const pythonCmd = IS_DEV ? systemPython : (getBundledPython() || systemPython);

  backendProcess = spawn(pythonCmd, [
    '-m', 'uvicorn', 'src.secure_entry:app',
    '--host', '127.0.0.1',
    '--port', String(BACKEND_PORT),
    ...(IS_DEV ? ['--reload'] : []),
  ], {
    cwd: backendDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      MINI_TRICKY_SESSION_TOKEN: SESSION_TOKEN,
    },
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

async function waitForBackend(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const http = require('http');
      const status = await new Promise((resolve, reject) => {
        const req = http.get(
          `${BACKEND_URL}/api/health`,
          { headers: { 'X-Mini-Tricky-Token': SESSION_TOKEN } },
          (res) => resolve(res.statusCode),
        );
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      if (status === 200) return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
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
        { type: 'separator', visible: IS_DEV },
        { role: 'reload', visible: IS_DEV },
        { role: 'forceReload', visible: IS_DEV },
        { role: 'toggleDevTools', visible: IS_DEV },
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
  if (!fs.existsSync(TRAY_ICON)) return;
  try {
    tray = new Tray(TRAY_ICON);
  } catch {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Window', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'New Workflow', click: () => { mainWindow?.show(); mainWindow?.webContents.send('action', 'new-workflow'); } },
    { label: 'Run Current', click: () => { mainWindow?.show(); mainWindow?.webContents.send('action', 'run-workflow'); } },
    { type: 'separator' },
    { label: backendProcess ? 'Backend: Running' : 'Backend: Stopped', enabled: false },
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
    ...(APP_ICON ? { icon: APP_ICON } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  });

  if (state.isFullScreen) mainWindow.setFullScreen(true);
  else if (state.isMaximized) mainWindow.maximize();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('close', (event) => {
    saveWindowState();
    if (process.platform === 'darwin' && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (IS_DEV) mainWindow.loadURL(DEV_SERVER_URL);
  else mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
}

// ── IPC Handlers ─────────────────────────────────────────────────
function setupIPC() {
  ipcMain.on('get-session-token-sync', (event) => {
    try {
      assertTrustedSender(event);
      event.returnValue = SESSION_TOKEN;
    } catch {
      event.returnValue = '';
    }
  });

  ipcMain.handle('get-app-info', (event) => {
    assertTrustedSender(event);
    return {
      version: app.getVersion(),
      name: app.getName(),
      platform: process.platform,
      arch: process.arch,
      dataPath: app.getPath('userData'),
      isPackaged: app.isPackaged,
      backendUrl: BACKEND_URL,
    };
  });

  ipcMain.handle('get-backend-status', (event) => {
    assertTrustedSender(event);
    return {
      running: backendProcess !== null && !backendProcess.killed,
      pid: backendProcess?.pid,
      port: BACKEND_PORT,
    };
  });

  ipcMain.handle('restart-backend', async (event) => {
    assertTrustedSender(event);
    stopBackend();
    startBackend();
    return { ok: await waitForBackend(15000) };
  });

  ipcMain.handle('toggle-fullscreen', (event) => {
    assertTrustedSender(event);
    mainWindow?.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow?.isFullScreen();
  });

  ipcMain.handle('show-save-dialog', async (event, options) => {
    assertTrustedSender(event);
    const result = await dialog.showSaveDialog(mainWindow, options || {});
    if (!result.canceled && result.filePath) approveFilePath(result.filePath);
    return result;
  });

  ipcMain.handle('show-open-dialog', async (event, options) => {
    assertTrustedSender(event);
    const result = await dialog.showOpenDialog(mainWindow, options || {});
    if (!result.canceled) result.filePaths.forEach(approveFilePath);
    return result;
  });

  ipcMain.handle('write-file', async (event, filePath, content) => {
    assertTrustedSender(event);
    const resolved = requireApprovedFilePath(filePath);
    if (typeof content !== 'string') throw new Error('File content must be text');
    if (Buffer.byteLength(content, 'utf8') > MAX_IPC_FILE_BYTES) {
      throw new Error('File content exceeds the IPC size limit');
    }
    fs.writeFileSync(resolved, content, 'utf8');
    return { ok: true };
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    assertTrustedSender(event);
    const resolved = requireApprovedFilePath(filePath);
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) throw new Error('Selected path is not a regular file');
    if (stat.size > MAX_IPC_FILE_BYTES) throw new Error('File exceeds the IPC size limit');
    return fs.readFileSync(resolved, 'utf8');
  });
}

// ── App Lifecycle ────────────────────────────────────────────────
app.whenReady().then(async () => {
  nativeTheme.themeSource = 'dark';
  configureContentSecurityPolicy();
  setupIPC();
  startBackend();
  buildMenu();
  createTray();

  const backendReady = await waitForBackend();
  if (!backendReady) console.warn('Backend did not start in time. Launching UI anyway.');

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
