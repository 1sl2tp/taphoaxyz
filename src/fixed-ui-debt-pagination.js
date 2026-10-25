/* DEBT-223 — cursor-paged financial ledger in the existing bounded debt list.
   Newest appears at top; older rows append when the user scrolls DOWN.
   Never writes ledger money, never reorders by rounded local UI timestamps.
   A visible "Xem thêm" button is always available as the scroll fallback. */
(function(){
 'use strict';
 const PAGE_SIZE=50;
 const NEAR_END_PX=180;
 const element=()=>document.getElementById('cDebtModalHistoryList');
 const wrapper=()=>document.getElementById('customerDebtModalWrapper');
 const backend=()=>window.TAPHOA_PRODUCTION;
 const page=()=>window.TAPHOA_DEBT_PAGE_STATE;
 let openSeq=0;
 let attachedList=null;

 function isVisible(){
   const root=wrapper();
   return !!root && !root.classList.contains('hidden')
     && !root.classList.contains('pointer-events-none');
 }
 function samePage(state){
   return !!state && page()===state
     && String(typeof activeDebtCustomerId==='undefined'?'':activeDebtCustomerId||'')===state.customerId
     && isVisible();
 }
 function oldest(rows){
   return Array.isArray(rows)&&rows.length?rows[rows.length-1]:null;
 }
 function cursor(row){
   const at=String(row?.ngay||row?.created_at||row?.occurred_at||'');
   const id=String(row?.id??'');
   return at && /^\d+$/.test(id)?{beforeAt:at,beforeId:id}:null;
 }
 function footer(){
   const list=element();
   if(!list)return null;
   let panel=list.querySelector('#debtHistoryPageFooter');
   if(!panel){
     panel=document.createElement('div');
     panel.id='debtHistoryPageFooter';
     panel.className='debt-history-more';
     panel.setAttribute('role','status');
     panel.setAttribute('aria-live','polite');
     const message=document.createElement('span');
     message.id='debtHistoryMoreText';
     const button=document.createElement('button');
     button.type='button';button.id='debtHistoryMoreButton';
     button.className='debt-history-more-button';
     button.textContent='Xem thêm giao dịch cũ';
     button.addEventListener('click',()=>void loadOlder());
     panel.append(message,button);list.appendChild(panel);
   }
   return panel;
 }
 function updateFooter(){
   const state=page(),panel=footer();
   if(!panel)return;
   const label=panel.querySelector('#debtHistoryMoreText');
   const button=panel.querySelector('#debtHistoryMoreButton');
   const count=state?.transactions?.length||0;
   if(!state){panel.hidden=true;return;}
   panel.hidden=false;
   button.hidden=!state.hasMore;
   button.disabled=!!state.loading;
   button.textContent=state.loading?'Đang tải…':'Xem thêm giao dịch cũ';
   label.textContent=state.loading?'Đang tải thêm các dòng công nợ cũ…':
     state.failed?'Tải tin cũ thất bại. Bấm xem thêm để thử lại.':
     state.hasMore?'Đã hiển thị '+count+' dòng · Cuộn xuống cuối để tải tiếp':
       'Đã hiển thị toàn bộ '+count+' giao dịch';
 }
 function bindScroll(){
   const list=element();
   if(!list)return;
   if(attachedList===list)return;
   attachedList=list;
   list.addEventListener('scroll',()=>{
     const state=page();
     if(!samePage(state)||!state.hasMore||state.loading)return;
     if(list.scrollHeight-list.scrollTop-list.clientHeight<=NEAR_END_PX)
       void loadOlder();
   },{passive:true});
 }
 function renderPage(state){
   if(!samePage(state))return;
   const sheet=Array.isArray(appData.thuchi)?appData.thuchi:[];
   const header=sheet[0]||['Mã GD','Mã KH','Loại GD','Số tiền','Thời gian','Dư nợ sau GD','Loại nội bộ','Mã đơn','Mã đơn DB'];
   const others=sheet.slice(1).filter(row=>String(row?.[1]||'')!==state.customerId);
   const detail={customer:state.customer,balance:state.balance,soDu:state.balance,
     transactions:state.transactions};
   appData.thuchi=[header,...others,...backend().ledgerToRows(detail)];
   renderCongNo();
   // In-place re-render: no modal open, no auto-scroll to newest, no animation.
   window.TAPHOA_RENDER_DEBT_HISTORY_PAGE?.(state.customerId);
   bindScroll();
   updateFooter();
 }
 async function loadOlder(){
   const state=page();
   if(!samePage(state)||state.loading||!state.hasMore)return false;
   const last=cursor(oldest(state.transactions));
   if(!last){state.failed=true;updateFooter();return false;}
   state.loading=true;state.failed=false;updateFooter();
   const token=state.requestSeq,serial=openSeq;
   const promise=(async()=>{
     try{
       const detail=await backend().debtLedger(state.customerId,{
         beforeAt:last.beforeAt,beforeId:last.beforeId,limit:PAGE_SIZE
       });
       if(!samePage(state)||openSeq!==serial||page()?.requestSeq!==token)return false;
       const rows=Array.isArray(detail?.transactions)?detail.transactions:[];
       const existing=new Set(state.transactions.map(row=>String(row.id)));
       const fresh=rows.filter(row=>row&&row.id!=null&&!existing.has(String(row.id)));
       if(rows.length&&fresh.length===0)throw Error('duplicate_older_page');
       if(fresh.length){
         state.transactions.push(...fresh);
         state.hasMore=rows.length===PAGE_SIZE;
         renderPage(state);
       }else state.hasMore=false;
       state.failed=false;
       return true;
     }catch(error){
       if(samePage(state)&&openSeq===serial){
         state.failed=true;
         console.warn('[taphoa] older debt history:',String(error?.message||error));
       }
       return false;
     }finally{
       state.loading=false;
       if(page()===state)updateFooter();
     }
   })();
   return await promise;
 }
 function scheduleFirstCheck(state,serial){
   setTimeout(()=>{
     if(openSeq!==serial||!samePage(state))return;
     bindScroll();updateFooter();
     const list=element();
     // If fewer than a viewport of entries, preload once so the user can
     // reach older dates. Otherwise loading is driven only by scroll/button.
     if(state.hasMore&&list&&list.scrollHeight<=list.clientHeight+NEAR_END_PX)
       void loadOlder();
   },25);
 }

 const previous=window.openCustomerDebtModal;
 if(typeof previous!=='function')return;
 window.openCustomerDebtModal=async function(customerId,...args){
   const serial=++openSeq;
   const result=await previous.call(this,customerId,...args);
   if(serial!==openSeq)return result;
   const state=page();
   if(!state||state.customerId!==String(customerId||''))return result;
   scheduleFirstCheck(state,serial);
   return result;
 };
 window.TAPHOA_DEBT_PAGE_CONTROLS=Object.freeze({
   loadOlder,updateFooter,
   inspect:()=>{const s=page();return s?{
     customerId:s.customerId,loaded:s.transactions.length,
     hasMore:s.hasMore,loading:s.loading,failed:s.failed
   }:null;}
 });
})();
