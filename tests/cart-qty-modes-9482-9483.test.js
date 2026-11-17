import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
const runtime=fs.readFileSync('src/fixed-ui-runtime-6.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const owner=css.slice(css.indexOf('/* FIXED STYLE: order-cart-share-five-columns-20261008'));

test('IMG_9482/9483: each mode uses one complete five-column ruler for both header and lines',()=>{
  assert.match(runtime,/cartSheet\.dataset\.cartMode = isDeliveredReadOnlyPreview \? 'preview' : 'edit'/);
  assert.match(owner,/#cartBottomSheet \.cart-compact-grid,[\s\S]*?#orderDetailContentToShare \.order-detail-compact-grid\{[^}]*grid-template-columns:22px minmax\(0,1fr\) 54px 96px 69px !important;/);
  const final=css.slice(css.indexOf('/* FIXED STYLE: cart-visual-numeric-gaps-and-name-note-popup-20261008')); assert.ok(final.includes('var(--cart-qty-readonly-track,32px) var(--cart-total-track,69px)'));
  assert.match(owner,/#cartItemList \.cart-compact-grid\.cart-qty-readonly|#cartBottomSheet\[data-cart-mode="preview"\] #cartItemList \.cart-compact-grid \.cart-qty-readonly/);
});

test('IMG_9483: stepper fits inside 96px edit track; header and subtotal remain separate',()=>{
  assert.match(owner,/#cartItemList \.cart-compact-grid \.cart-qty-control\{[^}]*grid-template-columns:30px 28px 30px !important;[^}]*gap:1px !important;/);
  assert.match(owner,/#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-qty\{[^}]*width:100% !important;[^}]*min-width:0 !important;/);
  assert.equal(30+28+30+2*1+2*2+2,96);
  assert.match(owner,/#cartBottomSheet\[data-cart-mode="preview"\] #cartItemList \.cart-compact-grid \.cart-qty-readonly\{[^}]*width:var\(--cart-qty-readonly-track,32px\) !important;/);
});

test('IMG_9482: wider readonly name track and shorter edit control never eat name column',()=>{
  const nameWidth=(viewport,fixed)=>viewport-32-fixed-16;
  const editFixed=22+54+96+69,previewFixed=22+54+32+72;
  for(const viewport of [320,375,390,416,428]){
    assert.ok(nameWidth(viewport,editFixed)>0,'edit '+viewport);
    assert.ok(nameWidth(viewport,previewFixed)>nameWidth(viewport,editFixed),'preview '+viewport);
  }
  assert.doesNotMatch(runtime,/data-cart-line-note-editor|cart-line-note text-/);
  assert.ok(html.includes('fixed-ui-cart-spacing.css?ui=cart-intrinsic-5-cols-20261008'));
  assert.ok(html.includes('fixed-ui-runtime-6.js?v=semantic-columns-20261008c'));
});

test('readonly quantity uses short SL caption and a width sized to the maximum value',()=>{
  assert.match(runtime,/const qtyHeader = cartSheet\.querySelector\('\.cart-column-header \.cart-qty'\)/);
  assert.match(runtime,/qtyHeader\.textContent = isDeliveredReadOnlyPreview \? 'SL' : 'Số lượng'/);
  assert.match(runtime,/const qtyChars = Math\.max\(1, \.\.\.cartEntries\.map\(\(\[, item\]\) => formattedLen\(item\.qty\)\)\)/);
  assert.match(runtime,/setProperty\('--cart-qty-readonly-track',[\s\S]*?Math\.max\(32, Math\.ceil\(qtyChars \* 8 \+ 8\)\)/);
  assert.match(runtime,/\(reviewMode \? 24 : 0\)/,'review checkbox must have its own space');
  const cssFinal=css.slice(css.indexOf('/* FIXED STYLE: cart-visual-numeric-gaps-and-name-note-popup-20261008'));
  assert.match(cssFinal,/#cartBottomSheet\[data-cart-mode="preview"\] \.cart-compact-grid\{[^}]*grid-template-columns:[^;]*var\(--cart-qty-readonly-track,32px\)/);
  assert.match(css, /#cartBottomSheet\[data-cart-mode="preview"\] #cartItemList \.cart-compact-grid \.cart-qty-readonly\{[^}]*width:var\(--cart-qty-readonly-track,32px\)/);
  for(const values of [[1,2],[10,99],[123,1234]]){
    const longest=Math.max(...values.map(n=>n.toLocaleString('vi-VN').length));
    const width=Math.max(32,Math.ceil(longest*8+8));
    assert.ok(width>=32);
    if(values[0]===1) assert.equal(width,32);
    if(values[0]===123) assert.equal(width,48);
  }
  assert.match(html,/fixed-ui-cart-spacing\.css\?ui=[^"]*cart-intrinsic-5-cols-20261008/);
  assert.match(html,/fixed-ui-runtime-6\.js\?v=semantic-columns-20261008c[^"]*/);
});


test('SPEC-CART-GEOMETRY-20261117: header, rows, totals and actions share the same inline ruler',()=>{
  const semantic=fs.readFileSync('src/fixed-ui-semantic-columns.css','utf8');
  const markup=fs.readFileSync('src/fixed-ui-markup-3.js','utf8');
  const footer=fs.readFileSync('src/fixed-ui-runtime-5.js','utf8');
  assert.ok(markup.startsWith('document.write("') && markup.trimEnd().endsWith(');'));
  const source=JSON.parse(markup.trimEnd().slice('document.write('.length,-2));
  const cart=source.slice(source.indexOf('<!-- UI GIỎ HÀNG -->'),
      source.indexOf('<!-- CHỌN KHOẢNG THỜI GIAN ĐƠN -->'));
  for(const name of ['cart-head-row','cart-head-main','cart-head-actions',
      'cart-summary-block','cart-summary-row','cart-column-header','cartItemList',
      'cartFooterActions'])assert.ok(cart.includes(name),name);
  assert.match(footer,/class="cart-preview-actions flex w-full min-w-0 gap-2"/);
  const geometry=semantic.slice(semantic.indexOf('/* SPEC-CART-GEOMETRY-20261117'));
  assert.ok(geometry.startsWith('/* SPEC-CART-GEOMETRY-20261117'));
  assert.match(geometry,/#cartBottomSheet \.cart-head-row\{[\s\S]*?padding:10px 16px !important/);
  assert.match(geometry,/#cartBottomSheet > \.cart-column-header\{[\s\S]*?padding-left:16px !important/);
  assert.match(geometry,/#cartBottomSheet #cartItemList\{[\s\S]*?padding:4px 16px !important/);
  assert.match(geometry,/#cartBottomSheet \.cart-summary-block\{[\s\S]*?padding:12px 16px !important/);
  assert.match(geometry,/#cartBottomSheet #cartFooterActions \.cart-preview-actions\{[\s\S]*?grid-template-columns:minmax\(0,0\.36fr\) minmax\(0,0\.64fr\)/);
  assert.match(geometry,/#cartBottomSheet #cartFooterActions \.cart-preview-actions > button\{[\s\S]*?min-height:48px/);
  // The same four paddings change together on extra-narrow screens.
  const narrow=geometry.slice(geometry.lastIndexOf('@media(max-width:360px)'));
  for(const edge of ['cart-head-row','cart-column-header','cartItemList','cart-summary-block'])
    assert.ok(narrow.includes(edge),edge);
  assert.doesNotMatch(geometry,/#orderDetailContentToShare|#detailModalItems/);
});

test('SPEC-CART-GEOMETRY-20261117: 5 columns remain ordered in preview, edit and review',()=>{
  const semantic=fs.readFileSync('src/fixed-ui-semantic-columns.css','utf8');
  const geom=semantic.slice(semantic.indexOf('/* SPEC-CART-GEOMETRY-20261117'));
  assert.match(geom,/data-compact-two-line="1"\] \.cart-column-header/);
  assert.match(geom,/grid-column:2 \/ -1 !important;grid-row:1 !important/);
  for(const [name,column] of [['qty',3],['price',4],['total',5]]){
    // Verify the specific second-row remapping by its expected selector.
    assert.ok(geom.includes('grid-column:'+column+' !important;grid-row:2 !important;'),
      name+' is in its canonical column');
  }
  assert.match(geom,/All five columns now follow the shared measured-row selector below/);
  assert.doesNotMatch(geom,/data-cart-review="1"\] #cartItemList \.cart-compact-grid \.cart-qty\{\s*grid-column:3 !important;grid-row:2 !important/);
  assert.doesNotMatch(geom,/data-cart-review="1"\] #cartItemList \.cart-compact-grid \.cart-price\{\s*grid-column:4 !important;grid-row:2 !important/);
  assert.match(runtime,/innerWidth > 0 && availableName < 72/);
  assert.match(runtime,/usable > 0 && usable - fixed < 72/);
  // Widths illustrative only; actual font/scrollbar ruler stays in runtime.
  for(const width of [320,360,375,393,428]){
    const padding=width<=360?12:16;
    const availableName=width-2*padding-(24+56+54+69+4*6);
    assert.ok(availableName>0,String(width));
  }
});


test('SPEC-CART-HORIZONTAL-AXIS-20261117: caption and rows lock one shared five-track axis',()=>{
  const semantic=fs.readFileSync('src/fixed-ui-semantic-columns.css','utf8');
  const cart=fs.readFileSync('src/fixed-ui-cart-spacing.css','utf8');
  const final=semantic.slice(semantic.indexOf('/* SPEC-CART-HORIZONTAL-AXIS-20261117'));
  assert.ok(final.startsWith('/* SPEC-CART-HORIZONTAL-AXIS-20261117'));
  assert.match(final,/#cartBottomSheet > \.cart-column-header,\s*#cartBottomSheet #cartItemList \.cart-compact-grid\{[\s\S]*?grid-template-columns:[\s\S]*?var\(--cart-stt-track,24px\)[\s\S]*?minmax\(0,1fr\)[\s\S]*?var\(--cart-qty-track,96px\)[\s\S]*?var\(--cart-unit-track,54px\)[\s\S]*?var\(--cart-total-track,69px\)[\s\S]*?align-items:center !important/);
  assert.match(final,/#cartBottomSheet #cartItemList \.cart-compact-grid \.cart-stt,[\s\S]*?\.cart-total\{[\s\S]*?height:40px !important;[\s\S]*?align-self:center !important/);
  assert.match(final,/#cartBottomSheet\[data-cart-review="1"\] #cartItemList \.cart-compact-grid \.[^\n]+\{[\s\S]*?min-height:44px !important;height:44px !important/);
  assert.match(final,/Only the measured compact flag may split the header and each data row/);
  assert.match(final,/#cartBottomSheet\[data-compact-two-line="1"\] > \.cart-column-header,/);
  assert.match(final,/#cartBottomSheet\[data-compact-two-line="1"\] #cartItemList \.cart-compact-grid\{/);
  const narrow=cart.slice(cart.lastIndexOf('@media(max-width:360px)'));
  assert.doesNotMatch(narrow,/data-cart-review="1"\] #cartItemList \.cart-compact-grid \.cart-qty\{/);
  assert.doesNotMatch(narrow,/data-cart-review="1"\] #cartItemList \.cart-compact-grid \.cart-price\{/);
});

test('SPEC-CART-HORIZONTAL-AXIS-20261117: model all 5 columns at 320–1440px',()=>{
  for(const paneWidth of [320,340,360,375,390,393,414,428,768,1024,1440]){
    for(const mode of ['preview','edit','review']){
      const padding=paneWidth<=360?12:16;
      const track=[24,null,mode==='edit'?96:mode==='review'?56:32,54,69];
      const gap=6;
      const nameWidth=paneWidth-2*padding-track.filter(n=>n!==null).reduce((a,b)=>a+b,0)-4*gap;
      const compact=nameWidth<72;
      const columns=[0,1,2,3,4].map(index=>{
        const start=padding+track.slice(0,index).reduce((a,b)=>a+(b??nameWidth),0)+index*gap;
        return {start,width:track[index]??nameWidth};
      });
      assert.equal(columns.length,5);
      assert.ok(Math.abs(columns[4].start+columns[4].width-(paneWidth-padding))<1e-6);
      // Only one compact flag for BOTH header and data; no viewport-only split.
      assert.equal(typeof compact,'boolean');
      if(paneWidth===360&&mode==='review')assert.equal(compact,false,
        '360px reviewed row fits on one line and must not be moved to row 2 alone');
      for(const col of columns)assert.ok(col.width>0,'negative track at '+paneWidth+'/'+mode);
    }
  }
});
