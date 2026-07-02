'use strict';
/* 앱 아이콘 생성기 — 깔끔한 파스텔 노트(핑크 헤더 + 회색 글줄) 아이콘을
 * build/icon.png(256) 과 build/icon.ico(256, PNG 내장)로 출력한다.
 * 외부 라이브러리 없이 순수 Node(zlib)로 PNG/ICO를 직접 인코딩. 실행: node scripts/make-icon.js */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SS = 2;            // 슈퍼샘플 배율(안티에일리어싱)
const N = 256;           // 최종 크기
const W = N * SS, H = N * SS;
const buf = new Uint8ClampedArray(W * H * 4); // RGBA

function setPx(x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  const na = a / 255, ia = 1 - na;
  buf[i] = r * na + buf[i] * ia;
  buf[i + 1] = g * na + buf[i + 1] * ia;
  buf[i + 2] = b * na + buf[i + 2] * ia;
  buf[i + 3] = Math.max(buf[i + 3], a);
}
// 모서리 반경(상/하 개별)을 가진 사각형 채우기 — 512 스케일 좌표
function fillRR(x, y, w, h, rt, rb, color) {
  x *= SS; y *= SS; w *= SS; h *= SS; rt *= SS; rb *= SS;
  for (let py = Math.floor(y); py < y + h; py++) {
    for (let px = Math.floor(x); px < x + w; px++) {
      let inside = true;
      const cxL = x + rt, cxR = x + w - rt;
      const cbL = x + rb, cbR = x + w - rb;
      if (py < y + rt) {
        if (px < cxL && Math.hypot(px - cxL, py - (y + rt)) > rt) inside = false;
        else if (px > cxR && Math.hypot(px - cxR, py - (y + rt)) > rt) inside = false;
      } else if (py > y + h - rb) {
        if (px < cbL && Math.hypot(px - cbL, py - (y + h - rb)) > rb) inside = false;
        else if (px > cbR && Math.hypot(px - cbR, py - (y + h - rb)) > rb) inside = false;
      }
      if (inside) setPx(px, py, color);
    }
  }
}

// ── 그리기 (256 기준 좌표) ── (회색 노트)
const HEADER = [154, 161, 169, 255];    // 헤더(중간 회색)
const BORDER = [216, 220, 224, 255];    // 바깥 테두리(연회색)
const CARD = [253, 253, 253, 255];      // 카드(거의 흰색)
const LINE = [196, 200, 206, 255];      // 글줄(연회색)

fillRR(20, 24, 216, 208, 34, 34, BORDER);  // 바깥 테두리
fillRR(24, 28, 208, 200, 30, 30, CARD);    // 카드
fillRR(24, 28, 208, 54, 30, 0, HEADER);    // 상단 회색 헤더(위만 둥글게)
// 본문 글줄 3개(마지막은 짧게)
fillRR(48, 118, 160, 12, 6, 6, LINE);
fillRR(48, 150, 160, 12, 6, 6, LINE);
fillRR(48, 182, 104, 12, 6, 6, LINE);

// ── 512 → 256 다운샘플(2x2 평균) ──
const out = Buffer.alloc(N * N * 4);
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
      const i = ((y * SS + dy) * W + (x * SS + dx)) * 4;
      r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
    }
    const n = SS * SS, o = (y * N + x) * 4;
    out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n);
    out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
  }
}

// ── PNG 인코딩 ──
function crc32(bufIn) {
  let c = ~0;
  for (let i = 0; i < bufIn.length; i++) {
    c ^= bufIn[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // 필터 없음
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit, RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const png = encodePng(out, N, N);

// ── ICO 인코딩(256 PNG 내장, Vista+) ──
function encodeIco(pngBuf) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(1, 4);
  const ent = Buffer.alloc(16);
  ent[0] = 0; ent[1] = 0;            // 너비/높이 0 = 256
  ent[2] = 0; ent[3] = 0;            // 색/예약
  ent.writeUInt16LE(1, 4);           // 플레인
  ent.writeUInt16LE(32, 6);          // 비트수
  ent.writeUInt32LE(pngBuf.length, 8);
  ent.writeUInt32LE(6 + 16, 12);     // 오프셋
  return Buffer.concat([dir, ent, pngBuf]);
}
const ico = encodeIco(png);

const dir = path.join(__dirname, '..', 'build');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon.png'), png);
fs.writeFileSync(path.join(dir, 'icon.ico'), ico);
console.log('wrote build/icon.png (' + png.length + 'B), build/icon.ico (' + ico.length + 'B)');
