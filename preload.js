const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getPin: () => ipcRenderer.invoke('get-pin'),
  onPinChange: (callback) => {
    ipcRenderer.on('pin-changed', (event, pin) => callback(pin));
    return () => ipcRenderer.removeAllListeners('pin-changed');
  },
  getConnectionUrl: () => ipcRenderer.invoke('get-connection-url'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),
  validatePin: (pin) => ipcRenderer.invoke('validate-pin', pin),
  showWindow: () => ipcRenderer.invoke('show-window'),
  getControllerCount: () => ipcRenderer.invoke('get-controller-count')
});

