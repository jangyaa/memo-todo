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

function nextMemoColor() {
  return BLOCK_COLORS[state.memos.length % BLOCK_COLORS.length];
}

function normalizeMemo(m, i) {
  return {
    id: m.id || uid(),
    content: m.content || '',
    tags: Array.isArray(m.tags) ? m.tags : [],
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

/* 다른 창에서 변경 시 동기화 (편집 중이면 방해하지 않도록 건너뜀) */
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

let suppressMemoTabClick = false;

function setupChrome() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.dataset.view === 'memo' && suppressMemoTabClick) {
        suppressMemoTabClick = false;
        return; // 방금 탭을 떼어낸 동작이므로 전환하지 않음
      }
      switchView(tab.dataset.view);
    });
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
    () => { window.api.openMemoWindow(); switchView('todo'); });

  // 메모 전용(별도) 창이면 탭/메모열기 버튼 숨김, 합치기 버튼 표시
  if (STANDALONE_MEMO) {
    document.querySelector('.titlebar-tabs').style.display = 'none';
    document.getElementById('btn-open-memo').style.display = 'none';
    const merge = document.getElementById('btn-merge');
    if (merge) merge.style.display = 'inline-flex';
    switchView('memo');
  }
}

/* 메모 탭을 창 밖으로 끌면 별도 창으로 분리 (크롬 근사) */
function setupTabDrag() {
  const memoTab = document.querySelector('.tab[data-view="memo"]');
  if (!memoTab) return;
  let down = null;
  let torn = false;

  memoTab.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
    torn = false;
  });
  document.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (dist > 70) { torn = true; memoTab.classList.add('tearing'); }
  });
  document.addEventListener('pointerup', () => {
    if (down && torn) {
      suppressMemoTabClick = true;
      window.api.openMemoWindow();
      switchView('todo');
    }
    down = null;
    memoTab.classList.remove('tearing');
  });
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
      : '＋ 버튼을 눌러<br>할 일을 추가해보세요';
    todoBoard.appendChild(hint);
    return;
  }

  visible.forEach((todo) => todoBoard.appendChild(buildBlock(todo)));
}

function buildBlock(todo) {
  const block = document.createElement('div');
  block.className = 'todo-block';
  block.style.background = todo.color;

  const head = document.createElement('div');
  head.className = 'block-head';

  const title = document.createElement('input');
  title.className = 'block-title';
  title.placeholder = '할 일';
  title.value = todo.title || '';
  title.addEventListener('input', () => { todo.title = title.value; save(); });
  // 제목에서 Enter/Tab → 세부항목 입력으로 이동 (없으면 만들어서)
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

  const menu = document.createElement('div');
  menu.className = 'block-menu';
  const del = document.createElement('button');
  del.className = 'icon-btn small';
  del.textContent = '✕';
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

  const list = document.createElement('div');
  list.className = 'checklist';
  const ordered = [
    ...todo.items.filter((it) => !it.done),
    ...todo.items.filter((it) => it.done)
  ];
  ordered.forEach((item) => list.appendChild(buildItem(todo, item)));
  block.appendChild(list);

  // 세부항목 추가 (평소엔 숨김, 블럭에 마우스 올리면 나타남)
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
 * 메모 뷰 (태그 분류 + 인덱스 칩)
 * ========================================================================= */
const memoPage = document.getElementById('memo-page');
const indexList = document.getElementById('index-list');

let activeTags = new Set(); // 선택된 태그 필터 (다중)

function noteTitle(content) {
  const lines = (content || '').split('\n');
  for (const line of lines) if (line.trim()) return line.trim();
  return '제목 없음';
}

function allTags() {
  const s = new Set();
  state.memos.forEach((m) => (m.tags || []).forEach((t) => s.add(t)));
  return [...s];
}

function visibleMemos() {
  if (activeTags.size === 0) return state.memos;
  return state.memos.filter((m) =>
    (m.tags || []).some((t) => activeTags.has(t)));
}

function addMemo() {
  const memo = { id: uid(), content: '', tags: [], color: nextMemoColor() };
  state.memos.push(memo);
  save();
  renderMemos();
  focusNoteEnd(memo.id);
}

function renderMemos() {
  renderMemoPage();
  renderMemoIndex();
}

/* --- 본문(한 페이지, 구분선으로 메모 구분) --- */
function renderMemoPage() {
  memoPage.innerHTML = '';
  if (state.memos.length === 0) {
    state.memos.push({ id: uid(), content: '', tags: [], color: nextMemoColor() });
  }
  const list = visibleMemos();
  if (list.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.innerHTML = '선택한 태그에 해당하는<br>메모가 없어요.';
    memoPage.appendChild(hint);
    return;
  }
  list.forEach((memo, i) => {
    if (i > 0) {
      const div = document.createElement('div');
      div.className = 'memo-divider';
      memoPage.appendChild(div);
    }
    memoPage.appendChild(buildNote(memo));
  });
}

function buildNote(memo) {
  const wrap = document.createElement('div');
  wrap.className = 'memo-note';
  wrap.dataset.id = memo.id;

  // 태그 바
  const tagBar = document.createElement('div');
  tagBar.className = 'note-tags';
  (memo.tags || []).forEach((t) => {
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
        memo.tags.push(t);
        save();
        renderMemos();
      }
    }
  });
  tagBar.appendChild(tagAdd);
  wrap.appendChild(tagBar);

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
    // Ctrl+Enter: 구분선 추가(새 메모 시작)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      memo.content = body.innerText;
      const idx = state.memos.findIndex((m) => m.id === memo.id);
      const nm = { id: uid(), content: '', tags: [], color: nextMemoColor() };
      state.memos.splice(idx + 1, 0, nm);
      save();
      renderMemos();
      focusNoteEnd(nm.id);
    } else if (e.key === 'Backspace' && caretAtStart(body)) {
      // 맨 앞에서 Backspace → 앞 메모와 합치기(구분선 삭제)
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

  wrap.appendChild(body);
  return wrap;
}

/* 커서가 편집영역 맨 앞에 있는지 */
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

function updateIndexTitle(memo) {
  const label = indexList.querySelector(
    `.index-chip[data-id="${memo.id}"] .label`);
  if (label) label.textContent = noteTitle(memo.content);
}

/* --- 사이드 인덱스 (색 칩 → hover 시 제목 확장) --- */
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

    indexList.appendChild(chip);
  });
}

/* =========================================================================
 * 태그로 보기 패널 (좌측 상단 하트)
 * ========================================================================= */
const tagOverlay = document.getElementById('tag-overlay');

function updateHeart() {
  document.getElementById('btn-heart')
    .classList.toggle('active', activeTags.size > 0);
}

function renderTagCloud(filter) {
  const cloud = document.getElementById('tag-cloud');
  cloud.innerHTML = '';
  const tags = allTags().filter((t) => !filter || t.includes(filter));
  if (tags.length === 0) {
    cloud.innerHTML =
      '<p class="sync-hint">아직 태그가 없어요.<br>메모마다 ＋태그로 달 수 있어요.</p>';
    return;
  }
  tags.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'tag-toggle' + (activeTags.has(t) ? ' on' : '');
    b.textContent = '#' + t;
    b.addEventListener('click', () => {
      if (activeTags.has(t)) activeTags.delete(t);
      else activeTags.add(t);
      renderMemos();
      renderTagCloud(document.getElementById('tag-search').value.trim());
      updateHeart();
    });
    cloud.appendChild(b);
  });
}

function setupTags() {
  document.getElementById('btn-heart').addEventListener('click', () => {
    renderTagCloud('');
    document.getElementById('tag-search').value = '';
    tagOverlay.classList.add('open');
    switchView('memo');
  });
  document.getElementById('tag-close').addEventListener('click',
    () => tagOverlay.classList.remove('open'));
  tagOverlay.addEventListener('click', (e) => {
    if (e.target === tagOverlay) tagOverlay.classList.remove('open');
  });
  document.getElementById('tag-search').addEventListener('input', (e) =>
    renderTagCloud(e.target.value.trim()));
  document.getElementById('tag-clear').addEventListener('click', () => {
    activeTags.clear();
    renderMemos();
    renderTagCloud(document.getElementById('tag-search').value.trim());
    updateHeart();
  });
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
  setupTabDrag();
  setupFind();
  setupSync();
  setupTags();

  document.getElementById('btn-add-todo').addEventListener('click', addTodo);
  todoSearch.addEventListener('input', renderTodos);
  document.getElementById('btn-add-memo').addEventListener('click', () => addMemo());

  const mergeBtn = document.getElementById('btn-merge');
  if (mergeBtn) mergeBtn.addEventListener('click',
    () => window.api.windowControl('close'));

  await load();
  renderTodos();
  renderMemos();
}

init();
