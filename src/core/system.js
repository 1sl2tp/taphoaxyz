export function createSystemLayer(root) {
  let timer=0;
  const toast=(message)=>{
    if (!root || !message) return;
    root.textContent=message;
    root.hidden=false;
    clearTimeout(timer);
    timer=setTimeout(()=>{root.hidden=true;root.textContent='';},2200);
  };
  return {toast,clear:()=>{clearTimeout(timer);if(root){root.hidden=true;root.textContent='';}}};
}
