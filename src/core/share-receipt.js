export async function shareReceiptImage(element,{fileName='don-hang.jpg',title='Đơn hàng',text='taphoa.xyz'}={},deps={}){
  const html2canvas=deps.html2canvas||globalThis.html2canvas;
  const nav=deps.navigator||globalThis.navigator||{};
  const URLApi=deps.URL||globalThis.URL;
  const doc=deps.document||globalThis.document;
  const FileCtor=deps.File||globalThis.File;
  if(!element)throw new Error('Không có nội dung đơn để chia sẻ');
  if(typeof html2canvas!=='function')throw new Error('Chưa tải bộ tạo ảnh đơn hàng');
  const canvas=await html2canvas(element,{scale:2,useCORS:true,backgroundColor:'#ffffff'});
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Không tạo được ảnh đơn hàng')),'image/jpeg',.9));
  const file=FileCtor?new FileCtor([blob],fileName,{type:'image/jpeg'}):Object.assign(blob,{name:fileName});
  if(typeof nav.share==='function'&&(!nav.canShare||nav.canShare({files:[file]}))){
    try{
      await nav.share({files:[file],title,text});
      return {shared:true,downloaded:false};
    }catch(error){
      if(error?.name==='AbortError')return {shared:false,downloaded:false,aborted:true};
    }
  }
  if(!URLApi?.createObjectURL||!doc?.createElement)throw new Error('Thiết bị không hỗ trợ chia sẻ ảnh');
  const url=URLApi.createObjectURL(blob);
  const link=doc.createElement('a');
  link.href=url;link.download=fileName;link.click();
  URLApi.revokeObjectURL?.(url);
  return {shared:false,downloaded:true};
}
