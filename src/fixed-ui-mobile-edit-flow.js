'use strict';

(function(){
  function closeOrderDetailOverlayNow(){
    const bottomSheet=document.getElementById('orderDetailBottomSheet');
    const modalWrap=document.getElementById('orderDetailModalWrapper');
    if(bottomSheet) bottomSheet.classList.add('translate-y-full');
    if(modalWrap){
      modalWrap.classList.add('pointer-events-none','opacity-0','hidden');
    }
  }

  const originalClickOrder=typeof window.clickOrder==='function' ? window.clickOrder : null;
  const originalEditOrder=typeof window.editOrder==='function' ? window.editOrder : null;

  window.clickOrder=function(orderId,sheetName){
    const params=new URLSearchParams(window.location.search);
    const publicCustomer=String(params.get('kh')||'').trim();
    const deepLinkedOrder=String(params.get('don')||'').trim();
    const requestedOrder=String(orderId||'').trim();

    if(
      publicCustomer &&
      deepLinkedOrder &&
      requestedOrder===deepLinkedOrder &&
      typeof window.showOrderDetailMobile==='function'
    ){
      viewingOrderId=orderId;
      window.activeViewingSheet=sheetName;
      window.showOrderDetailMobile(orderId,sheetName);
      return;
    }

    if(originalClickOrder)return originalClickOrder.apply(this,arguments);
  };

  window.editOrder=function(orderId,sheetName){
    closeOrderDetailOverlayNow();

    if(typeof window.loadOrderIntoCart==='function'){
      window.loadOrderIntoCart(orderId,sheetName,{switchToSale:true,showSuccessToast:true});
    }else if(originalEditOrder){
      originalEditOrder(orderId,sheetName);
    }

    // Mobile: sau khi bấm Sửa từ popup chi tiết, giữ phiên sửa và mở Giỏ.
    // Người dùng có thể bấm X để đóng sheet Giỏ, rồi sửa/thêm/xóa sản phẩm ở tab Bán hàng.
    if(typeof window.openCartMobile==='function'){
      setTimeout(()=>window.openCartMobile(),360);
    }
  };
})();
