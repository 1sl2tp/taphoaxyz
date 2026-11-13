// SPEC-CARE-ALL-PURCHASES-20261113
// Read-only customer purchase history: delivered orders only, including one-time products.
// Uses the existing admin-scoped taphoa_app_domains RPC. Never sends messages or posts money.
const formatter=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2});
const fmt=value=>formatter.format(Number(value)||0);
const dateText=iso=>iso?iso.split('-').reverse().join('/'):'—';
function vnDate(iso){
  const d=new Date(iso||'');
  if(!Number.isFinite(d.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',
    year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const get=k=>parts.find(p=>p.type===k)?.value||'';
  return get('year')+'-'+get('month')+'-'+get('day');
}
function vnToday(){return vnDate(new Date().toISOString());}
function periodStart(today,days){
  if(!days)return '';
  const d=new Date(today+'T00:00:00Z');
  if(Number.isNaN(d.getTime()))return '';
  d.setUTCDate(d.getUTCDate()-(days-1));
  return d.toISOString().slice(0,10);
}
// Canonical product group comes from the source key saved in each order item.
// Prefix fallback supports legacy rows, while unknown sources remain visible
// under their own names rather than being silently folded into "Khác".
export function purchaseGroup(item={}){
  const raw=String(item?.nhom??item?.product_group??item?.source_key??'').trim();
  const normalized=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const prefix=String(item?.maSP??item?.product_code??item?.product_id??'').split('-')[0].toUpperCase();
  const known={
    'sua':['sua','Sữa'],
    'hang-thuong':['hang-thuong','Hàng thường'],
    'hang-u':['hang-u','Hàng U'],
    'thuoc-la':['thuoc-la','Thuốc lá'],
    'masan':['masan','Hàng Masan']
  };
  const key=normalized||({SUA:'sua',HT:'hang-thuong',HU:'hang-u',TL:'thuoc-la'}[prefix]||'chua-phan-nhom');
  const found=Object.values(known).find(([k])=>k===key);
  return found?{key:found[0],label:found[1],fromSource:Boolean(normalized)}
    :{key,label:raw.replace(/[-_]+/g,' ')||'Chưa phân nhóm',fromSource:Boolean(normalized)};
}
const groupOrder=['sua','hang-thuong','hang-u','thuoc-la','masan'];
export function groupCustomerPurchases(rows,{group='all',sort='frequency'}={}){
  const byGroup=new Map();
  for(const row of rows||[]){
    const key=row.groupKey||'chua-phan-nhom';
    if(group!=='all'&&group!==key)continue;
    if(!byGroup.has(key))byGroup.set(key,{key,label:row.groupName||'Chưa phân nhóm',rows:[]});
    byGroup.get(key).rows.push(row);
  }
  return [...byGroup.values()].sort((a,b)=>{
    const ai=groupOrder.indexOf(a.key),bi=groupOrder.indexOf(b.key);
    const ax=ai<0?999:ai,bx=bi<0?999:bi;
    return ax-bx||a.label.localeCompare(b.label,'vi');
  }).map(g=>({...g,rows:sortCustomerPurchases(g.rows,sort)}));
}
export function summarizeCustomerPurchases(orders,customerId,{days=0,today=vnToday()}={}){
  const start=periodStart(today,days);
  const products=new Map();
  for(const order of Array.isArray(orders)?orders:[]){
    if(String(order?.maKH??order?.customer_id??'')!==String(customerId))continue;
    if(!['done','delivered'].includes(String(order?.status??order?.trangThai??'')))continue;
    // Delivery time controls the calendar report; creating a draft is not a purchase.
    const day=vnDate(order?.delivered_at||order?.ngay||order?.ordered_at);
    if(start&&(!day||day<start||day>today))continue;
    const orderId=String(order.id??'');
    if(!orderId)continue;
    for(const item of Array.isArray(order.items)?order.items:[]){
      const code=String(item?.maSP??item?.product_id??item?.product_code??'').trim();
      if(!code)continue;
      const name=String(item?.tenSP??item?.product_name??item?.ten??'').trim();
      const category=purchaseGroup(item);
      let row=products.get(code);
      if(!row){
        row={code,name:name||code,groupKey:category.key,groupName:category.label,
          groupFromSource:category.fromSource,orders:0,qty:0,lastDay:'',firstDay:'',ids:new Set()};
        products.set(code,row);
      }
      if(category.fromSource&&!row.groupFromSource){
        row.groupKey=category.key;row.groupName=category.label;row.groupFromSource=true;
      }
      if(!row.ids.has(orderId)){row.ids.add(orderId);row.orders++;}
      const qty=Number(item?.sl??item?.qty);
      if(Number.isFinite(qty))row.qty+=qty;
      if(day&&(!row.firstDay||day<row.firstDay))row.firstDay=day;
      if(day>=row.lastDay){row.lastDay=day;if(name)row.name=name;}
    }
  }
  return Array.from(products.values(),({ids,...row})=>row);
}
export function sortCustomerPurchases(rows,sort='frequency'){
  const items=[...(rows||[])];
  const name=(a,b)=>a.name.localeCompare(b.name,'vi');
  const latest=(a,b)=>b.lastDay.localeCompare(a.lastDay);
  items.sort((a,b)=>sort==='quantity'
    ? b.qty-a.qty||b.orders-a.orders||latest(a,b)||name(a,b)
    : sort==='recent'
      ? latest(a,b)||b.orders-a.orders||b.qty-a.qty||name(a,b)
      : b.orders-a.orders||b.qty-a.qty||latest(a,b)||name(a,b));
  return items;
}

export function createCustomerPurchasesReport({rpc,getIdentity}){
  let cachedOrders=null,pending=null,sessionEpoch=0,viewEpoch=0;
  let host=null,selectedId='',period='all',sort='frequency',group='all',query='',expanded=false;
  let repeatedArea=null,allArea=null,summaryArea=null,groupSummaryArea=null,showAllBtn=null,groupControl=null;
  function reset(){
    ++sessionEpoch;++viewEpoch;cachedOrders=null;pending=null;host=null;
    selectedId='';period='all';sort='frequency';group='all';query='';expanded=false;
  }
  function loadOrders(){
    if(cachedOrders)return Promise.resolve(cachedOrders);
    if(pending)return pending;
    const identity=getIdentity();
    if(identity?.role!=='admin')return Promise.reject(new Error('Không có quyền xem lịch sử.'));
    const epoch=sessionEpoch,uid=identity.uid;
    const task=Promise.resolve().then(()=>rpc('taphoa_app_domains',{p_domains:['orders']}))
      .then(data=>{
        if(epoch!==sessionEpoch||getIdentity()?.uid!==uid||getIdentity()?.role!=='admin')
          throw new Error('Phiên đăng nhập đã thay đổi.');
        if(!Array.isArray(data?.orders))throw new Error('Dữ liệu đơn hàng trả về không hợp lệ.');
        cachedOrders=data.orders;
        return cachedOrders;
      });
    pending=task;
    void task.finally(()=>{if(pending===task)pending=null;}).catch(()=>{});
    return task;
  }
  function make(tag,label,cls,parent){
    const node=document.createElement(tag);
    if(label)node.textContent=label;
    if(cls)node.className=cls;
    (parent||host).append(node);
    return node;
  }
  function rowsInto(parent,groups,limit=Infinity){
    parent.replaceChildren();
    let displayed=0;
    for(const category of groups){
      const remaining=limit-displayed;
      if(remaining<=0)break;
      const visible=category.rows.slice(0,remaining);
      if(!visible.length)continue;
      const heading=make('div','','care-purchase-group-heading',parent);
      make('strong',category.label,'',heading);
      make('span',fmt(category.rows.length)+' mặt hàng','',heading);
      for(const row of visible){
        const line=make('div','','care-purchase-row',parent);
        const name=make('div','','care-purchase-name',line);
        make('strong',row.name,'',name);
        make('small',row.code+' · Gần nhất: '+dateText(row.lastDay),'',name);
        make('span',fmt(row.orders),'care-purchase-number',line);
        make('span',fmt(row.qty),'care-purchase-number',line);
      }
      displayed+=visible.length;
    }
  }
  function productHeading(parent){
    const header=make('div','','care-purchase-grid care-purchase-grid-head',parent);
    make('span','Mặt hàng','',header);
    make('span','Lần','',header);
    make('span','SL','',header);
    return make('div','','care-purchase-items',parent);
  }
  function update(){
    if(!host||!cachedOrders||getIdentity()?.role!=='admin')return;
    const lifetime=summarizeCustomerPurchases(cachedOrders,selectedId);
    const allGroups=groupCustomerPurchases(lifetime,{sort});
    if(group!=='all'&&!allGroups.some(g=>g.key===group))group='all';
    // Always include all lifetime groups, even when a period or search is active.
    groupControl.replaceChildren();
    for(const [value,label] of [['all','Tất cả nhóm ('+fmt(lifetime.length)+')'],
      ...allGroups.map(g=>[g.key,g.label+' ('+fmt(g.rows.length)+')'])]){
      const option=make('option',label,'',groupControl);option.value=value;
    }
    groupControl.value=group;
    summaryArea.textContent=fmt(lifetime.length)+' mặt hàng đã từng mua · '+
      fmt(lifetime.filter(r=>r.orders===1).length)+' mặt hàng chỉ mua 1 lần · '+
      fmt(allGroups.length)+' nhóm. Không tính đơn tạm/hoàn.';
    groupSummaryArea.textContent=allGroups.map(g=>g.label+': '+fmt(g.rows.length)).join(' · ')||
      'Chưa có nhóm hàng đã mua.';
    const days=period==='7'?7:period==='30'?30:0;
    const repeat=groupCustomerPurchases(
      summarizeCustomerPurchases(cachedOrders,selectedId,{days}).filter(r=>r.orders>=2),
      {group,sort});
    rowsInto(repeatedArea,repeat,15);
    if(!repeat.length)make('p','Chưa có mặt hàng mua từ 2 đơn đã giao trở lên trong kỳ và nhóm đã chọn.','care-purchase-empty',repeatedArea);
    const q=query.trim().toLocaleLowerCase('vi-VN');
    const filtered=lifetime.filter(r=>group==='all'||r.groupKey===group)
      .filter(r=>!q||(r.name+' '+r.code).toLocaleLowerCase('vi-VN').includes(q));
    const matches=groupCustomerPurchases(filtered,{sort});
    rowsInto(allArea,matches,expanded?Infinity:40);
    if(!matches.length)make('p',lifetime.length?'Không có sản phẩm phù hợp nhóm hoặc tìm kiếm.':
      'Khách chưa có sản phẩm đã giao.','care-purchase-empty',allArea);
    showAllBtn.hidden=expanded||filtered.length<=40;
    showAllBtn.textContent='Xem tất cả '+fmt(filtered.length)+' sản phẩm';
  }
  function show(container,customerId){
    const view=++viewEpoch;
    const changed=String(customerId)!==String(selectedId);
    if(changed){period='all';sort='frequency';group='all';query='';expanded=false;}
    selectedId=String(customerId);host=container;host.replaceChildren();
    make('h3','Mặt hàng khách đã mua','care-purchase-title');
    summaryArea=make('p','Đang đọc lịch sử đơn đã giao…','care-purchase-summary');
    groupSummaryArea=make('p','','care-purchase-group-summary');
    const tools=make('div','','care-purchase-tools');
    const periodControl=make('select','','care-purchase-select',tools);
    periodControl.setAttribute('aria-label','Kỳ xem mặt hàng mua lặp lại');
    for(const [value,label] of [['all','Hay mua · toàn bộ'],['30','Hay mua · 30 ngày'],['7','Hay mua · 7 ngày']]){
      const opt=make('option',label,'',periodControl);opt.value=value;
    }
    periodControl.value=period;
    periodControl.addEventListener('change',()=>{period=periodControl.value;update();});
    const sortControl=make('select','','care-purchase-select',tools);
    sortControl.setAttribute('aria-label','Sắp xếp mặt hàng');
    for(const [value,label] of [['frequency','Số lần mua'],['quantity','Tổng số lượng'],['recent','Mua gần nhất']]){
      const opt=make('option',label,'',sortControl);opt.value=value;
    }
    sortControl.value=sort;
    sortControl.addEventListener('change',()=>{sort=sortControl.value;update();});
    groupControl=make('select','','care-purchase-select care-purchase-group-select',tools);
    groupControl.setAttribute('aria-label','Lọc nhóm hàng đã mua');
    const first=make('option','Tất cả nhóm','',groupControl);first.value='all';
    groupControl.addEventListener('change',()=>{
      group=groupControl.value;expanded=false;update();
    });
    make('h4','Hàng thường mua (từ 2 đơn trở lên)','care-purchase-subtitle');
    repeatedArea=productHeading(make('div','','care-purchase-table'));
    make('h4','Tất cả sản phẩm đã mua · toàn thời gian','care-purchase-subtitle');
    const search=make('input','','care-purchase-search');
    search.type='search';search.placeholder='Tìm trong tất cả sản phẩm đã mua…';
    search.setAttribute('aria-label','Tìm tên hoặc mã sản phẩm đã mua');
    search.value=query;
    search.addEventListener('input',()=>{query=search.value;expanded=false;update();});
    allArea=productHeading(make('div','','care-purchase-table'));
    showAllBtn=make('button','Xem tất cả','btn care-purchase-more');
    showAllBtn.type='button';
    showAllBtn.addEventListener('click',()=>{expanded=true;update();});
    make('p','Phân nhóm theo nguồn hàng trên đơn; các mã cũ thiếu nhóm dùng tiền tố mã. Gộp theo mã hàng, mỗi đơn chỉ tính một lần.','care-purchase-caption');
    if(cachedOrders){update();return;}
    void loadOrders().then(()=>{
      if(view!==viewEpoch||host!==container||getIdentity()?.role!=='admin')return;
      update();
    }).catch(error=>{
      if(view!==viewEpoch||host!==container)return;
      summaryArea.textContent='Không đọc được lịch sử mua: '+String(error?.message||error);
    });
  }
  return {show,reset};
}
