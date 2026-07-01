'use strict';

/* =========================================================================
 * 상태 / 영속화
 * ========================================================================= */
// 블록 색 라인업: 배경색 --c0~--c5 / 강조색 --a0~--a5 (테마별로 CSS에서 덮어씀)
const BLOCK_COLORS = [
  'var(--c0)', 'var(--c1)', 'var(--c2)',
  'var(--c3)', 'var(--c4)', 'var(--c5)'
];
const BLOCK_ALPHA = 54; // 투두/메모 블록 불투명도(%)
function colorIndexOf(item) {
  const i = BLOCK_COLORS.indexOf(item && item.color);
  return i < 0 ? 0 : i;
}
// 강조색(해시태그/칩/스와치) — 테마별 CSS 변수
function accentVar(item) { return `var(--a${colorIndexOf(item)})`; }
// 블록 배경(반투명) — 테마별 CSS 변수 + 공통 불투명도
function blockBg(item) {
  return `color-mix(in srgb, var(--c${colorIndexOf(item)}) ${BLOCK_ALPHA}%, transparent)`;
}

// 색상 변경 버튼 (현재 색 스와치 점 표시) — 투두/메모 공용
function makeColorButton(item) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn small color-btn';
  btn.title = '색상 변경';
  const dot = document.createElement('span');
  dot.className = 'swatch-dot';
  dot.style.background = accentVar(item);
  btn.appendChild(dot);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    // 같은 블록에서 다시 누르면 닫기 (토글)
    if (colorPop.classList.contains('open') && colorPopOwner === item) {
      hideMenus();
      return;
    }
    const r = btn.getBoundingClientRect();
    openColorPop(r.left, r.bottom + 4, item, btn.closest('.todo-block, .memo-block'));
  });
  return btn;
}

/* HTML 여부 판단 */
function looksHtml(s) { return /<[a-z!/]|&[a-z]+;|&#/i.test(s || ''); }

let state = {
  ddays: [], // { id, title, date } — 최상단 고정 디데이 블록
  todos: [], // { id, title, color, items, pinned, pinnedAt }
  memos: [], // { id, content, tags, color, folderId, pinned, pinnedAt }
  folders: [], // { id, name, collapsed }
  settings: { theme: 'default', profileImage: null }
};

const uid = () => Math.random().toString(36).slice(2, 10);

// 인라인 SVG 아이콘 (이모지 대신)
const SVG = {
  folder: '<svg viewBox="0 0 16 16"><path d="M1.5 3.5h4l1.2 1.5h7.8v7.5h-13z" fill="currentColor" opacity="0.85"/></svg>',
  eye: '<svg viewBox="0 0 16 16"><path d="M8 3.5C4.5 3.5 1.8 6 1 8c.8 2 3.5 4.5 7 4.5s6.2-2.5 7-4.5c-.8-2-3.5-4.5-7-4.5z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  eyeOff: '<svg viewBox="0 0 16 16"><path d="M2 4c1.5 2 3.6 3.2 6 3.2S12.5 6 14 4" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="3" y1="13" x2="13" y2="3" stroke="currentColor" stroke-width="1.3"/></svg>',
  pin: '<svg viewBox="0 0 16 16"><path d="M6 1.8h4a.9.9 0 0 1 .16 1.79l-.16.05v2.86l1.78 2.06a.6.6 0 0 1-.45 1H8.65v3.18a.65.65 0 0 1-1.3 0v-3.18H4.67a.6.6 0 0 1-.45-1l1.78-2.06V3.64l-.16-.05A.9.9 0 0 1 6 1.8z" fill="currentColor"/></svg>',
  chart: '<svg viewBox="0 0 16 16"><line x1="2.5" y1="2" x2="2.5" y2="14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><rect x="3.8" y="4" width="6.4" height="2.4" rx="1.2" fill="currentColor"/><rect x="3.8" y="9" width="9.7" height="2.4" rx="1.2" fill="currentColor"/></svg>'
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
    title: m.title || '',
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
  s = s || {};
  const out = {
    theme: s.theme || 'default',
    profileImage: s.profileImage || null,
    // 커스텀 테마: { color: '#hex', bgImage: dataURL|null }
    custom: (s.custom && s.custom.color)
      ? { color: s.custom.color, bgImage: s.custom.bgImage || null }
      : null
  };
  // 서식 색상 프리셋(글자색/형광)은 반드시 보존(창/재실행 간 유지 + 창 간 연동)
  if (Array.isArray(s.fontColors)) out.fontColors = s.fontColors.slice();
  if (Array.isArray(s.hiliteColors)) out.hiliteColors = s.hiliteColors.slice();
  return out;
}

// 색상 변환·테마 유도(deriveTheme/applyCustomTheme 등)는 shared.js로 이동(상세 창과 공용)

// 업로드 이미지의 평균색(테마 컬러 유도용) 추출
function extractColor(dataUrl, cb) {
  const img = new Image();
  img.onload = () => {
    try {
      const cv = document.createElement('canvas');
      cv.width = 32; cv.height = 32;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, 32, 32);
      const d = ctx.getImageData(0, 0, 32, 32).data;
      let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        const { s } = rgbToHsl(d[i], d[i + 1], d[i + 2]);
        const wt = 0.15 + s; // 채도 높은 픽셀에 가중치 → 대표 색상이 또렷(칙칙함 방지)
        r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
      }
      cb(w ? rgbToHex(r / w, g / w, b / w) : '#cdb0bb');
    } catch (_) { cb('#cdb0bb'); }
  };
  img.onerror = () => cb('#cdb0bb');
  img.src = dataUrl;
}

async function load() {
  const data = await window.api.loadData();
  if (data && typeof data === 'object') {
    state.ddays = Array.isArray(data.ddays) ? data.ddays : [];
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
  state.ddays = data.ddays || [];
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
  // 탭 전환 시: 떠 있는 모든 창/선택 영역 닫기 (서식창·메뉴·프로필·검색·텍스트 선택)
  hideMenus();
  if (typeof hideFormatToolbar === 'function') hideFormatToolbar();
  const pm = document.getElementById('profile-menu');
  if (pm) pm.classList.remove('open');
  if (typeof closeFind === 'function') closeFind();
  const sel = window.getSelection && window.getSelection();
  if (sel) sel.removeAllRanges();
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

// 고정(pinned)된 블럭을 위로 (먼저 고정한 순). 나머지는 기존 순서 유지
function orderedTodos() {
  const pinned = state.todos.filter((t) => t.pinned)
    .sort((a, b) => (a.pinnedAt || 0) - (b.pinnedAt || 0));
  const rest = state.todos.filter((t) => !t.pinned);
  return [...pinned, ...rest];
}

function renderTodos() {
  todoBoard.innerHTML = '';
  todoBoard.appendChild(buildDdayBlock()); // 항상 최상단 고정(이동 불가)
  if (state.todos.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.innerHTML = '＋ 버튼을 눌러<br>할 일을 추가해보세요';
    todoBoard.appendChild(hint);
    return;
  }
  orderedTodos().forEach((todo) => todoBoard.appendChild(buildBlock(todo)));
}

/* D-DAY 라벨 계산 (오늘 기준) */
function ddayDiff(date) {
  if (!date) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(date + 'T00:00:00');
  if (isNaN(t.getTime())) return null;
  return Math.round((t - today) / 86400000);
}
function ddayLabel(date) {
  const d = ddayDiff(date);
  if (d === null) return 'D-DAY';
  if (d > 0) return 'D-' + d;
  if (d === 0) return 'D-DAY';
  return 'D+' + (-d);
}
function ddayClass(date) {
  const d = ddayDiff(date);
  if (d === null) return '';
  if (d === 0) return ' today';
  if (d < 0) return ' past';
  return '';
}

/* 최상단 고정 D-DAY 블록 (이동 불가, 항상 존재) */
function buildDdayBlock() {
  const block = document.createElement('div');
  block.className = 'dday-block';

  const head = document.createElement('div');
  head.className = 'dday-bar';
  const label = document.createElement('span');
  label.className = 'dday-heading';
  label.textContent = 'D-DAY';
  const add = document.createElement('button');
  add.className = 'icon-btn small';
  add.textContent = '＋';
  add.title = '디데이 추가';
  add.addEventListener('click', () => {
    pickDate('', (date) => {
      const d = { id: uid(), title: '', date };
      state.ddays.push(d);
      save();
      renderTodos();
      const inp = todoBoard.querySelector(`.dday-item[data-id="${d.id}"] .dday-name`);
      if (inp) inp.focus();
    });
  });
  head.appendChild(label);
  head.appendChild(add);
  block.appendChild(head);

  if (state.ddays.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'dday-empty';
    hint.textContent = '＋ 로 디데이를 추가하세요';
    block.appendChild(hint);
  } else {
    state.ddays.forEach((d) => block.appendChild(buildDdayItem(d)));
  }
  return block;
}

function buildDdayItem(d) {
  const row = document.createElement('div');
  row.className = 'dday-item';
  row.dataset.id = d.id;

  // D-n 배지 (날짜는 표시 안 함). 클릭하면 달력으로 날짜 재설정
  const badge = document.createElement('button');
  badge.className = 'dday-badge' + ddayClass(d.date);
  badge.textContent = ddayLabel(d.date);
  badge.title = '날짜 변경';
  badge.addEventListener('click', () => {
    pickDate(d.date, (date) => { d.date = date; save(); renderTodos(); });
  });

  const name = document.createElement('input');
  name.className = 'dday-name';
  name.placeholder = '제목';
  name.value = d.title || '';
  name.addEventListener('input', () => { d.title = name.value; save(); });

  const del = document.createElement('button');
  del.className = 'item-del';
  del.textContent = '✕';
  del.title = '삭제';
  del.addEventListener('click', () => {
    state.ddays = state.ddays.filter((x) => x.id !== d.id);
    save();
    renderTodos();
  });

  row.appendChild(badge);
  row.appendChild(name);
  row.appendChild(del);
  return row;
}

/* 커스텀 달력 모달 (예쁜 흰색 둥근 창) */
let calCb = null, calY = 0, calM = 0, calSel = '';
const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
function pickDate(initial, cb) {
  calCb = cb;
  calSel = initial || '';
  const base = initial ? new Date(initial + 'T00:00:00') : new Date();
  const d = isNaN(base.getTime()) ? new Date() : base;
  calY = d.getFullYear();
  calM = d.getMonth();
  renderCalendar();
  document.getElementById('cal-overlay').classList.add('open');
}
function renderCalendar() {
  document.getElementById('cal-title').textContent = `${calY}년 ${calM + 1}월`;
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  ['일', '월', '화', '수', '목', '금', '토'].forEach((w) => {
    const h = document.createElement('span');
    h.className = 'cal-dow';
    h.textContent = w;
    grid.appendChild(h);
  });
  const startDow = new Date(calY, calM, 1).getDay();
  const days = new Date(calY, calM + 1, 0).getDate();
  const t = new Date();
  const todayStr = isoOf(t.getFullYear(), t.getMonth(), t.getDate());
  for (let i = 0; i < startDow; i++) grid.appendChild(document.createElement('span'));
  for (let day = 1; day <= days; day++) {
    const iso = isoOf(calY, calM, day);
    const b = document.createElement('button');
    b.className = 'cal-day' + (iso === todayStr ? ' today' : '') + (iso === calSel ? ' sel' : '');
    b.textContent = day;
    b.addEventListener('click', () => {
      const cb = calCb; calCb = null;
      document.getElementById('cal-overlay').classList.remove('open');
      if (cb) cb(iso);
    });
    grid.appendChild(b);
  }
}
function setupCalendar() {
  const ov = document.getElementById('cal-overlay');
  document.getElementById('cal-prev').addEventListener('click', () => {
    calM--; if (calM < 0) { calM = 11; calY--; } renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calM++; if (calM > 11) { calM = 0; calY++; } renderCalendar();
  });
  ov.addEventListener('click', (e) => { if (e.target === ov) { ov.classList.remove('open'); calCb = null; } });
}

function buildBlock(todo) {
  const block = document.createElement('div');
  block.className = 'todo-block' + (todo.pinned ? ' pinned' : '');
  block.dataset.id = todo.id;
  block.style.background = blockBg(todo);

  // 고정 배지 (제목 위 좌상단, 항상 표시)
  if (todo.pinned) {
    const badge = document.createElement('div');
    badge.className = 'pin-badge';
    badge.innerHTML = SVG.pin;
    block.appendChild(badge);
  }

  // 상단 영역(헤더)을 잡고 드래그하면 순서 이동
  const head = document.createElement('div');
  head.className = 'block-head';
  head.draggable = true;
  head.addEventListener('dragstart', (e) => {
    if (e.target.closest('.icon-btn')) { e.preventDefault(); return; }
    startBlockDrag(e, 'todo', block, todo.id);
  });
  head.addEventListener('dragend', endBlockDrag);

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
  pin.innerHTML = SVG.pin;
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

  // 헤더는 드래그 전용 띠(우측 도구만), 제목은 그 아래
  head.appendChild(tools);
  block.appendChild(head);
  block.appendChild(title);

  const list = document.createElement('div');
  list.className = 'checklist';
  const ordered = [
    ...todo.items.filter((it) => !it.done),
    ...todo.items.filter((it) => it.done)
  ];
  ordered.forEach((item) => list.appendChild(buildItem(todo, item)));
  // 세부항목 순서 변경 (같은 블록 내) + 위치 미리보기
  list.addEventListener('dragover', (e) => {
    if (!blockDrag || blockDrag.kind !== 'item' || blockDrag.todoId !== todo.id) return;
    e.preventDefault();
    e.stopPropagation();
    positionIndicator(list, '.check-item', e.clientY);
  });
  list.addEventListener('drop', (e) => {
    if (!blockDrag || blockDrag.kind !== 'item' || blockDrag.todoId !== todo.id) return;
    e.preventDefault();
    e.stopPropagation();
    reorderList(todo.items, blockDrag.id, dropBeforeId);
    save();
    renderTodos();
  });
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
  row.dataset.id = item.id; // positionIndicator/reorderList용
  // 끌어서 순서 변경 (삭제/진행도 버튼에서 시작 시 제외)
  row.draggable = true;
  row.addEventListener('dragstart', (e) => {
    if (e.target.closest('.item-del') || e.target.closest('.item-prog')) {
      e.preventDefault();
      return;
    }
    startBlockDrag(e, 'item', row, item.id, { todoId: todo.id });
  });
  row.addEventListener('dragend', endBlockDrag);

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

  // 진행도 추가 버튼 (막대그래프 아이콘)
  const progBtn = document.createElement('button');
  progBtn.className = 'item-prog';
  progBtn.innerHTML = SVG.chart;
  progBtn.title = '진행도 추가';
  progBtn.addEventListener('click', () => {
    promptNumber(item.progress ? item.progress.total : '', (n) => {
      if (!(n >= 1)) return;
      const done = item.progress ? Math.min(item.progress.done, n) : 0;
      item.progress = { total: Math.min(n, 99), done };
      save();
      renderTodos();
    });
  });

  const del = document.createElement('button');
  del.className = 'item-del';
  del.textContent = '✕';
  del.addEventListener('click', () => {
    todo.items = todo.items.filter((x) => x.id !== item.id);
    save();
    renderTodos();
  });

  const top = document.createElement('div');
  top.className = 'ci-top';
  top.appendChild(box);
  top.appendChild(text);

  // 진행도 숫자(n/total) — 세부항목 텍스트 옆. 더블클릭 시 현재 진행도 직접 입력
  let progCount = null;
  if (item.progress && item.progress.total > 0) {
    progCount = document.createElement('span');
    progCount.className = 'prog-count';
    progCount.title = '진행도 수정';
    progCount.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!item.progress) return;
      const total = item.progress.total;
      promptNumber(item.progress.done, (n) => {
        if (!item.progress) return;
        const done = Math.max(0, Math.min(n, total));
        if (done >= total) item.progress = null; // 다 채우면 진행도 제거
        else item.progress.done = done;
        save();
        renderTodos();
      }, { title: '진행도', min: 0, max: total });
    });
    top.appendChild(progCount);
  }

  top.appendChild(progBtn);
  top.appendChild(del);
  row.appendChild(top);

  // 진행도 게이지 — 클릭 시 제자리 갱신(블록 전체 리렌더 X), 칸 위 hover로 순번 표시
  if (item.progress && item.progress.total > 0) {
    row.appendChild(buildProgress(item, progCount));
  }

  return row;
}

/* 진행도 게이지: 가로 꽉 채운 둥근 분절 게이지. 칸 hover 시 순번(title) 표시, 클릭 시 in-place 갱신.
 * n/total 카운트(countEl)는 세부항목 텍스트 옆에서 함께 갱신된다. */
function buildProgress(item, countEl) {
  const wrap = document.createElement('div');
  wrap.className = 'progress';
  const total = item.progress.total;

  const boxes = document.createElement('div');
  boxes.className = 'progress-boxes';
  boxes.style.gridTemplateColumns = `repeat(${total}, 1fr)`;

  const refresh = () => {
    [...boxes.children].forEach((pb, i) =>
      pb.classList.toggle('filled', i < item.progress.done));
    if (countEl) countEl.textContent = `${item.progress.done}/${total}`;
  };

  const groups = Math.ceil(total / 5);
  for (let i = 0; i < total; i++) {
    const pb = document.createElement('span');
    pb.className = 'pseg';
    // 5칸 단위: 테마색보다 옅은 색(흰색 혼합 많음)으로 시작해 마지막 그룹에서 테마색(100%)
    const g = Math.floor(i / 5);
    const mix = groups > 1 ? 55 + (g / (groups - 1)) * 45 : 100;
    pb.style.setProperty('--seg-mix', mix.toFixed(1) + '%');
    pb.addEventListener('click', () => {
      item.progress.done = (i + 1 === item.progress.done) ? i : i + 1;
      if (item.progress.done >= total) {
        // 다 채우면 진행도 제거(세부항목은 유지)
        item.progress = null;
        save();
        wrap.remove();
        if (countEl) countEl.remove();
        return;
      }
      save();
      refresh();
    });
    boxes.appendChild(pb);
  }

  wrap.appendChild(boxes);
  refresh();
  return wrap;
}

function focusItem(todoId, itemId) {
  const row = todoBoard.querySelector(
    `.check-item[data-todo="${todoId}"][data-item="${itemId}"]`);
  if (row) {
    const ta = row.querySelector('.check-text');
    if (ta) ta.focus();
  }
}

/* 숫자 입력 모달 (진행도 칸 수 / 현재 진행도) */
let numCb = null;
let numMin = 1;
let numMax = 99;
function promptNumber(initial, cb, opts = {}) {
  numCb = cb;
  numMin = opts.min != null ? opts.min : 1;
  numMax = opts.max != null ? opts.max : 99;
  const ov = document.getElementById('num-overlay');
  const inp = document.getElementById('num-input');
  document.getElementById('num-title').textContent = opts.title || '진행도 칸 수';
  inp.min = numMin;
  inp.max = numMax;
  inp.value = (initial === 0 || initial) ? initial : '';
  ov.classList.add('open');
  setTimeout(() => { inp.focus(); inp.select(); }, 0);
}
function setupNumPrompt() {
  const ov = document.getElementById('num-overlay');
  const inp = document.getElementById('num-input');
  const close = () => { ov.classList.remove('open'); numCb = null; };
  const commit = () => {
    const n = parseInt(inp.value, 10);
    const cb = numCb;
    close();
    if (cb && Number.isFinite(n) && n >= numMin) cb(Math.min(n, numMax));
  };
  document.getElementById('num-ok').addEventListener('click', commit);
  document.getElementById('num-close').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') close();
  });
}

/* =========================================================================
 * 메모 뷰 (컬러 블록 + 태그)
 * ========================================================================= */
const memoPage = document.getElementById('memo-page');
const indexList = document.getElementById('index-list');
const memoTagbar = document.getElementById('memo-tagbar');

let activeTags = new Set(); // AND 필터

// 제목은 서식(HTML) 가능 → 인덱스 표시는 순수 텍스트로
function plainText(html) {
  if (!html) return '';
  if (!looksHtml(html)) return html;
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || '';
}
// 인덱스에 표시할 제목: 제목칸만 사용(본문은 제목에 영향 없음)
function memoTitle(memo) {
  return plainText(memo.title).trim() || '제목 없음';
}
function focusMemoTitle(id) {
  const el = memoPage.querySelector(`.memo-block[data-id="${id}"] .memo-title`);
  if (!el) return;
  el.focus();
  const sel = window.getSelection();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
  el.scrollIntoView({ block: 'center' });
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
  const memo = { id: uid(), title: '', content: '', tags: [], color: nextMemoColor() };
  state.memos.push(memo);
  save();
  renderMemos();
  focusMemoTitle(memo.id);
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
    state.memos.push({ id: uid(), title: '', content: '', tags: [], color: nextMemoColor() });
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
  const accent = accentVar(memo);
  const block = document.createElement('div');
  block.className = 'memo-block' + (memo.pinned ? ' pinned' : '');
  block.dataset.id = memo.id;
  block.style.background = blockBg(memo);

  // 고정 배지 (제목 위 좌상단, 항상 표시)
  if (memo.pinned) {
    const badge = document.createElement('div');
    badge.className = 'pin-badge';
    badge.innerHTML = SVG.pin;
    block.appendChild(badge);
  }

  // 상단 영역(헤더)을 잡고 드래그하면 순서 이동
  const head = document.createElement('div');
  head.className = 'memo-head';
  head.draggable = true;
  head.addEventListener('dragstart', (e) => {
    if (e.target.closest('.icon-btn')) { e.preventDefault(); return; }
    startBlockDrag(e, 'memo', block, memo.id);
  });
  head.addEventListener('dragend', endBlockDrag);

  const tools = document.createElement('div');
  tools.className = 'memo-tools';

  const pin = document.createElement('button');
  pin.className = 'icon-btn small memo-pin' + (memo.pinned ? ' active' : '');
  pin.innerHTML = SVG.pin;
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
  head.appendChild(tools);
  block.appendChild(head);

  // 제목 (본문과 분리, 서식 가능 contenteditable)
  const titleEl = document.createElement('div');
  titleEl.className = 'memo-title';
  titleEl.contentEditable = 'true';
  titleEl.spellcheck = false;
  titleEl.dataset.ph = '제목';
  titleEl.innerHTML = memo.title || '';
  titleEl.addEventListener('input', () => {
    memo.title = titleEl.innerHTML;
    save();
    updateIndexTitle(memo);
  });
  titleEl.addEventListener('keydown', (e) => {
    // 제목이 비어 있어도 Enter/Tab으로 본문에 진입 (커서를 본문에 놓는다)
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      focusNoteEnd(memo.id);
    }
  });
  block.appendChild(titleEl);

  // 본문 (서식 가능한 HTML)
  const body = document.createElement('div');
  body.className = 'note-body';
  body.dataset.id = memo.id;
  body.contentEditable = 'true';
  body.spellcheck = false;
  body.innerHTML = looksHtml(memo.content) ? memo.content : linkifyHtml(memo.content || '');
  body.addEventListener('input', () => {
    memo.content = body.innerHTML;
    save();
  });
  body.addEventListener('blur', () => {
    linkifyElement(body);
    memo.content = body.innerHTML;
    save();
  });
  // 체크리스트 글머리 토글(왼쪽 클릭 영역)
  body.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li && li.parentElement && li.parentElement.classList.contains('md-check')) {
      const rect = li.getBoundingClientRect();
      if (e.clientX - rect.left < 22) {
        li.classList.toggle('done');
        memo.content = body.innerHTML;
        save();
      }
    }
  });
  body.addEventListener('keydown', (e) => {
    if (handleMarkdownKey(e, body, () => { memo.content = body.innerHTML; save(); })) return;
    // Shift+Enter: 현재 메모 다음에 새 메모 블록 (전역 핸들러와 중복 방지)
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      memo.content = body.innerHTML;
      const idx = state.memos.findIndex((m) => m.id === memo.id);
      const nm = { id: uid(), title: '', content: '', tags: [], color: nextMemoColor() };
      state.memos.splice(idx + 1, 0, nm);
      save();
      renderMemos();
      focusMemoTitle(nm.id);
    } else if (e.key === 'Backspace' && caretAtStart(body)) {
      // 제목이 있으면 본문이 비어도 메모를 지우지 않음
      if (plainText(memo.title).trim()) return;
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
    chip.style.background = `color-mix(in srgb, ${accent} 18%, transparent)`;
    chip.style.color = accent;
    chip.innerHTML = '#' + t + ' <b>×</b>';
    chip.querySelector('b').addEventListener('click', () => {
      memo.tags = memo.tags.filter((x) => x !== t);
      // 그 태그가 더 이상 어떤 메모에도 없을 때만 필터에서 제거(필터 유지)
      if (!state.memos.some((m) => (m.tags || []).includes(t))) activeTags.delete(t);
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

  // 블록 더블클릭 → 별도 편집 창 (본문/제목/태그/링크 위에서는 제외)
  block.addEventListener('dblclick', (e) => {
    if (e.target.closest('.note-body') || e.target.closest('input') ||
        e.target.closest('.memo-title') ||
        e.target.closest('.tag-chip') || e.target.closest('.link') ||
        e.target.closest('.icon-btn')) return;
    e.preventDefault();
    if (window.api.openMemoEditor) window.api.openMemoEditor(memo.id);
  });

  // 메모 블록 하단 빈 곳을 누르면 태그 입력 활성화 (본문/헤더/제목/칩/링크 제외)
  block.addEventListener('mousedown', (e) => {
    if (e.target.closest('.note-body') || e.target.closest('.memo-head') ||
        e.target.closest('.memo-title') || e.target.closest('input') ||
        e.target.closest('.tag-chip') || e.target.closest('.link')) return;
    e.preventDefault();
    tagAdd.focus();
  });

  return block;
}

/* 글머리(마크다운) 단축: '- '/'* ' 불릿, '1. ' 번호, 'ㅁ '/'[] ' 체크박스, Tab 들여쓰기 */
// handleMarkdownKey는 shared.js로 이동(상세 창과 공용)

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
  if (label) label.textContent = memoTitle(memo);
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
  sq.style.background = accentVar(memo);

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = memoTitle(memo);

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

/* 인덱스에서 제목 수정 → 제목칸(title)에 반영 */
function setMemoTitle(memo, newTitle) {
  memo.title = newTitle;
}

function startIndexRename(chip, label, memo) {
  const memoIndex = document.getElementById('memo-index');
  memoIndex.classList.add('pinned'); // 수정 중 인덱스 고정
  chip.draggable = false;
  const input = document.createElement('input');
  input.className = 'index-rename';
  input.value = memoTitle(memo) === '제목 없음' ? '' : memoTitle(memo);
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
  // 입력칸 클릭이 칩 클릭(본문으로 포커스 이동)으로 새지 않게 → 수정 중 유지(폴더와 동일)
  input.addEventListener('mousedown', (e) => e.stopPropagation());
  input.addEventListener('click', (e) => e.stopPropagation());
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
let colorPopOwner = null; // 색상 팝오버가 열린 블록의 데이터(토글 판별용)

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
    sw.style.background = `var(--a${i})`;
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
// 팝오버가 열려있는 동안엔 해당 블록의 도구 아이콘을 계속 보이게 한다(tools-on).
function openColorPop(x, y, item, block) {
  colorPop.innerHTML = '';
  colorPop.appendChild(buildSwatches(item));
  colorPopOwner = item;
  document.querySelectorAll('.tools-on').forEach((b) => b.classList.remove('tools-on'));
  if (block) block.classList.add('tools-on');
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
  colorPopOwner = null;
  document.querySelectorAll('.tools-on').forEach((b) => b.classList.remove('tools-on'));
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

function startBlockDrag(e, kind, block, id, extra) {
  blockDrag = Object.assign({ kind, id, block }, extra || {});
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
// FONTS/setupFormatToolbar는 shared.js로 이동(상세 창과 공용)

function applySettings() {
  const s = state.settings || {};
  applyThemeSettings(s); // 커스텀 테마 적용(없으면 기본)
  setSharedSettings(s);  // 서식 프리셋(글자색/형광) 창 간 공유 갱신

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
    // 다른 떠 있는 창들(서식창·색/우클릭 메뉴)을 먼저 닫는다
    hideMenus();
    if (typeof hideFormatToolbar === 'function') hideFormatToolbar();
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
    reader.onload = () => cropOpen(reader.result); // 위치/확대 조정 후 적용
    reader.readAsDataURL(f);
    fileInput.value = '';
  });

  // 테마 변경 → 모달 (커스텀 액션 + 프리셋 목록)
  document.getElementById('pm-theme').addEventListener('click', () => {
    profileMenu.classList.remove('open');
    themeOverlay.classList.add('open');
  });
  document.getElementById('theme-close').addEventListener('click',
    () => themeOverlay.classList.remove('open'));
  themeOverlay.addEventListener('click', (e) => {
    if (e.target === themeOverlay) themeOverlay.classList.remove('open');
  });

  // 배경화면 변경: 로컬 이미지 → 배경 + 평균색으로 나머지 팔레트 유도
  const bgFile = document.getElementById('bg-file');
  document.getElementById('btn-bg-image').addEventListener('click', () => bgFile.click());
  bgFile.addEventListener('change', () => {
    const f = bgFile.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const prev = (state.settings.custom && state.settings.custom.color) || '#cdb0bb';
      // 1) 배경을 즉시 적용 (색 추출 성공/실패와 무관하게 보이도록)
      state.settings.custom = { color: prev, bgImage: dataUrl };
      state.settings.theme = 'custom';
      save();
      applySettings();
      themeOverlay.classList.remove('open');
      // 2) 대표색이 추출되면 팔레트만 갱신
      extractColor(dataUrl, (color) => {
        state.settings.custom = { color, bgImage: dataUrl };
        save();
        applySettings();
      });
    };
    reader.readAsDataURL(f);
    bgFile.value = '';
  });

  // 배경화면 삭제: 이미지를 제거하고 테마색 단색 배경으로
  document.getElementById('btn-bg-remove').addEventListener('click', () => {
    if (state.settings.custom) {
      state.settings.custom = { color: state.settings.custom.color, bgImage: null };
      save();
      applySettings();
    }
    themeOverlay.classList.remove('open');
  });

  // 테마 컬러 변경: 컬러 피커 모달
  document.getElementById('btn-theme-color').addEventListener('click', () => {
    const cur = (state.settings.custom && state.settings.custom.color) ||
      getComputedStyle(document.documentElement).getPropertyValue('--pink-deep').trim() ||
      '#cdb0bb';
    themeColorOpen(cur);
  });
}

let themeColorOpen = () => {};

/* 테마 컬러 피커 (SV 사각형 + 색상 슬라이더) */
function setupColorPicker() {
  const ov = document.getElementById('color-picker-overlay');
  const sv = document.getElementById('cp-sv');
  const svThumb = document.getElementById('cp-sv-thumb');
  const hue = document.getElementById('cp-hue');
  const hueThumb = document.getElementById('cp-hue-thumb');
  const hexInput = document.getElementById('cp-hex');
  let H = 330, S = 0.4, V = 0.8;
  let cpBgImage = null; // 현재 배경 이미지(있으면 컬러 변경 중에도 유지)

  const curHex = () => hsvToHex(H, S, V);
  let rafId = 0;
  function updateThumbs() {
    sv.style.background =
      `linear-gradient(to top, #000, transparent), ` +
      `linear-gradient(to right, #fff, ${hslHex(H, 1, 0.5)})`;
    svThumb.style.left = (S * 100) + '%';
    svThumb.style.top = ((1 - V) * 100) + '%';
    hueThumb.style.left = (H / 360 * 100) + '%';
    const c = curHex();
    svThumb.style.background = c;
    hexInput.value = c;
  }
  function paint() {
    updateThumbs(); // 커서/썸은 즉시 갱신(가벼움) → 마우스 따라 바로 이동
    // 무거운 테마 적용(변수 24개+블록 재계산)은 프레임당 1회로 합쳐 지연 제거
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      applyCustomTheme(curHex(), cpBgImage);
      if (window.api.sendThemePreview) window.api.sendThemePreview(curHex()); // 상세창 실시간 미리보기
    });
  }
  function openWith(hex) {
    cpBgImage = (state.settings.custom && state.settings.custom.bgImage) || null;
    const { r, g, b } = hexToRgb(hex || '#cdb0bb');
    const v = rgbToHsv(r, g, b);
    H = v.h; S = v.s; V = v.v;
    ov.classList.add('open');
    paint();
  }
  themeColorOpen = openWith;

  const drag = (el, handler) => {
    let on = false;
    el.addEventListener('pointerdown', (e) => {
      on = true; try { el.setPointerCapture(e.pointerId); } catch (_) {} handler(e);
    });
    el.addEventListener('pointermove', (e) => { if (on) handler(e); });
    el.addEventListener('pointerup', () => { on = false; });
  };
  drag(sv, (e) => {
    const r = sv.getBoundingClientRect();
    S = clamp01((e.clientX - r.left) / r.width);
    V = clamp01(1 - (e.clientY - r.top) / r.height);
    paint();
  });
  drag(hue, (e) => {
    const r = hue.getBoundingClientRect();
    H = clamp01((e.clientX - r.left) / r.width) * 360;
    paint();
  });
  hexInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    let v = hexInput.value.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(v)) { if (v[0] !== '#') v = '#' + v; openWith(v); }
  });

  const commit = () => {
    state.settings.custom = { color: curHex(), bgImage: cpBgImage }; // 배경 이미지 유지
    state.settings.theme = 'custom';
    save();
    applySettings();
    ov.classList.remove('open');
    document.getElementById('theme-overlay').classList.remove('open');
  };
  const cancel = () => {
    ov.classList.remove('open');
    applySettings();
    if (window.api.sendThemePreview) window.api.sendThemePreview(null); // 상세창 미리보기 원복
  };
  document.getElementById('cp-apply').addEventListener('click', commit);
  document.getElementById('cp-close').addEventListener('click', cancel);
  ov.addEventListener('click', (e) => { if (e.target === ov) cancel(); });
}

/* 프로필 이미지 크롭(위치/확대) — 인스타처럼 드래그+줌, 결과를 512px로 저장(고화질 깨짐 방지) */
let cropOpen = () => {};
function setupCropper() {
  const ov = document.getElementById('crop-overlay');
  const canvas = document.getElementById('crop-canvas');
  const zoom = document.getElementById('crop-zoom');
  let ctx = null;
  try { ctx = canvas.getContext('2d'); } catch (_) {}
  const SIZE = 240;
  let img = null, scale = 1, minScale = 1, ox = 0, oy = 0;

  function clampPan() {
    const w = img.width * scale, h = img.height * scale;
    ox = Math.min(0, Math.max(SIZE - w, ox));
    oy = Math.min(0, Math.max(SIZE - h, oy));
  }
  function draw() {
    if (!ctx || !img) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, ox, oy, img.width * scale, img.height * scale);
  }
  cropOpen = (dataUrl) => {
    const im = new Image();
    im.onload = () => {
      img = im;
      minScale = Math.max(SIZE / im.width, SIZE / im.height);
      scale = minScale;
      zoom.value = '1';
      ox = (SIZE - im.width * scale) / 2;
      oy = (SIZE - im.height * scale) / 2;
      clampPan();
      draw();
      ov.classList.add('open');
    };
    im.src = dataUrl;
  };

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!img) return;
    drag = { x: e.clientX, y: e.clientY, ox, oy };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    ox = drag.ox + (e.clientX - drag.x);
    oy = drag.oy + (e.clientY - drag.y);
    clampPan(); draw();
  });
  canvas.addEventListener('pointerup', () => { drag = null; });

  zoom.addEventListener('input', () => {
    if (!img) return;
    const ns = minScale * parseFloat(zoom.value);
    const cx = SIZE / 2, cy = SIZE / 2;
    ox = cx - (cx - ox) * (ns / scale); // 중심 기준 확대
    oy = cy - (cy - oy) * (ns / scale);
    scale = ns; clampPan(); draw();
  });

  function apply() {
    if (!img) return;
    const OUT = 512, f = OUT / SIZE;
    const out = document.createElement('canvas');
    out.width = OUT; out.height = OUT;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(img, ox * f, oy * f, img.width * scale * f, img.height * scale * f);
    state.settings.profileImage = out.toDataURL('image/jpeg', 0.92);
    save();
    applySettings();
    ov.classList.remove('open'); img = null;
  }
  const close = () => { ov.classList.remove('open'); img = null; };
  document.getElementById('crop-apply').addEventListener('click', apply);
  document.getElementById('crop-close').addEventListener('click', close);
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
}

/* =========================================================================
 * 메모 서식 툴바 (텍스트 선택 시)
 * ========================================================================= */
let hideFormatToolbar = () => {};


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
  setupColorPicker();
  setupCropper();
  // 색상 프리셋 저장을 앱의 상태 저장 경로로 라우팅(롤백 방지 + 창 간 연동)
  setPresetPersist((key, list) => { state.settings[key] = list.slice(); save(); });
  hideFormatToolbar = setupFormatToolbar({
    selector: '.note-body, .memo-title',
    scrollEl: memoPage,
    lockIndex: true,
    persist: (savedBody) => {
      const block = savedBody.closest('.memo-block');
      const memo = block && state.memos.find((m) => m.id === block.dataset.id);
      if (!memo) return;
      if (savedBody.classList.contains('memo-title')) memo.title = savedBody.innerHTML;
      else memo.content = savedBody.innerHTML;
      save();
      updateIndexTitle(memo);
    }
  });
  setupNumPrompt();
  setupCalendar();
  setupImageResize(() => {
    document.querySelectorAll('.note-body').forEach((b) => {
      const m = state.memos.find((x) => x.id === b.dataset.id);
      if (m) m.content = b.innerHTML;
    });
    save();
  });
  setupHrClickSelect(memoPage); // 구분선 클릭 선택 → Backspace 삭제

  document.getElementById('btn-add-todo').addEventListener('click', addTodo);
  document.getElementById('btn-add-memo').addEventListener('click', () => addMemo());
  document.getElementById('btn-add-folder').addEventListener('click', addFolder);
  // +버튼 주변 빠른 실행 버튼 — 현재는 메모추가만 동작(나머지는 추후 기능 연결)
  // hover 후 버튼으로 마우스 이동 시 사라지지 않도록 열림/닫힘을 지연 제어(사이 빈틈 보정)
  const fabWrap = document.getElementById('fab-wrap');
  if (fabWrap) {
    let fabCloseTimer = null;
    const openFab = () => { clearTimeout(fabCloseTimer); fabWrap.classList.add('fab-open'); };
    const closeFab = () => { fabCloseTimer = setTimeout(() => fabWrap.classList.remove('fab-open'), 280); };
    const fabHot = [document.getElementById('btn-add-memo'), ...fabWrap.querySelectorAll('.fab-mini')];
    fabHot.forEach((el) => {
      el.addEventListener('mouseenter', openFab);
      el.addEventListener('mouseleave', closeFab);
    });
    fabWrap.querySelectorAll('.fab-mini').forEach((b) => {
      b.addEventListener('click', () => {
        fabWrap.classList.remove('fab-open');
        if (b.dataset.act === 'memo') addMemo();
        // sticker / alarm / stopwatch: UI만 — 기능 추후 추가
      });
    });
  }

  renderTabs();
  applyView();

  await load();
  renderTodos();
  renderMemos();
}

init();
