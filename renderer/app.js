'use strict';

/* =========================================================================
 * 상태 / 영속화
 * ========================================================================= */
const BLOCK_COLORS = [
  'var(--c0)', 'var(--c1)', 'var(--c2)',
  'var(--c3)', 'var(--c4)', 'var(--c5)'
];

let state = {
  todos: [],   // { id, title, color, items: [{ id, text, done }] }
  folders: [], // { id, name, collapsed }
  memos: []    // { id, folderId|null, content }
};

const uid = () => Math.random().toString(36).slice(2, 10);

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.api.saveData(JSON.parse(JSON.stringify(state)));
  }, 350);
}

async function load() {
  const data = await window.api.loadData();
  if (data && typeof data === 'object') {
    state.todos = Array.isArray(data.todos) ? data.todos : [];
    state.folders = Array.isArray(data.folders) ? data.folders : [];
    state.memos = Array.isArray(data.memos) ? data.memos : [];
  }
}

/* 다른 창에서 변경 시 동기화 (편집 중이면 방해하지 않도록 건너뜀) */
window.api.onDataChanged((data) => {
  const active = document.activeElement;
  const editing = active && (active.isContentEditable ||
    active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if (editing) return;
  if (!data) return;
  state.todos = data.todos || [];
  state.folders = data.folders || [];
  state.memos = data.memos || [];
  renderTodos();
  renderMemos();
});

/* =========================================================================
 * 뷰 전환 / 윈도우 컨트롤
 * ========================================================================= */
const params = new URLSearchParams(location.search);
const STANDALONE_MEMO = params.get('standalone') === '1';

function switchView(view) {
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.view === view));
  document.getElementById('view-todo').classList.toggle('active', view === 'todo');
  document.getElementById('view-memo').classList.toggle('active', view === 'memo');
}

function setupChrome() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  document.getElementById('btn-min').addEventListener('click',
    () => window.api.windowControl('minimize'));
  document.getElementById('btn-close').addEventListener('click',
    () => window.api.windowControl('close'));

  const pinBtn = document.getElementById('btn-pin');
  let pinned = false;
  pinBtn.addEventListener('click', () => {
    pinned = !pinned;
    pinBtn.classList.toggle('active', pinned);
    window.api.windowControl(pinned ? 'pin-on' : 'pin-off');
  });

  document.getElementById('btn-open-memo').addEventListener('click',
    () => window.api.openMemoWindow());

  // 메모 전용(별도) 창이면 탭/메모열기 버튼 숨김
  if (STANDALONE_MEMO) {
    document.querySelector('.titlebar-tabs').style.display = 'none';
    document.getElementById('btn-open-memo').style.display = 'none';
    switchView('memo');
  }
}

/* =========================================================================
 * 투두(할 일) 뷰
 * ========================================================================= */
const todoBoard = document.getElementById('todo-board');
const todoSearch = document.getElementById('todo-search');

function addTodo() {
  const color = BLOCK_COLORS[state.todos.length % BLOCK_COLORS.length];
  const todo = { id: uid(), title: '', color, items: [] };
  state.todos.unshift(todo);
  save();
  renderTodos();
  // 새 블럭 제목에 포커스
  const first = todoBoard.querySelector('.todo-block .block-title');
  if (first) first.focus();
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function renderTodos() {
  const q = todoSearch.value.trim().toLowerCase();
  todoBoard.innerHTML = '';

  const visible = state.todos.filter((t) => {
    if (!q) return true;
    if ((t.title || '').toLowerCase().includes(q)) return true;
    return t.items.some((it) => (it.text || '').toLowerCase().includes(q));
  });

  if (visible.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.innerHTML = q
      ? '검색 결과가 없어요.'
      : '＋ 버튼을 눌러<br>할 일 블럭을 추가해보세요 🤍';
    todoBoard.appendChild(hint);
    return;
  }

  visible.forEach((todo) => todoBoard.appendChild(buildBlock(todo)));
}

function buildBlock(todo) {
  const block = document.createElement('div');
  block.className = 'todo-block';
  block.style.background = todo.color;

  // 헤더: 제목 + 삭제
  const head = document.createElement('div');
  head.className = 'block-head';

  const title = document.createElement('input');
  title.className = 'block-title';
  title.placeholder = '할 일';
  title.value = todo.title || '';
  title.addEventListener('input', () => { todo.title = title.value; save(); });

  const menu = document.createElement('div');
  menu.className = 'block-menu';
  const del = document.createElement('button');
  del.className = 'icon-btn small';
  del.textContent = '🗑';
  del.title = '블럭 삭제';
  del.addEventListener('click', () => {
    state.todos = state.todos.filter((t) => t.id !== todo.id);
    save();
    renderTodos();
  });
  menu.appendChild(del);

  head.appendChild(title);
  head.appendChild(menu);
  block.appendChild(head);

  // 체크리스트 (미완료 먼저, 완료 항목은 하단으로)
  const list = document.createElement('div');
  list.className = 'checklist';

  const ordered = [
    ...todo.items.filter((it) => !it.done),
    ...todo.items.filter((it) => it.done)
  ];
  ordered.forEach((item) => list.appendChild(buildItem(todo, item)));
  block.appendChild(list);

  // 세부항목 추가
  const addItem = document.createElement('button');
  addItem.className = 'add-item-btn';
  addItem.textContent = '＋ 세부항목';
  addItem.addEventListener('click', () => {
    const it = { id: uid(), text: '', done: false };
    todo.items.push(it);
    save();
    renderTodos();
    // 방금 추가한 항목에 포커스
    focusItem(todo.id, it.id);
  });
  block.appendChild(addItem);

  return block;
}

function buildItem(todo, item) {
  const row = document.createElement('div');
  row.className = 'check-item' + (item.done ? ' done' : '');
  row.dataset.todo = todo.id;
  row.dataset.item = item.id;

  const box = document.createElement('div');
  box.className = 'check-box';
  box.textContent = item.done ? '✓' : '';
  box.addEventListener('click', () => {
    item.done = !item.done;
    save();
    renderTodos(); // 완료 시 하단으로 재배치
  });

  const text = document.createElement('textarea');
  text.className = 'check-text';
  text.rows = 1;
  text.value = item.text || '';
  text.placeholder = '세부 항목';
  text.addEventListener('input', () => {
    item.text = text.value;
    autoGrow(text);
    save();
  });
  text.addEventListener('keydown', (e) => {
    // Enter: 새 항목 추가 / Backspace(빈 항목): 삭제
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const it = { id: uid(), text: '', done: false };
      const idx = todo.items.findIndex((x) => x.id === item.id);
      todo.items.splice(idx + 1, 0, it);
      save();
      renderTodos();
      focusItem(todo.id, it.id);
    } else if (e.key === 'Backspace' && text.value === '') {
      e.preventDefault();
      todo.items = todo.items.filter((x) => x.id !== item.id);
      save();
      renderTodos();
    }
  });

  const del = document.createElement('button');
  del.className = 'item-del';
  del.textContent = '✕';
  del.addEventListener('click', () => {
    todo.items = todo.items.filter((x) => x.id !== item.id);
    save();
    renderTodos();
  });

  row.appendChild(box);
  row.appendChild(text);
  row.appendChild(del);

  // 렌더 직후 높이 맞춤
  requestAnimationFrame(() => autoGrow(text));
  return row;
}

function focusItem(todoId, itemId) {
  const row = todoBoard.querySelector(
    `.check-item[data-todo="${todoId}"][data-item="${itemId}"]`);
  if (row) {
    const ta = row.querySelector('.check-text');
    if (ta) ta.focus();
  }
}

/* =========================================================================
 * 메모 뷰
 * ========================================================================= */
const memoPage = document.getElementById('memo-page');
const indexList = document.getElementById('index-list');

function noteTitle(content) {
  const lines = (content || '').split('\n');
  for (const line of lines) {
    if (line.trim()) return line.trim();
  }
  return '제목 없음';
}

function addMemo(folderId = null) {
  const memo = { id: uid(), folderId, content: '' };
  state.memos.push(memo);
  save();
  renderMemos();
  const el = memoPage.querySelector(`.note-body[data-id="${memo.id}"]`);
  if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
}

function addFolder() {
  state.folders.push({ id: uid(), name: '새 폴더', collapsed: false });
  save();
  renderMemos();
}

function renderMemos() {
  renderMemoPage();
  renderMemoIndex();
}

/* --- 본문(한 페이지, 구분선으로 메모 구분) --- */
function renderMemoPage() {
  memoPage.innerHTML = '';
  if (state.memos.length === 0) {
    addPlaceholderNote();
  }
  state.memos.forEach((memo, i) => {
    if (i > 0) {
      const div = document.createElement('div');
      div.className = 'memo-divider';
      memoPage.appendChild(div);
    }
    memoPage.appendChild(buildNote(memo));
  });
}

function addPlaceholderNote() {
  // 메모가 하나도 없을 때 자동으로 빈 메모 1개 생성
  state.memos.push({ id: uid(), folderId: null, content: '' });
}

function buildNote(memo) {
  const wrap = document.createElement('div');
  wrap.className = 'memo-note';
  wrap.dataset.id = memo.id;

  const body = document.createElement('div');
  body.className = 'note-body';
  body.dataset.id = memo.id;
  body.contentEditable = 'true';
  body.spellcheck = false;
  body.innerText = memo.content || '';

  body.addEventListener('input', () => {
    memo.content = body.innerText;
    save();
    updateIndexTitle(memo);
  });

  wrap.appendChild(body);
  return wrap;
}

/* 인덱스의 해당 항목 제목만 갱신 (전체 리렌더 없이) */
function updateIndexTitle(memo) {
  const label = indexList.querySelector(
    `.index-item[data-id="${memo.id}"] .label`);
  if (label) label.textContent = noteTitle(memo.content);
}

/* --- 사이드 인덱스 (폴더 + 제목) --- */
function renderMemoIndex() {
  indexList.innerHTML = '';

  // 분류 없는 메모
  const ungrouped = state.memos.filter((m) => !m.folderId ||
    !state.folders.some((f) => f.id === m.folderId));
  const dropRoot = makeDropZone(null);
  ungrouped.forEach((m) => dropRoot.appendChild(buildIndexItem(m)));
  indexList.appendChild(dropRoot);

  // 폴더별
  state.folders.forEach((folder) => {
    indexList.appendChild(buildFolder(folder));
  });
}

function makeDropZone(folderId) {
  const zone = document.createElement('div');
  zone.className = 'drop-zone';
  zone.addEventListener('dragover', (e) => e.preventDefault());
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/memo');
    const memo = state.memos.find((m) => m.id === id);
    if (memo) { memo.folderId = folderId; save(); renderMemoIndex(); }
  });
  return zone;
}

function buildFolder(folder) {
  const el = document.createElement('div');
  el.className = 'folder' + (folder.collapsed ? ' collapsed' : '');

  const head = document.createElement('div');
  head.className = 'folder-head';

  const caret = document.createElement('span');
  caret.className = 'folder-caret';
  caret.textContent = folder.collapsed ? '▶' : '▼';
  caret.addEventListener('click', () => {
    folder.collapsed = !folder.collapsed;
    save();
    renderMemoIndex();
  });

  const name = document.createElement('input');
  name.className = 'folder-name';
  name.value = folder.name;
  name.addEventListener('input', () => { folder.name = name.value; save(); });

  const del = document.createElement('button');
  del.className = 'icon-btn small folder-del';
  del.textContent = '✕';
  del.title = '폴더 삭제(메모는 분류 없음으로)';
  del.addEventListener('click', () => {
    state.memos.forEach((m) => { if (m.folderId === folder.id) m.folderId = null; });
    state.folders = state.folders.filter((f) => f.id !== folder.id);
    save();
    renderMemoIndex();
  });

  head.appendChild(caret);
  head.appendChild(name);
  head.appendChild(del);

  // 폴더 헤더에 드롭하면 해당 폴더로 이동
  head.addEventListener('dragover', (e) => e.preventDefault());
  head.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/memo');
    const memo = state.memos.find((m) => m.id === id);
    if (memo) { memo.folderId = folder.id; save(); renderMemoIndex(); }
  });

  el.appendChild(head);

  const children = makeDropZone(folder.id);
  children.classList.add('folder-children');
  state.memos.filter((m) => m.folderId === folder.id)
    .forEach((m) => children.appendChild(buildIndexItem(m)));
  el.appendChild(children);

  return el;
}

function buildIndexItem(memo) {
  const item = document.createElement('div');
  item.className = 'index-item';
  item.dataset.id = memo.id;
  item.draggable = true;

  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.textContent = '●';

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = noteTitle(memo.content);

  item.appendChild(dot);
  item.appendChild(label);

  item.addEventListener('click', () => {
    indexList.querySelectorAll('.index-item').forEach((x) =>
      x.classList.remove('active'));
    item.classList.add('active');
    const body = memoPage.querySelector(`.note-body[data-id="${memo.id}"]`);
    if (body) { body.scrollIntoView({ block: 'center', behavior: 'smooth' }); body.focus(); }
  });

  item.addEventListener('dragstart', (e) =>
    e.dataTransfer.setData('text/memo', memo.id));

  return item;
}

/* =========================================================================
 * 메모 내 검색 (Ctrl+F)
 * ========================================================================= */
const findbar = document.getElementById('findbar');
const findInput = document.getElementById('find-input');
const findCount = document.getElementById('find-count');
let findMatches = [];
let findIdx = -1;

function openFind() {
  findbar.classList.add('open');
  findInput.focus();
  findInput.select();
  if (findInput.value) runFind();
}
function closeFind() {
  findbar.classList.remove('open');
  findMatches = [];
  findIdx = -1;
  findCount.textContent = '';
}

function runFind() {
  const q = findInput.value;
  findMatches = [];
  findIdx = -1;
  if (!q) { findCount.textContent = ''; return; }

  // memo-page 내 모든 텍스트 노드를 순회하며 일치 위치를 찾는다.
  const walker = document.createTreeWalker(memoPage, NodeFilter.SHOW_TEXT, null);
  const lower = q.toLowerCase();
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue.toLowerCase();
    let from = 0, at;
    while ((at = text.indexOf(lower, from)) !== -1) {
      findMatches.push({ node, start: at, end: at + q.length });
      from = at + q.length;
    }
  }

  if (findMatches.length === 0) { findCount.textContent = '0/0'; return; }
  gotoMatch(0);
}

function gotoMatch(i) {
  if (findMatches.length === 0) return;
  findIdx = (i + findMatches.length) % findMatches.length;
  const m = findMatches[findIdx];
  const range = document.createRange();
  range.setStart(m.node, m.start);
  range.setEnd(m.node, m.end);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const parent = m.node.parentElement;
  if (parent) parent.scrollIntoView({ block: 'center', behavior: 'smooth' });
  findCount.textContent = `${findIdx + 1}/${findMatches.length}`;
}

function setupFind() {
  document.getElementById('find-next').addEventListener('click',
    () => gotoMatch(findIdx + 1));
  document.getElementById('find-prev').addEventListener('click',
    () => gotoMatch(findIdx - 1));
  document.getElementById('find-close').addEventListener('click', closeFind);

  findInput.addEventListener('input', runFind);
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); gotoMatch(findIdx + (e.shiftKey ? -1 : 1)); }
    else if (e.key === 'Escape') closeFind();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      // 메모 뷰일 때만 동작
      if (document.getElementById('view-memo').classList.contains('active')) {
        e.preventDefault();
        openFind();
      }
    }
  });
}

/* =========================================================================
 * 클라우드 동기화 패널
 * ========================================================================= */
const syncOverlay = document.getElementById('sync-overlay');

function showSyncPane(status) {
  const panes = {
    'sync-not-configured': !status.configured,
    'sync-signin': status.configured && !status.signedIn,
    'sync-signedin': status.configured && status.signedIn
  };
  Object.entries(panes).forEach(([id, on]) =>
    document.getElementById(id).classList.toggle('active', on));

  // 동기화 버튼 상태 표시
  document.getElementById('btn-sync').classList.toggle('active', status.signedIn);

  if (status.signedIn) {
    document.getElementById('sync-who').textContent = status.email || '';
    const last = status.lastSyncAt
      ? new Date(status.lastSyncAt).toLocaleString('ko-KR')
      : '아직 없음';
    document.getElementById('sync-last').textContent = '마지막 동기화: ' + last;
  }
}

async function refreshSyncStatus() {
  const status = await window.api.sync.status();
  showSyncPane(status);
}

function setupSync() {
  const overlay = syncOverlay;
  const errEl = document.getElementById('sync-error');

  document.getElementById('btn-sync').addEventListener('click', async () => {
    await refreshSyncStatus();
    overlay.classList.add('open');
  });
  document.getElementById('sync-close').addEventListener('click',
    () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });

  const email = () => document.getElementById('sync-email').value.trim();
  const pw = () => document.getElementById('sync-password').value;

  document.getElementById('btn-signin').addEventListener('click', async () => {
    errEl.textContent = '';
    try {
      await window.api.sync.signIn(email(), pw());
      await reloadFromLocal();
      await refreshSyncStatus();
    } catch (e) { errEl.textContent = '로그인 실패: ' + (e.message || e); }
  });

  document.getElementById('btn-signup').addEventListener('click', async () => {
    errEl.textContent = '';
    try {
      const r = await window.api.sync.signUp(email(), pw());
      if (r.needsConfirm) {
        errEl.textContent = '가입됨! 이메일 확인 후 로그인하세요. ' +
          '(또는 Supabase에서 이메일 확인 끄기)';
      } else {
        await reloadFromLocal();
        await refreshSyncStatus();
      }
    } catch (e) { errEl.textContent = '회원가입 실패: ' + (e.message || e); }
  });

  document.getElementById('btn-signout').addEventListener('click', async () => {
    await window.api.sync.signOut();
    await refreshSyncStatus();
  });

  document.getElementById('btn-sync-now').addEventListener('click', async () => {
    const btn = document.getElementById('btn-sync-now');
    btn.textContent = '동기화 중…';
    await window.api.sync.now();
    await reloadFromLocal();
    await refreshSyncStatus();
    btn.textContent = '지금 동기화';
  });

  // 메인 프로세스가 보내는 상태 변경 반영
  window.api.sync.onStatus((status) => showSyncPane(status));
}

// 로컬 데이터를 다시 읽어 화면 갱신 (동기화 직후)
async function reloadFromLocal() {
  await load();
  renderTodos();
  renderMemos();
}

/* =========================================================================
 * 초기화
 * ========================================================================= */
async function init() {
  setupChrome();
  setupFind();
  setupSync();

  document.getElementById('btn-add-todo').addEventListener('click', addTodo);
  todoSearch.addEventListener('input', renderTodos);
  document.getElementById('btn-add-memo').addEventListener('click', () => addMemo());
  document.getElementById('btn-add-folder').addEventListener('click', addFolder);

  await load();
  renderTodos();
  renderMemos();
}

init();
