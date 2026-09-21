import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('selected app font is loaded on demand before fallback',async()=>{
  const [html,loader,runtime,markup,css]=await Promise.all([
    read('index.html'),
    read('src/fixed-ui-font-loader.js'),
    read('src/fixed-ui-runtime-3.js'),
    read('src/fixed-ui-markup-3.js'),
    read('src/fixed-ui-source-2.css')
  ]);

  assert.match(html,/fixed-ui-font-loader\.js\?v=font-auto-load-20260921/);
  assert.doesNotMatch(html,/fonts\.googleapis\.com\/css2\?family=Be\+Vietnam\+Pro/);

  assert.match(loader,/document\.fonts\.check/);
  assert.match(loader,/fonts\.googleapis\.com\/css2\?family=Be\+Vietnam\+Pro/);
  assert.match(loader,/fonts\.googleapis\.com\/css2\?family=Geist/);
  assert.match(loader,/cdn\.openai\.com\/common\/fonts\/openai-sans/);
  assert.match(loader,/\[400, 'Regular'\]/);
  assert.match(loader,/\[500, 'Medium'\]/);
  assert.match(loader,/\[600, 'Semibold'\]/);
  assert.match(loader,/\[700, 'Bold'\]/);
  assert.match(loader,/OpenAISans-\$\{file\}\.woff2/);
  assert.match(loader,/font-display:\s*swap/);
  assert.match(loader,/localStorage\.getItem\('APP_FONT_CHOICE'\)/);

  assert.match(runtime,/TAPHOA_FONT_LOADER\?\.ensure\(choice\)/);
  assert.match(runtime,/geist:\s*'"Geist", "Geist Sans"/);
  assert.match(css,/\.font-choice-geist\{font-family:"Geist","Geist Sans"/);
  assert.match(markup,/Thiếu font trên máy sẽ tự tải; chỉ dùng fallback khi không tải được\./);
});
