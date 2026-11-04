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
  // SPEC-DEBT-PERIOD-VISUAL-20261104: payment tone tracks the real
  // policy due date, NEVER the 7-day progress fill. Colors must be
  // redundant with text, including overdue vs due today.
  function paymentCycleTone(row,policy){
    if(row?.isOpen!==true||!policy?.dueDay)return 'neutral';
    if(policy.isDue===true)return numeric(policy.daysOverdue)>0?'danger':'warning';
    const today=String(row.todayDay||'');
    const due=String(policy.dueDay||'');
    if(/^\d{4}-\d{2}-\d{2}$/.test(today)&&/^\d{4}-\d{2}-\d{2}$/.test(due)){
      const remaining=(Date.parse(due+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000;
      if(Number.isFinite(remaining)&&remaining<=1)return 'warning';
    }
    return 'success';
  }
  // A PAYMENT cycle is one open debt period, not one D7 per order.
  // Reuse the exact private policy also used by server payment-due logic.
  function displayOrderCycles(row){
    const open=row?.isOpen===true,policy=row?.paymentPolicy;
    if(!open)return {status:'Đã tất toán',context:' · Không còn chu kỳ nợ mở',warning:false};
    if(!policy?.dueDay)return {status:'Đang nợ',context:' · Chưa xác định hạn theo chính sách',warning:false};
    const due=dayLabel(policy.dueDay);
    const reason=policy.dueReason==='stopped_buying'?'ngừng nhập 3 ngày':'D7';
    const late=numeric(policy.daysOverdue);
    const status=policy.isDue===true?(late>0?'Quá hạn '+late+' ngày':'Đến hạn hôm nay'):
      'Hạn tất toán '+due;
    return {
      status,
      context:' · Đợt nợ '+numeric(policy.cycleNo)+' · '+numeric(row.orderCount)+' đơn · '+reason,
      warning:policy.isDue===true
    };
  }
  const summaryFormat=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric'});
  const dayLabel=key=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key||'')))return '—';
    const [y,m,d]=key.split('-');return d+'/'+m+'/'+y;
  };
  const numeric=value=>Math.max(0,Number(value)||0);
  // Finance panels use thousands of VND consistently (e.g. 1.037).
  // A unit caption is shown once; no trailing currency suffix per amount.
  const formatOrderThousands=value=>{
    const amount=Number(value);
    if(!Number.isFinite(amount)||amount<0)return '—';
    return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:3}).format(amount);
  };
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
        const policy=purchase.paymentPolicy;
        panel.title=purchase.isOpen===true
          ?policy?.dueDay
            ?'Một đợt nợ · Hạn tất toán '+dayLabel(policy.dueDay)+
              ' · D7 tối đa '+dayLabel(policy.sevenDueDay)+
              ' · Mốc nghỉ mua '+dayLabel(policy.stopDueDay)+
              ' · Mua thêm không gia hạn kỳ nợ'
            :'Có dư nợ, chưa xác định được hạn thanh toán'
          :'Đã tất toán công nợ; không còn kỳ nợ đang mở';
        const tone=paymentCycleTone(purchase,policy);
        panel.dataset.tone=tone;
        panel.dataset.warning=tone==='danger'?'true':'';
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
      panel.className='debt-cycle-detail';panel.setAttribute('aria-label','Chu kỳ thanh toán công nợ và lịch sử nhập hàng');
      holder.insertBefore(panel,history);
    }
    panel.replaceChildren();
    panel.dataset.tone='neutral';
    const purchase=orderByCustomer.get(String(customerId));
    if(purchase){
      const orders=Array.isArray(purchase.orderCycles)?purchase.orderCycles:[];
      const policy=purchase.paymentPolicy;
      // One disclosure for policy, order history and prior debt periods:
      // preserve all three explanations without three competing blue links.
      const more=document.createElement('details');
      more.className='debt-cycle-more';
      more.appendChild(makeText('summary','debt-cycle-more-summary','Xem chi tiết chu kỳ'));
      if(purchase.isOpen&&policy?.dueDay){
        const tone=paymentCycleTone(purchase,policy);
        panel.dataset.tone=tone;
        const late=numeric(policy.daysOverdue);
        const reason=policy.dueReason==='stopped_buying'?'ngừng nhập đủ 3 ngày':'đến D7';
        const status=late>0?'Quá hạn '+late+' ngày':
          policy.isDue===true?'Đến hạn hôm nay':
          tone==='warning'?'Sắp đến hạn':'Trong hạn';
        const heading=document.createElement('div');
        heading.className='debt-cycle-period-header';
        heading.append(
          makeText('strong','debt-cycle-detail-title',
            'Chu kỳ nợ '+numeric(policy.cycleNo)+' · '+numeric(purchase.orderCount)+' đơn'),
          makeText('span','debt-cycle-status-pill',status)
        );
        panel.appendChild(heading);
        const progress=document.createElement('progress');
        progress.className='debt-cycle-order-progress debt-cycle-period-progress';
        progress.max=7;
        progress.value=Math.max(1,Math.min(7,numeric(policy.durationDays)||1));
        progress.dataset.tone=tone;
        progress.setAttribute('aria-label','Ngày '+numeric(policy.durationDays)+
          ' của chu kỳ 7 ngày · '+status);
        panel.appendChild(progress);
        panel.appendChild(makeText('p','debt-cycle-period-due',
          'Hạn tất toán '+dayLabel(policy.dueDay)+' · '+reason));
        panel.appendChild(makeText('p','debt-cycle-detail-metrics',
          (numeric(policy.durationDays)>7?'Đã qua D7':'Ngày '+numeric(policy.durationDays)+'/7')+
          ' · Mua cuối '+dayLabel(policy.lastPurchaseDay)+
          ' · '+numeric(policy.idleDays)+' ngày chưa nhập'));
        // Policy explanation is available on demand rather than occupying
        // six rows above the independently scrollable transaction list.
        const policyDetails=document.createElement('details');
        policyDetails.className='debt-cycle-policy-details';
        policyDetails.appendChild(makeText('summary','debt-cycle-policy-summary',
          'Xem cách tính hạn thanh toán'));
        policyDetails.appendChild(makeText('p','debt-cycle-detail-explanation',
          'Bắt đầu kỳ '+dayLabel(policy.startDay)+
          ' · D7 tối đa '+dayLabel(policy.sevenDueDay)+
          ' · Mốc ngừng nhập '+dayLabel(policy.stopDueDay)));
        policyDetails.appendChild(makeText('p','debt-cycle-detail-explanation',
          'Hạn sớm nhất được giữ nguyên dù mua thêm. Phải tất toán toàn bộ khi ngừng nhập 3 ngày, đến D7 hoặc đạt hạn mức đã thỏa thuận.'));
        more.appendChild(policyDetails);
      }else if(purchase.isOpen){
        panel.appendChild(makeText('strong','debt-cycle-detail-title','Đang nợ · Chưa xác định hạn chính sách'));
        panel.appendChild(makeText('p','debt-cycle-detail-explanation',
          'Không dùng hạn của từng đơn làm hạn tất toán. Vui lòng kiểm tra chính sách hoặc làm mới dữ liệu.'));
      }else{
        panel.appendChild(makeText('strong','debt-cycle-detail-title',
          'Đã tất toán · Không còn chu kỳ nợ mở'));
        panel.appendChild(makeText('p','debt-cycle-detail-metrics',
          'Chỉ mở chu kỳ mới khi lại phát sinh công nợ.'));
      }
      if(orders.length){
        const details=document.createElement('details');
        details.className='debt-cycle-history';
        details.appendChild(makeText('summary','debt-cycle-history-title',
          'Xem '+orders.length+' đơn nhập trong đợt nợ'));
        details.appendChild(makeText('p','debt-cycle-detail-explanation',
          'Đơn vị: nghìn đồng. Lịch sử đơn chỉ để đối chiếu, không phải các hạn thanh toán riêng.'));
        const list=document.createElement('ol');
        for(const order of orders.slice(-60).reverse()){
          const li=document.createElement('li');
          li.className='debt-cycle-history-item debt-cycle-order-item';
          li.append(
            makeText('strong','', 'Đơn '+dayLabel(order.purchaseDay)),
            makeText('span','debt-cycle-order-sub','Giá trị '+formatOrderThousands(order.amountThousands))
          );
          list.appendChild(li);
        }
        details.appendChild(list);
        if(orders.length>60)details.appendChild(makeText('p','debt-cycle-detail-explanation',
          'Hiển thị 60/'+orders.length+' đơn gần nhất.'));
        more.appendChild(details);
      }
      // Historical debt periods are separate, read-only and Admin-only.
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
          details.appendChild(list);more.appendChild(details);
        }
      }
      if(more.children.length>1)panel.appendChild(more);
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
