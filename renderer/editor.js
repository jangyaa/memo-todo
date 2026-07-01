'use strict';

/* 메모 상세 편집 창 — 앱 디자인/테마 재사용 + 선택 시 서식 툴바(메인과 동일) */
const memoId = new URLSearchParams(location.search).get('id');
const $ = (id) => document.getElementById(id);
const titleEl = $('ed-title');
const bodyEl = $('ed-body');
const tagsEl = $('ed-tags');
const card = $('ed-card');
let memo = null;

const BLOCK_COLORS = ['var(--c0)', 'var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];
const sortTags = (tags) => [...tags].sort((a, b) => a.localeCompare(b, 'ko'));
function accentVar(m) {
  const i = BLOCK_COLORS.indexOf(m && m.color);
  return `var(--a${i < 0 ? 0 : i})`;
}

function plainTitle(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  return (d.textContent || '').trim();
}

// 태그 바 (본 창과 동일) — 칩 + ＋태그 추가 입력, 하단 빈 곳 클릭 시 입력 활성화
function renderTags() {
  if (!memo) return;
  const accent = accentVar(memo);
  tagsEl.innerHTML = '';
  sortTags(memo.tags || []).forEach((t) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.style.background = `color-mix(in srgb, ${accent} 18%, transparent)`;
    chip.style.color = accent;
    chip.innerHTML = '#' + t + ' <b>×</b>';
    chip.querySelector('b').addEventListener('click', () => {
      memo.tags = (memo.tags || []).filter((x) => x !== t);
      save();
      renderTags();
    });
    tagsEl.appendChild(chip);
  });
  const tagAdd = document.createElement('input');
  tagAdd.className = 'tag-add';
  tagAdd.placeholder = '＋ 태그 추가';
  tagAdd.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    const t = tagAdd.value.trim().replace(/^#/, '');
    if (t && !(memo.tags || []).includes(t)) {
      memo.tags = sortTags([...(memo.tags || []), t]);
      save();
      renderTags();
      const inp = tagsEl.querySelector('.tag-add');
      if (inp) inp.focus(); // 연속 입력
    } else {
      tagAdd.value = '';
    }
  });
  tagsEl.appendChild(tagAdd);
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
  if (!Array.isArray(memo.tags)) memo.tags = [];
  titleEl.innerHTML = memo.title || '';
  bodyEl.innerHTML = memo.content || '';
  renderTags();
}

// 카드 하단 빈 곳 클릭 → 태그 입력 활성화 (본문/제목/입력/칩 제외)
card.addEventListener('mousedown', (e) => {
  if (e.target.closest('#ed-body') || e.target.closest('#ed-title') ||
      e.target.closest('input') || e.target.closest('.tag-chip')) return;
  const inp = tagsEl.querySelector('.tag-add');
  if (inp) { e.preventDefault(); inp.focus(); }
});

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
    m.tags = memo.tags || [];
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

/* 편집창(블로그식 상단 전체 서식 메뉴) — 편집 시작 시 슬라이드, 바깥 클릭 시 닫힘 */
(function setupEditMenu() {
  const menu = $('ed-menu');
  setupBlogToolbar(menu, bodyEl, () => save());
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
})();

window.api.onDataChanged((d) => {
  if (!d) return;
  const a = document.activeElement;
  if (a && (a.isContentEditable || a.tagName === 'INPUT')) return;
  const m = (d.memos || []).find((x) => x.id === memoId);
  if (m) {
    memo = m;
    if (!Array.isArray(memo.tags)) memo.tags = [];
    titleEl.innerHTML = m.title || '';
    bodyEl.innerHTML = m.content || '';
    renderTags();
    const t = plainTitle(m.title) || '메모';
    $('ed-titletext').textContent = t;
  }
});

load();
