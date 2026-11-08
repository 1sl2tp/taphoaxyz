/* UI-110 — ONE ORDER / ONE PORTRAIT DOCUMENT.
   Shared renderer for cart PNG, saved-order PNG and public-order image pages.
   Does not touch order data, app state, DB, timers, or network. */
(function(){
  'use strict';
  const WIDTH=440;
  const MIN_HEIGHT=620;
  const escapeHtml=value=>String(value??'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function createPage(options={}){
    const items=Array.isArray(options.items)?options.items:[];
    const fontFamily='"Be Vietnam Pro",Arial,sans-serif';
    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext?.('2d');
    const textWidth=(value,font)=>{
      const content=String(value??'');
      if(!ctx)return content.length*8;
      ctx.font=font;
      return ctx.measureText(content).width;
    };
    const formatValue=(item,key)=>String(item?.[key]??'');
    // Exact numeric labels are sized by their largest actual rendered value.
    // Product name is the ONLY flexible grid track.
    const unitMax=Math.max(0,...items.map(item=>
      textWidth(formatValue(item,'priceText'),`700 13px ${fontFamily}`)));
    const amountMax=Math.max(0,...items.map(item=>
      textWidth(formatValue(item,'totalText'),`800 13px ${fontFamily}`)));
    const qtyMax=Math.max(0,...items.map(item=>
      textWidth(formatValue(item,'qtyText'),`700 13px ${fontFamily}`)));
    // UI-112: the short price caption follows the largest unit PRICE,
    // not a fixed label width. Full semantics remain available via title.
    const priceLabels=['Đơn giá','Đ.giá','Giá','ĐG'];
    const priceCaption=items.length
      ? priceLabels.find(label=>textWidth(label.toLocaleUpperCase('vi-VN'),
          `800 10px ${fontFamily}`)<=unitMax)||'ĐG'
      : 'Đơn giá';
    const unitWidth=Math.ceil(Math.max(18,unitMax,
      textWidth(priceCaption.toLocaleUpperCase('vi-VN'),
        `800 10px ${fontFamily}`))+2);
    const qtyWidth=Math.ceil(Math.max(22,qtyMax,
      textWidth('SL',`800 10px ${fontFamily}`))+2);
    const labels=['Thành tiền','T.tiền','Tiền','TT'];
    const caption=labels.find(label=>textWidth(label.toLocaleUpperCase('vi-VN'),
      `800 10px ${fontFamily}`)<=amountMax)||'TT';
    const totalWidth=Math.ceil(Math.max(24,amountMax,
      textWidth(caption.toLocaleUpperCase('vi-VN'),`800 10px ${fontFamily}`))+2);
    const grid=`24px minmax(0,1fr) ${qtyWidth}px ${unitWidth}px ${totalWidth}px`;
    const gridStyle=`display:grid;grid-template-columns:${grid};column-gap:7px;align-items:baseline;box-sizing:border-box;width:100%;min-width:0;`;
    const rowsHtml=items.map((item,index)=>`
      <div style="${gridStyle}padding:11px 0;border-bottom:1px solid #eef2f7;min-height:45px;font-size:13px;line-height:1.4;">
        <div style="text-align:center;color:#94a3b8;font-weight:700;font-variant-numeric:tabular-nums;">${escapeHtml(item.index??index+1)}</div>
        <div style="min-width:0;overflow-wrap:anywhere;text-align:left;">
          <div style="color:#111827;font-weight:750;">${escapeHtml(item.name)}</div>
          ${item.note?'<div style="font-size:11px;line-height:1.35;margin-top:3px;color:#64748b;">'+escapeHtml(item.note)+'</div>':''}
        </div>
        <div style="text-align:center;white-space:nowrap;font-weight:750;font-variant-numeric:tabular-nums;">${escapeHtml(item.qtyText)}</div>
        <div style="text-align:right;white-space:nowrap;font-weight:650;font-variant-numeric:tabular-nums;">${escapeHtml(item.priceText)}</div>
        <div style="text-align:right;white-space:nowrap;font-weight:800;color:#111827;font-variant-numeric:tabular-nums;">${escapeHtml(item.totalText)}</div>
      </div>`).join('');
    const isDraft=!!options.isDraft;
    const isLast=options.isLastPage!==false;
    const orderId=String(options.orderId??'').trim();
    const title=isDraft?(orderId?'Đơn tạm: '+orderId:'Đơn đang tạo'):'Mã đơn: '+(orderId||'--');
    const pageIndex=Number(options.pageIndex)||0;
    const pageCount=Math.max(1,Number(options.pageCount)||1);
    const pageNumber=pageCount>1
      ?`<div style="font-size:10px;color:#94a3b8;font-weight:700;white-space:nowrap;">Trang ${pageIndex+1}/${pageCount}</div>`
      :'';
    const summary=isLast?`
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding:20px 22px 24px;border-top:1px solid #e5e7eb;background:white;">
        <div style="min-width:0;">
          <div style="font-size:11px;color:#94a3b8;font-weight:650;">Số lượng</div>
          <div style="margin-top:5px;font-size:14px;line-height:1.4;color:#111827;font-weight:800;">${escapeHtml(options.lineCount??items.length)} mã · ${escapeHtml(options.totalQty??0)} sản phẩm</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:11px;color:#94a3b8;font-weight:650;">Tổng thanh toán</div>
          <div style="margin-top:5px;font-size:24px;font-weight:800;color:#16a34a;font-variant-numeric:tabular-nums;">${escapeHtml(options.totalPriceText??'0')}</div>
        </div>
      </div>`:`
      <div style="padding:16px 22px 22px;text-align:right;font-size:11px;color:#94a3b8;font-weight:700;border-top:1px solid #e5e7eb;">Còn tiếp…</div>`;
    const host=document.createElement('div');
    host.setAttribute('aria-hidden','true');
    host.style.position='fixed';
    host.style.left='-100000px';
    host.style.top='0';
    host.style.width=WIDTH+'px';
    host.style.background='#fff';
    host.style.pointerEvents='none';
    host.style.zIndex='-1';
    const page=document.createElement('div');
    page.style.cssText=`box-sizing:border-box;width:${WIDTH}px;min-height:${MIN_HEIGHT}px;background:#fff;color:#1f2937;font-family:${fontFamily};display:flex;flex-direction:column;font-variant-numeric:tabular-nums;-webkit-text-size-adjust:100%;text-size-adjust:100%;`;
    page.innerHTML=`
      <div style="padding:24px 22px 18px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div style="font-size:12px;color:#94a3b8;font-weight:750;">${escapeHtml(title)}</div>
          ${pageNumber}
        </div>
        <div style="margin-top:10px;font-size:20px;line-height:1.3;font-weight:800;color:#111827;overflow-wrap:anywhere;">${escapeHtml(options.customer||'Khách hàng')}</div>
        <div style="margin-top:6px;font-size:12px;color:#64748b;">Thời gian: ${escapeHtml(options.time||'--')}</div>
      </div>
      <div style="padding:0 22px;flex:0 0 auto;">
        <div style="${gridStyle}height:40px;border-bottom:1px solid #e5e7eb;color:#94a3b8;font-size:10px;line-height:1.25;font-weight:800;text-transform:uppercase;align-items:center;">
          <div style="text-align:center;">STT</div><div>Tên</div>
          <div style="text-align:center;">SL</div>
          <div style="text-align:right;" title="Đơn giá" aria-label="Đơn giá">${escapeHtml(priceCaption)}</div>
          <div style="text-align:right;" title="Thành tiền">${escapeHtml(caption)}</div>
        </div>
        <div>${rowsHtml}</div>
      </div>
      <div style="flex:1 1 auto;min-height:20px;"></div>
      ${summary}`;
    host.appendChild(page);
    document.body.appendChild(host);
    return {host,page,capture:page,clone:page,width:WIDTH};
  }
  // BANK/ORDER-266: offline Canvas2D renderer for order notices. The old
  // html2canvas CDN can fail/timeout in Web, installed PWA, and APK WebView.
  // Render from the same immutable, server-confirmed order lines; never draw
  // an image of the editable cart or rely on an external script.
  function renderCanvas(options={},scale=1.2){
    const items=Array.isArray(options.items)?options.items:[];
    if(!items.length||items.length>130)throw Error('order_png_items_invalid');
    const ratio=Math.max(1,Math.min(1.5,Number(scale)||1.2));
    const paper=document.createElement('canvas');
    const paint=paper.getContext?.('2d');
    if(!paint)throw Error('order_canvas_unavailable');
    const family='"Be Vietnam Pro",Arial,sans-serif';
    const font=(size,weight=600)=>weight+' '+size+'px '+family;
    const width=WIDTH,margin=22,contentWidth=width-margin*2,gap=7;
    const measure=(value,style)=>{
      paint.font=style;
      return paint.measureText(String(value??'')).width;
    };
    const wrap=(value,maxWidth,style)=>{
      const source=String(value??'').trim().replace(/\s+/g,' ');
      if(!source)return [''];
      const words=source.split(' '), lines=[];
      let line='';
      const emit=word=>{
        let remainder=Array.from(word);
        while(remainder.length){
          let count=remainder.length;
          while(count>1&&measure(remainder.slice(0,count).join(''),style)>maxWidth)count--;
          const part=remainder.splice(0,count).join('');
          lines.push(part);
        }
      };
      for(const word of words){
        const combined=line?line+' '+word:word;
        if(measure(combined,style)<=maxWidth){line=combined;continue;}
        if(line){lines.push(line);line='';}
        if(measure(word,style)<=maxWidth){line=word;continue;}
        emit(word);
      }
      if(line)lines.push(line);
      return lines.length?lines:[''];
    };
    const numberStyle=font(12,700),nameStyle=font(12,700),noteStyle=font(10,500);
    const qtyWidth=Math.max(27,Math.ceil(Math.max(...items.map(x=>measure(x.qtyText,numberStyle))))+3);
    const priceWidth=Math.max(55,Math.ceil(Math.max(...items.map(x=>measure(x.priceText,numberStyle))))+3);
    const totalWidth=Math.max(57,Math.ceil(Math.max(...items.map(x=>measure(x.totalText,font(12,800)))))+3);
    const indexWidth=24;
    const nameWidth=contentWidth-indexWidth-qtyWidth-priceWidth-totalWidth-gap*4;
    if(nameWidth<64)throw Error('order_png_columns_overflow');
    const customerStyle=font(19,800);
    const customerLines=wrap(options.customer||'Khách hàng',contentWidth,customerStyle);
    const headerHeight=81+customerLines.length*25;
    const rows=items.map((item,index)=>{
      const names=wrap(item.name,nameWidth,nameStyle);
      const notes=String(item.note||'').trim()?wrap(item.note,nameWidth,noteStyle):[];
      const height=Math.max(44,18+names.length*17+notes.length*14);
      return {item,index,names,notes,height};
    });
    const tableTop=headerHeight+10,bodyTop=tableTop+40;
    const bodyHeight=rows.reduce((total,row)=>total+row.height,0);
    const footerTop=bodyTop+bodyHeight+18;
    const logicalHeight=Math.max(MIN_HEIGHT,footerTop+90);
    if(!Number.isSafeInteger(Math.ceil(logicalHeight*ratio))
      ||logicalHeight*ratio>19500)throw Error('order_png_height_limit');
    paper.width=Math.ceil(width*ratio);
    paper.height=Math.ceil(logicalHeight*ratio);
    const ctx=paper.getContext('2d');
    if(!ctx)throw Error('order_canvas_unavailable');
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.textBaseline='top';
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,logicalHeight);
    const line=(x1,y1,x2,y2,color='#e5e7eb')=>{
      ctx.fillStyle=color;ctx.fillRect(x1,y1,Math.max(1,x2-x1),Math.max(1,y2-y1));
    };
    const label=(value,x,y,style,color,align='left')=>{
      ctx.font=style;ctx.fillStyle=color;ctx.textAlign=align;
      ctx.fillText(String(value??''),x,y);
    };
    ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,width,headerHeight);
    const code=String(options.orderId||'').trim();
    label(options.isDraft?(code?'Đơn tạm: '+code:'Đơn đang tạo'):'Mã đơn: '+(code||'--'),
      margin,23,font(12,750),'#64748b');
    customerLines.forEach((part,i)=>label(part,margin,47+i*25,customerStyle,'#111827'));
    label('Thời gian: '+String(options.time||'--'),margin,51+customerLines.length*25,
      font(11,600),'#64748b');
    const xIndex=margin,xName=xIndex+indexWidth+gap;
    const xQty=xName+nameWidth+gap+qtyWidth;
    const xPrice=xQty+gap+priceWidth;
    const xTotal=xPrice+gap+totalWidth;
    const captionY=tableTop+11;
    label('STT',xIndex,captionY,font(10,800),'#64748b');
    label('TÊN',xName,captionY,font(10,800),'#64748b');
    label('SL',xQty,captionY,font(10,800),'#64748b','right');
    label('ĐG',xPrice,captionY,font(10,800),'#64748b','right');
    label('TIỀN',xTotal,captionY,font(10,800),'#64748b','right');
    line(margin,tableTop+35,width-margin,tableTop+36);
    let y=bodyTop;
    for(const row of rows){
      const item=row.item;
      label(item.index??row.index+1,xIndex+2,y+11,font(11,700),'#64748b');
      row.names.forEach((part,i)=>label(part,xName,y+9+i*17,nameStyle,'#111827'));
      row.notes.forEach((part,i)=>label(part,xName,y+9+row.names.length*17+i*14,
        noteStyle,'#64748b'));
      label(item.qtyText,xQty,y+11,numberStyle,'#111827','right');
      label(item.priceText,xPrice,y+11,numberStyle,'#111827','right');
      label(item.totalText,xTotal,y+11,font(12,800),'#111827','right');
      y+=row.height;line(margin,y-1,width-margin,y,'#eef2f7');
    }
    line(0,footerTop,width,footerTop+1);
    label('Số lượng',margin,footerTop+17,font(10,600),'#64748b');
    label(String(options.lineCount??items.length)+' mã · '+String(options.totalQty??0)+' sản phẩm',
      margin,footerTop+35,font(12,800),'#111827');
    label('Tổng thanh toán',width-margin,footerTop+17,font(10,600),'#64748b','right');
    const total=String(options.totalPriceText??'0');
    const totalStyle=font(measure(total,font(21,800))>contentWidth/2?16:21,800);
    label(total,width-margin,footerTop+33,totalStyle,'#16a34a','right');
    return paper;
  }

  window.TAPHOA_ORDER_PORTRAIT=Object.freeze({WIDTH,MIN_HEIGHT,createPage,renderCanvas});
})();
