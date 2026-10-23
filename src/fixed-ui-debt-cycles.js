/* DEBT-CYCLE-20261023 — readonly cycle badges + complete per-customer history.
   Authoritative cycle boundaries come from the complete server ledger; never
   reset for 3/7-day warnings and never write money/balances from this module. */
(function(){
  'use strict';
  let byCustomer=new Map();
  let loadedAt=0;
  let pending=null;
  let stale=false;
  let previousBalanceSignature='';
  const TTL=45000;
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
  function alertText(cycle){
    if(!cycle)return 'Chưa phát sinh nợ mới';
    const elapsed=numeric(cycle.durationDays),idle=numeric(cycle.daysWithoutPurchase);
    const warnings=[];
    if(elapsed>=7)warnings.push(elapsed===7?'Đến hạn ngày 7':'Quá hạn '+(elapsed-7)+' ngày');
    else warnings.push('Còn '+(7-elapsed)+' ngày đến mốc 7');
    if(idle>=3)warnings.push('Đã ngừng mua '+idle+' ngày');
    else warnings.push('Cách lần mua '+idle+' ngày');
    return warnings.join(' · ');
  }
  function currentSignature(){
    // Readonly summary signatures. A paid/adjusted balance triggers a fresh
    // cycle calculation without waiting for TTL or storing a second ledger.
    const rows=Array.isArray(window.appData?.thuchi)?window.appData.thuchi:[];
    return rows.filter(x=>x&&x[6]==='summary')
      .map(x=>String(x[1])+':'+String(x[3])+':'+String(x[4]))
      .sort().join('|');
  }
  async function load({force=false}={}){
    if(!hasPermission('canViewDebt'))return null;
    if(pending)return pending;
    if(!force&&!stale&&byCustomer.size&&Date.now()-loadedAt<TTL)return byCustomer;
    const bridge=window.TAPHOA_PRODUCTION;
    if(typeof bridge?.debtCycles!=='function')return null;
    pending=(async()=>{
      const data=await bridge.debtCycles();
      if(!Array.isArray(data))throw Error('Invalid cycle response');
      const map=new Map();
      for(const item of data){
        if(item?.customerId&&Array.isArray(item.cycles))map.set(String(item.customerId),item);
      }
      byCustomer=map;loadedAt=Date.now();stale=false;
      decorateList();
      const selected=String(window.activeDebtCustomerId||'');
      if(selected&&document.getElementById('customerDebtModalWrapper')?.classList.contains('pointer-events-none')===false)
        decorateDetail(selected);
      return map;
    })().catch(err=>{
      console.warn('[taphoa] debt cycles read failed:',String(err?.message||err));
      showCycleStatus('Không tải được nhịp mua. Công nợ gốc vẫn giữ nguyên.');
      return null;
    }).finally(()=>{pending=null;});
    return pending;
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
    if(!container||!hasPermission('canViewDebt'))return;
    const note=document.getElementById('debtCycleLoadStatus');
    if(note&&byCustomer.size)note.remove();
    for(const card of container.querySelectorAll('.debt-customer-card[data-debt-customer-id]')){
      const id=String(card.dataset.debtCustomerId||'');
      const row=byCustomer.get(id);
      const cycle=activeCycle(row);
      const cycles=row?.cycles||[];
      const body=card.querySelector('.debt-customer-body');
      if(!body)continue;
      let panel=body.querySelector('.debt-cycle-card-meta');
      if(!panel){panel=document.createElement('div');panel.className='debt-cycle-card-meta';body.appendChild(panel);}
      if(!row){panel.textContent='';continue;}
      const last=cycles.length?cycles[cycles.length-1]:null;
      if(!cycle){
        panel.textContent=last?'Đã tất toán chu kỳ '+last.number+' · '+last.purchaseCount+' lượt mua · '+compactDays(last):'Chưa phát sinh chu kỳ nợ';
        panel.dataset.warning='';
      }else{
        panel.textContent='Chu kỳ '+cycle.number+' · Ngày '+cycle.durationDays+' · '+cycle.purchaseCount+' lượt mua · '+alertText(cycle);
        panel.dataset.warning=(numeric(cycle.durationDays)>=7||numeric(cycle.daysWithoutPurchase)>=3)?'true':'';
      }
    }
  }
  function makeText(tag,cls,value){
    const e=document.createElement(tag);e.className=cls||'';e.textContent=value;return e;
  }
  function decorateDetail(customerId){
    const holder=document.getElementById('customerDebtContentToShare');
    const history=document.getElementById('cDebtModalHistoryList');
    if(!holder||!history||!hasPermission('canViewDebt'))return;
    let panel=holder.querySelector('#debtCyclePanel');
    if(!panel){
      panel=document.createElement('section');panel.id='debtCyclePanel';
      panel.className='debt-cycle-detail';panel.setAttribute('aria-label','Lịch sử chu kỳ công nợ');
      holder.insertBefore(panel,history);
    }
    panel.replaceChildren();
    const row=byCustomer.get(String(customerId));
    if(!row){
      panel.appendChild(makeText('p','debt-cycle-empty','Đang tải lịch sử chu kỳ…'));
      return;
    }
    const cycles=Array.isArray(row.cycles)?row.cycles:[];
    const current=activeCycle(row);
    const heading=makeText('strong','debt-cycle-detail-title',
      current?'Chu kỳ '+current.number+' · Đang nợ':'Đã tất toán · Chờ chu kỳ mới');
    panel.appendChild(heading);
    if(current){
      const metrics=makeText('div','debt-cycle-detail-metrics',
        'Từ '+dayLabel(current.startDay)+' · Ngày '+current.durationDays+
        ' · '+current.purchaseCount+' lượt mua');
      const warning=makeText('p','debt-cycle-detail-warning',alertText(current));
      warning.dataset.warning=(numeric(current.durationDays)>=7||numeric(current.daysWithoutPurchase)>=3)?'true':'';
      panel.append(metrics,warning);
    }else{
      panel.appendChild(makeText('p','debt-cycle-detail-metrics',
        cycles.length?'Đã đóng '+cycles.length+' chu kỳ · Lần mua nợ sau sẽ mở chu kỳ '+(cycles.length+1):
          'Chưa phát sinh chu kỳ nợ trên App'));
    }
    if(!cycles.length)return;
    const details=document.createElement('details');details.className='debt-cycle-history';
    details.appendChild(makeText('summary','debt-cycle-history-title','Xem tất cả '+cycles.length+' chu kỳ (từ đầu App)'));
    const list=document.createElement('ol');
    for(const c of cycles){
      const li=document.createElement('li');li.className='debt-cycle-history-item';
      const period=dayLabel(c.startDay)+' → '+(c.closedAt?dayLabel(c.endDay):'hôm nay');
      li.append(
        makeText('strong','', 'Chu kỳ '+c.number+(c.closedAt?' · Đã tất toán':' · Chưa tất toán')),
        makeText('span','',period+' · '+compactDays(c)+' · '+numeric(c.purchaseCount)+' lượt mua')
      );
      list.appendChild(li);
    }
    details.appendChild(list);panel.appendChild(details);
  }
  const oldRender=window.renderCongNo;
  if(typeof oldRender==='function')window.renderCongNo=function(...args){
    const result=oldRender.apply(this,args);
    decorateList();
    if(document.querySelector('.tab-content.active')?.id==='tab-cong-no'){
      const sig=currentSignature();
      if(sig!==previousBalanceSignature){previousBalanceSignature=sig;stale=true;}
      void load({force:stale});
    }
    return result;
  };
  const oldOpen=window.openCustomerDebtModal;
  if(typeof oldOpen==='function')window.openCustomerDebtModal=async function(customerId,...args){
    const result=await oldOpen.call(this,customerId,...args);
    // The canonical modal already loaded its first ledger page; cycle history
    // always arrives independently from the complete server-side ledger.
    window.activeDebtCustomerId=customerId;
    decorateDetail(customerId);
    void load().then(()=>{
      if(String(window.activeDebtCustomerId||'')===String(customerId))decorateDetail(customerId);
    });
    return result;
  };
  window.TAPHOA_DEBT_CYCLES=Object.freeze({
    refresh:()=>load({force:true}),
    current:customerId=>activeCycle(byCustomer.get(String(customerId))),
    list:customerId=>[...(byCustomer.get(String(customerId))?.cycles||[])]
  });
})();
