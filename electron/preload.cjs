const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('miniTricky', {
  isDesktop: true,
  platform: process.platform,
  apiBase: 'http://127.0.0.1:5000',

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getBackendStatus: () => ipcRenderer.invoke('get-backend-status'),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),

  // Window
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),

  // File dialogs
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),

  // Navigation events from menu
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (_event, view) => callback(view));
    return () => ipcRenderer.removeAllListeners('navigate');
  },

  // Action events from menu
  onAction: (callback) => {
    ipcRenderer.on('action', (_event, action) => callback(action));
    return () => ipcRenderer.removeAllListeners('action');
  },

  // Import workflow event
  onImportWorkflow: (callback) => {
    ipcRenderer.on('import-workflow', (_event, content) => callback(content));
    return () => ipcRenderer.removeAllListeners('import-workflow');
  },
});

// Legacy compat
contextBridge.exposeInMainWorld('miniTrickyDesktop', {
  isDesktop: true,
  apiBase: 'http://127.0.0.1:5000',
});
