const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  openWindow: () => ipcRenderer.invoke('open-window'),
  writeBackup: (name, data) => ipcRenderer.invoke('write-backup', name, data),
  readBackup: (name) => ipcRenderer.invoke('read-backup', name),
  listBackups: () => ipcRenderer.invoke('list-backups'),
});
