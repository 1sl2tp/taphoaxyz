import {createAuthService} from './core/auth.js';
import {createApi} from './core/api.js';
import {orderRpcPayload} from './core/business.js';
import {createAppState,changedDomains} from './core/app-state.js';
import {createSnapshotStore} from './core/snapshot.js';
import {CONFIG} from './core/config.js';

const auth=createAuthService();
const business=createApi({clientProvider:auth.getClient});
const appState=createAppState();
const snapshot=createSnapshotStore();

let identity=null;
let bootstrapped=false;
let syncTimer=null;
let syncInFlight=null;
let publicAccess=null;
let employeeAccess=null;
let employeeSnapshotData=null;

const num=value=>Number.isFinite(Number(value))?Number(value):0;
const text=value=>String(value??'');
const first=(obj,keys,fallback='')=>{
  for(const key of keys)if(obj&&obj[key]!==undefined&&obj[key]!==null&&obj[key]!=='')return obj[key];
  return fallback;
};

function viTime(value){
  const d=value?new Date(value):new Date();
  if(Number.isNaN(d.getTime()))return text(value);
  const p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function currentUid(){return text(identity?.uid);}
function saveSnapshot(){const uid=currentUid();if(uid&&!publicAccess&&!employeeAccess)snapshot.save(uid,appState.get());}

const EMPLOYEE_API=`${CONFIG.supabaseUrl}/functions/v1/taphoa-stock-check`;

async function employeeRequest({method='GET',items=null}={}){
  if(!employeeAccess?.token||!employeeAccess?.pin)throw new Error('employee_access_required');
  const headers={'x-employee-pin':employeeAccess.pin};
  const init={method,headers,cache:'no-store'};
  let url=`${EMPLOYEE_API}?t=${encodeURIComponent(employeeAccess.token)}`;
  if(method!=='GET'){
    headers['content-type']='application/json';
    init.body=JSON.stringify({token:employeeAccess.token,action:'save',items:Array.isArray(items)?items:[]});
    url=EMPLOYEE_API;
  }
  const response=await fetch(url,init);
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data?.ok!==true){
    const err=Object.assign(new Error(String(data?.error||'employee_request_failed')),{code:String(data?.error||response.status)});
    throw err;
  }
  return data;
}

function employeeStateFromSnapshot(data={}){
  const products=(Array.isArray(data.products)?data.products:[]).map(row=>({
    id:text(row?.product_code),
    name:text(row?.product_name),
    price:0,
    source_key:text(row?.source_key),
    image_url:'',
    units_per_carton:'',
    retail_price:0
  }));
  const sourceMap=new Map();
  for(const row of Array.isArray(data.products)?data.products:[]){
    const key=text(row?.source_key).trim();
    if(!key||sourceMap.has(key))continue;
    sourceMap.set(key,{id:key,name:text(row?.source_name||key)});
  }
  const customer={
    id:text(data?.customer_id),
    name:text(data?.customer_name||'Khách hàng'),
    role:'user',
    active:true
  };
  const signals=(Array.isArray(data.products)?data.products:[]).map(row=>({
    product_code:text(row?.product_code),
    order_count:num(row?.personal_order_count),
    market_customer_count:num(row?.market_customer_count)
  }));
  return {
    version:'taphoa-employee-link-v1',
    syncSeconds:30,
    user:{id:customer.id,username:'',displayName:customer.name,role:'customer'},
    permissions:{
      canViewProducts:true,
      canCreateDraft:false,
      canMutateDebt:false,
      canViewDebt:false,
      canViewOrders:false
    },
    products,
    sources:[...sourceMap.values()],
    customers:[customer],
    selfCustomer:customer,
    orders:[],
    debtSummary:[],
    signals,
    printSettings:{},
    revisions:{}
  };
}

async function publicRpc(name,args={}){
  if(!publicAccess?.slug)throw new Error('public_access_required');
  const client=await auth.getClient();
  const {data,error}=await client.rpc(name,{
    p_public_slug:publicAccess.slug,
    p_pin:publicAccess.pin||null,
    ...args
  });
  if(error){
    const err=Object.assign(new Error(error.message||String(error.code||'PUBLIC_RPC_ERROR')),{code:String(error.code||'PUBLIC_RPC_ERROR')});
    throw err;
  }
  return data;
}

function sourceDisplayName(product,state=appState.get()){
  const key=text(first(product,['source_key','nhom','source','product_group','nguon'],'')).trim();
  if(!key)return '';
  const source=(state.sources||[]).find(row=>text(first(row,['id','key','source_key'],'')).trim()===key);
  return source?text(first(source,['name','ten'],key)):key;
}

function mapProductRows(state=appState.get()){
  return [
    ['Mã','Tên sản phẩm','Vốn','Giá bán','Nguồn','Ảnh','Quy cách','Giá lẻ'],
    ...(state.products||[]).map(p=>[
      text(first(p,['id','maSP','product_id'])),
      text(first(p,['ten','name','product_name'])),
      text(first(p,['von','cost','unit_cost'],'')),
      text(first(p,['gia','price','unit_price'],0)),
      sourceDisplayName(p,state),
      text(first(p,['imageUrl','image_url','image'],'')),
      text(first(p,['quyCach','quyDoiThung','units_per_carton'],'')),
      text(first(p,['giaLe','retail_price'],'')),
    ])
  ];
}

function customerAvatarUrl(value){
  const raw=text(value).trim();
  if(!raw)return '';
  if(/^https?:\/\//i.test(raw))return raw;
  const path=raw.split('/').filter(Boolean).map(part=>encodeURIComponent(part)).join('/');
  return `${CONFIG.supabaseUrl}/storage/v1/object/public/v21-avatars/${path}`;
}

function mapCustomerRows(state=appState.get()){
  return [
    ['Mã KH','Tên khách','Username','','Vai trò','Avatar'],
    ...(state.customers||[]).filter(c=>c&&c.active!==false).map(c=>[
      text(first(c,['id','maKH','customer_id'])),
      text(first(c,['ten','name','customer_name'])),
      text(first(c,['username','user_name','login'],'')),
      '',
      text(first(c,['role'],'user')),
      customerAvatarUrl(first(c,['avatar','avatar_url','avatar_path'],''))
    ])
  ];
}

function orderStatus(order){return text(first(order,['trangThai','status'])).toLowerCase();}
function orderCustomer(order){return text(first(order,['maKH','customer_id','customerId'],'le'))||'le';}
function orderTime(order){return viTime(first(order,['ngay','ordered_at','created_at','updated_at'],new Date()));}
function backendOrderId(order){return text(first(order,['backendOrderId','order_id','id']));}
function orderDisplayCode(order){
  const explicit=text(first(order,['displayCode','display_code','maDon'],''));
  if(/^D[GT]\d+$/i.test(explicit))return explicit.toUpperCase();
  const displayNo=text(first(order,['displayNo','display_no'],''));
  if(displayNo)return `${orderStatus(order)==='pending'?'DT':'DG'}${displayNo}`;
  return backendOrderId(order);
}
function orderByBackendId(id,state=appState.get()){
  const key=text(id);
  return (state.orders||[]).find(order=>backendOrderId(order)===key)||null;
}
function displayCodeForBackendId(id,state=appState.get()){
  const order=orderByBackendId(id,state);
  return order?orderDisplayCode(order):'';
}

function mapOrderRows(kind,state=appState.get()){
  const expected=kind==='dongiao'?'done':'pending';
  const rows=[['Mã đơn','Mã KH','Mã SP','SL','Đơn giá','Thành tiền','Thời gian','Mã đơn DB','Số đơn','Ghi chú','Giá vốn snapshot']];
  for(const order of state.orders||[]){
    if(orderStatus(order)!==expected)continue;
    const displayId=orderDisplayCode(order);
    const backendId=backendOrderId(order);
    const displayNo=text(first(order,['displayNo','display_no'],''));
    const customerId=orderCustomer(order);
    const time=orderTime(order);
    for(const item of order.items||[]){
      const productId=text(first(item,['maSP','product_id','id']));
      const qty=num(first(item,['sl','qty'],0));
      const price=num(first(item,['gia','unit_price','price'],0));
      const note=text(first(item,['ghiChu','note'],''));
      const costSnapshot=num(first(item,['unit_cost','von'],0));
      rows.push([displayId,customerId,productId,String(qty),String(price),String(qty*price),time,backendId,displayNo,note,String(costSnapshot)]);
    }
  }
  return rows;
}

function debtBalance(row){return num(first(row,['soDu','balance','total'],0));}
function debtCustomerId(row){return text(first(row,['maKH','id','customer_id']));}
function debtLastAt(row){return first(row,['lastTransaction','last','ngay','last_at'],new Date());}
function debtHeader(){return ['Mã GD','Mã KH','Loại GD','Số tiền','Thời gian','Dư nợ sau GD','Loại nội bộ','Mã đơn','Mã đơn DB'];}

function mapDebtSummaryRows(state=appState.get()){
  const rows=[debtHeader()];
  let index=0;
  for(const row of state.debtSummary||[]){
    const customerId=debtCustomerId(row);if(!customerId)continue;
    const balance=debtBalance(row);
    rows.push([
      `BAL${String(++index).padStart(4,'0')}`,
      customerId,
      balance>=0?'Ghi nợ phát sinh':'Thu tiền mặt',
      String(balance),
      viTime(debtLastAt(row)),
      '',
      'summary',
      '',
      ''
    ]);
  }
  return rows;
}

function ledgerLabel({entryType,movement,displayCode,note}){
  if(entryType==='sale')return displayCode?`Giao đơn ${displayCode}`:'Giao đơn';
  if(entryType==='reversal')return displayCode?`Hoàn đơn ${displayCode}`:'Hoàn đơn';
  if(entryType==='collection')return note||'Thu tiền';
  if(entryType==='payment')return note||'Ghi nợ';
  return note||(movement<0?'Thu tiền':'Ghi nợ phát sinh');
}

function ledgerToRows(detail={}){
  const customerId=text(first(detail.customer||{},['id','maKH','customer_id'],first(detail,['maKH','customer_id'],'')));
  const state=appState.get();
  return (detail.transactions||[]).map((tx,index)=>{
    const movement=num(first(tx,['bienDong','movement','soTien','amount'],0));
    const backendId=text(first(tx,['maDon','order_id'],''));
    const displayCode=backendId?displayCodeForBackendId(backendId,state):'';
    const entryType=text(first(tx,['entryType','entry_type'],'')).toLowerCase();
    const balanceAfter=first(tx,['balanceAfter','balance_after'],'');
    const rawNote=text(first(tx,['ghiChu','note'],''));
    const note=ledgerLabel({entryType,movement,displayCode,note:rawNote});
    return [
      text(first(tx,['id','maGD','transaction_id'],`TX${index+1}`)),
      customerId,
      note,
      String(movement),
      viTime(first(tx,['ngay','occurred_at','created_at'],new Date())),
      balanceAfter===''?'':String(num(balanceAfter)),
      entryType,
      displayCode,
      backendId
    ];
  });
}

function sheetRows(sheet){
  if(sheet==='sanpham')return mapProductRows();
  if(sheet==='khachhang')return mapCustomerRows();
  if(sheet==='dontam'||sheet==='dongiao')return mapOrderRows(sheet);
  if(sheet==='thuchi')return mapDebtSummaryRows();
  return [];
}

async function bootstrap({force=false}={}){
  if(bootstrapped&&!force)return appState.get();
  const uid=currentUid();
  const cached=!publicAccess&&!employeeAccess&&uid?snapshot.load(uid):null;
  if(cached?.data&&!bootstrapped){appState.setBootstrap(cached.data);bootstrapped=true;}
  if(navigator.onLine===false){
    if(bootstrapped)return appState.get();
    throw new Error('Chưa có dữ liệu đã lưu cho tài khoản này');
  }
  const data=employeeAccess
    ?employeeStateFromSnapshot(employeeSnapshotData||await employeeRequest())
    :publicAccess
      ?await publicRpc('taphoa_public_bootstrap_access')
      :await business.bootstrap();
  appState.setBootstrap(data||{});bootstrapped=true;saveSnapshot();
  return appState.get();
}

async function refresh(domains=[]){
  const list=[...new Set((domains||[]).map(String))];
  if(!list.length)return appState.get();
  if(employeeAccess)return appState.get();
  const data=publicAccess
    ?await publicRpc('taphoa_public_domains_access',{p_domains:list})
    :await business.domains(list);
  appState.mergeDomains(data||{});bootstrapped=true;saveSnapshot();
  return appState.get();
}

async function syncOnce(){
  if(!identity||navigator.onLine===false||document.hidden)return appState.get();
  if(employeeAccess)return appState.get();
  if(syncInFlight)return syncInFlight;
  syncInFlight=(async()=>{
    const before=appState.get();
    const meta=publicAccess
      ?await publicRpc('taphoa_public_domains_access',{p_domains:[]})
      :await business.meta();
    const changed=changedDomains(before.revisions,meta?.revisions||{});
    const nextPermissions=meta?.permissions||before.permissions;
    const permissionsChanged=JSON.stringify(before.permissions||{})!==JSON.stringify(nextPermissions||{});
    if(changed.length)await refresh(changed);
    else appState.mergeDomains({
      version:meta?.version||before.version,
      syncSeconds:Number(meta?.syncSeconds)||before.syncSeconds,
      permissions:nextPermissions,
      revisions:meta?.revisions||before.revisions
    });
    if(changed.length||permissionsChanged){
      window.dispatchEvent(new CustomEvent('taphoa-production-sync',{detail:{changed,permissionsChanged}}));
    }
    return appState.get();
  })().finally(()=>{syncInFlight=null;});
  return syncInFlight;
}

function stopSync(){if(syncTimer){clearInterval(syncTimer);syncTimer=null;}syncInFlight=null;}
function startSync(){
  stopSync();
  const seconds=Math.max(10,Number(appState.get().syncSeconds)||30);
  syncTimer=setInterval(()=>{
    if(document.hidden)return;
    syncOnce().catch(error=>console.warn('taphoa sync',error));
  },seconds*1000);
}

async function attachSession(info){
  identity=info?.identity||null;bootstrapped=false;
  await bootstrap();startSync();
  return {identity,state:appState.get()};
}

async function login(username,password){
  publicAccess=null;
  employeeAccess=null;
  employeeSnapshotData=null;
  return attachSession(await auth.login(username,password));
}
async function restore(){
  if(publicAccess||employeeAccess)return {identity,state:appState.get()};
  const info=await auth.restore();if(!info)return null;return attachSession(info);
}
async function openPublicLink(slug,pin){
  employeeAccess=null;
  employeeSnapshotData=null;
  publicAccess={slug:String(slug||'').trim().toLowerCase(),pin:String(pin||'').trim()};
  bootstrapped=false;
  const data=await publicRpc('taphoa_public_bootstrap_access');
  appState.setBootstrap(data||{});
  const user=data?.user||{};
  identity={
    uid:String(user.id||user.uid||''),
    username:String(user.username||''),
    role:'customer',
    maKH:String(user.id||user.uid||''),
    displayName:String(user.displayName||user.ten||user.username||''),
    active:true
  };
  bootstrapped=true;
  startSync();
  return {identity,state:appState.get()};
}
async function openEmployeeLink(token,pin){
  publicAccess=null;
  stopSync();
  employeeAccess={token:String(token||'').trim(),pin:String(pin||'').trim()};
  if(!employeeAccess.token||!employeeAccess.pin)throw new Error('employee_access_required');
  employeeSnapshotData=await employeeRequest();
  if(String(employeeSnapshotData?.role||'')!=='employee')throw new Error('employee_role_required');
  const data=employeeStateFromSnapshot(employeeSnapshotData);
  appState.setBootstrap(data);
  const user=data.user||{};
  identity={
    uid:String(user.id||''),
    username:'',
    role:'customer',
    maKH:String(user.id||''),
    displayName:String(user.displayName||''),
    active:true
  };
  bootstrapped=true;
  return {identity,state:appState.get(),employeeSnapshot:employeeSnapshotData};
}

async function saveEmployeeQuantities(items=[]){
  if(!employeeAccess)throw new Error('employee_access_required');
  const data=await employeeRequest({method:'POST',items});
  return data;
}

async function saveSharedQuantities(items=[]){
  const normalized=Array.isArray(items)?items:[];
  if(employeeAccess)return saveEmployeeQuantities(normalized);
  if(publicAccess){
    return publicRpc('taphoa_public_shared_cart_save_access',{p_items:normalized});
  }
  throw new Error('shared_cart_access_required');
}

async function getEmployeeSnapshot(){
  if(!employeeAccess)return null;
  employeeSnapshotData=await employeeRequest();
  return employeeSnapshotData;
}

async function logout(){
  const uid=currentUid();
  stopSync();
  if(publicAccess||employeeAccess){
    publicAccess=null;
    employeeAccess=null;
    employeeSnapshotData=null;
    identity=null;bootstrapped=false;appState.reset();
    return;
  }
  try{await auth.logout();}
  finally{
    if(uid)snapshot.clear(uid);
    identity=null;bootstrapped=false;appState.reset();
  }
}
async function readSheet(sheet){await bootstrap();return sheetRows(sheet);}
async function debtLedger(customerId){
  if(employeeAccess)throw new Error('employee_read_only');
  if(publicAccess)return publicRpc('taphoa_public_debt_ledger_access',{p_before_at:null,p_before_id:null,p_limit:50});
  return business.debtLedger(customerId);
}
async function saveOrder(payload){
  if(employeeAccess)throw new Error('employee_read_only');
  const result=publicAccess
    ?await publicRpc('taphoa_public_save_pending_access',{p_order:orderRpcPayload({...payload,status:'pending'}),p_command_id:crypto.randomUUID()})
    :await business.saveOrder(payload);
  await refresh(['orders','debt']);
  return result;
}
async function deliverOrder(id){
  if(employeeAccess)throw new Error('employee_read_only');
  if(publicAccess)throw new Error('public_pending_only');
  const result=await business.deliverOrder(id);await refresh(['orders','debt']);return result;
}
async function reverseOrder(id,reason='Hoàn đơn'){
  if(employeeAccess)throw new Error('employee_read_only');
  if(publicAccess)throw new Error('public_pending_only');
  const result=await business.reverseOrder(id,reason);await refresh(['orders','debt']);return result;
}
async function deletePending(id){
  if(employeeAccess)throw new Error('employee_read_only');
  const result=publicAccess
    ?await publicRpc('taphoa_public_delete_pending_access',{p_order_id:String(id||''),p_command_id:crypto.randomUUID()})
    :await business.deletePending(id);
  await refresh(['orders']);return result;
}
async function batchOrders(action,ids){
  if(employeeAccess)throw new Error('employee_read_only');
  if(publicAccess)throw new Error('public_pending_only');
  const result=await business.batchOrders(action,ids);await refresh(['orders','debt']);return result;
}
async function debtTransaction(customerId,type,amount,note=''){
  if(employeeAccess)throw new Error('employee_read_only');
  if(publicAccess)throw new Error('public_read_only');
  const result=await business.debtTransaction(customerId,type,amount,note);await refresh(['debt']);return result;
}
async function stockCheckLinks(customerId){
  if(employeeAccess)throw new Error('employee_read_only');
  if(publicAccess)return publicRpc('taphoa_public_employee_link_access');
  return business.stockCheckLinks(customerId);
}
async function publicPinState(){
  if(!publicAccess?.slug)throw new Error('public_access_required');
  const client=await auth.getClient();
  const {data,error}=await client.rpc('taphoa_public_gate_state',{p_public_slug:publicAccess.slug});
  if(error)throw Object.assign(new Error(error.message||'PIN_STATE_ERROR'),{code:String(error.code||'PIN_STATE_ERROR')});
  return data||{};
}
async function setPublicPin(newPin){
  if(!publicAccess?.slug)throw new Error('public_access_required');
  const pin=String(newPin||'').trim();
  const data=await publicRpc('taphoa_public_pin_manage_access',{p_new_pin:pin});
  if(data?.ok!==true)throw new Error(String(data?.error||'pin_update_failed'));
  publicAccess={...publicAccess,pin};
  return data;
}
async function employeeSnapshot(){
  if(employeeAccess)return getEmployeeSnapshot();
  if(!publicAccess)return null;
  return publicRpc('taphoa_public_employee_snapshot_access');
}
async function orderDetail(id){
  if(employeeAccess)throw new Error('employee_read_only');
  if(publicAccess)return publicRpc('taphoa_public_order_detail_access',{p_order_id:String(id||'')});
  return business.orderDetail(id);
}
async function productMediaCandidates(query,limit=12){return business.productMediaCandidates(query,limit);}
async function marketSearch(query,limit=60,source='',offset=0){return business.marketSearch(query,limit,source,offset);}
async function setProductMedia(productCode,canonicalProductId){
  const result=await business.setProductMedia(productCode,canonicalProductId);
  await refresh(['products']);
  return result;
}
async function setProductMediaCompare(productCode,kind,unitsPerCarton=null){
  const result=await business.setProductMediaCompare(productCode,kind,unitsPerCarton);
  await refresh(['products']);
  return result;
}
async function setProductMediaOwnQc(productCode,unitsPerCarton){
  const result=await business.setProductMediaOwnQc(productCode,unitsPerCarton);
  await refresh(['products']);
  return result;
}
async function clearProductMedia(productCode){
  const result=await business.clearProductMedia(productCode);
  await refresh(['products']);
  return result;
}

window.addEventListener('online',()=>syncOnce().catch(error=>console.warn('taphoa sync',error)));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncOnce().catch(error=>console.warn('taphoa sync',error));});

window.TAPHOA_PRODUCTION=Object.freeze({
  login,restore,openPublicLink,openEmployeeLink,logout,bootstrap,refresh,syncOnce,readSheet,debtLedger,ledgerToRows,
  saveOrder,deliverOrder,reverseOrder,deletePending,batchOrders,debtTransaction,stockCheckLinks,publicPinState,setPublicPin,employeeSnapshot,saveEmployeeQuantities,saveSharedQuantities,getEmployeeSnapshot,orderDetail,
  productMediaCandidates,marketSearch,setProductMedia,setProductMediaCompare,setProductMediaOwnQc,clearProductMedia,
  backendOrderId,orderDisplayCode,
  getIdentity:()=>identity,getState:()=>appState.get(),
  getAccessMode:()=>employeeAccess?'employee-link':publicAccess?'public-link':'account',
  getPublicAccess:()=>publicAccess?{slug:publicAccess.slug}:null,
  getEmployeeAccess:()=>employeeAccess?{token:employeeAccess.token}:null
});

window.dispatchEvent(new CustomEvent('taphoa-production-bridge-ready'));