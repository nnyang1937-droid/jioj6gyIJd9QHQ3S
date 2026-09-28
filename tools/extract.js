// 숫자 템플릿 추출 스크립트
// img/N.png 들에서 노란 숫자 글리프를 분리해 0~9 템플릿 생성
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const IMG_DIR = 'C:/Workspace/Number/img';
const NW = 12, NH = 16; // 정규화 크기

// 각 이미지의 실제 값 (ground truth)
const TRUTH = {
  '1.png': { left: '1', right: '9999' },
  '2.png': { left: '1', right: '4999' },
  '3.png': { left: '2501', right: '4999' },
  '4.png': { left: '2501', right: '3749' },
  '5.png': { left: '2501', right: '3124' },
  '6.png': { left: '2813', right: '3124' },
  '7.png': { left: '2813', right: '2967' },
};

function isYellow(r, g, b) {
  return r > 120 && g > 100 && b < 130 && (r - b) > 60 && (g - b) > 50;
}

function analyze(png) {
  const { width, height, data } = png;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (isYellow(data[i], data[i + 1], data[i + 2])) mask[y * width + x] = 1;
    }
  }
  // 열 투영
  const colCount = new Array(width).fill(0);
  for (let x = 0; x < width; x++) {
    let c = 0;
    for (let y = 0; y < height; y++) if (mask[y * width + x]) c++;
    colCount[x] = c;
  }
  // 글리프 열 범위 (연속된 노란 열)
  const runs = [];
  let s = -1;
  for (let x = 0; x < width; x++) {
    if (colCount[x] > 0 && s < 0) s = x;
    if (s >= 0 && (colCount[x] === 0 || x === width - 1)) {
      const e = colCount[x] === 0 ? x - 1 : x;
      if (e >= s) runs.push({ x0: s, x1: e });
      s = -1;
    }
  }
  // 각 글리프의 세로 범위
  const glyphs = runs.map(r => {
    let y0 = Infinity, y1 = -1;
    for (let x = r.x0; x <= r.x1; x++) {
      for (let y = 0; y < height; y++) {
        if (mask[y * width + x]) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    return { x0: r.x0, x1: r.x1, y0, y1 };
  });
  return { mask, width, height, glyphs };
}

// 두 숫자 그룹으로 분리 (최대 간격 기준)
function splitGroups(glyphs) {
  if (glyphs.length < 2) return [glyphs];
  let best = -1, bi = -1;
  for (let i = 0; i < glyphs.length - 1; i++) {
    const gap = glyphs[i + 1].x0 - glyphs[i].x1;
    if (gap > best) { best = gap; bi = i; }
  }
  return [glyphs.slice(0, bi + 1), glyphs.slice(bi + 1)];
}

// 글리프를 NW×NH 이진 그리드로 정규화
function normalize(mask, width, glyph) {
  const gw = glyph.x1 - glyph.x0 + 1;
  const gh = glyph.y1 - glyph.y0 + 1;
  const out = new Array(NW * NH).fill(0);
  for (let y = 0; y < NH; y++) {
    for (let x = 0; x < NW; x++) {
      const sx = glyph.x0 + Math.floor(x * gw / NW);
      const sy = glyph.y0 + Math.floor(y * gh / NH);
      out[y * NW + x] = mask[sy * width + sx] ? 1 : 0;
    }
  }
  return out;
}

function gridToHex(grid) {
  let hex = '';
  for (let i = 0; i < grid.length; i += 4) {
    let v = 0;
    for (let j = 0; j < 4; j++) v = (v << 1) | (grid[i + j] || 0);
    hex += v.toString(16);
  }
  return hex;
}

// ---------- 메인 ----------
const templates = {}; // digit -> [hex, ...]
const allGlyphs = [];

// 1차 패스: 모든 런 너비 수집해 평균 글자 폭 추정
const allRuns = [];
for (const file of Object.keys(TRUTH)) {
  const png = PNG.sync.read(fs.readFileSync(path.join(IMG_DIR, file)));
  const an = analyze(png);
  an.glyphs.forEach(g => allRuns.push({ file, ...g }));
}
const totalRunW = allRuns.reduce((a, g) => a + (g.x1 - g.x0 + 1), 0);
const totalDigits = Object.values(TRUTH).reduce((a, t) => a + t.left.length + t.right.length, 0);
const AVG_W = totalRunW / totalDigits;
console.log('평균 글자 폭 추정: ' + AVG_W.toFixed(2) + 'px (런 ' + allRuns.length + '개, 총 글자 ' + totalDigits + ')');

// 런을 k개 균등 슬라이스로 분리
function splitRun(mask, width, glyph, k) {
  const out = [];
  const W = glyph.x1 - glyph.x0 + 1;
  for (let i = 0; i < k; i++) {
    out.push({
      x0: glyph.x0 + Math.round(i * W / k),
      x1: glyph.x0 + Math.round((i + 1) * W / k) - 1,
      y0: glyph.y0, y1: glyph.y1
    });
  }
  return out;
}

for (const file of Object.keys(TRUTH)) {
  const png = PNG.sync.read(fs.readFileSync(path.join(IMG_DIR, file)));
  const { mask, width, height, glyphs } = analyze(png);
  const truth = TRUTH[file];

  // "~"처럼 낮은 글리프 제외 (높이 필터: 최대 높이의 60% 미만 제거)
  const maxH = Math.max(...glyphs.map(g => g.y1 - g.y0 + 1));
  const filtered = glyphs.filter(g => (g.y1 - g.y0 + 1) >= maxH * 0.6);

  const groups = splitGroups(filtered);
  const leftGlyphs = groups[0], rightGlyphs = groups[1];

  // 각 그룹의 런을 글자 수에 맞게 분리
  function expandToDigits(groupGlyphs, digitStr) {
    const ks = groupGlyphs.map(g => Math.max(1, Math.round((g.x1 - g.x0 + 1) / AVG_W)));
    const sum = ks.reduce((a, b) => a + b, 0);
    if (sum === digitStr.length) {
      // 정확히 일치: 런별 분리
      const out = [];
      groupGlyphs.forEach((g, i) => out.push(...splitRun(mask, width, g, ks[i])));
      return out;
    }
    // 불일치: 그룹 전체 폭을 digit 수만큼 균등 슬라이스
    const x0 = groupGlyphs[0].x0, x1 = groupGlyphs[groupGlyphs.length - 1].x1;
    const span = x1 - x0 + 1;
    const out = [];
    for (let i = 0; i < digitStr.length; i++) {
      out.push({
        x0: x0 + Math.round(i * span / digitStr.length),
        x1: x0 + Math.round((i + 1) * span / digitStr.length) - 1,
        y0: Math.min(...groupGlyphs.map(g => g.y0)),
        y1: Math.max(...groupGlyphs.map(g => g.y1))
      });
    }
    return out;
  }

  const leftDigits = expandToDigits(leftGlyphs, truth.left);
  const rightDigits = expandToDigits(rightGlyphs, truth.right);

  console.log('--- ' + file + ' (' + width + 'x' + height + ') left=' + leftDigits.length + '/' + truth.left.length + ' right=' + rightDigits.length + '/' + truth.right.length);

  const seq = truth.left + truth.right;
  const all = leftDigits.concat(rightDigits);
  all.forEach((g, i) => {
    const digit = seq[i];
    const grid = normalize(mask, width, g);
    if (!templates[digit]) templates[digit] = [];
    templates[digit].push(gridToHex(grid));
    allGlyphs.push({ file, digit, gw: g.x1 - g.x0 + 1, gh: g.y1 - g.y0 + 1, grid });
  });
}

console.log('\n=== 템플릿 샘플 수 ===');
for (let d = 0; d <= 9; d++) {
  console.log(d + ': ' + (templates[d] ? templates[d].length : 0) + '개');
}

// 글리프 크기 분포
console.log('\n=== 글리프 크기 분포 ===');
const sizes = {};
allGlyphs.forEach(g => { const k = g.gw + 'x' + g.gh; sizes[k] = (sizes[k] || 0) + 1; });
console.log(sizes);

// ---------- 검증: 템플릿으로 다시 매칭 ----------
function hexToGrid(hex) {
  const grid = new Array(NW * NH).fill(0);
  for (let i = 0; i < hex.length; i++) {
    const v = parseInt(hex[i], 16);
    for (let j = 0; j < 4; j++) grid[i * 4 + j] = (v >> (3 - j)) & 1;
  }
  return grid;
}

function matchDigit(grid) {
  let best = { digit: '?', score: -1 };
  for (const d of Object.keys(templates)) {
    for (const hex of templates[d]) {
      const t = hexToGrid(hex);
      let same = 0;
      for (let i = 0; i < grid.length; i++) if (grid[i] === t[i]) same++;
      const score = same / grid.length;
      if (score > best.score) best = { digit: d, score };
    }
  }
  return best;
}

console.log('\n=== 검증 (자기 매칭 제외 전/포함) ===');
let pass = 0, fail = 0;
for (const g of allGlyphs) {
  const m = matchDigit(g.grid);
  const ok = m.digit === g.digit;
  if (ok) pass++; else fail++;
  if (!ok) console.log('  FAIL ' + g.file + ' 정답=' + g.digit + ' 예측=' + m.digit + ' score=' + m.score.toFixed(3));
}
console.log('정확도: ' + pass + '/' + (pass + fail));

// JSON 출력
fs.writeFileSync(path.join(__dirname, 'templates.json'), JSON.stringify(templates));
console.log('\ntemplates.json 저장 완료 (NW=' + NW + ', NH=' + NH + ')');