const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('miniTrickyDesktop', {
  isDesktop: true,
  apiBase: 'http://127.0.0.1:5000',
});
