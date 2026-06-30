'use strict';

/* 메모 상세 편집 창 — 앱 디자인/테마 재사용 + 선택 시 서식 툴바(메인과 동일) */
const memoId = new URLSearchParams(location.search).get('id');
const $ = (id) => document.getElementById(id);
const titleEl = $('ed-title');
const bodyEl = $('ed-body');
const card = $('ed-card');
let memo = null;

function plainTitle(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return (d.textContent || '').trim();
}

async function load() {
  const data = await window.api.loadData();
  applyThemeSettings((data && data.settings) || {});
  memo = (data && data.memos || []).find((m) => m.id === memoId);
  if (!memo) {
    card.innerHTML = '<p style="color:var(--ink-soft)">메모를 찾을 수 없습니다.</p>';
    return;
  }
  card.style.background = `color-mix(in srgb, ${memo.color || 'var(--c0)'} 54%, transparent)`;
  const t = plainTitle(memo.title) || '메모';
  document.title = t;
  $('ed-topbar').textContent = t;
  titleEl.innerHTML = memo.title || '';
  bodyEl.innerHTML = memo.content || '';
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!memo) return;
    const title = titleEl.innerHTML;
    const content = bodyEl.innerHTML;
    const t = plainTitle(title) || '메모';
    document.title = t;
    $('ed-topbar').textContent = t;
    const latest = await window.api.loadData();
    if (!latest || !Array.isArray(latest.memos)) return;
    const m = latest.memos.find((x) => x.id === memoId);
    if (!m) return;
    m.title = title;
    m.content = content;
    await window.api.saveData(latest);
  }, 300);
}

titleEl.addEventListener('input', save);
bodyEl.addEventListener('input', save);
titleEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); bodyEl.focus(); }
});
bodyEl.addEventListener('keydown', (e) => { handleMarkdownKey(e, bodyEl, () => save()); });

// 선택 시 뜨는 서식 툴바(메인 앱과 동일 디자인/기능)
setupFormatToolbar({
  selector: '#ed-body, #ed-title',
  scrollEl: document.querySelector('.ed-scroll'),
  persist: () => save()
});

setupImageResize(() => save());

window.api.onDataChanged((d) => {
  if (!d) return;
  const a = document.activeElement;
  if (a && (a.isContentEditable || a.tagName === 'INPUT')) return;
  const m = (d.memos || []).find((x) => x.id === memoId);
  if (m) {
    memo = m;
    titleEl.innerHTML = m.title || '';
    bodyEl.innerHTML = m.content || '';
    const t = plainTitle(m.title) || '메모';
    $('ed-topbar').textContent = t;
  }
});

load();
