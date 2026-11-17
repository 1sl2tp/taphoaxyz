/* ORDER-UI-385: One invoice template catalogue, one saved visual preference.
   This module never writes business data, creates orders, or sends messages.
   Preference is per browser/PWA installation until server-side admin settings exist. */
(function(){
  'use strict';
  const KEY='TAPHOA_INVOICE_TEMPLATE_V1';
  const TEMPLATES=Object.freeze({
    print:Object.freeze({id:'print',label:'00 · Đen trắng',description:'Mẫu gốc chuẩn bản in, ít mực',swatch:'#171717',
      header:'#ffffff',headerText:'#171717',headerRule:'#242424',
      customer:'#ffffff',meta:'#ffffff',infoBorder:'#d1d5db',table:'#f7f7f7',
      footer:'#ffffff',rowRule:'#d1d5db',code:'#171717',total:'#171717',
      draft:'#ffffff',draftCode:'#171717'}),
    minimal:Object.freeze({id:'minimal',label:'01 · Tối giản',description:'Trắng, xám nhạt, phù hợp gửi Chat',swatch:'#687682',
      header:'#eff2f4',headerText:'#1c2934',headerRule:'#b7c5cf',
      customer:'#f8fafb',meta:'#f8fafb',infoBorder:'#e2e8ee',table:'#f3f5f7',
      footer:'#f7f9f8',rowRule:'#e0e7eb',code:'#1c2934',total:'#1b4a36',
      draft:'#fff8ed',draftCode:'#8c551f'}),
    navy:Object.freeze({id:'navy',label:'02 · Business Navy',description:'Xanh navy trầm, chuyên nghiệp',swatch:'#203c52',
      header:'#203c52',headerText:'#ffffff',headerRule:'#92a9b9',
      customer:'#f3f6f8',meta:'#f3f6f8',infoBorder:'#e5ebef',table:'#f3f5f8',
      footer:'#f5f8f6',rowRule:'#e3eaf1',code:'#203c52',total:'#226c49',
      draft:'#fff5eb',draftCode:'#86531c'}),
    sage:Object.freeze({id:'sage',label:'03 · Retail Green',description:'Xanh lá dịu, nhận diện bán lẻ',swatch:'#406e56',
      header:'#406e56',headerText:'#ffffff',headerRule:'#c1d5c7',
      customer:'#f8faf7',meta:'#edf5ee',infoBorder:'#dfebe0',table:'#f0f6f0',
      footer:'#f1f7f1',rowRule:'#dae7dc',code:'#305941',total:'#255f3b',
      draft:'#fff6e7',draftCode:'#86531c'})
  });
  let fallback='print';
  let savedId=null;
  function valid(value){return Object.prototype.hasOwnProperty.call(TEMPLATES,String(value||''));}
  function selected(){
    if(savedId&&valid(savedId))return savedId;
    try{const stored=localStorage.getItem(KEY);if(valid(stored))return stored;}catch(_){}
    return fallback;
  }
  function paletteFor(options){
    const desired=String(options&&options.templateId||selected());
    return TEMPLATES[valid(desired)?desired:'print'];
  }
  function save(id){
    if(!valid(id))return false;
    try{localStorage.setItem(KEY,id);}catch(_){return false;}
    savedId=id;
    document.dispatchEvent(new CustomEvent('taphoa:invoice-template-changed',{detail:{id:id}}));
    return true;
  }
  window.TAPHOA_INVOICE_TEMPLATES=Object.freeze({
    templates:TEMPLATES,selected:selected,paletteFor:paletteFor,save:save
  });
  function mount(){
    const settings=document.querySelector('#tab-cai-dat .settings-list');
    if(!settings||document.getElementById('invoiceTemplatesManage'))return;
    const section=document.createElement('section');
    section.className='settings-row px-4 py-3.5 invoice-template-entry';
    section.innerHTML=[
      '<div class="invoice-template-entry-head">',
      '<span class="settings-icon"><i class="ph-bold ph-receipt"></i></span>',
      '<div><strong>Quản lý giao diện · Mẫu hóa đơn</strong>',
      '<p>Đen trắng chuẩn in · Tối giản · Navy · Xanh lá</p></div></div>',
      '<div class="invoice-template-entry-actions">',
      '<span id="invoiceTemplateCurrent" class="invoice-template-current"></span>',
      '<button id="invoiceTemplatesManage" class="allow-fast-click invoice-template-manage" type="button">Quản lý mẫu</button>',
      '</div>'
    ].join('');
    const first=settings.querySelector('.settings-row');
    if(first)first.insertAdjacentElement('afterend',section);
    else settings.appendChild(section);
    const layer=document.createElement('div');
    layer.className='invoice-template-layer';
    layer.id='invoiceTemplateLayer';
    layer.hidden=true;
    layer.innerHTML=[
      '<div class="invoice-template-backdrop" data-template-close="1"></div>',
      '<section class="invoice-template-dialog" role="dialog" aria-modal="true" aria-labelledby="invoiceTemplateHeading">',
      '<header class="invoice-template-dialog-head"><div>',
      '<p class="invoice-template-eyebrow">CÀI ĐẶT · QUẢN LÝ GIAO DIỆN</p>',
      '<h2 id="invoiceTemplateHeading">Mẫu hóa đơn</h2>',
      '<p>Một dữ liệu, bốn kiểu trình bày. Chọn trước, xem thử rồi lưu.</p>',
      '</div><button type="button" class="allow-fast-click invoice-template-close" data-template-close="1" aria-label="Đóng">×</button></header>',
      '<div class="invoice-template-dialog-body">',
      '<div id="invoiceTemplateOptions" class="invoice-template-options" role="radiogroup" aria-label="Chọn mẫu hóa đơn"></div>',
      '<div class="invoice-template-preview-head"><strong>Xem trước hóa đơn</strong>',
      '<span id="invoiceTemplatePreviewName">Mẫu 00</span></div>',
      '<div class="invoice-template-preview"><img id="invoiceTemplatePreviewImage" alt="Xem trước hóa đơn mẫu DG400" />',
      '<p id="invoiceTemplatePreviewError" class="invoice-template-preview-error" hidden>Không tạo được ảnh xem trước.</p></div>',
      '<p class="invoice-template-note">Dữ liệu minh họa DG400 · Không gửi tin, không tạo đơn, không thay đổi công nợ.</p>',
      '<p class="invoice-template-note">Lựa chọn được lưu trên trình duyệt/PWA hiện tại; các thiết bị khác có thể dùng mẫu riêng.</p>',
      '</div>',
      '<footer class="invoice-template-actions">',
      '<button type="button" id="invoiceTemplateReset" class="allow-fast-click invoice-template-reset">Về mẫu 00</button>',
      '<button type="button" id="invoiceTemplateSave" class="allow-fast-click invoice-template-save">Lưu mẫu sử dụng</button>',
      '</footer>',
      '</section>'
    ].join('');
    document.body.appendChild(layer);
    const currentText=document.getElementById('invoiceTemplateCurrent');
    const options=document.getElementById('invoiceTemplateOptions');
    const preview=document.getElementById('invoiceTemplatePreviewImage');
    const previewName=document.getElementById('invoiceTemplatePreviewName');
    const previewError=document.getElementById('invoiceTemplatePreviewError');
    let staged=selected(),previousFocus=null;
    const demo=Object.freeze({
      customer:'test',orderId:'DG400',time:'17/11/2026 21:38',
      isDraft:false,lineCount:2,totalQty:2,totalPriceText:'387',
      items:[{index:1,name:'555 bạc',qtyText:'1',priceText:'241',totalText:'241'},
             {index:2,name:'5*',qtyText:'1',priceText:'146',totalText:'146'}]
    });
    const labelSelected=()=>{currentText.textContent=TEMPLATES[selected()].label;};
    function redraw(){
      options.replaceChildren();
      Object.values(TEMPLATES).forEach(t=>{
        const button=document.createElement('button');
        button.type='button';
        button.className='allow-fast-click invoice-template-option'+(staged===t.id?' is-selected':'');
        button.setAttribute('role','radio');
        button.setAttribute('aria-checked',String(staged===t.id));
        button.dataset.templateId=t.id;
        const swatch=document.createElement('span');
        swatch.className='invoice-template-swatch';
        swatch.style.background=t.swatch;
        const body=document.createElement('span');
        body.className='invoice-template-option-text';
        const title=document.createElement('strong');
        title.textContent=t.label;
        const desc=document.createElement('small');
        desc.textContent=t.description;
        body.append(title,desc);
        const marker=document.createElement('span');
        marker.className='invoice-template-option-marker';
        marker.textContent=staged===t.id?'✓':'';
        button.append(swatch,body,marker);
        button.addEventListener('click',()=>{staged=t.id;redraw();});
        options.appendChild(button);
      });
      previewName.textContent=TEMPLATES[staged].label;
      try{
        const renderer=window.TAPHOA_ORDER_PORTRAIT;
        if(!renderer||!renderer.renderCanvas)throw Error('order_renderer_unavailable');
        const canvas=renderer.renderCanvas(Object.assign({},demo,{templateId:staged}),1);
        preview.src=canvas.toDataURL('image/png');
        preview.hidden=false;previewError.hidden=true;
      }catch(_){preview.removeAttribute('src');preview.hidden=true;previewError.hidden=false;}
    }
    function close(){
      layer.hidden=true;
      document.body.classList.remove('invoice-template-modal-open');
      if(previousFocus&&previousFocus.isConnected)previousFocus.focus();
    }
    function open(){
      previousFocus=document.activeElement;
      staged=selected();
      redraw();
      layer.hidden=false;
      document.body.classList.add('invoice-template-modal-open');
      layer.querySelector('.invoice-template-close').focus();
    }
    layer.addEventListener('click',e=>{if(e.target.closest('[data-template-close="1"]'))close();});
    document.addEventListener('keydown',e=>{
      if(layer.hidden)return;
      if(e.key==='Escape'){e.preventDefault();close();}
      if(e.key==='Tab'){
        const focusable=Array.from(layer.querySelectorAll('button:not([disabled])'));
        const first=focusable[0],last=focusable[focusable.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    document.getElementById('invoiceTemplatesManage').addEventListener('click',open);
    document.getElementById('invoiceTemplateReset').addEventListener('click',()=>{staged='print';redraw();});
    document.getElementById('invoiceTemplateSave').addEventListener('click',()=>{
      if(!save(staged)){
        previewError.textContent='Không lưu được trên thiết bị này. Vui lòng kiểm tra chế độ lưu trữ.';
        previewError.hidden=false;return;
      }
      labelSelected();close();
    });
    labelSelected();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();