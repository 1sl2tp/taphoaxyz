import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../admin-gia.html',import.meta.url),'utf8');
const start=page.indexOf('    // SPEC-ADMIN-MARKET-URL-PROTOCOL-20261101:');
const end=page.indexOf('    const plain=value=>',start);
assert.ok(start>=0&&end>start);
const ctx=vm.createContext({URL});
vm.runInContext(page.slice(start,end)+'globalThis.guard=safeMarketWebUrl;',ctx);
const guard=ctx.guard;
test('market images and external product links accept normal secure web URLs',()=>{
 assert.equal(guard('https://example.com/path?q=1'),'https://example.com/path?q=1');
 assert.equal(guard(' http://example.com/san-pham '),'http://example.com/san-pham');
 assert.equal(guard('HTTPS://example.com/a'),'https://example.com/a');
});
test('non-web and URL-control-character payloads never become clickable links',()=>{
 for(const raw of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>',
 'vbscript:msgbox(1)','file:///etc/passwd','//example.com/redirect',
 'https://example.com\n javascript:alert(1)','https://','',null,'https://example.com\u007f'])
 assert.equal(guard(raw),'',String(raw));
});
test('both marketplace lists, candidate links and thumbnail URLs use validated schemes',()=>{
 assert.match(page,/const imageUrl=safeMarketWebUrl\(item\.image_url\)/);
 assert.match(page,/const imageUrl=safeMarketWebUrl\(x\.image_url\)/);
 assert.match(page,/safeMarketWebUrl\(link\.url\)\?'<a class="market-link-open"/);
 assert.match(page,/safeMarketWebUrl\(x\.open_url\)\?'<a class="market-link-open"/);
 assert.match(page,/rel="noopener noreferrer"/);
});
