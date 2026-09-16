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

/* Hoàn/đảo đơn vẫn tính vào số dư nhưng là nghiệp vụ ẩn, không vẽ thành giao dịch. */
openCustomerDebtModal = function(maKh) {
  if (!hasPermission('canViewDebt')) return denyPermission('Tài khoản này không được xem Công nợ.');
  activeDebtCustomerId = maKh;
  const kh = appData.khachhang.slice(1).find(r => String(r[0]) === String(maKh));
  if (!kh) return;
  const tenKh = kh[1];
  const history = (window.customerDebtHistoryData && window.customerDebtHistoryData[maKh]) ? window.customerDebtHistoryData[maKh] : [];
  const visibleHistory = history.filter(h => h.entryType !== 'reversal' && !/^Hoàn đơn\b/i.test(String(h.loaiGd || '')));

  document.getElementById('cDebtModalName').innerText = 'KH: ' + tenKh;
  const storedBalance = window.customerDebtCurrentBalanceData?.[maKh];
  const currentTotalDebt = Number.isFinite(Number(storedBalance))
    ? Number(storedBalance)
    : (history.length > 0 ? Number(history[history.length - 1].currentDebt) || 0 : 0);
  const totalEl = document.getElementById('cDebtModalTotal');
  totalEl.innerText = currentTotalDebt.toLocaleString('vi-VN') + ' đ';
  totalEl.className = `text-[18px] font-extrabold ${currentTotalDebt >= 0 ? 'text-danger' : 'text-success'}`;

  let html = '';
  visibleHistory.slice().reverse().forEach(h => {
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
  if (visibleHistory.length === 0) html = '<p class="text-center text-gray-400 py-6 text-xs">Chưa có lịch sử giao dịch</p>';
  document.getElementById('cDebtModalHistoryList').innerHTML = html;

  document.getElementById('customerDebtModalWrapper').classList.remove('hidden');
  setTimeout(() => {
    document.getElementById('customerDebtModalWrapper').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('customerDebtBottomSheet').classList.remove('translate-y-full');
  }, 10);
};

clickOrderFromDebt = function(orderId) {
  closeCustomerDebtModal();
  const sheetName = String(orderId).startsWith('DG') ? 'dongiao' : 'dontam';
  viewingOrderId = orderId;
  window.activeViewingSheet = sheetName;
  setTimeout(() => showOrderDetailMobile(orderId, sheetName), 320);
};
