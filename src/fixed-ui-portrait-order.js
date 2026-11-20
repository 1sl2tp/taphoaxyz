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
  // ORDER-UI-384: a single restrained visual scale for HTML and Canvas PNG.
  // All content uses a 22px outer axis; only the navy title bleeds to edges.
  // ORDER-UI-387: the paper and Canvas share one grid geometry.
  // STT/SL are centered; prices have a dedicated right inset from rules.
  const TABLE_INDEX_WIDTH=38;
  const TABLE_GAP=10;
  const TABLE_MONEY_INSET=9;
  const TABLE_QTY_MIN=36;
  const HEADER_META_WIDTH=154;
  const HEADER_GAP=14;
  const HEADER_NAME_WIDTH=WIDTH-44-HEADER_META_WIDTH-HEADER_GAP;
  // ORDER-UI-386: the five columns have four real dividers centered in the
  // existing 8px gaps. Reuse these positions in HTML and Canvas so even the
  // longest prices/names retain their measured widths, with no clipped ink.
  function columnRuleOffsets(indexWidth,nameWidth,qtyWidth,priceWidth,gap){
    const first=indexWidth+gap/2;
    const second=indexWidth+gap+nameWidth+gap/2;
    return [first,second,second+qtyWidth+gap,second+qtyWidth+gap+priceWidth+gap];
  }
  const headerPalette=isDraft=>isDraft
    ?{background:'#fff5eb',accent:'#bd8652',code:'#86531c'}
    :{background:'#f3f6f8',accent:'#748b9c',code:'#203c52'};
  // ORDER-UI-385: exactly one geometry owner, template colors only.
  // Missing registry (offline tests or older shells) keeps the prior navy.
  function invoiceVisual(options){
    const chosen=window.TAPHOA_INVOICE_TEMPLATES?.paletteFor?.(options);
    return chosen||{
      id:'navy',header:'#203c52',headerText:'#ffffff',headerRule:'#7b9cac',
      customer:'#f3f6f8',meta:'#f3f6f8',infoBorder:'#e5ebef',
      table:'#f3f5f8',footer:'#f5f8f6',rowRule:'#e3eaf1',
      code:'#203c52',total:'#226c49',draft:'#fff5eb',draftCode:'#86531c'
    };
  }
  function splitReceiptTimestamp(value){
    const raw=String(value??'').trim()||'--';
    const date=raw.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
    const clock=raw.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
    if(date&&clock)return {clock:clock[0],date:date[0]};
    return {clock:raw,date:''};
  }
  function createPage(options={}){
    const items=Array.isArray(options.items)?options.items:[];
    const visual=invoiceVisual(options);
    const ink=visual.id==='print'?'#171717':'#142238';
    const muted=visual.id==='print'?'#555555':'#64748b';
    const metaBackground=options.isDraft?visual.draft:visual.meta;
    const codeColor=options.isDraft?visual.draftCode:visual.code;
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
    const contentWidth=WIDTH-44,trackGap=TABLE_GAP,indexWidth=TABLE_INDEX_WIDTH;
    const widthsFor=size=>{
      const numeric=`750 ${size}px ${fontFamily}`;
      const totalFont=`800 ${size}px ${fontFamily}`;
      const qty=Math.ceil(Math.max(TABLE_QTY_MIN,...items.map(i=>
        textWidth(formatValue(i,'qtyText'),numeric))));
      const unit=Math.ceil(Math.max(38,...items.map(i=>
        textWidth(formatValue(i,'priceText'),numeric))))+TABLE_MONEY_INSET;
      const amount=Math.ceil(Math.max(53,...items.map(i=>
        textWidth(formatValue(i,'totalText'),totalFont))))+TABLE_MONEY_INSET;
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
    const unitWidth=Math.ceil(Math.max(38+TABLE_MONEY_INSET,unitMax,
      textWidth(priceCaption.toLocaleUpperCase('vi-VN'),
        `800 11px ${fontFamily}`)+TABLE_MONEY_INSET));
    const qtyWidth=Math.ceil(Math.max(TABLE_QTY_MIN,qtyMax,
      textWidth('SL',`800 11px ${fontFamily}`)+2));
    const labels=['Thành tiền','T.tiền','Tiền','TT'];
    const caption=labels.find(label=>textWidth(label.toLocaleUpperCase('vi-VN'),
      `800 11px ${fontFamily}`)<=amountMax-TABLE_MONEY_INSET)||'TT';
    const totalWidth=Math.ceil(Math.max(53+TABLE_MONEY_INSET,amountMax,
      textWidth(caption.toLocaleUpperCase('vi-VN'),
        `800 11px ${fontFamily}`)+TABLE_MONEY_INSET));
    const grid=`${indexWidth}px minmax(0,1fr) ${qtyWidth}px ${unitWidth}px ${totalWidth}px`;
    const gridStyle=`display:grid;grid-template-columns:${grid};column-gap:${trackGap}px;align-items:baseline;box-sizing:border-box;width:100%;min-width:0;`;
    const nameWidth=contentWidth-indexWidth-4*trackGap-qtyWidth-unitWidth-totalWidth;
    const columnRulesHtml=columnRuleOffsets(indexWidth,nameWidth,qtyWidth,unitWidth,trackGap)
      .map(x=>`<span data-invoice-grid-rule="column" aria-hidden="true" style="position:absolute;top:0;bottom:0;left:${x}px;width:1px;background:${visual.rowRule};pointer-events:none;"></span>`)
      .join('');
    const rowsHtml=items.map((item,index)=>`
      <div style="${gridStyle}padding:15px 0;border-bottom:1px solid ${visual.rowRule};min-height:64px;font-size:${numericSize}px;line-height:1.45;">
        <div style="text-align:center;color:${muted};font-weight:700;font-size:13px;font-variant-numeric:tabular-nums;">${escapeHtml(item.index??index+1)}</div>
        <div style="min-width:0;overflow-wrap:break-word;text-align:left;">
          <div style="color:${ink};font-size:17px;line-height:1.4;font-weight:800;">${milkXNameHtml(item)}</div>
          ${item.note?'<div style="font-size:13px;line-height:1.4;margin-top:5px;color:#666666;">'+escapeHtml(item.note)+'</div>':''}
        </div>
        <div style="text-align:center;white-space:nowrap;font-weight:750;color:${milkXInfo(item)?'#dc2626':'#142238'};font-variant-numeric:tabular-nums;">${escapeHtml(item.qtyText)}</div>
        <div style="text-align:right;padding-right:${TABLE_MONEY_INSET}px;box-sizing:border-box;white-space:nowrap;font-weight:750;color:${ink};font-variant-numeric:tabular-nums;">${escapeHtml(item.priceText)}</div>
        <div style="text-align:right;padding-right:${TABLE_MONEY_INSET}px;box-sizing:border-box;white-space:nowrap;font-weight:800;color:${ink};font-variant-numeric:tabular-nums;">${escapeHtml(item.totalText)}</div>
      </div>`).join('');
    const isDraft=!!options.isDraft;
    const isLast=options.isLastPage!==false;
    const orderId=String(options.orderId??'').trim();
    const bannerTitle=isDraft?'ĐƠN HÀNG TẠM':'HÓA ĐƠN BÁN HÀNG';
    const pageIndex=Number(options.pageIndex)||0;
    const pageCount=Math.max(1,Number(options.pageCount)||1);
    // UI-PORTRAIT-021: customer on the left; code and full timestamp
    // in a separate right-hand card. All pages follow the same layout.
    const stamp=splitReceiptTimestamp(options.time);
    const metaLabel=isDraft?'ĐƠN TẠM':'MÃ ĐƠN';
    const pageMarker=pageCount>1?`Trang ${pageIndex+1}/${pageCount}`:'';
    const metaCode=orderId||'--';
    // ORDER-UI-384: restrained colors, matched corner radii and 22px margins.
    // Pure presentation: totals and order values are still source-provided.
    const totalValue=String(options.totalPriceText??'0');
    const summarySize=totalValue.length>14?19:totalValue.length>10?22:27;
    const summary=isLast?`
      <div style="margin:12px 22px 16px;padding:15px 14px;border-radius:12px;background:${visual.footer};display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:center;box-sizing:border-box;">
        <div style="min-width:0;padding-right:9px;border-right:1px solid ${visual.rowRule};">
          <div style="font-size:12px;color:${visual.id==="print"?"#555555":"#576878"};font-weight:750;">Số lượng</div>
          <div style="margin-top:7px;font-size:15px;line-height:1.4;color:${ink};font-weight:800;overflow-wrap:break-word;">${escapeHtml(options.lineCount??items.length)} mã · ${escapeHtml(options.totalQty??0)} sản phẩm</div>
        </div>
        <div style="min-width:0;text-align:right;">
          <div style="font-size:12px;line-height:1.3;color:${visual.id==="print"?"#555555":"#576878"};font-weight:750;">Tổng thanh toán</div>
          <div style="display:inline-block;max-width:100%;box-sizing:border-box;margin-top:7px;color:${visual.total};font-size:${summarySize}px;line-height:1.2;font-weight:800;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;">${escapeHtml(totalValue)}</div>
        </div>
      </div>`:`
      <div style="margin:12px 22px 16px;padding:15px 14px;text-align:right;border-radius:12px;background:${visual.table};color:${muted};font-size:13px;font-weight:750;">Còn tiếp…</div>`;
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
    page.style.cssText=`box-sizing:border-box;width:${WIDTH}px;min-height:${MIN_HEIGHT}px;background:#fff;color:${ink};font-family:${fontFamily};display:flex;flex-direction:column;font-variant-numeric:tabular-nums;-webkit-text-size-adjust:100%;text-size-adjust:100%;border-radius:12px;overflow:hidden;`;
    page.innerHTML=`
      <div style="box-sizing:border-box;min-height:56px;padding:0 22px;display:flex;align-items:center;gap:11px;background:${visual.header};color:${visual.headerText};border-bottom:${visual.id==='print'?'1px solid '+visual.headerRule:'none'};">
        <svg width="23" height="25" viewBox="0 0 24 26" fill="none" aria-hidden="true" style="flex-shrink:0;"><path d="M4 2h16v21l-4-2.5-4 2.5-4-2.5L4 23V2Z" stroke="${visual.headerText}" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9h8M8 13h8" stroke="${visual.headerText}" stroke-width="1.7" stroke-linecap="round"/></svg>
        <span style="height:22px;width:1px;background:${visual.headerRule};"></span>
        <div style="font-size:15px;font-weight:800;letter-spacing:.045em;line-height:1.3;">${bannerTitle}</div>
      </div>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) ${HEADER_META_WIDTH}px;gap:${HEADER_GAP}px;padding:13px 22px 14px;align-items:stretch;box-sizing:border-box;">
        <div style="min-width:0;padding:14px 13px;background:${visual.customer};border-radius:12px;border:1px solid ${visual.infoBorder};box-sizing:border-box;">
          <div style="font-size:11px;letter-spacing:.055em;color:${muted};font-weight:800;">KHÁCH HÀNG</div>
          <div style="margin-top:10px;font-size:21px;line-height:1.3;letter-spacing:-.02em;font-weight:800;color:${ink};overflow-wrap:break-word;">${escapeHtml(options.customer||'Khách hàng')}</div>
        </div>
        <div style="min-width:0;padding:14px 12px;background:${metaBackground};border-radius:12px;border:1px solid ${visual.infoBorder};box-sizing:border-box;text-align:right;">
          <div style="font-size:10.5px;letter-spacing:.04em;color:${muted};font-weight:800;">${metaLabel}</div>
          <div style="margin-top:6px;font-size:22px;line-height:1.2;font-weight:800;color:${codeColor};overflow-wrap:anywhere;">${escapeHtml(metaCode)}</div>
          <div style="margin-top:9px;font-size:11.5px;line-height:1.4;color:${visual.id==="print"?"#555555":"#415c75"};font-weight:700;overflow-wrap:anywhere;">${escapeHtml([stamp.date,stamp.clock].filter(Boolean).join(' · '))}</div>
          ${pageMarker?`<div style="margin-top:5px;font-size:11px;color:${muted};font-weight:700;">${escapeHtml(pageMarker)}</div>`:''}
        </div>
      </div>
      <div style="padding:0 22px;flex:0 0 auto;box-sizing:border-box;">
        <div data-invoice-grid="five-columns" style="position:relative;overflow:hidden;border-radius:8px;">
        <div style="${gridStyle}height:44px;border-bottom:1px solid ${visual.rowRule};background:${visual.table};color:${visual.id==="print"?"#555555":"#53677d"};font-size:11px;line-height:1.3;font-weight:800;text-transform:uppercase;align-items:center;">
          <div style="text-align:center;">STT</div><div>Tên</div>
          <div style="text-align:center;">SL</div>
          <div style="text-align:right;padding-right:${TABLE_MONEY_INSET}px;box-sizing:border-box;" title="Đơn giá" aria-label="Đơn giá">${escapeHtml(priceCaption)}</div>
          <div style="text-align:right;padding-right:${TABLE_MONEY_INSET}px;box-sizing:border-box;" title="Thành tiền">${escapeHtml(caption)}</div>
        </div>
        <div>${rowsHtml}</div>
        ${columnRulesHtml}
        <span data-invoice-grid-rule="outline" aria-hidden="true" style="position:absolute;inset:0;border:1px solid ${visual.rowRule};border-radius:8px;box-sizing:border-box;pointer-events:none;"></span>
        </div>
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
    const visual=invoiceVisual(options);
    const metaBackground=options.isDraft?visual.draft:visual.meta;
    const codeColor=options.isDraft?visual.draftCode:visual.code;
    if(!items.length||items.length>130)throw Error('order_png_items_invalid');
    const ratio=Math.max(1,Math.min(1.5,Number(scale)||1.2));
    const paper=document.createElement('canvas');
    const paint=paper.getContext?.('2d');
    if(!paint)throw Error('order_canvas_unavailable');
    const family='"Be Vietnam Pro",-apple-system,BlinkMacSystemFont,Arial,sans-serif';
    const font=(size,weight=600)=>weight+' '+size+'px '+family;
    const width=WIDTH,margin=22,contentWidth=width-margin*2,gap=TABLE_GAP;
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
    const indexWidth=TABLE_INDEX_WIDTH;
    const columnMetrics=size=>{
      const numeric=font(size,750);
      const total=font(size,800);
      const qty=Math.max(TABLE_QTY_MIN,Math.ceil(Math.max(...items.map(i=>
        measure(i.qtyText,numeric)))));
      const price=Math.max(38,Math.ceil(Math.max(...items.map(i=>
        measure(i.priceText,numeric)))))+TABLE_MONEY_INSET;
      const amount=Math.max(53,Math.ceil(Math.max(...items.map(i=>
        measure(i.totalText,total)))))+TABLE_MONEY_INSET;
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
    const customerStyle=font(21,800);
    const customerLines=wrap(options.customer||'Khách hàng',
      HEADER_NAME_WIDTH-26,customerStyle);
    const code=String(options.orderId||'').trim()||'--';
    const pages=Math.max(1,Number(options.pageCount)||1);
    const pageNo=Number(options.pageIndex)||0;
    const stamp=splitReceiptTimestamp(options.time);
    const metaLabel=isDraft?'ĐƠN TẠM':'MÃ ĐƠN';
    const metaWidth=HEADER_META_WIDTH-24;
    const codeStyle=font(22,800),stampStyle=font(11.5,700);
    const pageStyle=font(11,700);
    const codeLines=wrap(code,metaWidth,codeStyle);
    const stampText=[stamp.date,stamp.clock].filter(Boolean).join(' · ');
    const stampLines=wrap(stampText,metaWidth,stampStyle);
    const pageLines=pages>1
      ?wrap('Trang '+(pageNo+1)+'/'+pages,metaWidth,pageStyle):[];
    const bannerHeight=56;
    const infoTop=bannerHeight+13;
    const codeY=infoTop+41;
    const stampY=codeY+codeLines.length*26+5;
    const pageY=stampY+stampLines.length*17+6;
    const infoHeight=Math.max(110,51+customerLines.length*29,
      pageY-infoTop+pageLines.length*17+14);
    const headerHeight=infoTop+infoHeight+14;
    const rows=items.map((item,index)=>{
      const names=wrap(item.name,columns.name,nameStyle);
      const notes=String(item.note||'').trim()?wrap(item.note,columns.name,noteStyle):[];
      const height=Math.max(68,26+names.length*24+notes.length*19);
      return {item,index,names,notes,height,milkX:!!milkXInfo(item)};
    });
    const tableTop=headerHeight+2,bodyTop=tableTop+46;
    const bodyHeight=rows.reduce((total,row)=>total+row.height,0);
    const footerTop=bodyTop+bodyHeight+9;
    const isLast=options.isLastPage!==false;
    const logicalHeight=Math.max(MIN_HEIGHT,footerTop+(isLast?124:72));
    if(!Number.isSafeInteger(Math.ceil(logicalHeight*ratio))
      ||logicalHeight*ratio>19500)throw Error('order_png_height_limit');
    paper.width=Math.ceil(width*ratio);
    paper.height=Math.ceil(logicalHeight*ratio);
    const ctx=paper.getContext('2d');
    if(!ctx)throw Error('order_canvas_unavailable');
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.textBaseline='top';
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,logicalHeight);
    const tone=color=>visual.id==='print'&&['#142238','#415c75','#53677d','#576878','#64748b','#586b82'].includes(color)
      ?(color==='#142238'?'#171717':'#555555'):color;
    const line=(x1,y1,x2,y2,color='#dfe7ef')=>{
      ctx.fillStyle=tone(color);
      ctx.fillRect(x1,y1,Math.max(1,x2-x1),Math.max(1,y2-y1));
    };
    const label=(value,x,y,style,color,align='left')=>{
      ctx.font=style;ctx.fillStyle=tone(color);ctx.textAlign=align;
      ctx.fillText(String(value??''),x,y);
    };
    // ORDER-UI-384: same geometry and visual hierarchy as HTML fallback.
    // Draws offline without dependencies, account changes or order writes.
    const fillRounded=(x,y,w,h,r,color)=>{
      ctx.fillStyle=color;
      if(typeof ctx.beginPath!=='function'||typeof ctx.moveTo!=='function'
         ||typeof ctx.lineTo!=='function'||typeof ctx.quadraticCurveTo!=='function'
         ||typeof ctx.closePath!=='function'||typeof ctx.fill!=='function'){
        ctx.fillRect(x,y,w,h);return;
      }
      const k=Math.min(r,w/2,h/2);
      ctx.beginPath();
      ctx.moveTo(x+k,y);ctx.lineTo(x+w-k,y);
      ctx.quadraticCurveTo(x+w,y,x+w,y+k);
      ctx.lineTo(x+w,y+h-k);
      ctx.quadraticCurveTo(x+w,y+h,x+w-k,y+h);
      ctx.lineTo(x+k,y+h);
      ctx.quadraticCurveTo(x,y+h,x,y+h-k);
      ctx.lineTo(x,y+k);
      ctx.quadraticCurveTo(x,y,x+k,y);
      ctx.closePath();ctx.fill();
    };
    ctx.fillStyle=visual.header;ctx.fillRect(0,0,width,bannerHeight);
    if(visual.id==='print')line(margin,bannerHeight-1,width-margin,bannerHeight,visual.headerRule);
    if(typeof ctx.strokeRect==='function'){
      ctx.strokeStyle=visual.headerText;ctx.lineWidth=1.7;
      ctx.strokeRect(22,15,19,25);
      ctx.fillStyle=visual.headerText;ctx.fillRect(27,23,9,1.5);
      ctx.fillRect(27,29,9,1.5);
    }
    line(56,17,57,39,visual.headerRule);
    label(isDraft?'ĐƠN HÀNG TẠM':'HÓA ĐƠN BÁN HÀNG',
      69,18,font(15,800),visual.headerText);
    const cardX=width-margin-HEADER_META_WIDTH;
    fillRounded(margin,infoTop,HEADER_NAME_WIDTH,infoHeight,12,visual.customer);
    fillRounded(cardX,infoTop,HEADER_META_WIDTH,infoHeight,12,metaBackground);
    label('KHÁCH HÀNG',margin+13,infoTop+16,font(11,800),'#64748b');
    customerLines.forEach((part,i)=>
      label(part,margin+13,infoTop+43+i*28,customerStyle,'#142238'));
    const metaRight=width-margin-12;
    label(metaLabel,metaRight,infoTop+15,font(11,800),'#64748b','right');
    codeLines.forEach((part,i)=>
      label(part,metaRight,codeY+i*26,codeStyle,codeColor,'right'));
    stampLines.forEach((part,i)=>
      label(part,metaRight,stampY+i*17,stampStyle,'#415c75','right'));
    pageLines.forEach((part,i)=>
      label(part,metaRight,pageY+i*17,pageStyle,'#64748b','right'));
    const xIndex=margin+indexWidth/2;
    const xName=margin+indexWidth+gap;
    const xQtyStart=xName+columns.name+gap;
    const xQty=xQtyStart+columns.qty/2;
    const xPrice=xQtyStart+columns.qty+gap+columns.price-TABLE_MONEY_INSET;
    const xTotal=xQtyStart+columns.qty+gap+columns.price+gap+
      columns.amount-TABLE_MONEY_INSET;
    fillRounded(margin,tableTop,contentWidth,44,8,visual.table);
    const captionY=tableTop+14;
    label('STT',xIndex,captionY,font(11,800),'#53677d','center');
    label('TÊN',xName,captionY,font(12,800),'#53677d');
    label('SL',xQty,captionY,font(12,800),'#53677d','center');
    label('ĐG',xPrice,captionY,font(12,800),'#53677d','right');
    label('TIỀN',xTotal,captionY,font(12,800),'#53677d','right');
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
        row.milkX?'#dc2626':'#142238','center');
      label(item.priceText,xPrice,y+16,numberStyle,'#142238','right');
      label(item.totalText,xTotal,y+16,totalNumberStyle,'#142238','right');
      y+=row.height;
      line(margin,y-1,width-margin,y,visual.rowRule);
    }
    // Draw four continuous vertical rules over the measured gaps, from the
    // shaded column header to the bottom of the product rows. The Canvas PNG
    // uses the exact same ruler as the HTML fallback and selected templates.
    const tableBottom=y;
    line(margin,tableTop,width-margin,tableTop+1,visual.rowRule);
    line(margin,bodyTop-1,width-margin,bodyTop,visual.rowRule);
    for(const offset of columnRuleOffsets(indexWidth,columns.name,columns.qty,columns.price,gap)){
      const x=margin+offset;
      line(x,tableTop,x+1,tableBottom,visual.rowRule);
    }
    line(margin,tableTop,margin+1,tableBottom,visual.rowRule);
    line(width-margin-1,tableTop,width-margin,tableBottom,visual.rowRule);
    if(!isLast){
      fillRounded(margin,footerTop+10,contentWidth,44,12,visual.table);
      label('Còn tiếp…',width-margin-13,footerTop+22,
        font(13,750),'#64748b','right');
    }else{
      // The printed grand total is the source-provided label, not the
      // sum of rounded visible rows. Never recompute a monetary value here.
      fillRounded(margin,footerTop+10,contentWidth,98,12,visual.footer);
      line(220,footerTop+25,221,footerTop+94,visual.rowRule);
      label('Số lượng',36,footerTop+24,font(12,750),'#576878');
      const qtySummary=String(options.lineCount??items.length)+' mã · '+
        String(options.totalQty??0)+' sản phẩm';
      const qtyLines=wrap(qtySummary,174,font(15,800));
      qtyLines.slice(0,2).forEach((part,i)=>
        label(part,36,footerTop+51+i*19,font(15,800),'#142238'));
      label('Tổng thanh toán',width-36,footerTop+22,
        font(12,750),'#576878','right');
      const total=String(options.totalPriceText??'0');
      let totalSize=28;
      while(totalSize>14&&measure(total,font(totalSize,800))>176)
        totalSize--;
      label(total,width-36,footerTop+50,font(totalSize,800),visual.total,'right');
    }
    return paper;
  }

  window.TAPHOA_ORDER_PORTRAIT=Object.freeze({WIDTH,MIN_HEIGHT,createPage,renderCanvas});
})();
