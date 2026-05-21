const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pixelAPI', {
  scanSystem: () => ipcRenderer.invoke('scan-system')
});
