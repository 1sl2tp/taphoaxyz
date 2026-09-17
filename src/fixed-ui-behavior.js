/* Sản phẩm mới thêm vào giỏ lên đầu; đổi số lượng không làm đổi thứ tự. */
let __cartTouchSeq = 0;
updateCart = function(maSp, tenSp, giaBan, change) {
  if (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') return;
  const wasInCart = Boolean(cart[maSp]);
  if (!cart[maSp]) cart[maSp] = { name: tenSp, price: giaBan, qty: 0, __lastTouched: 0 };
  cart[maSp].qty += change;
  if (!wasInCart && change > 0) cart[maSp].__lastTouched = ++__cartTouchSeq;
  if (cart[maSp].qty <= 0) {
    delete cart[maSp];
  }
  renderProductList();
  renderCartUI();
};

function parseCartPriceInputValue(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

function formatCartPriceInputValue(value) {
  return parseCartPriceInputValue(value).toLocaleString('vi-VN');
}

function selectCartPriceInputValue(input) {
  if (!input) return;
  requestAnimationFrame(() => {
    try { input.select(); } catch (e) {}
  });
}

function syncCartPriceToQtyEditors(maSp, price) {
  document.querySelectorAll('[data-qty-id]').forEach(el => {
    if (String(el.dataset.qtyId) === String(maSp)) el.dataset.qtyPrice = String(price);
  });
}

function previewCartPriceInput(input) {
  if (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') return;
  if (!input) return;
  const maSp = input.dataset.priceId;
  const item = cart[maSp];
  if (!maSp || !item) return;
  const raw = String(input.value || '').trim();
  if (raw === '') return;
  const price = parseCartPriceInputValue(raw);
  item.price = price;
  input.value = formatCartPriceInputValue(price);
  syncCartPriceToQtyEditors(maSp, price);
  const row = input.closest('.cart-compact-grid');
  const totalEl = row?.querySelector('.cart-total');
  if (totalEl) totalEl.innerText = ((Number(item.qty) || 0) * price).toLocaleString('vi-VN');
  refreshCartTotalsOnly();
}

function commitCartPriceEditor(input) {
  if (!input) return;
  const maSp = input.dataset.priceId;
  const item = cart[maSp];
  if (!maSp || !item) return;
  if (String(input.value || '').trim() === '') {
    input.value = formatCartPriceInputValue(item.price);
    return;
  }
  previewCartPriceInput(input);
}

const __fixedGetQtyMeta = getQtyMeta;
getQtyMeta = function(maSp, input) {
  const existing = cart[maSp];
  const existingPrice = Number(existing?.price);
  const meta = __fixedGetQtyMeta(maSp, input);
  if (existing && Number.isFinite(existingPrice)) meta.price = existing.price;
  return meta;
};

const __fixedRenderCartUI = renderCartUI;
renderCartUI = function() {
  __fixedRenderCartUI();
  if (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') return;

  const cartEntries = Object.entries(cart).sort(([, a], [, b]) =>
    (Number(b.__lastTouched) || 0) - (Number(a.__lastTouched) || 0)
  );
  const rows = Array.from(document.querySelectorAll('#cartItemList .cart-compact-grid'));
  rows.forEach((row, index) => {
    const [maSp, item] = cartEntries[index] || [];
    const priceCell = row.querySelector('.cart-price');
    if (!maSp || !item || !priceCell) return;
    priceCell.innerHTML = `<input type="text" inputmode="numeric" value="${formatCartPriceInputValue(item.price)}" data-price-editor="cart" data-price-id="${maSp}" onfocus="selectCartPriceInputValue(this)" onmouseup="event.preventDefault(); selectCartPriceInputValue(this)" oninput="previewCartPriceInput(this)" onblur="commitCartPriceEditor(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}" class="w-full min-w-0 text-right font-semibold text-gray-700 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 p-0 m-0 tabular-nums">`;
  });
};

/* Backend trả đơn mới nhất trước. Sau renderer gốc, đưa card về đúng thứ tự đó. */
function stabilizeNewestOrderCards(sheetName, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rows = typeof getRowsVisibleForOrderTab === 'function'
    ? getRowsVisibleForOrderTab(sheetName)
    : ((appData[sheetName] || []).slice(1));
  const desiredIds = [];
  const seen = new Set();
  rows.forEach(row => {
    const id = String(row?.[0] || '').trim();
    if (id && !seen.has(id)) { seen.add(id); desiredIds.push(id); }
  });
  if (!desiredIds.length) return;

  const cards = Array.from(container.children).filter(el => String(el.getAttribute('onclick') || '').includes('clickOrder('));
  const byId = new Map();
  cards.forEach(card => {
    const match = String(card.getAttribute('onclick') || '').match(/clickOrder\('([^']+)'/);
    if (match) byId.set(match[1], card);
  });

  desiredIds.forEach((id, index) => {
    const card = byId.get(id);
    if (!card) return;
    container.appendChild(card);
    const numberBadge = card.querySelector('.pointer-events-none > div:first-child');
    if (numberBadge) numberBadge.textContent = String(desiredIds.length - index);
  });
}

const __fixedRenderDonTam = renderDonTam;
renderDonTam = function() {
  __fixedRenderDonTam();
  stabilizeNewestOrderCards('dontam', 'pendingOrderListContainer');
};

const __fixedRenderDaGiao = renderDaGiao;
renderDaGiao = function() {
  __fixedRenderDaGiao();
  stabilizeNewestOrderCards('dongiao', 'completedOrderListContainer');
};

function __debtTimeMs(value) {
  const m = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6] || 0)).getTime();
}

/* Ledger API trả mới nhất trước; renderer gốc cần thứ tự thời gian tăng dần để cộng số dư. */
function __normalizeDebtLedgerRows() {
  if (!Array.isArray(appData.thuchi) || appData.thuchi.length <= 1) return;
  const header = appData.thuchi[0];
  const summaryRows = [];
  const groups = new Map();
  appData.thuchi.slice(1).forEach(row => {
    const hasBalanceAfter = String(row?.[5] ?? '') !== '';
    if (!hasBalanceAfter) { summaryRows.push(row); return; }
    const customerId = String(row?.[1] || '');
    if (!groups.has(customerId)) groups.set(customerId, []);
    groups.get(customerId).push(row);
  });
  const ledgerRows = [];
  groups.forEach(rows => {
    rows.sort((a, b) => __debtTimeMs(a?.[4]) - __debtTimeMs(b?.[4]));
    ledgerRows.push(...rows);
  });
  appData.thuchi = [header, ...summaryRows, ...ledgerRows];
}

function __enrichDebtHistoryFromLedger() {
  const histories = window.customerDebtHistoryData || {};
  const balances = window.customerDebtCurrentBalanceData || {};
  const groups = new Map();
  (appData.thuchi || []).slice(1).forEach(row => {
    if (String(row?.[5] ?? '') === '') return;
    const customerId = String(row?.[1] || '');
    if (!groups.has(customerId)) groups.set(customerId, []);
    groups.get(customerId).push(row);
  });
  groups.forEach((rows, customerId) => {
    rows.sort((a, b) => __debtTimeMs(a?.[4]) - __debtTimeMs(b?.[4]));
    histories[customerId] = rows.map(row => ({
      loaiGd: String(row?.[2] || 'Giao dịch'),
      soTien: Number(row?.[3]) || 0,
      time: String(row?.[4] || ''),
      currentDebt: Number(row?.[5]) || 0,
      entryType: String(row?.[6] || ''),
      orderId: String(row?.[7] || ''),
      backendOrderId: String(row?.[8] || '')
    }));
    const latest = histories[customerId][histories[customerId].length - 1];
    if (latest) balances[customerId] = latest.currentDebt;
  });
  window.customerDebtHistoryData = histories;
  window.customerDebtCurrentBalanceData = balances;
}

const __fixedRenderCongNo = renderCongNo;
renderCongNo = function() {
  __normalizeDebtLedgerRows();
  __fixedRenderCongNo();
  __enrichDebtHistoryFromLedger();
};

/* Đơn đã hoàn vẫn giữ trong data/audit nhưng ẩn cả dòng giao và dòng hoàn khỏi lịch sử nhìn thấy. */
openCustomerDebtModal = function(maKh) {
  if (!hasPermission('canViewDebt')) return denyPermission('Tài khoản này không được xem Công nợ.');
  activeDebtCustomerId = maKh;
  const kh = appData.khachhang.slice(1).find(r => String(r[0]) === String(maKh));
  if (!kh) return;
  const tenKh = kh[1];
  const history = (window.customerDebtHistoryData && window.customerDebtHistoryData[maKh]) ? window.customerDebtHistoryData[maKh] : [];
  const reversedBackendOrderIds = new Set(
    history
      .filter(h => h.entryType === 'reversal' && h.backendOrderId)
      .map(h => String(h.backendOrderId))
  );
  const visibleHistory = history.filter(h =>
    h.entryType !== 'reversal' &&
    !/^Hoàn đơn\b/i.test(String(h.loaiGd || '')) &&
    !reversedBackendOrderIds.has(String(h.backendOrderId || ''))
  );

  document.getElementById('cDebtModalName').innerText = 'KH: ' + tenKh;
  const storedBalance = window.customerDebtCurrentBalanceData?.[maKh];
  const currentTotalDebt = Number.isFinite(Number(storedBalance))
    ? Number(storedBalance)
    : (history.length > 0 ? Number(history[history.length - 1].currentDebt) || 0 : 0);
  const totalEl = document.getElementById('cDebtModalTotal');
  totalEl.innerText = currentTotalDebt.toLocaleString('vi-VN');
  totalEl.className = `text-[18px] font-extrabold ${currentTotalDebt >= 0 ? 'text-danger' : 'text-success'}`;

  const displayHistory = visibleHistory.map(h => ({ ...h }));
  let displayRunningDebt = currentTotalDebt;
  for (let i = displayHistory.length - 1; i >= 0; i -= 1) {
    displayHistory[i].currentDebt = displayRunningDebt;
    displayRunningDebt -= Number(displayHistory[i].soTien) || 0;
  }

  let html = '';
  displayHistory.slice().reverse().forEach(h => {
    const isThu = h.soTien < 0;
    const sign = isThu ? '' : '+';
    const badgeColor = isThu ? 'text-success bg-green-50' : 'text-danger bg-red-50';
    const iconClass = isThu ? 'ph-fill ph-arrow-down-left' : 'ph-fill ph-push-pin';
    const orderId = String(h.orderId || (String(h.loaiGd || '').match(/DG\d+|DT\d+/)?.[0] || ''));
    const clickAttr = orderId ? `onclick="clickOrderFromDebt('${orderId}')"` : '';
    const cursorStyle = orderId ? 'cursor-pointer hover:bg-gray-50' : '';

    html += `
    <div ${clickAttr} class="flex justify-between items-center py-2.5 px-2 rounded-xl transition ${cursorStyle} border-b border-gray-100 text-xs">
      <div>
        <p class="font-bold text-gray-900 flex items-center gap-1.5"><i class="${iconClass} ${badgeColor} p-1 rounded"></i> ${h.loaiGd} ${orderId ? '<i class="ph ph-caret-right text-gray-400"></i>' : ''}</p>
        <p class="text-[10px] text-gray-400 mt-0.5">${h.time}</p>
      </div>
      <div class="text-right">
        <p class="font-extrabold ${isThu ? 'text-success' : 'text-danger'}">${sign}${h.soTien.toLocaleString('vi-VN')}</p>
        <p class="text-[10px] text-gray-400 mt-0.5">Nợ ${Number(h.currentDebt || 0).toLocaleString('vi-VN')}</p>
      </div>
    </div>`;
  });
  if (displayHistory.length === 0) html = '<p class="text-center text-gray-400 py-6 text-xs">Chưa có lịch sử giao dịch</p>';
  document.getElementById('cDebtModalHistoryList').innerHTML = html;

  document.getElementById('customerDebtModalWrapper').classList.remove('hidden');
  setTimeout(() => {
    document.getElementById('customerDebtModalWrapper').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('customerDebtBottomSheet').classList.remove('translate-y-full');
  }, 10);
};

clickOrderFromDebt = function(orderId) {
  const sheetName = String(orderId).startsWith('DG') ? 'dongiao' : 'dontam';
  viewingOrderId = orderId;
  window.activeViewingSheet = sheetName;
  showOrderDetailMobile(orderId, sheetName);
};