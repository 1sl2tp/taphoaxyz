import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const fixtures={
  dongiao:[
    ['Mã đơn','Mã KH','Mã SP','SL','Đơn giá','Thành tiền','Thời gian'],
    ['DG14','c1','s1','2','100','200','06/11/2026 21:51'],
    ['DG13','c1','s1','1','100','100','06/11/2026 17:22'],
    ['DG12','c1','s1','1','100','100','04/11/2026 09:20']
  ],
  dontam:[
    ['Mã đơn','Mã KH','Mã SP','SL','Đơn giá','Thành tiền','Thời gian'],
    ['DT7','c1','s1','1','100','100','06/11/2026 22:30'],
    ['DT6','c1','s1','1','100','100','04/11/2026 08:00']
  ],
  sanpham:[['Mã','Tên','Vốn','','Nguồn'],['s1','Sữa',80,'','Sữa']],
  khachhang:[['Mã','Tên'],['c1','C Hà Trang']]
};

function renderFixture(source,name,sheet,role){
  const begin=source.indexOf('        function '+name+'() {');
  const end=sheet==='dongiao'
    ? source.indexOf('        function latestDeliveredDateKeyByCustomer() {',begin)
    : source.length;
  assert.ok(begin>=0&&end>begin,'renderer boundaries remain recognizable');

  const nodes={};
  const ids=['pendingOrderListContainer','pendingCountBadge','sourceSummaryTableBody',
    'completedOrderListContainer','completedCountBadge','completedSummaryTableBody'];
  ids.forEach(id=>{nodes[id]={innerHTML:'',innerText:''};});
  const context={
    document:{getElementById:id=>nodes[id]},
    appData:fixtures,currentAuthRole:role,
    hasPermission:()=>true,renderOrderTimeFilterUI:()=>{},
    getRowsVisibleForOrderTab:key=>fixtures[key].slice(1),
    escapeProductEditorValue:value=>String(value),
    buildOrderProductPreview:items=>({items:items.map(item=>item.name).slice(0,2),remaining:0}),
    formatOrderCardTime:value=>value,
    // This fixture isolates day grouping; the production name helper has
    // separate executable coverage in order-customer-name-snapshot-20261110.
    resolveSavedOrderCustomerName:(row,current)=>current||row?.[11]||row?.[1]||'Khách hàng',
    parseOrderDateKey:value=>{
      const m=String(value).match(/^(\d\d)\/(\d\d)\/(\d{4})/);
      return m?m[3]+'-'+m[2]+'-'+m[1]:'';
    },
    sortOrderKeysForDisplay:orders=>Object.keys(orders).sort((a,b)=>
      Number(b.replace(/\D/g,''))-Number(a.replace(/\D/g,''))),
    getUserTimelineVisibleKeys:(_sheet,keys)=>keys,
    renderUserOrderDayHeading:(day,count)=>
      '<h3 class="order-timeline-day-heading">'+day+' · '+count+'</h3>',
    getTimelineOrderDisplayNumber:(key,fallback)=>Number(key.replace(/\D/g,''))||fallback,
    renderUserTimelineMoreButton:()=>''
  };
  vm.runInNewContext(source.slice(begin,end)+'\n'+name+'();',context);
  return nodes[sheet==='dongiao'?'completedOrderListContainer':'pendingOrderListContainer'].innerHTML;
}

for(const [file,func,sheet,newest] of [
  ['src/fixed-ui-runtime-11.js','renderDaGiao','dongiao','DG14'],
  ['src/fixed-ui-runtime-10.js','renderDonTam','dontam','DT7']
]){
  test('User/PIN '+sheet+' groups every card under its own date; admin remains unchanged',async()=>{
    const src=await readFile(file,'utf8');
    const user=renderFixture(src,func,sheet,'user');
    const admin=renderFixture(src,func,sheet,'admin');
    const opened=user.match(/<section class="order-timeline-day-group">/g)||[];
    const closed=user.match(/<\/section>/g)||[];
    assert.equal(opened.length,2);
    assert.equal(closed.length,2);
    assert.ok(user.includes('<section class="order-timeline-day-group"><h3 class="order-timeline-day-heading">2026-11-06 · '+(sheet==='dongiao'?2:1)+'</h3>'));
    const firstCard=user.indexOf("clickOrder('"+newest+"'");
    const olderDay=user.indexOf('2026-11-04');
    assert.ok(firstCard>0&&olderDay>firstCard,
      'first order must appear immediately after the recent day, before any older date');
    assert.match(user,/<\/section><section class="order-timeline-day-group">/,
      'each date group must close before the next starts');
    assert.doesNotMatch(admin,/order-timeline-day-group/,
      'Admin must not inherit customer day groups');
  });
}

test('User/PIN sees order list before source summary; admin ordering stays untouched',async()=>{
  const css=await readFile('src/fixed-ui-source-4.css','utf8');
  assert.match(css,/body\[data-auth-role="user"\] :is\(#tab-da-giao,#tab-don-tam\) > main > \.order-summary-panel\{order:2;\}/);
  assert.match(css,/main > div:not\(\.order-summary-panel\)\{\s*order:1;/);
});
