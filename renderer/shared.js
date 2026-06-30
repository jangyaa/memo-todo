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
  // 빈 글머리에서 Enter → 목록 한 단계 빠져나감(최상위면 글머리 제거)
  if (e.key === 'Enter' && !e.shiftKey) {
    const li = liOf();
    if (li && li.textContent.trim() === '') {
      e.preventDefault();
      document.execCommand('outdent');
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
