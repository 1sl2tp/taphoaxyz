/* Product editor persistence: Web -> Supabase immediately.
 * Sheet acknowledgement is handled asynchronously by taphoa-sheet-sync.
 */
(function(){
  'use strict';

  const saveChains=new Map();
  const lastSaved=new Map();

  function editorRow(index){
    if(!Number.isInteger(index)||!Array.isArray(productEditorRows?.[index]))return null;
    return productEditorRows[index];
  }

  function rowPayload(index){
    const row=editorRow(index);if(!row)return null;
    const productCode=String(row[0]||'').trim();
    const name=String(row[1]||'').trim();
    if(!productCode||!name)return null;
    return {
      product_code:productCode,
      name,
      cost:String(row[2]??'').replace(/\./g,'').trim(),
      price:String(row[3]??'').replace(/\./g,'').trim()
    };
  }

  function payloadKey(payload){
    return JSON.stringify([payload.product_code,payload.name,payload.cost,payload.price]);
  }

  async function saveProductEditorRow(index){
    const payload=rowPayload(index);if(!payload)return null;
    // add-row persistence is wired separately; never send a local placeholder as an update.
    if(/^SP\d+$/i.test(payload.product_code))return null;

    const key=payload.product_code.toUpperCase();
    const fingerprint=payloadKey(payload);
    if(lastSaved.get(key)===fingerprint)return null;

    const previous=saveChains.get(key)||Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      const api=window.TAPHOA_PRODUCTION;
      if(!api?.updateProduct)throw new Error('Production product API chưa sẵn sàng');
      const result=await window.TAPHOA_PRODUCTION.updateProduct(payload);
      lastSaved.set(key,fingerprint);
      return result;
    });

    saveChains.set(key,task);
    try{
      return await task;
    }catch(error){
      lastSaved.delete(key);
      console.error('save product editor row',error);
      if(typeof showToast==='function')showToast('Không lưu được sản phẩm.','warning');
      throw error;
    }finally{
      if(saveChains.get(key)===task)saveChains.delete(key);
    }
  }

  window.saveProductEditorRow=saveProductEditorRow;

  // Mobile keyboard “Xong” and desktop Tab/click-out both produce focusout.
  document.addEventListener('focusout',function(event){
    const input=event.target?.closest?.('#productEditorList [data-editor-field]');
    if(!input)return;
    const owner=input.closest('[data-editor-row]');
    const index=Number(owner?.dataset?.editorRow);
    if(!Number.isInteger(index))return;
    saveProductEditorRow(index).catch(()=>{});
  },true);
})();
