/* UI-123 — No decorative hints, placeholders or tooltips across TAPHOA.
   Preserve actual button captions, validation, confirmation, and screen-reader
   labels. One observer per document, no timers, server calls or data changes. */
(function(){
  'use strict';
  if(window.__taphoaNoHintsInstalled)return;
  window.__taphoaNoHintsInstalled=true;
  const observed=['placeholder','title','data-tooltip','data-tip',
    'data-tippy-content','data-original-title'];
  const selector=observed.map(a=>'['+a+']').join(',');
  function strip(el){
    if(!(el instanceof Element))return;
    const placeholder=el.getAttribute('placeholder');
    if(placeholder!==null && /^(INPUT|TEXTAREA)$/.test(el.tagName)
       && !el.hasAttribute('aria-label')){
      // Search/PIN fields remain accessible without visible hint text.
      const accessible=placeholder.trim();
      if(accessible)el.setAttribute('aria-label',accessible);
    }
    for(const key of observed)if(el.hasAttribute(key))el.removeAttribute(key);
    if(el.getAttribute('data-bs-toggle')==='tooltip')
      el.removeAttribute('data-bs-toggle');
    if(el.getAttribute('data-toggle')==='tooltip')
      el.removeAttribute('data-toggle');
    if(/^(INPUT|TEXTAREA)$/.test(el.tagName)){
      const type=String(el.getAttribute('type')||'text').toLowerCase();
      if(!['password','hidden','file','checkbox','radio'].includes(type)){
        el.setAttribute('autocomplete','off');
        el.setAttribute('autocorrect','off');
        el.setAttribute('spellcheck','false');
      }
    }
  }
  function scan(root){
    if(!(root instanceof Element))return;
    strip(root);
    for(const el of root.querySelectorAll(selector))strip(el);
  }
  function start(){
    scan(document.documentElement);
    const css=document.createElement('style');
    css.id='taphoa-no-hints-style';
    css.textContent='[role="tooltip"],.tippy-box,.tooltip,[data-popper-placement][role="tooltip"]{display:none!important}';
    document.head?.appendChild(css);
    new MutationObserver(records=>{
      for(const record of records){
        if(record.type==='attributes'){strip(record.target);continue;}
        for(const el of record.addedNodes)scan(el);
      }
    }).observe(document.documentElement,{
      subtree:true,childList:true,attributes:true,
      attributeFilter:[...observed,'data-bs-toggle','data-toggle']
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
