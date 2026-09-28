// 런타임 알고리즘 검증: 템플릿 점수로 런 분할 k를 결정하는 방식 테스트
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const IMG_DIR = 'C:/Workspace/Number/img';
const NW = 12, NH = 16;

const TRUTH = {
  '1.png': { left: '1', right: '9999' },
  '2.png': { left: '1', right: '4999' },
  '3.png': { left: '2501', right: '4999' },
  '4.png': { left: '2501', right: '3749' },
  '5.png': { left: '2501', right: '3124' },
  '6.png': { left: '2813', right: '3124' },
  '7.png': { left: '2813', right: '2967' },
};

const templates = JSON.parse(fs.readFileSync(path.join(__dirname, 'templates.json'), 'utf8'));

function hexToGrid(hex) {
  const grid = new Array(NW * NH).fill(0);
  for (let i = 0; i < hex.length; i++) {
    const v = parseInt(hex[i], 16);
    for (let j = 0; j < 4; j++) grid[i * 4 + j] = (v >> (3 - j)) & 1;
  }
  return grid;
}
const TGRIDS = {};
for (const d of Object.keys(templates)) TGRIDS[d] = templates[d].map(hexToGrid);

function isYellow(r, g, b) {
  return r > 120 && g > 100 && b < 130 && (r - b) > 60 && (g - b) > 50;
}

function matchGrid(grid) {
  let best = { digit: '?', score: -1 };
  for (const d of Object.keys(TGRIDS)) {
    for (const t of TGRIDS[d]) {
      let same = 0;
      for (let i = 0; i < grid.length; i++) if (grid[i] === t[i]) same++;
      const score = same / grid.length;
      if (score > best.score) best = { digit: d, score };
    }
  }
  return best;
}

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

// 런을 k등분했을 때 각 슬라이스의 템플릿 매칭 평균 점수
function bestSplit(mask, width, run) {
  let best = { k: 1, avg: -1, digits: '' };
  for (let k = 1; k <= 4; k++) {
    const W = run.x1 - run.x0 + 1;
    let sum = 0, digits = '';
    let ok = true;
    for (let i = 0; i < k; i++) {
      const g = {
        x0: run.x0 + Math.round(i * W / k),
        x1: run.x0 + Math.round((i + 1) * W / k) - 1,
        y0: run.y0, y1: run.y1
      };
      if (g.x1 < g.x0) { ok = false; break; }
      const m = matchGrid(normalize(mask, width, g));
      digits += m.digit;
      sum += m.score;
    }
    if (!ok) continue;
    const avg = sum / k;
    if (avg > best.avg) best = { k, avg, digits };
  }
  return best;
}

let totalOK = 0, totalFail = 0;
for (const file of Object.keys(TRUTH)) {
  const png = PNG.sync.read(fs.readFileSync(path.join(IMG_DIR, file)));
  const { width, height, data } = png;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (isYellow(data[i], data[i + 1], data[i + 2])) mask[y * width + x] = 1;
    }
  }
  // 런 추출
  const colCount = new Array(width).fill(0);
  for (let x = 0; x < width; x++) {
    let c = 0;
    for (let y = 0; y < height; y++) if (mask[y * width + x]) c++;
    colCount[x] = c;
  }
  const runs = [];
  let s = -1;
  for (let x = 0; x < width; x++) {
    if (colCount[x] > 0 && s < 0) s = x;
    if (s >= 0 && (colCount[x] === 0 || x === width - 1)) {
      const e = colCount[x] === 0 ? x - 1 : x;
      if (e >= s) {
        let y0 = Infinity, y1 = -1;
        for (let xx = s; xx <= e; xx++) {
          for (let y = 0; y < height; y++) {
            if (mask[y * width + xx]) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
        }
        runs.push({ x0: s, x1: e, y0, y1 });
      }
      s = -1;
    }
  }
  // 높이 필터
  const maxH = Math.max(...runs.map(r => r.y1 - r.y0 + 1));
  const filtered = runs.filter(r => (r.y1 - r.y0 + 1) >= maxH * 0.6);

  // 런별 최적 분할
  let digitsSeq = [];
  const items = [];
  filtered.forEach(r => {
    const b = bestSplit(mask, width, r);
    items.push({ x0: r.x0, x1: r.x1, digits: b.digits, k: b.k, avg: b.avg });
  });

  // 최대 간격으로 2 숫자 분리 (글자 단위로 펼친 후)
  const flat = [];
  items.forEach(it => {
    const W = it.x1 - it.x0 + 1;
    for (let i = 0; i < it.k; i++) {
      flat.push({
        x0: it.x0 + Math.round(i * W / it.k),
        x1: it.x0 + Math.round((i + 1) * W / it.k) - 1,
        digit: it.digits[i]
      });
    }
  });
  flat.sort((a, b) => a.x0 - b.x0);
  let bi = -1, bg = -1;
  for (let i = 0; i < flat.length - 1; i++) {
    const gap = flat[i + 1].x0 - flat[i].x1;
    if (gap > bg) { bg = gap; bi = i; }
  }
  const left = flat.slice(0, bi + 1).map(f => f.digit).join('');
  const right = flat.slice(bi + 1).map(f => f.digit).join('');

  const ok = left === TRUTH[file].left && right === TRUTH[file].right;
  if (ok) totalOK++; else totalFail++;
  console.log(file + ' -> ' + left + ' ~ ' + right + '  ' + (ok ? 'OK' : 'FAIL (정답 ' + TRUTH[file].left + ' ~ ' + TRUTH[file].right + ')'));
}
console.log('\n런타임 알고리즘 정확도: ' + totalOK + '/' + (totalOK + totalFail));