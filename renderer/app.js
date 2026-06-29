'use strict';

/* =========================================================================
 * 상태 / 영속화
 * ========================================================================= */
const BLOCK_COLORS = [
  'var(--c0)', 'var(--c1)', 'var(--c2)',
  'var(--c3)', 'var(--c4)', 'var(--c5)'
];
// 블록 배경(반투명 색) + 강조색(해시태그/제목 막대)
const SOFTS = ['#fde7ee', '#f3eafc', '#e9f5e8', '#e6f1fb', '#fdf3e3', '#fbe9e9'];
const ACCENTS = ['#ef9ab9', '#b48be6', '#86c97f', '#7fb2e6', '#e0ad57', '#e58a8a'];
const BLOCK_ALPHA = 0.4; // 투두/메모 공통 불투명도
function colorIndexOf(item) {
  const i = BLOCK_COLORS.indexOf(item && item.color);
  return i < 0 ? 0 : i;
}
function accentOf(item) { return ACCENTS[colorIndexOf(item)]; }
function blockBg(item) { return hexA(SOFTS[colorIndexOf(item)], BLOCK_ALPHA); }

// 색상 변경 버튼 (현재 색 스와치 점 표시) — 투두/메모 공용
function makeColorButton(item) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn small color-btn';
  btn.title = '색상 변경';
  const dot = document.createElement('span');
  dot.className = 'swatch-dot';
  dot.style.background = accentOf(item);
  btn.appendChild(dot);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = btn.getBoundingClientRect();
    openColorPop(r.left, r.bottom + 4, item);
  });
  return btn;
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* HTML 여부 판단 / HTML→텍스트 (제목 추출용) */
function looksHtml(s) { return /<[a-z!/]|&[a-z]+;|&#/i.test(s || ''); }
function htmlToText(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

let state = {
  todos: [], // { id, title, color, items, pinned, pinnedAt }
  memos: [], // { id, content, tags, color, folderId, pinned, pinnedAt }
  folders: [], // { id, name, collapsed }
  settings: { theme: 'default', profileImage: null, fontFamily: '', fontSize: 100 }
};

const uid = () => Math.random().toString(36).slice(2, 10);

// 인라인 SVG 아이콘 (이모지 대신)
const SVG = {
  folder: '<svg viewBox="0 0 16 16"><path d="M1.5 3.5h4l1.2 1.5h7.8v7.5h-13z" fill="currentColor" opacity="0.85"/></svg>',
  eye: '<svg viewBox="0 0 16 16"><path d="M8 3.5C4.5 3.5 1.8 6 1 8c.8 2 3.5 4.5 7 4.5s6.2-2.5 7-4.5c-.8-2-3.5-4.5-7-4.5z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  eyeOff: '<svg viewBox="0 0 16 16"><path d="M2 4c1.5 2 3.6 3.2 6 3.2S12.5 6 14 4" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" stroke-width="1.3"/></svg>'
};
const nextMemoColor = () => BLOCK_COLORS[state.memos.length % BLOCK_COLORS.length];
const sortTags = (tags) => [...tags].sort((a, b) => a.localeCompare(b, 'ko'));

/* URL을 클릭 가능한 링크로 변환 (평소엔 일반 텍스트처럼 보이고 hover 시에만 티남) */
function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function linkifyHtml(text) {
  let out = '';
  let last = 0;
  const re = /https?:\/\/[^\s<]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out += escapeHtml(text.slice(last, m.index));
    const safe = escapeHtml(m[0]);
    out += `<span class="link" data-href="${safe}">${safe}</span>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(text.slice(last));
  return out.replace(/\n/g, '<br>');
}

/* 서식(HTML)을 유지한 채 텍스트 노드의 URL만 링크로 변환 */
function linkifyElement(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const targets = [];
  let n;
  while ((n = walker.nextNode())) {
    if (n.parentElement && n.parentElement.closest('.link')) continue;
    if (/https?:\/\//i.test(n.nodeValue)) targets.push(n);
  }
  targets.forEach((node) => {
    const text = node.nodeValue;
    const frag = document.createDocumentFragment();
    const re = /https?:\/\/[^\s<]+/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement('span');
      span.className = 'link';
      span.dataset.href = m[0];
      span.textContent = m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  });
}

function normalizeMemo(m, i) {
  let content = m.content || '';
  // 예전 평문 메모는 HTML로 1회 변환 (이후 서식 가능)
  if (content && !looksHtml(content)) content = linkifyHtml(content);
  return {
    id: m.id || uid(),
    content,
    tags: sortTags(Array.isArray(m.tags) ? m.tags : []),
    color: m.color || BLOCK_COLORS[i % BLOCK_COLORS.length],
    folderId: m.folderId || null,
    pinned: !!m.pinned,
    pinnedAt: m.pinnedAt || 0
  };
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.api.saveData(JSON.parse(JSON.stringify(state)));
  }, 350);
}

function normalizeSettings(s) {
  return {
    theme: (s && s.theme) || 'default',
    profileImage: (s && s.profileImage) || null,
    fontFamily: (s && s.fontFamily) || '',
    fontSize: (s && s.fontSize) || 100
  };
}

async function load() {
  const data = await window.api.loadData();
  if (data && typeof data === 'object') {
    state.todos = Array.isArray(data.todos) ? data.todos : [];
    state.memos = Array.isArray(data.memos) ? data.memos.map(normalizeMemo) : [];
    state.folders = Array.isArray(data.folders) ? data.folders : [];
    state.settings = normalizeSettings(data.settings);
  }
  applySettings();
}

window.api.onDataChanged((data) => {
  const active = document.activeElement;
  const editing = active && (active.isContentEditable ||
    active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if (editing) return;
  if (!data) return;
  state.todos = data.todos || [];
  state.memos = (data.memos || []).map(normalizeMemo);
  state.folders = data.folders || [];
  state.settings = normalizeSettings(data.settings);
  applySettings();
  renderTodos();
  renderMemos();
});

/* =========================================================================
 * 탭(뷰) 관리 — 창마다 가진 뷰가 다름
 * ========================================================================= */
const params = new URLSearchParams(location.search);
let myViews = (params.get('views') || 'todo,memo').split(',').filter(Boolean);
let currentView = myViews[0] || 'todo';

const VIEW_LABEL = { todo: '투두 리스트', memo: '메모' };

function applyView() {
  document.getElementById('view-todo').classList.toggle('active', currentView === 'todo');
  document.getElementById('view-memo').classList.toggle('active', currentView === 'memo');
}

function setView(v) {
  currentView = v;
  renderTabs();
  applyView();
  if (typeof hideFormatToolbar === 'function') hideFormatToolbar();
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

// 고정(pinned)된 블럭을 위로 (먼저 고정한 순). 나머지는 기존 순서 유지
function orderedTodos() {
  const pinned = state.todos.filter((t) => t.pinned)
    .sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));
  const rest = state.todos.filter((t) => !t.pinned);
  return [...pinned, ...rest];
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
  orderedTodos().forEach((todo) => todoBoard.appendChild(buildBlock(todo)));
}

function buildBlock(todo) {
  const block = document.createElement('div');
  block.className = 'todo-block' + (todo.pinned ? ' pinned' : '');
  block.dataset.id = todo.id;
  block.style.background = blockBg(todo);

  const head = document.createElement('div');
  head.className = 'block-head';

  // 드래그 핸들 (순서 변경)
  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';
  handle.title = '드래그해서 순서 변경';
  handle.draggable = true;
  handle.addEventListener('dragstart', (e) => startBlockDrag(e, 'todo', block, todo.id));
  handle.addEventListener('dragend', endBlockDrag);

  const title = document.createElement('input');
  title.className = 'block-title';
  title.placeholder = 'To-do';
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

  // 상단 고정 토글
  const pin = document.createElement('button');
  pin.className = 'icon-btn small block-pin' + (todo.pinned ? ' active' : '');
  pin.textContent = '⤒';
  pin.title = todo.pinned ? '고정 해제' : '상단 고정';
  pin.addEventListener('click', () => {
    todo.pinned = !todo.pinned;
    todo.pinnedAt = todo.pinned ? Date.now() : 0;
    save();
    renderTodos();
  });

  const colorBtn = makeColorButton(todo);

  const del = document.createElement('button');
  del.className = 'icon-btn small block-del';
  del.textContent = '✕';
  del.title = '블럭 삭제';
  del.addEventListener('click', () => {
    state.todos = state.todos.filter((t) => t.id !== todo.id);
    save();
    renderTodos();
  });

  const tools = document.createElement('div');
  tools.className = 'memo-tools';
  tools.appendChild(pin);
  tools.appendChild(colorBtn);
  tools.appendChild(del);

  head.appendChild(handle);
  head.appendChild(title);
  head.appendChild(tools);
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
    // 세부항목이 있고 전부 완료되면: 고정 블럭은 항목만 비우고, 아니면 블럭 제거
    if (todo.items.length > 0 && todo.items.every((x) => x.done)) {
      if (todo.pinned) todo.items = [];
      else state.todos = state.todos.filter((t) => t.id !== todo.id);
    }
    save();
    renderTodos();
  });

  const text = document.createElement('div');
  text.className = 'check-text';
  text.contentEditable = 'true';
  text.spellcheck = false;
  text.dataset.placeholder = '세부항목';
  text.innerHTML = linkifyHtml(item.text || '');
  text.addEventListener('input', () => { item.text = text.innerText; save(); });
  text.addEventListener('blur', () => { text.innerHTML = linkifyHtml(text.innerText); });
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const it = { id: uid(), text: '', done: false };
      const idx = todo.items.findIndex((x) => x.id === item.id);
      todo.items.splice(idx + 1, 0, it);
      save();
      renderTodos();
      focusItem(todo.id, it.id);
    } else if (e.key === 'Backspace' && text.innerText === '') {
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
  const text = looksHtml(content) ? htmlToText(content) : (content || '');
  const lines = text.split('\n');
  for (const line of lines) if (line.trim()) return line.trim();
  return '제목 없음';
}

function allTags() {
  const s = new Set();
  state.memos.forEach((m) => (m.tags || []).forEach((t) => s.add(t)));
  return sortTags([...s]);
}

function visibleMemos() {
  const hidden = new Set(state.folders.filter((f) => f.hidden).map((f) => f.id));
  let arr = state.memos.filter((m) => !(m.folderId && hidden.has(m.folderId)));
  if (activeTags.size > 0) {
    arr = arr.filter((m) => [...activeTags].every((t) => (m.tags || []).includes(t)));
  }
  return arr;
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
  const list = pinnedFirst(visibleMemos());
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
  const accent = accentOf(memo);
  const block = document.createElement('div');
  block.className = 'memo-block' + (memo.pinned ? ' pinned' : '');
  block.dataset.id = memo.id;
  block.style.background = blockBg(memo);

  // 헤더: 드래그 핸들(좌) + [고정/색상/삭제](우, hover 시 노출)
  const head = document.createElement('div');
  head.className = 'memo-head';
  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';
  handle.title = '드래그해서 순서 변경';
  handle.draggable = true;
  handle.addEventListener('dragstart', (e) => startBlockDrag(e, 'memo', block, memo.id));
  handle.addEventListener('dragend', endBlockDrag);

  const tools = document.createElement('div');
  tools.className = 'memo-tools';

  const pin = document.createElement('button');
  pin.className = 'icon-btn small memo-pin' + (memo.pinned ? ' active' : '');
  pin.textContent = '⤒';
  pin.title = memo.pinned ? '고정 해제' : '상단 고정';
  pin.addEventListener('click', () => {
    memo.pinned = !memo.pinned;
    memo.pinnedAt = memo.pinned ? Date.now() : 0;
    save();
    renderMemos();
  });

  const colorBtn = makeColorButton(memo);

  const del = document.createElement('button');
  del.className = 'icon-btn small memo-del';
  del.textContent = '✕';
  del.title = '메모 삭제';
  del.addEventListener('click', () => {
    state.memos = state.memos.filter((m) => m.id !== memo.id);
    save();
    renderMemos();
  });

  tools.appendChild(pin);
  tools.appendChild(colorBtn);
  tools.appendChild(del);
  head.appendChild(handle);
  head.appendChild(tools);
  block.appendChild(head);

  // 본문 (서식 가능한 HTML). 제목(첫 줄)에만 막대 → CSS ::before + --bar
  const body = document.createElement('div');
  body.className = 'note-body';
  body.dataset.id = memo.id;
  body.contentEditable = 'true';
  body.spellcheck = false;
  body.style.setProperty('--bar', accent);
  body.innerHTML = looksHtml(memo.content) ? memo.content : linkifyHtml(memo.content || '');
  body.addEventListener('input', () => {
    memo.content = body.innerHTML;
    save();
    updateIndexTitle(memo);
  });
  body.addEventListener('blur', () => {
    linkifyElement(body);
    memo.content = body.innerHTML;
    save();
  });
  body.addEventListener('keydown', (e) => {
    // Shift+Enter: 현재 메모 다음에 새 메모 블록 (전역 핸들러와 중복 방지)
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      memo.content = body.innerHTML;
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
        memo.content = body.innerHTML;
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

  // 태그 바 (메모 최하단) — 빈 영역을 눌러도 바로 태그 입력
  const tagBar = document.createElement('div');
  tagBar.className = 'note-tags';
  sortTags(memo.tags || []).forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.style.background = hexA(accent, 0.18);
    chip.style.color = accent;
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
  tagAdd.placeholder = '＋ 태그 추가';
  tagAdd.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
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

  // 메모 블록 하단(본문/헤더/칩/링크 제외) 아무 곳이나 누르면 태그 입력 활성화
  block.addEventListener('mousedown', (e) => {
    if (e.target.closest('.note-body') || e.target.closest('.memo-head') ||
        e.target.closest('.tag-chip') || e.target.closest('.link')) return;
    e.preventDefault();
    tagAdd.focus();
  });

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

/* 고정 메모를 앞으로 */
function pinnedFirst(arr) {
  return [
    ...arr.filter((m) => m.pinned).sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0)),
    ...arr.filter((m) => !m.pinned)
  ];
}

/* --- 사이드 인덱스 (폴더 + 색 칩) --- */
function renderMemoIndex() {
  indexList.innerHTML = '';
  const vis = visibleMemos();
  // 폴더에 속하지 않은 메모
  const ungrouped = pinnedFirst(vis.filter((m) =>
    !m.folderId || !state.folders.some((f) => f.id === m.folderId)));
  ungrouped.forEach((m) => indexList.appendChild(buildIndexChip(m)));
  // 폴더 (폴더 순서대로)
  state.folders.forEach((folder) => indexList.appendChild(buildFolderEl(folder, vis)));
}

function buildIndexChip(memo) {
  const chip = document.createElement('div');
  chip.className = 'index-chip' + (memo.pinned ? ' pinned' : '');
  chip.dataset.id = memo.id;
  chip.draggable = true;

  const sq = document.createElement('span');
  sq.className = 'chip-square';
  sq.style.background = accentOf(memo);

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = noteTitle(memo.content);

  chip.appendChild(sq);
  chip.appendChild(label);

  chip.addEventListener('click', () => {
    indexList.querySelectorAll('.index-chip').forEach((x) => x.classList.remove('active'));
    chip.classList.add('active');
    const body = memoPage.querySelector(`.note-body[data-id="${memo.id}"]`);
    if (body) { body.scrollIntoView({ block: 'center', behavior: 'smooth' }); body.focus(); }
  });
  chip.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCtxMenu(e.clientX, e.clientY, memo);
  });
  chip.addEventListener('dragstart', (e) => startBlockDrag(e, 'memo', chip, memo.id));
  chip.addEventListener('dragend', endBlockDrag);
  chip.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startIndexRename(chip, label, memo);
  });
  return chip;
}

function buildFolderEl(folder, vis) {
  const el = document.createElement('div');
  el.className = 'folder' + (folder.collapsed ? ' collapsed' : '');
  el.dataset.id = folder.id;

  if (folder.hidden) el.classList.add('hidden-folder');

  const head = document.createElement('div');
  head.className = 'folder-head';
  head.draggable = true;

  const caret = document.createElement('span');
  caret.className = 'folder-caret';
  caret.textContent = folder.collapsed ? '▸' : '▾';
  caret.addEventListener('click', (e) => {
    e.stopPropagation();
    folder.collapsed = !folder.collapsed;
    save();
    renderMemoIndex();
  });

  const ficon = document.createElement('span');
  ficon.className = 'folder-icon';
  ficon.innerHTML = SVG.folder;

  const name = document.createElement('span');
  name.className = 'folder-name';
  name.textContent = folder.name || '새 폴더';

  // 표시/숨김(눈) 토글 — 우측 끝
  const eye = document.createElement('button');
  eye.className = 'folder-eye';
  eye.innerHTML = folder.hidden ? SVG.eyeOff : SVG.eye;
  eye.title = folder.hidden ? '폴더 보이기' : '폴더 숨기기';
  eye.addEventListener('click', (e) => {
    e.stopPropagation();
    folder.hidden = !folder.hidden;
    save();
    renderMemos();
  });

  head.appendChild(caret);
  head.appendChild(ficon);
  head.appendChild(name);
  head.appendChild(eye);

  head.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startFolderRename(head, name, folder);
  });
  head.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openFolderCtx(e.clientX, e.clientY, folder);
  });
  head.addEventListener('dragstart', (e) => { e.stopPropagation(); startBlockDrag(e, 'folder', el, folder.id); });
  head.addEventListener('dragend', endBlockDrag);

  el.appendChild(head);

  const children = document.createElement('div');
  children.className = 'folder-children';
  pinnedFirst(vis.filter((m) => m.folderId === folder.id))
    .forEach((m) => children.appendChild(buildIndexChip(m)));
  el.appendChild(children);

  // 메모를 이 폴더로 드롭
  el.addEventListener('dragover', (e) => {
    if (!blockDrag || blockDrag.kind !== 'memo') return; // 폴더 순서변경은 indexList가 처리
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('folder-drop');
    positionIndicator(children, ':scope > .index-chip', e.clientY);
    pendingFolderId = folder.id;
  });
  el.addEventListener('drop', (e) => {
    if (!blockDrag || blockDrag.kind !== 'memo') return;
    e.preventDefault();
    e.stopPropagation();
    const memo = state.memos.find((m) => m.id === blockDrag.id);
    if (memo) {
      memo.folderId = folder.id;
      reorderList(state.memos, blockDrag.id, dropBeforeId);
      save();
      renderMemos();
    }
  });

  return el;
}

function addFolder() {
  state.folders.push({ id: uid(), name: '새 폴더', collapsed: false });
  save();
  renderMemoIndex();
}

function startFolderRename(head, nameEl, folder) {
  document.getElementById('memo-index').classList.add('pinned');
  const input = document.createElement('input');
  input.className = 'index-rename';
  input.value = folder.name || '';
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return; done = true;
    if (commit && input.value.trim()) folder.name = input.value.trim();
    document.getElementById('memo-index').classList.remove('pinned');
    save();
    renderMemoIndex();
  };
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

/* 인덱스에서 제목(첫 줄) 수정 — HTML 서식 유지 */
function setMemoTitle(memo, newTitle) {
  if (!looksHtml(memo.content)) {
    const lines = (memo.content || '').split('\n');
    const idx = lines.findIndex((l) => l.trim() !== '');
    if (idx < 0) memo.content = newTitle;
    else { lines[idx] = newTitle; memo.content = lines.join('\n'); }
    return;
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = memo.content;
  const walker = document.createTreeWalker(tmp, NodeFilter.SHOW_TEXT, null);
  let n, target = null;
  while ((n = walker.nextNode())) { if (n.nodeValue.trim() !== '') { target = n; break; } }
  if (target) target.nodeValue = newTitle;
  else tmp.insertBefore(document.createTextNode(newTitle), tmp.firstChild);
  memo.content = tmp.innerHTML;
}

function startIndexRename(chip, label, memo) {
  const memoIndex = document.getElementById('memo-index');
  memoIndex.classList.add('pinned'); // 수정 중 인덱스 고정
  chip.draggable = false;
  const input = document.createElement('input');
  input.className = 'index-rename';
  input.value = noteTitle(memo.content);
  label.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    if (commit) {
      setMemoTitle(memo, input.value.trim());
      save();
    }
    memoIndex.classList.remove('pinned');
    renderMemos();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

/* =========================================================================
 * 우클릭 컨텍스트 메뉴 (색상 변경 / 메모 삭제)
 * ========================================================================= */
const ctxMenu = document.getElementById('ctx-menu');
const colorPop = document.getElementById('color-pop');

function placeMenu(el, x, y, pinIndex = true) {
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.classList.add('open');
  if (pinIndex) document.getElementById('memo-index').classList.add('pinned');
  // 창 밖으로 넘어가면 안쪽으로 당김
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    let nx = x, ny = y;
    if (r.right > window.innerWidth - 8) nx = Math.max(8, window.innerWidth - 8 - r.width);
    if (r.bottom > window.innerHeight - 8) ny = Math.max(8, window.innerHeight - 8 - r.height);
    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
  });
}

function buildSwatches(item) {
  const swatches = document.createElement('div');
  swatches.className = 'ctx-swatches';
  BLOCK_COLORS.forEach((c, i) => {
    const sw = document.createElement('button');
    sw.className = 'ctx-swatch' + (item.color === c ? ' on' : '');
    sw.style.background = ACCENTS[i];
    sw.addEventListener('click', () => {
      item.color = c;
      save();
      renderTodos();
      renderMemos();
      hideMenus();
    });
    swatches.appendChild(sw);
  });
  return swatches;
}

// 인덱스 칩 우클릭: 색상 변경 + 메모 삭제
function openCtxMenu(x, y, memo) {
  ctxMenu.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'ctx-title';
  title.textContent = '색상 변경';
  ctxMenu.appendChild(title);
  ctxMenu.appendChild(buildSwatches(memo));
  const delBtn = document.createElement('button');
  delBtn.className = 'ctx-item ctx-del';
  delBtn.textContent = '메모 삭제';
  delBtn.addEventListener('click', () => {
    state.memos = state.memos.filter((m) => m.id !== memo.id);
    save(); renderMemos(); hideMenus();
  });
  ctxMenu.appendChild(delBtn);
  placeMenu(ctxMenu, x, y);
}

// 색상 버튼: 색상만 (인덱스 확장하지 않음)
function openColorPop(x, y, item) {
  colorPop.innerHTML = '';
  colorPop.appendChild(buildSwatches(item));
  placeMenu(colorPop, x, y, false);
}

// 폴더 우클릭: 이름 변경 / 폴더 삭제
function openFolderCtx(x, y, folder) {
  ctxMenu.innerHTML = '';
  const rename = document.createElement('button');
  rename.className = 'ctx-item';
  rename.textContent = '이름 변경';
  rename.addEventListener('click', () => {
    hideMenus();
    const head = indexList.querySelector(`.folder[data-id="${folder.id}"] .folder-head`);
    const nameEl = head && head.querySelector('.folder-name');
    if (nameEl) startFolderRename(head, nameEl, folder);
  });
  const del = document.createElement('button');
  del.className = 'ctx-item ctx-del';
  del.textContent = '폴더 삭제 (메모는 유지)';
  del.addEventListener('click', () => {
    state.memos.forEach((m) => { if (m.folderId === folder.id) m.folderId = null; });
    state.folders = state.folders.filter((f) => f.id !== folder.id);
    save(); renderMemos(); hideMenus();
  });
  ctxMenu.appendChild(rename);
  ctxMenu.appendChild(del);
  placeMenu(ctxMenu, x, y);
}

// 인덱스 빈 영역 우클릭: 메모 추가 / 폴더 추가
function openIndexCtx(x, y) {
  ctxMenu.innerHTML = '';
  const addMemoBtn = document.createElement('button');
  addMemoBtn.className = 'ctx-item';
  addMemoBtn.textContent = '메모 추가';
  addMemoBtn.addEventListener('click', () => { hideMenus(); addMemo(); });
  const addFolderBtn = document.createElement('button');
  addFolderBtn.className = 'ctx-item';
  addFolderBtn.textContent = '폴더 추가';
  addFolderBtn.addEventListener('click', () => { hideMenus(); addFolder(); });
  ctxMenu.appendChild(addMemoBtn);
  ctxMenu.appendChild(addFolderBtn);
  placeMenu(ctxMenu, x, y);
}

function hideMenus() {
  ctxMenu.classList.remove('open');
  colorPop.classList.remove('open');
  document.getElementById('memo-index').classList.remove('pinned');
}

function setupCtxMenu() {
  document.addEventListener('click', (e) => {
    if (!ctxMenu.contains(e.target) && !colorPop.contains(e.target)) hideMenus();
  });
  // 인덱스 빈 영역 우클릭
  indexList.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.index-chip') || e.target.closest('.folder-head')) return;
    e.preventDefault();
    openIndexCtx(e.clientX, e.clientY);
  });
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.index-chip') && !e.target.closest('.folder-head') &&
        !e.target.closest('#index-list')) hideMenus();
  });
  window.addEventListener('blur', hideMenus);
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

  const walker = document.createTreeWalker(memoPage, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      // 태그 영역은 검색 대상에서 제외
      return n.parentElement && n.parentElement.closest('.note-tags')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    }
  });
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
 * 블록 순서 변경 (드래그 + 드롭 위치 미리보기)
 * ========================================================================= */
const dropIndicator = document.createElement('div');
dropIndicator.className = 'drop-indicator';
let blockDrag = null; // { kind:'todo'|'memo'|'folder', id, block }
let dropBeforeId = null;
let pendingFolderId = null; // 메모를 드롭할 폴더 (null=폴더 밖)

function startBlockDrag(e, kind, block, id) {
  blockDrag = { kind, id, block };
  dropBeforeId = null;
  pendingFolderId = null;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
  requestAnimationFrame(() => block.classList.add('dragging'));
}

function endBlockDrag() {
  if (blockDrag) blockDrag.block.classList.remove('dragging');
  if (dropIndicator.parentNode) dropIndicator.parentNode.removeChild(dropIndicator);
  document.querySelectorAll('.folder-drop').forEach((f) => f.classList.remove('folder-drop'));
  blockDrag = null;
  dropBeforeId = null;
  pendingFolderId = null;
}

function positionIndicator(container, selector, y) {
  const blocks = [...container.querySelectorAll(selector)]
    .filter((b) => !b.classList.contains('dragging'));
  dropBeforeId = null;
  for (const b of blocks) {
    const rect = b.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) {
      container.insertBefore(dropIndicator, b);
      dropBeforeId = b.dataset.id;
      return;
    }
  }
  container.appendChild(dropIndicator);
}

function reorderList(list, draggedId, beforeId) {
  const from = list.findIndex((x) => x.id === draggedId);
  if (from < 0) return;
  const [moved] = list.splice(from, 1);
  if (beforeId == null) { list.push(moved); return; }
  const to = list.findIndex((x) => x.id === beforeId);
  list.splice(to < 0 ? list.length : to, 0, moved);
}

function setupDnd() {
  todoBoard.addEventListener('dragover', (e) => {
    if (!blockDrag || blockDrag.kind !== 'todo') return;
    e.preventDefault();
    positionIndicator(todoBoard, '.todo-block', e.clientY);
  });
  todoBoard.addEventListener('drop', (e) => {
    if (!blockDrag || blockDrag.kind !== 'todo') return;
    e.preventDefault();
    reorderList(state.todos, blockDrag.id, dropBeforeId);
    save();
    renderTodos();
  });

  memoPage.addEventListener('dragover', (e) => {
    if (!blockDrag || blockDrag.kind !== 'memo') return;
    e.preventDefault();
    positionIndicator(memoPage, '.memo-block', e.clientY);
  });
  memoPage.addEventListener('drop', (e) => {
    if (!blockDrag || blockDrag.kind !== 'memo') return;
    e.preventDefault();
    reorderList(state.memos, blockDrag.id, dropBeforeId);
    save();
    renderMemos();
  });

  // 인덱스 최상위: 메모(폴더 밖) 순서변경 / 폴더 순서변경
  indexList.addEventListener('dragover', (e) => {
    if (!blockDrag) return;
    if (blockDrag.kind === 'memo') {
      e.preventDefault();
      indexList.querySelectorAll('.folder-drop').forEach((f) => f.classList.remove('folder-drop'));
      positionIndicator(indexList, ':scope > .index-chip', e.clientY);
      pendingFolderId = null;
    } else if (blockDrag.kind === 'folder') {
      e.preventDefault();
      positionIndicator(indexList, ':scope > .folder', e.clientY);
    }
  });
  indexList.addEventListener('drop', (e) => {
    if (!blockDrag) return;
    e.preventDefault();
    if (blockDrag.kind === 'memo') {
      const memo = state.memos.find((m) => m.id === blockDrag.id);
      if (memo) {
        memo.folderId = pendingFolderId; // 폴더 밖
        reorderList(state.memos, blockDrag.id, dropBeforeId);
        save();
        renderMemos();
      }
    } else if (blockDrag.kind === 'folder') {
      reorderList(state.folders, blockDrag.id, dropBeforeId);
      save();
      renderMemoIndex();
    }
  });

  // 링크 클릭 → 외부 브라우저로 (편집 모드 진입 방지 위해 mousedown에서 처리)
  [todoBoard, memoPage].forEach((c) => {
    c.addEventListener('mousedown', (e) => {
      const a = e.target.closest('.link');
      if (a) { e.preventDefault(); window.api.openExternal(a.dataset.href); }
    });
  });
}

/* 메모 뷰에서 본문 밖이어도 Shift+Enter로 메모 추가 */
function setupGlobalKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.shiftKey && e.key === 'Enter' &&
        document.getElementById('view-memo').classList.contains('active')) {
      const t = e.target;
      // 본문/태그입력 안에서는 각자의 핸들러가 처리
      if (t && (t.classList.contains('note-body') || t.classList.contains('tag-add'))) return;
      e.preventDefault();
      addMemo();
    }
  });
}

/* =========================================================================
 * 프로필 / 테마
 * ========================================================================= */
// Y2K 느낌 임시 팔레트 (색은 나중에 다듬을 예정)
const THEMES = [
  { id: 'default', name: '베이비 핑크', swatch: '#f7b8cc' },
  { id: 'bubblegum', name: '버블검', swatch: '#ff8fc8' },
  { id: 'cyber', name: '사이버 라일락', swatch: '#b9a3ff' },
  { id: 'lime', name: 'Y2K 라임', swatch: '#bde85a' },
  { id: 'aqua', name: '아쿠아 글로우', swatch: '#7fd8e8' },
  { id: 'silver', name: '실버 홀로', swatch: '#c9cede' }
];

const FONTS = [
  { id: '', name: '기본' },
  { id: "'Pretendard','Apple SD Gothic Neo',sans-serif", name: 'Pretendard' },
  { id: "'Malgun Gothic','맑은 고딕',sans-serif", name: '맑은 고딕' },
  { id: "'NanumGothic','나눔고딕',sans-serif", name: '나눔고딕' },
  { id: "'NanumMyeongjo','바탕',serif", name: '명조/바탕' },
  { id: "'Gulim','굴림',sans-serif", name: '굴림' },
  { id: "'Courier New',monospace", name: '고정폭' }
];

function applySettings() {
  const s = state.settings || {};
  const t = s.theme || 'default';
  if (t && t !== 'default') document.body.dataset.theme = t;
  else document.body.removeAttribute('data-theme');

  const img = s.profileImage;
  [document.getElementById('btn-profile'), document.getElementById('pm-avatar')]
    .forEach((el) => {
      if (!el) return;
      if (img) {
        el.style.backgroundImage = `url("${img}")`;
        el.classList.add('has-img');
        el.textContent = '';
      } else {
        el.style.backgroundImage = '';
        el.classList.remove('has-img');
        el.textContent = '♡';
      }
    });
}

function setupProfileTheme() {
  const profileBtn = document.getElementById('btn-profile');
  const profileMenu = document.getElementById('profile-menu');
  const fileInput = document.getElementById('profile-file');
  const themeOverlay = document.getElementById('theme-overlay');

  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = profileBtn.getBoundingClientRect();
    profileMenu.style.left = r.left + 'px';
    profileMenu.style.top = (r.bottom + 6) + 'px';
    profileMenu.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!profileMenu.contains(e.target) && e.target !== profileBtn) {
      profileMenu.classList.remove('open');
    }
  });

  document.getElementById('pm-image').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.settings.profileImage = reader.result;
      save();
      applySettings();
    };
    reader.readAsDataURL(f);
    fileInput.value = '';
  });

  // 테마 변경 → 모달 (테마 목록만)
  document.getElementById('pm-theme').addEventListener('click', () => {
    profileMenu.classList.remove('open');
    renderThemeList();
    themeOverlay.classList.add('open');
  });
  document.getElementById('theme-close').addEventListener('click',
    () => themeOverlay.classList.remove('open'));
  themeOverlay.addEventListener('click', (e) => {
    if (e.target === themeOverlay) themeOverlay.classList.remove('open');
  });
}

function renderThemeList() {
  const list = document.getElementById('theme-list');
  list.innerHTML = '';
  THEMES.forEach((th) => {
    const b = document.createElement('button');
    b.className = 'theme-item' + (state.settings.theme === th.id ? ' on' : '');
    b.innerHTML = `<span class="theme-dot" style="background:${th.swatch}"></span>${th.name}`;
    b.addEventListener('click', () => {
      state.settings.theme = th.id;
      save();
      applySettings();
      renderThemeList();
    });
    list.appendChild(b);
  });
}

/* 더블클릭한 "선택 텍스트"의 글꼴/크기(pt)만 바꾸는 도구 */
function setupFontPop() {
  const pop = document.getElementById('font-pop');
  const famSel = document.getElementById('fp-font');
  const sizeEl = document.getElementById('fp-size');
  FONTS.forEach((f) => {
    const o = document.createElement('option');
    o.value = f.id; o.textContent = f.name;
    famSel.appendChild(o);
  });

  let savedRange = null;
  let sizePt = 14;

  function restore() {
    if (!savedRange) return false;
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(savedRange);
    return true;
  }
  function editableRoot() {
    const s = window.getSelection();
    if (!s.rangeCount) return null;
    let n = s.anchorNode;
    n = n && (n.nodeType === 1 ? n : n.parentElement);
    return n && n.closest ? n.closest('[contenteditable="true"]') : null;
  }
  function persist(root) {
    if (root && root.classList.contains('note-body')) {
      const memo = state.memos.find((m) => m.id === root.dataset.id);
      if (memo) { memo.content = root.innerHTML; save(); updateIndexTitle(memo); }
    }
  }
  function applySize(pt) {
    if (!restore()) return;
    sizePt = Math.max(8, Math.min(48, pt));
    const root = editableRoot();
    // size 트릭은 <font size> 가 필요하므로 styleWithCSS=false
    try { document.execCommand('styleWithCSS', false, false); } catch (_) {}
    document.execCommand('fontSize', false, '7');
    (root || document).querySelectorAll('font[size="7"]').forEach((f) => {
      f.removeAttribute('size');
      f.style.fontSize = sizePt + 'pt';
    });
    sizeEl.textContent = sizePt + 'pt';
    persist(root);
  }
  function applyFont(fam) {
    if (!restore()) return;
    const root = editableRoot();
    try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
    document.execCommand('fontName', false, fam);
    persist(root);
  }

  famSel.addEventListener('mousedown', (e) => e.stopPropagation());
  famSel.addEventListener('change', () => applyFont(famSel.value));
  document.getElementById('fp-dec').addEventListener('mousedown', (e) => { e.preventDefault(); applySize(sizePt - 1); });
  document.getElementById('fp-inc').addEventListener('mousedown', (e) => { e.preventDefault(); applySize(sizePt + 1); });

  // 더블클릭(선택된 단어) → 글꼴/크기 도구 표시 (편집 가능한 텍스트 대상)
  document.addEventListener('dblclick', (e) => {
    if (e.target.closest('.index-chip') || e.target.closest('.folder-head') ||
        e.target.closest('.font-pop') || e.target.closest('.modal') ||
        e.target.closest('.format-toolbar')) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) { pop.classList.remove('open'); return; }
    savedRange = sel.getRangeAt(0).cloneRange();
    if (typeof hideFormatToolbar === 'function') hideFormatToolbar(); // 서식 툴바와 중복 방지
    sizeEl.textContent = sizePt + 'pt';
    const x = Math.min(e.clientX, window.innerWidth - 200);
    const y = Math.min(e.clientY, window.innerHeight - 120);
    pop.style.left = Math.max(8, x) + 'px';
    pop.style.top = Math.max(8, y) + 'px';
    pop.classList.add('open');
  });
  document.addEventListener('mousedown', (e) => {
    if (!pop.contains(e.target)) pop.classList.remove('open');
  });
}

/* =========================================================================
 * 메모 서식 툴바 (텍스트 선택 시)
 * ========================================================================= */
let hideFormatToolbar = () => {};

function setupFormatToolbar() {
  const bar = document.getElementById('format-toolbar');
  const colors = document.getElementById('ft-colors');
  const fontSel = document.getElementById('ft-font');
  const sizeVal = document.getElementById('ft-size-val');
  const PALETTE = ['#4a4148', '#9aa0b0', '#ec5f8a', '#f6c0d4', '#ffffff'];

  colors.innerHTML = '';
  PALETTE.forEach((c) => {
    const d = document.createElement('button');
    d.className = 'ft-color';
    d.style.background = c;
    d.dataset.color = c;
    colors.appendChild(d);
  });
  FONTS.forEach((f) => {
    const o = document.createElement('option');
    o.value = f.id; o.textContent = f.name;
    fontSel.appendChild(o);
  });

  let savedRange = null;
  let savedBody = null;
  let sizePt = 14;

  function currentBody() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    let node = sel.anchorNode;
    node = node && (node.nodeType === 1 ? node : node.parentElement);
    return (node && node.closest && node.closest('.note-body')) || null;
  }

  function hide() {
    bar.classList.remove('open');
    document.body.classList.remove('ft-open');
    savedRange = null; savedBody = null;
  }
  hideFormatToolbar = hide;

  function showForSelection() {
    const body = currentBody();
    if (!body) { hide(); return; }
    const range = window.getSelection().getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { hide(); return; }
    savedRange = range.cloneRange();
    savedBody = body;
    sizeVal.textContent = sizePt + 'pt';
    bar.classList.add('open');
    document.body.classList.add('ft-open'); // 인덱스 확장 잠금
    const bw = bar.offsetWidth || 240;
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    let top = rect.top - bar.offsetHeight - 8;
    if (top < 4) top = rect.bottom + 8;
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
  }

  document.addEventListener('mouseup', () => setTimeout(showForSelection, 0));
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key.startsWith('Arrow')) showForSelection();
  });
  memoPage.addEventListener('scroll', hide);

  function restoreSelection() {
    if (!savedRange) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return true;
  }

  function persist() {
    const memo = savedBody && state.memos.find((m) => m.id === savedBody.dataset.id);
    if (memo) { memo.content = savedBody.innerHTML; save(); updateIndexTitle(memo); }
  }

  function applySizePt(pt) {
    if (!restoreSelection() || !savedBody) return;
    sizePt = Math.max(8, Math.min(48, pt));
    // size 트릭은 <font size>가 필요 → styleWithCSS=false
    try { document.execCommand('styleWithCSS', false, false); } catch (_) {}
    document.execCommand('fontSize', false, '7');
    savedBody.querySelectorAll('font[size="7"]').forEach((f) => {
      f.removeAttribute('size');
      f.style.fontSize = sizePt + 'pt';
    });
    sizeVal.textContent = sizePt + 'pt';
    persist();
    setTimeout(showForSelection, 0);
  }

  function run(cmd, value) {
    if (!restoreSelection() || !savedBody) return;
    try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
    if (cmd === 'hilite') document.execCommand('hiliteColor', false, '#ffe9a8');
    else if (cmd === 'quote') document.execCommand('formatBlock', false, 'blockquote');
    else if (cmd === 'code') {
      const text = window.getSelection().toString();
      if (text) document.execCommand('insertHTML', false, '<code>' + escapeHtml(text) + '</code>');
    } else if (cmd === 'link') {
      const url = prompt('링크 주소(URL)를 입력하세요', 'https://');
      if (url) document.execCommand('createLink', false, url);
    } else {
      document.execCommand(cmd, false, value || null);
    }
    persist();
    setTimeout(showForSelection, 0);
  }

  bar.querySelectorAll('button[data-cmd]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); run(btn.dataset.cmd); });
  });
  bar.querySelectorAll('button[data-size]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      applySizePt(sizePt + (btn.dataset.size === 'inc' ? 1 : -1));
    });
  });
  colors.addEventListener('mousedown', (e) => {
    const d = e.target.closest('.ft-color');
    if (!d) return;
    e.preventDefault();
    run('foreColor', d.dataset.color);
  });
  // 커스텀 색 추가 (헥사 입력칸 토글 — 시스템 색상창 안 씀)
  const hexInput = document.getElementById('ft-hex');
  document.getElementById('ft-addcolor').addEventListener('mousedown', (e) => {
    e.preventDefault();
    hexInput.classList.toggle('open');
    if (hexInput.classList.contains('open')) hexInput.focus();
  });
  hexInput.addEventListener('mousedown', (e) => e.stopPropagation());
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      let v = hexInput.value.trim();
      if (/^#?[0-9a-fA-F]{3,6}$/.test(v)) {
        if (v[0] !== '#') v = '#' + v;
        run('foreColor', v);
        hexInput.value = '';
        hexInput.classList.remove('open');
      }
    }
  });
  // 글꼴 변경 (select 포커스로 선택이 풀려도 savedRange로 복원)
  fontSel.addEventListener('mousedown', (e) => e.stopPropagation());
  fontSel.addEventListener('change', () => { run('fontName', fontSel.value); });
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
  setupDnd();
  setupGlobalKeys();
  setupProfileTheme();
  setupFontPop();
  setupFormatToolbar();

  document.getElementById('btn-add-todo').addEventListener('click', addTodo);
  document.getElementById('btn-add-memo').addEventListener('click', () => addMemo());
  document.getElementById('btn-add-folder').addEventListener('click', addFolder);

  renderTabs();
  applyView();

  await load();
  renderTodos();
  renderMemos();
}

init();
