'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const sync = require('./sync');

// ---------------------------------------------------------------------------
// 파일 경로
// ---------------------------------------------------------------------------
function dataFilePath() {
  return path.join(app.getPath('userData'), 'memo-todo-data.json');
}
function metaFilePath() {
  return path.join(app.getPath('userData'), 'memo-todo-meta.json');
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(dataFilePath(), 'utf-8'));
  } catch (_) {
    return null;
  }
}
function saveData(data) {
  try {
    fs.writeFileSync(dataFilePath(), JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('데이터 저장 실패:', err);
    return false;
  }
}

function loadMeta() {
  try {
    return JSON.parse(fs.readFileSync(metaFilePath(), 'utf-8'));
  } catch (_) {
    return { updatedAt: 0 };
  }
}
function setMeta(updatedAt) {
  try {
    fs.writeFileSync(metaFilePath(), JSON.stringify({ updatedAt }), 'utf-8');
  } catch (_) {}
}

// config.json: 앱 폴더 우선, 없으면 userData 에서 읽는다.
function loadConfig() {
  const candidates = [
    path.join(__dirname, 'config.json'),
    path.join(app.getPath('userData'), 'config.json')
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (_) {}
  }
  return null;
}

// ---------------------------------------------------------------------------
// 윈도우
// ---------------------------------------------------------------------------
let mainWindow = null;
let memoWindow = null;

function broadcast(channel, payload, exceptId = null) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (exceptId !== null && win.webContents.id === exceptId) return;
    win.webContents.send(channel, payload);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400, height: 640, minWidth: 320, minHeight: 360,
    frame: false, transparent: true, backgroundColor: '#00000000',
    title: 'Memo Todo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createMemoWindow() {
  if (memoWindow && !memoWindow.isDestroyed()) { memoWindow.focus(); return; }
  memoWindow = new BrowserWindow({
    width: 460, height: 660, minWidth: 320, minHeight: 360,
    frame: false, transparent: true, backgroundColor: '#00000000',
    title: 'Memo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  memoWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'),
    { query: { view: 'memo', standalone: '1' } });
  memoWindow.on('closed', () => { memoWindow = null; });
}

// ---------------------------------------------------------------------------
// 동기화 통합
// ---------------------------------------------------------------------------
let pushTimer = null;

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    try {
      const user = sync.user || await sync.currentUser();
      if (!user) return;
      const ts = await sync.push(loadData());
      if (ts) { setMeta(ts); notifyStatus(); }
    } catch (err) {
      console.error('원격 저장 실패:', err.message);
    }
  }, 1200);
}

function notifyStatus() {
  const meta = loadMeta();
  broadcast('sync:status', {
    configured: sync.isConfigured(),
    signedIn: !!sync.user,
    email: sync.user ? sync.user.email : null,
    lastSyncAt: meta.updatedAt || 0
  });
}

// 시작 시 / 로그인 후: 원격과 로컬을 맞춘다.
async function reconcile() {
  const remote = await sync.pull().catch((e) => {
    console.error('pull 실패:', e.message); return null;
  });
  const local = loadData();
  const localTs = loadMeta().updatedAt || 0;

  if (remote && (!local || remote.updatedAt > localTs)) {
    // 원격이 더 최신 → 로컬에 반영
    saveData(remote.data);
    setMeta(remote.updatedAt);
    broadcast('data:changed', remote.data);
  } else if (local) {
    // 로컬이 더 최신(또는 원격 없음) → 올리기
    const ts = await sync.push(local).catch((e) => {
      console.error('push 실패:', e.message); return null;
    });
    if (ts) setMeta(ts);
  }
  notifyStatus();
}

async function startSync() {
  const config = loadConfig();
  sync.init(app.getPath('userData'), config);
  notifyStatus();
  if (!sync.isConfigured()) return;

  const user = await sync.currentUser().catch(() => null);
  notifyStatus();
  if (!user) return;

  await reconcile();
  sync.onRemoteChange = (data) => {
    saveData(data);
    setMeta(Date.now());
    broadcast('data:changed', data);
    notifyStatus();
  };
  sync.subscribe();
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('data:load', () => loadData());

ipcMain.handle('data:save', (event, data) => {
  saveData(data);
  setMeta(Date.now());
  broadcast('data:changed', data, event.sender.id);
  schedulePush();
  return true;
});

ipcMain.handle('window:control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'close') win.close();
  else if (action === 'pin-on') win.setAlwaysOnTop(true);
  else if (action === 'pin-off') win.setAlwaysOnTop(false);
});

ipcMain.handle('memo:openWindow', () => createMemoWindow());

// --- 동기화 IPC ---
ipcMain.handle('sync:status', () => {
  const meta = loadMeta();
  return {
    configured: sync.isConfigured(),
    signedIn: !!sync.user,
    email: sync.user ? sync.user.email : null,
    lastSyncAt: meta.updatedAt || 0
  };
});

ipcMain.handle('sync:signIn', async (_e, { email, password }) => {
  await sync.signIn(email, password);
  await reconcile();
  sync.onRemoteChange = (data) => {
    saveData(data); setMeta(Date.now());
    broadcast('data:changed', data); notifyStatus();
  };
  sync.subscribe();
  return { ok: true, email: sync.user.email };
});

ipcMain.handle('sync:signUp', async (_e, { email, password }) => {
  const user = await sync.signUp(email, password);
  // 이메일 확인이 꺼져 있으면 바로 세션이 생긴다.
  if (sync.user) {
    await reconcile();
    sync.subscribe();
    return { ok: true, email: user.email, needsConfirm: false };
  }
  return { ok: true, email, needsConfirm: true };
});

ipcMain.handle('sync:signOut', async () => {
  sync.unsubscribe();
  await sync.signOut();
  notifyStatus();
  return { ok: true };
});

ipcMain.handle('sync:now', async () => {
  if (!sync.user) await sync.currentUser();
  if (!sync.user) return { ok: false, reason: 'not-signed-in' };
  await reconcile();
  return { ok: true };
});

// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createMainWindow();
  mainWindow.webContents.once('did-finish-load', () => { startSync(); });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
