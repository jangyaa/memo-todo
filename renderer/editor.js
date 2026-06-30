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
  $('ed-titletext').textContent = t;
  titleEl.innerHTML = memo.title || '';
  bodyEl.innerHTML = memo.content || '';
}

// 커스텀 창 컨트롤
$('ed-min').addEventListener('click', () => window.api.windowControl('minimize'));
$('ed-max').addEventListener('click', () => window.api.windowControl('maximize'));
$('ed-close').addEventListener('click', () => window.api.windowControl('close'));

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!memo) return;
    const title = titleEl.innerHTML;
    const content = bodyEl.innerHTML;
    const t = plainTitle(title) || '메모';
    document.title = t;
    $('ed-titletext').textContent = t;
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

// 서식창: 메인 앱처럼 "텍스트 선택" 시 그 위치에 뜸
setupFormatToolbar({
  selector: '#ed-body, #ed-title',
  scrollEl: document.querySelector('.ed-scroll'),
  persist: () => save()
});

setupImageResize(() => save());
setupHrClickSelect(bodyEl); // 구분선 클릭 시 선택 → Backspace로 삭제

/* 편집창(블로그식 상단 삽입 메뉴) — 편집 시작 시 슬라이드, 바깥 클릭 시 닫힘 */
(function setupEditMenu() {
  const menu = $('ed-menu');
  let lastRange = null;
  const saveR = () => {
    const s = window.getSelection();
    if (s.rangeCount && bodyEl.contains(s.getRangeAt(0).startContainer)) lastRange = s.getRangeAt(0).cloneRange();
  };
  bodyEl.addEventListener('keyup', saveR);
  bodyEl.addEventListener('mouseup', saveR);
  bodyEl.addEventListener('input', saveR);
  function restoreR() {
    bodyEl.focus();
    if (lastRange) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(lastRange); }
  }
  // 편집 영역 포커스 시 슬라이드 다운, 바깥 클릭 시 닫기
  document.addEventListener('focusin', (e) => {
    if (e.target.closest && e.target.closest('#ed-body, #ed-title')) menu.classList.add('open');
  });
  document.addEventListener('mousedown', (e) => {
    if (menu.contains(e.target)) return;
    if (e.target.closest && (e.target.closest('#ed-body, #ed-title') ||
        e.target.closest('#format-toolbar') || e.target.closest('.ft-colorpop') ||
        e.target.closest('.ft-divpop'))) return;
    menu.classList.remove('open');
  });
  const imgInput = $('ed-img-file');
  menu.querySelectorAll('[data-ins]').forEach((b) => {
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const k = b.dataset.ins;
      if (k === 'image') { imgInput.click(); return; }
      restoreR();
      if (k === 'hr') document.execCommand('insertHorizontalRule');
      else if (k === 'quote') {
        const s = window.getSelection();
        let n = s.anchorNode; n = n && (n.nodeType === 1 ? n : n.parentElement);
        try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
        document.execCommand('formatBlock', false, (n && n.closest && n.closest('blockquote')) ? 'div' : 'blockquote');
      }
      save();
    });
  });
  imgInput.addEventListener('change', () => {
    const f = imgInput.files[0];
    imgInput.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      restoreR();
      document.execCommand('insertHTML', false, `<img src="${reader.result}" style="max-width:100%"><br>`);
      save();
    };
    reader.readAsDataURL(f);
  });
})();

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
    $('ed-titletext').textContent = t;
  }
});

load();
