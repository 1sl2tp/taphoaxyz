const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function buildPrintDocument({title='',body=''}={}){
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1e293b;margin:24px}button{display:none}.print-sheet{max-width:720px;margin:0 auto}.print-row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #e2e8f0}.print-head{font-weight:800;font-size:18px;margin-bottom:10px}.print-meta{font-size:12px;color:#64748b;margin-bottom:10px}.print-total{display:flex;justify-content:space-between;font-weight:900;font-size:16px;padding-top:10px}@media print{body{margin:0}}</style></head><body>${body}<script>addEventListener('load',()=>{window.print();setTimeout(()=>window.close(),250);});<\/script></body></html>`;
}

export function openPrintDocument({title='',body=''}={}){
  const win=window.open('','_blank','noopener,noreferrer,width=860,height=720');
  if(!win)return false;
  win.document.open();win.document.write(buildPrintDocument({title,body}));win.document.close();return true;
}
