// templates.json을 index.html의 placeholder에 주입
const fs = require('fs');
const htmlPath = 'C:/Workspace/Number/index.html';
const templates = fs.readFileSync('C:/Workspace/Number/tools/templates.json', 'utf8').trim();
let html = fs.readFileSync(htmlPath, 'utf8');

const marker = 'const DIGIT_TEMPLATES = /*__TEMPLATES__*/{};';
if (!html.includes(marker)) {
  console.error('placeholder를 찾을 수 없습니다');
  process.exit(1);
}
html = html.replace(marker, 'const DIGIT_TEMPLATES = ' + templates + ';');
fs.writeFileSync(htmlPath, html);
console.log('템플릿 주입 완료 (' + templates.length + ' bytes)');