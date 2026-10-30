/* Production-only bindings for TAPHOA_GEMINI_100_SAMPLE_FIXED.html.
 * This file intentionally runs as a classic script after the complete FIXED UI runtime,
 * so it can bind that runtime's globals to the existing Supabase/business layer.
 */
(function(){
  'use strict';

  const backend=()=>window.TAPHOA_PRODUCTION;
  const sheetNames=['sanpham','khachhang','dontam','dongiao','thuchi'];
  const sheetReadTokens=new Map();
  let orderMutationInFlight=false;
  let loginInFlight=false;
  // A second tap must not create a second financial command while the first is pending.
  let debtMutationInFlight=false;
  const sheetNamesByDomain=Object.freeze({
    products:['sanpham'],
    customers:['khachhang'],
    orders:['dontam','dongiao'],
    debt:['thuchi'],
    settings:[]
  });

  function sheetsForChangedDomains(changed=[]){
    const names=[];
    const seen=new Set();
    for(const domain of changed){
      for(const name of sheetNamesByDomain[String(domain)]||[]){
        if(seen.has(name))continue;
        seen.add(name);
        names.push(name);
      }
    }
    return names;
  }

  function backendOrderIdFor(sheetName,displayId){
    const displayKey=String(displayId||'').trim();
    const row=(appData?.[sheetName]||[]).slice(1).find(r=>String(r?.[0]||'').trim()===displayKey);
    const rowBackendId=String(row?.[7]||'').trim();
    if(rowBackendId)return rowBackendId;

    const prod=backend();
    const state=prod?.getState?.()||{};
    const match=(state.orders||[]).find(order=>{
      const code=String(prod?.orderDisplayCode?.(order)||order?.displayCode||order?.display_code||order?.maDon||'').trim();
      return code===displayKey;
    });
    return String(
      match
        ?(prod?.backendOrderId?.(match)||match?.backendOrderId||match?.order_id||match?.id||'')
        :''
    ).trim();
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
    // All sheets are projections of the same already-fetched appState.
    // Dispatch each unique sheet once without waiting on serial microtasks.
    await Promise.all([...new Set(names)].map(name=>SheetDB.read(name)));
  }

  async function refreshOrderUiAfterMutation(){
    // Keep the scroll owner of each order tab at its pre-edit position.
    // Do not change scroll behavior when switching filters or tabs normally.
    const nodes = ['pendingOrderListContainer','completedOrderListContainer']
      .map(id=>document.getElementById(id)?.closest('.overflow-y-auto'))
      .filter((node,index,array)=>node&&array.indexOf(node)===index)
      .map(node=>({node,top:node.scrollTop}));
    const restorePosition=()=>{
      for(const {node,top} of nodes){
        if(node.isConnected)node.scrollTop=top;
      }
    };
    try{
      await refreshFixedSheets(['dontam','dongiao','thuchi']);
      restorePosition();
      requestAnimationFrame(restorePosition);
    }catch(refreshError){
      console.warn('refresh order UI after successful mutation',refreshError);
      setTimeout(()=>{
        refreshFixedSheets(['dontam','dongiao','thuchi'])
          .then(()=>{restorePosition();requestAnimationFrame(restorePosition);})
          .catch(error=>console.warn('retry refresh order UI',error));
      },500);
    }
  }


  const pendingOrderNoteSaves=new Map();
  async function savePendingOrderItemNoteDirect(orderId,productCode,note){
    const backendId=String(orderId||'').trim();
    const targetCode=String(productCode||'').trim();
    if(!backendId||!targetCode)throw new Error('Thiếu thông tin dòng sản phẩm.');
    const noteSession=backend()?.getIdentity?.();
    const noteAccessMode=backend()?.getAccessMode?.();
    const noteOwnerCurrent=()=>backend()?.getIdentity?.()===noteSession
      &&backend()?.getAccessMode?.()===noteAccessMode;
    if(!noteSession)throw new Error('Phiên tài khoản không còn hợp lệ.');
    // SPEC-ORDER-NOTE-SERIAL: each update must read the preceding committed
    // version, or editing two different lines can silently lose the first note.
    const previous=pendingOrderNoteSaves.get(backendId)||Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      // A queued edit must not be sent using a newer account's credentials.
      if(!noteOwnerCurrent())throw new Error('Phiên tài khoản đã thay đổi. Mở lại đơn tạm trước khi lưu.');
      const detail=await backend().orderDetail(backendId);
      if(!noteOwnerCurrent())throw new Error('Phiên tài khoản đã thay đổi. Mở lại đơn tạm trước khi lưu.');
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
      if(!noteOwnerCurrent())throw new Error('Phiên tài khoản đã thay đổi. Mở lại đơn tạm trước khi lưu.');
      const result=await backend().saveOrder({
        maKH:String(order.maKH||order.customer_id||''),
        status:'pending',
        ghiChu:String((order.ghiChu??order.note)||''),
        editOrderId:backendId,
        items
      });
      if(result?.ok!==true)throw new Error('Không thể lưu ghi chú đơn tạm.');
      if(!noteOwnerCurrent())return true;
      // The DB write has committed. A UI-only repaint failure is not a
      // failed order mutation and must not invite a duplicate save.
      try{await refreshFixedSheets(['dontam']);}
      catch(error){console.warn('refresh saved order note UI',error);}
      return true;
    });
    pendingOrderNoteSaves.set(backendId,task);
    try{return await task;}
    finally{if(pendingOrderNoteSaves.get(backendId)===task)pendingOrderNoteSaves.delete(backendId);}
  }

  window.savePendingOrderItemNoteDirect=savePendingOrderItemNoteDirect;

  SheetDB.API_URL='taphoa://production';
  SheetDB.init=function(){this.API_URL='taphoa://production';};
  SheetDB.read=async function(sheetName){
    const prod=backend();
    if(!prod)throw new Error('Production bridge chưa sẵn sàng');
    // SPEC-SHEET-READ-OWNER: only the latest read for this sheet and
    // account may replace the visible cache or notify its subscribers.
    const token=(sheetReadTokens.get(sheetName)||0)+1;
    sheetReadTokens.set(sheetName,token);
    const sessionIdentity=prod.getIdentity?.();
    const uid=String(sessionIdentity?.uid||'');
    const mode=String(prod.getAccessMode?.()||'');
    const rows=await prod.readSheet(sheetName);
    if(sheetReadTokens.get(sheetName)!==token||
       prod.getIdentity?.()!==sessionIdentity||
       String(prod.getIdentity?.()?.uid||'')!==uid||
       String(prod.getAccessMode?.()||'')!==mode){
      return this.cache[sheetName]||[];
    }
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
    if(loginInFlight)return;
    const username=String(document.getElementById('loginUsername')?.value||'').trim();
    const password=String(document.getElementById('loginPassword')?.value||'');
    if(!username||!password){
      showAlertPopup('Chưa đủ thông tin','Vui lòng nhập '+(!username?'tài khoản':'mật khẩu')+'.');
      return;
    }
    loginInFlight=true;
    let loginIdentity=null;
    showLoading('Đang đăng nhập...');
    try{
      const info=await backend().login(username,password);
      if(!info?.identity)throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng thử lại.');
      loginIdentity=info.identity;
      // Login can be superseded by another link/session while async reads
      // finish. Only the exact authenticated session may open the account UI.
      if(backend()?.getIdentity?.()!==loginIdentity)return;
      setAuthRole(productionRole(info));
      syncSelfCustomer(info);
      document.getElementById('loginPassword').value='';
      // Do not expose the preceding account's SheetDB rows while B loads.
      await refreshFixedSheets();
      if(backend()?.getIdentity?.()!==loginIdentity)return;
      // A fresh account must not inherit a previously edited order/cart.
      // The sheets are now the new user's, so self-customer selection is safe.
      resetSaleSession();
      window.__TAPHOA_REPRICE_DRAFT_ID=null;
      showAppScreen();
      showToast('Đăng nhập thành công.','success');
    }catch(error){
      // A failed projection belonging to A must not close B's app or show
      // misleading "login failed" over the newer authenticated session.
      if(loginIdentity&&backend()?.getIdentity?.()!==loginIdentity)return;
      console.error('login',error);
      showAlertPopup('Đăng nhập thất bại',error?.message||'Sai tài khoản hoặc mật khẩu.');
      showLoginScreen();
    }finally{
      loginInFlight=false;
      hideLoading();
    }
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

  // A draft-to-delivered click must never silently discard unsaved cart edits.
  // It intentionally does NOT save automatically: first update the draft,
  // then use the existing single delivery command for precise accounting.
  async function assertDraftAlreadySavedForDelivery(orderId,customerId,cartItems){
    const detail=await backend().orderDetail(orderId);
    const saved=detail?.order||detail;
    if(!saved||String(saved.status||saved.trangThai||'').toLowerCase()!=='pending'){
      throw new Error('Đơn đã thay đổi trạng thái. Mở lại đơn trước khi giao.');
    }
    if(String(saved.customer_id||saved.maKH||'')!==String(customerId||'')){
      throw new Error('Khách đang chọn không khớp với đơn tạm đã lưu.');
    }
    const normalize=rows=>(Array.isArray(rows)?rows:[]).map(item=>[
      String(item.product_id||item.maSP||'').trim(),
      Number(item.qty??item.sl)||0,
      Number(item.unit_price??item.gia)||0,
      String(item.note??item.ghiChu??'').trim()
    ]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const current=normalize(cartItems),persisted=normalize(saved.items);
    if(JSON.stringify(current)!==JSON.stringify(persisted)){
      throw new Error('Đơn tạm có thay đổi chưa lưu. Bấm Cập nhật đơn trước khi chuyển sang Đã giao.');
    }
  }

  dayToanBoGioHang=async function(tab){
    if(orderMutationInFlight)return;
    if(typeof cartPriceRefreshInFlight !== 'undefined' && cartPriceRefreshInFlight){
      showAlertPopup('Đang cập nhật giá','Vui lòng chờ lấy giá mới xong trước khi lưu đơn.');return;
    }
    if(currentAuthRole==='user'&&tab==='dongiao')return denyPermission('User chỉ được tạo Đơn tạm, không được Bán ngay.');
    if(currentAuthRole==='user'&&tab==='dontam'&&editingOrderSheet==='dongiao')return denyPermission('Đơn đã giao chỉ để xem. Hãy quay lại Bán hàng để tạo Đơn tạm mới.');
    if(tab==='dontam'&&!hasPermission('canCreateDraft'))return denyPermission('Tài khoản này không được tạo Đơn tạm.');
    if(!selectedCustomer.id){showAlertPopup('Lỗi thao tác','Vui lòng chọn khách hàng trước khi đẩy đơn!');openCustomerModal();return;}
    if(Object.keys(cart).length===0){showAlertPopup('Giỏ hàng trống','Vui lòng chọn ít nhất 1 sản phẩm!');return;}

    const sourceSheet=editingOrderId?(editingOrderSheet||(String(editingOrderId).startsWith('DG')?'dongiao':'dontam')):tab;
    const isPromotingDraft=Boolean(editingOrderId)&&sourceSheet==='dontam'&&tab==='dongiao';
    // F-182: editing an existing order is not a new checkout.
    // Keep the current customer, order ID and cart in the edit workspace after save.
    const isUpdatingExistingOrder=Boolean(editingOrderId)&&!isPromotingDraft;
    const targetSheet=isPromotingDraft?'dongiao':sourceSheet;
    const status=targetSheet==='dongiao'?'done':'pending';
    let backendEditOrderId=editingOrderId?backendOrderIdFor(sourceSheet,editingOrderId):'';
    const stagedNewCost = Boolean(editingOrderId)
      && String(window.__TAPHOA_REPRICE_DRAFT_ID||'')===String(editingOrderId);
    const refreshCostSnapshot = stagedNewCost && sourceSheet==='dontam'
      && !isPromotingDraft && currentAuthRole!=='user';
    if(isPromotingDraft && stagedNewCost){
      showAlertPopup('Giá mới chưa được lưu','Bấm Cập nhật đơn để lưu giá trước khi chuyển sang Đã giao.');
      return;
    }
    const items=Object.entries(cart)
      .sort(([,a],[,b])=>(Number(b.__lastTouched)||0)-(Number(a.__lastTouched)||0))
      .map(([maSP,item],index)=>({
        maSP:String(maSP),sl:Number(item.qty)||0,gia:Number(item.price)||0,lineNo:index+1,ghiChu:String(item.note||'')
      })).filter(item=>item.sl>0);

    orderMutationInFlight=true;
    let committed=false;
    showLoading(isPromotingDraft?'Đang chuyển đơn sang Đã giao...':'Đang xử lý đẩy đơn...');
    try{
      if(editingOrderId&&!backendEditOrderId){
        await refreshFixedSheets([sourceSheet]);
        backendEditOrderId=backendOrderIdFor(sourceSheet,editingOrderId);
      }
      if(editingOrderId&&!backendEditOrderId)throw new Error('Không tìm thấy đơn gốc. Chưa lưu để tránh tạo đơn khác.');

      if(isPromotingDraft){
        await assertDraftAlreadySavedForDelivery(backendEditOrderId,selectedCustomer.id,items);
        const result=await backend().deliverOrder(backendEditOrderId);
        if(result?.ok!==true)throw new Error('Không thể chuyển đơn tạm sang Đã giao.');
      }else{
        const result=await backend().saveOrder({maKH:String(selectedCustomer.id),status,ghiChu:'',editOrderId:backendEditOrderId,items,refreshCostSnapshot});
        if(result?.ok!==true)throw new Error('Không thể lưu đơn hàng.');
      }

      committed=true;
      showToast(isPromotingDraft?'Đã duyệt đơn sang Đã giao!':isUpdatingExistingOrder?'Đã cập nhật đơn thành công!':'Đã đẩy đơn thành công!','success');
      window.__TAPHOA_REPRICE_DRAFT_ID = null;
    }catch(error){
      console.error(isPromotingDraft?'deliver pending order':'save order',error);
      showAlertPopup('Lỗi',error?.message||'Không thể lưu đơn hàng.');
    }finally{
      orderMutationInFlight=false;
      hideLoading();
    }
    if(committed){
      if(isUpdatingExistingOrder){
        // Do NOT resetSaleSession() or closeCartMobile(): both erase the
        // very order the Admin just updated. Stay on "Cập nhật đơn" with
        // the same existing backend ID; further saves must update, not create.
        editingOrderInSaleMode=true;
        try{
          renderCartUI();
          renderCartFooterActions();
        }catch(uiError){
          // The canonical Supabase mutation has already committed; a local
          // repaint failure must never be reported as a failed financial write.
          console.warn('render updated order workspace',uiError);
        }
      }else{
        // New orders and draft-to-delivered promotions really end checkout.
        resetSaleSession();
        closeCartMobile();
      }
      // The backend already awaited canonical orders/debt data.
      // Repainting hidden lists is not part of the financial transaction.
      setTimeout(()=>refreshOrderUiAfterMutation()
        .catch(error=>console.warn('refresh committed order UI',error)),16);
    }
  };

  submitQuickDebt=async function(type,targetMaKh=null,targetAmount=null){
    if(debtMutationInFlight)return;
    if(!hasPermission('canMutateDebt'))return denyPermission('Tài khoản này chỉ được xem Công nợ, không được Thu tiền/Ghi nợ.');
    const maKh=targetMaKh||document.getElementById('quickDebtCustomer')?.value||'';
    const amountStr=targetAmount!==null?String(targetAmount):String(document.getElementById('quickDebtAmount')?.value||'').trim();
    const amount=typeof parseDebtAmountValue==='function'
      ? parseDebtAmountValue(amountStr)
      : Number(String(amountStr).replace(/\D/g,''))||0;
    if(!maKh){showAlertPopup('Chưa chọn khách','Vui lòng chọn khách hàng!');return;}
    if(amount<=0){showAlertPopup('Số tiền không hợp lệ','Vui lòng nhập số tiền lớn hơn 0!');return;}
    debtMutationInFlight=true;
    let committed=false;
    showLoading('Đang lập phiếu...');
    try{
      await backend().debtTransaction(maKh,type==='thu'?'thu_tien':'ghi_no',amount,type==='thu'?'Thu tiền mặt':'Ghi nợ phát sinh');
      committed=true;
      showToast('Lập phiếu thành công!','success');
      if(targetAmount===null){const input=document.getElementById('quickDebtAmount');if(input)input.value='';}
    }catch(error){
      showAlertPopup('Lỗi','Không thể lưu phiếu: '+(error?.message||error));
    }finally{
      debtMutationInFlight=false;
      hideLoading();
    }
    if(committed){
      // SheetDB debt listener refreshes the open customer ledger once.
      setTimeout(()=>SheetDB.read('thuchi')
        .catch(error=>console.warn('refresh committed debt UI',error)),16);
    }
  };

  requestClearSheet=function(sheetName){
    if(sheetName==='dongiao')return denyPermission('Đã giao không hỗ trợ Xóa toàn bộ.');
    if(sheetName==='dontam'&&!hasPermission('canClearAllDrafts'))return denyPermission('Tài khoản này không được Xóa toàn bộ Đơn tạm.');
    const ids=uniqueOrderIds(appData[sheetName]);
    if(!ids.length){showToast('Không có đơn để xóa.','warning');return;}
    showConfirmModal('Xóa toàn bộ dữ liệu?',`Hành động này sẽ xóa sạch tất cả ${ids.length} đơn tạm. Bạn chắc chắn chứ?`,'Xóa sạch','bg-danger',async()=>{
      if(orderMutationInFlight)return;
      orderMutationInFlight=true;
      showLoading('Đang xóa toàn bộ...');
      try{
        await backend().batchOrders('delete_pending',ids);
        resetSaleSession();
        showToast('Đã xóa sạch đơn tạm!','success');
        // The committed delete is not undone by a stale/failed UI projection.
        try{await refreshFixedSheets(['dontam','thuchi']);}
        catch(refreshError){console.warn('refresh deleted draft orders',refreshError);}
      }catch(error){showAlertPopup('Lỗi','Không thể xóa: '+(error?.message||error));}
      finally{orderMutationInFlight=false;hideLoading();}
    });
  };

  requestDeleteOrder=function(sheetName,orderId){
    if(currentAuthRole==='user'&&sheetName==='dongiao')return denyPermission('User không được xóa đơn đã giao.');
    const backendId=backendOrderIdFor(sheetName,orderId);
    const title='Xóa đơn';
    const desc=`Bạn có chắc chắn muốn xóa đơn ${orderId} không?`;
    showConfirmModal(title,desc,'Xóa đơn','bg-danger',async()=>{
      if(orderMutationInFlight)return;
      orderMutationInFlight=true;
      closeOrderMobile();showLoading('Đang xóa đơn...');
      try{
        if(sheetName==='dongiao')await backend().reverseOrder(backendId,'Xóa đơn');
        else await backend().deletePending(backendId);
        if(orderId===editingOrderId||sheetName==='dontam')resetSaleSession();
        showToast('Đã xóa đơn '+orderId,'success');
        try{await refreshFixedSheets(['dontam','dongiao','thuchi']);}
        catch(refreshError){console.warn('refresh deleted order UI',refreshError);}
      }catch(error){showAlertPopup('Lỗi',error?.message||'Không thể xử lý đơn.');}
      finally{orderMutationInFlight=false;hideLoading();}
    });
  };

  // DEBT-223: cursor belongs to server's raw timestamp + ledger ID.
  // Never infer a cursor from a rendered HH:mm date or cache.
  let debtModalOpenSeq=0;
  const fixedOpenCustomerDebtModal=openCustomerDebtModal;
  openCustomerDebtModal=async function(maKh){
    if(!hasPermission('canViewDebt'))return denyPermission('Tài khoản này không được xem Công nợ.');
    const requestedCustomer=String(maKh||'');
    const requestSeq=++debtModalOpenSeq;
    const prod=backend();
    const ownerIdentity=prod?.getIdentity?.();
    const ownerUid=String(ownerIdentity?.uid||'');
    const ownerMode=String(prod?.getAccessMode?.()||'');
    const ownerCurrent=()=>requestSeq===debtModalOpenSeq
      &&prod?.getIdentity?.()===ownerIdentity
      &&String(prod?.getIdentity?.()?.uid||'')===ownerUid
      &&String(prod?.getAccessMode?.()||'')===ownerMode;
    window.TAPHOA_DEBT_PAGE_STATE=null;
    try{
      const detail=await prod.debtLedger(maKh,{limit:50});
      if(!ownerCurrent())return false;
      const raw=Array.isArray(detail?.transactions)?detail.transactions:[];
      window.TAPHOA_DEBT_PAGE_STATE={
        customerId:requestedCustomer,requestSeq,
        customer:detail.customer||{},balance:detail.balance??detail.soDu,
        transactions:raw.slice(),hasMore:raw.length===50,
        loading:false,failed:false
      };
      const header=(appData.thuchi&&appData.thuchi[0])||['Mã GD','Mã KH','Loại GD','Số tiền','Thời gian','Dư nợ sau GD','Loại nội bộ','Mã đơn','Mã đơn DB'];
      const other=(appData.thuchi||[]).slice(1).filter(r=>String(r?.[1]||'')!==requestedCustomer);
      appData.thuchi=[header,...other,...backend().ledgerToRows(detail)];
      renderCongNo();
    }catch(error){
      if(!ownerCurrent())return false;
      console.warn('debt ledger',error);
      window.TAPHOA_DEBT_PAGE_STATE=null;
      showAlertPopup('Chưa tải được sổ nợ mới',
        'Lịch sử công nợ chưa được đồng bộ từ sổ chính. Vui lòng thử mở lại. Không dùng dữ liệu cũ để xác nhận thu.');
      return false;
    }
    if(!ownerCurrent())return false;
    const opened=fixedOpenCustomerDebtModal(maKh);
    // Do not run follow-up image repair for an obsolete ledger/account.
    void Promise.resolve(opened)
      .then(()=>{if(ownerCurrent())return prod?.repairRecentFinanceImages?.(maKh);})
      .catch(error=>console.warn('debt notice repair',error));
    return opened;
  };

  window.addEventListener('taphoa-finance-images-repaired',event=>{
    const count=Number(event?.detail?.count)||0;
    if(count>0)showToast('Đã bổ sung '+count+' ảnh công nợ vào Chat test','success');
  });


  const PUBLIC_LINK_SESSION_KEY='taphoa.public.link.v1';
  const EMPLOYEE_LINK_SESSION_KEY='taphoa.employee.link.v1';
  let sharedCartSaveTimer=0;
  let sharedCartSaveChain=Promise.resolve();
  let sharedCartPoll=0;
  let sharedCartSignature='';
  let sharedCartLocalWriteAt=0;
  let sharedCartLocalEditSeq=0;
  let sharedCartCommittedEditSeq=0;
  let sharedCartPollRequestSeq=0;
  let sharedCartPollInFlight=false;
  let sharedCartPollStartedAt=0;
  let sharedCartRetryTimer=0;
  let sharedCartRetryCount=0;
  let sharedCartRetryReady=false;
  const SHARED_CART_DRAFT_KEY='taphoa.shared-cart.pending.v1.';
  const SHARED_CART_DRAFT_MAX_AGE=30*60*1000;
  let publicTabId='tab-ban-hang';

  function employeeQuery(){
    const p=new URLSearchParams(location.search);
    return {
      active:String(p.get('employee')||'')==='1',
      token:String(p.get('t')||'').trim()
    };
  }

  function employeeStoredAccess(){
    try{
      const value=JSON.parse(sessionStorage.getItem(EMPLOYEE_LINK_SESSION_KEY)||'null');
      if(!value?.token||!value?.pin)return null;
      return {token:String(value.token),pin:String(value.pin)};
    }catch{return null;}
  }

  function employeeGateUrl(token){
    const p=new URLSearchParams();
    if(token)p.set('t',String(token));
    return '/kiemhang/?'+p.toString();
  }

  function publicQuery(){
    const p=new URLSearchParams(location.search);
    return {
      kh:String(p.get('kh')||'').trim().toLowerCase(),
      tab:String(p.get('tab')||'hang').trim().toLowerCase(),
      muc:String(p.get('muc')||'').trim().toLowerCase(),
      nguon:String(p.get('nguon')||'').trim().toLowerCase(),
      don:String(p.get('don')||'').trim().toUpperCase()
    };
  }

  function publicStoredAccess(){
    try{
      const value=JSON.parse(sessionStorage.getItem(PUBLIC_LINK_SESSION_KEY)||'null');
      if(!value?.kh)return null;
      return {
        kh:String(value.kh).toLowerCase(),
        pin:String(value.pin||''),
        mode:String(value.mode||'pin')
      };
    }catch{return null;}
  }

  function publicGateUrl(){
    const p=new URLSearchParams(location.search);
    return '/kh/?'+p.toString();
  }

  function sourceKeyFromCurrentFilter(){
    const current=String(window.currentFilter||currentFilter||'Tất cả').trim();
    if(!current||current==='Tất cả')return '';
    const sources=backend()?.getState?.()?.sources||[];
    const found=sources.find(row=>String(row?.name||row?.ten||'').trim()===current);
    return String(found?.id||found?.key||found?.source_key||'').trim();
  }

  function publicCustomerLink(){
    const q=publicQuery();
    const p=new URLSearchParams();
    p.set('kh',q.kh);
    p.set('tab',publicTabId==='tab-cong-no'?'no':publicTabId==='tab-da-giao'||publicTabId==='tab-don-tam'?'don':'hang');
    const seg=String(window.TAPHOA_PRODUCT_SEGMENT||'all');
    if(p.get('tab')==='hang'){
      if(seg==='bought')p.set('muc','da-mua');
      else if(seg==='suggested')p.set('muc','goi-y');
      const sourceKey=sourceKeyFromCurrentFilter();
      if(sourceKey)p.set('nguon',sourceKey);
    }
    if((publicTabId==='tab-da-giao'||publicTabId==='tab-don-tam')&&editingOrderId){
      p.set('don',String(editingOrderId).toUpperCase());
    }
    return location.origin+'/kh/?'+p.toString();
  }

  async function copyPublicText(value,label='Đã sao chép'){
    try{
      await navigator.clipboard.writeText(String(value||''));
      const button=document.getElementById('publicToolShare');
      if(button){
        const old=button.dataset.label||'Gửi link';
        button.textContent=label;
        setTimeout(()=>{if(button.isConnected)button.textContent=old;},1200);
      }
      return true;
    }catch{
      showAlertPopup('Sao chép link',String(value||''));
      return false;
    }
  }

  function syncPublicToolState(){
    const seg=String(window.TAPHOA_PRODUCT_SEGMENT||'all');
    const states=[
      ['publicToolBought',seg==='bought'],
      ['publicToolSuggested',seg==='suggested']
    ];
    for(const [id,active] of states){
      const button=document.getElementById(id);
      if(!button)continue;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    }
  }

  function setPublicSegment(value){
    const next=String(value||'all');
    window.TAPHOA_PRODUCT_SEGMENT=window.TAPHOA_PRODUCT_SEGMENT===next?'all':next;
    syncPublicToolState();
    ownProductRenderKey='';
    requestAnimationFrame(()=>renderProductList());
  }

  function setPublicEmployeeMode(value){
    window.TAPHOA_EMPLOYEE_MODE=Boolean(value);
    document.body.dataset.employeeMode=String(Boolean(value));
    if(window.TAPHOA_EMPLOYEE_MODE){
      const btn=document.querySelector('.tab-btn[onclick*="tab-ban-hang"]');
      if(btn)switchTab('tab-ban-hang',btn);
    }
    syncPublicToolState();
    ownProductRenderKey='';
    requestAnimationFrame(()=>renderProductList());
  }

  function closePublicSharePanel(){
    document.getElementById('publicSharePanel')?.remove();
  }

  function openPublicSharePanel(employeeUrl,pinConfigured){
    closePublicSharePanel();
    const wrap=document.createElement('div');
    wrap.id='publicSharePanel';
    wrap.className='public-share-panel';
    wrap.innerHTML=
      '<button type="button" class="public-share-backdrop" aria-label="Đóng"></button>'+
      '<section class="public-share-card" role="dialog" aria-modal="true" aria-labelledby="publicShareTitle">'+
        '<div class="public-share-head">'+
          '<div><div class="public-share-title" id="publicShareTitle">Gửi link nhân viên</div><div class="public-share-sub">PIN bảo vệ link nhân viên của cửa hàng.</div></div>'+
          '<button type="button" class="public-share-close" aria-label="Đóng">×</button>'+
        '</div>'+
        '<div class="public-share-warning">Đây là liên kết truy cập nhanh, không phải app đầy đủ. Nên đặt PIN trước khi gửi và không chia sẻ link ra bên ngoài.</div>'+
        '<div class="public-share-status"><span>Trạng thái PIN</span><strong id="publicSharePinStatus"></strong></div>'+
        '<div class="public-share-label">Mã PIN 6 số</div>'+
        '<div class="public-share-pin-boxes" id="publicSharePinBoxes" data-invalid="false" data-complete="false" aria-label="Mã PIN 6 số">'+
          '<input class="public-share-pin-digit" data-share-pin-digit inputmode="numeric" autocomplete="new-password" maxlength="1" aria-label="Số PIN 1">'+
          '<input class="public-share-pin-digit" data-share-pin-digit inputmode="numeric" autocomplete="off" maxlength="1" aria-label="Số PIN 2">'+
          '<input class="public-share-pin-digit" data-share-pin-digit inputmode="numeric" autocomplete="off" maxlength="1" aria-label="Số PIN 3">'+
          '<input class="public-share-pin-digit" data-share-pin-digit inputmode="numeric" autocomplete="off" maxlength="1" aria-label="Số PIN 4">'+
          '<input class="public-share-pin-digit" data-share-pin-digit inputmode="numeric" autocomplete="off" maxlength="1" aria-label="Số PIN 5">'+
          '<input class="public-share-pin-digit" data-share-pin-digit inputmode="numeric" autocomplete="off" maxlength="1" aria-label="Số PIN 6">'+
        '</div>'+
        '<button type="button" class="public-share-pin-save" id="publicShareSavePin" disabled></button>'+
        '<div class="public-share-help" id="publicShareHelp"></div>'+
        '<button type="button" class="public-share-copy" id="publicShareCopy">Sao chép link nhân viên</button>'+
      '</section>';
    document.body.appendChild(wrap);

    let hasPin=Boolean(pinConfigured);
    let savingPin=false;
    const status=wrap.querySelector('#publicSharePinStatus');
    const pinBoxes=wrap.querySelector('#publicSharePinBoxes');
    const pinInputs=[...wrap.querySelectorAll('[data-share-pin-digit]')];
    const save=wrap.querySelector('#publicShareSavePin');
    const help=wrap.querySelector('#publicShareHelp');
    const copy=wrap.querySelector('#publicShareCopy');

    const getPin=()=>pinInputs.map(input=>String(input.value||'').replace(/\D/g,'').slice(-1)).join('');
    const updatePinState=()=>{
      const value=getPin();
      pinBoxes.dataset.complete=String(value.length===6);
      if(value.length)pinBoxes.dataset.invalid='false';
      save.disabled=savingPin||value.length!==6;
    };
    const clearPin=(invalid=false)=>{
      pinInputs.forEach(input=>{input.value='';});
      pinBoxes.dataset.invalid=String(invalid);
      updatePinState();
    };
    const focusPin=(index=0)=>setTimeout(()=>pinInputs[Math.max(0,Math.min(5,index))]?.focus(),0);
    const fillPin=(digits,startIndex=0)=>{
      const values=String(digits||'').replace(/\D/g,'');
      if(!values)return;
      const start=values.length>=6?0:startIndex;
      for(let i=0;i<values.length&&start+i<pinInputs.length;i++)pinInputs[start+i].value=values[i];
      help.dataset.error='false';
      help.dataset.success='false';
      updatePinState();
      focusPin(Math.min(start+values.length,pinInputs.length-1));
    };

    const render=()=>{
      status.textContent=hasPin?'Đã bảo vệ':'Chưa tạo PIN';
      status.dataset.active=String(hasPin);
      save.textContent=hasPin?'Đổi PIN':'Tạo PIN';
      help.textContent=hasPin
        ?'PIN cũ không hiển thị. Nhập 6 số mới nếu muốn đổi.'
        :'Nhân viên cần PIN này để mở link. Bạn có thể tạo ngay hoặc gửi link trước.';
    };
    render();

    pinInputs.forEach((input,index)=>{
      input.addEventListener('input',()=>{
        const digits=String(input.value||'').replace(/\D/g,'');
        input.value=digits.slice(-1);
        pinBoxes.dataset.invalid='false';
        help.dataset.error='false';
        help.dataset.success='false';
        updatePinState();
        if(input.value&&index<pinInputs.length-1)pinInputs[index+1].focus();
      });
      input.addEventListener('keydown',event=>{
        if(event.key==='Backspace'&&!input.value&&index>0){
          event.preventDefault();
          pinInputs[index-1].value='';
          pinInputs[index-1].focus();
          updatePinState();
        }else if(event.key==='ArrowLeft'&&index>0){
          event.preventDefault();pinInputs[index-1].focus();
        }else if(event.key==='ArrowRight'&&index<pinInputs.length-1){
          event.preventDefault();pinInputs[index+1].focus();
        }else if(event.key==='Enter'&&getPin().length===6){
          event.preventDefault();save.click();
        }
      });
      input.addEventListener('paste',event=>{
        const digits=String(event.clipboardData?.getData('text')||'').replace(/\D/g,'');
        if(!digits)return;
        event.preventDefault();
        fillPin(digits,index);
      });
    });
    save.addEventListener('click',async()=>{
      const pin=getPin();
      if(!/^\d{6}$/.test(pin)){
        help.textContent='PIN phải gồm đúng 6 chữ số.';
        help.dataset.error='true';
        pinBoxes.dataset.invalid='true';
        focusPin();
        return;
      }
      const old=save.textContent;
      savingPin=true;
      save.textContent='Đang lưu…';
      updatePinState();
      help.dataset.error='false';
      try{
        await backend().setPublicPin(pin);
        hasPin=true;
        clearPin(false);
        render();
        help.textContent='Đã lưu PIN mới. Nhân viên phải dùng PIN này.';
        help.dataset.success='true';
      }catch(error){
        console.warn('set public pin',error);
        help.textContent='Không đổi được PIN. Hãy mở lại link chủ và thử lại.';
        help.dataset.error='true';
        pinBoxes.dataset.invalid='true';
      }finally{
        savingPin=false;
        if(save.textContent==='Đang lưu…')save.textContent=old;
        updatePinState();
      }
    });
    copy.addEventListener('click',async()=>{
      const ok=await copyPublicText(employeeUrl,'Đã copy link NV');
      if(ok){
        copy.textContent='Đã sao chép link nhân viên';
        setTimeout(()=>{if(copy.isConnected)copy.textContent='Sao chép link nhân viên';},1400);
      }
    });
    wrap.querySelector('.public-share-backdrop')?.addEventListener('click',closePublicSharePanel);
    wrap.querySelector('.public-share-close')?.addEventListener('click',closePublicSharePanel);
    focusPin();
  }

  async function sharePublicMode(){
    try{
      const self=backend()?.getState?.()?.selfCustomer||{};
      const [links,state]=await Promise.all([
        backend().stockCheckLinks(String(self.id||self.maKH||'')),
        backend().publicPinState()
      ]);
      const url=String(links?.employee_url||'');
      if(!url)throw 0;
      openPublicSharePanel(url,state?.pin_configured===true);
    }catch(error){
      console.warn('open employee share',error);
      showAlertPopup('Không lấy được link nhân viên','Vui lòng thử lại.');
    }
  }

  function renderPublicTools(){
    const bar=document.getElementById('statusBar');
    const mode=backend()?.getAccessMode?.();
    if(!bar||(mode!=='public-link'&&mode!=='employee-link'))return;
    // UI-185: in public/employee link mode the footer contains action tools,
    // not our ordinary policy rail. Keep its existing policy opener accessible.
    const inlinePolicy=bar.querySelector('.tp-policy-reopen--bar');
    if(inlinePolicy){
      inlinePolicy.classList.remove('tp-policy-reopen--bar');
      inlinePolicy.classList.add('tp-policy-reopen--home');
      document.body.appendChild(inlinePolicy);
    }
    delete bar.dataset.policyInline;
    delete bar.dataset.statusView;
    const onHang=publicTabId==='tab-ban-hang';
    const employeeLink=mode==='employee-link';
    bar.dataset.publicUserTools='true';
    bar.dataset.toolCount=employeeLink?'2':'3';
    bar.className='public-user-tools shrink-0 z-40';

    if(!onHang){
      if(bar.dataset.publicToolView!=='status'){
        bar.innerHTML='<div class="public-user-tool-status"><i class="ph-fill ph-check-circle"></i><span>Hệ thống sẵn sàng</span></div>';
        bar.dataset.publicToolView='status';
      }
      return;
    }

    const view=employeeLink?'employee-hang':'owner-hang';
    if(bar.dataset.publicToolView!==view||!document.getElementById('publicToolBought')){
      bar.innerHTML=
        '<button type="button" class="public-user-tool" id="publicToolBought" aria-pressed="false">Đã mua</button>'+
        '<button type="button" class="public-user-tool" id="publicToolSuggested" aria-pressed="false">Gợi ý</button>'+
        (employeeLink?'':'<button type="button" class="public-user-tool public-user-tool-share" id="publicToolShare" data-label="Gửi link">Gửi link</button>');
      bar.dataset.publicToolView=view;
      document.getElementById('publicToolBought')?.addEventListener('click',()=>setPublicSegment('bought'));
      document.getElementById('publicToolSuggested')?.addEventListener('click',()=>setPublicSegment('suggested'));
      document.getElementById('publicToolShare')?.addEventListener('click',sharePublicMode);
    }
    syncPublicToolState();
  }

  function applyPublicSourceFilter(sourceKey){
    if(!sourceKey)return;
    const sources=backend()?.getState?.()?.sources||[];
    const found=sources.find(row=>String(row?.id||row?.key||row?.source_key||'')===sourceKey);
    const name=String(found?.name||found?.ten||'').trim();
    if(name&&typeof filterSource==='function')filterSource(name);
  }

  function applyPublicDeepLink(){
    const q=publicQuery();
    window.TAPHOA_PRODUCT_SEGMENT=q.muc==='da-mua'?'bought':q.muc==='goi-y'?'suggested':'all';
    window.TAPHOA_EMPLOYEE_MODE=false;
    document.body.dataset.employeeMode='false';
    document.body.dataset.employeeLink='false';

    let target='tab-ban-hang';
    if(q.tab==='no')target='tab-cong-no';
    else if(q.tab==='don')target=q.don.startsWith('DT')?'tab-don-tam':'tab-da-giao';
    const button=document.querySelector('.tab-btn[onclick*="'+target+'"]');
    if(button)switchTab(target,button);
    publicTabId=target;

    if(target==='tab-ban-hang'){
      applyPublicSourceFilter(q.nguon);
      ownProductRenderKey='';
      renderProductList();
    }
    if(q.don&&typeof clickOrder==='function'){
      const linkOwner=sharedCartOwner();
      setTimeout(()=>{
        // The deep-link timer must not open an order under another link/session.
        if(sharedCartOwnerCurrent(linkOwner)){
          clickOrder(q.don,q.don.startsWith('DT')?'dontam':'dongiao');
        }
      },0);
    }
    renderPublicTools();
  }

  function sharedCartItems(){
    return Object.entries(cart||{})
      .sort(([,a],[,b])=>(Number(b?.__lastTouched)||0)-(Number(a?.__lastTouched)||0))
      .map(([product_code,item])=>{
      const value=Number(item?.qty);
      return {
        product_code:String(product_code),
        qty:Number.isFinite(value)?Math.max(0,Math.trunc(value)):0
      };
    }).filter(item=>item.product_code&&item.qty>0);
  }

  function isSharedCartMode(){
    const mode=backend()?.getAccessMode?.();
    return mode==='public-link'||mode==='employee-link';
  }

  // SPEC-SHARED-CART-OWNER-20261030: never reuse queued work or a delayed
  // server snapshot after switching link, even to the same customer again.
  function sharedCartOwner(){
    const prod=backend();
    return {
      identity:prod?.getIdentity?.(),
      mode:prod?.getAccessMode?.(),
      slug:String(prod?.getPublicAccess?.()?.slug||''),
      token:String(prod?.getEmployeeAccess?.()?.token||'')
    };
  }
  function sharedCartOwnerCurrent(owner){
    const now=sharedCartOwner();
    return owner&&owner.identity===now.identity&&owner.mode===now.mode
      &&owner.slug===now.slug&&owner.token===now.token;
  }

  // SPEC-SHARED-CART-RELOAD-20261030: keep only quantities in this tab until
  // confirmed by the server. Never persist a PIN, bearer token, order or price.
  function sharedCartDraftKey(owner=sharedCartOwner()){
    const uid=String(owner?.identity?.uid||'').trim();
    const link=owner?.mode==='public-link'?owner.slug
      :owner?.mode==='employee-link'?owner.token:'';
    if(!uid||!link)return '';
    const value=owner.mode+'|'+uid+'|'+link;
    let hash=2166136261;
    for(let i=0;i<value.length;i++){
      hash=Math.imul(hash^value.charCodeAt(i),16777619)>>>0;
    }
    return SHARED_CART_DRAFT_KEY+hash.toString(36);
  }

  function savePendingSharedCartDraft(owner,items){
    const key=sharedCartDraftKey(owner);
    if(!key)return;
    try{
      sessionStorage.setItem(key,JSON.stringify({
        savedAt:Date.now(),
        items:items.map(item=>({product_code:item.product_code,qty:item.qty}))
      }));
    }catch(error){console.warn('shared cart draft unavailable',error);}
  }

  function clearPendingSharedCartDraft(owner,items){
    const key=sharedCartDraftKey(owner);
    if(!key)return;
    try{
      const saved=JSON.parse(sessionStorage.getItem(key)||'null');
      if(!saved||JSON.stringify(saved.items)!==JSON.stringify(items))return;
      sessionStorage.removeItem(key);
    }catch(error){console.warn('shared cart draft cleanup',error);}
  }

  function restorePendingSharedCartDraft(){
    if(!isSharedCartMode())return false;
    const owner=sharedCartOwner(),key=sharedCartDraftKey(owner);
    if(!key)return false;
    let saved;
    try{saved=JSON.parse(sessionStorage.getItem(key)||'null');}
    catch{
      try{sessionStorage.removeItem(key);}catch{}
      return false;
    }
    if(!saved)return false;
    if(!Number.isFinite(saved.savedAt)
       ||saved.savedAt>Date.now()
       ||Date.now()-saved.savedAt>SHARED_CART_DRAFT_MAX_AGE
       ||!Array.isArray(saved.items)){
      try{sessionStorage.removeItem(key);}catch{}
      return false;
    }
    const entries=saved.items;
    const seen=new Set();
    // A corrupt/duplicate full-cart draft is never safe to replay: the
    // shared-cart endpoint replaces the entire stock-count snapshot.
    const valid=entries.every(item=>{
      const code=item?.product_code;
      if(typeof code!=='string'||!code||seen.has(code)
         ||!Number.isSafeInteger(item.qty)||item.qty<=0)return false;
      seen.add(code);
      return true;
    });
    if(!valid){
      try{sessionStorage.removeItem(key);}catch{}
      return false;
    }
    const productMap=new Map((appData.sanpham||[]).slice(1).map(row=>[String(row?.[0]||''),row]));
    // Incomplete product data must never turn a pending full-cart write into
    // a destructive partial-cart overwrite.
    if(entries.some(item=>!productMap.has(item.product_code)))return false;
    const employee=owner.mode==='employee-link',restored={};
    for(const [index,item] of entries.entries()){
      const row=productMap.get(item.product_code);
      restored[item.product_code]={
        name:String(row?.[1]||item.product_code),
        price:employee?0:(Number(row?.[3])||0),
        qty:item.qty,note:'',
        // The draft is ordered newest first. Restore row order before any
        // new +/- or product input obtains the next insertion stamp.
        __lastTouched:entries.length-index
      };
    }
    __cartTouchSeq=Math.max(__cartTouchSeq,entries.length);
    cart=restored;
    scheduleSharedCartSave();
    renderCartUI();
    return true;
  }

  function resetSharedCartSyncOwner(){
    clearTimeout(sharedCartSaveTimer);
    sharedCartSaveTimer=0;
    // A hung write for the previous link must not block this link's queue.
    sharedCartSaveChain=Promise.resolve();
    if(sharedCartPoll){clearInterval(sharedCartPoll);sharedCartPoll=0;}
    sharedCartSignature='';
    sharedCartLocalWriteAt=0;
    sharedCartLocalEditSeq=0;
    sharedCartCommittedEditSeq=0;
    clearTimeout(sharedCartRetryTimer);
    sharedCartRetryTimer=0;
    sharedCartRetryCount=0;
    sharedCartRetryReady=false;
    sharedCartPollInFlight=false;
    sharedCartPollStartedAt=0;
    ++sharedCartPollRequestSeq;
  }

  // SPEC-SHARED-CART-RECOVERY-20261030: a failed full-snapshot save
  // must not strand the local cart forever. Retry only this same edit/session.
  function retryPendingSharedCartSave(){
    if(!sharedCartRetryReady||!isSharedCartMode()||
       sharedCartCommittedEditSeq===sharedCartLocalEditSeq||
       (typeof navigator!=='undefined'&&navigator.onLine===false))return;
    scheduleSharedCartSave({retry:true});
  }

  function scheduleSharedCartSave({retry=false}={}){
    if(!isSharedCartMode())return;
    const owner=sharedCartOwner();
    const editSeq=retry?sharedCartLocalEditSeq:++sharedCartLocalEditSeq;
    if(!retry){
      sharedCartRetryCount=0;
      savePendingSharedCartDraft(owner,sharedCartItems());
    }
    sharedCartRetryReady=false;
    clearTimeout(sharedCartRetryTimer);
    sharedCartRetryTimer=0;
    sharedCartLocalWriteAt=Date.now();
    clearTimeout(sharedCartSaveTimer);
    sharedCartSaveTimer=setTimeout(()=>{
      if(!sharedCartOwnerCurrent(owner)||editSeq!==sharedCartLocalEditSeq)return;
      const items=sharedCartItems();
      sharedCartSaveChain=sharedCartSaveChain
        .catch(()=>{})
        .then(()=>{
          if(!sharedCartOwnerCurrent(owner)||editSeq!==sharedCartLocalEditSeq)return null;
          return backend().saveSharedQuantities(items);
        })
        .then(result=>{
          if(result===null||!sharedCartOwnerCurrent(owner)||editSeq!==sharedCartLocalEditSeq)return;
          if(result?.ok!==true)throw new Error(String(result?.error||'shared_cart_save_unconfirmed'));
          sharedCartSignature=JSON.stringify(items.map(row=>[row.product_code,row.qty]).sort());
          sharedCartCommittedEditSeq=editSeq;
          sharedCartRetryReady=false;
          clearPendingSharedCartDraft(owner,items);
        })
        .catch(error=>{
          console.warn('shared cart sync',error);
          if(!sharedCartOwnerCurrent(owner)||editSeq!==sharedCartLocalEditSeq)return;
          sharedCartRetryReady=true;
          // At most two timed retries for an edit. Offline waits for 'online';
          // a later visible/online event can recover without permanent polling.
          if((typeof navigator==='undefined'||navigator.onLine!==false)
             &&sharedCartRetryCount<2){
            sharedCartRetryCount++;
            sharedCartRetryTimer=setTimeout(retryPendingSharedCartSave,1500*sharedCartRetryCount);
          }
        });
    },100);
  }

  function installSharedCartQuantitySync(){
    if(window.__taphoaSharedCartQuantitySync)return;
    window.__taphoaSharedCartQuantitySync=true;
    window.addEventListener?.('online',retryPendingSharedCartSave);
    // Back/forward cache can restore a suspended page without a visibility
    // or online event. Resume only a failed, still-owned pending save.
    window.addEventListener?.('pageshow',retryPendingSharedCartSave);
    window.addEventListener?.('beforeunload',event=>{
      if(!isSharedCartMode()||sharedCartCommittedEditSeq===sharedCartLocalEditSeq)return;
      // Desktop browsers may warn about leaving with unconfirmed edits;
      // iOS can ignore beforeunload, so tab-scoped draft storage is primary.
      event.preventDefault?.();
      event.returnValue='';
    });
    document.addEventListener?.('visibilitychange',()=>{
      if(!document.hidden)retryPendingSharedCartSave();
    });

    const baseUpdateCart=updateCart;
    updateCart=function(maSp,tenSp,giaBan,change){
      const previousQty=Number(cart?.[maSp]?.qty)||0;
      const result=baseUpdateCart.apply(this,arguments);
      // An unchanged +/- action must not resend the full shared snapshot.
      if(isSharedCartMode()&&(Number(cart?.[maSp]?.qty)||0)!==previousQty)
        scheduleSharedCartSave();
      return result;
    };

    const basePreviewQtyInput=previewQtyInput;
    previewQtyInput=function(input){
      const mode=backend()?.getAccessMode?.();
      if(mode!=='employee-link'){
        const code=String(input?.dataset?.qtyId||'');
        const previousQty=Number(cart?.[code]?.qty)||0;
        const result=basePreviewQtyInput.apply(this,arguments);
        if(mode==='public-link'&&code&&(Number(cart?.[code]?.qty)||0)!==previousQty)
          scheduleSharedCartSave();
        return result;
      }
      if(!input)return;
      const code=String(input.dataset.qtyId||'');
      const raw=String(input.value||'').trim();
      if(!code||raw==='')return;
      const numeric=Number(raw);
      if(!Number.isFinite(numeric))return;
      const parsed=Math.max(0,Math.trunc(numeric));
      const previousQty=Number(cart[code]?.qty)||0;
      const meta=getQtyMeta(code,input);
      const isNewCartLine=!cart[code];
      if(parsed>0){
        const existing=cart[code]||{};
        cart[code]={...existing,name:meta.name,price:0,qty:parsed,note:String(existing.note||'')};
        if(isNewCartLine)cart[code].__lastTouched=++__cartTouchSeq;
      }else{
        delete cart[code];
      }
      syncQtyEditors(code,parsed,input);
      // Product-card edits must materialize/remove the corresponding cart row;
      // cart-row edits keep the input mounted to preserve focus on mobile.
      if(input.dataset.qtyEditor==='cart'&&parsed>0&&!isNewCartLine){
        refreshCartTotalsOnly();
      }else{
        renderCartUI();
      }
      if(parsed!==previousQty)scheduleSharedCartSave();
    };

    const baseCommitQtyEditor=commitQtyEditor;
    commitQtyEditor=function(input){
      const mode=backend()?.getAccessMode?.();
      if(mode!=='employee-link'){
        const code=String(input?.dataset?.qtyId||'');
        const previousQty=Number(cart?.[code]?.qty)||0;
        const result=baseCommitQtyEditor.apply(this,arguments);
        if(mode==='public-link'&&code&&(Number(cart?.[code]?.qty)||0)!==previousQty)
          scheduleSharedCartSave();
        return result;
      }
      if(!input)return;
      const code=String(input.dataset.qtyId||'');
      if(!code)return;
      const raw=String(input.value??'').trim();
      const numeric=raw===''?NaN:Number(raw);
      const previousQty=Number(cart[code]?.qty)||0;
      const parsed=Number.isFinite(numeric)?Math.max(0,Math.trunc(numeric)):previousQty;
      input.value=String(parsed);
      // A mobile blur after clearing text is not an explicit zero. Avoid
      // deleting a stock-check row or resending an unchanged full snapshot.
      if(parsed===previousQty)return;
      const meta=getQtyMeta(code,input);
      const isNewCartLine=!cart[code];
      if(parsed>0){
        const existing=cart[code]||{};
        cart[code]={...existing,name:meta.name,price:0,qty:parsed,note:String(existing.note||'')};
        if(isNewCartLine)cart[code].__lastTouched=++__cartTouchSeq;
      }else{
        delete cart[code];
      }
      syncQtyEditors(code,parsed,input);
      if(input.dataset.qtyEditor==='cart'&&parsed>0&&!isNewCartLine){
        refreshCartTotalsOnly();
      }else{
        renderCartUI();
      }
      scheduleSharedCartSave();
    };

    const baseClearCart=clearCart;
    clearCart=function(){
      const hadRows=sharedCartItems().length>0;
      const result=baseClearCart.apply(this,arguments);
      // An already-empty cart is not a new clearing command. Otherwise a
      // stale empty tab can erase fresh counts saved on another device.
      if(isSharedCartMode()&&hadRows)scheduleSharedCartSave();
      return result;
    };
  }

  function installEmployeeOrderActionGuard(){
    if(window.__taphoaEmployeeOrderActionGuard)return;
    window.__taphoaEmployeeOrderActionGuard=true;
    const baseRenderCartFooterActions=renderCartFooterActions;
    renderCartFooterActions=function(){
      if(backend()?.getAccessMode?.()!=='employee-link'){
        return baseRenderCartFooterActions.apply(this,arguments);
      }
      const owner=document.getElementById('cartFooterActions');
      if(!owner)return;
      const hasItems=Object.keys(cart||{}).length>0;
      const cartShareOrderBtn=document.getElementById('cartShareOrderBtn');
      if(cartShareOrderBtn)cartShareOrderBtn.classList.add('hidden');
      owner.classList.remove('hidden');
      owner.innerHTML=
        '<button '+(hasItems?'onclick="clearCart()"':'disabled')+
        ' class="w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold transition flex items-center justify-center gap-1 '+
        (hasItems?'hover:bg-gray-50':'opacity-40 cursor-not-allowed pointer-events-none')+'">'+
        '<i class="ph ph-trash"></i> Xóa</button>';
    };
  }

  function applySharedCartSnapshot(snapshot,{force=false}={}){
    if(!force&&Date.now()-sharedCartLocalWriteAt<500)return;
    // Missing, failed or partially malformed snapshots are not an empty
    // stock count. Reject the entire response rather than clearing good rows.
    if(!Array.isArray(snapshot?.items)
       ||(snapshot.ok!==undefined&&snapshot.ok!==true))return;
    const rows=snapshot.items;
    const seenCodes=new Set();
    const normalized=[];
    for(const row of rows){
      // Database product_code is text; coercing arrays/objects into a code
      // or booleans into a quantity could turn a corrupt response into deletes.
      if(typeof row?.product_code!=='string')return;
      const code=row.product_code.trim();
      const rawQty=row.employee_qty;
      if(rawQty!==null&&typeof rawQty!=='number'&&typeof rawQty!=='string')return;
      const value=Number(rawQty);
      // Null is a legitimate empty count; an absent/invalid field is not.
      if(!code||seenCodes.has(code)||rawQty===undefined
         ||(typeof rawQty==='string'&&!rawQty.trim())
         ||!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)return;
      seenCodes.add(code);
      const qty=Math.trunc(value);
      if(qty>0)normalized.push([code,qty]);
    }
    normalized.sort((a,b)=>a[0].localeCompare(b[0]));
    const signature=JSON.stringify(normalized);
    const employeeMode=backend()?.getAccessMode?.()==='employee-link';
    const productMap=new Map((appData.sanpham||[]).slice(1).map(row=>[String(row?.[0]||''),row]));
    // The server response is one complete quantity snapshot. If a product
    // has not reached this device's catalog yet, applying just the known
    // subset would silently remove other rows and their local notes.
    // Keep the old cart/signature until the entire snapshot is displayable.
    if(normalized.some(([code])=>!productMap.has(code)))return;
    const cartMatches=Object.keys(cart||{}).length===normalized.length
      &&normalized.every(([code,qty])=>{
        const product=productMap.get(code);
        return Number(cart?.[code]?.qty)===qty
          &&String(cart?.[code]?.name||'')===String(product?.[1]||code)
          &&Number(cart?.[code]?.price)===
            (employeeMode?0:(Number(product?.[3])||0));
      });
    if(!force&&signature===sharedCartSignature&&cartMatches)return;
    sharedCartSignature=signature;
    const nextCart={};

    for(const [code,qty] of normalized){
      const product=productMap.get(code);
      if(!product)continue;
      const existing=cart?.[code]||{};
      nextCart[code]={
        name:String(product?.[1]||code),
        price:employeeMode?0:(Number(product?.[3])||0),
        qty,
        // Shared stock checks synchronize quantities only. Preserve the
        // customer's local notes and cart insertion order on remote updates.
        note:String(existing.note||''),
        __lastTouched:Number(existing.__lastTouched)||0
      };
    }

    cart=nextCart;
    renderProductList();
    renderCartUI();
  }

  function startSharedCartSync(){
    if(sharedCartPoll)clearInterval(sharedCartPoll);
    ++sharedCartPollRequestSeq;
    sharedCartPollInFlight=false;
    sharedCartPollStartedAt=0;
    sharedCartPoll=setInterval(async()=>{
      if(document.hidden||!isSharedCartMode()
         ||sharedCartCommittedEditSeq!==sharedCartLocalEditSeq
         ||Date.now()-sharedCartLocalWriteAt<500)return;
      // SPEC-SHARED-CART-POLL-HANG-20261030: avoid an unbounded pile of
      // network reads. After 15s a hung read may be superseded; its eventual
      // response is rejected by requestSeq, never applied to the cart.
      if(sharedCartPollInFlight&&Date.now()-sharedCartPollStartedAt<15000)return;
      const owner=sharedCartOwner();
      const editSeq=sharedCartLocalEditSeq;
      const requestSeq=++sharedCartPollRequestSeq;
      sharedCartPollInFlight=true;
      sharedCartPollStartedAt=Date.now();
      try{
        const snapshot=await backend().employeeSnapshot();
        if(!sharedCartOwnerCurrent(owner)||editSeq!==sharedCartLocalEditSeq
           ||requestSeq!==sharedCartPollRequestSeq)return;
        applySharedCartSnapshot(snapshot);
      }catch(error){
        if(sharedCartOwnerCurrent(owner)&&requestSeq===sharedCartPollRequestSeq)
          console.warn('shared cart poll',error);
      }finally{
        // A superseded or old-account read cannot unlock the newer read.
        if(requestSeq===sharedCartPollRequestSeq){
          sharedCartPollInFlight=false;
          sharedCartPollStartedAt=0;
        }
      }
    },900);
  }

  async function enterEmployeeLink(info){
    const ownerIdentity=info?.identity;
    if(!ownerIdentity||backend()?.getIdentity?.()!==ownerIdentity
       ||backend()?.getAccessMode?.()!=='employee-link')return;
    resetSharedCartSyncOwner();
    // Switching to another employee link must immediately discard any cart
    // or edit draft from the preceding customer, before network reads finish.
    cart={};
    editingOrderId=null;
    editingOrderSheet=null;
    editingOrderInSaleMode=false;
    setAuthRole('user');
    syncSelfCustomer(info);
    renderCartUI();
    await refreshFixedSheets(['sanpham','khachhang']);
    // A replaced link may finish its sheet read after a newer session starts.
    if(backend()?.getIdentity?.()!==ownerIdentity
       ||backend()?.getAccessMode?.()!=='employee-link')return;
    const recoveredSharedCart=restorePendingSharedCartDraft();
    showAppScreen();
    ownProductRenderKey='';
    window.TAPHOA_PRODUCT_SEGMENT='all';
    window.TAPHOA_EMPLOYEE_MODE=true;
    document.body.dataset.employeeMode='true';
    document.body.dataset.employeeLink='true';

    const button=document.querySelector('.tab-btn[onclick*="tab-ban-hang"]');
    if(button)switchTab('tab-ban-hang',button);
    publicTabId='tab-ban-hang';

    installSharedCartQuantitySync();
    installEmployeeOrderActionGuard();
    const cartOwner=sharedCartOwner();
    const initialEditSeq=sharedCartLocalEditSeq;
    const firstSnapshot=info?.employeeSnapshot||await backend().getEmployeeSnapshot();
    if(!sharedCartOwnerCurrent(cartOwner))return;
    if(!recoveredSharedCart&&initialEditSeq===sharedCartLocalEditSeq)
      applySharedCartSnapshot(firstSnapshot,{force:true});
    ownProductRenderKey='';
    renderProductList();
    renderPublicTools();
    renderCartFooterActions();
    startSharedCartSync();
  }

  async function openEmployeeLinkFromSession(){
    const q=employeeQuery();
    if(!q.active||!q.token)return false;
    const stored=employeeStoredAccess();
    if(!stored||stored.token!==q.token){
      location.replace(employeeGateUrl(q.token));
      return true;
    }
    try{
      const info=await backend().openEmployeeLink(stored.token,stored.pin);
      sessionStorage.removeItem(EMPLOYEE_LINK_SESSION_KEY);
      await enterEmployeeLink(info);
      return true;
    }catch(error){
      console.warn('employee link open',error);
      sessionStorage.removeItem(EMPLOYEE_LINK_SESSION_KEY);
      location.replace(employeeGateUrl(q.token));
      return true;
    }
  }

  function installPublicSwitchTracking(){
    if(window.__taphoaPublicSwitchWrapped)return;
    window.__taphoaPublicSwitchWrapped=true;
    const base=switchTab;
    switchTab=function(tabId,element){
      const result=base.apply(this,arguments);
      publicTabId=String(tabId||'tab-ban-hang');
      if(publicTabId!=='tab-ban-hang'&&window.TAPHOA_EMPLOYEE_MODE){
        window.TAPHOA_EMPLOYEE_MODE=false;
        document.body.dataset.employeeMode='false';
      }
      renderPublicTools();
      return result;
    };
  }

  async function enterPublicUser(info){
    const ownerIdentity=info?.identity;
    if(!ownerIdentity||backend()?.getIdentity?.()!==ownerIdentity
       ||backend()?.getAccessMode?.()!=='public-link')return;
    resetSharedCartSyncOwner();
    // Public-link login is a different cart owner. Never show the old link's
    // lines/notes while the next link's bootstrap or stock snapshot is pending.
    cart={};
    editingOrderId=null;
    editingOrderSheet=null;
    editingOrderInSaleMode=false;
    document.body.dataset.employeeLink='false';
    setAuthRole('user');
    syncSelfCustomer(info);
    renderCartUI();
    await refreshFixedSheets();
    if(backend()?.getIdentity?.()!==ownerIdentity
       ||backend()?.getAccessMode?.()!=='public-link')return;
    const recoveredSharedCart=restorePendingSharedCartDraft();
    showAppScreen();
    // A previous customer's cached product render key cannot be reused when
    // the new public link initially opens on Orders or Debt instead of Sales.
    ownProductRenderKey='';
    installPublicSwitchTracking();
    applyPublicDeepLink();

    installSharedCartQuantitySync();
    const cartOwner=sharedCartOwner();
    const initialEditSeq=sharedCartLocalEditSeq;
    try{
      const firstSnapshot=await backend().employeeSnapshot();
      if(!sharedCartOwnerCurrent(cartOwner))return;
      if(!recoveredSharedCart&&initialEditSeq===sharedCartLocalEditSeq)
        applySharedCartSnapshot(firstSnapshot,{force:true});
    }catch(error){
      if(!sharedCartOwnerCurrent(cartOwner))return;
      console.warn('initial shared cart snapshot',error);
    }
    startSharedCartSync();
  }

  async function openPublicUserFromSession(){
    const q=publicQuery();
    if(!q.kh)return false;

    try{
      const restored=await backend().restore();
      if(restored){
        try{
          const info=await backend().openPublicLink(q.kh,'');
          await enterPublicUser(info);
          return true;
        }catch(error){
          console.warn('public account bypass',error);
        }
      }
    }catch(error){
      console.warn('public account restore',error);
    }

    const stored=publicStoredAccess();
    if(!stored||stored.kh!==q.kh){
      location.replace(publicGateUrl());
      return true;
    }
    try{
      const info=await backend().openPublicLink(stored.kh,stored.pin);
      await enterPublicUser(info);
      return true;
    }catch(error){
      sessionStorage.removeItem(PUBLIC_LINK_SESSION_KEY);
      location.replace(publicGateUrl());
      return true;
    }
  }

  window.addEventListener('taphoa-production-sync',(event)=>{
    const changed=Array.isArray(event?.detail?.changed)?event.detail.changed:[];
    const names=sheetsForChangedDomains(changed);
    if(event?.detail?.permissionsChanged)applyRolePermissions();
    if(!names.length)return;
    refreshFixedSheets(names).catch(error=>console.warn('refresh fixed UI',error));
  });

  // The sales UI only needs parsed markup and evaluated scripts. Waiting for
  // window.load also waits for unrelated image/icon/font resources on cold open.
  // DOMContentLoaded runs after the deferred production bridge module is ready.
  document.addEventListener('DOMContentLoaded',async function(){
    loadUiPreferences();
    const apiInput=document.getElementById('inputScriptUrl');
    if(apiInput){apiInput.value='taphoa://production';apiInput.readOnly=true;}
    if(employeeQuery().active){
      await openEmployeeLinkFromSession();
      return;
    }
    if(publicQuery().kh){
      await openPublicUserFromSession();
      return;
    }
    try{
      const info=await backend().restore();
      if(!info){showLoginScreen();return;}
      setAuthRole(productionRole(info));
      syncSelfCustomer(info);
      await refreshFixedSheets();
      showAppScreen();
    }catch(error){
      console.error('restore',error);
      showLoginScreen();
    }
  },{once:true});
})();
