'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('coreDeck', {
  openItem:       (itemPath, type) => ipcRenderer.invoke('open-item', itemPath, type),
  runSystemCmd:   (keyword)        => ipcRenderer.invoke('run-system-cmd', keyword),
  readData:       ()               => ipcRenderer.invoke('read-data'),
  writeData:      (data)           => ipcRenderer.invoke('write-data', data),
  getDataPath:    ()               => ipcRenderer.invoke('get-data-path'),
  openFilePicker: (opts)           => ipcRenderer.invoke('open-file-dialog', opts || {}),
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow:    () => ipcRenderer.invoke('window-close'),
  isMaximized:    () => ipcRenderer.invoke('window-is-maximized'),
  onWindowStateChange: (cb) => ipcRenderer.on('window-state-change', (_e, isMax) => cb(isMax)),
  onFocusSearch:       (cb) => ipcRenderer.on('focus-search', () => cb())
});
