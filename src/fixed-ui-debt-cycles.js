/* DEBT-CYCLE-20261023 — readonly cycle badges + complete per-customer history.
   Authoritative cycle boundaries come from the complete server ledger; never
   reset for 3/7-day warnings and never write money/balances from this module. */
(function(){
  'use strict';
  let byCustomer=new Map();
  let orderByCustomer=new Map();
  let loadedAt=0;
  let pending=null;
  let stale=false;
  let previousBalanceSignature='';
  let cycleIdentity=null,cycleMode=null,ownerInitialized=false;
  const TTL=45000;
  // User is allowed to read debt balances, but this full-history RPC is
  // admin-only. Do not leak cached admin cycle details or show an RPC error.
  function cycleOwner(){
    const bridge=window.TAPHOA_PRODUCTION;
    return {identity:bridge?.getIdentity?.()||null,mode:bridge?.getAccessMode?.()||null};
  }
  function cycleOwnerCurrent(owner){
    const now=cycleOwner();
    return owner.identity===now.identity&&owner.mode===now.mode;
  }
  function syncCycleOwner(){
    const owner=cycleOwner();
    if(!ownerInitialized||cycleIdentity!==owner.identity||cycleMode!==owner.mode){
      byCustomer=new Map();orderByCustomer=new Map();loadedAt=0;stale=true;previousBalanceSignature='';
      pending=null;cycleIdentity=owner.identity;cycleMode=owner.mode;ownerInitialized=true;
    }
    return owner;
  }
  function canLoadCycles(){
    if(!hasPermission('canViewDebt'))return false;
    const bridge=window.TAPHOA_PRODUCTION;
    const role=bridge?.getIdentity?.()?.role;
    const mode=bridge?.getAccessMode?.();
    return (!mode||mode==='account')&&(!role||role==='admin');
  }
  function canLoadOrderCycles(){
    if(!hasPermission('canViewDebt'))return false;
    const bridge=window.TAPHOA_PRODUCTION;
    const role=bridge?.getIdentity?.()?.role;
    const mode=bridge?.getAccessMode?.();
    return (mode===undefined||mode==='account')
      &&(role==='admin'||role==='user')
      &&typeof bridge?.orderCycles==='function';
  }
  function displayOrderCycles(row){
    const orders=Array.isArray(row?.orderCycles)?row.orderCycles:[];
    const open=row?.isOpen===true;
    const earliest=row?.earliestDueDay?dayLabel(row.earliestDueDay):'—';
    const days=numeric(row?.idleDays);
    if(!open)return {status:'Đã tất toán',context:' · Không có mốc D7 đang mở',warning:false};
    if(!orders.length)return {status:'Đang nợ',context:' · Chưa có đơn giao ghi nhận',warning:false};
    const overdue=numeric(row?.dueCount);
    const status=overdue>0?'Đến hạn '+overdue+' đơn':'D7 sớm nhất '+earliest;
    const context=' · '+orders.length+' chu kỳ đơn · '+days+' ngày chưa mua';
    return {status,context,warning:overdue>0||row?.idleNeedsReview===true};
  }
  const summaryFormat=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'});
  const dayLabel=key=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key||'')))return '—';
    const [y,m,d]=key.split('-');return d+'/'+m+'/'+y;
  };
  const numeric=value=>Math.max(0,Number(value)||0);
  const compactDays=cycle=>{
    const d=numeric(cycle.durationDays);
    return d+' ngày';
  };
  function activeCycle(row){
    const cycles=Array.isArray(row?.cycles)?row.cycles:[];
    return cycles.findLast?.(c=>!c.closedAt)||[...cycles].reverse().find(c=>!c.closedAt)||null;
  }
  function currentMonthStats(row){
    return Array.isArray(row?.monthly)&&row.monthly.length?row.monthly[0]:null;
  }
  function monthLabel(month){
    const m=String(month||"");
    if(!/^\d{4}-\d{2}$/.test(m))return "Tháng hiện tại";
    const [year,number]=m.split("-");
    return "Tháng "+Number(number)+"/"+year;
  }
  function monthCountText(month){
    if(!month)return "Chưa có thống kê mua hàng tháng";
    return monthLabel(month.month)+" · "+numeric(month.purchaseDays)+
      " ngày mua ("+numeric(month.orderCount)+" đơn)";
  }
  // SPEC-DEBT-READONLY-COMPACT-20261101: short list/modal summaries only.
  // Policy reasons and the original full advisory remain in expanded detail.
  function briefMonthText(month){
    if(!month)return '';
    return monthLabel(month.month).replace(/^Tháng /,'T')+
      ' · '+numeric(month.purchaseDays)+' ngày mua/'+numeric(month.orderCount)+' đơn';
  }
  function briefCycleStatus(cycle){
    if(!cycle)return 'Chưa có chu kỳ';
    if(cycle.policyPendingEvidence===true)return 'Chờ đối soát bill';
    const elapsed=numeric(cycle.durationDays),idle=numeric(cycle.daysWithoutPurchase);
    const isDue=cycle.policyDueDay?cycle.policyIsDue===true:(elapsed>=7||idle>=3);
    if(isDue){
      const late=cycle.policyDueDay?numeric(cycle.policyDaysOverdue):
        Math.max(0,Math.max(elapsed-7,idle-3));
      return late>0?'Trễ '+late+' ngày':'Đến hạn đối chiếu';
    }
    return 'Cách mua '+idle+' ngày';
  }
  function alertText(cycle){
    if(!cycle)return 'Chưa phát sinh nợ mới';
    const elapsed=numeric(cycle.durationDays),idle=numeric(cycle.daysWithoutPurchase);
    const hasPolicy=Boolean(cycle.policyDueDay);
    const isDue=hasPolicy?cycle.policyIsDue===true:(elapsed>=7||idle>=3);
    if(isDue){
      const late=hasPolicy?numeric(cycle.policyDaysOverdue):
        Math.max(0,Math.max(elapsed-7,idle-3));
      const cause=cycle.policyReason==='seven_days'?'Đã tới mốc hỗ trợ 7 ngày':
        cycle.policyFirstGapDay&&idle<3?'Đã có quãng nghỉ mua 3 ngày trong chu kỳ':
        'Cách lần mua gần nhất '+idle+' ngày';
      if(cycle.policyPendingEvidence===true){
        return cause+' · Có bill chờ đối soát · Ưu tiên kiểm tra chứng từ trước khi liên hệ';
      }
      return cause+' · Đến hạn đối chiếu'+
        (late>0?' · Trễ '+late+' ngày':'')+
        (late>=2?' · Có thể trao đổi trực tiếp, tránh nhắc liên tục':'');
    }
    if(hasPolicy){
      const last=numeric(cycle.daysWithoutPurchase);
      const remainingToStop=Math.max(0,3-last);
      return 'Cách lần mua '+last+' ngày · Còn '+remainingToStop+
        ' ngày tới mốc 3 ngày · Hạn hỗ trợ tối đa 7 ngày';
    }
    return 'Cách lần mua '+idle+' ngày · Theo dõi mốc hỗ trợ 7 ngày';
  }
  function currentSignature(){
    // Readonly summary signatures. A paid/adjusted balance triggers a fresh
    // cycle calculation without waiting for TTL or storing a second ledger.
    const rows=(typeof appData!=='undefined'&&Array.isArray(appData.thuchi))?appData.thuchi:[];
    return rows.filter(x=>x&&x[6]==='summary')
      .map(x=>String(x[1])+':'+String(x[3])+':'+String(x[4]))
      .sort().join('|');
  }
  async function load({force=false}={}){
    const owner=syncCycleOwner();
    const readOld=canLoadCycles(),readOrders=canLoadOrderCycles();
    if(!readOld&&!readOrders)return null;
    if(pending)return pending;
    if(!force&&!stale&&loadedAt&&Date.now()-loadedAt<TTL)return byCustomer;
    const bridge=window.TAPHOA_PRODUCTION;
    const request=(async()=>{
      // One read per owner/refresh for each available display projection.
      // Never request the Admin full-history RPC for a signed-in User.
      const [legacy,orders]=await Promise.allSettled([
        readOld?bridge.debtCycles():Promise.resolve([]),
        readOrders?bridge.orderCycles():Promise.resolve([])
      ]);
      if(!cycleOwnerCurrent(owner)||(!canLoadCycles()&&!canLoadOrderCycles()))return null;
      if(legacy.status==='rejected'&&orders.status==='rejected')throw legacy.reason;
      const data=legacy.status==='fulfilled'?legacy.value:[];
      const orderData=orders.status==='fulfilled'?orders.value:[];
      if(!Array.isArray(data)||!Array.isArray(orderData))
        throw Error('Invalid cycle response');
      if(orders.status==='rejected')console.warn('[taphoa] order cycles read failed:',String(orders.reason?.message||orders.reason));
      const map=new Map(),orderMap=new Map();
      for(const item of data){
        if(item?.customerId&&Array.isArray(item.cycles))map.set(String(item.customerId),item);
      }
      for(const item of orderData){
        if(item?.customerId&&Array.isArray(item.orderCycles))
          orderMap.set(String(item.customerId),item);
      }
      byCustomer=map;orderByCustomer=orderMap;loadedAt=Date.now();stale=false;
      decorateList();
      const selected=String(typeof activeDebtCustomerId==='undefined'?'':activeDebtCustomerId||'');
      if(selected&&document.getElementById('customerDebtModalWrapper')?.classList.contains('pointer-events-none')===false)
        decorateDetail(selected);
      return map;
    })().catch(err=>{
      if(cycleOwnerCurrent(owner)&&(canLoadCycles()||canLoadOrderCycles())){
        console.warn('[taphoa] debt cycles read failed:',String(err?.message||err));
        showCycleStatus('Không tải được nhịp mua. Công nợ gốc vẫn giữ nguyên.');
      }
      return null;
    }).finally(()=>{if(pending===request)pending=null;});
    pending=request;
    return request;
  }
  function showCycleStatus(value){
    const list=document.getElementById('debtCustomerListContainer');
    if(!list)return;
    let note=document.getElementById('debtCycleLoadStatus');
    if(!note){
      note=document.createElement('p');note.id='debtCycleLoadStatus';
      note.className='debt-cycle-load-status';
      list.prepend(note);
    }
    note.textContent=value;
  }
  function decorateList(){
    const container=document.getElementById('debtCustomerListContainer');
    if(!container||(!canLoadCycles()&&!canLoadOrderCycles()))return;
    const note=document.getElementById('debtCycleLoadStatus');
    if(note&&(byCustomer.size||orderByCustomer.size))note.remove();
    for(const card of container.querySelectorAll('.debt-customer-card[data-debt-customer-id]')){
      const id=String(card.dataset.debtCustomerId||'');
      const purchase=orderByCustomer.get(id);
      const row=byCustomer.get(id);
      const cycle=activeCycle(row);
      const month=currentMonthStats(row);
      const cycles=row?.cycles||[];
      const body=card.querySelector('.debt-customer-body');
      if(!body)continue;
      let panel=body.querySelector('.debt-cycle-card-meta');
      if(!panel){panel=document.createElement('div');panel.className='debt-cycle-card-meta';body.appendChild(panel);}
      if(purchase){
        const view=displayOrderCycles(purchase);
        panel.replaceChildren(
          makeText('span','debt-cycle-card-status',view.status),
          makeText('span','debt-cycle-card-context',view.context)
        );
        panel.title=purchase.isOpen===true
          ?'Mỗi đơn giao có mốc D7 riêng · Mốc sớm nhất '+dayLabel(purchase.earliestDueDay)+
            ' · Mốc 3 ngày không mua: '+dayLabel(purchase.idleReviewDay)+
            ' · Chỉ reset khi công nợ hết'
          :'Đã tất toán công nợ; không còn mốc đơn đang mở';
        panel.dataset.warning=view.warning?'true':'';
        continue;
      }
      if(!row){panel.textContent='';panel.title='';continue;}
      const last=cycles.length?cycles[cycles.length-1]:null;
      const monthSummary=briefMonthText(month);
      if(!cycle){
        panel.textContent=(last?'Đã tất toán CK'+last.number:'Chưa có chu kỳ nợ')+
          (monthSummary?' · '+monthSummary:'');
        panel.title=monthCountText(month)+(last?
          ' · Đã tất toán chu kỳ nợ '+last.number+' ('+last.purchaseCount+' đơn)':'');
        panel.dataset.warning='';
      }else{
        // Put the actionable status FIRST so even a narrow card with two
        // visible lines never hides it behind monthly and cycle metadata.
        // Separate the urgent status from context so only overdue text is
        // red. The full explanation stays in the customer-detail sheet.
        panel.replaceChildren(
          makeText('span','debt-cycle-card-status',briefCycleStatus(cycle)),
          makeText('span','debt-cycle-card-context',' · CK'+cycle.number+
            ' ('+numeric(cycle.purchaseCount)+' đơn)'+
            (monthSummary?' · '+monthSummary:''))
        );
        panel.title=monthCountText(month)+' · Chu kỳ '+cycle.number+
          ' ('+numeric(cycle.purchaseCount)+' đơn) · '+alertText(cycle);
        panel.dataset.warning=cycle.policyDueDay?(cycle.policyIsDue===true?'true':''):
  (numeric(cycle.durationDays)>=7||numeric(cycle.daysWithoutPurchase)>=3?'true':'');
      }
    }
  }
  function makeText(tag,cls,value){
    const e=document.createElement(tag);e.className=cls||'';e.textContent=value;return e;
  }
  function decorateDetail(customerId){
    const holder=document.getElementById('customerDebtContentToShare');
    const history=document.getElementById('cDebtModalHistoryList');
    if(!holder||!history)return;
    if(!canLoadCycles()&&!canLoadOrderCycles()){
      holder.querySelector('#debtCyclePanel')?.remove();
      return;
    }
    const actor=window.TAPHOA_PRODUCTION?.getIdentity?.();
    if(actor?.role==='user'&&String(actor.uid)!==String(customerId)){
      holder.querySelector('#debtCyclePanel')?.remove();
      return;
    }
    let panel=holder.querySelector('#debtCyclePanel');
    if(!panel){
      panel=document.createElement('section');panel.id='debtCyclePanel';
      panel.className='debt-cycle-detail';panel.setAttribute('aria-label','Theo dõi mốc từng đơn và đợt công nợ');
      holder.insertBefore(panel,history);
    }
    panel.replaceChildren();
    const purchase=orderByCustomer.get(String(customerId));
    if(purchase){
      const orders=Array.isArray(purchase.orderCycles)?purchase.orderCycles:[];
      panel.appendChild(makeText('strong','debt-cycle-detail-title',
        purchase.isOpen?'Đợt nợ '+purchase.activePeriodNo+' · '+orders.length+' chu kỳ theo đơn':
          'Đã tất toán · Các mốc theo đơn đã đóng'));
      if(purchase.isOpen&&orders.length){
        panel.appendChild(makeText('p','debt-cycle-detail-metrics',
          'D7 sớm nhất '+dayLabel(purchase.earliestDueDay)+
          ' · '+numeric(purchase.dueCount)+' đơn đến hạn'));
        panel.appendChild(makeText('p','debt-cycle-detail-metrics',
          'Lần mua gần nhất '+dayLabel(purchase.lastPurchaseDay)+
          ' · '+numeric(purchase.idleDays)+' ngày chưa mua · Mốc 3 ngày '+dayLabel(purchase.idleReviewDay)));
        const details=document.createElement('details');
        details.className='debt-cycle-history';
        details.appendChild(makeText('summary','debt-cycle-history-title',
          'Xem '+orders.length+' mốc D7 theo từng đơn'));
        const list=document.createElement('ol');
        // Keep narrow/mobile modal scroll bounded; the summary still uses
        // ALL qualifying orders for due dates and count.
        for(const order of orders.slice(0,60)){
          const li=document.createElement('li');li.className='debt-cycle-history-item';
          li.append(
            makeText('strong','', 'CK'+order.number+' · Mua '+dayLabel(order.purchaseDay)),
            makeText('span','', 'D7 '+dayLabel(order.dueDay)+
              (order.isDue?' · Đến hạn':' · Đang theo dõi'))
          );
          list.appendChild(li);
        }
        details.appendChild(list);
        if(orders.length>60)details.appendChild(makeText('p','debt-cycle-detail-explanation',
          'Hiển thị 60/'+orders.length+' đơn đầu tiên; mốc sớm nhất tính trên toàn bộ đơn.'));
        panel.appendChild(details);
      }else if(purchase.isOpen){
        panel.appendChild(makeText('p','debt-cycle-detail-metrics',
          'Đang nợ nhưng chưa có đơn giao hợp lệ trong đợt này.'));
      }else{
        panel.appendChild(makeText('p','debt-cycle-detail-metrics',
          'Không còn công nợ phải thu. Đơn mua mới sẽ mở đợt nợ tiếp theo.'));
      }
      // Historical debt periods remain available only to Admin and are
      // intentionally named "đợt nợ", never confused with order cycles.
      const historic=byCustomer.get(String(customerId));
      if(canLoadCycles()&&historic){
        const months=Array.isArray(historic.monthly)?historic.monthly:[];
        const periods=Array.isArray(historic.cycles)?historic.cycles:[];
        if(months.length||periods.length){
          const details=document.createElement('details');details.className='debt-cycle-history';
          details.appendChild(makeText('summary','debt-cycle-history-title',
            'Xem lịch sử tháng và đợt công nợ'));
          const list=document.createElement('ol');
          for(const month of months){
            const li=document.createElement('li');li.className='debt-cycle-history-item';
            li.textContent=monthCountText(month);list.appendChild(li);
          }
          for(const period of periods){
            const li=document.createElement('li');li.className='debt-cycle-history-item';
            li.textContent='Đợt nợ '+period.number+
              (period.closedAt?' · Đã tất toán':' · Chưa tất toán')+
              ' · '+dayLabel(period.startDay)+' → '+dayLabel(period.endDay);
            list.appendChild(li);
          }
          details.appendChild(list);panel.appendChild(details);
        }
      }
      return;
    }
    const row=byCustomer.get(String(customerId));
    if(!row){
      panel.appendChild(makeText('p','debt-cycle-empty','Đang tải lịch sử chu kỳ…'));
      return;
    }
    const cycles=Array.isArray(row.cycles)?row.cycles:[];
    const current=activeCycle(row);
    const month=currentMonthStats(row);
    if(month)panel.appendChild(makeText('strong','debt-cycle-detail-title',
      'Kỳ mua '+briefMonthText(month)+
      (Number(month.carryOver)>0?' · Nợ chuyển kỳ':'')));
    const heading=makeText('strong','debt-cycle-detail-title',
      current?'CK'+current.number+' · Đang nợ':'Đã tất toán · Chờ chu kỳ mới');
    panel.appendChild(heading);
    if(current){
      panel.appendChild(makeText('p','debt-cycle-detail-metrics',
        numeric(current.purchaseCount)+' đơn · '+numeric(current.durationDays)+
        ' ngày · Từ '+dayLabel(current.startDay)));
      // Compact status is the tappable summary; expanding it reveals the
      // full policy explanation and evidence reminder without losing data.
      const advice=document.createElement('details');
      advice.className='debt-cycle-advice';
      const warning=makeText('summary','debt-cycle-detail-warning',
        briefCycleStatus(current)+
        (current.policyDueDay?' · Hạn '+dayLabel(current.policyDueDay):''));
      warning.dataset.warning=current.policyDueDay?(current.policyIsDue===true?'true':''):
        (numeric(current.durationDays)>=7||numeric(current.daysWithoutPurchase)>=3?'true':'');
      advice.appendChild(warning);
      advice.appendChild(makeText('p','debt-cycle-detail-explanation',alertText(current)));
      if(Number(month?.carryOver)>0)advice.appendChild(makeText('p','debt-cycle-detail-explanation',
        'Có công nợ từ tháng trước chuyển sang, không tính là đơn mua mới.'));
      if(current.policyDueDay)advice.appendChild(makeText('p','debt-cycle-detail-explanation',
        'Hạn thanh toán hiện tại: '+dayLabel(current.policyDueDay)+
        ' · Theo '+(current.policyReason==='seven_days'?'mốc 7 ngày':'mốc ngừng mua 3 ngày')));
      panel.appendChild(advice);
    }else{
      panel.appendChild(makeText('p','debt-cycle-detail-metrics',
        cycles.length?'Đã đóng '+cycles.length+' chu kỳ · Lần mua nợ sau sẽ mở chu kỳ '+(cycles.length+1):
          'Chưa phát sinh chu kỳ nợ trên App'));
    }
    const months=Array.isArray(row.monthly)?row.monthly:[];
    if(!months.length&&!cycles.length)return;
    // One disclosure replaces two competing blue links. Both full histories
    // remain accessible after one tap; the finance ledger stays untouched.
    const details=document.createElement('details');details.className='debt-cycle-history';
    details.appendChild(makeText('summary','debt-cycle-history-title','Xem lịch sử kỳ mua và chu kỳ'));
    if(months.length){
      details.appendChild(makeText('p','debt-cycle-history-section','Kỳ tháng (6 tháng gần nhất)'));
      const monthlyList=document.createElement('ol');
      for(const item of months){
        const li=document.createElement('li');
        li.className='debt-cycle-history-item';
        li.appendChild(makeText('span','',monthCountText(item)+
          (Number(item.carryOver)>0?' · Có công nợ chuyển kỳ':'')));
        monthlyList.appendChild(li);
      }
      details.appendChild(monthlyList);
    }
    if(cycles.length){
      details.appendChild(makeText('p','debt-cycle-history-section',
        'Tất cả '+cycles.length+' chu kỳ (từ đầu App)'));
      const list=document.createElement('ol');
      for(const c of cycles){
        const li=document.createElement('li');li.className='debt-cycle-history-item';
        const period=dayLabel(c.startDay)+' → '+(c.closedAt?dayLabel(c.endDay):'hôm nay');
        li.append(
          makeText('strong','', 'Chu kỳ '+c.number+(c.closedAt?' · Đã tất toán':' · Chưa tất toán')),
          makeText('span','',period+' · '+compactDays(c)+' · '+numeric(c.purchaseCount)+' đơn')
        );
        list.appendChild(li);
      }
      details.appendChild(list);
    }
    panel.appendChild(details);
  }
  const oldRender=window.renderCongNo;
  if(typeof oldRender==='function')window.renderCongNo=function(...args){
    const result=oldRender.apply(this,args);
    syncCycleOwner();
    if(!canLoadCycles()&&!canLoadOrderCycles()){
      // The canonical list normally re-renders, but clear any leftover
      // admin-only decorations if the role changes without rebuilding cards.
      document.getElementById('debtCustomerListContainer')
        ?.querySelectorAll('.debt-cycle-card-meta').forEach(node=>node.remove());
      return result;
    }
    decorateList();
    // switchTab renders the target BEFORE marking it .active. Trigger
    // loading on the actual debt render, otherwise first-open never loads.
    const sig=currentSignature();
    if(sig!==previousBalanceSignature){previousBalanceSignature=sig;stale=true;}
    void load({force:stale});
    return result;
  };
  const oldOpen=window.openCustomerDebtModal;
  if(typeof oldOpen==='function')window.openCustomerDebtModal=async function(customerId,...args){
    const result=await oldOpen.call(this,customerId,...args);
    syncCycleOwner();
    // The canonical modal already loaded its first ledger page; cycle history
    // always arrives independently from the complete server-side ledger.
    decorateDetail(customerId);
    void load().then(()=>{
      if(String(typeof activeDebtCustomerId==='undefined'?'':activeDebtCustomerId||'')===String(customerId))decorateDetail(customerId);
    });
    return result;
  };
  window.TAPHOA_DEBT_CYCLES=Object.freeze({
    refresh:()=>load({force:true}),
    current:customerId=>{
      syncCycleOwner();
      return canLoadCycles()?activeCycle(byCustomer.get(String(customerId))):null;
    },
    list:customerId=>{
      syncCycleOwner();
      return canLoadCycles()?[...(byCustomer.get(String(customerId))?.cycles||[])]:[];
    },
    orders:customerId=>{
      syncCycleOwner();
      if(!canLoadOrderCycles())return [];
      const actor=window.TAPHOA_PRODUCTION?.getIdentity?.();
      if(actor?.role==='user'&&String(actor.uid)!==String(customerId))return [];
      return [...(orderByCustomer.get(String(customerId))?.orderCycles||[])];
    }
  });
})();
