'use strict';

/* 메모 별도 편집 창 (네이버 블로그풍 에디터) */
const memoId = new URLSearchParams(location.search).get('id');
const $ = (id) => document.getElementById(id);
const titleEl = $('ed-title');
const bodyEl = $('ed-body');

let memo = null;

async function load() {
  const data = await window.api.loadData();
  memo = (data && data.memos || []).find((m) => m.id === memoId);
  if (!memo) {
    document.querySelector('.ed-page').innerHTML =
      '<p style="color:#999;padding:20px 0">메모를 찾을 수 없습니다.</p>';
    return;
  }
  document.title = (memo.title || '메모');
  titleEl.value = memo.title || '';
  bodyEl.innerHTML = memo.content || '';
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!memo) return;
    const title = titleEl.value;
    const content = bodyEl.innerHTML;
    // 최신 데이터를 다시 읽어 해당 메모만 갱신(다른 변경 보존)
    const latest = await window.api.loadData();
    if (!latest || !Array.isArray(latest.memos)) return;
    const m = latest.memos.find((x) => x.id === memoId);
    if (!m) return;
    m.title = title;
    m.content = content;
    document.title = title || '메모';
    await window.api.saveData(latest);
  }, 300);
}

titleEl.addEventListener('input', save);
bodyEl.addEventListener('input', save);

function exec(cmd, value) {
  try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
  document.execCommand(cmd, false, value || null);
  bodyEl.focus();
  save();
}

document.querySelectorAll('.ed-toolbar [data-cmd]').forEach((btn) => {
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const cmd = btn.dataset.cmd;
    if (cmd === 'hr') { document.execCommand('insertHorizontalRule'); save(); return; }
    if (cmd === 'image') { $('ed-image').click(); return; }
    if (cmd === 'hilite') { exec('hiliteColor', '#ffe9a8'); return; }
    if (cmd === 'quote') {
      const sel = window.getSelection();
      let n = sel.anchorNode;
      n = n && (n.nodeType === 1 ? n : n.parentElement);
      exec('formatBlock', (n && n.closest && n.closest('blockquote')) ? 'div' : 'blockquote');
      return;
    }
    exec(cmd);
  });
});

// 글자 크기 (font[size=7] 트릭)
$('ed-size').addEventListener('change', () => {
  bodyEl.focus();
  try { document.execCommand('styleWithCSS', false, false); } catch (_) {}
  document.execCommand('fontSize', false, '7');
  bodyEl.querySelectorAll('font[size="7"]').forEach((f) => {
    f.removeAttribute('size');
    f.style.fontSize = $('ed-size').value;
  });
  save();
});

// 글자색
$('ed-color').addEventListener('input', () => exec('foreColor', $('ed-color').value));

// 이미지 삽입
$('ed-image').addEventListener('change', () => {
  const f = $('ed-image').files[0];
  $('ed-image').value = '';
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    bodyEl.focus();
    document.execCommand('insertHTML', false,
      `<img src="${reader.result}" style="max-width:100%"><br>`);
    save();
  };
  reader.readAsDataURL(f);
});

// 외부(메인 창)에서 변경 시 반영 — 편집 중이 아닐 때만
window.api.onDataChanged((d) => {
  if (!d) return;
  const active = document.activeElement;
  if (active && (active.isContentEditable || active.tagName === 'INPUT')) return;
  const m = (d.memos || []).find((x) => x.id === memoId);
  if (m) {
    memo = m;
    titleEl.value = m.title || '';
    bodyEl.innerHTML = m.content || '';
  }
});

load();
