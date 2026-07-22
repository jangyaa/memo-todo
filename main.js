'use strict';

const { app, BrowserWindow, ipcMain, shell, screen,
        Tray, Menu, Notification, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const sync = require('./sync');

// 창이 가질 수 있는 뷰 집합(순서 고정) — 탭 분리/합치기·기본 창 생성에 공용
const ALL_VIEWS = ['todo', 'memo', 'project', 'calendar', 'cycle'];

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

// config.json 탐색: 앱 폴더 → userData → appData의 memo-todo/Memo Todo 폴더 순.
// (개발 실행은 name 'memo-todo', 설치본은 productName 'Memo Todo' 폴더를 userData로 쓰는
//  Electron 특성 때문에 두 폴더 모두 확인한다.)
// 메모장 등이 붙이는 BOM/앞뒤 공백을 제거하고 파싱(BOM 때문에 JSON 파싱 실패하는 문제 방지).
let configDebug = { tried: [], loadedFrom: null }; // 진단용(어디를 찾아봤는지)
function loadConfig() {
  const appData = app.getPath('appData');
  const candidates = [...new Set([
    path.join(__dirname, 'config.json'),
    path.join(app.getPath('userData'), 'config.json'),
    path.join(appData, 'memo-todo', 'config.json'),
    path.join(appData, 'Memo Todo', 'config.json')
  ])];
  configDebug = { tried: [], loadedFrom: null };
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf-8').replace(/^\uFEFF/, '').trim();
      if (raw) {
        const cfg = JSON.parse(raw);
        configDebug.tried.push(p + ' → 읽음');
        configDebug.loadedFrom = p;
        return cfg;
      }
      configDebug.tried.push(p + ' → 빈 파일');
    } catch (err) {
      configDebug.tried.push(p + ' → ' + (err.code === 'ENOENT' ? '없음' : '파싱실패: ' + err.message));
      if (err.code !== 'ENOENT') console.error('config.json 파싱 실패:', p, err.message);
    }
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
  return ALL_VIEWS.filter((v) => views.includes(v));
}

// ---------------------------------------------------------------------------
// 위젯(데스크톱 고정) / 백업 — 기기별 로컬 설정(동기화되는 data와 분리)
// ---------------------------------------------------------------------------
function localCfgPath() {
  return path.join(app.getPath('userData'), 'widget-config.json');
}
function loadLocalCfg() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(localCfgPath(), 'utf-8')) || {}; } catch (_) {}
  return Object.assign({
    desktopMode: false,   // 배경화면 위젯 모드
    alwaysOnTop: true,    // 위젯일 때 항상 위(핀) — 창이 뒤로 사라져 '실종'되는 걸 방지
    backupEnabled: true,  // 매일 로컬 스냅샷 백업
    backupDir: null,      // 백업 폴더(비우면 userData/backups) — 구글드라이브 동기화 폴더 지정 가능
    lastBackupAt: 0
  }, cfg);
}
function saveLocalCfg(patch) {
  const cfg = Object.assign(loadLocalCfg(), patch || {});
  try { fs.writeFileSync(localCfgPath(), JSON.stringify(cfg, null, 2), 'utf-8'); } catch (_) {}
  return cfg;
}

// 창 하나에 현재 위젯 설정을 반영
function applyWidgetMode(win) {
  if (!win || win.isDestroyed()) return;
  const cfg = loadLocalCfg();
  const desktop = !!cfg.desktopMode;
  try { win.setSkipTaskbar(desktop); } catch (_) {}
  // 위젯 모드: 사용자가 켜두면 항상 위로 핀(뒤로 사라져 못 찾는 사고 방지). 끄면 일반 창.
  try {
    if (desktop && cfg.alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver');
    else win.setAlwaysOnTop(false);
  } catch (_) {}
  try { win.setVisibleOnAllWorkspaces(desktop); } catch (_) {}
}
function applyWidgetToAll() {
  BrowserWindow.getAllWindows().forEach(applyWidgetMode);
  updateTrayMenu();
}

// --- 트레이 --- (위젯 모드에서 창을 닫아도 사라지지 않게: 닫기=숨김, 종료는 트레이에서)
let tray = null;
function buildTray() {
  if (tray) return;
  let img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
  if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 });
  try {
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  } catch (_) { tray = null; return; }
  tray.setToolTip('Memo Todo · 개인 홈');
  tray.on('click', () => showMainWindow());
  updateTrayMenu();
}
function updateTrayMenu() {
  if (!tray) return;
  const cfg = loadLocalCfg();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '홈 위젯 열기', click: () => showMainWindow() },
    { type: 'separator' },
    {
      label: '배경 위젯 모드', type: 'checkbox', checked: !!cfg.desktopMode,
      click: (mi) => { saveLocalCfg({ desktopMode: mi.checked }); applyWidgetToAll(); }
    },
    {
      label: '항상 위 고정', type: 'checkbox', checked: !!cfg.alwaysOnTop,
      click: (mi) => { saveLocalCfg({ alwaysOnTop: mi.checked }); applyWidgetToAll(); }
    },
    { type: 'separator' },
    { label: '종료', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}
function showMainWindow() {
  if (firstWindow && !firstWindow.isDestroyed()) {
    if (!firstWindow.isVisible()) firstWindow.show();
    if (firstWindow.isMinimized()) firstWindow.restore();
    firstWindow.focus();
  } else {
    firstWindow = createWindow(ALL_VIEWS.slice(), true);
  }
}

// --- 로컬 스냅샷 백업 (최신 1개만 유지) ---
function resolveBackupDir() {
  const cfg = loadLocalCfg();
  return cfg.backupDir || path.join(app.getPath('userData'), 'backups');
}
function runBackup(force) {
  const cfg = loadLocalCfg();
  if (!force && cfg.backupEnabled === false) return { ok: false, reason: 'disabled' };
  const data = loadData();
  if (!data) return { ok: false, reason: 'no-data' };
  const dir = resolveBackupDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    // '이전 파일은 최근 거 올리면서 지워지게' — 기존 백업 제거 후 오늘 자 1개만 남김
    for (const f of fs.readdirSync(dir)) {
      if (/^memo-todo-backup.*\.json$/.test(f)) {
        try { fs.unlinkSync(path.join(dir, f)); } catch (_) {}
      }
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const file = path.join(dir, `memo-todo-backup-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    saveLocalCfg({ lastBackupAt: Date.now() });
    return { ok: true, file, at: Date.now() };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
// 하루 한 번: 시작 시 오늘 백업이 없으면 한 번, 이후 6시간마다 점검
function scheduleBackups() {
  const check = () => {
    const cfg = loadLocalCfg();
    if (cfg.backupEnabled === false) return;
    const last = new Date(cfg.lastBackupAt || 0);
    const now = new Date();
    const sameDay = last.toDateString() === now.toDateString();
    if (!sameDay) runBackup();
  };
  setTimeout(check, 8000); // 시작 직후(데이터 로드 뒤)
  setInterval(check, 6 * 60 * 60 * 1000);
}

function createWindow(views, isMain) {
  const opts = {
    width: 420, height: 640, minWidth: 300, minHeight: 340,
    frame: false, transparent: true, backgroundColor: '#00000000',
    title: 'Memo Todo',
    icon: path.join(__dirname, 'build', 'icon.png'),
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
  applyWidgetMode(win); // 위젯(배경 고정) 설정 반영
  win.on('closed', () => { winViews.delete(win.id); });
  // 위젯 모드에서 메인 창의 X/닫기는 '종료'가 아니라 '트레이로 숨김'.
  // (창 정리하다 실수로 없애버리는 걸 방지 — 종료는 트레이 메뉴에서만)
  if (isMain) {
    win.on('close', (e) => {
      if (!app.isQuitting && loadLocalCfg().desktopMode) {
        e.preventDefault();
        win.hide();
      }
    });
  }
  // 메인 창의 이동/크기 변경을 저장 → 다음 실행 때 같은 자리.
  // move는 드래그 중 초당 수십 번 발생하므로 디바운스(멈춘 뒤 한 번만 기록) —
  // 매번 동기 파일쓰기를 하면 창 드래그가 뚝뚝 끊긴다.
  if (isMain) {
    let persistTimer = null;
    const persist = () => {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) return;
        saveWinState(win.getBounds());
      }, 400);
    };
    win.on('resize', persist);
    win.on('move', persist);
    win.on('close', () => {
      clearTimeout(persistTimer);
      if (!win.isMinimized() && !win.isMaximized()) saveWinState(win.getBounds());
    });
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

// 동기화 상태 + 진단 정보(미설정일 때 화면에 원인을 그대로 보여주기 위함)
function syncStatusPayload() {
  const meta = loadMeta();
  return {
    configured: sync.isConfigured(),
    signedIn: !!sync.user,
    email: sync.user ? sync.user.email : null,
    lastSyncAt: meta.updatedAt || 0,
    debug: {
      version: app.getVersion(),
      packaged: app.isPackaged,
      libLoaded: sync.hasLib(),
      reason: sync.reason(),
      userData: app.getPath('userData'),
      configLoadedFrom: configDebug.loadedFrom,
      configTried: configDebug.tried
    }
  };
}
function notifyStatus() {
  broadcast('sync:status', syncStatusPayload());
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
  // 진단 파일: 왜 동기화가 설정/미설정인지 userData에 기록(사용자가 열어볼 수 있게)
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), 'sync-debug.txt'),
      [
        '시각: ' + new Date().toLocaleString(),
        '버전: ' + app.getVersion() + (app.isPackaged ? ' (설치본)' : ' (개발 실행)'),
        'userData: ' + app.getPath('userData'),
        '라이브러리 로드(@supabase): ' + sync.hasLib(),
        'config 읽음: ' + !!config + (configDebug.loadedFrom ? ' ← ' + configDebug.loadedFrom : ''),
        '찾아본 경로:',
        ...configDebug.tried.map((t) => '  - ' + t),
        'supabaseUrl 있음: ' + !!(config && config.supabaseUrl),
        'anonKey 있음: ' + !!(config && config.supabaseAnonKey),
        '설정됨(configured): ' + sync.isConfigured(),
        '사유: ' + sync.reason()
      ].join('\n'), 'utf-8');
  } catch (_) {}
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

// --- 위젯(배경 고정) 설정 IPC ---
ipcMain.handle('widget:status', () => {
  const c = loadLocalCfg();
  return { desktopMode: !!c.desktopMode, alwaysOnTop: !!c.alwaysOnTop, platform: process.platform };
});
ipcMain.handle('widget:set', (_e, patch) => {
  const clean = {};
  if (patch && typeof patch.desktopMode === 'boolean') clean.desktopMode = patch.desktopMode;
  if (patch && typeof patch.alwaysOnTop === 'boolean') clean.alwaysOnTop = patch.alwaysOnTop;
  const c = saveLocalCfg(clean);
  applyWidgetToAll();
  return { desktopMode: !!c.desktopMode, alwaysOnTop: !!c.alwaysOnTop, platform: process.platform };
});

// --- 백업 IPC ---
ipcMain.handle('backup:status', () => {
  const c = loadLocalCfg();
  return { enabled: c.backupEnabled !== false, dir: resolveBackupDir(), lastBackupAt: c.lastBackupAt || 0 };
});
ipcMain.handle('backup:setEnabled', (_e, on) => {
  saveLocalCfg({ backupEnabled: !!on });
  const c = loadLocalCfg();
  return { enabled: c.backupEnabled !== false, dir: resolveBackupDir(), lastBackupAt: c.lastBackupAt || 0 };
});
ipcMain.handle('backup:now', () => runBackup(true));
ipcMain.handle('backup:chooseDir', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win, {
    title: '백업 폴더 선택 (구글드라이브 동기화 폴더를 고르면 매일 드라이브로 올라갑니다)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (!res.canceled && res.filePaths[0]) saveLocalCfg({ backupDir: res.filePaths[0] });
  const c = loadLocalCfg();
  return { enabled: c.backupEnabled !== false, dir: resolveBackupDir(), lastBackupAt: c.lastBackupAt || 0 };
});
ipcMain.handle('backup:resetDir', () => {
  saveLocalCfg({ backupDir: null });
  const c = loadLocalCfg();
  return { enabled: c.backupEnabled !== false, dir: resolveBackupDir(), lastBackupAt: c.lastBackupAt || 0 };
});

// --- 임박 마감 알림(OS 알림) ---
ipcMain.handle('notify', (_e, { title, body } = {}) => {
  try {
    if (Notification.isSupported()) {
      new Notification({ title: title || '알림', body: body || '' }).show();
    }
  } catch (_) {}
  return true;
});

// 메모 별도 편집 창 (프레임리스 → 앱과 동일한 커스텀 테마색 상단바)
ipcMain.handle('memo:openEditor', (_e, id) => {
  const win = new BrowserWindow({
    width: 560, height: 680, minWidth: 360, minHeight: 360,
    frame: false, transparent: true, backgroundColor: '#00000000',
    title: '메모',
    icon: path.join(__dirname, 'build', 'icon.png'),
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
  const cur = winViews.get(win.id) || ALL_VIEWS.slice();
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
  const cur = winViews.get(win.id) || ALL_VIEWS.slice();
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
ipcMain.handle('sync:status', () => syncStatusPayload());

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
// 단일 인스턴스: 자동 실행/재실행 시 창이 중복으로 뜨지 않고 기존 창을 앞으로.
// 개발 실행(npm start)은 락을 걸지 않음 — 설치본이 떠 있어도 개발 창이 항상 새로 뜨게
// (락이 겹치면 npm start가 조용히 종료되고 설치본 창만 앞으로 와서, 새 코드를 테스트한다고
//  착각하게 되는 문제 방지).
const gotLock = app.isPackaged ? app.requestSingleInstanceLock() : true;
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
    buildTray();
    scheduleBackups();
    firstWindow = createWindow(ALL_VIEWS.slice(), true);
    firstWindow.webContents.once('did-finish-load', () => { startSync(); });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        firstWindow = createWindow(ALL_VIEWS.slice(), true);
      }
    });
  });

  app.on('before-quit', () => { app.isQuitting = true; });

  app.on('window-all-closed', () => {
    // 위젯 모드에선 트레이로 살아있으므로 종료하지 않음(사고 방지).
    if (process.platform === 'darwin') return;
    if (loadLocalCfg().desktopMode && !app.isQuitting) return;
    app.quit();
  });
}
