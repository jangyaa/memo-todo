'use strict';

/* =========================================================================
 * 상태 / 영속화
 * ========================================================================= */
const BLOCK_COLORS = [
  'var(--c0)', 'var(--c1)', 'var(--c2)',
  'var(--c3)', 'var(--c4)', 'var(--c5)'
];
// 블록 배경은 반투명 흰색으로 통일하고, 색은 강조(해시태그/제목 막대)에만 사용
const ACCENTS = ['#ef9ab9', '#b48be6', '#86c97f', '#7fb2e6', '#e0ad57', '#e58a8a'];
function accentOf(item) {
  const i = BLOCK_COLORS.indexOf(item && item.color);
  return ACCENTS[i < 0 ? 0 : i];
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
  todos: [], // { id, title, color, items: [{ id, text, done }] }
  memos: [], // { id, content, tags: [], color }
  settings: { theme: 'default', profileImage: null }
};

const uid = () => Math.random().toString(36).slice(2, 10);
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

function normalizeSettings(s) {
  return {
    theme: (s && s.theme) || 'default',
    profileImage: (s && s.profileImage) || null
  };
}

async function load() {
  const data = await window.api.loadData();
  if (data && typeof data === 'object') {
    state.todos = Array.isArray(data.todos) ? data.todos : [];
    state.memos = Array.isArray(data.memos) ? data.memos.map(normalizeMemo) : [];
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

// ︎ = 텍스트(비이모지) 표시 강제
const VIEW_LABEL = { todo: '☑︎ 투두 리스트', memo: '✎︎ 메모' };

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
  const accent = accentOf(todo);
  const block = document.createElement('div');
  block.className = 'todo-block' + (todo.pinned ? ' pinned' : '');
  block.dataset.id = todo.id;

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
  title.style.borderLeftColor = accent; // 제목 앞 막대
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
  head.appendChild(pin);
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
  const accent = accentOf(memo);
  const block = document.createElement('div');
  block.className = 'memo-block';
  block.dataset.id = memo.id;

  // 헤더: 드래그 핸들(좌) + 삭제(우, hover 시 노출)
  const head = document.createElement('div');
  head.className = 'memo-head';
  const handle = document.createElement('span');
  handle.className = 'drag-handle';
  handle.textContent = '⠿';
  handle.title = '드래그해서 순서 변경';
  handle.draggable = true;
  handle.addEventListener('dragstart', (e) => startBlockDrag(e, 'memo', block, memo.id));
  handle.addEventListener('dragend', endBlockDrag);
  const del = document.createElement('button');
  del.className = 'icon-btn small memo-del';
  del.textContent = '✕';
  del.title = '메모 삭제';
  del.addEventListener('click', () => {
    state.memos = state.memos.filter((m) => m.id !== memo.id);
    save();
    renderMemos();
  });
  head.appendChild(handle);
  head.appendChild(del);
  block.appendChild(head);

  // 본문 (서식 가능한 HTML). 제목(첫 줄) 앞 막대는 left border로 표현
  const body = document.createElement('div');
  body.className = 'note-body';
  body.dataset.id = memo.id;
  body.contentEditable = 'true';
  body.spellcheck = false;
  body.style.borderLeftColor = accent;
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
  tagAdd.placeholder = '태그 입력';
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
  // 태그 바의 빈 곳을 클릭하면 입력칸으로 포커스
  tagBar.addEventListener('click', (e) => {
    if (e.target === tagBar) tagAdd.focus();
  });
  block.appendChild(tagBar);

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
    // 인덱스에서도 드래그로 순서 변경
    chip.addEventListener('dragstart', (e) => startBlockDrag(e, 'memo', chip, memo.id));
    chip.addEventListener('dragend', endBlockDrag);
    // 더블클릭 → 인덱스에서 제목 수정
    chip.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startIndexRename(chip, label, memo);
    });

    indexList.appendChild(chip);
  });
}

/* 인덱스에서 제목(첫 줄) 수정 */
function setMemoTitle(memo, newTitle) {
  const lines = (memo.content || '').split('\n');
  const idx = lines.findIndex((l) => l.trim() !== '');
  if (idx < 0) memo.content = newTitle;
  else { lines[idx] = newTitle; memo.content = lines.join('\n'); }
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
  // 메뉴가 떠 있는 동안 인덱스가 접히지 않도록 고정
  document.getElementById('memo-index').classList.add('pinned');
}

function hideCtxMenu() {
  ctxMenu.classList.remove('open');
  document.getElementById('memo-index').classList.remove('pinned');
}

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
 * 블록 순서 변경 (드래그 + 드롭 위치 미리보기)
 * ========================================================================= */
const dropIndicator = document.createElement('div');
dropIndicator.className = 'drop-indicator';
let blockDrag = null; // { kind:'todo'|'memo', id, block }
let dropBeforeId = null;

function startBlockDrag(e, kind, block, id) {
  blockDrag = { kind, id, block };
  dropBeforeId = null;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
  requestAnimationFrame(() => block.classList.add('dragging'));
}

function endBlockDrag() {
  if (blockDrag) blockDrag.block.classList.remove('dragging');
  if (dropIndicator.parentNode) dropIndicator.parentNode.removeChild(dropIndicator);
  blockDrag = null;
  dropBeforeId = null;
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

  // 인덱스에서 드래그로 메모 순서 변경
  indexList.addEventListener('dragover', (e) => {
    if (!blockDrag || blockDrag.kind !== 'memo') return;
    e.preventDefault();
    positionIndicator(indexList, '.index-chip', e.clientY);
  });
  indexList.addEventListener('drop', (e) => {
    if (!blockDrag || blockDrag.kind !== 'memo') return;
    e.preventDefault();
    reorderList(state.memos, blockDrag.id, dropBeforeId);
    save();
    renderMemos();
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

function applySettings() {
  const t = (state.settings && state.settings.theme) || 'default';
  if (t && t !== 'default') document.body.dataset.theme = t;
  else document.body.removeAttribute('data-theme');

  const btn = document.getElementById('btn-profile');
  const avatar = document.getElementById('pm-avatar');
  const img = state.settings && state.settings.profileImage;
  [btn, avatar].forEach((el) => {
    if (!el) return;
    if (img) {
      el.style.backgroundImage = `url(${img})`;
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

  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = profileBtn.getBoundingClientRect();
    profileMenu.style.left = r.left + 'px';
    profileMenu.style.top = (r.bottom + 6) + 'px';
    if (!profileMenu.classList.contains('open')) renderThemeDots();
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
}

function renderThemeDots() {
  const wrap = document.getElementById('pm-themes');
  wrap.innerHTML = '';
  THEMES.forEach((th) => {
    const b = document.createElement('button');
    b.className = 'theme-dot' + (state.settings.theme === th.id ? ' on' : '');
    b.style.background = th.swatch;
    b.title = th.name; // 마우스 올리면 테마 이름
    b.addEventListener('click', () => {
      state.settings.theme = th.id;
      save();
      applySettings();
      renderThemeDots();
    });
    wrap.appendChild(b);
  });
}

/* =========================================================================
 * 메모 서식 툴바 (텍스트 선택 시)
 * ========================================================================= */
function setupFormatToolbar() {
  const bar = document.getElementById('format-toolbar');
  const colors = document.getElementById('ft-colors');
  const PALETTE = ['#4a4148', '#ec5f8a', '#8b6cff', '#2f9e8f', '#e0883a'];
  colors.innerHTML = '';
  PALETTE.forEach((c) => {
    const d = document.createElement('button');
    d.className = 'ft-color';
    d.style.background = c;
    d.dataset.color = c;
    colors.appendChild(d);
  });

  // 현재 선택이 메모 본문 안에 있는지
  function activeBody() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    let node = sel.anchorNode;
    node = node && (node.nodeType === 1 ? node : node.parentElement);
    const body = node && node.closest && node.closest('.note-body');
    return body || null;
  }

  function saveBody(body) {
    const memo = state.memos.find((m) => m.id === body.dataset.id);
    if (memo) { memo.content = body.innerHTML; save(); }
  }

  function hide() { bar.classList.remove('open'); }

  function showForSelection() {
    const body = activeBody();
    if (!body) { hide(); return; }
    const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { hide(); return; }
    bar.classList.add('open');
    const bw = bar.offsetWidth || 220;
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    let top = rect.top - bar.offsetHeight - 8;
    if (top < 4) top = rect.bottom + 8;
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
  }

  document.addEventListener('mouseup', () => setTimeout(showForSelection, 0));
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key === 'ArrowLeft' || e.key === 'ArrowRight') showForSelection();
  });
  memoPage.addEventListener('scroll', hide);

  function applyCmd(cmd, value) {
    const body = activeBody();
    if (!body) return;
    if (cmd === 'hilite') document.execCommand('hiliteColor', false, '#ffe9a8');
    else if (cmd === 'foreColor') document.execCommand('foreColor', false, value);
    else document.execCommand(cmd, false, null);
    saveBody(body);
    showForSelection();
  }

  // mousedown으로 처리해 선택이 풀리지 않게 함
  bar.querySelectorAll('button[data-cmd]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); applyCmd(btn.dataset.cmd); });
  });
  colors.addEventListener('mousedown', (e) => {
    const d = e.target.closest('.ft-color');
    if (!d) return;
    e.preventDefault();
    applyCmd('foreColor', d.dataset.color);
  });
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
  setupFormatToolbar();

  document.getElementById('btn-add-todo').addEventListener('click', addTodo);
  document.getElementById('btn-add-memo').addEventListener('click', () => addMemo());

  renderTabs();
  applyView();

  await load();
  renderTodos();
  renderMemos();
}

init();
