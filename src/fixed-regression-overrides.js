/* Targeted production fixes on top of TAPHOA_GEMINI_100_SAMPLE_FIXED.
 * Keep the FIXED markup as source of truth; only correct runtime behavior.
 */
(function(){
  'use strict';

  const logic=()=>window.TAPHOA_FIXED_REGRESSIONS;

  function normalizeSalesHeaderFixedOnly(){
    const header=document.querySelector('#tab-ban-hang > header');
    const customer=document.getElementById('saleCustomerTrigger');
    const clock=document.getElementById('currentDateStr')?.parentElement||null;
    const cart=document.getElementById('headerQuickQty')?.parentElement||null;
    const expected=[customer,clock,cart].filter(Boolean);
    if(!header||expected.length!==3)return;
    const current=Array.from(header.children||[]);
    if(current.length===expected.length&&current.every((node,index)=>node===expected[index]))return;
    logic()?.normalizeFixedSalesHeaderChildren?.(header,expected);
  }

  let salesHeaderObserver=null;
  function observeSalesHeader(){
    const header=document.querySelector('#tab-ban-hang > header');
    if(!header||salesHeaderObserver)return;
    salesHeaderObserver=new MutationObserver(()=>normalizeSalesHeaderFixedOnly());
    salesHeaderObserver.observe(header,{childList:true});
  }

  const originalShowAppScreen=showAppScreen;
  showAppScreen=function(){
    originalShowAppScreen();
    normalizeSalesHeaderFixedOnly();
    observeSalesHeader();
    requestAnimationFrame(normalizeSalesHeaderFixedOnly);
  };

  renderCongNo=function(){
    if(!hasPermission('canViewDebt'))return;
    if(!appData.khachhang||appData.khachhang.length<=1)return;
    const khRows=getCustomerRowsVisibleToCurrentRole();

    const quickDebtCustomerEl=document.getElementById('quickDebtCustomer');
    const quickDebtCustomerDisplay=document.getElementById('quickDebtCustomerDisplay');
    if(quickDebtCustomerEl&&quickDebtCustomerDisplay){
      const selectedKh=khRows.find(kh=>String(kh[0])===String(quickDebtCustomerEl.value));
      quickDebtCustomerDisplay.innerText=selectedKh?selectedKh[1]:'Chọn khách hàng';
    }

    const customerDebts={};
    const customerHistory={};
    const nowTime=Date.now();
    khRows.forEach(kh=>{
      const maKh=kh[0];
      customerDebts[maKh]={name:kh[1],debt:0,lastTime:'--',daysAgo:0};
      customerHistory[maKh]=[];
    });

    if(appData.thuchi&&appData.thuchi.length>1){
      const rawRows=appData.thuchi.slice(1);
      const rows=logic()?.sortLedgerRowsOldestFirst?.(rawRows)||rawRows;
      rows.forEach(r=>{
        const maKh=r[1];
        const loaiGd=r[2]||'Giao dịch';
        const soTien=Number(r[3])||0;
        const time=r[4]||'';
        const debt=customerDebts[maKh];
        if(!debt)return;

        // Balance always includes bookkeeping rows, even when those rows are hidden from UI.
        debt.debt+=soTien;
        const hidden=logic()?.isInternalDebtEntry?.(loaiGd)===true;
        if(hidden)return;

        if(time){
          debt.lastTime=time;
          const stamp=logic()?.parseLedgerTime?.(time);
          if(Number.isFinite(stamp)){
            const diffDays=Math.floor((nowTime-stamp)/(1000*60*60*24));
            if(diffDays>=0)debt.daysAgo=diffDays;
          }
        }
        customerHistory[maKh].push({loaiGd,soTien,time,currentDebt:debt.debt});
      });
    }

    let totalDebt=0,debtCount=0,totalSurplus=0,surplusCount=0;
    const surplusList=[],debtList=[],zeroList=[];
    customersArray=Object.keys(customerDebts).map(maKh=>({maKh,...customerDebts[maKh]}));
    customersArray.forEach(c=>{
      if(c.debt>0){totalDebt+=c.debt;debtCount++;debtList.push(c);}
      else if(c.debt<0){totalSurplus+=Math.abs(c.debt);surplusCount++;surplusList.push(c);}
      else zeroList.push(c);
    });

    document.getElementById('btnFilterNo').innerHTML=`Còn nợ${debtList.length?` (${debtList.length})`:''}`;
    document.getElementById('btnFilterDu').innerHTML=`Đang dư tiền${surplusList.length?` (${surplusList.length})`:''}`;
    document.getElementById('btnFilterHet').innerHTML=`Đã hết nợ${zeroList.length?` (${zeroList.length})`:''}`;

    let filteredList=currentDebtFilter==='du'?surplusList:(currentDebtFilter==='het'?zeroList:debtList);
    if(currentDebtFilter==='no'){
      const sortVal=document.getElementById('debtSortSelect')?.value||'days';
      filteredList.sort(sortVal==='days'?(a,b)=>b.daysAgo-a.daysAgo:(a,b)=>b.debt-a.debt);
      document.getElementById('debtGroupTitle').innerText=`Còn nợ (${filteredList.length})`;
    }else if(currentDebtFilter==='du'){
      document.getElementById('debtGroupTitle').innerText=`Đang dư tiền (${filteredList.length})`;
    }else{
      document.getElementById('debtGroupTitle').innerText=`Đã hết nợ (${filteredList.length})`;
    }

    let listHtml='';
    filteredList.forEach((c,idx)=>{
      const badgeColor=['bg-orange-500','bg-red-500','bg-purple-500','bg-blue-500','bg-emerald-500'][idx%5];
      const initials=c.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      let subText=`GD cuối: ${c.lastTime}`;
      if(currentDebtFilter==='no'&&c.debt>0)subText=`GD cuối: ${c.lastTime} · Nợ ${c.daysAgo} ngày`;
      listHtml+=`
        <div onclick="openCustomerDebtModal('${c.maKh}')" class="allow-fast-click bg-white rounded-[16px] p-3.5 shadow-sm border border-gray-100 hover:border-primary/50 cursor-pointer transition flex justify-between items-center">
          <div class="pointer-events-none flex items-center gap-3">
            <div style="width: 40px; height: 40px;" class="rounded-full ${badgeColor} text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-sm">${initials}</div>
            <div><p class="font-bold text-[14px] text-gray-900">${c.name}</p><p class="text-[11px] text-gray-400 mt-0.5">${subText}</p></div>
          </div>
          <div class="pointer-events-none text-right"><p class="font-extrabold text-[15px] ${c.debt>=0?'text-danger':'text-success'}">${c.debt.toLocaleString('vi-VN')}</p></div>
        </div>`;
    });
    if(!filteredList.length)listHtml='<p class="text-center text-gray-400 py-10 text-xs">Không có khách hàng nào trong nhóm này</p>';

    document.getElementById('totalDebtDisplay').innerText=totalDebt.toLocaleString('vi-VN');
    document.getElementById('totalDebtCount').innerText=`${debtCount} khách nợ`;
    document.getElementById('totalSurplusDisplay').innerText=totalSurplus.toLocaleString('vi-VN');
    document.getElementById('totalSurplusCount').innerText=`${surplusCount} khách dư`;
    document.getElementById('debtCustomerListContainer').innerHTML=listHtml;
    window.customerDebtHistoryData=customerHistory;
    window.customerDebtBalanceData=Object.fromEntries(Object.entries(customerDebts).map(([maKh,value])=>[maKh,value.debt]));
  };

  openCustomerDebtModal=function(maKh){
    if(!hasPermission('canViewDebt'))return denyPermission('Công nợ chỉ dành cho Owner.');
    activeDebtCustomerId=maKh;
    const kh=appData.khachhang.slice(1).find(r=>r[0]==maKh);
    if(!kh)return;
    const rawHistory=window.customerDebtHistoryData?.[maKh]||[];
    const history=logic()?.visibleDebtHistoryNewestFirst?.(rawHistory)||rawHistory.slice().reverse();

    document.getElementById('cDebtModalName').innerText='KH: '+kh[1];
    const balanceMap=window.customerDebtBalanceData||{};
    const fallback=rawHistory.length?rawHistory[rawHistory.length-1].currentDebt:0;
    const currentTotalDebt=Number(Object.prototype.hasOwnProperty.call(balanceMap,maKh)?balanceMap[maKh]:fallback)||0;
    const totalEl=document.getElementById('cDebtModalTotal');
    totalEl.innerText=currentTotalDebt.toLocaleString('vi-VN')+' đ';
    totalEl.className=`text-[18px] font-extrabold ${currentTotalDebt>=0?'text-danger':'text-success'}`;

    let html='';
    history.forEach(h=>{
      const isThu=h.soTien<0;
      const sign=isThu?'':'+';
      const badgeColor=isThu?'text-success bg-green-50':'text-danger bg-red-50';
      const iconClass=isThu?'ph-fill ph-arrow-down-left':'ph-fill ph-push-pin';
      const orderIdMatch=String(h.loaiGd||'').match(/DG\d+|DT\d+/);
      const clickAttr=orderIdMatch?`onclick="clickOrderFromDebt('${orderIdMatch[0]}')"`:'';
      const cursorStyle=orderIdMatch?'cursor-pointer hover:bg-gray-50':'';
      html+=`
        <div ${clickAttr} class="allow-fast-click flex justify-between items-center py-2.5 px-2 rounded-xl transition ${cursorStyle} border-b border-gray-100 text-xs">
          <div><p class="font-bold text-gray-900 flex items-center gap-1.5"><i class="${iconClass} ${badgeColor} p-1 rounded"></i> ${h.loaiGd} ${orderIdMatch?'<i class="ph ph-caret-right text-gray-400"></i>':''}</p><p class="text-[10px] text-gray-400 mt-0.5">${h.time}</p></div>
          <div class="text-right"><p class="font-extrabold ${isThu?'text-success':'text-danger'}">${sign}${h.soTien.toLocaleString('vi-VN')}</p><p class="text-[10px] text-gray-400 mt-0.5">Nợ ${h.currentDebt.toLocaleString('vi-VN')}</p></div>
        </div>`;
    });
    if(!history.length)html='<p class="text-center text-gray-400 py-6 text-xs">Chưa có lịch sử giao dịch</p>';
    document.getElementById('cDebtModalHistoryList').innerHTML=html;
    document.getElementById('customerDebtModalWrapper').classList.remove('hidden');
    setTimeout(()=>{
      document.getElementById('customerDebtModalWrapper').classList.remove('opacity-0','pointer-events-none');
      document.getElementById('customerDebtBottomSheet').classList.remove('translate-y-full');
    },10);
  };

  clickOrderFromDebt=function(orderId){
    const sheetName=String(orderId).startsWith('DG')?'dongiao':'dontam';
    closeCustomerDebtModal();
    viewingOrderId=orderId;
    window.activeViewingSheet=sheetName;
    setTimeout(()=>showOrderDetailMobile(orderId,sheetName),320);
  };

  window.addEventListener('taphoa-production-sync',()=>{
    normalizeSalesHeaderFixedOnly();
  });
})();
