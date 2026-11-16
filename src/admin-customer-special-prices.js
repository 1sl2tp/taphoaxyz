/* SPEC-ADMIN-CP-001 · Admin-only customer price columns.
 * The UI is not the authority: dedicated server RPCs enforce Admin role,
 * selected-customer identity and product/price constraints.
 */
export function createSpecialPriceColumns({rpc,getIdentity,getItems,getSession}){
  const el=id=>document.getElementById(id);
  const state={selected:[],customers:null,prices:new Map(),request:0,edits:new Map(),booted:false};
  const maxColumns=8;
  const key=(customerId,code)=>customerId+'|'+code;
  const authorized=()=>getIdentity()?.role==='admin'&&getIdentity()?.active===true;
  const context=()=>({uid:String(getIdentity()?.uid||''),session:getSession(),version:state.request});
  const current=c=>authorized()&&c.uid===String(getIdentity()?.uid||'')&&c.session===getSession()&&c.version===state.request;
  const info=(message,isError=false)=>{
    const node=el('specialPriceNote');
    if(!node)return;
    node.textContent=message;
    node.style.color=isError?'#b91c1c':'#64748b';
  };
  const displayName=id=>state.customers?.find(row=>row.id===id)?.name||'Khách đã chọn';
  function cleanOldColumns(){
    for(const cell of document.querySelectorAll('#goodsPane [data-special-price-column]'))cell.remove();
  }
  function reset(){
    state.request++;
    state.selected=[];
    state.customers=null;
    state.prices.clear();
    state.edits.clear();
    cleanOldColumns();
    if(el('specialPriceSelected'))el('specialPriceSelected').replaceChildren();
    if(el('specialPricePickerList'))el('specialPricePickerList').replaceChildren();
    if(el('specialPricePicker')?.open)el('specialPricePicker').close();
    if(el('specialPriceToolbar'))el('specialPriceToolbar').hidden=true;
  }
  function chips(){
    const host=el('specialPriceSelected');
    if(!host)return;
    host.replaceChildren();
    for(const id of state.selected){
      const button=document.createElement('button');
      button.type='button';
      button.className='chip';
      button.title='Ẩn cột của '+displayName(id)+' (giá đã lưu vẫn còn)';
      button.textContent=displayName(id)+' ×';
      button.addEventListener('click',()=>removeColumn(id));
      host.append(button);
    }
  }
  function mount(){
    if(state.booted)return;
    const button=el('specialPriceAddCustomer');
    const dialog=el('specialPricePicker');
    const list=el('specialPricePickerList');
    const search=el('specialPricePickerSearch');
    if(!button||!dialog||!list||!search)return;
    state.booted=true;
    button.addEventListener('click',()=>{void openPicker();});
    el('specialPricePickerClose').addEventListener('click',()=>dialog.close());
    search.addEventListener('input',paintPicker);
    list.addEventListener('click',event=>{
      const btn=event.target.closest('button[data-customer-id]');
      if(!btn||btn.disabled||!authorized())return;
      const id=btn.dataset.customerId;
      if(!state.customers?.some(row=>row.id===id)||state.selected.includes(id))return;
      if(state.selected.length>=maxColumns){info('Chỉ mở tối đa 8 cột cùng lúc.',true);return;}
      state.selected.push(id);
      dialog.close();
      chips();
      render();
    });
    el('productBody').addEventListener('keydown',event=>{
      if(event.isComposing||event.keyCode===229)return;
      if(event.target.matches('.special-price-input')&&event.key==='Enter'){
        event.preventDefault();event.target.blur();
      }
    });
    el('productBody').addEventListener('focusout',event=>{
      if(event.target.matches('.special-price-input'))void saveCell(event.target);
    });
    dialog.addEventListener('close',()=>{search.value='';});
  }
  async function openPicker(){
    if(!authorized())return;
    const dialog=el('specialPricePicker');
    if(!dialog)return;
    dialog.showModal();
    if(state.customers===null){
      el('specialPricePickerStatus').textContent='Đang tải danh sách khách…';
      const ctx=context();
      try{
        const data=await rpc('taphoa_admin_customer_special_price_customers');
        if(!current(ctx))return;
        if(!Array.isArray(data))throw new Error('invalid_customer_list');
        state.customers=data.filter(row=>/^[\da-f-]{36}$/i.test(String(row?.id||'')))
          .map(row=>({id:String(row.id),name:String(row.name||'Khách hàng').slice(0,100)}));
        el('specialPricePickerStatus').textContent=state.customers.length+' khách có thể chọn';
        chips();
      }catch(error){
        if(!current(ctx))return;
        el('specialPricePickerStatus').textContent='Chưa kết nối được tính năng giá riêng. Không có giá nào được ghi.';
        info('Không tải được danh sách giá riêng · kiểm tra dịch vụ quản trị.',true);
        return;
      }
    }
    paintPicker();
    el('specialPricePickerSearch').focus();
  }
  function paintPicker(){
    const list=el('specialPricePickerList');
    const query=el('specialPricePickerSearch')?.value.trim().normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').toLowerCase()||'';
    if(!list)return;
    list.replaceChildren();
    for(const customer of (state.customers||[]).filter(row=>
      row.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query)).slice(0,100)){
      const button=document.createElement('button');
      button.type='button';
      button.dataset.customerId=customer.id;
      button.disabled=state.selected.includes(customer.id);
      button.textContent=customer.name+(button.disabled?' · đã chọn':'');
      list.append(button);
    }
  }
  async function removeColumn(id){
    if(!await flush()){info('Có giá riêng chưa lưu. Sửa ô đỏ trước khi ẩn cột.',true);return;}
    state.selected=state.selected.filter(value=>value!==id);
    state.request++;
    chips();
    render();
  }
  function addColumns(){
    cleanOldColumns();
    const header=el('goodsPane')?.querySelector('.sheet-wrap thead tr');
    const base=header?.querySelector('[data-col="price"]');
    if(!header||!base)return;
    for(const id of state.selected){
      const th=document.createElement('th');
      th.dataset.specialPriceColumn=id;
      th.className='special-price-column';
      th.style.width='132px';th.style.minWidth='132px';th.style.maxWidth='132px';
      const inner=document.createElement('div');
      inner.className='special-price-th';
      const name=document.createElement('span');
      name.textContent=displayName(id);
      name.title=displayName(id)+' · giá riêng';
      const hide=document.createElement('button');
      hide.type='button';hide.className='special-price-hide';
      hide.setAttribute('aria-label','Ẩn cột của '+displayName(id));
      hide.title='Ẩn cột, không xóa giá';hide.textContent='×';
      hide.addEventListener('click',()=>removeColumn(id));
      inner.append(name,hide);th.append(inner);
      base.after(th);
    }
    // Inserting after the same anchor reverses order. Match chip order.
    const headers=[...header.querySelectorAll('[data-special-price-column]')];
    for(const th of headers)header.append(th);
    let at=base;
    for(const id of state.selected){
      const th=headers.find(node=>node.dataset.specialPriceColumn===id);
      if(th){at.after(th);at=th;}
    }
    for(const row of el('productBody').rows){
      const item=getItems()[Number(row.dataset.index)];
      if(!item)continue;
      const sale=row.querySelector('[data-col="price"]');
      if(!sale)continue;
      let anchor=sale;
      for(const id of state.selected){
        const td=document.createElement('td');
        td.dataset.specialPriceColumn=id;
        td.className='special-price-cell';
        td.style.width='132px';td.style.minWidth='132px';td.style.maxWidth='132px';
        const input=document.createElement('input');
        input.className='special-price-input';
        input.type='text';input.inputMode='decimal';input.autocomplete='off';
        input.dataset.customerId=id;input.dataset.productCode=item.product_code;
        input.placeholder='Giá chung';
        input.title='Để trống = dùng giá bán chung. Chỉ Admin được lưu giá riêng.';
        input.setAttribute('aria-label','Giá riêng '+displayName(id)+' cho '+item.product_name);
        input.disabled=true; // Until a successful authorized read.
        td.append(input);anchor.after(td);anchor=td;
      }
    }
  }
  function render(){
    state.request++; // Every new page/selection invalidates earlier reads.
    if(!authorized()){reset();return;}
    el('specialPriceToolbar').hidden=false;
    chips();
    addColumns();
    if(!state.selected.length){
      info('Ô trống = giá chung. Ẩn cột không xóa giá riêng.');
      return;
    }
    void loadVisible();
  }
  async function loadVisible(){
    if(!authorized()||!state.selected.length)return;
    const codes=[...new Set(getItems().map(item=>String(item.product_code||'')).filter(Boolean))];
    if(!codes.length)return;
    const ctx=context(), selected=[...state.selected];
    info('Đang đọc giá riêng theo từng khách…');
    try{
      const data=await rpc('taphoa_admin_customer_special_price_matrix',{
        p_customer_ids:selected,p_product_codes:codes
      });
      if(!current(ctx))return;
      if(!Array.isArray(data))throw new Error('invalid_price_matrix');
      const map=new Map();
      for(const item of data){
        const customerId=String(item?.customer_id||'');
        const code=String(item?.product_code||'');
        if(!selected.includes(customerId)||!codes.includes(code))continue;
        const price=Number(item.price);
        if(Number.isFinite(price)&&price>0)map.set(key(customerId,code),String(price));
      }
      state.prices=map;
      for(const input of el('productBody').querySelectorAll('.special-price-input')){
        const value=map.get(key(input.dataset.customerId,input.dataset.productCode))||'';
        input.value=value;input.dataset.saved=value;
        input.disabled=!(Number(getItems().find(item=>item.product_code===input.dataset.productCode)?.cost)>0);
        if(input.disabled)input.title='Chưa có giá vốn hợp lệ; không thể đặt giá riêng.';
        input.parentElement.dataset.state='';
      }
      info('Giá riêng đã tải · để trống dùng giá bán chung; rời ô hoặc Enter để lưu.');
    }catch(error){
      if(!current(ctx))return;
      info('Không tải được giá riêng. Đã khóa ô để tránh ghi nhầm.',true);
    }
  }
  function parsePrice(value){
    const raw=String(value||'').trim().replace(/\s/g,'');
    if(!raw)return null;
    if(!/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(raw))throw new Error('Giá không hợp lệ');
    const number=Number(raw.replace(/\./g,'').replace(',','.'));
    if(!Number.isFinite(number)||number<=0||number>1000000000)throw new Error('Giá riêng phải lớn hơn 0');
    return number;
  }
  async function saveCell(input){
    if(!authorized()||input.disabled||!input.isConnected)return;
    const value=input.value.trim();
    if(value===input.dataset.saved)return;
    const customerId=input.dataset.customerId,code=input.dataset.productCode;
    const row=input.closest('tr');
    const item=getItems().find(entry=>entry.product_code===code);
    const cell=input.parentElement;
    const ctx=context();
    let number;
    try{
      number=parsePrice(value);
      if(number!==null&&(!(Number(item?.cost)>0)))throw new Error('Sản phẩm chưa có giá vốn hợp lệ');
    }catch(error){cell.dataset.state='error';info(String(error.message),true);return;}
    if(state.edits.has(key(customerId,code)))return;
    input.disabled=true;cell.dataset.state='saving';info('Đang lưu giá riêng…');
    const promise=rpc('taphoa_admin_customer_special_price_set',{
      p_customer_id:customerId,p_product_code:code,p_price:number
    });
    state.edits.set(key(customerId,code),promise);
    try{
      const data=await promise;
      if(!current(ctx)||!input.isConnected)return;
      if(data?.ok!==true||String(data.customer_id)!==customerId||String(data.product_code)!==code)
        throw new Error('save_response_mismatch');
      const saved=number===null?'':String(number);
      input.value=saved;input.dataset.saved=saved;
      state.prices.set(key(customerId,code),saved);
      cell.dataset.state='saved';info('Đã lưu giá riêng cho '+displayName(customerId));
    }catch(error){
      if(!current(ctx)||!input.isConnected)return;
      cell.dataset.state='error';
      info('Chưa lưu được giá riêng, nội dung vẫn ở ô nhập. Thử rời ô lần nữa.',true);
    }finally{
      if(state.edits.get(key(customerId,code))===promise)state.edits.delete(key(customerId,code));
      if(current(ctx)&&input.isConnected)input.disabled=false;
    }
  }
  function syncOrder(){
    const table=el('goodsPane')?.querySelector('.sheet-wrap table');
    if(!table)return;
    for(const row of table.querySelectorAll('thead tr,tbody tr')){
      let anchor=row.querySelector('[data-col="price"]');
      if(!anchor)continue;
      for(const id of state.selected){
        const cell=[...row.children].find(node=>node.dataset.specialPriceColumn===id);
        if(cell){anchor.after(cell);anchor=cell;}
      }
    }
  }
  function hasUnsaved(){
    if(state.edits.size>0)return true;
    const inputs=[...(el('productBody')?.querySelectorAll('.special-price-input')||[])];
    return inputs.some(input=>!input.disabled&&input.value.trim()!==String(input.dataset.saved||''));
  }
  async function flush(){
    const inputs=[...(el('productBody')?.querySelectorAll('.special-price-input')||[])];
    await Promise.all(inputs.filter(input=>!input.disabled).map(saveCell));
    await Promise.all([...state.edits.values()].map(promise=>promise.catch(()=>null)));
    return !hasUnsaved();
  }
  return Object.freeze({mount,render,reset,syncOrder,flush,hasUnsaved});
}
