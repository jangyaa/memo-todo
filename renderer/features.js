'use strict';

/* =========================================================================
 * features.js — 개인 홈 확장 기능
 *   · 프로젝트(마감 관리)   · 월간 일정(임박 마감 알림)
 *   · thinking cycle(주기 예측)   · 설정(테마/위젯/백업)
 *
 * app.js / shared.js 의 전역(state, save, pickDate, uid, BLOCK_COLORS,
 * accentVar, blockBg, ddayDiff/Label/Class, isoOf, applySettings)을 그대로 사용.
 * app.js 로드 뒤에 실행되므로 호출 시점에는 모두 정의돼 있다.
 * ========================================================================= */

/* ---- 공용 유틸 ---- */
function todayIso() {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}
function isoToLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
}
// 색상 순환 버튼 (프로젝트/일정/사이클 공용)
function makeColorCycleButton(item, onChange) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn small color-btn';
  btn.title = '색상 변경';
  const dot = document.createElement('span');
  dot.className = 'swatch-dot';
  dot.style.background = accentVar(item);
  btn.appendChild(dot);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const i = BLOCK_COLORS.indexOf(item.color);
    item.color = BLOCK_COLORS[(i + 1) % BLOCK_COLORS.length];
    dot.style.background = accentVar(item);
    save();
    if (onChange) onChange();
  });
  return btn;
}
function delButton(title, onClick) {
  const b = document.createElement('button');
  b.className = 'item-del';
  b.textContent = '✕';
  b.title = title || '삭제';
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}

/* =========================================================================
 * 프로젝트 (마감 관리 + 진행도)
 * ========================================================================= */
function addProject() {
  const color = BLOCK_COLORS[state.projects.length % BLOCK_COLORS.length];
  const p = { id: uid(), title: '', color, deadline: '', segs: 5, progress: 0, done: false, note: '' };
  state.projects.push(p);
  save();
  renderProjects();
  const el = document.querySelector(`.proj-card[data-id="${p.id}"] .proj-title`);
  if (el) el.focus();
}

// 진행 중(마감 가까운 순) → 마감 없는 것 → 완료(맨 아래)
function orderedProjects() {
  const val = (p) => {
    if (p.done) return 3e15;
    const d = ddayDiff(p.deadline);
    return d === null ? 2e15 : d * 1e9;
  };
  return [...state.projects].sort((a, b) => val(a) - val(b));
}

function buildProjSegments(p) {
  const wrap = document.createElement('div');
  wrap.className = 'proj-segs';
  const segs = Math.max(1, p.segs || 5);
  for (let i = 0; i < segs; i++) {
    const seg = document.createElement('button');
    seg.className = 'proj-seg' + (i < p.progress ? ' filled' : '');
    seg.style.setProperty('--seg-accent', accentVar(p));
    seg.title = `${i + 1}/${segs}`;
    seg.addEventListener('click', () => {
      // 이미 채운 마지막 칸을 다시 누르면 한 칸 줄이기(토글감)
      p.progress = (p.progress === i + 1) ? i : i + 1;
      p.done = p.progress >= segs;
      save();
      renderProjects();
    });
    wrap.appendChild(seg);
  }
  return wrap;
}

function buildProjCard(p) {
  const card = document.createElement('div');
  card.className = 'proj-card' + (p.done ? ' done' : '');
  card.dataset.id = p.id;
  card.style.background = blockBg(p);
  card.style.borderColor = accentVar(p);

  // 헤더: 색 · 제목 · 삭제
  const head = document.createElement('div');
  head.className = 'proj-head';
  head.appendChild(makeColorCycleButton(p, renderProjects));

  const title = document.createElement('input');
  title.className = 'proj-title';
  title.placeholder = '프로젝트 이름';
  title.value = p.title || '';
  title.addEventListener('input', () => { p.title = title.value; save(); });
  head.appendChild(title);
  head.appendChild(delButton('프로젝트 삭제', () => {
    state.projects = state.projects.filter((x) => x.id !== p.id);
    save(); renderProjects();
    if (window.checkDeadlineAlerts) window.checkDeadlineAlerts();
  }));
  card.appendChild(head);

  // 마감 배지 + 진행도
  const meta = document.createElement('div');
  meta.className = 'proj-meta';
  const badge = document.createElement('button');
  const cls = p.deadline ? ddayClass(p.deadline) : '';
  badge.className = 'dday-badge proj-dday' + cls;
  badge.textContent = p.deadline ? ddayLabel(p.deadline) : '마감 설정';
  if (!p.deadline) badge.classList.add('empty');
  badge.title = '마감일 변경';
  badge.addEventListener('click', () => {
    pickDate(p.deadline || '', (date) => {
      p.deadline = date; save(); renderProjects();
      if (window.checkDeadlineAlerts) window.checkDeadlineAlerts();
    });
  });
  meta.appendChild(badge);

  if (p.deadline) {
    const dl = document.createElement('span');
    dl.className = 'proj-date';
    dl.textContent = isoToLabel(p.deadline);
    meta.appendChild(dl);
  }
  card.appendChild(meta);

  // 진행도 바 + 퍼센트(칸 수 변경)
  const prog = document.createElement('div');
  prog.className = 'proj-prog';
  prog.appendChild(buildProjSegments(p));
  const pct = document.createElement('button');
  const segs = Math.max(1, p.segs || 5);
  pct.className = 'proj-pct';
  pct.textContent = Math.round((p.progress / segs) * 100) + '%';
  pct.title = '진행 칸 수 변경';
  pct.addEventListener('click', () => {
    const v = prompt('진행도를 몇 칸으로 나눌까요? (1~20)', String(segs));
    const n = Math.max(1, Math.min(20, parseInt(v, 10) || segs));
    p.segs = n; p.progress = Math.min(p.progress, n); p.done = p.progress >= n;
    save(); renderProjects();
  });
  prog.appendChild(pct);
  card.appendChild(prog);

  // 메모(선택)
  const note = document.createElement('textarea');
  note.className = 'proj-note';
  note.placeholder = '메모 (선택)';
  note.rows = 1;
  note.value = p.note || '';
  const grow = () => { note.style.height = 'auto'; note.style.height = note.scrollHeight + 'px'; };
  note.addEventListener('input', () => { p.note = note.value; grow(); save(); });
  setTimeout(grow, 0);
  card.appendChild(note);

  return card;
}

function renderProjects() {
  const board = document.getElementById('proj-board');
  if (!board) return;
  board.innerHTML = '';
  if (!state.projects.length) {
    const e = document.createElement('div');
    e.className = 'view-empty';
    e.textContent = '＋ 로 마감이 있는 프로젝트를 추가하세요';
    board.appendChild(e);
    return;
  }
  orderedProjects().forEach((p) => board.appendChild(buildProjCard(p)));
}

/* =========================================================================
 * 월간 일정 (+ 프로젝트 마감/디데이 표시)
 * ========================================================================= */
let mcalY = 0, mcalM = 0, mcalSel = '';

function mcalInit() {
  const d = new Date();
  mcalY = d.getFullYear(); mcalM = d.getMonth();
  mcalSel = todayIso();
}
function eventsOn(iso) {
  return state.events.filter((e) => e.date === iso)
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
}
// 그 날짜의 '마감' 표시(프로젝트/디데이) — 읽기 전용 마커
function deadlinesOn(iso) {
  const out = [];
  state.projects.forEach((p) => {
    if (p.deadline === iso && !p.done) out.push({ kind: 'project', title: p.title || '프로젝트', color: p.color });
  });
  (state.ddays || []).forEach((d) => {
    if (d.date === iso) out.push({ kind: 'dday', title: d.title || 'D-DAY', color: BLOCK_COLORS[0] });
  });
  return out;
}

function renderMcalGrid() {
  const title = document.getElementById('mcal-title');
  const grid = document.getElementById('mcal-grid');
  if (!grid) return;
  title.textContent = `${mcalY}년 ${mcalM + 1}월`;
  grid.innerHTML = '';
  ['일', '월', '화', '수', '목', '금', '토'].forEach((w, i) => {
    const h = document.createElement('span');
    h.className = 'mcal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '');
    h.textContent = w;
    grid.appendChild(h);
  });
  const first = new Date(mcalY, mcalM, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(mcalY, mcalM + 1, 0).getDate();
  const today = todayIso();

  for (let i = 0; i < startDow; i++) {
    const blank = document.createElement('span');
    blank.className = 'mcal-cell blank';
    grid.appendChild(blank);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = isoOf(mcalY, mcalM, day);
    const cell = document.createElement('button');
    cell.className = 'mcal-cell';
    if (iso === today) cell.classList.add('today');
    if (iso === mcalSel) cell.classList.add('sel');
    const dow = new Date(mcalY, mcalM, day).getDay();
    if (dow === 0) cell.classList.add('sun');
    if (dow === 6) cell.classList.add('sat');

    const num = document.createElement('span');
    num.className = 'mcal-num';
    num.textContent = day;
    cell.appendChild(num);

    const evs = eventsOn(iso);
    const dls = deadlinesOn(iso);
    if (evs.length || dls.length) {
      const dots = document.createElement('span');
      dots.className = 'mcal-dots';
      dls.forEach(() => {
        const s = document.createElement('i'); s.className = 'mcal-dot deadline'; dots.appendChild(s);
      });
      evs.slice(0, 4 - Math.min(dls.length, 3)).forEach((e) => {
        const s = document.createElement('i');
        s.className = 'mcal-dot';
        s.style.background = accentVar(e);
        dots.appendChild(s);
      });
      cell.appendChild(dots);
    }
    cell.addEventListener('click', () => { mcalSel = iso; renderCalendarView(); });
    grid.appendChild(cell);
  }
}

function renderMcalDay() {
  const titleEl = document.getElementById('mcal-day-title');
  const list = document.getElementById('mcal-events');
  if (!list) return;
  titleEl.textContent = mcalSel ? isoToLabel(mcalSel) : '날짜를 선택하세요';
  list.innerHTML = '';

  const dls = deadlinesOn(mcalSel);
  dls.forEach((d) => {
    const row = document.createElement('div');
    row.className = 'ev-row deadline';
    const tag = document.createElement('span');
    tag.className = 'ev-tag';
    tag.textContent = d.kind === 'project' ? '마감' : 'D-DAY';
    const name = document.createElement('span');
    name.className = 'ev-title-static';
    name.textContent = d.title;
    row.appendChild(tag); row.appendChild(name);
    list.appendChild(row);
  });

  const evs = eventsOn(mcalSel);
  if (!evs.length && !dls.length) {
    const e = document.createElement('div');
    e.className = 'view-empty small';
    e.textContent = '＋ 로 이 날 일정을 추가하세요';
    list.appendChild(e);
  }
  evs.forEach((ev) => list.appendChild(buildEventRow(ev)));
}

function buildEventRow(ev) {
  const row = document.createElement('div');
  row.className = 'ev-row';
  row.style.borderLeftColor = accentVar(ev);
  row.dataset.id = ev.id;

  const time = document.createElement('input');
  time.className = 'ev-time';
  time.type = 'time';
  time.value = ev.time || '';
  time.addEventListener('input', () => { ev.time = time.value; save(); renderMcalGrid(); });

  const title = document.createElement('input');
  title.className = 'ev-title';
  title.placeholder = '일정';
  title.value = ev.title || '';
  title.addEventListener('input', () => { ev.title = title.value; save(); });

  const colorBtn = makeColorCycleButton(ev, () => { renderMcalGrid(); renderMcalDay(); });

  row.appendChild(time);
  row.appendChild(title);
  row.appendChild(colorBtn);
  row.appendChild(delButton('일정 삭제', () => {
    state.events = state.events.filter((x) => x.id !== ev.id);
    save(); renderCalendarView();
    if (window.checkDeadlineAlerts) window.checkDeadlineAlerts();
  }));
  return row;
}

function addEvent() {
  if (!mcalSel) mcalSel = todayIso();
  const color = BLOCK_COLORS[state.events.length % BLOCK_COLORS.length];
  const ev = { id: uid(), title: '', date: mcalSel, time: '', color, note: '' };
  state.events.push(ev);
  save();
  renderCalendarView();
  if (window.checkDeadlineAlerts) window.checkDeadlineAlerts();
  const el = document.querySelector(`.ev-row[data-id="${ev.id}"] .ev-title`);
  if (el) el.focus();
}

function renderCalendarView() {
  if (!mcalSel) mcalInit();
  renderMcalGrid();
  renderMcalDay();
}

/* =========================================================================
 * thinking cycle (주기 트래커 + 예측)
 * ========================================================================= */
function addCycle() {
  const color = BLOCK_COLORS[state.cycles.length % BLOCK_COLORS.length];
  const c = { id: uid(), name: '', color, entries: [], note: '' };
  state.cycles.push(c);
  save();
  renderCycles();
  const el = document.querySelector(`.cycle-card[data-id="${c.id}"] .cycle-name`);
  if (el) el.focus();
}

// 정렬된 기록으로 평균 간격/다음 예상일/편차 계산
function cyclePrediction(c) {
  const days = (c.entries || []).map((iso) => new Date(iso + 'T00:00:00').getTime())
    .filter((t) => !isNaN(t)).sort((a, b) => a - b);
  if (days.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < days.length; i++) gaps.push(Math.round((days[i] - days[i - 1]) / 86400000));
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const min = Math.min(...gaps), max = Math.max(...gaps);
  const last = days[days.length - 1];
  const next = new Date(last + Math.round(avg) * 86400000);
  const nextIso = isoOf(next.getFullYear(), next.getMonth(), next.getDate());
  return { avg: Math.round(avg * 10) / 10, min, max, count: gaps.length, nextIso };
}

function buildCycleCard(c) {
  const card = document.createElement('div');
  card.className = 'cycle-card';
  card.dataset.id = c.id;
  card.style.background = blockBg(c);
  card.style.borderColor = accentVar(c);

  const head = document.createElement('div');
  head.className = 'cycle-head';
  head.appendChild(makeColorCycleButton(c, renderCycles));
  const name = document.createElement('input');
  name.className = 'cycle-name';
  name.placeholder = '사이클 이름 (예: 아이디어 정리, 대청소…)';
  name.value = c.name || '';
  name.addEventListener('input', () => { c.name = name.value; save(); });
  head.appendChild(name);
  head.appendChild(delButton('사이클 삭제', () => {
    state.cycles = state.cycles.filter((x) => x.id !== c.id);
    save(); renderCycles();
  }));
  card.appendChild(head);

  // 예측
  const pred = cyclePrediction(c);
  const pbox = document.createElement('div');
  pbox.className = 'cycle-pred';
  if (!pred) {
    pbox.classList.add('muted');
    pbox.textContent = '기록이 2개 이상 쌓이면 주기 예상치가 나와요.';
  } else {
    const dd = ddayDiff(pred.nextIso);
    const label = dd === null ? '' : (dd > 0 ? `D-${dd}` : dd === 0 ? 'D-DAY' : `D+${-dd}`);
    pbox.innerHTML =
      `<div class="cp-main"><b>다음 예상</b> ${isoToLabel(pred.nextIso)} ` +
      `<span class="cp-dday ${dd !== null && dd <= 3 ? 'soon' : ''}">${label}</span></div>` +
      `<div class="cp-sub">평균 주기 <b>${pred.avg}일</b> · 범위 ${pred.min}~${pred.max}일 · 기록 ${pred.count + 1}회</div>`;
  }
  card.appendChild(pbox);

  // 기록 칩 + 추가
  const chips = document.createElement('div');
  chips.className = 'cycle-chips';
  const sorted = [...(c.entries || [])].sort();
  sorted.forEach((iso) => {
    const chip = document.createElement('button');
    chip.className = 'cycle-chip';
    chip.innerHTML = `<span>${isoToLabel(iso)}</span><i>✕</i>`;
    chip.title = '이 기록 삭제';
    chip.addEventListener('click', () => {
      c.entries = c.entries.filter((x) => x !== iso);
      save(); renderCycles();
    });
    chips.appendChild(chip);
  });
  const addBtn = document.createElement('button');
  addBtn.className = 'cycle-add';
  addBtn.textContent = '＋ 기록';
  addBtn.title = '오늘/특정 날짜 기록 추가';
  addBtn.addEventListener('click', () => {
    pickDate(todayIso(), (date) => {
      if (!c.entries.includes(date)) c.entries.push(date);
      save(); renderCycles();
    });
  });
  chips.appendChild(addBtn);
  card.appendChild(chips);

  return card;
}

function renderCycles() {
  const board = document.getElementById('cycle-board');
  if (!board) return;
  board.innerHTML = '';
  if (!state.cycles.length) {
    const e = document.createElement('div');
    e.className = 'view-empty';
    e.innerHTML = '＋ 로 반복되는 일의 사이클을 만들어보세요<br>' +
      '<span class="view-empty-sub">날짜를 기록하면 평균 주기와 다음 예상일을 계산해줘요</span>';
    board.appendChild(e);
    return;
  }
  state.cycles.forEach((c) => board.appendChild(buildCycleCard(c)));
}

/* =========================================================================
 * 임박 마감 알림 (배너 + OS 알림)
 * ========================================================================= */
const ALERT_WITHIN = 3; // D-3 이내 + 지난 마감

function collectImminent() {
  const out = [];
  state.projects.forEach((p) => {
    if (p.done || !p.deadline) return;
    const d = ddayDiff(p.deadline);
    if (d === null) return;
    if (d <= ALERT_WITHIN) out.push({ d, title: p.title || '프로젝트', kind: '프로젝트' });
  });
  state.events.forEach((e) => {
    if (!e.date) return;
    const d = ddayDiff(e.date);
    if (d === null) return;
    if (d >= 0 && d <= ALERT_WITHIN) out.push({ d, title: e.title || '일정', kind: '일정' });
  });
  (state.ddays || []).forEach((x) => {
    const d = ddayDiff(x.date);
    if (d === null) return;
    if (d >= 0 && d <= ALERT_WITHIN) out.push({ d, title: x.title || 'D-DAY', kind: 'D-DAY' });
  });
  return out.sort((a, b) => a.d - b.d);
}

let alertDismissed = false;
function checkDeadlineAlerts() {
  const bar = document.getElementById('deadline-alert');
  if (!bar) return;
  const items = collectImminent();
  if (!items.length || alertDismissed) { bar.classList.remove('show'); bar.innerHTML = ''; return; }

  bar.innerHTML = '';
  const icon = document.createElement('span');
  icon.className = 'da-icon';
  icon.textContent = '⏰';
  bar.appendChild(icon);

  const list = document.createElement('div');
  list.className = 'da-list';
  items.slice(0, 4).forEach((it) => {
    const chip = document.createElement('span');
    chip.className = 'da-chip' + (it.d <= 0 ? ' urgent' : '');
    const lbl = it.d > 0 ? `D-${it.d}` : it.d === 0 ? 'D-DAY' : `D+${-it.d}`;
    chip.innerHTML = `<b>${lbl}</b> ${it.title}`;
    list.appendChild(chip);
  });
  if (items.length > 4) {
    const more = document.createElement('span');
    more.className = 'da-more';
    more.textContent = `외 ${items.length - 4}건`;
    list.appendChild(more);
  }
  bar.appendChild(list);

  const close = document.createElement('button');
  close.className = 'da-close';
  close.textContent = '✕';
  close.title = '오늘 그만 보기';
  close.addEventListener('click', () => { alertDismissed = true; bar.classList.remove('show'); });
  bar.appendChild(close);
  bar.classList.add('show');

  // 오늘(D-DAY) 항목은 하루 한 번만 OS 알림
  try {
    const due = items.filter((it) => it.d === 0);
    if (due.length && window.api && window.api.notify) {
      const key = 'lastDdayNotify';
      const today = todayIso();
      if (localStorage.getItem(key) !== today) {
        localStorage.setItem(key, today);
        const names = due.map((x) => x.title).join(', ');
        window.api.notify('오늘 마감이에요', `${names} — 오늘이 D-DAY 입니다.`);
      }
    }
  } catch (_) {}
}

/* =========================================================================
 * 설정 (테마 · 위젯 · 백업)
 * ========================================================================= */
function fmtDateTime(ts) {
  if (!ts) return '없음';
  try { return new Date(ts).toLocaleString('ko-KR'); } catch (_) { return String(ts); }
}

function setupSettings() {
  const gear = document.getElementById('btn-settings');
  const overlay = document.getElementById('settings-overlay');
  if (!gear || !overlay) return;

  const open = () => {
    if (typeof hideMenus === 'function') hideMenus();
    overlay.classList.add('open');
    refreshWidgetUI();
    refreshBackupUI();
  };
  gear.addEventListener('click', (e) => { e.stopPropagation(); open(); });
  document.getElementById('settings-close').addEventListener('click',
    () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });

  // 테마: 기존 테마 모달의 동작을 그대로 재사용(원본 버튼을 프로그램적으로 클릭)
  const forward = (fromId, toId) => {
    const from = document.getElementById(fromId);
    if (from) from.addEventListener('click', () => {
      const to = document.getElementById(toId);
      if (to) to.click();
    });
  };
  forward('set-bg-image', 'btn-bg-image');
  forward('set-bg-remove', 'btn-bg-remove');
  forward('set-theme-color', 'btn-theme-color');

  /* ---- 위젯 모드 ---- */
  const modeChk = document.getElementById('set-widget-mode');
  const topChk = document.getElementById('set-widget-top');
  const note = document.getElementById('set-widget-note');
  async function refreshWidgetUI() {
    if (!window.api || !window.api.widget) { note.textContent = ''; return; }
    try {
      const s = await window.api.widget.status();
      modeChk.checked = !!s.desktopMode;
      topChk.checked = !!s.alwaysOnTop;
      topChk.disabled = !s.desktopMode;
      note.textContent = s.desktopMode
        ? '위젯 모드 켜짐 — 트레이 아이콘(오른쪽 아래)으로 다시 열 수 있어요.'
        : '';
    } catch (_) {}
  }
  const setWidget = async (patch) => {
    if (!window.api || !window.api.widget) return;
    try { await window.api.widget.set(patch); } catch (_) {}
    refreshWidgetUI();
  };
  if (modeChk) modeChk.addEventListener('change', () => setWidget({ desktopMode: modeChk.checked }));
  if (topChk) topChk.addEventListener('change', () => setWidget({ alwaysOnTop: topChk.checked }));

  /* ---- 백업 ---- */
  const enChk = document.getElementById('set-backup-enabled');
  const dirEl = document.getElementById('set-backup-dir');
  const lastEl = document.getElementById('set-backup-last');
  async function refreshBackupUI() {
    if (!window.api || !window.api.backup) return;
    try {
      const s = await window.api.backup.status();
      enChk.checked = s.enabled !== false;
      dirEl.textContent = s.dir || '—';
      dirEl.title = s.dir || '';
      lastEl.textContent = fmtDateTime(s.lastBackupAt);
    } catch (_) {}
  }
  const wrapBackup = (fn) => async () => {
    if (!window.api || !window.api.backup) return;
    try { await fn(); } catch (_) {}
    refreshBackupUI();
  };
  if (enChk) enChk.addEventListener('change',
    wrapBackup(() => window.api.backup.setEnabled(enChk.checked)));
  const nowBtn = document.getElementById('set-backup-now');
  if (nowBtn) nowBtn.addEventListener('click', async () => {
    nowBtn.disabled = true;
    try {
      const r = await window.api.backup.now();
      if (!r || !r.ok) alert('백업 실패: ' + ((r && r.reason) || '알 수 없음'));
    } catch (_) {}
    nowBtn.disabled = false;
    refreshBackupUI();
  });
  const dirBtn = document.getElementById('set-backup-dir-btn');
  if (dirBtn) dirBtn.addEventListener('click', wrapBackup(() => window.api.backup.chooseDir()));
  const resetBtn = document.getElementById('set-backup-dir-reset');
  if (resetBtn) resetBtn.addEventListener('click', wrapBackup(() => window.api.backup.resetDir()));

  // 외부에서 열려 있을 때 새로고침용
  window._refreshSettingsUI = () => { refreshWidgetUI(); refreshBackupUI(); };
}

/* =========================================================================
 * 등록 / 초기화
 * ========================================================================= */
window.renderFeatureViews = function () {
  renderProjects();
  renderCalendarView();
  renderCycles();
};
window.checkDeadlineAlerts = checkDeadlineAlerts;
window.onViewShown = function (view) {
  if (view === 'calendar') renderCalendarView();
  else if (view === 'project') renderProjects();
  else if (view === 'cycle') renderCycles();
};

(function setupFeatures() {
  mcalInit();

  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  on('btn-add-project', 'click', addProject);
  on('btn-add-event', 'click', addEvent);
  on('btn-add-cycle', 'click', addCycle);
  on('mcal-prev', 'click', () => { mcalM--; if (mcalM < 0) { mcalM = 11; mcalY--; } renderMcalGrid(); });
  on('mcal-next', 'click', () => { mcalM++; if (mcalM > 11) { mcalM = 0; mcalY++; } renderMcalGrid(); });
  on('mcal-today', 'click', () => { mcalInit(); renderCalendarView(); });

  setupSettings();

  // 자정을 넘겨 켜져 있어도 D-라벨/알림이 갱신되도록 주기 점검
  setInterval(() => {
    if (document.getElementById('view-calendar').classList.contains('active')) renderMcalGrid();
    checkDeadlineAlerts();
  }, 5 * 60 * 1000);
})();
