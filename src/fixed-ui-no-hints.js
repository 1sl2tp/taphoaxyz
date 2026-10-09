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
  /* UI-128 — Search-only select-all on focus/tap.
     A new query replaces the old one with one keystroke. Delegate on document
     so fields rebuilt by sales, price management or supplier tabs inherit it.
     Never touch quantity, price, PIN, notes, textarea or user-typed events. */
  function isSearchInput(el){
    if(!(el instanceof Element)||el.tagName!=='INPUT'||el.disabled||el.readOnly)return false;
    const type=String(el.type||el.getAttribute('type')||'text').toLowerCase();
    if(type!=='search'&&type!=='text')return false;
    if(el.getAttribute('data-search-autoselect')==='off')return false;
    return type==='search'
      || /search|tim[-_]?kiem/i.test(String(el.id||'')+' '+String(el.name||''))
      || el.getAttribute('data-search-autoselect')==='all';
  }
  function selectExistingSearchText(event){
    const el=event.target;
    if(!isSearchInput(el)||!String(el.value||'').length)return;
    // Selection only: never set value, dispatch input/change or invoke a search.
    try{el.select()}catch(_){}
  }
  /* UI-129 — A single optional microphone for actual search inputs.
     The user's explicit click starts browser speech recognition; the app
     neither captures/stores audio nor adds its own backend speech request.
     The browser's recognition provider may process audio remotely. */
  let voiceSession=null;
  const voiceMarkup='<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg>';
  function isSearchField(el){
    if(!(el instanceof Element)||el.tagName!=='INPUT')return false;
    const type=String(el.type||el.getAttribute('type')||'text').toLowerCase();
    if(type!=='text'&&type!=='search')return false;
    if(el.getAttribute('data-search-autoselect')==='off')return false;
    return type==='search'
      || /search|tim[-_]?kiem/i.test(String(el.id||'')+' '+String(el.name||''))
      || el.getAttribute('data-search-autoselect')==='all';
  }
  function finishVoiceSession(session){
    if(voiceSession!==session)return;
    voiceSession=null;
    session.button.removeAttribute('data-listening');
    session.button.setAttribute('aria-pressed','false');
    session.button.setAttribute('aria-label','Tìm kiếm bằng giọng nói');
  }
  function abortVoiceSession(){
    if(!voiceSession)return;
    const session=voiceSession;
    finishVoiceSession(session);
    try{session.recognition.abort()}catch(_){}
  }
  function startVoiceSession(input,button){
    if(input.disabled||input.readOnly)return;
    if(voiceSession){
      const session=voiceSession;
      if(session.input===input){
        // Tap again to stop recording. A final result may still arrive.
        try{session.recognition.stop()}catch(_){finishVoiceSession(session)}
        return;
      }
      abortVoiceSession();
    }
    const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!Recognition){
      window.alert?.('Trình duyệt hiện chưa hỗ trợ tìm kiếm bằng giọng nói.');
      return;
    }
    let recognition;
    try{recognition=new Recognition()}catch(_){
      window.alert?.('Không khởi tạo được micro. Vui lòng thử lại trên trình duyệt hỗ trợ.');
      return;
    }
    recognition.lang='vi-VN';
    recognition.continuous=false;
    recognition.interimResults=false;
    recognition.maxAlternatives=1;
    const session={input,button,recognition,finalDelivered:false};
    voiceSession=session;
    button.setAttribute('data-listening','true');
    button.setAttribute('aria-pressed','true');
    button.setAttribute('aria-label','Dừng tìm kiếm bằng giọng nói');
    recognition.onresult=event=>{
      if(voiceSession!==session||session.finalDelivered||input.disabled||input.readOnly||!input.isConnected)return;
      const transcript=Array.from(event.results||[])
        .filter(result=>result.isFinal!==false)
        .map(result=>String(result[0]?.transcript||'').trim())
        .filter(Boolean).join(' ').trim();
      if(!transcript)return;
      session.finalDelivered=true;
      // The existing input handler remains the ONLY owner of search requests.
      input.value=transcript;
      input.dispatchEvent(new Event('input',{bubbles:true}));
    };
    recognition.onerror=event=>{
      if(voiceSession!==session)return;
      const blocked=['not-allowed','service-not-allowed','audio-capture'].includes(event.error);
      finishVoiceSession(session);
      if(blocked){
        window.alert?.('Không truy cập được micro. Hãy kiểm tra quyền micro trong trình duyệt.');
      }
    };
    recognition.onend=()=>finishVoiceSession(session);
    try{recognition.start()}catch(_){
      finishVoiceSession(session);
      window.alert?.('Không thể bắt đầu nhận giọng nói. Hãy kiểm tra micro.');
    }
  }
  function syncVoiceButton(input){
    const button=input.__taphoaVoiceButton;
    if(!button)return;
    const inactive=input.disabled||input.readOnly;
    button.disabled=inactive;
    button.style.display=inactive?'none':'flex';
    if(inactive&&voiceSession?.input===input)abortVoiceSession();
  }
  function ensureVoiceSearch(input){
    if(!isSearchField(input))return;
    if(input.__taphoaVoiceButton){
      syncVoiceButton(input);
      return;
    }
    if(input.disabled||input.readOnly)return;
    const parent=input.parentElement;
    if(!parent)return;
    let host;
    if(input.id==='searchProductInput'){
      // Sales already has a relative container with the mode toggle at left.
      host=parent;
      host.classList.add('taphoa-voice-search-host');
    }else{
      // A wrapper keeps the microphone aligned to the INPUT, not to a
      // toolbar that also contains filter, save or supplier buttons.
      host=document.createElement('span');
      host.className='taphoa-voice-search-wrap';
      if(parent.classList.contains('market-filter-box')){
        host.classList.add('taphoa-voice-search-tags');
      }
      parent.insertBefore(host,input);
      host.appendChild(input);
    }
    input.classList.add('taphoa-voice-search-input');
    const button=document.createElement('button');
    button.type='button';
    button.className='taphoa-voice-search-button';
    button.setAttribute('aria-label','Tìm kiếm bằng giọng nói');
    button.setAttribute('aria-pressed','false');
    button.innerHTML=voiceMarkup;
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      startVoiceSession(input,button);
    });
    host.appendChild(button);
    input.__taphoaVoiceButton=button;
    syncVoiceButton(input);
  }
  const voiceCss=String.raw`
.taphoa-voice-search-wrap{position:relative;display:block;flex:1 1 auto;min-width:0;width:100%;max-width:100%}
.taphoa-voice-search-wrap>.taphoa-voice-search-input{box-sizing:border-box;width:100%!important;min-width:0}
/* The built-in search X occupies the same right edge as the voice button. */
.taphoa-voice-search-input[type=search]::-webkit-search-cancel-button,
.taphoa-voice-search-input[type=search]::-webkit-search-decoration{display:none!important}
.taphoa-voice-search-host>.taphoa-voice-search-input,
.taphoa-voice-search-wrap>.taphoa-voice-search-input{padding-right:47px!important}
.taphoa-voice-search-host{position:relative}
.taphoa-voice-search-host>.taphoa-voice-search-button,
.taphoa-voice-search-wrap>.taphoa-voice-search-button{
  position:absolute!important;right:5px!important;left:auto!important;top:50%!important;
  transform:translateY(-50%)!important;z-index:3!important;
  box-sizing:border-box!important;display:flex;align-items:center;justify-content:center;
  width:35px!important;min-width:35px!important;max-width:35px!important;
  height:35px!important;min-height:35px!important;max-height:35px!important;
  margin:0!important;padding:0!important;border:0!important;border-radius:9px!important;
  background:transparent!important;color:#64748b!important;
  box-shadow:none!important;cursor:pointer;touch-action:manipulation;
}
.taphoa-voice-search-button svg{flex:none;pointer-events:none}
.taphoa-voice-search-button:hover,
.taphoa-voice-search-button:focus-visible{color:#16a34a!important;background:#f0fdf4!important}
.taphoa-voice-search-button[data-listening=true]{
  color:#dc2626!important;background:#fef2f2!important;
  box-shadow:inset 0 0 0 1px #fecaca!important
}
.taphoa-voice-search-button:disabled{display:none!important}
.market-filter-box>.taphoa-voice-search-wrap{flex:1 1 110px;min-width:110px}
.searchbar>.taphoa-voice-search-wrap{min-width:0}
@media screen and (max-width:800px){
  .searchbar>.taphoa-voice-search-wrap{grid-column:1/-1}
  .searchbar>.taphoa-voice-search-wrap>input{min-height:44px;font-size:16px}
}
@media screen and (max-width:680px){
  .toolbar>.taphoa-voice-search-wrap{flex-basis:100%}
  .tabs+.toolbar>.taphoa-voice-search-wrap{grid-column:1/-1}
  .taphoa-voice-search-wrap>input[type=search]{font-size:16px}
}
@media print{.taphoa-voice-search-button{display:none!important}}
`;
  function start(){
    scan(document.documentElement);
    for(const input of document.querySelectorAll('input'))ensureVoiceSearch(input);
    document.addEventListener('focusin',selectExistingSearchText);
    document.addEventListener('click',selectExistingSearchText);
    const css=document.createElement('style');
    css.id='taphoa-no-hints-style';
    css.textContent='[role="tooltip"],.tippy-box,.tooltip,[data-popper-placement][role="tooltip"]{display:none!important}' + voiceCss;
    document.head?.appendChild(css);
    new MutationObserver(records=>{
      for(const record of records){
        if(record.type==='attributes'){
          strip(record.target);
          if(record.attributeName==='disabled'||record.attributeName==='readonly'){
            ensureVoiceSearch(record.target);
            if(record.target.__taphoaVoiceButton)syncVoiceButton(record.target);
          }
          continue;
        }
        for(const el of record.addedNodes){
          if(!(el instanceof Element))continue;
          scan(el);
          if(el.tagName==='INPUT')ensureVoiceSearch(el);
          for(const input of el.querySelectorAll('input'))ensureVoiceSearch(input);
        }
      }
      if(voiceSession&&!voiceSession.input.isConnected)abortVoiceSession();
    }).observe(document.documentElement,{
      subtree:true,childList:true,attributes:true,
      attributeFilter:[...observed,'data-bs-toggle','data-toggle','disabled','readonly']
    });
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden)abortVoiceSession();
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
