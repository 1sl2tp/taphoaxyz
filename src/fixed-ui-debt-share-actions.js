'use strict';
(function(){
  const button=document.getElementById('debtShareButton');
  if(!button)return;
  const menu=document.createElement('div');
  menu.id='debtShareActionMenu';
  menu.hidden=true;
  menu.setAttribute('role','menu');
  menu.setAttribute('aria-label','Chia sẻ công nợ');
  menu.style.cssText='position:fixed;z-index:650;width:188px;padding:5px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 10px 32px rgba(15,23,42,.17)';
  const actions=[
    ['send','ph-paper-plane-tilt','Gửi công nợ'],
    ['save','ph-download-simple','Lưu'],
    ['copy','ph-copy','Sao chép']
  ];
  menu.innerHTML=actions.map(([action,icon,label])=>
    '<button type="button" role="menuitem" data-debt-share-action="'+action+
    '" style="display:flex;align-items:center;gap:10px;width:100%;padding:11px 12px;border:0;background:transparent;border-radius:9px;cursor:pointer;text-align:left;color:#0f172a;font:600 14px system-ui">'+
    '<i class="ph-bold '+icon+'" aria-hidden="true"></i>'+label+'</button>'
  ).join('');
  document.body.appendChild(menu);
  const close=()=>{menu.hidden=true;button.setAttribute('aria-expanded','false');};
  const open=()=>{
    const rect=button.getBoundingClientRect();
    menu.style.top=Math.max(8,Math.min(window.innerHeight-160,rect.bottom+8))+'px';
    menu.style.left=Math.max(8,Math.min(window.innerWidth-196,rect.right-188))+'px';
    menu.hidden=false;
    button.setAttribute('aria-expanded','true');
    menu.querySelector('button')?.focus();
  };
  button.removeAttribute('onclick');
  button.setAttribute('aria-haspopup','menu');
  button.setAttribute('aria-controls','debtShareActionMenu');
  button.setAttribute('aria-expanded','false');
  button.onclick=()=>menu.hidden?open():close();
  let inFlight=false;
  menu.addEventListener('click',event=>{
    const item=event.target.closest('[data-debt-share-action]');
    if(!item||inFlight)return;
    const action=item.dataset.debtShareAction;
    close();
    if(!['send','save','copy'].includes(action))return;
    inFlight=true;
    Promise.resolve(window.shareCustomerDebtImage(action))
      .catch(error=>{
        if(typeof window.showAlertPopup==='function')
          window.showAlertPopup('Không chia sẻ được công nợ',String(error?.message||error));
      }).finally(()=>{inFlight=false;});
  });
  document.addEventListener('pointerdown',event=>{
    if(!menu.hidden&&!menu.contains(event.target)&&!button.contains(event.target))close();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!menu.hidden)close();
  });
  window.addEventListener('resize',close);
  document.addEventListener('scroll',close,true);
})();