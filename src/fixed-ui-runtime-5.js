        function refreshCartTotalsOnly() {
            let totalQty = 0;
            let totalPrice = 0;
            const entries = Object.entries(cart);
            entries.forEach(([, item]) => {
                totalQty += Number(item.qty) || 0;
                totalPrice += (Number(item.qty) || 0) * (Number(item.price) || 0);
            });

            const strTotal = totalPrice.toLocaleString('vi-VN');
            const setText = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.innerText = value;
            };

            setText('headerQuickQty', totalQty);
            setText('headerQuickTotal', strTotal);
            setText('cartCountBadgeMob', totalQty);
            setText('cartTotalMob', strTotal);
            setText('cartLineCountDisplay', entries.length);
            setText('cartTotalQtyDisplay', totalQty);
            setText('cartTotalPriceDisplay', strTotal);

            const quickCart = document.getElementById('btnOpenCartMobile');
            if (quickCart) quickCart.classList.toggle('hidden', totalQty <= 0);
            renderCartFooterActions();
        }


        function syncProductNoteEditorVisibility(maSp, qty) {
            document.querySelectorAll('[data-product-note-wrap]').forEach(wrap => {
                if (String(wrap.dataset.productNoteWrap) !== String(maSp)) return;
                const visible = Number(qty) > 0;
                wrap.classList.toggle('hidden', !visible);
                if (!visible) {
                    const input = wrap.querySelector('[data-line-note-id]');
                    if (input) input.value = '';
                }
            });
        }

        function syncCartItemNoteDisplay(maSp) {
            const note = String(cart[maSp]?.note || '').trim();
            document.querySelectorAll('[data-cart-note-id]').forEach(el => {
                if (String(el.dataset.cartNoteId) !== String(maSp)) return;
                el.textContent = note;
                el.dataset.noteCurrent = note;
            });
            document.querySelectorAll('[data-cart-note-input-id]').forEach(input => {
                if (String(input.dataset.cartNoteInputId) !== String(maSp)) return;
                if (document.activeElement !== input) input.value = note;
                input.dataset.noteCurrent = note;
            });
        }

        function openCartLineNoteEditor(button) {
            if (!button) return;
            if (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') return;
            const wrap = button.closest('[data-cart-line-note-editor]');
            const input = wrap?.querySelector('[data-cart-note-input-id]');
            if (!input) return;
            button.classList.add('hidden');
            input.classList.remove('hidden');
            input.value = String(button.dataset.noteCurrent || '');
            requestAnimationFrame(() => {
                input.focus({ preventScroll: true });
                input.select();
            });
        }

        function previewCartLineNote(input) {
            if (!input) return;
            const maSp = String(input.dataset.cartNoteInputId || '');
            if (!maSp || !cart[maSp]) return;
            cart[maSp].note = String(input.value || '');
            const button = input.closest('[data-cart-line-note-editor]')?.querySelector('[data-cart-note-id]');
            if (button) {
                button.textContent = String(input.value || '').trim();
                button.dataset.noteCurrent = String(input.value || '').trim();
            }
            document.querySelectorAll('[data-line-note-id]').forEach(productInput => {
                if (String(productInput.dataset.lineNoteId) === maSp && document.activeElement !== productInput) {
                    productInput.value = String(input.value || '');
                }
            });
        }

        function commitCartLineNoteEditor(input) {
            if (!input) return;
            const maSp = String(input.dataset.cartNoteInputId || '');
            if (maSp && cart[maSp]) cart[maSp].note = String(input.value || '').trim();
            const wrap = input.closest('[data-cart-line-note-editor]');
            const button = wrap?.querySelector('[data-cart-note-id]');
            if (button) {
                const note = String(cart[maSp]?.note || '');
                button.textContent = note;
                button.dataset.noteCurrent = note;
                button.classList.remove('hidden');
            }
            input.classList.add('hidden');
        }

        function cancelCartLineNoteEditor(input) {
            if (!input) return;
            const maSp = String(input.dataset.cartNoteInputId || '');
            input.value = String(cart[maSp]?.note || '');
            input.classList.add('hidden');
            input.closest('[data-cart-line-note-editor]')?.querySelector('[data-cart-note-id]')?.classList.remove('hidden');
        }

        function previewProductLineNote(input) {
            if (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') return;
            if (!input) return;
            const maSp = input.dataset.lineNoteId;
            if (!maSp || !cart[maSp]) return;
            cart[maSp].note = String(input.value || '');
            syncCartItemNoteDisplay(maSp);
        }

        function previewQtyInput(input) {
            if (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') {
                return;
            }
            if (!input) return;
            const raw = String(input.value || '').trim();
            if (raw === '') return;

            const maSp = input.dataset.qtyId;
            const parsed = Number.parseInt(raw, 10);
            if (!maSp || !Number.isFinite(parsed)) return;

            const qty = Math.max(1, parsed);
            const meta = getQtyMeta(maSp, input);
            const existing = cart[maSp] || {};
            cart[maSp] = { ...existing, name: meta.name, price: meta.price, qty, note: String(existing.note || '') };

            syncQtyEditors(maSp, qty, input);

            if (input.dataset.qtyEditor === 'cart') {
                const row = input.closest('.cart-compact-grid');
                const totalEl = row?.querySelector('.cart-total');
                if (totalEl) totalEl.innerText = (qty * meta.price).toLocaleString('vi-VN');
            }

            refreshCartTotalsOnly();
        }

        function commitQtyEditor(input) {
            if (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') {
                return;
            }
            if (!input) return;
            const maSp = input.dataset.qtyId;
            if (!maSp) return;

            const previousQty = Number(cart[maSp]?.qty) || 1;
            const qty = clampQty(input.value, previousQty);
            input.value = qty;

            const meta = getQtyMeta(maSp, input);
            const existing = cart[maSp] || {};
            cart[maSp] = { ...existing, name: meta.name, price: meta.price, qty, note: String(existing.note || '') };
            syncQtyEditors(maSp, qty, input);

            if (input.dataset.qtyEditor === 'cart') {
                const row = input.closest('.cart-compact-grid');
                const totalEl = row?.querySelector('.cart-total');
                if (totalEl) totalEl.innerText = (qty * meta.price).toLocaleString('vi-VN');
            }

            refreshCartTotalsOnly();
        }

        function updateCart(maSp, tenSp, giaBan, change) {
            if (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') {
                return;
            }
            if (!cart[maSp]) cart[maSp] = { name: tenSp, price: giaBan, qty: 0, note: '' };
            cart[maSp].qty += change;
            if (cart[maSp].qty <= 0) delete cart[maSp];
            const nextQty = cart[maSp]?.qty || 0;
            syncQtyEditors(maSp, nextQty);
            renderCartUI();
        }

        function clearCart() { 
            cart = {};
            editingOrderId = null;
            editingOrderSheet = null;
            editingOrderInSaleMode = false;
            document.getElementById('cartEditBadge').classList.add('hidden');
            renderProductList();
            renderCartUI();
            renderCartFooterActions();
        }

        function getActiveTabId() {
            const active = document.querySelector('.tab-content.active');
            return active ? active.id : 'tab-ban-hang';
        }

        function goToBanHangForEditing() {
            if (!editingOrderId || !editingOrderSheet) return;
            editingOrderInSaleMode = true;
            const badge = document.getElementById('cartEditBadge');
            if (badge) {
                badge.innerText = 'Đang sửa đơn';
                badge.classList.remove('hidden');
            }
            const tabBanHangBtn = document.querySelector('.tab-btn[onclick*="tab-ban-hang"]');
            if (tabBanHangBtn) switchTab('tab-ban-hang', tabBanHangBtn);
            renderProductList();
            renderCartUI();
            renderCartFooterActions();
            showToast('Đã chuyển về Bán hàng để tiếp tục sửa đơn ' + editingOrderId, 'success');
        }

        function cancelEditingOrder() {
            if (!editingOrderId || !editingOrderSheet) return;

            const orderId = editingOrderId;
            const sheetName = editingOrderSheet;
            const targetTabId = sheetName === 'dongiao' ? 'tab-da-giao' : 'tab-don-tam';

            // Hủy = thoát hẳn phiên sửa. Không nạp lại đơn vào Giỏ.
            cart = {};
            editingOrderId = null;
            editingOrderSheet = null;
            editingOrderInSaleMode = false;
            viewingOrderId = null;
            window.activeViewingSheet = null;

            const badge = document.getElementById('cartEditBadge');
            if (badge) {
                badge.innerText = 'Đang sửa đơn';
                badge.classList.add('hidden');
            }

            if (currentAuthRole === 'user' && typeof syncUserSelfCustomer === 'function') {
                syncUserSelfCustomer();
            } else {
                selectedCustomer = { id: "", name: "Chọn khách" };
                const customerDisplay = document.getElementById('selectedCustomerDisplay');
                if (customerDisplay) customerDisplay.innerText = "Chọn khách";
            }

            const targetTabBtn = document.querySelector(`.tab-btn[onclick*="${targetTabId}"]`);
            if (targetTabBtn) switchTab(targetTabId, targetTabBtn);

            renderProductList();
            renderCartUI();
            renderCartFooterActions();

            // Mobile: đóng sheet. PC: cột Giỏ vẫn là workspace nhưng đã sạch, không còn đơn vừa sửa.
            const cartSheet = document.getElementById('cartBottomSheet');
            const cartWrap = document.getElementById('cartModalWrapper');
            if (cartSheet) cartSheet.classList.add('translate-y-full');
            if (cartWrap) {
                setTimeout(() => cartWrap.classList.add('pointer-events-none', 'opacity-0'), 300);
            }

            showToast('Đã hủy sửa đơn ' + orderId, 'success');
        }

        function renderCartFooterActions() {
            const owner = document.getElementById('cartFooterActions');
            if (!owner) return;

            const activeTabId = getActiveTabId();
            const isUser = currentAuthRole === 'user';
            const lineCount = Object.keys(cart).length;
            const hasLoadedOrder = !!editingOrderId && !!editingOrderSheet;
            const isCreatingSaleDraft = activeTabId === 'tab-ban-hang' && lineCount > 0 && !hasLoadedOrder;
            const cartShareOrderBtn = document.getElementById('cartShareOrderBtn');
            if (cartShareOrderBtn) cartShareOrderBtn.classList.toggle('hidden', !(hasLoadedOrder || isCreatingSaleDraft));
            const isUserDeliveredReadOnly = isUser && (activeTabId === 'tab-da-giao' || editingOrderSheet === 'dongiao');

            // User ở Đã giao luôn là read-only: ẩn toàn bộ Xóa/Sửa/Cập nhật/Tạo đơn, kể cả chưa chọn đơn.
            if (isUserDeliveredReadOnly) {
                owner.innerHTML = '';
                owner.classList.add('hidden');
                return;
            }
            owner.classList.remove('hidden');

            const hasItems = lineCount > 0;
            const hasCustomer = !!selectedCustomer.id;
            const isOrderTab = activeTabId === 'tab-da-giao' || activeTabId === 'tab-don-tam';
            const isDebtOrderPreview = activeTabId === 'tab-cong-no' && !!editingOrderId && !!editingOrderSheet;
            const targetSheet = activeTabId === 'tab-da-giao' ? 'dongiao' : (activeTabId === 'tab-don-tam' ? 'dontam' : null);
            const hasSelectedOrder = !!editingOrderId && !!editingOrderSheet && (!targetSheet || editingOrderSheet === targetSheet);

            const canDeleteCart = hasItems;
            const canSaveDraft = hasItems && hasCustomer;
            const canSellNow = !isUser && hasItems && hasCustomer;
            const canDeleteOrder = hasSelectedOrder && (!isUser || editingOrderSheet !== 'dongiao');
            const canSwitchToSale = hasSelectedOrder && (!isUser || editingOrderSheet !== 'dongiao');
            const canUpdateOrder = hasSelectedOrder && hasItems && hasCustomer && (!isUser || editingOrderSheet !== 'dongiao');

            const disabledBtn = 'opacity-40 cursor-not-allowed pointer-events-none';
            const enabledDangerBtn = 'hover:bg-red-50';
            const enabledNeutralBtn = 'hover:bg-gray-50';
            const enabledOutlinePrimaryBtn = 'hover:bg-primaryLight';
            const enabledPrimaryBtn = 'hover:bg-primary/90 shadow-lg shadow-primary/30';

            const isDeliveredOrderCart = hasSelectedOrder && editingOrderSheet === 'dongiao';
            const isPendingOrderCart = hasSelectedOrder && editingOrderSheet === 'dontam';
            const canPromoteDraft = !isUser && isPendingOrderCart && hasItems && hasCustomer;

            const isOrderPreview = hasSelectedOrder && (isOrderTab || isDebtOrderPreview);
            if (isOrderPreview) {
                owner.innerHTML = `
                    <button ${canDeleteOrder ? 'onclick="requestDeleteEditingOrder()"' : 'disabled'} class="px-3 py-3 rounded-xl border border-danger/40 text-danger font-bold transition flex items-center justify-center gap-1 whitespace-nowrap ${canDeleteOrder ? enabledDangerBtn : disabledBtn}">
                        <i class="ph ph-trash"></i> Xóa
                    </button>
                    <button ${canSwitchToSale ? 'onclick="goToBanHangForEditing()"' : 'disabled'} class="flex-1 py-3 rounded-xl border border-primary text-primary font-bold transition flex items-center justify-center gap-1 whitespace-nowrap ${canSwitchToSale ? enabledOutlinePrimaryBtn : disabledBtn}">
                        <i class="ph ph-pencil-simple"></i> Sửa
                    </button>
                    ${!isUser && isPendingOrderCart ? `
                    <button ${canPromoteDraft ? 'onclick="dayToanBoGioHang(\'dongiao\')"' : 'disabled'} class="flex-1 py-3 rounded-xl bg-primary text-white font-bold transition flex items-center justify-center gap-1 whitespace-nowrap ${canPromoteDraft ? enabledPrimaryBtn : disabledBtn}">
                        <i class="ph-fill ph-check-circle"></i> Duyệt
                    </button>` : ''}`;
                return;
            }

            // Đã giao sau khi bấm Sửa: chỉ Hủy hoặc Cập nhật đơn.
            if (isDeliveredOrderCart) {
                owner.innerHTML = `
                    <button onclick="cancelEditingOrder()" class="px-3 py-3 rounded-xl border border-gray-200 text-gray-500 font-bold transition flex items-center justify-center gap-1 whitespace-nowrap hover:bg-gray-50">
                        <i class="ph ph-x"></i> Hủy
                    </button>
                    <button ${canUpdateOrder ? 'onclick="updateExistingOrder()"' : 'disabled'} class="flex-1 py-3 rounded-xl bg-primary text-white font-bold transition flex items-center justify-center gap-1 whitespace-nowrap ${canUpdateOrder ? enabledPrimaryBtn : disabledBtn}">
                        <i class="ph-fill ph-check-circle"></i> Cập nhật đơn
                    </button>`;
                return;
            }

            // Đơn tạm sau khi bấm Sửa: chỉ Hủy hoặc Cập nhật đơn.
            if (isPendingOrderCart) {
                owner.innerHTML = `
                    <button onclick="cancelEditingOrder()" class="px-3 py-3 rounded-xl border border-gray-200 text-gray-500 font-bold transition flex items-center justify-center gap-1 whitespace-nowrap hover:bg-gray-50">
                        <i class="ph ph-x"></i> Hủy
                    </button>
                    <button ${canUpdateOrder ? 'onclick="updateExistingOrder()"' : 'disabled'} class="flex-1 py-3 rounded-xl bg-primary text-white font-bold transition flex items-center justify-center gap-1 whitespace-nowrap ${canUpdateOrder ? enabledPrimaryBtn : disabledBtn}">
                        <i class="ph-fill ph-check-circle"></i> Cập nhật đơn
                    </button>`;
                return;
            }

            // Ở tab đơn nhưng chưa nạp đúng một đơn thì không hiện hành động bán hàng mặc định.
            if (isOrderTab || isDebtOrderPreview) {
                owner.innerHTML = '';
                return;
            }

            owner.innerHTML = `
                <button ${canDeleteCart ? 'onclick="clearCart()"' : 'disabled'} class="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold transition flex items-center justify-center gap-1 ${canDeleteCart ? enabledNeutralBtn : disabledBtn}">
                    <i class="ph ph-trash"></i> Xóa
                </button>
                <button ${canSaveDraft ? 'onclick="dayToanBoGioHang(\'dontam\')"' : 'disabled'} class="flex-1 py-3 rounded-xl border border-primary text-primary font-bold transition flex items-center justify-center gap-1 ${canSaveDraft ? enabledOutlinePrimaryBtn : disabledBtn}">
                    <i class="ph ph-floppy-disk"></i> Đặt
                </button>
                ${!isUser ? `
                <button ${canSellNow ? 'onclick="dayToanBoGioHang(\'dongiao\')"' : 'disabled'} class="flex-1 py-3 rounded-xl bg-primary text-white font-bold transition flex items-center justify-center gap-1 ${canSellNow ? enabledPrimaryBtn : disabledBtn}">
                    <i class="ph-fill ph-check-circle"></i> Bán
                </button>` : ''}`;
        }

        function clearEditingOrderContent() {
            if (!editingOrderId || !editingOrderSheet) return;
            showConfirmModal(
                "Xóa nội dung đơn?",
                `Xóa toàn bộ sản phẩm đang sửa trong đơn ${editingOrderId}? Mã đơn và khách hàng vẫn được giữ để nhập lại.`,
                "Xóa nội dung",
                "bg-danger",
                () => {
                    cart = {};
                    renderProductList();
                    renderCartUI();
                    renderCartFooterActions();
                    showToast("Đã xóa nội dung. Đơn vẫn ở chế độ cập nhật.", "success");
                }
            );
        }

        function requestDeleteEditingOrder() {
            if (!editingOrderId || !editingOrderSheet) return;
            requestDeleteOrder(editingOrderSheet, editingOrderId);
        }

        function updateExistingOrder() {
            if (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') {
                return denyPermission('User không được cập nhật đơn đã giao.');
            }
            if (!editingOrderId || !editingOrderSheet) return;
            dayToanBoGioHang(editingOrderSheet);
        }

        function resetSaleSession() {
            clearCart();
            if (currentAuthRole === 'user' && syncUserSelfCustomer()) {
                renderCartFooterActions();
                return;
            }
            selectedCustomer = { id: "", name: "Chọn khách" };
            document.getElementById('selectedCustomerDisplay').innerText = "Chọn khách";
            renderCartFooterActions();
        }

