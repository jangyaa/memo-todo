'use strict';

/* 메모 상세 편집 창 — 앱 디자인/테마 재사용 + 블로그풍 메뉴 + 선택 서식툴바 */
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
  document.title = plainTitle(memo.title) || '메모';
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
    document.title = plainTitle(title) || '메모';
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

function exec(cmd, val) {
  try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
  document.execCommand(cmd, false, val || null);
  bodyEl.focus();
  save();
}

/* 상단 블로그풍 메뉴 */
document.querySelectorAll('.ed-toolbar [data-cmd]').forEach((b) => {
  b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const c = b.dataset.cmd;
    if (c === 'hr') { document.execCommand('insertHorizontalRule'); save(); return; }
    if (c === 'image') { $('ed-image').click(); return; }
    if (c === 'hilite') { exec('hiliteColor', '#ffe9a8'); return; }
    if (c === 'quote') {
      const s = window.getSelection();
      let n = s.anchorNode; n = n && (n.nodeType === 1 ? n : n.parentElement);
      exec('formatBlock', (n && n.closest && n.closest('blockquote')) ? 'div' : 'blockquote');
      return;
    }
    exec(c);
  });
});
$('ed-size').addEventListener('change', () => applySize(bodyEl, $('ed-size').value));
function applySize(scope, v) {
  scope.focus();
  try { document.execCommand('styleWithCSS', false, false); } catch (_) {}
  document.execCommand('fontSize', false, '7');
  scope.querySelectorAll('font[size="7"]').forEach((f) => { f.removeAttribute('size'); f.style.fontSize = v; });
  save();
}
$('ed-color').addEventListener('input', () => exec('foreColor', $('ed-color').value));
$('ed-image').addEventListener('change', () => {
  const f = $('ed-image').files[0];
  $('ed-image').value = '';
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    bodyEl.focus();
    document.execCommand('insertHTML', false, `<img src="${r.result}" style="max-width:100%"><br>`);
    save();
  };
  r.readAsDataURL(f);
});

/* 선택 시 뜨는 서식 툴바(메인 앱과 동일 디자인) */
(function setupFloating() {
  const bar = $('ft2');
  let savedRange = null, savedEl = null, sizePt = 16;
  function curEl() {
    const s = window.getSelection();
    if (!s || !s.rangeCount || s.isCollapsed) return null;
    let n = s.anchorNode; n = n && (n.nodeType === 1 ? n : n.parentElement);
    return (n && n.closest && n.closest('#ed-body, #ed-title')) || null;
  }
  function hide() { bar.classList.remove('open'); savedRange = null; savedEl = null; }
  function show() {
    const el = curEl();
    if (!el) { hide(); return; }
    const r = window.getSelection().getRangeAt(0);
    const rect = r.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) { hide(); return; }
    savedRange = r.cloneRange(); savedEl = el;
    $('ft2-size').textContent = sizePt + 'pt';
    bar.classList.add('open');
    const bw = bar.offsetWidth || 200;
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    let top = rect.top - bar.offsetHeight - 8;
    if (top < 4) top = rect.bottom + 8;
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
  }
  function restore() {
    if (!savedRange) return false;
    const s = window.getSelection();
    s.removeAllRanges(); s.addRange(savedRange);
    return true;
  }
  document.addEventListener('mouseup', () => setTimeout(show, 0));
  document.addEventListener('keyup', (e) => { if (e.shiftKey || e.key.startsWith('Arrow')) show(); });
  document.querySelector('.ed-scroll').addEventListener('scroll', hide);
  bar.querySelectorAll('button[data-cmd]').forEach((b) => {
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (!restore()) return;
      const c = b.dataset.cmd;
      try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
      if (c === 'hilite') document.execCommand('hiliteColor', false, '#ffe9a8');
      else document.execCommand(c, false, null);
      save();
      setTimeout(show, 0);
    });
  });
  bar.querySelectorAll('button[data-size]').forEach((b) => {
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (!restore()) return;
      sizePt = Math.max(8, Math.min(48, sizePt + (b.dataset.size === 'inc' ? 1 : -1)));
      try { document.execCommand('styleWithCSS', false, false); } catch (_) {}
      document.execCommand('fontSize', false, '7');
      (savedEl || bodyEl).querySelectorAll('font[size="7"]').forEach((f) => {
        f.removeAttribute('size'); f.style.fontSize = sizePt + 'pt';
      });
      $('ft2-size').textContent = sizePt + 'pt';
      save();
      setTimeout(show, 0);
    });
  });
})();

setupImageResize(() => save());

window.api.onDataChanged((d) => {
  if (!d) return;
  const a = document.activeElement;
  if (a && (a.isContentEditable || a.tagName === 'INPUT')) return;
  const m = (d.memos || []).find((x) => x.id === memoId);
  if (m) { memo = m; titleEl.innerHTML = m.title || ''; bodyEl.innerHTML = m.content || ''; }
});

load();
