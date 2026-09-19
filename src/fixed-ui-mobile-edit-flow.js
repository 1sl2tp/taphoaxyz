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

  const originalEditOrder=typeof window.editOrder==='function' ? window.editOrder : null;

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
