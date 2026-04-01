const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const DEV_SERVER_URL = process.env.MINI_TRICKY_DEV_SERVER_URL || 'http://127.0.0.1:5173';

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1680,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: '#0b1220',
    title: 'mini-tricky',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
