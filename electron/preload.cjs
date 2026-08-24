const { contextBridge, ipcRenderer } = require('electron');

// Resolve the per-process backend token once during preload. The main process
// validates the sender before returning it; renderer code receives only this
// specific capability rather than Node/Electron primitives.
const sessionToken = ipcRenderer.sendSync('get-session-token-sync');

contextBridge.exposeInMainWorld('miniTricky', {
  isDesktop: true,
  platform: process.platform,
  apiBase: 'http://127.0.0.1:5000',
  sessionToken,

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getBackendStatus: () => ipcRenderer.invoke('get-backend-status'),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),

  // Window
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),

  // File dialogs. readFile/writeFile are accepted only for exact paths that
  // were granted by one of these native dialogs in the main process.
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),

  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (_event, view) => callback(view));
    return () => ipcRenderer.removeAllListeners('navigate');
  },

  onAction: (callback) => {
    ipcRenderer.on('action', (_event, action) => callback(action));
    return () => ipcRenderer.removeAllListeners('action');
  },

  onImportWorkflow: (callback) => {
    ipcRenderer.on('import-workflow', (_event, content) => callback(content));
    return () => ipcRenderer.removeAllListeners('import-workflow');
  },
});

// Legacy compatibility for code that only needs desktop detection/apiBase.
contextBridge.exposeInMainWorld('miniTrickyDesktop', {
  isDesktop: true,
  apiBase: 'http://127.0.0.1:5000',
  sessionToken,
});
