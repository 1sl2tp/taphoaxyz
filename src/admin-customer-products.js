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
      let row=products.get(code);
      if(!row){
        row={code,name:name||code,orders:0,qty:0,lastDay:'',firstDay:'',ids:new Set()};
        products.set(code,row);
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
  let host=null,selectedId='',period='all',sort='frequency',query='',expanded=false;
  let repeatedArea=null,allArea=null,summaryArea=null,showAllBtn=null;
  function reset(){
    ++sessionEpoch;++viewEpoch;cachedOrders=null;pending=null;host=null;
    selectedId='';period='all';sort='frequency';query='';expanded=false;
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
  function rowsInto(parent,rows){
    parent.replaceChildren();
    for(const row of rows){
      const line=make('div','','care-purchase-row',parent);
      const name=make('div','','care-purchase-name',line);
      make('strong',row.name,'',name);
      make('small',row.code+' · Gần nhất: '+dateText(row.lastDay),'',name);
      make('span',fmt(row.orders),'care-purchase-number',line);
      make('span',fmt(row.qty),'care-purchase-number',line);
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
    const all=sortCustomerPurchases(summarizeCustomerPurchases(cachedOrders,selectedId),sort);
    const selectedDays=period==='7'?7:period==='30'?30:0;
    const periodRows=sortCustomerPurchases(
      summarizeCustomerPurchases(cachedOrders,selectedId,{days:selectedDays}),sort);
    const repeat=periodRows.filter(row=>row.orders>=2);
    const once=all.filter(row=>row.orders===1).length;
    summaryArea.textContent=fmt(all.length)+' mặt hàng đã từng mua · '+fmt(once)+
      ' mặt hàng chỉ mua 1 lần. Đơn tạm và đơn hoàn không tính.';
    rowsInto(repeatedArea,repeat.slice(0,15));
    if(!repeat.length)make('p','Chưa có mặt hàng nào được mua trong từ 2 đơn đã giao trở lên ở kỳ này.','care-purchase-empty',repeatedArea);
    const q=query.trim().toLocaleLowerCase('vi-VN');
    const matches=q?all.filter(row=>(row.name+' '+row.code).toLocaleLowerCase('vi-VN').includes(q)):all;
    rowsInto(allArea,expanded?matches:matches.slice(0,40));
    if(!matches.length)make('p',all.length?'Không có mặt hàng phù hợp tìm kiếm.':'Khách chưa có sản phẩm đã giao.','care-purchase-empty',allArea);
    showAllBtn.hidden=expanded||matches.length<=40;
    showAllBtn.textContent='Xem tất cả '+fmt(matches.length)+' sản phẩm';
  }
  function show(container,customerId){
    const view=++viewEpoch;
    const changed=String(customerId)!==String(selectedId);
    if(changed){period='all';sort='frequency';query='';expanded=false;}
    selectedId=String(customerId);host=container;host.replaceChildren();
    make('h3','Mặt hàng khách đã mua','care-purchase-title');
    summaryArea=make('p','Đang đọc lịch sử đơn đã giao…','care-purchase-summary');
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
    make('p','Chỉ đọc đơn đã giao, gộp theo mã hàng; mỗi đơn chỉ tính một lần cho một sản phẩm.','care-purchase-caption');
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
