const normalizeText=value=>String(value||'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[đĐ]/g,'d')
  .toLowerCase()
  .trim();

export function parseLedgerTime(value){
  const raw=String(value||'').trim();
  if(!raw)return Number.NaN;

  let m=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(m){
    return Date.UTC(Number(m[3]),Number(m[2])-1,Number(m[1]),Number(m[4]),Number(m[5]),Number(m[6]||0));
  }

  m=raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    return Date.UTC(Number(m[6]),Number(m[5])-1,Number(m[4]),Number(m[1]),Number(m[2]),Number(m[3]||0));
  }

  const parsed=Date.parse(raw);
  return Number.isFinite(parsed)?parsed:Number.NaN;
}

export function sortLedgerRowsOldestFirst(rows=[]){
  return (Array.isArray(rows)?rows:[])
    .map((row,index)=>({row,index,time:parseLedgerTime(row?.[4])}))
    .sort((a,b)=>{
      const aValid=Number.isFinite(a.time),bValid=Number.isFinite(b.time);
      if(aValid&&bValid&&a.time!==b.time)return a.time-b.time;
      if(aValid!==bValid)return aValid?-1:1;
      return a.index-b.index;
    })
    .map(item=>item.row);
}

export function isInternalDebtEntry(label){
  const text=normalizeText(label);
  return /(^|\s)(hoan don|dao don|reverse order|reverse)(\s|$)/.test(text);
}

export function visibleDebtHistoryNewestFirst(history=[]){
  return (Array.isArray(history)?history:[])
    .filter(item=>!isInternalDebtEntry(item?.loaiGd))
    .map((item,index)=>({item,index,time:parseLedgerTime(item?.time)}))
    .sort((a,b)=>{
      const aValid=Number.isFinite(a.time),bValid=Number.isFinite(b.time);
      if(aValid&&bValid&&a.time!==b.time)return b.time-a.time;
      if(aValid!==bValid)return aValid?-1:1;
      return a.index-b.index;
    })
    .map(entry=>entry.item);
}

export function normalizeFixedSalesHeaderChildren(header,expectedChildren=[]){
  if(!header)return;
  const expected=expectedChildren.filter(Boolean);
  const allowed=new Set(expected);
  Array.from(header.children||[]).forEach(child=>{
    if(!allowed.has(child))header.removeChild(child);
  });
  expected.forEach(child=>header.appendChild(child));
}
