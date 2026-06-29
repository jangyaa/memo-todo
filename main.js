'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// 데이터 저장: userData 폴더 안의 단일 JSON 파일로 관리한다.
// ---------------------------------------------------------------------------
function dataFilePath() {
  return path.join(app.getPath('userData'), 'memo-todo-data.json');
}

function loadData() {
  try {
    const raw = fs.readFileSync(dataFilePath(), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    // 파일이 없거나 손상된 경우 빈 상태로 시작한다.
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

// ---------------------------------------------------------------------------
// 윈도우 생성
// ---------------------------------------------------------------------------
let mainWindow = null;
let memoWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 640,
    minWidth: 320,
    minHeight: 360,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    title: 'Memo Todo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 메모를 별도 창으로 띄우기
function createMemoWindow() {
  if (memoWindow && !memoWindow.isDestroyed()) {
    memoWindow.focus();
    return;
  }
  memoWindow = new BrowserWindow({
    width: 460,
    height: 660,
    minWidth: 320,
    minHeight: 360,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    title: 'Memo',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // ?view=memo 로 메모 전용 모드 진입
  memoWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: { view: 'memo', standalone: '1' }
  });

  memoWindow.on('closed', () => {
    memoWindow = null;
  });
}

// ---------------------------------------------------------------------------
// IPC 핸들러
// ---------------------------------------------------------------------------
ipcMain.handle('data:load', () => loadData());
ipcMain.handle('data:save', (_event, data) => {
  const ok = saveData(data);
  // 다른 창에도 변경 사항을 알려 동기화한다.
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.webContents.id !== _event.sender.id) {
      win.webContents.send('data:changed', data);
    }
  });
  return ok;
});

ipcMain.handle('window:control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  switch (action) {
    case 'minimize':
      win.minimize();
      break;
    case 'close':
      win.close();
      break;
    case 'pin-on':
      win.setAlwaysOnTop(true);
      break;
    case 'pin-off':
      win.setAlwaysOnTop(false);
      break;
    default:
      break;
  }
});

ipcMain.handle('memo:openWindow', () => {
  createMemoWindow();
});

// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
