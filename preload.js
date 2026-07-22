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
  requestClose: () => ipcRenderer.invoke('window:requestClose'),

  // 탭(뷰) 분리 / 뷰 집합 변경 수신
  tearOut: (view) => ipcRenderer.invoke('view:tearOut', view),
  onViewsSet: (callback) =>
    ipcRenderer.on('views:set', (_e, views) => callback(views)),

  // 외부 링크 열기
  openExternal: (url) => ipcRenderer.invoke('open:external', url),

  // 메모 별도 편집 창 열기
  openMemoEditor: (id) => ipcRenderer.invoke('memo:openEditor', id),

  // 테마색 실시간 미리보기(다른 창에 즉시 반영). color=null 이면 저장된 테마로 복귀
  sendThemePreview: (color) => ipcRenderer.invoke('theme:preview', color),
  onThemePreview: (callback) =>
    ipcRenderer.on('theme:preview', (_e, color) => callback(color)),

  // 위젯(배경화면 고정) 모드
  widget: {
    status: () => ipcRenderer.invoke('widget:status'),
    set: (patch) => ipcRenderer.invoke('widget:set', patch)
  },

  // 로컬 자동 백업(스냅샷)
  backup: {
    status: () => ipcRenderer.invoke('backup:status'),
    setEnabled: (on) => ipcRenderer.invoke('backup:setEnabled', on),
    now: () => ipcRenderer.invoke('backup:now'),
    chooseDir: () => ipcRenderer.invoke('backup:chooseDir'),
    resetDir: () => ipcRenderer.invoke('backup:resetDir')
  },

  // OS 알림(임박 마감 등)
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),

  // 클라우드 동기화
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    signIn: (email, password) =>
      ipcRenderer.invoke('sync:signIn', { email, password }),
    signUp: (email, password) =>
      ipcRenderer.invoke('sync:signUp', { email, password }),
    signOut: () => ipcRenderer.invoke('sync:signOut'),
    now: () => ipcRenderer.invoke('sync:now'),
    onStatus: (callback) =>
      ipcRenderer.on('sync:status', (_e, s) => callback(s))
  }
});
