const TEXT_ENTRY_SELECTOR='input, textarea, [contenteditable="true"]';

const isTextEntry=target=>Boolean(target?.matches?.(TEXT_ENTRY_SELECTOR));

export function installImeInputStability(root=globalThis.document,schedule=fn=>globalThis.setTimeout(fn,0)){
  if(!root?.addEventListener)return()=>{};

  const composing=new WeakSet();
  const pendingCommit=new WeakMap();

  const onCompositionStart=event=>{
    const target=event.target;
    if(!isTextEntry(target))return;
    composing.add(target);
    pendingCommit.delete(target);
  };

  const onInput=event=>{
    const target=event.target;
    if(!isTextEntry(target))return;
    if(composing.has(target)||event.isComposing===true){
      event.stopImmediatePropagation?.();
      return;
    }
    const pending=pendingCommit.get(target);
    if(pending){
      pending.handled=true;
      pendingCommit.delete(target);
    }
  };

  const onCompositionEnd=event=>{
    const target=event.target;
    if(!isTextEntry(target))return;
    composing.delete(target);
    const pending={handled:false};
    pendingCommit.set(target,pending);
    schedule(()=>{
      if(pending.handled||!target.isConnected)return;
      pendingCommit.delete(target);
      target.dispatchEvent(new Event('input',{bubbles:true}));
    });
  };

  root.addEventListener('compositionstart',onCompositionStart,true);
  root.addEventListener('compositionend',onCompositionEnd,true);
  root.addEventListener('input',onInput,true);

  return()=>{
    root.removeEventListener?.('compositionstart',onCompositionStart,true);
    root.removeEventListener?.('compositionend',onCompositionEnd,true);
    root.removeEventListener?.('input',onInput,true);
  };
}

if(globalThis.document)installImeInputStability(globalThis.document);
