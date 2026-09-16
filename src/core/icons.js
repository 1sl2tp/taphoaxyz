const ICONS=Object.freeze({
  search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.25 4.25"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  cart:'<path d="M3.5 5h2l1.7 8.1a2 2 0 0 0 2 1.6h6.9a2 2 0 0 0 1.9-1.4L20 7.5H6"/><circle cx="9" cy="18.5" r="1"/><circle cx="17" cy="18.5" r="1"/>',
  calendar:'<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9h17"/>',
  'chevron-left':'<path d="m14.5 5-7 7 7 7"/>',
  'chevron-right':'<path d="m9.5 5 7 7-7 7"/>',
  edit:'<path d="M13.5 5.5 18.5 10.5M5 19l3.3-.7L19 7.6a1.7 1.7 0 0 0 0-2.4l-.2-.2a1.7 1.7 0 0 0-2.4 0L5.7 15.7 5 19Z"/>',
  trash:'<path d="M4.5 7h15M9 3.8h6l.7 3.2H8.3L9 3.8ZM7 7l.8 13h8.4L17 7M10 10.5v6M14 10.5v6"/>',
  share:'<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 12.5v5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-5"/>',
  print:'<path d="M7 8V4h10v4M7 17H5.5A2.5 2.5 0 0 1 3 14.5v-4A2.5 2.5 0 0 1 5.5 8h13A2.5 2.5 0 0 1 21 10.5v4a2.5 2.5 0 0 1-2.5 2.5H17"/><rect x="7" y="14" width="10" height="6" rx="1"/><path d="M17.5 11h.01"/>',
  check:'<path d="m5 12.5 4.2 4.2L19 7"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  user:'<circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
  logout:'<path d="M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10M14 8l4 4-4 4M18 12H9"/>',
  eye:'<path d="M3.5 12s3.2-5.5 8.5-5.5 8.5 5.5 8.5 5.5-3.2 5.5-8.5 5.5S3.5 12 3.5 12Z"/><circle cx="12" cy="12" r="2.5"/>',
  'eye-off':'<path d="m4 4 16 16M9.6 6.9A8.9 8.9 0 0 1 12 6.5c5.3 0 8.5 5.5 8.5 5.5a15 15 0 0 1-2.8 3.4M14.2 14.2A3 3 0 0 1 9.8 9.8M6.3 8.2A15.4 15.4 0 0 0 3.5 12s3.2 5.5 8.5 5.5c.9 0 1.8-.2 2.6-.5"/>',
  more:'<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>'
});

function escapeAttr(value){
  return String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[char]);
}

export const ICON_NAMES=Object.freeze(Object.keys(ICONS));

export function icon(name,{size=20,label=null}={}){
  const body=ICONS[name];
  if(!body)throw new Error(`Unknown UI icon: ${name}`);
  const numericSize=Number(size);
  const safeSize=Number.isFinite(numericSize)&&numericSize>0?numericSize:20;
  const a11y=label
    ? `role="img" aria-label="${escapeAttr(label)}"`
    : 'aria-hidden="true" focusable="false"';
  return `<svg class="ui-icon ui-icon-${escapeAttr(name)}" width="${safeSize}" height="${safeSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`;
}
