// index.html에서 화면 캡처 기능 완전 제거
const fs = require('fs');
const htmlPath = 'C:/Workspace/Number/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');

const startMarker = '// ---------- 화면 캡처로 범위 지정 ----------';
const endMarker = '// ---------- 이벤트 ----------';

const s = html.indexOf(startMarker);
const e = html.indexOf(endMarker);
if (s === -1 || e === -1 || e < s) {
  console.error('마커를 찾을 수 없습니다. s=' + s + ' e=' + e);
  process.exit(1);
}
html = html.slice(0, s) + html.slice(e);

// 캡처 이벤트 리스너 제거
const capEvStart = html.indexOf("el.btnCapture.addEventListener('click', openCaptureModal);");
if (capEvStart !== -1) {
  const capEvEnd = html.indexOf('});', html.indexOf('el.btnCaptureRefresh.addEventListener'));
  if (capEvEnd === -1) { console.error('캡처 이벤트 끝을 못 찾음'); process.exit(1); }
  html = html.slice(0, capEvStart) + html.slice(capEvEnd + 3);
}

fs.writeFileSync(htmlPath, html);
console.log('제거 완료');