'use strict';

(function(){
  let objectUrls=[];
  let previousBodyOverflow='';

  function isIos(){
    const ua=String(navigator.userAgent||'');
    return /iPad|iPhone|iPod/.test(ua)
      || (navigator.platform==='MacIntel' && Number(navigator.maxTouchPoints)>1);
  }

  function isStandalone(){
    return navigator.standalone===true
      || !!window.matchMedia?.('(display-mode: standalone)')?.matches;
  }

  function shouldUse(){
    return isIos() && isStandalone();
  }

  function revokeUrls(){
    objectUrls.forEach(url=>{ try{ URL.revokeObjectURL(url); }catch(_){} });
    objectUrls=[];
  }

  function ensureHost(){
    let host=document.getElementById('iosPwaSharePreview');
    if(host)return host;

    host=document.createElement('div');
    host.id='iosPwaSharePreview';
    host.className='hidden';
    host.setAttribute('role','dialog');
    host.setAttribute('aria-modal','true');
    host.innerHTML=`
      <div data-ios-share-shell style="position:fixed;inset:0;z-index:2147483000;background:#f8fafc;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);">
        <div style="height:56px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 14px;border-bottom:1px solid #e5e7eb;background:#fff;flex:none;">
          <div style="min-width:0;">
            <div data-ios-share-title style="font:800 16px/1.2 'Be Vietnam Pro',sans-serif;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Ảnh chia sẻ</div>
            <div data-ios-share-count style="margin-top:3px;font:600 10px/1.2 'Be Vietnam Pro',sans-serif;color:#9ca3af;"></div>
          </div>
          <button type="button" data-ios-share-close aria-label="Đóng" style="width:38px;height:38px;border:0;border-radius:999px;background:#f3f4f6;color:#374151;font-size:22px;line-height:38px;text-align:center;padding:0;">×</button>
        </div>
        <div data-ios-share-images style="flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:14px;background:#eef2f7;"></div>
        <div style="flex:none;background:#fff;border-top:1px solid #e5e7eb;padding:10px 14px calc(10px + env(safe-area-inset-bottom));">
          <div style="font:700 12px/1.35 'Be Vietnam Pro',sans-serif;color:#374151;text-align:center;">Nhấn giữ trực tiếp lên ảnh → Chia sẻ</div>
          <div style="font:500 10px/1.35 'Be Vietnam Pro',sans-serif;color:#9ca3af;text-align:center;margin-top:3px;">PWA iPhone dùng ảnh thật để tránh lỗi Share Sheet của WebKit.</div>
          <div style="display:flex;gap:8px;margin-top:10px;">
            <button type="button" data-ios-share-copy style="display:none;flex:1;height:42px;border:1px solid #d1d5db;border-radius:12px;background:#fff;color:#374151;font:700 12px 'Be Vietnam Pro',sans-serif;">Sao chép ảnh</button>
            <button type="button" data-ios-share-save style="flex:1;height:42px;border:0;border-radius:12px;background:#16a34a;color:#fff;font:800 12px 'Be Vietnam Pro',sans-serif;">Lưu ảnh</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(host);

    host.querySelector('[data-ios-share-close]')?.addEventListener('click',close);
    host.querySelector('[data-ios-share-copy]')?.addEventListener('click',copyFirst);
    host.querySelector('[data-ios-share-save]')?.addEventListener('click',saveFiles);
    return host;
  }

  function normalizeFiles(files){
    return Array.from(files||[]).filter(file=>file && /^image\//i.test(String(file.type||'')));
  }

  function open(files,options={}){
    const list=normalizeFiles(files);
    if(!list.length)return false;

    close();
    const host=ensureHost();
    const owner=host.querySelector('[data-ios-share-images]');
    const title=host.querySelector('[data-ios-share-title]');
    const count=host.querySelector('[data-ios-share-count]');
    const copyBtn=host.querySelector('[data-ios-share-copy]');

    revokeUrls();
    owner.innerHTML='';
    if(title)title.textContent=String(options.title||'Ảnh chia sẻ');
    if(count)count.textContent=list.length>1 ? `${list.length} ảnh · nhấn giữ ảnh cần gửi` : '1 ảnh · nhấn giữ để chia sẻ';

    list.forEach((file,index)=>{
      const url=URL.createObjectURL(file);
      objectUrls.push(url);
      const card=document.createElement('div');
      card.style.cssText='background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.08);margin:0 auto 12px;max-width:760px;';
      if(list.length>1){
        const label=document.createElement('div');
        label.textContent=`Ảnh ${index+1}/${list.length}`;
        label.style.cssText="padding:8px 10px;border-bottom:1px solid #f1f5f9;font:700 10px 'Be Vietnam Pro',sans-serif;color:#64748b;";
        card.appendChild(label);
      }
      const img=document.createElement('img');
      img.src=url;
      img.alt=`Ảnh chia sẻ ${index+1}`;
      img.draggable=false;
      img.style.cssText='display:block;width:100%;height:auto;max-height:none;background:#fff;-webkit-touch-callout:default;-webkit-user-select:auto;user-select:auto;';
      card.appendChild(img);
      owner.appendChild(card);
    });

    host.__shareFiles=list;
    if(copyBtn){
      const canCopy=typeof ClipboardItem!=='undefined' && !!navigator.clipboard?.write && list.length===1;
      copyBtn.style.display=canCopy?'block':'none';
    }

    previousBodyOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    host.classList.remove('hidden');
    host.style.display='block';
    return true;
  }

  function close(){
    const host=document.getElementById('iosPwaSharePreview');
    if(host){
      host.classList.add('hidden');
      host.style.display='none';
      host.__shareFiles=null;
    }
    document.body.style.overflow=previousBodyOverflow;
    revokeUrls();
  }

  async function copyFirst(){
    const host=document.getElementById('iosPwaSharePreview');
    const file=host?.__shareFiles?.[0];
    if(!file || typeof ClipboardItem==='undefined' || !navigator.clipboard?.write)return;
    try{
      await navigator.clipboard.write([new ClipboardItem({[file.type||'image/png']:file})]);
      if(typeof showToast==='function')showToast('Đã sao chép ảnh. Có thể dán vào Zalo.','success');
    }catch(error){
      if(typeof showToast==='function')showToast('Không sao chép được. Hãy nhấn giữ trực tiếp lên ảnh.','info');
    }
  }

  function saveFiles(){
    const host=document.getElementById('iosPwaSharePreview');
    const files=Array.from(host?.__shareFiles||[]);
    if(!files.length)return;
    files.forEach((file,index)=>{
      const url=URL.createObjectURL(file);
      const a=document.createElement('a');
      a.href=url;
      a.download=file.name||`anh_chia_se_${index+1}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),2000+index*100);
    });
  }

  window.TAPHOA_IOS_SHARE_FALLBACK=Object.freeze({
    isIos,
    isStandalone,
    shouldUse,
    open,
    close
  });
})();
