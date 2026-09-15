const TEXT_ENTRY_SELECTOR='input, textarea, [contenteditable="true"]';

const isTextEntry=target=>Boolean(target?.matches?.(TEXT_ENTRY_SELECTOR));

export function installImeInputStability(root=globalThis.document){
  if(!root?.addEventListener)return()=>{};

  const composing=new WeakSet();

  const onCompositionStart=event=>{
    const target=event.target;
    if(!isTextEntry(target))return;
    composing.add(target);
  };

  const onInput=event=>{
    const target=event.target;
    if(!isTextEntry(target))return;
    if(composing.has(target)||event.isComposing===true){
      event.stopImmediatePropagation?.();
    }
  };

  const onCompositionEnd=event=>{
    const target=event.target;
    if(!isTextEntry(target))return;
    composing.delete(target);
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
