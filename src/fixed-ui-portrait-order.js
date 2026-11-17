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
  // MILK-X-371: suffix X identifies a high-price milk item. Only its last
  // letter and its quantity are red; original name, numbers and totals stay intact.
  const milkXInfo=item=>{
    const original=String(item?.name??'').trim();
    const normalized=original.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const group=String(item?.group||item?.category||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(!/\s+x$/i.test(original)||
      !(/\bsua\b|\bprobi\b|\bvinamilk\b/.test(normalized)||/\bsua\b|\bmilk\b/.test(group)))
      return null;
    return {name:original.slice(0,-1),marker:original.slice(-1)};
  };
  const milkXNameHtml=item=>{
    const x=milkXInfo(item);
    return x?escapeHtml(x.name)+'<span style="color:#dc2626;">'+escapeHtml(x.marker)+'</span>'
      :escapeHtml(item?.name);
  };
  // UI-PORTRAIT-021: One consistent header identity in captured HTML and Canvas PNG.
  // Keep the full date and clock, but use compact separate labels rather
  // than putting two long phrases above the customer's name.
  const HEADER_META_WIDTH=154;
  const HEADER_GAP=14;
  const HEADER_NAME_WIDTH=WIDTH-44-HEADER_META_WIDTH-HEADER_GAP;
  const headerPalette=isDraft=>isDraft
    ?{background:'#fff3e2',accent:'#d28b44',code:'#925b20'}
    :{background:'#e8f5eb',accent:'#2c9658',code:'#194f38'};
  function splitReceiptTimestamp(value){
    const raw=String(value??'').trim()||'--';
    const date=raw.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
    const clock=raw.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
    if(date&&clock)return {clock:clock[0],date:date[0]};
    return {clock:raw,date:''};
  }
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
          <div style="color:#142238;font-size:17px;line-height:1.4;font-weight:800;">${milkXNameHtml(item)}</div>
          ${item.note?'<div style="font-size:13px;line-height:1.4;margin-top:5px;color:#586b82;">'+escapeHtml(item.note)+'</div>':''}
        </div>
        <div style="text-align:center;white-space:nowrap;font-weight:750;color:${milkXInfo(item)?'#dc2626':'#142238'};font-variant-numeric:tabular-nums;">${escapeHtml(item.qtyText)}</div>
        <div style="text-align:right;white-space:nowrap;font-weight:750;color:#142238;font-variant-numeric:tabular-nums;">${escapeHtml(item.priceText)}</div>
        <div style="text-align:right;white-space:nowrap;font-weight:800;color:#142238;font-variant-numeric:tabular-nums;">${escapeHtml(item.totalText)}</div>
      </div>`).join('');
    const isDraft=!!options.isDraft;
    const isLast=options.isLastPage!==false;
    const orderId=String(options.orderId??'').trim();
    const bannerTitle=isDraft?'ĐƠN HÀNG TẠM':'HÓA ĐƠN BÁN HÀNG';
    const pageIndex=Number(options.pageIndex)||0;
    const pageCount=Math.max(1,Number(options.pageCount)||1);
    // UI-PORTRAIT-021: customer on the left; code and full timestamp
    // in a separate right-hand card. All pages follow the same layout.
    const palette=headerPalette(isDraft);
    const stamp=splitReceiptTimestamp(options.time);
    const metaLabel=isDraft?'ĐƠN TẠM':'MÃ ĐƠN';
    const pageMarker=pageCount>1?`Trang ${pageIndex+1}/${pageCount}`:'';
    const metaCode=orderId||'--';
    // ORDER-UI-383: one premium receipt layout for generated HTML and Canvas.
    // Header, customer, immutable order metadata, five columns, and summary.
    // No financial rounding or line-item transformations occur here.
    const totalValue=String(options.totalPriceText??'0');
    const summarySize=totalValue.length>14?19:totalValue.length>10?22:27;
    const summary=isLast?`
      <div style="margin:12px 16px 15px;padding:15px 16px;border-radius:16px;background:#eef7f0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:center;box-sizing:border-box;">
        <div style="min-width:0;padding-right:9px;border-right:1px solid #cbdcd1;">
          <div style="font-size:12px;color:#576878;font-weight:750;">Số lượng</div>
          <div style="margin-top:7px;font-size:15px;line-height:1.4;color:#142238;font-weight:800;overflow-wrap:break-word;">${escapeHtml(options.lineCount??items.length)} mã · ${escapeHtml(options.totalQty??0)} sản phẩm</div>
        </div>
        <div style="min-width:0;text-align:right;">
          <div style="font-size:12px;line-height:1.3;color:#576878;font-weight:750;">Tổng thanh toán</div>
          <div style="display:inline-block;max-width:100%;box-sizing:border-box;margin-top:7px;padding:7px 12px;border-radius:22px;background:#268b4b;color:#fff;font-size:${summarySize}px;line-height:1.2;font-weight:800;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;">${escapeHtml(totalValue)}</div>
        </div>
      </div>`:`
      <div style="margin:12px 16px 15px;padding:15px 16px;text-align:right;border-radius:14px;background:#f1f5f9;color:#64748b;font-size:13px;font-weight:750;">Còn tiếp…</div>`;
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
    page.style.cssText=`box-sizing:border-box;width:${WIDTH}px;min-height:${MIN_HEIGHT}px;background:#fff;color:#142238;font-family:${fontFamily};display:flex;flex-direction:column;font-variant-numeric:tabular-nums;-webkit-text-size-adjust:100%;text-size-adjust:100%;border-radius:18px;overflow:hidden;`;
    page.innerHTML=`
      <div style="box-sizing:border-box;min-height:56px;padding:0 22px;display:flex;align-items:center;gap:11px;background:#173c59;color:#fff;">
        <svg width="23" height="25" viewBox="0 0 24 26" fill="none" aria-hidden="true" style="flex-shrink:0;"><path d="M4 2h16v21l-4-2.5-4 2.5-4-2.5L4 23V2Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9h8M8 13h8" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>
        <span style="height:22px;width:1px;background:#7c9daf;"></span>
        <div style="font-size:15px;font-weight:800;letter-spacing:.045em;line-height:1.3;">${bannerTitle}</div>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) ${HEADER_META_WIDTH}px;gap:${HEADER_GAP}px;padding:13px 22px 14px;align-items:stretch;box-sizing:border-box;">
        <div style="min-width:0;padding:15px 13px;background:#f1f5fa;border-radius:15px;border:1px solid #e7edf3;box-sizing:border-box;">
          <div style="font-size:11px;letter-spacing:.055em;color:#64748b;font-weight:800;">KHÁCH HÀNG</div>
          <div style="margin-top:10px;font-size:21px;line-height:1.3;letter-spacing:-.02em;font-weight:800;color:#142238;overflow-wrap:break-word;">${escapeHtml(options.customer||'Khách hàng')}</div>
        </div>
        <div style="min-width:0;padding:13px 12px;background:${palette.background};border-radius:15px;border:1px solid #d9e9dd;box-sizing:border-box;text-align:right;">
          <div style="font-size:10.5px;letter-spacing:.04em;color:#64748b;font-weight:800;">${metaLabel}</div>
          <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:800;color:${palette.code};overflow-wrap:anywhere;">${escapeHtml(metaCode)}</div>
          <div style="margin-top:9px;font-size:11.5px;line-height:1.4;color:#415c75;font-weight:700;overflow-wrap:anywhere;">${escapeHtml([stamp.date,stamp.clock].filter(Boolean).join(' · '))}</div>
          ${pageMarker?`<div style="margin-top:5px;font-size:11px;color:#64748b;font-weight:700;">${escapeHtml(pageMarker)}</div>`:''}
        </div>
      </div>
      <div style="padding:0 22px;flex:0 0 auto;box-sizing:border-box;">
        <div style="${gridStyle}height:44px;padding:0 8px;border-radius:10px;background:#f1f4f8;color:#53677d;font-size:11px;line-height:1.3;font-weight:800;text-transform:uppercase;align-items:center;">
          <div style="text-align:center;">STT</div><div>Tên</div>
          <div style="text-align:center;">SL</div>
          <div style="text-align:right;" title="Đơn giá" aria-label="Đơn giá">${escapeHtml(priceCaption)}</div>
          <div style="text-align:right;" title="Thành tiền">${escapeHtml(caption)}</div>
        </div>
        <div>${rowsHtml}</div>
      </div>
      <div style="flex:1 1 auto;min-height:0;"></div>
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
    const isDraft=!!options.isDraft;
    const palette=headerPalette(isDraft);
    const customerStyle=font(22,800);
    const customerLines=wrap(options.customer||'Khách hàng',
      HEADER_NAME_WIDTH,customerStyle);
    const code=String(options.orderId||'').trim()||'--';
    const pages=Math.max(1,Number(options.pageCount)||1);
    const pageNo=Number(options.pageIndex)||0;
    const stamp=splitReceiptTimestamp(options.time);
    const metaLabel=isDraft?'ĐƠN TẠM':'MÃ ĐƠN';
    const metaWidth=HEADER_META_WIDTH-24;
    const codeStyle=font(18,800),timeStyle=font(12,750);
    const dateStyle=font(12,650),pageStyle=font(11,700);
    const codeLines=wrap(code,metaWidth,codeStyle);
    const timeLines=wrap(stamp.clock,metaWidth,timeStyle);
    const dateLines=stamp.date?wrap(stamp.date,metaWidth,dateStyle):[];
    const pageLines=pages>1
      ?wrap('Trang '+(pageNo+1)+'/'+pages,metaWidth,pageStyle):[];
    const codeY=35;
    const clockY=codeY+codeLines.length*22+3;
    const dateY=clockY+timeLines.length*17;
    const pageY=dateY+dateLines.length*17;
    const cardBottom=pageY+pageLines.length*17+12;
    const headerHeight=Math.max(116,cardBottom+10,
      42+customerLines.length*28+16);
    const rows=items.map((item,index)=>{
      const names=wrap(item.name,columns.name,nameStyle);
      const notes=String(item.note||'').trim()?wrap(item.note,columns.name,noteStyle):[];
      const height=Math.max(68,26+names.length*24+notes.length*19);
      return {item,index,names,notes,height,milkX:!!milkXInfo(item)};
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
    // UI-PORTRAIT-021: two fixed horizontal zones, same content as HTML.
    // No overlay for a long customer name or unusually long order code.
    ctx.fillStyle=palette.background;ctx.fillRect(0,0,width,headerHeight);
    ctx.fillStyle=palette.accent;ctx.fillRect(0,0,4,headerHeight);
    const cardX=width-margin-HEADER_META_WIDTH;
    ctx.fillStyle='#ffffff';
    ctx.fillRect(cardX,10,HEADER_META_WIDTH,headerHeight-20);
    label('KHÁCH HÀNG',margin,18,font(11,800),'#607890');
    customerLines.forEach((part,i)=>
      label(part,margin,42+i*28,customerStyle,'#142238'));
    const metaRight=width-margin-12;
    label(metaLabel,metaRight,19,font(11,800),'#718397','right');
    codeLines.forEach((part,i)=>
      label(part,metaRight,codeY+i*22,codeStyle,palette.code,'right'));
    timeLines.forEach((part,i)=>
      label(part,metaRight,clockY+i*17,timeStyle,'#415c75','right'));
    dateLines.forEach((part,i)=>
      label(part,metaRight,dateY+i*17,dateStyle,'#60758a','right'));
    pageLines.forEach((part,i)=>
      label(part,metaRight,pageY+i*17,pageStyle,'#60758a','right'));
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
      row.names.forEach((part,i)=>{
        const last=row.milkX&&i===row.names.length-1;
        const match=last?part.match(/^(.*?)(x)$/i):null;
        if(!match){
          label(part,xName,y+13+i*24,nameStyle,'#142238');
          return;
        }
        // A wrapped trailing X may be on a separate line; draw it red at
        // its exact original position without changing line width or wrapping.
        const prefix=match[1];
        if(prefix)label(prefix,xName,y+13+i*24,nameStyle,'#142238');
        label(match[2],xName+measure(prefix,nameStyle),y+13+i*24,
          nameStyle,'#dc2626');
      });
      row.notes.forEach((part,i)=>
        label(part,xName,y+13+row.names.length*24+i*19,noteStyle,'#586b82'));
      label(item.qtyText,xQty,y+16,numberStyle,
        row.milkX?'#dc2626':'#142238','right');
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
