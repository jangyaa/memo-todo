'use strict';

/* =========================================================================
 * 공용 유틸 (메인 창 app.js + 메모 상세 창 editor.js 공유)
 * 색상 변환 / 테마 팔레트 / 마크다운 글머리 / 이미지 리사이즈
 * ========================================================================= */

/* ----- 색상 변환 ----- */
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function hexToRgb(hex) {
  hex = String(hex).replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  const h = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return '#' + h(r) + h(g) + h(b);
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s, l };
}
function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360; s = clamp01(s); l = clamp01(l);
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: hue2rgb(p, q, h + 1 / 3) * 255, g: hue2rgb(p, q, h) * 255, b: hue2rgb(p, q, h - 1 / 3) * 255 };
}
function hslHex(h, s, l) { const { r, g, b } = hslToRgb(h, s, l); return rgbToHex(r, g, b); }
function hsvToRgb(h, s, v) {
  h = (((h % 360) + 360) % 360) / 60; s = clamp01(s); v = clamp01(v);
  const i = Math.floor(h), f = h - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return { r: m[0] * 255, g: m[1] * 255, b: m[2] * 255 };
}
function hsvToHex(h, s, v) { const { r, g, b } = hsvToRgb(h, s, v); return rgbToHex(r, g, b); }
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0; const s = max === 0 ? 0 : d / max, v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s, v };
}

/* ----- 테마 팔레트 ----- */
// 주 강조색(타이틀바/핀딥/인디케이터)은 고른 색 그대로, 나머지는 색상/채도 기반 옅은 파스텔
function deriveTheme(baseHex) {
  const { r, g, b } = hexToRgb(baseHex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const darker = hslHex(h, s, clamp01(l - 0.06));
  const aura =
    `radial-gradient(90% 70% at 20% 15%, ${hslHex(h, clamp01(s * 0.5), 0.93)} 0%, transparent 55%), ` +
    `radial-gradient(90% 70% at 82% 85%, ${hslHex(h + 14, clamp01(s * 0.45), 0.95)} 0%, transparent 55%)`;
  const map = {
    '--bg': hslHex(h, clamp01(s * 0.35), 0.975),
    '--panel': '#ffffff',
    '--ink': hslHex(h, 0.10, 0.30),
    '--ink-soft': hslHex(h, 0.10, 0.61),
    '--line': hslHex(h, clamp01(s * 0.30), 0.93),
    '--pink': hslHex(h, clamp01(s * 0.55), 0.88),
    '--pink-deep': baseHex,
    '--pink-soft': hslHex(h, clamp01(s * 0.45), 0.955),
    '--titlebar': `linear-gradient(180deg, ${baseHex}, ${darker})`,
    '--indicator': baseHex,
    '--bg-aura': aura,
    '--bg-pattern': 'none'
  };
  [0, 16, 38, -15, 28, -8].forEach((dh, i) => {
    map['--c' + i] = hslHex(h + dh, clamp01(s * 0.50), 0.955);
    map['--a' + i] = hslHex(h + dh, clamp01(s * 0.60), 0.72);
  });
  return map;
}
const CUSTOM_VARS = ['--bg', '--panel', '--ink', '--ink-soft', '--line', '--pink',
  '--pink-deep', '--pink-soft', '--titlebar', '--indicator', '--bg-aura', '--bg-pattern',
  '--c0', '--c1', '--c2', '--c3', '--c4', '--c5', '--a0', '--a1', '--a2', '--a3', '--a4', '--a5'];
function clearCustomTheme() {
  CUSTOM_VARS.forEach((v) => document.body.style.removeProperty(v));
  const appBg = document.getElementById('app-bg');
  if (appBg) { appBg.style.backgroundImage = ''; appBg.style.display = 'none'; }
}
function applyCustomTheme(color, bgImage) {
  clearCustomTheme();
  const map = deriveTheme(color);
  Object.entries(map).forEach(([k, v]) => document.body.style.setProperty(k, v));
  const appBg = document.getElementById('app-bg');
  if (bgImage && appBg) {
    appBg.style.backgroundImage = `url("${bgImage}")`;
    appBg.style.display = 'block';
  }
}
// settings.custom 기준으로 테마 적용(메인/상세 창 공용)
function applyThemeSettings(s) {
  s = s || {};
  if (s.custom && s.custom.color) applyCustomTheme(s.custom.color, s.custom.bgImage);
  else clearCustomTheme();
}

/* ----- 마크다운 글머리 단축 -----
 * '- '/'* ' 불릿, '1. ' 번호, 'ㅁ '/'[] ' 체크박스, Tab 들여쓰기,
 * 빈 글머리에서 Enter/Backspace → 목록 빠져나감. persistCb는 변경 후 저장 콜백. */
function handleMarkdownKey(e, body, persistCb) {
  const liOf = () => {
    let n = window.getSelection().anchorNode;
    n = n && (n.nodeType === 1 ? n : n.parentElement);
    return n && n.closest ? n.closest('li') : null;
  };
  const ulOf = () => {
    let n = window.getSelection().anchorNode;
    n = n && (n.nodeType === 1 ? n : n.parentElement);
    return n && n.closest ? n.closest('ul,ol') : null;
  };
  const persist = () => setTimeout(() => persistCb(), 0);

  if (e.key === 'Tab') {
    const li = liOf();
    if (li) {
      e.preventDefault();
      // 첫 항목은 들여쓰기 불가(브라우저가 커서를 이탈시키는 오류 방지)
      if (e.shiftKey) document.execCommand('outdent');
      else if (li.previousElementSibling) document.execCommand('indent');
      persist();
      return true;
    }
    return false;
  }
  // 빈 글머리에서 Enter → 목록 빠져나감(중첩은 한 단계 위로, 최상위는 글머리 제거)
  if (e.key === 'Enter' && !e.shiftKey) {
    const li = liOf();
    if (li && li.textContent.trim() === '') {
      e.preventDefault();
      const list = li.parentElement;
      const nested = list && list.parentElement && list.parentElement.closest &&
        list.parentElement.closest('li');
      if (nested) {
        document.execCommand('outdent');
      } else if (list) {
        // 최상위: 목록에서 확실히 빼내고(빈 글머리 제거) 새 문단으로
        const div = document.createElement('div');
        div.innerHTML = '<br>';
        list.parentNode.insertBefore(div, list.nextSibling);
        li.remove();
        if (!list.children.length) list.remove();
        const sel = window.getSelection();
        const rr = document.createRange();
        rr.setStart(div, 0); rr.collapse(true);
        sel.removeAllRanges(); sel.addRange(rr);
      }
      persist();
      return true;
    }
    return false;
  }
  // 빈 글머리에서 Backspace → 글머리 제거
  if (e.key === 'Backspace') {
    const li = liOf();
    if (li && li.textContent.trim() === '') {
      e.preventDefault();
      document.execCommand('outdent');
      persist();
      return true;
    }
    return false;
  }
  if (e.key !== ' ') return false;
  const sel = window.getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const r = sel.getRangeAt(0);
  const node = r.startContainer;
  if (node.nodeType !== 3) return false;
  const before = node.textContent.slice(0, r.startOffset);

  let kind = null, check = false;
  if (before === '-' || before === '*') kind = 'ul';
  else if (before === 'ㅁ' || before === '[]') { kind = 'ul'; check = true; }
  else if (/^\d+\.$/.test(before)) kind = 'ol';
  if (!kind) return false;

  e.preventDefault();
  node.deleteData(0, before.length);
  const li = liOf();
  if (li) {
    // 이미 목록 안: 첫 항목이 아니면 들여쓰기(중첩). 첫 항목이면 그대로 둠(오류 방지)
    if (li.previousElementSibling) document.execCommand('indent');
  } else {
    document.execCommand(kind === 'ol' ? 'insertOrderedList' : 'insertUnorderedList');
  }
  if (check) { const ul = ulOf(); if (ul && ul.tagName === 'UL') ul.classList.add('md-check'); }
  persist();
  return true;
}

/* ----- 글꼴 목록 ----- */
const FONTS = [
  { id: '', name: '기본' },
  { id: "'Pretendard','Apple SD Gothic Neo',sans-serif", name: 'Pretendard' },
  { id: "'Malgun Gothic','맑은 고딕',sans-serif", name: '맑은 고딕' },
  { id: "'NanumGothic','나눔고딕',sans-serif", name: '나눔고딕' },
  { id: "'NanumMyeongjo','바탕',serif", name: '명조/바탕' },
  { id: "'Gulim','굴림',sans-serif", name: '굴림' },
  { id: "'Courier New',monospace", name: '고정폭' }
];

/* ----- 선택 시 뜨는 서식 툴바 (메인 앱 + 상세 창 공용) -----
 * config: { selector, persist(savedBody), scrollEl, lockIndex } → hide 함수 반환 */
function setupFormatToolbar(config) {
  const sel0 = config.selector;
  const persistCb = config.persist || function () {};
  const bar = document.getElementById('format-toolbar');
  const colors = document.getElementById('ft-colors');
  const fontSel = document.getElementById('ft-font');
  const sizeVal = document.getElementById('ft-size-val');
  const PALETTE = [
    { c: '#4a4148' }, { c: '#9aa0b0' },
    { v: '--pink-deep' }, { v: '--indicator' }, { v: '--pink' }
  ];
  colors.innerHTML = '';
  PALETTE.forEach((p) => {
    const d = document.createElement('button');
    d.className = 'ft-color';
    if (p.v) { d.style.background = `var(${p.v})`; d.dataset.var = p.v; }
    else { d.style.background = p.c; d.dataset.color = p.c; }
    colors.appendChild(d);
  });
  fontSel.innerHTML = '';
  FONTS.forEach((f) => {
    const o = document.createElement('option');
    o.value = f.id; o.textContent = f.name;
    fontSel.appendChild(o);
  });

  let savedRange = null, savedBody = null, sizePt = 14;

  function currentBody() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    let node = sel.anchorNode;
    node = node && (node.nodeType === 1 ? node : node.parentElement);
    return (node && node.closest && node.closest(sel0)) || null;
  }
  function hide() {
    bar.classList.remove('open');
    if (config.lockIndex) document.body.classList.remove('ft-open');
    document.getElementById('ft-colorpop').classList.remove('open');
    document.getElementById('ft-divpop').classList.remove('open');
    savedRange = null; savedBody = null;
  }
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
    if (config.lockIndex) document.body.classList.add('ft-open');
    const bw = bar.offsetWidth || 240;
    let left = rect.left + rect.width / 2 - bw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
    let top = rect.top - bar.offsetHeight - 8;
    if (top < 4) top = rect.bottom + 8;
    bar.style.left = left + 'px';
    bar.style.top = top + 'px';
  }
  function restoreSelection() {
    if (!savedRange) return false;
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(savedRange);
    return true;
  }
  function persist() { if (savedBody) persistCb(savedBody); }

  document.addEventListener('mouseup', () => setTimeout(showForSelection, 0));
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key.startsWith('Arrow')) showForSelection();
  });
  if (config.scrollEl) config.scrollEl.addEventListener('scroll', hide);
  // 서식창 밖(에디터블 밖) 좌클릭 시 닫고 선택 해제
  document.addEventListener('mousedown', (e) => {
    if (bar.contains(e.target) ||
        document.getElementById('ft-colorpop').contains(e.target) ||
        document.getElementById('ft-divpop').contains(e.target)) return;
    if (!(e.target.closest && e.target.closest(sel0))) {
      hide();
      const s = window.getSelection(); if (s) s.removeAllRanges();
    }
  });

  function applySizePt(pt) {
    if (!restoreSelection() || !savedBody) return;
    sizePt = Math.max(8, Math.min(48, pt));
    try { document.execCommand('styleWithCSS', false, false); } catch (_) {}
    document.execCommand('fontSize', false, '7');
    savedBody.querySelectorAll('font[size="7"]').forEach((f) => {
      f.removeAttribute('size'); f.style.fontSize = sizePt + 'pt';
    });
    sizeVal.textContent = sizePt + 'pt';
    persist();
    setTimeout(showForSelection, 0);
  }
  function run(cmd, value) {
    if (!restoreSelection() || !savedBody) return;
    try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
    if (cmd === 'hilite') document.execCommand('hiliteColor', false, '#ffe9a8');
    else if (cmd === 'quote') {
      const sel = window.getSelection();
      let n = sel.anchorNode; n = n && (n.nodeType === 1 ? n : n.parentElement);
      document.execCommand('formatBlock', false,
        (n && n.closest && n.closest('blockquote')) ? 'div' : 'blockquote');
    } else if (cmd === 'hr') document.execCommand('insertHorizontalRule', false, null);
    else document.execCommand(cmd, false, value || null);
    persist();
    setTimeout(showForSelection, 0);
  }

  const imageFile = document.getElementById('ft-image-file');
  bar.querySelectorAll('button[data-cmd]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (btn.dataset.cmd === 'hr') { toggleDivPop(btn); return; }
      if (btn.dataset.cmd === 'image') { imageFile.click(); return; }
      run(btn.dataset.cmd);
    });
  });
  imageFile.addEventListener('change', () => {
    const f = imageFile.files[0];
    imageFile.value = '';
    if (!f || !savedBody) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (!restoreSelection() || !savedBody) return;
      document.execCommand('insertHTML', false, `<img src="${reader.result}" style="max-width:100%"><br>`);
      persist();
      setTimeout(showForSelection, 0);
    };
    reader.readAsDataURL(f);
  });

  const divPop = document.getElementById('ft-divpop');
  const DIV_HTML = {
    solid: '<hr style="border:none;border-top:1px solid #c4b3bc;margin:8px 0">',
    dashed: '<hr style="border:none;border-top:1px dashed #b9a8b0;margin:8px 0">',
    dotted: '<hr style="border:none;border-top:2px dotted #b9a8b0;margin:8px 0">',
    thick: '<hr style="border:none;border-top:3px solid #c4b3bc;margin:8px 0">',
    double: '<hr style="border:none;border-top:3px double #b9a8b0;margin:8px 0">',
    short: '<hr style="border:none;border-top:2px solid #c4b3bc;width:40%;margin:8px auto">'
  };
  function toggleDivPop(btn) {
    if (divPop.classList.contains('open')) { divPop.classList.remove('open'); return; }
    divPop.classList.add('open');
    const r = btn.getBoundingClientRect();
    const cr = divPop.getBoundingClientRect();
    let x = r.left, y = r.bottom + 4;
    if (x + cr.width > window.innerWidth - 8) x = window.innerWidth - 8 - cr.width;
    if (y + cr.height > window.innerHeight - 8) y = r.top - cr.height - 4;
    divPop.style.left = Math.max(8, x) + 'px';
    divPop.style.top = Math.max(8, y) + 'px';
  }
  divPop.querySelectorAll('.ftd').forEach((b) => {
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (!restoreSelection() || !savedBody) return;
      document.execCommand('insertHTML', false, DIV_HTML[b.dataset.divstyle]);
      persist();
      divPop.classList.remove('open');
      setTimeout(showForSelection, 0);
    });
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
    let col = d.dataset.color;
    if (!col && d.dataset.var) col = getComputedStyle(document.documentElement).getPropertyValue(d.dataset.var).trim();
    if (col) run('foreColor', col);
  });
  const colorPop = document.getElementById('ft-colorpop');
  const grid = document.getElementById('ftc-grid');
  const hexInput = document.getElementById('ftc-hex');
  const GRID = [
    '#000000', '#5a5560', '#9a8f96', '#c9c2c7', '#ffffff',
    '#e0667f', '#ec96b3', '#f6c0d4', '#c79bab', '#8b6cff',
    '#7fa7e0', '#4a90d9', '#3aa39a', '#86c79a', '#bde85a',
    '#e0ad57', '#e58a5a', '#b5713a'
  ];
  grid.innerHTML = '';
  GRID.forEach((c) => {
    const sw = document.createElement('button');
    sw.className = 'ftc-sw'; sw.style.background = c; sw.dataset.color = c;
    grid.appendChild(sw);
  });
  function openColorPop() {
    colorPop.classList.add('open');
    const br = bar.getBoundingClientRect();
    const ar = document.getElementById('ft-addcolor').getBoundingClientRect();
    const cr = colorPop.getBoundingClientRect();
    let x = br.right + 8;
    if (x + cr.width > window.innerWidth - 8) x = br.left - cr.width - 8;
    if (x < 8) x = Math.max(8, window.innerWidth - cr.width - 8);
    let y = ar.top - 4;
    if (y + cr.height > window.innerHeight - 8) y = window.innerHeight - cr.height - 8;
    colorPop.style.left = x + 'px';
    colorPop.style.top = Math.max(8, y) + 'px';
  }
  document.getElementById('ft-addcolor').addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (colorPop.classList.contains('open')) colorPop.classList.remove('open');
    else openColorPop();
  });
  grid.addEventListener('mousedown', (e) => {
    const sw = e.target.closest('.ftc-sw');
    if (!sw) return;
    e.preventDefault();
    run('foreColor', sw.dataset.color);
    colorPop.classList.remove('open');
  });
  hexInput.addEventListener('mousedown', (e) => e.stopPropagation());
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      let v = hexInput.value.trim();
      if (/^#?[0-9a-fA-F]{3,6}$/.test(v)) {
        if (v[0] !== '#') v = '#' + v;
        run('foreColor', v); hexInput.value = ''; colorPop.classList.remove('open');
      }
    }
  });
  fontSel.addEventListener('mousedown', (e) => e.stopPropagation());
  fontSel.addEventListener('change', () => { run('fontName', fontSel.value); });

  return hide;
}

/* ----- 이미지 리사이즈 -----
 * contenteditable 안의 <img>를 클릭하면 우하단 핸들이 떠 드래그로 폭 조절. */
function setupImageResize(persistCb) {
  const handle = document.createElement('div');
  handle.className = 'img-resize-handle';
  handle.style.display = 'none';
  document.body.appendChild(handle);
  let target = null, dragging = false, startX = 0, startW = 0;

  function place() {
    if (!target) { handle.style.display = 'none'; return; }
    const r = target.getBoundingClientRect();
    handle.style.display = 'block';
    handle.style.left = (r.right - 7) + 'px';
    handle.style.top = (r.bottom - 7) + 'px';
  }
  document.addEventListener('click', (e) => {
    if (e.target === handle) return;
    const img = e.target.closest && e.target.closest('img');
    if (img && img.closest('[contenteditable]')) {
      target = img; place();
    } else { target = null; handle.style.display = 'none'; }
  });
  handle.addEventListener('pointerdown', (e) => {
    if (!target) return;
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = target.getBoundingClientRect().width;
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
  });
  document.addEventListener('pointermove', (e) => {
    if (!dragging || !target) return;
    const w = Math.max(40, Math.round(startW + (e.clientX - startX)));
    target.style.width = w + 'px';
    target.style.height = 'auto';
    place();
  });
  document.addEventListener('pointerup', () => {
    if (dragging) { dragging = false; if (persistCb) persistCb(); }
  });
  window.addEventListener('scroll', () => { if (target) place(); }, true);
}
