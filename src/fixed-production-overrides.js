/* Production-only bindings for TAPHOA_GEMINI_100_SAMPLE_FIXED.html.
 * This file intentionally runs as a classic script after the complete FIXED UI runtime,
 * so it can bind that runtime's globals to the existing Supabase/business layer.
 */
(function(){
  'use strict';

  const backend=()=>window.TAPHOA_PRODUCTION;
  const sheetNames=['sanpham','khachhang','dontam','dongiao','thuchi'];

  function backendOrderIdFor(sheetName,displayId){
    const row=(appData?.[sheetName]||[]).slice(1).find(r=>String(r?.[0]||'').trim()===String(displayId||'').trim());
    return String(row?.[7]||displayId||'').trim();
  }

  const uniqueOrderIds=rows=>Array.from(new Set((rows||[]).slice(1).map(r=>String(r?.[7]||r?.[0]||'').trim()).filter(Boolean)));

  function productionRole(info){
    const role=String(info?.identity?.role||backend()?.getIdentity?.()?.role||'admin').toLowerCase();
    const normalizedRole=role === 'customer' ? 'user' : role;
    return ['owner','admin','user'].includes(normalizedRole)?normalizedRole:'admin';
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


  async function savePendingOrderItemNoteDirect(orderId,productCode,note){
    const backendId=String(orderId||'').trim();
    const targetCode=String(productCode||'').trim();
    if(!backendId||!targetCode)throw new Error('Thiếu thông tin dòng sản phẩm.');
    const detail=await backend().orderDetail(backendId);
    const order=detail?.order||detail||{};
    const status=String(order.status||order.trangThai||'').toLowerCase();
    if(status!=='pending')throw new Error('Chỉ sửa ghi chú trực tiếp ở Đơn tạm.');
    let found=false;
    const items=(Array.isArray(order.items)?order.items:[]).map((item,index)=>{
      const maSP=String(item?.maSP||item?.product_id||'').trim();
      const isTarget=maSP===targetCode;
      if(isTarget)found=true;
      return {
        maSP,
        sl:Number(item?.sl??item?.qty)||0,
        gia:Number(item?.gia??item?.unit_price)||0,
        lineNo:Number(item?.lineNo??item?.line_no)||index+1,
        ghiChu:isTarget?String(note||''):String((item?.ghiChu??item?.note)||'')
      };
    }).filter(item=>item.maSP&&item.sl>0);
    if(!found)throw new Error('Không tìm thấy sản phẩm trong đơn tạm.');
    await backend().saveOrder({
      maKH:String(order.maKH||order.customer_id||''),
      status:'pending',
      ghiChu:String((order.ghiChu??order.note)||''),
      editOrderId:backendId,
      items
    });
    await refreshFixedSheets(['dontam']);
    return true;
  }

  window.savePendingOrderItemNoteDirect=savePendingOrderItemNoteDirect;

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
      await refreshFixedSheets();
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

    const sourceSheet=editingOrderId?(editingOrderSheet||(String(editingOrderId).startsWith('DG')?'dongiao':'dontam')):tab;
    const isPromotingDraft=Boolean(editingOrderId)&&sourceSheet==='dontam'&&tab==='dongiao';
    const targetSheet=isPromotingDraft?'dongiao':sourceSheet;
    const status=targetSheet==='dongiao'?'done':'pending';
    const backendEditOrderId=editingOrderId?backendOrderIdFor(sourceSheet,editingOrderId):'';
    const items=Object.entries(cart).map(([maSP,item],index)=>({
      maSP:String(maSP),sl:Number(item.qty)||0,gia:Number(item.price)||0,lineNo:index+1,ghiChu:String(item.note||'')
    })).filter(item=>item.sl>0);

    showLoading('Đang xử lý đẩy đơn...');
    try{
      await backend().saveOrder({maKH:String(selectedCustomer.id),status,ghiChu:'',editOrderId:backendEditOrderId,items});
      showToast(isPromotingDraft?'Đã duyệt đơn sang Đã giao!':editingOrderId?'Đã cập nhật đơn thành công!':'Đã đẩy đơn thành công!','success');
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
    const backendId=backendOrderIdFor(sheetName,orderId);
    const title='Xóa đơn';
    const desc=`Bạn có chắc chắn muốn xóa đơn ${orderId} không?`;
    showConfirmModal(title,desc,'Xóa đơn','bg-danger',async()=>{
      closeOrderMobile();showLoading('Đang xóa đơn...');
      try{
        if(sheetName==='dongiao')await backend().reverseOrder(backendId,'Xóa đơn');
        else await backend().deletePending(backendId);
        await refreshFixedSheets(['dontam','dongiao','thuchi']);
        if(orderId===editingOrderId||sheetName==='dontam')resetSaleSession();
        showToast('Đã xóa đơn '+orderId,'success');
      }catch(error){showAlertPopup('Lỗi',error?.message||'Không thể xử lý đơn.');}
      finally{hideLoading();}
    });
  };

  const fixedOpenCustomerDebtModal=openCustomerDebtModal;
  openCustomerDebtModal=async function(maKh){
    if(!hasPermission('canViewDebt'))return denyPermission('Tài khoản này không được xem Công nợ.');
    try{
      const detail=await backend().debtLedger(maKh);
      const header=(appData.thuchi&&appData.thuchi[0])||['Mã GD','Mã KH','Loại GD','Số tiền','Thời gian','Dư nợ sau GD','Loại nội bộ','Mã đơn','Mã đơn DB'];
      const other=(appData.thuchi||[]).slice(1).filter(r=>String(r?.[1]||'')!==String(maKh));
      appData.thuchi=[header,...other,...backend().ledgerToRows(detail)];
      renderCongNo();
    }catch(error){console.warn('debt ledger',error);}
    return fixedOpenCustomerDebtModal(maKh);
  };

  window.addEventListener('taphoa-production-sync',()=>{
    refreshFixedSheets().catch(error=>console.warn('refresh fixed UI',error));
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
      await refreshFixedSheets();
    }catch(error){
      console.error('restore',error);
      showLoginScreen();
    }
  };
})();
