'use strict';

/* =========================================================================
 * 상태 / 영속화
 * ========================================================================= */
const BLOCK_COLORS = [
  'var(--c0)', 'var(--c1)', 'var(--c2)',
  'var(--c3)', 'var(--c4)', 'var(--c5)'
];

let state = {
  todos: [], // { id, title, color, items: [{ id, text, done }] }
  memos: []  // { id, content, tags: [], color }
};

const uid = () => Math.random().toString(36).slice(2, 10);
const nextMemoColor = () => BLOCK_COLORS[state.memos.length % BLOCK_COLORS.length];
const sortTags = (tags) => [...tags].sort((a, b) => a.localeCompare(b, 'ko'));

function normalizeMemo(m, i) {
  return {
    id: m.id || uid(),
    content: m.content || '',
    tags: sortTags(Array.isArray(m.tags) ? m.tags : []),
    color: m.color || BLOCK_COLORS[i % BLOCK_COLORS.length]
  };
}

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
    state.memos = Array.isArray(data.memos) ? data.memos.map(normalizeMemo) : [];
  }
}

window.api.onDataChanged((data) => {
  const active = document.activeElement;
  const editing = active && (active.isContentEditable ||
    active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if (editing) return;
  if (!data) return;
  state.todos = data.todos || [];
  state.memos = (data.memos || []).map(normalizeMemo);
  renderTodos();
  renderMemos();
});

/* =========================================================================
 * 탭(뷰) 관리 — 창마다 가진 뷰가 다름
 * ========================================================================= */
const params = new URLSearchParams(location.search);
let myViews = (params.get('views') || 'todo,memo').split(',').filter(Boolean);
let currentView = myViews[0] || 'todo';

const VIEW_LABEL = { todo: '할 일', memo: '메모' };

function applyView() {
  document.getElementById('view-todo').classList.toggle('active', currentView === 'todo');
  document.getElementById('view-memo').classList.toggle('active', currentView === 'memo');
}

function setView(v) {
  currentView = v;
  renderTabs();
  applyView();
}

let tabDrag = null;

function renderTabs() {
  const tabsEl = document.getElementById('tabs');
  tabsEl.innerHTML = '';
  myViews.forEach((v) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (v === currentView ? ' active' : '');
    btn.dataset.view = v;
    btn.textContent = VIEW_LABEL[v];
    btn.addEventListener('pointerdown', (e) => {
      tabDrag = { btn, view: v, x: e.clientX, y: e.clientY, torn: false };
    });
    btn.addEventListener('click', () => {
      if (btn._torn) { btn._torn = false; return; }
      setView(v);
    });
    tabsEl.appendChild(btn);
  });
}

function setupTabs() {
  document.addEventListener('pointermove', (e) => {
    if (!tabDrag) return;
    if (myViews.length > 1 &&
        Math.hypot(e.clientX - tabDrag.x, e.clientY - tabDrag.y) > 70) {
      tabDrag.torn = true;
      tabDrag.btn.classList.add('tearing');
    }
  });
  document.addEventListener('pointerup', () => {
    if (tabDrag) {
      tabDrag.btn.classList.remove('tearing');
      if (tabDrag.torn) {
        tabDrag.btn._torn = true;
        window.api.tearOut(tabDrag.view);
      }
    }
    tabDrag = null;
  });

  window.api.onViewsSet((views) => {
    myViews = views;
    if (!myViews.includes(currentView)) currentView = myViews[0];
    renderTabs();
    applyView();
  });
}

function setupChrome() {
  document.getElementById('btn-min').addEventListener('click',
    () => window.api.windowControl('minimize'));
  document.getElementById('btn-close').addEventListener('click',
    () => window.api.requestClose());
}

/* =========================================================================
 * 투두(할 일) 뷰
 * ========================================================================= */
const todoBoard = document.getElementById('todo-board');

function addTodo() {
  const color = BLOCK_COLORS[state.todos.length % BLOCK_COLORS.length];
  const todo = { id: uid(), title: '', color, items: [] };
  state.todos.push(todo); // 새 블럭은 맨 아래
  save();
  renderTodos();
  const blocks = todoBoard.querySelectorAll('.todo-block .block-title');
  const last = blocks[blocks.length - 1];
  if (last) { last.focus(); last.scrollIntoView({ block: 'center' }); }
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function renderTodos() {
  todoBoard.innerHTML = '';
  if (state.todos.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.innerHTML = '＋ 버튼을 눌러<br>할 일을 추가해보세요';
    todoBoard.appendChild(hint);
    return;
  }
  state.todos.forEach((todo) => todoBoard.appendChild(buildBlock(todo)));
}

function buildBlock(todo) {
  const block = document.createElement('div');
  block.className = 'todo-block';
  block.style.background = todo.color;
  block.dataset.id = todo.id;

  // 드래그로 순서 변경 (블럭 전체를 드롭 타겟으로)
  block.addEventListener('dragover', (e) => e.preventDefault());
  block.addEventListener('drop', (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/todo');
    if (!draggedId || draggedId === todo.id) return;
    const from = state.todos.findIndex((t) => t.id === draggedId);
    const to = state.todos.findIndex((t) => t.id === todo.id);
    if (from < 0 || to < 0) return;
    const [moved] = state.todos.splice(from, 1);
    state.todos.splice(to, 0, moved);
    save();
    renderTodos();
  });

  const head = document.createElement('div');
  head.className = 'block-head';

  // 드래그 핸들
  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';
  handle.title = '드래그해서 순서 변경';
  handle.draggable = true;
  handle.addEventListener('dragstart', (e) =>
    e.dataTransfer.setData('text/todo', todo.id));

  const title = document.createElement('input');
  title.className = 'block-title';
  title.placeholder = '할 일';
  title.value = todo.title || '';
  title.addEventListener('input', () => { todo.title = title.value; save(); });
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (todo.items.length === 0) {
        const it = { id: uid(), text: '', done: false };
        todo.items.push(it);
        save();
        renderTodos();
        focusItem(todo.id, it.id);
      } else {
        const firstUndone = todo.items.find((x) => !x.done) || todo.items[0];
        focusItem(todo.id, firstUndone.id);
      }
    }
  });

  const del = document.createElement('button');
  del.className = 'icon-btn small block-del';
  del.textContent = '✕';
  del.title = '블럭 삭제';
  del.addEventListener('click', () => {
    state.todos = state.todos.filter((t) => t.id !== todo.id);
    save();
    renderTodos();
  });

  head.appendChild(handle);
  head.appendChild(title);
  head.appendChild(del);
  block.appendChild(head);

  const list = document.createElement('div');
  list.className = 'checklist';
  const ordered = [
    ...todo.items.filter((it) => !it.done),
    ...todo.items.filter((it) => it.done)
  ];
  ordered.forEach((item) => list.appendChild(buildItem(todo, item)));
  block.appendChild(list);

  const addItem = document.createElement('button');
  addItem.className = 'add-item-btn';
  addItem.textContent = '＋ 세부항목';
  addItem.addEventListener('click', () => {
    const it = { id: uid(), text: '', done: false };
    todo.items.push(it);
    save();
    renderTodos();
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
    // 세부항목이 있고 전부 완료되면 블럭 자체를 제거
    if (todo.items.length > 0 && todo.items.every((x) => x.done)) {
      state.todos = state.todos.filter((t) => t.id !== todo.id);
    }
    save();
    renderTodos();
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
 * 메모 뷰 (컬러 블록 + 태그)
 * ========================================================================= */
const memoPage = document.getElementById('memo-page');
const indexList = document.getElementById('index-list');
const memoTagbar = document.getElementById('memo-tagbar');

let activeTags = new Set(); // AND 필터

function noteTitle(content) {
  const lines = (content || '').split('\n');
  for (const line of lines) if (line.trim()) return line.trim();
  return '제목 없음';
}

function allTags() {
  const s = new Set();
  state.memos.forEach((m) => (m.tags || []).forEach((t) => s.add(t)));
  return sortTags([...s]);
}

function visibleMemos() {
  if (activeTags.size === 0) return state.memos;
  return state.memos.filter((m) =>
    [...activeTags].every((t) => (m.tags || []).includes(t)));
}

function addMemo() {
  const memo = { id: uid(), content: '', tags: [], color: nextMemoColor() };
  state.memos.push(memo);
  save();
  renderMemos();
  focusNoteEnd(memo.id);
}

function renderMemos() {
  renderTagbar();
  renderMemoPage();
  renderMemoIndex();
}

/* --- 상단 태그 필터 바 (AND) --- */
function renderTagbar() {
  memoTagbar.innerHTML = '';
  const tags = allTags();
  if (tags.length === 0) { memoTagbar.style.display = 'none'; return; }
  memoTagbar.style.display = 'flex';
  tags.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'tag-toggle' + (activeTags.has(t) ? ' on' : '');
    b.textContent = '#' + t;
    b.addEventListener('click', () => {
      if (activeTags.has(t)) activeTags.delete(t);
      else activeTags.add(t);
      renderMemos();
    });
    memoTagbar.appendChild(b);
  });
  if (activeTags.size > 0) {
    const clear = document.createElement('button');
    clear.className = 'tag-clear-inline';
    clear.textContent = '✕ 전체';
    clear.addEventListener('click', () => { activeTags.clear(); renderMemos(); });
    memoTagbar.appendChild(clear);
  }
}

/* --- 메모 블록들 --- */
function renderMemoPage() {
  memoPage.innerHTML = '';
  if (state.memos.length === 0) {
    state.memos.push({ id: uid(), content: '', tags: [], color: nextMemoColor() });
  }
  const list = visibleMemos();
  if (list.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.innerHTML = '선택한 태그를 모두 가진<br>메모가 없어요.';
    memoPage.appendChild(hint);
    return;
  }
  list.forEach((memo) => memoPage.appendChild(buildMemoBlock(memo)));
}

function buildMemoBlock(memo) {
  const block = document.createElement('div');
  block.className = 'memo-block';
  block.style.background = memo.color;
  block.dataset.id = memo.id;

  // 태그 바
  const tagBar = document.createElement('div');
  tagBar.className = 'note-tags';
  sortTags(memo.tags || []).forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.innerHTML = '#' + t + ' <b>×</b>';
    chip.querySelector('b').addEventListener('click', () => {
      memo.tags = memo.tags.filter((x) => x !== t);
      activeTags.delete(t);
      save();
      renderMemos();
    });
    tagBar.appendChild(chip);
  });
  const tagAdd = document.createElement('input');
  tagAdd.className = 'tag-add';
  tagAdd.placeholder = '＋태그';
  tagAdd.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const t = tagAdd.value.trim().replace(/^#/, '');
      if (t && !memo.tags.includes(t)) {
        memo.tags = sortTags([...memo.tags, t]);
        save();
        renderMemos();
        focusTagAdd(memo.id); // 연속 입력
      } else {
        tagAdd.value = '';
      }
    }
  });
  tagBar.appendChild(tagAdd);
  block.appendChild(tagBar);

  // 본문
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
  body.addEventListener('keydown', (e) => {
    // Shift+Enter: 새 메모 블록
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      memo.content = body.innerText;
      const idx = state.memos.findIndex((m) => m.id === memo.id);
      const nm = { id: uid(), content: '', tags: [], color: nextMemoColor() };
      state.memos.splice(idx + 1, 0, nm);
      save();
      renderMemos();
      focusNoteEnd(nm.id);
    } else if (e.key === 'Backspace' && caretAtStart(body)) {
      const idx = state.memos.findIndex((m) => m.id === memo.id);
      if (idx > 0) {
        e.preventDefault();
        memo.content = body.innerText;
        const prev = state.memos[idx - 1];
        prev.content = (prev.content || '') + (memo.content || '');
        state.memos.splice(idx, 1);
        save();
        renderMemos();
        focusNoteEnd(prev.id);
      }
    }
  });
  block.appendChild(body);

  return block;
}

function caretAtStart(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  const r = sel.getRangeAt(0);
  if (!r.collapsed) return false;
  const pre = r.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length === 0;
}

function focusNoteEnd(id) {
  const body = memoPage.querySelector(`.note-body[data-id="${id}"]`);
  if (!body) return;
  body.focus();
  const sel = window.getSelection();
  const r = document.createRange();
  r.selectNodeContents(body);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
  body.scrollIntoView({ block: 'center' });
}

function focusTagAdd(id) {
  const inp = memoPage.querySelector(`.memo-block[data-id="${id}"] .tag-add`);
  if (inp) inp.focus();
}

function updateIndexTitle(memo) {
  const label = indexList.querySelector(
    `.index-chip[data-id="${memo.id}"] .label`);
  if (label) label.textContent = noteTitle(memo.content);
}

/* --- 사이드 인덱스 (색 칩 → hover 확장, 우클릭 메뉴) --- */
function renderMemoIndex() {
  indexList.innerHTML = '';
  visibleMemos().forEach((memo) => {
    const chip = document.createElement('div');
    chip.className = 'index-chip';
    chip.dataset.id = memo.id;

    const sq = document.createElement('span');
    sq.className = 'chip-square';
    sq.style.background = memo.color;

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = noteTitle(memo.content);

    chip.appendChild(sq);
    chip.appendChild(label);

    chip.addEventListener('click', () => {
      indexList.querySelectorAll('.index-chip').forEach((x) =>
        x.classList.remove('active'));
      chip.classList.add('active');
      const body = memoPage.querySelector(`.note-body[data-id="${memo.id}"]`);
      if (body) {
        body.scrollIntoView({ block: 'center', behavior: 'smooth' });
        body.focus();
      }
    });
    chip.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openCtxMenu(e.clientX, e.clientY, memo);
    });

    indexList.appendChild(chip);
  });
}

/* =========================================================================
 * 우클릭 컨텍스트 메뉴 (색상 변경 / 메모 삭제)
 * ========================================================================= */
const ctxMenu = document.getElementById('ctx-menu');

function openCtxMenu(x, y, memo) {
  ctxMenu.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'ctx-title';
  title.textContent = '색상 변경';
  ctxMenu.appendChild(title);

  const swatches = document.createElement('div');
  swatches.className = 'ctx-swatches';
  BLOCK_COLORS.forEach((c) => {
    const sw = document.createElement('button');
    sw.className = 'ctx-swatch' + (memo.color === c ? ' on' : '');
    sw.style.background = c;
    sw.addEventListener('click', () => {
      memo.color = c;
      save();
      renderMemos();
      hideCtxMenu();
    });
    swatches.appendChild(sw);
  });
  ctxMenu.appendChild(swatches);

  const delBtn = document.createElement('button');
  delBtn.className = 'ctx-item ctx-del';
  delBtn.textContent = '🗑 메모 삭제';
  delBtn.addEventListener('click', () => {
    state.memos = state.memos.filter((m) => m.id !== memo.id);
    save();
    renderMemos();
    hideCtxMenu();
  });
  ctxMenu.appendChild(delBtn);

  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top = y + 'px';
  ctxMenu.classList.add('open');
}

function hideCtxMenu() { ctxMenu.classList.remove('open'); }

function setupCtxMenu() {
  document.addEventListener('click', (e) => {
    if (!ctxMenu.contains(e.target)) hideCtxMenu();
  });
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.index-chip')) hideCtxMenu();
  });
  window.addEventListener('blur', hideCtxMenu);
}

/* =========================================================================
 * 메모 내 검색 (Ctrl+F) — CSS Custom Highlight (포커스 빼앗지 않음)
 * ========================================================================= */
const findbar = document.getElementById('findbar');
const findInput = document.getElementById('find-input');
const findCount = document.getElementById('find-count');
let findRanges = [];
let findIdx = -1;

const hasHighlight = () => (window.CSS && CSS.highlights && window.Highlight);

function clearFindHighlights() {
  if (hasHighlight()) {
    CSS.highlights.delete('find');
    CSS.highlights.delete('find-current');
  }
}

function openFind() {
  findbar.classList.add('open');
  findInput.focus();
  findInput.select();
  if (findInput.value) runFind();
}
function closeFind() {
  findbar.classList.remove('open');
  clearFindHighlights();
  findRanges = [];
  findIdx = -1;
  findCount.textContent = '';
}

function runFind() {
  clearFindHighlights();
  findRanges = [];
  findIdx = -1;
  const q = findInput.value;
  if (!q) { findCount.textContent = ''; return; }

  const walker = document.createTreeWalker(memoPage, NodeFilter.SHOW_TEXT, null);
  const lower = q.toLowerCase();
  let node;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue.toLowerCase();
    let from = 0, at;
    while ((at = text.indexOf(lower, from)) !== -1) {
      const r = document.createRange();
      r.setStart(node, at);
      r.setEnd(node, at + q.length);
      findRanges.push(r);
      from = at + q.length;
    }
  }

  if (findRanges.length === 0) { findCount.textContent = '0/0'; return; }
  if (hasHighlight()) CSS.highlights.set('find', new Highlight(...findRanges));
  gotoMatch(0);
}

function gotoMatch(i) {
  if (findRanges.length === 0) return;
  findIdx = (i + findRanges.length) % findRanges.length;
  const r = findRanges[findIdx];
  if (hasHighlight()) CSS.highlights.set('find-current', new Highlight(r));
  const el = r.startContainer.parentElement;
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  findCount.textContent = `${findIdx + 1}/${findRanges.length}`;
  // 포커스는 검색창에 유지(본문에 입력되는 버그 방지)
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
  showSyncPane(await window.api.sync.status());
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

  window.api.sync.onStatus((status) => showSyncPane(status));
}

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
  setupTabs();
  setupFind();
  setupSync();
  setupCtxMenu();

  document.getElementById('btn-add-todo').addEventListener('click', addTodo);
  document.getElementById('btn-add-memo').addEventListener('click', () => addMemo());

  renderTabs();
  applyView();

  await load();
  renderTodos();
  renderMemos();
}

init();
