import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../kh/index.html',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/taphoa-stock-check/index.ts',import.meta.url),'utf8');
const low=html.toLowerCase();
const edgeLow=edge.toLowerCase();

test('customer mini app stays compact and keeps products, quantities, orders and debt in one shell',()=>{
  for(const needle of [
    'data-tab="hang"','data-tab="don"','data-tab="no"',
    "p.get('nguon')","p.get('muc')","p.get('don')",
    'tất cả','đã mua','gợi ý',
    'v21-quote','taphoa-public-debt','taphoa-stock-check',
    'mini=1','data-order','<span>gửi kiểm hàng</span>','id="share-nv"',
    'font-size:18px;font-weight:700','font-size:15px;font-weight:400',
    "action:'update'",
    'xóa / nhập lại',
    '.product-stock{grid-column:2;grid-row:1 / span 2',
    'data-stock-footer hidden',
    "stock+'?kh='+encodeuricomponent(kh)",
    "json.stringify({kh,action:'update',items})",
    "json.stringify({kh,action:'update',items:[]})",
    "const [quoteresponse,stockresponse]=await promise.all([",
    "if(!quotedata||!stockdata)",
    'max-height:min(72dvh,620px)',
    'width:min(428px,100%)',
    '.list-scroll{flex:1 1 auto',
    "row.hidden=!show",
    "const sources=[['all','tất cả'],...sourcerows()]",
    "localecompare(string(b.product_name||''),'vi',{sensitivity:'base',numeric:true})",
    '.nav[data-active="true"]::after{background:#111827}',
    'background:#1e293b',
    'class="status-foot"','border:1px solid #111827',
  ])assert.ok(low.includes(needle),needle);

  for(const forbidden of [
    'font:800 13px inherit',
    'async function loadquote()',
    'data-product-count',
    ' sản phẩm</div></div></div>',
    'data-tab="kiemhang"',
    'xem trước nhân viên',
    'data-stock-copy',
    '<div class="brand">taphoa</div>',
    'const stocktoken=',
    'xem giá · đã mua · gợi ý · nhập số lượng khi cần',
    'xem đơn đã giao và chi tiết từng đơn',
    'xem số còn nợ/còn dư và lịch sử giao dịch',
    '<div class="product-meta"><span class="tag">',
    'xem chi tiết đơn</div></button>',
    "query=e.target.value;renderhang();",
    'signin','login','localstorage','document.cookie'
  ])assert.equal(low.includes(forbidden),false,forbidden);

  assert.ok(edgeLow.includes('url.searchparams.get("kh")'));
  assert.ok(edgeLow.includes('body?.kh'));
  assert.ok(edge.includes('&tab=hang'));
  assert.equal(edge.includes('&tab=hang&t='),false);
  assert.equal(edge.includes('&tab=kiemhang&t='),false);

  assert.ok(low.includes("const legacystocktab=requestedtab==='kiemhang';"));
  assert.ok(low.includes("const legacystocktoken=p.has('t');"));
  assert.ok(low.includes('if(legacystocktab||legacystocktoken)updateurl();'));
});
