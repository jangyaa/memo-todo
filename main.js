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
// 윈도우 (각 창이 가진 뷰 집합을 추적: ['todo','memo'] 부분집합)
// ---------------------------------------------------------------------------
let firstWindow = null;
const winViews = new Map(); // win.id -> ['todo','memo']

function broadcast(channel, payload, exceptId = null) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (exceptId !== null && win.webContents.id === exceptId) return;
    win.webContents.send(channel, payload);
  });
}

function orderViews(views) {
  return ['todo', 'memo'].filter((v) => views.includes(v));
}

function createWindow(views) {
  const win = new BrowserWindow({
    width: 420, height: 640, minWidth: 300, minHeight: 340,
    frame: false, transparent: true, backgroundColor: '#00000000',
    title: 'Memo Todo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  winViews.set(win.id, orderViews(views));
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'),
    { query: { views: orderViews(views).join(',') } });
  win.on('closed', () => { winViews.delete(win.id); });
  return win;
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
});

// 탭을 창 밖으로 끌어 분리: 해당 뷰를 새 창으로, 원래 창은 나머지 뷰만
ipcMain.handle('view:tearOut', (event, view) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const cur = winViews.get(win.id) || ['todo', 'memo'];
  if (cur.length < 2) return; // 탭이 하나뿐이면 분리 불가
  const remaining = orderViews(cur.filter((v) => v !== view));
  winViews.set(win.id, remaining);
  win.webContents.send('views:set', remaining);
  createWindow([view]);
});

// X 버튼: 분리된(단일 뷰) 창이면 다른 창으로 합치고, 아니면 일반 닫기
ipcMain.handle('window:requestClose', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const cur = winViews.get(win.id) || ['todo', 'memo'];
  const others = BrowserWindow.getAllWindows().filter((w) => w.id !== win.id);
  if (cur.length === 1 && others.length > 0) {
    const target = others[0];
    const merged = orderViews(
      Array.from(new Set([...(winViews.get(target.id) || []), ...cur])));
    winViews.set(target.id, merged);
    target.webContents.send('views:set', merged);
    target.focus();
    win.destroy();
  } else {
    win.close();
  }
});

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
  firstWindow = createWindow(['todo', 'memo']);
  firstWindow.webContents.once('did-finish-load', () => { startSync(); });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      firstWindow = createWindow(['todo', 'memo']);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
