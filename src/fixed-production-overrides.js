/* Production-only bindings for TAPHOA_GEMINI_100_SAMPLE_FIXED.html.
 * This file intentionally runs as a classic script after the complete FIXED UI runtime,
 * so it can bind that runtime's globals to the existing Supabase/business layer.
 */
(function(){
  'use strict';

  const backend=()=>window.TAPHOA_PRODUCTION;
  const sheetNames=['sanpham','khachhang','dontam','dongiao','thuchi'];
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
    const amount=typeof parseDebtAmountValue==='function'
      ? parseDebtAmountValue(amountStr)
      : Number(String(amountStr).replace(/\D/g,''))||0;
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


  const PUBLIC_LINK_SESSION_KEY='taphoa.public.link.v1';
  const EMPLOYEE_LINK_SESSION_KEY='taphoa.employee.link.v1';
  let employeeLinkSaveTimer=0;
  let employeeLinkSaveChain=Promise.resolve();
  let publicEmployeePoll=0;
  let publicEmployeeSignature='';
  let publicEmployeeCodes=new Set();
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
    const employee=Boolean(window.TAPHOA_EMPLOYEE_MODE);
    const states=[
      ['publicToolBought',seg==='bought'],
      ['publicToolSuggested',seg==='suggested'],
      ['publicToolEmployee',employee]
    ];
    for(const [id,active] of states){
      const button=document.getElementById(id);
      if(!button)continue;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-pressed',String(active));
    }
    const employeeButton=document.getElementById('publicToolEmployee');
    if(employeeButton){
      employeeButton.textContent=employee?'Chủ':'Nhân viên';
      employeeButton.setAttribute('aria-label',employee?'Quay lại chế độ chủ':'Chuyển sang chế độ nhân viên');
      employeeButton.title=employee?'Quay lại chế độ chủ':'Chuyển sang chế độ nhân viên';
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
        '<div class="public-share-status"><span>Trạng thái PIN</span><strong id="publicSharePinStatus"></strong></div>'+
        '<label class="public-share-label" for="publicSharePinInput">Mã PIN 6 số</label>'+
        '<div class="public-share-pin-row">'+
          '<input id="publicSharePinInput" inputmode="numeric" autocomplete="new-password" maxlength="6" placeholder="Nhập PIN mới">'+
          '<button type="button" id="publicShareSavePin"></button>'+
        '</div>'+
        '<div class="public-share-help" id="publicShareHelp"></div>'+
        '<button type="button" class="public-share-copy" id="publicShareCopy">Sao chép link nhân viên</button>'+
      '</section>';
    document.body.appendChild(wrap);

    let hasPin=Boolean(pinConfigured);
    const status=wrap.querySelector('#publicSharePinStatus');
    const input=wrap.querySelector('#publicSharePinInput');
    const save=wrap.querySelector('#publicShareSavePin');
    const help=wrap.querySelector('#publicShareHelp');
    const copy=wrap.querySelector('#publicShareCopy');

    const render=()=>{
      status.textContent=hasPin?'Đã bảo vệ':'Chưa tạo PIN';
      status.dataset.active=String(hasPin);
      save.textContent=hasPin?'Đổi PIN':'Tạo PIN';
      help.textContent=hasPin
        ?'PIN cũ không hiển thị. Nhập 6 số mới nếu muốn đổi.'
        :'Nhân viên cần PIN này để mở link. Bạn có thể tạo ngay hoặc gửi link trước.';
    };
    render();

    input.addEventListener('input',()=>{
      input.value=String(input.value||'').replace(/\D/g,'').slice(0,6);
      help.dataset.error='false';
    });
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'){event.preventDefault();save.click();}
    });
    save.addEventListener('click',async()=>{
      const pin=String(input.value||'').trim();
      if(!/^\d{6}$/.test(pin)){
        help.textContent='PIN phải gồm đúng 6 chữ số.';
        help.dataset.error='true';
        input.focus();
        return;
      }
      const old=save.textContent;
      save.disabled=true;
      save.textContent='Đang lưu…';
      help.dataset.error='false';
      try{
        await backend().setPublicPin(pin);
        hasPin=true;
        input.value='';
        render();
        help.textContent='Đã lưu PIN mới. Nhân viên phải dùng PIN này.';
        help.dataset.success='true';
      }catch(error){
        console.warn('set public pin',error);
        help.textContent='Không đổi được PIN. Hãy mở lại link chủ và thử lại.';
        help.dataset.error='true';
      }finally{
        save.disabled=false;
        if(save.textContent==='Đang lưu…')save.textContent=old;
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
    setTimeout(()=>input.focus(),0);
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
    if(!bar||backend()?.getAccessMode?.()!=='public-link')return;
    const onHang=publicTabId==='tab-ban-hang';
    bar.dataset.publicUserTools='true';
    bar.className='public-user-tools shrink-0 z-40';
    if(!onHang){
      if(bar.dataset.publicToolView!=='status'){
        bar.innerHTML='<div class="public-user-tool-status"><i class="ph-fill ph-check-circle"></i><span>Hệ thống sẵn sàng</span></div>';
        bar.dataset.publicToolView='status';
      }
      return;
    }

    if(bar.dataset.publicToolView!=='hang'||!document.getElementById('publicToolBought')){
      bar.innerHTML=
        '<button type="button" class="public-user-tool" id="publicToolBought" aria-pressed="false">Đã mua</button>'+
        '<button type="button" class="public-user-tool" id="publicToolSuggested" aria-pressed="false">Gợi ý</button>'+
        '<button type="button" class="public-user-tool" id="publicToolEmployee" aria-pressed="false">Nhân viên</button>'+
        '<button type="button" class="public-user-tool public-user-tool-share" id="publicToolShare" data-label="Gửi link">Gửi link</button>';
      bar.dataset.publicToolView='hang';
      document.getElementById('publicToolBought')?.addEventListener('click',()=>setPublicSegment('bought'));
      document.getElementById('publicToolSuggested')?.addEventListener('click',()=>setPublicSegment('suggested'));
      document.getElementById('publicToolEmployee')?.addEventListener('click',()=>setPublicEmployeeMode(!Boolean(window.TAPHOA_EMPLOYEE_MODE)));
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
      setTimeout(()=>clickOrder(q.don,q.don.startsWith('DT')?'dontam':'dongiao'),0);
    }
    renderPublicTools();
  }

  function employeeLinkItems(){
    return Object.entries(cart||{}).map(([product_code,item])=>({
      product_code:String(product_code),
      qty:Math.max(0,Math.trunc(Number(item?.qty)||0))
    })).filter(item=>item.product_code&&item.qty>0);
  }

  function scheduleEmployeeLinkSave(){
    if(backend()?.getAccessMode?.()!=='employee-link')return;
    clearTimeout(employeeLinkSaveTimer);
    employeeLinkSaveTimer=setTimeout(()=>{
      const items=employeeLinkItems();
      employeeLinkSaveChain=employeeLinkSaveChain.catch(()=>{}).then(()=>backend().saveEmployeeQuantities(items)).catch(error=>{
        console.warn('employee quantity sync',error);
      });
    },100);
  }

  function installEmployeeLinkQuantitySync(){
    if(window.__taphoaEmployeeLinkQuantitySync)return;
    window.__taphoaEmployeeLinkQuantitySync=true;

    const baseUpdateCart=updateCart;
    updateCart=function(maSp,tenSp,giaBan,change){
      const result=baseUpdateCart.apply(this,arguments);
      if(backend()?.getAccessMode?.()==='employee-link')scheduleEmployeeLinkSave();
      return result;
    };

    const basePreviewQtyInput=previewQtyInput;
    previewQtyInput=function(input){
      if(backend()?.getAccessMode?.()!=='employee-link')return basePreviewQtyInput.apply(this,arguments);
      if(!input)return;
      const code=String(input.dataset.qtyId||'');
      const raw=String(input.value||'').trim();
      if(!code||raw==='')return;
      const parsed=Math.max(0,Math.trunc(Number(raw)||0));
      const meta=getQtyMeta(code,input);
      if(parsed>0){
        const existing=cart[code]||{};
        cart[code]={...existing,name:meta.name,price:0,qty:parsed,note:''};
      }else{
        delete cart[code];
      }
      syncQtyEditors(code,parsed,input);
      refreshCartTotalsOnly();
      scheduleEmployeeLinkSave();
    };

    const baseCommitQtyEditor=commitQtyEditor;
    commitQtyEditor=function(input){
      if(backend()?.getAccessMode?.()!=='employee-link')return baseCommitQtyEditor.apply(this,arguments);
      if(!input)return;
      const code=String(input.dataset.qtyId||'');
      if(!code)return;
      const parsed=Math.max(0,Math.trunc(Number(input.value)||0));
      input.value=String(parsed);
      const meta=getQtyMeta(code,input);
      if(parsed>0){
        const existing=cart[code]||{};
        cart[code]={...existing,name:meta.name,price:0,qty:parsed,note:''};
      }else{
        delete cart[code];
      }
      syncQtyEditors(code,parsed,input);
      refreshCartTotalsOnly();
      scheduleEmployeeLinkSave();
    };
  }

  function applyEmployeeLinkSnapshot(snapshot){
    cart={};
    const rows=Array.isArray(snapshot?.items)?snapshot.items:[];
    const productMap=new Map((appData.sanpham||[]).slice(1).map(row=>[String(row?.[0]||''),row]));
    for(const row of rows){
      const code=String(row?.product_code||'');
      const qty=Math.max(0,Math.trunc(Number(row?.employee_qty)||0));
      const product=productMap.get(code);
      if(!code||qty<=0||!product)continue;
      cart[code]={
        name:String(product?.[1]||code),
        price:0,
        qty,
        note:''
      };
    }
    renderProductList();
    renderCartUI();
  }

  async function enterEmployeeLink(info){
    setAuthRole('user');
    syncSelfCustomer(info);
    showAppScreen();
    await refreshFixedSheets(['sanpham','khachhang']);
    window.TAPHOA_PRODUCT_SEGMENT='all';
    window.TAPHOA_EMPLOYEE_MODE=true;
    document.body.dataset.employeeMode='true';
    document.body.dataset.employeeLink='true';

    const button=document.querySelector('.tab-btn[onclick*="tab-ban-hang"]');
    if(button)switchTab('tab-ban-hang',button);
    publicTabId='tab-ban-hang';

    installEmployeeLinkQuantitySync();
    applyEmployeeLinkSnapshot(info?.employeeSnapshot||await backend().getEmployeeSnapshot());
    ownProductRenderKey='';
    renderProductList();
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
      await enterEmployeeLink(info);
      return true;
    }catch(error){
      console.warn('employee link open',error);
      sessionStorage.removeItem(EMPLOYEE_LINK_SESSION_KEY);
      location.replace(employeeGateUrl(q.token));
      return true;
    }
  }

  function applyEmployeeSnapshot(snapshot){
    const rows=Array.isArray(snapshot?.items)?snapshot.items:[];
    const signature=JSON.stringify(rows.map(row=>[String(row.product_code||''),Number(row.employee_qty)||0]));
    if(signature===publicEmployeeSignature)return;
    publicEmployeeSignature=signature;

    const nextCodes=new Set();
    const productMap=new Map((appData.sanpham||[]).slice(1).map(row=>[String(row?.[0]||''),row]));
    for(const row of rows){
      const code=String(row?.product_code||'');
      const qty=Math.max(0,Math.trunc(Number(row?.employee_qty)||0));
      if(!code)continue;
      nextCodes.add(code);
      const product=productMap.get(code);
      if(qty>0&&product){
        const existing=cart[code]||{};
        cart[code]={
          ...existing,
          name:String(product?.[1]||code),
          price:Number(product?.[3])||0,
          qty,
          note:String(existing.note||'')
        };
      }else if(publicEmployeeCodes.has(code)){
        delete cart[code];
      }
    }
    for(const code of publicEmployeeCodes){
      if(!nextCodes.has(code))delete cart[code];
    }
    publicEmployeeCodes=nextCodes;
    renderProductList();
    renderCartUI();
  }

  function startPublicEmployeeSync(){
    if(publicEmployeePoll)clearInterval(publicEmployeePoll);
    publicEmployeePoll=setInterval(async()=>{
      if(document.hidden||backend()?.getAccessMode?.()!=='public-link')return;
      try{applyEmployeeSnapshot(await backend().employeeSnapshot());}catch{}
    },900);
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
    document.body.dataset.employeeLink='false';
    setAuthRole('user');
    syncSelfCustomer(info);
    showAppScreen();
    await refreshFixedSheets();
    installPublicSwitchTracking();
    applyPublicDeepLink();
    startPublicEmployeeSync();
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

  window.onload=async function(){
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
      showAppScreen();
      await refreshFixedSheets();
    }catch(error){
      console.error('restore',error);
      showLoginScreen();
    }
  };
})();
