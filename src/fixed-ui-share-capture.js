'use strict';

(function(){
  const SCRIPT_URLS=[
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'
  ];
  let loaderPromise=null;

  function withTimeout(promise,ms,message){
    let timer=null;
    return Promise.race([
      promise,
      new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error(message)),ms);
      })
    ]).finally(()=>{if(timer)clearTimeout(timer);});
  }

  function loadScript(url,timeoutMs=4500){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      let settled=false;
      const finish=(error)=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        script.onload=null;
        script.onerror=null;
        if(error){
          script.remove();
          reject(error);
        }else{
          resolve(window.html2canvas);
        }
      };
      const timer=setTimeout(()=>finish(new Error('Tải thư viện tạo ảnh quá lâu.')),timeoutMs);
      script.async=true;
      script.src=url;
      script.crossOrigin='anonymous';
      script.onload=()=>window.html2canvas?finish():finish(new Error('Thư viện tạo ảnh không hợp lệ.'));
      script.onerror=()=>finish(new Error('Không tải được thư viện tạo ảnh.'));
      document.head.appendChild(script);
    });
  }

  async function ensureHtml2Canvas(){
    if(window.html2canvas)return window.html2canvas;
    if(loaderPromise)return loaderPromise;
    loaderPromise=new Promise((resolve,reject)=>{
      let pending=SCRIPT_URLS.length;
      let lastError=null;
      SCRIPT_URLS.forEach(url=>{
        loadScript(url).then(lib=>{
          if(lib)resolve(lib);
        }).catch(error=>{
          lastError=error;
          pending-=1;
          if(pending<=0)reject(lastError||new Error('Không tải được thư viện tạo ảnh.'));
        });
      });
    }).finally(()=>{
      if(!window.html2canvas)loaderPromise=null;
    });
    return loaderPromise;
  }

  async function captureElement(target,options={}){
    if(!target)throw new Error('Không có nội dung để tạo ảnh.');
    const renderer=await withTimeout(
      ensureHtml2Canvas(),
      Number(options.libraryTimeout)||5500,
      'Không tải được thư viện tạo ảnh. Vui lòng thử lại.'
    );
    const width=Math.max(1,Math.ceil(Number(options.width)||target.scrollWidth||target.getBoundingClientRect().width||1));
    const height=Math.max(1,Math.ceil(Number(options.height)||target.scrollHeight||target.getBoundingClientRect().height||1));
    // SPEC-PNG-ZOOM-QUALITY-20261110: older exports used 1.25–1.4x and
    // were globally capped at 1.5x (only 550–660px for a 440px document).
    // Render text at genuine higher pixel resolution, without stretching
    // low-res PNGs after capture. Bound the output for iOS/WebView/Chat.
    const requestedScale=Math.max(1,Math.min(2.5,Number(options.scale)||2.4));
    const scale=Math.min(
      requestedScale,
      8192/width,
      20000/height,
      Math.sqrt(16000000/(width*height))
    );
    if(!Number.isFinite(scale)||scale<1){
      throw new Error('Nội dung quá dài để xuất ảnh rõ nét. Hãy xem chi tiết trên ứng dụng.');
    }
    return withTimeout(
      renderer(target,{
        scale,
        useCORS:false,
        allowTaint:false,
        backgroundColor:options.backgroundColor||'#ffffff',
        width,
        height,
        windowWidth:width,
        windowHeight:height,
        scrollX:0,
        scrollY:0,
        imageTimeout:1500,
        logging:false,
        removeContainer:true
      }),
      Number(options.renderTimeout)||12000,
      'Tạo ảnh quá lâu. Vui lòng thử lại.'
    );
  }

  async function canvasToPngBlob(canvas,errorMessage='Không tạo được ảnh PNG.'){
    if(!canvas||!canvas.width||!canvas.height)throw new Error(errorMessage);
    try{
      return await withTimeout(
        new Promise((resolve,reject)=>{
          canvas.toBlob(blob=>blob?resolve(blob):reject(new Error(errorMessage)),'image/png');
        }),
        8000,
        errorMessage
      );
    }finally{
      try{
        canvas.width=1;
        canvas.height=1;
      }catch(_){}
    }
  }

  window.TAPHOA_SHARE_CAPTURE=Object.freeze({
    ensureHtml2Canvas,
    captureElement,
    canvasToPngBlob,
    withTimeout
  });
})();