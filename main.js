'use strict';

const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
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

// 메인 창 위치·크기 저장(껐다 켜도 같은 자리에 뜨도록) — 스티커 메모처럼
function winStateFilePath() {
  return path.join(app.getPath('userData'), 'memo-todo-window.json');
}
function loadWinState() {
  try { return JSON.parse(fs.readFileSync(winStateFilePath(), 'utf-8')); } catch (_) { return null; }
}
function saveWinState(bounds) {
  try { fs.writeFileSync(winStateFilePath(), JSON.stringify(bounds), 'utf-8'); } catch (_) {}
}
// 저장된 창 위치가 현재 모니터 안에 보이는지(모니터 분리/해상도 변경 대비)
function boundsVisible(b) {
  if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return false;
  return screen.getAllDisplays().some((d) => {
    const w = d.workArea;
    return b.x < w.x + w.width && b.x + (b.width || 0) > w.x &&
           b.y < w.y + w.height && b.y + (b.height || 0) > w.y;
  });
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

function createWindow(views, isMain) {
  const opts = {
    width: 420, height: 640, minWidth: 300, minHeight: 340,
    frame: false, transparent: true, backgroundColor: '#00000000',
    title: 'Memo Todo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  };
  // 메인 창: 지난번 위치·크기 복원(화면 밖이면 무시하고 기본값)
  const st = isMain ? loadWinState() : null;
  if (st && boundsVisible(st)) {
    opts.x = st.x; opts.y = st.y;
    if (Number.isFinite(st.width)) opts.width = st.width;
    if (Number.isFinite(st.height)) opts.height = st.height;
  }
  const win = new BrowserWindow(opts);
  winViews.set(win.id, orderViews(views));
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'),
    { query: { views: orderViews(views).join(',') } });
  win.on('closed', () => { winViews.delete(win.id); });
  // 메인 창의 이동/크기 변경을 저장 → 다음 실행 때 같은 자리
  if (isMain) {
    const persist = () => {
      if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) return;
      saveWinState(win.getBounds());
    };
    win.on('resize', persist);
    win.on('move', persist);
  }
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

// 테마색 실시간 미리보기 — 저장 없이 다른 창에만 즉시 전달
ipcMain.handle('theme:preview', (event, color) => {
  broadcast('theme:preview', color, event.sender.id);
  return true;
});

ipcMain.handle('window:control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') { win.isMaximized() ? win.unmaximize() : win.maximize(); }
  else if (action === 'close') win.close();
});

// 외부 링크는 기본 브라우저로 열기
ipcMain.handle('open:external', (_e, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
});

// 메모 별도 편집 창 (프레임리스 → 앱과 동일한 커스텀 테마색 상단바)
ipcMain.handle('memo:openEditor', (_e, id) => {
  const win = new BrowserWindow({
    width: 560, height: 680, minWidth: 360, minHeight: 360,
    frame: false, transparent: true, backgroundColor: '#00000000',
    title: '메모',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'editor.html'),
    { query: { id: String(id) } });
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

// 부팅 시 자동 실행(스티커 메모처럼) — 설정에서 끄지 않았으면 켬. 패키징된 앱에서만 등록.
function applyAutoLaunch() {
  if (!app.isPackaged) return;
  const data = loadData();
  const enabled = !(data && data.settings && data.settings.autoLaunch === false);
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, args: [] });
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// 단일 인스턴스: 자동 실행/재실행 시 창이 중복으로 뜨지 않고 기존 창을 앞으로
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (firstWindow && !firstWindow.isDestroyed()) {
      if (firstWindow.isMinimized()) firstWindow.restore();
      firstWindow.focus();
    }
  });

  app.whenReady().then(() => {
    applyAutoLaunch();
    firstWindow = createWindow(['todo', 'memo'], true);
    firstWindow.webContents.once('did-finish-load', () => { startSync(); });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        firstWindow = createWindow(['todo', 'memo'], true);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
