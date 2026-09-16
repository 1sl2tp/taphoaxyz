/* Production-only bindings for TAPHOA_GEMINI_100_SAMPLE_FIXED.html.
 * This file intentionally runs as a classic script after the complete FIXED UI runtime,
 * so it can bind that runtime's globals to the existing Supabase/business layer.
 */
(function(){
  'use strict';

  const backend=()=>window.TAPHOA_PRODUCTION;
  const sheetNames=['sanpham','khachhang','dontam','dongiao','thuchi'];
  const uniqueOrderIds=rows=>Array.from(new Set((rows||[]).slice(1).map(r=>String(r?.[0]||'').trim()).filter(Boolean)));
  const normalizeDebtText=value=>String(value||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[đĐ]/g,'d').toLowerCase().trim();

  function parseLedgerTime(value){
    const raw=String(value||'').trim();
    if(!raw)return Number.NaN;
    let m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if(m)return Date.UTC(Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4]),Number(m[5]),Number(m[6]||0));
    m=raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(m)return Date.UTC(Number(m[6]),Number(m[5])-1,Number(m[4]),Number(m[1]),Number(m[2]),Number(m[3]||0));
    const parsed=Date.parse(raw);
    return Number.isFinite(parsed)?parsed:Number.NaN;
  }

  function sortLedgerRowsOldestFirst(rows=[]){
    return (Array.isArray(rows)?rows:[])
      .map((row,index)=>({row,index,time:parseLedgerTime(row?.[4])}))
      .sort((a,b)=>{
        const av=Number.isFinite(a.time),bv=Number.isFinite(b.time);
        if(av&&bv&&a.time!==b.time)return a.time-b.time;
        if(av!==bv)return av?-1:1;
        return a.index-b.index;
      }).map(entry=>entry.row);
  }

  function isInternalDebtEntry(label){
    return /(^|\s)(hoan don|dao don|reverse order|reverse)(\s|$)/.test(normalizeDebtText(label));
  }

  function visibleDebtHistoryNewestFirst(history=[]){
    return (Array.isArray(history)?history:[])
      .filter(item=>!isInternalDebtEntry(item?.loaiGd))
      .map((item,index)=>({item,index,time:parseLedgerTime(item?.time)}))
      .sort((a,b)=>{
        const av=Number.isFinite(a.time),bv=Number.isFinite(b.time);
        if(av&&bv&&a.time!==b.time)return b.time-a.time;
        if(av!==bv)return av?-1:1;
        return a.index-b.index;
      }).map(entry=>entry.item);
  }

  let salesHeaderObserver=null;
  function normalizeSalesHeaderFixedOnly(){
    const header=document.querySelector('#tab-ban-hang > header');
    const customer=document.getElementById('saleCustomerTrigger');
    const clock=document.getElementById('currentDateStr')?.parentElement||null;
    const cart=document.getElementById('headerQuickQty')?.parentElement||null;
    const expected=[customer,clock,cart].filter(Boolean);
    if(!header||expected.length!==3)return;
    const allowed=new Set(expected);
    Array.from(header.children||[]).forEach(child=>{if(!allowed.has(child))header.removeChild(child);});
    expected.forEach(child=>header.appendChild(child));
  }

  function stabilizeSalesHeader(){
    normalizeSalesHeaderFixedOnly();
    const header=document.querySelector('#tab-ban-hang > header');
    if(header&&!salesHeaderObserver){
      salesHeaderObserver=new MutationObserver(()=>normalizeSalesHeaderFixedOnly());
      salesHeaderObserver.observe(header,{childList:true});
    }
    requestAnimationFrame(normalizeSalesHeaderFixedOnly);
  }

  function productionRole(info){
    const role=String(info?.identity?.role||backend()?.getIdentity?.()?.role||'admin').toLowerCase();
    return ['owner','admin','user'].includes(role)?role:'admin';
  }

  function syncSelfCustomer(info){
    const prod=backend();
    const state=prod?.getState?.()||{};
    const id=String(state?.selfCustomer?.id||state?.selfCustomer?.maKH||state?.selfCustomer?.customer_id||info?.identity?.maKH||'').trim();
    if(id){
      localStorage.setItem('APP_USER_CUSTOMER_ID',id);
      sessionStorage.setItem('APP_USER_CUSTOMER_ID',id);
    }
  }

  async function refreshFixedSheets(names=sheetNames){
    for(const name of names)await SheetDB.read(name);
  }

  SheetDB.API_URL='taphoa://production';
  SheetDB.init=function(){this.API_URL='taphoa://production';};
  SheetDB.read=async function(sheetName){
    const prod=backend();
    if(!prod)throw new Error('Production bridge chưa sẵn sàng');
    const rows=await prod.readSheet(sheetName);
    this.cache[sheetName]=Array.isArray(rows)?rows:[];
    this.notifyListeners(sheetName);
    return this.cache[sheetName];
  };

  loadData=async function(){
    const prod=backend();
    if(!prod)return;
    try{
      await prod.bootstrap();
      await refreshFixedSheets();
    }catch(error){
      console.error('load production data',error);
      showAlertPopup('Không tải được dữ liệu',error?.message||'Không thể tải dữ liệu bán hàng.');
    }
  };

  submitPreviewLogin=async function(event){
    event?.preventDefault();
    const username=String(document.getElementById('loginUsername')?.value||'').trim();
    const password=String(document.getElementById('loginPassword')?.value||'');
    if(!username||!password){
      showAlertPopup('Chưa đủ thông tin','Vui lòng nhập '+(!username?'tài khoản':'mật khẩu')+'.');
      return;
    }
    showLoading('Đang đăng nhập...');
    try{
      const info=await backend().login(username,password);
      setAuthRole(productionRole(info));
      syncSelfCustomer(info);
      document.getElementById('loginPassword').value='';
      showAppScreen();
      stabilizeSalesHeader();
      await refreshFixedSheets();
      stabilizeSalesHeader();
      showToast('Đăng nhập thành công.','success');
    }catch(error){
      console.error('login',error);
      showAlertPopup('Đăng nhập thất bại',error?.message||'Sai tài khoản hoặc mật khẩu.');
      showLoginScreen();
    }finally{hideLoading();}
  };

  logoutApp=function(){
    showConfirmModal('Thoát tài khoản?','Bạn có chắc muốn thoát khỏi tài khoản hiện tại?','Thoát','bg-danger',async()=>{
      showLoading('Đang đăng xuất...');
      try{
        await backend()?.logout?.();
        currentAuthRole='admin';
        localStorage.removeItem('APP_ROLE');
        sessionStorage.removeItem('APP_ROLE');
        localStorage.removeItem('APP_USER_CUSTOMER_ID');
        sessionStorage.removeItem('APP_USER_CUSTOMER_ID');
        resetSaleSession();
        showLoginScreen();
      }catch(error){
        showAlertPopup('Không đăng xuất được',error?.message||'Vui lòng thử lại.');
      }finally{hideLoading();}
    });
  };

  dayToanBoGioHang=async function(tab){
    if(currentAuthRole==='user'&&tab==='dongiao')return denyPermission('User chỉ được tạo Đơn tạm, không được Bán ngay.');
    if(currentAuthRole==='user'&&tab==='dontam'&&editingOrderSheet==='dongiao')return denyPermission('Đơn đã giao chỉ để xem. Hãy quay lại Bán hàng để tạo Đơn tạm mới.');
    if(tab==='dontam'&&!hasPermission('canCreateDraft'))return denyPermission('Tài khoản này không được tạo Đơn tạm.');
    if(!selectedCustomer.id){showAlertPopup('Lỗi thao tác','Vui lòng chọn khách hàng trước khi đẩy đơn!');openCustomerModal();return;}
    if(Object.keys(cart).length===0){showAlertPopup('Giỏ hàng trống','Vui lòng chọn ít nhất 1 sản phẩm!');return;}

    const targetSheet=editingOrderId?(editingOrderSheet||(String(editingOrderId).startsWith('DG')?'dongiao':'dontam')):tab;
    const status=targetSheet==='dongiao'?'done':'pending';
    const items=Object.entries(cart).map(([maSP,item],index)=>({
      maSP:String(maSP),sl:Number(item.qty)||0,gia:Number(item.price)||0,lineNo:index+1,ghiChu:String(item.note||'')
    })).filter(item=>item.sl>0);

    showLoading('Đang xử lý đẩy đơn...');
    try{
      await backend().saveOrder({maKH:String(selectedCustomer.id),status,ghiChu:'',editOrderId:String(editingOrderId||''),items});
      showToast(editingOrderId?'Đã cập nhật đơn thành công!':'Đã đẩy đơn thành công!','success');
      resetSaleSession();
      closeCartMobile();
      await refreshFixedSheets(['dontam','dongiao','thuchi']);
    }catch(error){
      console.error('save order',error);
      showAlertPopup('Lỗi',error?.message||'Không thể lưu đơn hàng.');
    }finally{hideLoading();}
  };

  submitQuickDebt=async function(type,targetMaKh=null,targetAmount=null){
    if(!hasPermission('canMutateDebt'))return denyPermission('Tài khoản này chỉ được xem Công nợ, không được Thu tiền/Ghi nợ.');
    const maKh=targetMaKh||document.getElementById('quickDebtCustomer')?.value||'';
    const amountStr=targetAmount!==null?String(targetAmount):String(document.getElementById('quickDebtAmount')?.value||'').trim();
    const amount=Number(amountStr)||0;
    if(!maKh){showAlertPopup('Chưa chọn khách','Vui lòng chọn khách hàng!');return;}
    if(amount<=0){showAlertPopup('Số tiền không hợp lệ','Vui lòng nhập số tiền lớn hơn 0!');return;}
    showLoading('Đang lập phiếu...');
    try{
      await backend().debtTransaction(maKh,type==='thu'?'thu_tien':'ghi_no',amount,type==='thu'?'Thu tiền mặt':'Ghi nợ phát sinh');
      showToast('Lập phiếu thành công!','success');
      if(targetAmount===null){const input=document.getElementById('quickDebtAmount');if(input)input.value='';}
      await SheetDB.read('thuchi');
      if(activeDebtCustomerId)await openCustomerDebtModal(activeDebtCustomerId);
    }catch(error){
      showAlertPopup('Lỗi','Không thể lưu phiếu: '+(error?.message||error));
    }finally{hideLoading();}
  };

  requestClearSheet=function(sheetName){
    if(sheetName==='dongiao')return denyPermission('Đã giao không hỗ trợ Xóa toàn bộ.');
    if(sheetName==='dontam'&&!hasPermission('canClearAllDrafts'))return denyPermission('Tài khoản này không được Xóa toàn bộ Đơn tạm.');
    const ids=uniqueOrderIds(appData[sheetName]);
    if(!ids.length){showToast('Không có đơn để xóa.','warning');return;}
    showConfirmModal('Xóa toàn bộ dữ liệu?',`Hành động này sẽ xóa sạch tất cả ${ids.length} đơn tạm. Bạn chắc chắn chứ?`,'Xóa sạch','bg-danger',async()=>{
      showLoading('Đang xóa toàn bộ...');
      try{
        await backend().batchOrders('delete_pending',ids);
        await refreshFixedSheets(['dontam','thuchi']);
        resetSaleSession();
        showToast('Đã xóa sạch đơn tạm!','success');
      }catch(error){showAlertPopup('Lỗi','Không thể xóa: '+(error?.message||error));}
      finally{hideLoading();}
    });
  };

  requestDeleteOrder=function(sheetName,orderId){
    if(currentAuthRole==='user'&&sheetName==='dongiao')return denyPermission('User không được xóa đơn đã giao.');
    const title=sheetName==='dongiao'?'Hoàn đơn đã giao':'Xóa đơn hàng';
    const desc=sheetName==='dongiao'?`Bạn có chắc chắn muốn hoàn đơn ${orderId} không?`:`Bạn có chắc chắn muốn xóa đơn ${orderId} không?`;
    showConfirmModal(title,desc,sheetName==='dongiao'?'Hoàn đơn':'Xóa đơn','bg-danger',async()=>{
      closeOrderMobile();showLoading(sheetName==='dongiao'?'Đang hoàn đơn...':'Đang xóa đơn...');
      try{
        if(sheetName==='dongiao')await backend().reverseOrder(orderId,'Hoàn đơn');
        else await backend().deletePending(orderId);
        await refreshFixedSheets(['dontam','dongiao','thuchi']);
        if(orderId===editingOrderId||sheetName==='dontam')resetSaleSession();
        showToast(sheetName==='dongiao'?'Đã hoàn đơn '+orderId:'Đã xóa đơn '+orderId,'success');
      }catch(error){showAlertPopup('Lỗi',error?.message||'Không thể xử lý đơn.');}
      finally{hideLoading();}
    });
  };

  function renderProductionDebt(){
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
      sortLedgerRowsOldestFirst(appData.thuchi.slice(1)).forEach(r=>{
        const maKh=r[1];
        const loaiGd=r[2]||'Giao dịch';
        const soTien=Number(r[3])||0;
        const time=r[4]||'';
        const debt=customerDebts[maKh];
        if(!debt)return;
        debt.debt+=soTien;
        if(isInternalDebtEntry(loaiGd))return;
        if(time){
          debt.lastTime=time;
          const stamp=parseLedgerTime(time);
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

    const noBtn=document.getElementById('btnFilterNo');
    const duBtn=document.getElementById('btnFilterDu');
    const hetBtn=document.getElementById('btnFilterHet');
    if(noBtn)noBtn.innerHTML=`Còn nợ${debtList.length?` (${debtList.length})`:''}`;
    if(duBtn)duBtn.innerHTML=`Đang dư tiền${surplusList.length?` (${surplusList.length})`:''}`;
    if(hetBtn)hetBtn.innerHTML=`Đã hết nợ${zeroList.length?` (${zeroList.length})`:''}`;

    let filteredList=currentDebtFilter==='du'?surplusList:(currentDebtFilter==='het'?zeroList:debtList);
    const title=document.getElementById('debtGroupTitle');
    if(currentDebtFilter==='no'){
      const sortVal=document.getElementById('debtSortSelect')?.value||'days';
      filteredList.sort(sortVal==='days'?(a,b)=>b.daysAgo-a.daysAgo:(a,b)=>b.debt-a.debt);
      if(title)title.innerText=`Còn nợ (${filteredList.length})`;
    }else if(currentDebtFilter==='du'){
      if(title)title.innerText=`Đang dư tiền (${filteredList.length})`;
    }else if(title)title.innerText=`Đã hết nợ (${filteredList.length})`;

    let listHtml='';
    filteredList.forEach((c,idx)=>{
      const badgeColor=['bg-orange-500','bg-red-500','bg-purple-500','bg-blue-500','bg-emerald-500'][idx%5];
      const initials=c.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      let subText=`GD cuối: ${c.lastTime}`;
      if(currentDebtFilter==='no'&&c.debt>0)subText=`GD cuối: ${c.lastTime} · Nợ ${c.daysAgo} ngày`;
      listHtml+=`<div onclick="openCustomerDebtModal('${c.maKh}')" class="allow-fast-click bg-white rounded-[16px] p-3.5 shadow-sm border border-gray-100 hover:border-primary/50 cursor-pointer transition flex justify-between items-center"><div class="pointer-events-none flex items-center gap-3"><div style="width:40px;height:40px" class="rounded-full ${badgeColor} text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-sm">${initials}</div><div><p class="font-bold text-[14px] text-gray-900">${c.name}</p><p class="text-[11px] text-gray-400 mt-0.5">${subText}</p></div></div><div class="pointer-events-none text-right"><p class="font-extrabold text-[15px] ${c.debt>=0?'text-danger':'text-success'}">${c.debt.toLocaleString('vi-VN')}</p></div></div>`;
    });
    if(!filteredList.length)listHtml='<p class="text-center text-gray-400 py-10 text-xs">Không có khách hàng nào trong nhóm này</p>';

    const totalDebtEl=document.getElementById('totalDebtDisplay');
    const totalDebtCountEl=document.getElementById('totalDebtCount');
    const totalSurplusEl=document.getElementById('totalSurplusDisplay');
    const totalSurplusCountEl=document.getElementById('totalSurplusCount');
    const list=document.getElementById('debtCustomerListContainer');
    if(totalDebtEl)totalDebtEl.innerText=totalDebt.toLocaleString('vi-VN');
    if(totalDebtCountEl)totalDebtCountEl.innerText=`${debtCount} khách nợ`;
    if(totalSurplusEl)totalSurplusEl.innerText=totalSurplus.toLocaleString('vi-VN');
    if(totalSurplusCountEl)totalSurplusCountEl.innerText=`${surplusCount} khách dư`;
    if(list)list.innerHTML=listHtml;
    window.customerDebtHistoryData=customerHistory;
    window.customerDebtBalanceData=Object.fromEntries(Object.entries(customerDebts).map(([maKh,value])=>[maKh,value.debt]));
  }

  renderCongNo=renderProductionDebt;

  clickOrderFromDebt=function(orderId){
    const sheetName=String(orderId).startsWith('DG')?'dongiao':'dontam';
    closeCustomerDebtModal();
    viewingOrderId=orderId;
    window.activeViewingSheet=sheetName;
    setTimeout(()=>showOrderDetailMobile(orderId,sheetName),320);
  };

  openCustomerDebtModal=async function(maKh){
    if(!hasPermission('canViewDebt'))return denyPermission('Tài khoản này không được xem Công nợ.');
    activeDebtCustomerId=maKh;
    try{
      const detail=await backend().debtLedger(maKh);
      const header=(appData.thuchi&&appData.thuchi[0])||['Mã GD','Mã KH','Loại GD','Số tiền','Thời gian'];
      const other=(appData.thuchi||[]).slice(1).filter(r=>String(r?.[1]||'')!==String(maKh));
      appData.thuchi=[header,...other,...backend().ledgerToRows(detail)];
      renderProductionDebt();
    }catch(error){console.warn('debt ledger',error);}

    const kh=appData.khachhang.slice(1).find(r=>r[0]==maKh);
    if(!kh)return;
    const rawHistory=window.customerDebtHistoryData?.[maKh]||[];
    const history=visibleDebtHistoryNewestFirst(rawHistory);
    const nameEl=document.getElementById('cDebtModalName');
    if(nameEl)nameEl.innerText='KH: '+kh[1];
    const balanceMap=window.customerDebtBalanceData||{};
    const fallback=rawHistory.length?rawHistory[rawHistory.length-1].currentDebt:0;
    const currentTotalDebt=Number(Object.prototype.hasOwnProperty.call(balanceMap,maKh)?balanceMap[maKh]:fallback)||0;
    const totalEl=document.getElementById('cDebtModalTotal');
    if(totalEl){
      totalEl.innerText=currentTotalDebt.toLocaleString('vi-VN')+' đ';
      totalEl.className=`text-[18px] font-extrabold ${currentTotalDebt>=0?'text-danger':'text-success'}`;
    }

    let html='';
    history.forEach(h=>{
      const isThu=h.soTien<0;
      const sign=isThu?'':'+';
      const badgeColor=isThu?'text-success bg-green-50':'text-danger bg-red-50';
      const iconClass=isThu?'ph-fill ph-arrow-down-left':'ph-fill ph-push-pin';
      const orderIdMatch=String(h.loaiGd||'').match(/DG\d+|DT\d+/i);
      const orderId=orderIdMatch?orderIdMatch[0].toUpperCase():'';
      const clickAttr=orderId?`onclick="clickOrderFromDebt('${orderId}')"`:'';
      const cursorStyle=orderId?'cursor-pointer hover:bg-gray-50':'';
      html+=`<div ${clickAttr} class="allow-fast-click flex justify-between items-center py-2.5 px-2 rounded-xl transition ${cursorStyle} border-b border-gray-100 text-xs"><div><p class="font-bold text-gray-900 flex items-center gap-1.5"><i class="${iconClass} ${badgeColor} p-1 rounded"></i> ${h.loaiGd} ${orderId?'<i class="ph ph-caret-right text-gray-400"></i>':''}</p><p class="text-[10px] text-gray-400 mt-0.5">${h.time}</p></div><div class="text-right"><p class="font-extrabold ${isThu?'text-success':'text-danger'}">${sign}${h.soTien.toLocaleString('vi-VN')}</p><p class="text-[10px] text-gray-400 mt-0.5">Nợ ${h.currentDebt.toLocaleString('vi-VN')}</p></div></div>`;
    });
    if(!history.length)html='<p class="text-center text-gray-400 py-6 text-xs">Chưa có lịch sử giao dịch</p>';
    const historyEl=document.getElementById('cDebtModalHistoryList');
    if(historyEl)historyEl.innerHTML=html;
    const wrapper=document.getElementById('customerDebtModalWrapper');
    const sheet=document.getElementById('customerDebtBottomSheet');
    if(wrapper){
      wrapper.classList.remove('hidden');
      setTimeout(()=>{
        wrapper.classList.remove('opacity-0','pointer-events-none');
        sheet?.classList.remove('translate-y-full');
      },10);
    }
  };

  window.addEventListener('taphoa-production-sync',()=>{
    refreshFixedSheets().then(()=>stabilizeSalesHeader()).catch(error=>console.warn('refresh fixed UI',error));
  });

  window.onload=async function(){
    loadUiPreferences();
    const apiInput=document.getElementById('inputScriptUrl');
    if(apiInput){apiInput.value='taphoa://production';apiInput.readOnly=true;}
    try{
      const info=await backend().restore();
      if(!info){showLoginScreen();return;}
      setAuthRole(productionRole(info));
      syncSelfCustomer(info);
      showAppScreen();
      stabilizeSalesHeader();
      await refreshFixedSheets();
      stabilizeSalesHeader();
    }catch(error){
      console.error('restore',error);
      showLoginScreen();
    }
  };
})();
