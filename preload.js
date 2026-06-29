'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // 데이터 영속화
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  onDataChanged: (callback) =>
    ipcRenderer.on('data:changed', (_event, data) => callback(data)),

  // 윈도우 제어
  windowControl: (action) => ipcRenderer.invoke('window:control', action),

  // 메모 별도 창 열기
  openMemoWindow: () => ipcRenderer.invoke('memo:openWindow')
});
