/* Món vừa chọn/tăng gần nhất luôn đứng đầu giỏ. */
let __cartTouchSeq = 0;
updateCart = function(maSp, tenSp, giaBan, change) {
  if (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') return;
  if (!cart[maSp]) cart[maSp] = { name: tenSp, price: giaBan, qty: 0, __lastTouched: 0 };
  cart[maSp].qty += change;
  if (change > 0) cart[maSp].__lastTouched = ++__cartTouchSeq;
  if (cart[maSp].qty <= 0) {
    delete cart[maSp];
  }
  renderProductList();
  renderCartUI();
};
