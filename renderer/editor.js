'use strict';

/* 메모 상세 편집 창 — 앱 디자인/테마 재사용 + 선택 시 서식 툴바(메인과 동일) */
const memoId = new URLSearchParams(location.search).get('id');
const $ = (id) => document.getElementById(id);
const titleEl = $('ed-title');
const bodyEl = $('ed-body');
const tagsEl = $('ed-tags');
const timesEl = $('ed-times');
const card = $('ed-card');
let memo = null;

// 하단바 시간 표시 — 최신 수정 시각만 "YY.MM.DD  HH:MM"
function fmtEdited(ts) {
  const d = new Date(ts || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getFullYear() % 100)}.${p(d.getMonth() + 1)}.${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function renderTimes() {
  if (!memo || !timesEl) return;
  timesEl.textContent = fmtEdited(memo.updatedAt || memo.createdAt);
}

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

let edSettings = {};
async function load() {
  const data = await window.api.loadData();
  edSettings = (data && data.settings) || {};
  applyThemeSettings(edSettings);
  setSharedSettings(edSettings); // 서식 프리셋(글자색/형광) 공유
  // 상세창의 프리셋 변경은 최신 데이터에 병합 저장(본창은 data:changed로 연동)
  setPresetPersist(async (key, list) => {
    const latest = await window.api.loadData();
    latest.settings = latest.settings || {};
    latest.settings[key] = list.slice();
    edSettings = latest.settings;
    await window.api.saveData(latest);
  });
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
  renderTimes();
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
    m.updatedAt = Date.now();
    if (!m.createdAt) m.createdAt = m.updatedAt;
    memo.updatedAt = m.updatedAt; memo.createdAt = m.createdAt;
    renderTimes();
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

setupImageControls(() => save());
setupUndo(bodyEl, () => save()); // Ctrl+Z 실행취소(이미지 삽입/리사이즈/삭제/이동 포함)
setupHrClickSelect(bodyEl); // 구분선 클릭 시 선택 → Backspace로 삭제

/* 편집창(상단 서식 메뉴 + 하단 편집바) — 편집 시작 시 함께 슬라이드, 바깥 클릭 시 닫힘 */
(function setupEditMenu() {
  const menu = $('ed-menu');
  const bottom = $('ed-bottombar');
  setupBlogToolbar(menu, bodyEl, () => save(), $('ed-inserts'));
  const openBars = () => { menu.classList.add('open'); bottom.classList.add('open'); };
  const closeBars = () => { menu.classList.remove('open'); bottom.classList.remove('open'); };
  document.addEventListener('focusin', (e) => {
    if (e.target.closest && e.target.closest('#ed-body, #ed-title, #ed-bottombar')) openBars();
  });
  document.addEventListener('mousedown', (e) => {
    if (menu.contains(e.target) || bottom.contains(e.target)) return;
    if (e.target.closest && (e.target.closest('#ed-body, #ed-title') ||
        e.target.closest('#format-toolbar') || e.target.closest('.ft-hlpop') ||
        e.target.closest('.wheel-pop') || e.target.closest('.fontdd-list') ||
        e.target.closest('.ft-divpop') || e.target.closest('.img-toolbar'))) return;
    closeBars();
  });
})();

window.api.onDataChanged((d) => {
  if (!d) return;
  // 테마/서식 프리셋은 편집 중이어도 실시간 반영(본창 테마 변경 즉시 적용)
  edSettings = d.settings || {};
  applyThemeSettings(edSettings);
  setSharedSettings(edSettings);
  const a = document.activeElement;
  if (a && (a.isContentEditable || a === bodyEl || a === titleEl || a.tagName === 'INPUT')) return; // 편집 중엔 본문 갱신만 보류
  const m = (d.memos || []).find((x) => x.id === memoId);
  if (m) {
    memo = m;
    if (!Array.isArray(memo.tags)) memo.tags = [];
    titleEl.innerHTML = m.title || '';
    bodyEl.innerHTML = m.content || '';
    renderTags();
    renderTimes();
    const t = plainTitle(m.title) || '메모';
    $('ed-titletext').textContent = t;
  }
});

// 본창에서 테마색을 드래그로 조정하는 동안 실시간 미리보기(저장 전), null 이면 원복
window.api.onThemePreview((color) => {
  if (color) applyCustomTheme(color, (edSettings.custom && edSettings.custom.bgImage) || null);
  else applyThemeSettings(edSettings);
});

load();
