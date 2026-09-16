/* Món vừa chọn/tăng gần nhất luôn đứng đầu giỏ. */
updateCart = function(maSp, tenSp, giaBan, change) {
  if (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') return;
  if (!cart[maSp]) cart[maSp] = { name: tenSp, price: giaBan, qty: 0, _touch: 0 };
  cart[maSp].qty += change;
  if (cart[maSp].qty <= 0) {
    delete cart[maSp];
  } else if (change > 0 && typeof touchCartItem === 'function') {
    touchCartItem(maSp);
  }
  renderProductList();
  renderCartUI();
};
