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
  // 한 단계 깊은 글머리로 중첩(이전 항목의 하위 목록으로 이동) — execCommand indent의 커서 이탈 버그 회피
  const nestLi = (li, check) => {
    const prev = li.previousElementSibling;
    if (!prev) return false; // 첫 항목은 중첩할 부모가 없음
    const listTag = (li.parentElement && li.parentElement.tagName === 'OL') ? 'ol' : 'ul';
    let sub = prev.lastElementChild;
    if (!sub || (sub.tagName !== 'UL' && sub.tagName !== 'OL')) {
      sub = document.createElement(listTag);
      prev.appendChild(sub);
    }
    if (check && sub.tagName === 'UL') sub.classList.add('md-check');
    sub.appendChild(li);
    // 커서를 li 콘텐츠 시작(체크박스 ::before 뒤)에 두고, 빈 항목은 <br>로 라인박스 보장
    // (빈 텍스트노드는 크롬이 정리해버려 입력이 안 되는 문제가 있어 <br>+요소오프셋 사용)
    const s = window.getSelection();
    const rr = document.createRange();
    if (li.textContent === '') {
      while (li.firstChild) li.removeChild(li.firstChild);
      li.appendChild(document.createElement('br'));
      rr.setStart(li, 0);
    } else {
      let tn = li.firstChild;
      if (tn.nodeType !== 3) { tn = document.createTextNode(''); li.insertBefore(tn, li.firstChild); }
      rr.setStart(tn, tn.length);
    }
    rr.collapse(true);
    s.removeAllRanges(); s.addRange(rr);
    return true;
  };
  // 글머리 li 시작점에 커서가 있는지
  const caretAtLiStart = (li) => {
    const s = window.getSelection();
    if (!s.rangeCount) return false;
    const r = s.getRangeAt(0);
    if (!r.collapsed) return false;
    const pre = r.cloneRange();
    pre.selectNodeContents(li); pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().length === 0;
  };

  if (e.key === 'Tab') {
    const li = liOf();
    if (li) {
      e.preventDefault();
      if (e.shiftKey) document.execCommand('outdent');
      else nestLi(li, li.parentElement && li.parentElement.classList.contains('md-check'));
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
    // 내용 있는 글머리 '맨 앞'에서 Enter → 텍스트는 아래 새 글머리로 내려가고, 원래 줄은 빈 일반 줄(글머리 사라짐)
    if (li && li.textContent.trim() !== '' && caretAtLiStart(li)) {
      e.preventDefault();
      const list = li.parentElement;
      const div = document.createElement('div');
      div.appendChild(document.createElement('br'));
      if (!li.previousElementSibling) {
        list.parentNode.insertBefore(div, list); // 첫 항목: 목록 앞에 빈 줄
      } else {
        // 중간 항목: li부터 끝까지를 새 목록으로 분리하고 그 앞에 빈 줄
        const newList = list.cloneNode(false);
        list.parentNode.insertBefore(div, list.nextSibling);
        list.parentNode.insertBefore(newList, div.nextSibling);
        let n = li;
        while (n) { const nx = n.nextElementSibling; newList.appendChild(n); n = nx; }
      }
      const rr = document.createRange();
      rr.setStart(li, 0); rr.collapse(true);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(rr);
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
  const after = node.textContent.slice(r.startOffset);

  let kind = null, check = false;
  if (before === '-' || before === '*') kind = 'ul';
  else if (before === 'ㅁ' || before === '[]') { kind = 'ul'; check = true; }
  else if (/^\d+\.$/.test(before)) kind = 'ol';
  if (!kind) return false;
  // 마커 뒤에 이미 텍스트가 있으면 변환하지 않음(줄 병합/이동 방지)
  if (after.trim() !== '') return false;

  e.preventDefault();
  node.deleteData(0, before.length);
  const li = liOf();
  if (li) {
    // 이미 목록 안에서 글머리 단축 → 한 단계 깊게 중첩
    const wantCheck = check || (li.parentElement && li.parentElement.classList.contains('md-check'));
    nestLi(li, wantCheck);
  } else {
    // execCommand의 목록 병합 버그(특히 숫자 목록이 이전 줄과 합쳐짐) 회피 → 현재 줄을 직접 목록으로 변환
    const list = document.createElement(kind === 'ol' ? 'ol' : 'ul');
    if (check) list.classList.add('md-check');
    const newLi = document.createElement('li');
    newLi.appendChild(document.createElement('br'));
    list.appendChild(newLi);
    // 현재 줄의 블록(요소)을 찾는다: body 바로 아래 자식까지 거슬러 올라감
    let blockEl = node.nodeType === 1 ? node : node.parentElement;
    while (blockEl && blockEl.parentElement && blockEl.parentElement !== body) blockEl = blockEl.parentElement;
    if (blockEl && blockEl !== body && blockEl.parentElement === body && blockEl.nodeType === 1) {
      body.replaceChild(list, blockEl); // 그 줄 블록만 목록으로 교체(이웃 줄과 병합 없음)
    } else if (node.parentNode) {
      node.parentNode.replaceChild(list, node); // 래퍼 없는 텍스트 줄
    } else {
      body.appendChild(list);
    }
    const rr = document.createRange();
    rr.setStart(newLi, 0); rr.collapse(true);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(rr);
  }
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

/* =========================================================================
 * 공용 서식 설정 — 글자색/형광 프리셋(창 간 공유 + 영속, 테마색 비연동)
 * ========================================================================= */
const DEFAULT_FONT_COLORS = ['#4a4148', '#9aa0b0', '#e0667f', '#8b6cff', '#3aa39a'];
const DEFAULT_HILITE_COLORS = ['#ffe9a8', '#ffd0e2', '#c9f0d8', '#cfe4ff', '#efd3ff'];
let SHARED_SETTINGS = {};
const _presetListeners = [];
function onPresetsChanged(fn) { _presetListeners.push(fn); }
function _firePresets() { _presetListeners.forEach((fn) => { try { fn(); } catch (_) {} }); }
function setSharedSettings(s) { SHARED_SETTINGS = s || {}; _firePresets(); }
function getFontColors() {
  const a = SHARED_SETTINGS.fontColors;
  return Array.isArray(a) && a.length ? a.slice() : DEFAULT_FONT_COLORS.slice();
}
function getHiliteColors() {
  const a = SHARED_SETTINGS.hiliteColors;
  return Array.isArray(a) && a.length ? a.slice() : DEFAULT_HILITE_COLORS.slice();
}
// 프리셋 저장 방식은 창마다 주입(메인=state.save 경로, 상세=loadData/saveData)
// 이렇게 해야 메인 창의 상태 저장이 프리셋을 덮어써 롤백되는 문제가 없음
let _presetPersist = null;
function setPresetPersist(fn) { _presetPersist = fn; }
// 프리셋 변경 → 즉시 로컬 반영 + 주입된 저장 경로로 영속화(다른 창은 data:changed로 갱신)
function persistPresetKey(key, list) {
  SHARED_SETTINGS[key] = list.slice();
  _firePresets();
  if (_presetPersist) { _presetPersist(key, list.slice()); return; }
  // 폴백: 주입 전이면 직접 저장
  (async () => {
    try {
      const data = await window.api.loadData();
      data.settings = data.settings || {};
      data.settings[key] = list.slice();
      await window.api.saveData(data);
    } catch (_) {}
  })();
}

/* ----- 색 추가 팝오버 (SV 사각형 + 색상 슬라이더, 테마 피커와 동일 방식 / RGB·스포이드 없음) ----- */
let _wheelPop = null;
function openColorWheel(anchorEl, initHex, onPick) {
  if (!_wheelPop) {
    _wheelPop = document.createElement('div');
    _wheelPop.className = 'wheel-pop';
    _wheelPop.innerHTML =
      '<div class="cw-sv"><span class="cw-sv-thumb"></span></div>' +
      '<div class="cw-hue"><span class="cw-hue-thumb"></span></div>' +
      '<div class="cw-foot">' +
      '<span class="cw-prev"></span>' +
      '<input type="text" class="cw-hex" placeholder="#hex 코드" maxlength="7" />' +
      '<button type="button" class="cw-ok">추가</button>' +
      '</div>';
    document.body.appendChild(_wheelPop);
    document.addEventListener('mousedown', (e) => {
      if (_wheelPop._open && !_wheelPop.contains(e.target) && e.target !== _wheelPop._anchor &&
          !(_wheelPop._anchor && _wheelPop._anchor.contains(e.target))) closeColorWheel();
    });
  }
  const pop = _wheelPop;
  const sv = pop.querySelector('.cw-sv');
  const svThumb = pop.querySelector('.cw-sv-thumb');
  const hue = pop.querySelector('.cw-hue');
  const hueThumb = pop.querySelector('.cw-hue-thumb');
  const prev = pop.querySelector('.cw-prev');
  const hexEl = pop.querySelector('.cw-hex');
  const okBtn = pop.querySelector('.cw-ok');
  const iv = rgbToHsv(...(function (o) { return [o.r, o.g, o.b]; })(hexToRgb(initHex || '#e0667f')));
  let H = iv.h, S = iv.s, V = iv.v;
  const curHex = () => hsvToHex(H, S, V);

  function sync() {
    sv.style.background =
      'linear-gradient(to top, #000, transparent), ' +
      'linear-gradient(to right, #fff, ' + hslHex(H, 1, 0.5) + ')';
    svThumb.style.left = (S * 100) + '%';
    svThumb.style.top = ((1 - V) * 100) + '%';
    svThumb.style.background = curHex();
    hueThumb.style.left = (H / 360 * 100) + '%';
    prev.style.background = curHex();
    hexEl.value = curHex();
  }
  const drag = (el, handler) => {
    let on = false;
    el.addEventListener('pointerdown', (e) => { on = true; try { el.setPointerCapture(e.pointerId); } catch (_) {} handler(e); });
    el.addEventListener('pointermove', (e) => { if (on) handler(e); });
    el.addEventListener('pointerup', () => { on = false; });
  };
  drag(sv, (e) => {
    const r = sv.getBoundingClientRect();
    S = clamp01((e.clientX - r.left) / r.width);
    V = clamp01(1 - (e.clientY - r.top) / r.height);
    sync();
  });
  drag(hue, (e) => {
    const r = hue.getBoundingClientRect();
    H = clamp01((e.clientX - r.left) / r.width) * 360;
    sync();
  });
  hexEl.onmousedown = (e) => e.stopPropagation();
  hexEl.oninput = () => {
    let v = hexEl.value.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
      if (v[0] !== '#') v = '#' + v;
      const hv = rgbToHsv(...(function (o) { return [o.r, o.g, o.b]; })(hexToRgb(v)));
      H = hv.h; S = hv.s; V = hv.v; sync();
    }
  };
  const confirm = () => {
    let v = hexEl.value.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(v)) { if (v[0] !== '#') v = '#' + v; onPick(v); }
    else onPick(curHex());
    closeColorWheel();
  };
  okBtn.onmousedown = (e) => { e.preventDefault(); confirm(); };
  hexEl.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } };

  sync();
  pop._open = true; pop._anchor = anchorEl; pop.classList.add('open');
  const ar = anchorEl.getBoundingClientRect();
  const pr = pop.getBoundingClientRect();
  let x = ar.left, y = ar.bottom + 6;
  if (x + pr.width > window.innerWidth - 8) x = window.innerWidth - 8 - pr.width;
  if (y + pr.height > window.innerHeight - 8) y = ar.top - pr.height - 6;
  pop.style.left = Math.max(8, x) + 'px';
  pop.style.top = Math.max(8, y) + 'px';
}
function closeColorWheel() { if (_wheelPop) { _wheelPop.classList.remove('open'); _wheelPop._open = false; } }

/* ----- 커스텀 글꼴 드롭다운(기본 select 대체, 각 항목을 해당 폰트로 미리보기) ----- */
function buildFontDropdown(mountEl, opts) {
  mountEl.innerHTML = '';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'fontdd-btn';
  const lbl = document.createElement('span'); lbl.className = 'fontdd-lbl'; lbl.textContent = '기본';
  const car = document.createElement('span'); car.className = 'fontdd-car'; car.textContent = '▾';
  btn.append(lbl, car); mountEl.appendChild(btn);
  const list = document.createElement('div'); list.className = 'fontdd-list';
  FONTS.forEach((f) => {
    const it = document.createElement('button');
    it.type = 'button'; it.className = 'fontdd-item'; it.textContent = f.name;
    it.style.fontFamily = f.id || 'inherit'; it.dataset.id = f.id;
    it.addEventListener('mousedown', (e) => {
      e.preventDefault();
      lbl.textContent = f.name; lbl.style.fontFamily = f.id || 'inherit';
      list.classList.remove('open');
      if (opts.onPick) opts.onPick(f.id);
    });
    list.appendChild(it);
  });
  document.body.appendChild(list);
  function open() {
    if (opts.restore) opts.restore();
    const r = btn.getBoundingClientRect();
    // 리스트는 버튼 폭 이상으로, 폰트명이 잘리거나 세로로 쪼개지지 않게 내용에 맞춰 늘어남
    list.style.minWidth = r.width + 'px';
    list.classList.add('open');
    const lr = list.getBoundingClientRect();
    let top = r.bottom + 4;
    if (top + lr.height > window.innerHeight - 8) top = r.top - lr.height - 4;
    let left = r.left;
    if (left + lr.width > window.innerWidth - 8) left = window.innerWidth - 8 - lr.width;
    list.style.left = Math.max(8, left) + 'px';
    list.style.top = Math.max(8, top) + 'px';
  }
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (list.classList.contains('open')) list.classList.remove('open'); else open();
  });
  document.addEventListener('mousedown', (e) => {
    if (!list.contains(e.target) && !btn.contains(e.target)) list.classList.remove('open');
  });
}

/* ----- 편집 가능한 색상 프리셋 스와치 (글자색/형광 공용)
 * opts: { get():hex[], save(hex[]), onApply(hex), initFor():hex } — 꾹 눌러 삭제, + 로 추가 ----- */
function buildPresetSwatches(container, opts) {
  function render() {
    container.innerHTML = '';
    const list = opts.get();
    list.forEach((c) => {
      const wrap = document.createElement('span'); wrap.className = 'swz';
      const sw = document.createElement('button');
      sw.type = 'button'; sw.className = 'swz-color'; sw.style.background = c; sw.dataset.color = c;
      const del = document.createElement('span'); del.className = 'swz-del'; del.textContent = '−';
      wrap.append(sw, del);
      let lpTimer = null, long = false;
      sw.addEventListener('mousedown', (e) => {
        e.preventDefault();
        long = false;
        // 꾹 누르면 삭제 모드 → 모든 스와치에 − 배지 표시
        lpTimer = setTimeout(() => { long = true; container.classList.add('del-mode'); }, 500);
        const up = () => {
          clearTimeout(lpTimer);
          document.removeEventListener('mouseup', up);
          if (!long) { opts.onApply(c); if (opts.closeOnApply) opts.closeOnApply(); }
        };
        document.addEventListener('mouseup', up);
      });
      del.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        opts.save(opts.get().filter((x) => x !== c));
      });
      container.appendChild(wrap);
    });
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'swz-add'; add.textContent = '+'; add.title = '색 추가';
    add.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const init = (opts.initFor && opts.initFor()) || list[list.length - 1] || '#e0667f';
      openColorWheel(add, init, (hex) => {
        const nl = opts.get();
        if (!nl.includes(hex)) opts.save([...nl, hex]);
      });
    });
    container.appendChild(add);
  }
  // 스와치 밖 클릭 시 삭제 모드 해제
  document.addEventListener('mousedown', (e) => {
    if (!container.contains(e.target)) container.classList.remove('del-mode');
  });
  onPresetsChanged(render);
  render();
}

/* ----- 선택 영역이 이미 형광(배경색) 처리됐는지 ----- */
function selectionHilited(editable) {
  const s = window.getSelection();
  if (!s.rangeCount) return false;
  let n = s.anchorNode; n = n && (n.nodeType === 1 ? n : n.parentElement);
  while (n && n !== editable && n !== document.body) {
    const bg = n.style && n.style.backgroundColor;
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return true;
    n = n.parentElement;
  }
  return false;
}

/* ----- 선택 시 뜨는 서식 툴바 (메인 앱 + 상세 창 공용) -----
 * config: { selector, persist(savedBody), scrollEl, lockIndex } → hide 함수 반환 */
function setupFormatToolbar(config) {
  const sel0 = config.selector;
  const persistCb = config.persist || function () {};
  const bar = document.getElementById('format-toolbar');
  const colors = document.getElementById('ft-colors');
  const fontMount = document.getElementById('ft-font');
  const sizeVal = document.getElementById('ft-size-val');

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
    hlPop.classList.remove('open');
    closeColorWheel();
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
    if (bar.contains(e.target) || hlPop.contains(e.target) ||
        (_wheelPop && _wheelPop.contains(e.target)) ||
        (e.target.closest && e.target.closest('.fontdd-list')) ||
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
    if (cmd === 'quote') {
      const sel = window.getSelection();
      let n = sel.anchorNode; n = n && (n.nodeType === 1 ? n : n.parentElement);
      document.execCommand('formatBlock', false,
        (n && n.closest && n.closest('blockquote')) ? 'div' : 'blockquote');
    } else if (cmd === 'hr') document.execCommand('insertHorizontalRule', false, null);
    else document.execCommand(cmd, false, value || null);
    persist();
    setTimeout(showForSelection, 0);
  }
  // 형광펜: 색 지정 적용 / 이미 적용된 곳이면 해제(토글)
  function applyHilite(hex) {
    if (!restoreSelection() || !savedBody) return;
    try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
    document.execCommand('hiliteColor', false, hex);
    persist();
    setTimeout(showForSelection, 0);
  }
  function removeHilite() {
    if (!restoreSelection() || !savedBody) return;
    try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
    document.execCommand('hiliteColor', false, 'transparent');
    persist();
    setTimeout(showForSelection, 0);
  }
  // 글자색 적용 — 구분선을 텍스트처럼 취급: 선택 범위에 걸친 hr 색도 함께 변경
  function applyFontColor(hex) {
    if (!restoreSelection() || !savedBody) return;
    let hrTouched = false;
    savedBody.querySelectorAll('hr').forEach((hr) => {
      let hit = false;
      try { hit = savedRange.intersectsNode(hr); }
      catch (_) { const a = savedRange && savedRange.commonAncestorContainer; hit = !!(a && a.contains && a.contains(hr)); }
      if (hit) { hr.style.borderTopColor = hex; hr.style.color = hex; hrTouched = true; }
    });
    // 구분선만 선택된 경우가 아니면 텍스트에도 색 적용
    if (!(hrTouched && savedRange.toString().replace(/\s+/g, '') === '')) {
      try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
      document.execCommand('foreColor', false, hex);
    }
    persist();
    setTimeout(showForSelection, 0);
  }

  const imageFile = document.getElementById('ft-image-file');
  bar.querySelectorAll('button[data-cmd]').forEach((btn) => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (btn.dataset.cmd === 'hr') { toggleDivPop(btn); return; }
      if (btn.dataset.cmd === 'image') { imageFile.click(); return; }
      if (btn.dataset.cmd === 'hilite') {
        restoreSelection();
        if (selectionHilited(savedBody)) removeHilite();
        else openHlPop(btn);
        return;
      }
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
      insertNoteImage(savedBody, reader.result, () => { persist(); setTimeout(showForSelection, 0); });
    };
    reader.readAsDataURL(f);
  });

  const divPop = document.getElementById('ft-divpop');
  // 기본 구분선 색은 현재 폰트 색(currentColor)을 따름 → 이후 색 스와치로 개별 변경 가능
  const DIV_HTML = {
    solid: '<hr style="border:none;border-top:1px solid currentColor;margin:8px 0">',
    dashed: '<hr style="border:none;border-top:1px dashed currentColor;margin:8px 0">',
    dotted: '<hr style="border:none;border-top:2px dotted currentColor;margin:8px 0">',
    thick: '<hr style="border:none;border-top:3px solid currentColor;margin:8px 0">',
    double: '<hr style="border:none;border-top:3px double currentColor;margin:8px 0">',
    short: '<hr style="border:none;border-top:2px solid currentColor;width:40%;margin:8px auto">'
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
  // 글자색 프리셋(테마 비연동, 편집 가능) — 클릭 적용 / 꾹 눌러 삭제 / + 로 컬러휠 추가
  buildPresetSwatches(colors, {
    get: getFontColors,
    save: (l) => persistPresetKey('fontColors', l),
    onApply: (hex) => applyFontColor(hex)
  });

  // 형광펜 색상 프리셋 팝오버(+ 추가)
  const hlPop = document.createElement('div');
  hlPop.className = 'ft-hlpop';
  const hlWrap = document.createElement('div');
  hlWrap.className = 'hl-swatches';
  hlPop.appendChild(hlWrap);
  document.body.appendChild(hlPop);
  buildPresetSwatches(hlWrap, {
    get: getHiliteColors,
    save: (l) => persistPresetKey('hiliteColors', l),
    onApply: (hex) => applyHilite(hex),
    initFor: () => '#ffe9a8',
    closeOnApply: () => hlPop.classList.remove('open')
  });
  function openHlPop(btn) {
    if (hlPop.classList.contains('open')) { hlPop.classList.remove('open'); return; }
    hlPop.classList.add('open');
    const r = btn.getBoundingClientRect();
    const cr = hlPop.getBoundingClientRect();
    let x = r.left, y = r.bottom + 6;
    if (x + cr.width > window.innerWidth - 8) x = window.innerWidth - 8 - cr.width;
    if (y + cr.height > window.innerHeight - 8) y = r.top - cr.height - 6;
    hlPop.style.left = Math.max(8, x) + 'px';
    hlPop.style.top = Math.max(8, y) + 'px';
  }
  hlPop.addEventListener('mousedown', (e) => {
    if (!e.target.closest('.swz-color') && !e.target.closest('.swz-add') && !e.target.closest('.swz-del')) e.preventDefault();
  });
  // 형광 팝오버가 열린 상태에서 서식창의 다른 버튼(또는 바깥)을 누르면 닫힘
  document.addEventListener('mousedown', (e) => {
    if (hlPop.contains(e.target) || (_wheelPop && _wheelPop.contains(e.target)) ||
        (e.target.closest && e.target.closest('button[data-cmd="hilite"]'))) return;
    hlPop.classList.remove('open');
  });

  // 커스텀 글꼴 드롭다운
  buildFontDropdown(fontMount, {
    restore: () => restoreSelection(),
    onPick: (id) => run('fontName', id)
  });

  return hide;
}

/* 편집영역에 삽입할 이미지 = figure(블럭) 한 줄에 이미지 1장(캡션 없음). */
function imageFigureHTML(src) {
  return '<figure class="note-img" contenteditable="false" style="text-align:center">' +
    '<img src="' + src + '" draggable="false"></figure>';
}
/* 옛 저장 콘텐츠 정리 — 예전 캡션(figcaption/.note-cap)·행(.img-row/.img-wrap) 구조를 제거하고
 * figure는 이미지 1장만 담게 재구성(여러 장이면 각자 자기 줄로 분리). 변경되면 true 반환. */
function normalizeNoteImages(root) {
  if (!root || !root.querySelectorAll) return false;
  let changed = false;
  root.querySelectorAll('figure.note-img').forEach((fig) => {
    if (!fig.querySelector('figcaption, .note-cap, .img-row, .img-wrap')) return; // 이미 새 구조면 손대지 않음
    const imgs = Array.prototype.slice.call(fig.querySelectorAll('img'));
    imgs.forEach((im) => im.removeAttribute('style')); // 옛 폭/높이 초기화(자연 크기 + CSS 제한)
    fig.innerHTML = '';
    if (imgs[0]) fig.appendChild(imgs[0]);
    let ref = fig;
    for (let i = 1; i < imgs.length; i++) { // 한 줄 여러 장 → 각자 자기 줄로 분리
      const nf = document.createElement('figure');
      nf.className = 'note-img'; nf.setAttribute('contenteditable', 'false'); nf.style.textAlign = 'center';
      nf.appendChild(imgs[i]);
      ref.parentNode.insertBefore(nf, ref.nextSibling); ref = nf;
    }
    changed = true;
  });
  return changed;
}
// 이미지 삽입: 커서 위치에 figure 1개(항상 자기 줄) + 뒤에 커서 자리(제로폭 공백).
function insertNoteImage(editable, src, doneCb) {
  try { editable.focus({ preventScroll: true }); } catch (_) { editable.focus(); }
  if (editable._undoSnapshot) editable._undoSnapshot(); // 삽입 전 상태 저장(Ctrl+Z)
  const sel = window.getSelection();
  let range = (sel && sel.rangeCount && editable.contains(sel.anchorNode)) ? sel.getRangeAt(0) : null;
  if (!range) { range = document.createRange(); range.selectNodeContents(editable); range.collapse(false); }
  range.deleteContents();
  const tmp = document.createElement('div');
  tmp.innerHTML = imageFigureHTML(src);
  const fig = tmp.firstElementChild;
  range.insertNode(fig);
  let after = fig.nextSibling;
  if (!after || after.nodeType !== 3) { after = document.createTextNode('​'); fig.parentNode.insertBefore(after, fig.nextSibling); }
  try { const r2 = document.createRange(); r2.setStart(after, 0); r2.collapse(true); sel.removeAllRanges(); sel.addRange(r2); } catch (_) {}
  if (doneCb) doneCb();
}

/* ----- 실행취소(Ctrl+Z)/다시실행(Ctrl+Shift+Z, Ctrl+Y) -----
 * 이미지 삽입/리사이즈/삭제/이동은 execCommand가 아니라 직접 DOM 조작이라 브라우저 기본 undo가
 * 안 먹는다. innerHTML 스냅샷 스택으로 편집영역 전체 undo/redo를 직접 구현.
 * 이미지 조작 직전엔 editable._undoSnapshot()으로 상태를 미리 저장한다. */
function setupUndo(editable, persistCb) {
  if (!editable || editable._undoSnapshot) return; // 중복 설치 방지
  const undo = [], redo = [];
  let last = editable.innerHTML, t = null;
  function commit() {
    const cur = editable.innerHTML;
    if (cur === last) return;
    undo.push(last); if (undo.length > 120) undo.shift();
    redo.length = 0; last = cur;
  }
  editable.addEventListener('input', () => { clearTimeout(t); t = setTimeout(commit, 350); });
  editable._undoSnapshot = () => { clearTimeout(t); commit(); };
  function restore(html) {
    editable.innerHTML = html; last = html;
    try { editable.focus({ preventScroll: true }); } catch (_) {}
    if (persistCb) persistCb();
  }
  editable.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      clearTimeout(t); commit();
      if (!undo.length) return;
      e.preventDefault();
      redo.push(editable.innerHTML);
      restore(undo.pop());
    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
      if (!redo.length) return;
      e.preventDefault();
      undo.push(editable.innerHTML);
      restore(redo.pop());
    }
  });
}

/* ----- 이미지 컨트롤 -----
 * 한 줄에 이미지 1장(figure). 클릭 시 정렬 툴바(좌/가운데/우) + 삭제 X + 리사이즈 핸들 + 편집모드 진입.
 * 드래그로 이동, 캡션 없음. */
function setupImageControls(persistCb) {
  const AL = {
    left: '<svg viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2"/><rect x="1" y="7" width="9" height="2"/><rect x="1" y="12" width="12" height="2"/></svg>',
    center: '<svg viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2"/><rect x="3.5" y="7" width="9" height="2"/><rect x="2" y="12" width="12" height="2"/></svg>',
    right: '<svg viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2"/><rect x="6" y="7" width="9" height="2"/><rect x="3" y="12" width="12" height="2"/></svg>'
  };
  const bar = document.createElement('div');
  bar.className = 'img-toolbar';
  bar.innerHTML =
    '<button data-al="left" title="왼쪽">' + AL.left + '</button>' +
    '<button data-al="center" title="가운데">' + AL.center + '</button>' +
    '<button data-al="right" title="오른쪽">' + AL.right + '</button>';
  bar.style.display = 'none';
  document.body.appendChild(bar);

  const del = document.createElement('button');
  del.className = 'img-del'; del.textContent = '✕'; del.title = '이미지 삭제';
  del.style.display = 'none';
  document.body.appendChild(del);

  const handle = document.createElement('div');
  handle.className = 'img-resize-handle';
  handle.style.display = 'none';
  document.body.appendChild(handle);

  let target = null, resizing = false, startX = 0, startW = 0;
  let mv = null, mvStartX = 0, mvStartY = 0, mvOn = false, justMoved = false;
  const figOf = (img) => (img && img.closest && img.closest('.note-img')) || null;
  const snapUndo = (node) => { const h = editableHostOf(node); if (h && h._undoSnapshot) h._undoSnapshot(); };
  function blockWidth(img) {
    // 반드시 편집영역(contenteditable=true) 폭 기준. figure는 contenteditable="false"라
    // closest('[contenteditable]')로 잡으면 리사이즈 중 폭이 같이 줄어 최소치로 폭주함.
    const ed = editableHostOf(img);
    return ((ed && ed.clientWidth) || 600) - 12;
  }
  function editableHostOf(node) {
    let el = node && (node.nodeType === 1 ? node : node.parentElement);
    while (el) {
      if (el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true')) return el;
      el = el.parentElement;
    }
    return null;
  }
  function place() {
    if (!target) { bar.style.display = 'none'; del.style.display = 'none'; handle.style.display = 'none'; return; }
    const r = target.getBoundingClientRect();
    bar.style.display = 'flex';
    bar.style.left = Math.max(6, r.left + r.width / 2 - bar.offsetWidth / 2) + 'px';
    bar.style.top = Math.max(6, r.top - bar.offsetHeight - 8) + 'px';
    del.style.display = 'flex';
    del.style.left = (r.right - 10) + 'px';
    del.style.top = (r.top - 10) + 'px';
    // 리사이즈 핸들은 모든(안쪽 포함) 선택 이미지에 표시. 하단 정렬이라 우하단 코너에 둠.
    {
      handle.style.display = 'block';
      handle.style.left = (r.right - 7) + 'px';
      handle.style.top = (r.bottom - 7) + 'px';
    }
  }
  function hide() { target = null; place(); }
  function enterEditAtImage(img) {
    const host = editableHostOf(img);
    if (!host) return;
    try { host.focus({ preventScroll: true }); } catch (_) { host.focus(); }
    const fig = figOf(img) || img;
    if (fig.parentNode) {
      try {
        const r = document.createRange();
        r.setStartAfter(fig); r.collapse(true);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      } catch (_) {}
    }
  }
  function caretAt(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (p) { const r = document.createRange(); r.setStart(p.offsetNode, p.offset); return r; }
    }
    return null;
  }

  document.addEventListener('click', (e) => {
    if (justMoved) { justMoved = false; e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (e.target === handle || e.target === del || bar.contains(e.target)) return;
    const img = e.target.closest && e.target.closest('img');
    if (img && img.closest('[contenteditable]')) {
      target = img; enterEditAtImage(img); place();
      return;
    }
    hide();
  }, true);

  // 정렬(좌/가운데/우) — 이미지 줄(figure)에 text-align 지정
  bar.querySelectorAll('button[data-al]').forEach((b) => {
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const fig = target && figOf(target);
      if (fig) { snapUndo(fig); fig.style.textAlign = b.dataset.al; if (persistCb) persistCb(); place(); }
    });
  });
  // 삭제 — 이미지(figure) 제거
  del.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (!target) return;
    snapUndo(target);
    const fig = figOf(target);
    if (fig) fig.remove(); else target.remove();
    hide();
    if (persistCb) persistCb();
  });
  // 리사이즈 — 선택 이미지 폭 조정(블럭 폭 초과 금지)
  handle.addEventListener('pointerdown', (e) => {
    if (!target) return;
    e.preventDefault();
    snapUndo(target);
    resizing = true;
    startX = e.clientX;
    startW = target.getBoundingClientRect().width;
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
  });
  document.addEventListener('pointermove', (e) => {
    if (!resizing || !target) return;
    const w = Math.max(40, Math.min(blockWidth(target), Math.round(startW + (e.clientX - startX))));
    target.style.width = w + 'px';
    target.style.height = 'auto';
    place();
  });
  document.addEventListener('pointerup', () => {
    if (resizing) { resizing = false; if (persistCb) persistCb(); }
  });

  // 이미지 위치 이동 — 포인터 드래그(복제 없이 이동)
  document.addEventListener('pointerdown', (e) => {
    if (resizing || e.target === handle || e.target === del || bar.contains(e.target)) return;
    const img = e.target.closest && e.target.closest('img');
    if (img && img.closest('[contenteditable]')) {
      mv = img; mvStartX = e.clientX; mvStartY = e.clientY; mvOn = false;
      try { img.setPointerCapture(e.pointerId); } catch (_) {}
    }
  });
  document.addEventListener('pointermove', (e) => {
    if (!mv) return;
    if (!mvOn && Math.hypot(e.clientX - mvStartX, e.clientY - mvStartY) > 5) {
      mvOn = true;
      (figOf(mv) || mv).style.opacity = '0.45';
      document.body.classList.add('img-moving');
      hide();
    }
    if (mvOn) e.preventDefault();
  });
  document.addEventListener('pointerup', (e) => {
    if (!mv) return;
    const el = figOf(mv) || mv;
    if (mvOn) {
      el.style.opacity = '';
      document.body.classList.remove('img-moving');
      const range = caretAt(e.clientX, e.clientY);
      // insertNode는 이미 붙어있는 노드를 자동으로 옮김(먼저 remove하면 range 오프셋이 어긋나 이동 실패)
      if (range && !el.contains(range.startContainer) && editableHostOf(range.startContainer)) {
        try { snapUndo(el); range.insertNode(el); if (persistCb) persistCb(); } catch (_) {}
      }
      justMoved = true; // 뒤이어 올 click 억제
    }
    mv = null; mvOn = false;
  });

  window.addEventListener('scroll', () => { if (target) place(); }, true);
  window.addEventListener('resize', () => { if (target) place(); });
}


/* 블로그식 가로 편집 툴바 (상세창 상단 슬라이드 메뉴) — 서식창의 모든 기능 포함.
 * menuEl 안에 버튼들을 만들고, editableEl의 커서/선택에 명령 적용. persistCb로 저장. */
function setupBlogToolbar(menuEl, editableEl, persistCb, insertBarEl) {
  let range = null, sizePt = 16;
  const ALIGN = {
    justifyLeft: '<svg viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2"/><rect x="1" y="7" width="9" height="2"/><rect x="1" y="12" width="12" height="2"/></svg>',
    justifyCenter: '<svg viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2"/><rect x="3.5" y="7" width="9" height="2"/><rect x="2" y="12" width="12" height="2"/></svg>',
    justifyRight: '<svg viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="2"/><rect x="6" y="7" width="9" height="2"/><rect x="3" y="12" width="12" height="2"/></svg>'
  };
  const IMG = '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="6" r="1.3"/><path d="M2.5 12 L6 8.5 L8.5 11 L11 7.5 L13.5 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  menuEl.innerHTML =
    '<div class="bt-row">' +
    '<button data-c="bold" title="굵게"><b>B</b></button>' +
    '<button data-c="italic" title="기울임"><i>I</i></button>' +
    '<button data-c="underline" title="밑줄"><u>U</u></button>' +
    '<button data-c="strikeThrough" title="취소선"><s>S</s></button>' +
    '<button data-c="hilite" title="형광펜"><svg viewBox="0 0 20 20"><path d="M4 13 L12 5 L15 8 L7 16 L4 16 Z"/><rect x="3" y="18" width="14" height="2" fill="#ffcf3f"/></svg></button>' +
    '<span class="bt-sep"></span>' +
    '<button data-sz="dec" title="작게">◀</button><span class="bt-size">16pt</span><button data-sz="inc" title="크게">▶</button>' +
    '<span class="bt-sep"></span>' +
    '<span class="bt-font"></span>' +
    '<span class="bt-sep"></span>' +
    '<button data-c="justifyLeft" title="왼쪽">' + ALIGN.justifyLeft + '</button>' +
    '<button data-c="justifyCenter" title="가운데">' + ALIGN.justifyCenter + '</button>' +
    '<button data-c="justifyRight" title="오른쪽">' + ALIGN.justifyRight + '</button>' +
    '</div>';
  // 인용구/구분선/이미지는 하단 편집바로 분리(상단바처럼 아이콘만)
  if (insertBarEl) {
    insertBarEl.innerHTML =
      '<button data-c="quote" title="인용구">❝</button>' +
      '<button data-c="hr" title="구분선">―</button>' +
      '<button data-ins="image" title="이미지">' + IMG + '</button>';
  }

  const saveR = () => {
    const s = window.getSelection();
    if (s.rangeCount && editableEl.contains(s.getRangeAt(0).startContainer)) range = s.getRangeAt(0).cloneRange();
  };
  editableEl.addEventListener('keyup', saveR);
  editableEl.addEventListener('mouseup', saveR);
  editableEl.addEventListener('input', saveR);
  const restore = () => { editableEl.focus(); if (range) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); } };
  const done = () => { if (persistCb) persistCb(); saveR(); };

  function run(cmd, val) {
    restore();
    try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
    if (cmd === 'hr') document.execCommand('insertHTML', false, '<hr style="border:none;border-top:1px solid currentColor;margin:8px 0">');
    else if (cmd === 'quote') {
      const s = window.getSelection(); let n = s.anchorNode; n = n && (n.nodeType === 1 ? n : n.parentElement);
      document.execCommand('formatBlock', false, (n && n.closest && n.closest('blockquote')) ? 'div' : 'blockquote');
    } else document.execCommand(cmd, false, val || null);
    done();
  }
  function applyHilite(hex) {
    restore();
    try { document.execCommand('styleWithCSS', false, true); } catch (_) {}
    document.execCommand('hiliteColor', false, hex);
    done();
  }
  menuEl.querySelectorAll('button[data-c]').forEach((b) => {
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (b.dataset.c === 'hilite') {
        restore();
        if (selectionHilited(editableEl)) applyHilite('transparent');
        else openHlPop(b);
        return;
      }
      run(b.dataset.c);
    });
  });
  // 크기
  const sizeLbl = menuEl.querySelector('.bt-size');
  menuEl.querySelectorAll('button[data-sz]').forEach((b) => {
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      restore();
      sizePt = Math.max(8, Math.min(48, sizePt + (b.dataset.sz === 'inc' ? 1 : -1)));
      try { document.execCommand('styleWithCSS', false, false); } catch (_) {}
      document.execCommand('fontSize', false, '7');
      editableEl.querySelectorAll('font[size="7"]').forEach((f) => { f.removeAttribute('size'); f.style.fontSize = sizePt + 'pt'; });
      sizeLbl.textContent = sizePt + 'pt';
      done();
    });
  });
  // 커스텀 글꼴 드롭다운
  buildFontDropdown(menuEl.querySelector('.bt-font'), {
    restore: () => restore(),
    onPick: (id) => run('fontName', id)
  });
  // 형광펜 색상 프리셋 팝오버(+ 추가) — 글자색 스와치는 상세편집창에서 제거
  const hlPop = document.createElement('div');
  hlPop.className = 'ft-hlpop';
  const hlWrap = document.createElement('div');
  hlWrap.className = 'hl-swatches';
  hlPop.appendChild(hlWrap);
  document.body.appendChild(hlPop);
  buildPresetSwatches(hlWrap, {
    get: getHiliteColors,
    save: (l) => persistPresetKey('hiliteColors', l),
    onApply: (hex) => applyHilite(hex),
    initFor: () => '#ffe9a8',
    closeOnApply: () => hlPop.classList.remove('open')
  });
  function openHlPop(btn) {
    if (hlPop.classList.contains('open')) { hlPop.classList.remove('open'); return; }
    hlPop.classList.add('open');
    const r = btn.getBoundingClientRect();
    const cr = hlPop.getBoundingClientRect();
    let x = r.left, y = r.bottom + 6;
    if (x + cr.width > window.innerWidth - 8) x = window.innerWidth - 8 - cr.width;
    if (y + cr.height > window.innerHeight - 8) y = r.top - cr.height - 6;
    hlPop.style.left = Math.max(8, x) + 'px';
    hlPop.style.top = Math.max(8, y) + 'px';
  }
  document.addEventListener('mousedown', (e) => {
    if (!hlPop.contains(e.target) && !(e.target.closest && e.target.closest('button[data-c="hilite"]')) &&
        !(_wheelPop && _wheelPop.contains(e.target))) hlPop.classList.remove('open');
  });
  // 하단 편집바: 인용구/구분선(run) + 이미지(파일 삽입)
  const imgInput = document.createElement('input');
  imgInput.type = 'file'; imgInput.accept = 'image/*'; imgInput.style.display = 'none';
  document.body.appendChild(imgInput);
  imgInput.addEventListener('change', () => {
    const f = imgInput.files[0]; imgInput.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { restore(); insertNoteImage(editableEl, reader.result, () => done()); };
    reader.readAsDataURL(f);
  });
  if (insertBarEl) {
    insertBarEl.querySelectorAll('button[data-c]').forEach((b) => {
      b.addEventListener('mousedown', (e) => { e.preventDefault(); run(b.dataset.c); });
    });
    const imgBtn = insertBarEl.querySelector('button[data-ins="image"]');
    if (imgBtn) imgBtn.addEventListener('mousedown', (e) => { e.preventDefault(); imgInput.click(); });
  }
}

/* 구분선(hr) 클릭 시 선택 → Backspace로 삭제 가능 */
function setupHrClickSelect(root) {
  root.addEventListener('click', (e) => {
    const hr = e.target.closest && e.target.closest('hr');
    if (!hr) return;
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNode(hr);
    sel.removeAllRanges();
    sel.addRange(r);
  });
}
