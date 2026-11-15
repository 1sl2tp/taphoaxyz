/* UI-110 — ONE ORDER / ONE PORTRAIT DOCUMENT.
   Shared renderer for cart PNG, saved-order PNG and public-order image pages.
   Does not touch order data, app state, DB, timers, or network. */
(function(){
  'use strict';
  const WIDTH=440;
  const MIN_HEIGHT=380;
  const escapeHtml=value=>String(value??'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function createPage(options={}){
    const items=Array.isArray(options.items)?options.items:[];
    const fontFamily='"Be Vietnam Pro",-apple-system,BlinkMacSystemFont,Arial,sans-serif';
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
    // UI-PORTRAIT-019: measure the ACTUAL larger glyphs, not 13px old rows.
    // Reduce numeric size only when an unusually long amount would leave
    // the product-name track too narrow. Never clip or round money to fit.
    const contentWidth=WIDTH-44,trackGap=8,indexWidth=26;
    const widthsFor=size=>{
      const numeric=`750 ${size}px ${fontFamily}`;
      const totalFont=`800 ${size}px ${fontFamily}`;
      const qty=Math.ceil(Math.max(28,...items.map(i=>
        textWidth(formatValue(i,'qtyText'),numeric)))+5);
      const unit=Math.ceil(Math.max(38,...items.map(i=>
        textWidth(formatValue(i,'priceText'),numeric)))+5);
      const amount=Math.ceil(Math.max(53,...items.map(i=>
        textWidth(formatValue(i,'totalText'),totalFont)))+5);
      return {qty,unit,amount,name:contentWidth-indexWidth-4*trackGap-qty-unit-amount};
    };
    let numericSize=16,metrics=widthsFor(numericSize);
    while(numericSize>12&&metrics.name<115){
      numericSize--;
      metrics=widthsFor(numericSize);
    }
    const unitMax=metrics.unit,amountMax=metrics.amount,qtyMax=metrics.qty;
    // UI-112: the short price caption follows the largest unit PRICE,
    // not a fixed label width. Full semantics remain available via title.
    const priceLabels=['Đơn giá','Đ.giá','Giá','ĐG'];
    const priceCaption=items.length
      ? priceLabels.find(label=>textWidth(label.toLocaleUpperCase('vi-VN'),
          `800 11px ${fontFamily}`)<=unitMax)||'ĐG'
      : 'Đơn giá';
    const unitWidth=Math.ceil(Math.max(38,unitMax,
      textWidth(priceCaption.toLocaleUpperCase('vi-VN'),
        `800 11px ${fontFamily}`))+3);
    const qtyWidth=Math.ceil(Math.max(30,qtyMax,
      textWidth('SL',`800 11px ${fontFamily}`))+3);
    const labels=['Thành tiền','T.tiền','Tiền','TT'];
    const caption=labels.find(label=>textWidth(label.toLocaleUpperCase('vi-VN'),
      `800 11px ${fontFamily}`)<=amountMax)||'TT';
    const totalWidth=Math.ceil(Math.max(53,amountMax,
      textWidth(caption.toLocaleUpperCase('vi-VN'),`800 11px ${fontFamily}`))+3);
    const grid=`${indexWidth}px minmax(0,1fr) ${qtyWidth}px ${unitWidth}px ${totalWidth}px`;
    const gridStyle=`display:grid;grid-template-columns:${grid};column-gap:${trackGap}px;align-items:baseline;box-sizing:border-box;width:100%;min-width:0;`;
    const rowsHtml=items.map((item,index)=>`
      <div style="${gridStyle}padding:15px 0;border-bottom:1px solid #e3eaf1;min-height:64px;font-size:${numericSize}px;line-height:1.45;">
        <div style="text-align:center;color:#64748b;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums;">${escapeHtml(item.index??index+1)}</div>
        <div style="min-width:0;overflow-wrap:break-word;text-align:left;">
          <div style="color:#142238;font-size:17px;line-height:1.4;font-weight:800;">${escapeHtml(item.name)}</div>
          ${item.note?'<div style="font-size:13px;line-height:1.4;margin-top:5px;color:#586b82;">'+escapeHtml(item.note)+'</div>':''}
        </div>
        <div style="text-align:center;white-space:nowrap;font-weight:750;color:#142238;font-variant-numeric:tabular-nums;">${escapeHtml(item.qtyText)}</div>
        <div style="text-align:right;white-space:nowrap;font-weight:750;color:#142238;font-variant-numeric:tabular-nums;">${escapeHtml(item.priceText)}</div>
        <div style="text-align:right;white-space:nowrap;font-weight:800;color:#142238;font-variant-numeric:tabular-nums;">${escapeHtml(item.totalText)}</div>
      </div>`).join('');
    const isDraft=!!options.isDraft;
    const isLast=options.isLastPage!==false;
    const orderId=String(options.orderId??'').trim();
    const title=isDraft?(orderId?'Đơn tạm: '+orderId:'Đơn đang tạo'):'Mã đơn: '+(orderId||'--');
    const pageIndex=Number(options.pageIndex)||0;
    const pageCount=Math.max(1,Number(options.pageCount)||1);
    // UI-PORTRAIT-020: code + complete timestamp share the first line;
    // customer is the second line. Only long metadata wraps by necessity.
    const metaTitle=title+(pageCount>1?` · Trang ${pageIndex+1}/${pageCount}`:'');
    const metaTime=String(options.time||'--');
    const metaStacked=textWidth(metaTitle,`800 14px ${fontFamily}`)
      +textWidth(metaTime,`700 13px ${fontFamily}`)+12>contentWidth;
    const summary=isLast?`
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding:18px 22px 21px;border-top:1px solid #dfe7ef;background:#f7fbf8;">
        <div style="min-width:0;">
          <div style="font-size:12px;color:#64748b;font-weight:700;">Số lượng</div>
          <div style="margin-top:6px;font-size:15px;line-height:1.4;color:#142238;font-weight:800;">${escapeHtml(options.lineCount??items.length)} mã · ${escapeHtml(options.totalQty??0)} sản phẩm</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-size:12px;color:#64748b;font-weight:700;">Tổng thanh toán</div>
          <div style="margin-top:6px;font-size:28px;line-height:1.2;font-weight:800;color:#13853a;font-variant-numeric:tabular-nums;">${escapeHtml(options.totalPriceText??'0')}</div>
        </div>
      </div>`:`
      <div style="padding:18px 22px 21px;text-align:right;font-size:13px;color:#64748b;font-weight:750;border-top:1px solid #dfe7ef;">Còn tiếp…</div>`;
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
      <div style="padding:18px 22px 17px;background:#f5f9fc;border-bottom:1px solid #dfe7ef;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:0 12px;flex-wrap:${metaStacked?'wrap':'nowrap'};line-height:20px;">
          <div style="min-width:0;flex:${metaStacked?'1 1 100%':'0 1 auto'};font-size:14px;color:#53677d;font-weight:800;overflow-wrap:break-word;">${escapeHtml(metaTitle)}</div>
          <div style="min-width:0;flex:${metaStacked?'1 1 100%':'0 0 auto'};font-size:13px;color:#586b82;font-weight:700;text-align:right;white-space:nowrap;">${escapeHtml(metaTime)}</div>
        </div>
        <div style="margin-top:9px;font-size:24px;line-height:1.28;font-weight:800;color:#142238;overflow-wrap:break-word;">${escapeHtml(options.customer||'Khách hàng')}</div>
      </div>
      <div style="padding:0 22px;flex:0 0 auto;">
        <div style="${gridStyle}height:46px;border-bottom:1px solid #dfe7ef;color:#53677d;font-size:11px;line-height:1.3;font-weight:800;text-transform:uppercase;align-items:center;">
          <div style="text-align:center;">STT</div><div>Tên</div>
          <div style="text-align:center;">SL</div>
          <div style="text-align:right;" title="Đơn giá" aria-label="Đơn giá">${escapeHtml(priceCaption)}</div>
          <div style="text-align:right;" title="Thành tiền">${escapeHtml(caption)}</div>
        </div>
        <div>${rowsHtml}</div>
      </div>
      <div style="flex:1 1 auto;min-height:8px;"></div>
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
    const family='"Be Vietnam Pro",-apple-system,BlinkMacSystemFont,Arial,sans-serif';
    const font=(size,weight=600)=>weight+' '+size+'px '+family;
    const width=WIDTH,margin=22,contentWidth=width-margin*2,gap=8;
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
        const remainder=Array.from(word);
        while(remainder.length){
          let count=remainder.length;
          while(count>1&&measure(remainder.slice(0,count).join(''),style)>maxWidth)count--;
          lines.push(remainder.splice(0,count).join(''));
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
    // UI-PORTRAIT-019 — Five aligned columns. Size the money tracks against
    // actual rendered digits, NEVER use fixed widths or truncate money.
    const indexWidth=26;
    const columnMetrics=size=>{
      const numeric=font(size,750);
      const total=font(size,800);
      const qty=Math.max(33,Math.ceil(Math.max(...items.map(i=>
        measure(i.qtyText,numeric))))+5);
      const price=Math.max(45,Math.ceil(Math.max(...items.map(i=>
        measure(i.priceText,numeric))))+5);
      const amount=Math.max(58,Math.ceil(Math.max(...items.map(i=>
        measure(i.totalText,total))))+5);
      const name=contentWidth-indexWidth-qty-price-amount-gap*4;
      return {qty,price,amount,name};
    };
    let numberSize=16,columns=columnMetrics(numberSize);
    while(numberSize>12&&columns.name<112){
      numberSize--;
      columns=columnMetrics(numberSize);
    }
    if(columns.name<72)throw Error('order_png_columns_overflow');
    const numberStyle=font(numberSize,750);
    const totalNumberStyle=font(numberSize,800);
    const nameStyle=font(columns.name<124?15:17,800);
    const noteStyle=font(13,550);
    const customerStyle=font(24,800);
    const customerLines=wrap(options.customer||'Khách hàng',contentWidth,customerStyle);
    const code=String(options.orderId||'').trim();
    const pages=Math.max(1,Number(options.pageCount)||1);
    const pageNo=Number(options.pageIndex)||0;
    const metaTitle=(options.isDraft?(code?'Đơn tạm: '+code:'Đơn đang tạo')
      :'Mã đơn: '+(code||'--'))
      +(pages>1?' · Trang '+(pageNo+1)+'/'+pages:'');
    const metaTime=String(options.time||'--');
    const codeStyle=font(14,800),timeStyle=font(13,700);
    const metaCodeLines=wrap(metaTitle,contentWidth,codeStyle);
    const inlineTime=metaCodeLines.length===1
      &&measure(metaTitle,codeStyle)+measure(metaTime,timeStyle)+12<=contentWidth;
    const timeLines=inlineTime?[]:wrap(metaTime,contentWidth,timeStyle);
    const metaRows=metaCodeLines.length+timeLines.length;
    const nameTop=18+metaRows*20+9;
    const headerHeight=nameTop+customerLines.length*31+16;
    const rows=items.map((item,index)=>{
      const names=wrap(item.name,columns.name,nameStyle);
      const notes=String(item.note||'').trim()?wrap(item.note,columns.name,noteStyle):[];
      const height=Math.max(68,26+names.length*24+notes.length*19);
      return {item,index,names,notes,height};
    });
    const tableTop=headerHeight+8,bodyTop=tableTop+48;
    const bodyHeight=rows.reduce((total,row)=>total+row.height,0);
    const footerTop=bodyTop+bodyHeight+14;
    const logicalHeight=Math.max(MIN_HEIGHT,footerTop+104);
    if(!Number.isSafeInteger(Math.ceil(logicalHeight*ratio))
      ||logicalHeight*ratio>19500)throw Error('order_png_height_limit');
    paper.width=Math.ceil(width*ratio);
    paper.height=Math.ceil(logicalHeight*ratio);
    const ctx=paper.getContext('2d');
    if(!ctx)throw Error('order_canvas_unavailable');
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.textBaseline='top';
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,logicalHeight);
    const line=(x1,y1,x2,y2,color='#dfe7ef')=>{
      ctx.fillStyle=color;
      ctx.fillRect(x1,y1,Math.max(1,x2-x1),Math.max(1,y2-y1));
    };
    const label=(value,x,y,style,color,align='left')=>{
      ctx.font=style;ctx.fillStyle=color;ctx.textAlign=align;
      ctx.fillText(String(value??''),x,y);
    };
    // Compact two-line header. Preserve the full timestamp but don't
    // repeat its label; long codes/time add a row instead of overlapping.
    ctx.fillStyle='#f5f9fc';ctx.fillRect(0,0,width,headerHeight);
    metaCodeLines.forEach((part,i)=>
      label(part,margin,18+i*20,codeStyle,'#53677d'));
    if(inlineTime){
      label(metaTime,width-margin,18,timeStyle,'#586b82','right');
    }else{
      timeLines.forEach((part,i)=>
        label(part,width-margin,18+(metaCodeLines.length+i)*20,
          timeStyle,'#586b82','right'));
    }
    customerLines.forEach((part,i)=>
      label(part,margin,nameTop+i*31,customerStyle,'#142238'));
    const xIndex=margin+indexWidth/2;
    const xName=margin+indexWidth+gap;
    const xQty=xName+columns.name+gap+columns.qty;
    const xPrice=xQty+gap+columns.price;
    const xTotal=xPrice+gap+columns.amount;
    const captionY=tableTop+15;
    label('STT',xIndex,captionY,font(11,800),'#53677d','center');
    label('TÊN',xName,captionY,font(12,800),'#53677d');
    label('SL',xQty,captionY,font(12,800),'#53677d','right');
    label('ĐG',xPrice,captionY,font(12,800),'#53677d','right');
    label('TIỀN',xTotal,captionY,font(12,800),'#53677d','right');
    line(margin,tableTop+43,width-margin,tableTop+44);
    let y=bodyTop;
    for(const row of rows){
      const item=row.item;
      label(item.index??row.index+1,xIndex,y+16,font(13,700),'#64748b','center');
      row.names.forEach((part,i)=>
        label(part,xName,y+13+i*24,nameStyle,'#142238'));
      row.notes.forEach((part,i)=>
        label(part,xName,y+13+row.names.length*24+i*19,noteStyle,'#586b82'));
      label(item.qtyText,xQty,y+16,numberStyle,'#142238','right');
      label(item.priceText,xPrice,y+16,numberStyle,'#142238','right');
      label(item.totalText,xTotal,y+16,totalNumberStyle,'#142238','right');
      y+=row.height;
      line(margin,y-1,width-margin,y,'#e3eaf1');
    }
    line(0,footerTop,width,footerTop+1);
    ctx.fillStyle='#f7fbf8';
    ctx.fillRect(0,footerTop+1,width,logicalHeight-footerTop-1);
    label('Số lượng',margin,footerTop+18,font(12,700),'#64748b');
    label(String(options.lineCount??items.length)+' mã · '+String(options.totalQty??0)+' sản phẩm',
      margin,footerTop+42,font(15,800),'#142238');
    label('Tổng thanh toán',width-margin,footerTop+18,
      font(12,700),'#64748b','right');
    const total=String(options.totalPriceText??'0');
    let totalSize=28;
    while(totalSize>18&&measure(total,font(totalSize,800))>contentWidth*0.48)
      totalSize--;
    label(total,width-margin,footerTop+39,font(totalSize,800),'#13853a','right');
    return paper;
  }

  window.TAPHOA_ORDER_PORTRAIT=Object.freeze({WIDTH,MIN_HEIGHT,createPage,renderCanvas});
})();
