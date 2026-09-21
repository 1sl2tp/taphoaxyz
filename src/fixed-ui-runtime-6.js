        function renderCartUI() {
            const activeTabId = getActiveTabId();
            const isOrderPreview = !!editingOrderId && !!editingOrderSheet
                && (activeTabId === 'tab-da-giao' || activeTabId === 'tab-don-tam' || activeTabId === 'tab-cong-no')
                && !editingOrderInSaleMode;
            const isDeliveredReadOnlyPreview = (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') || isOrderPreview;
            let totalQty = 0; let totalPrice = 0; let index = 1; let html = '';
            const cartEntries = Object.entries(cart).sort(([, a], [, b]) =>
                (Number(b.__lastTouched) || 0) - (Number(a.__lastTouched) || 0)
            );
            const lineCount = cartEntries.length;
            for (const [id, item] of cartEntries) {
                totalQty += item.qty; totalPrice += (item.qty * item.price);
                html += `
                <div class="cart-compact-grid py-3 border-b border-gray-50 text-[12px]">
                    <div class="cart-left">
                        <div class="cart-stt font-bold text-gray-400">${index++}</div>
                        <div class="min-w-0">
                            <div class="cart-name font-bold text-gray-900 leading-tight">${item.name}</div>
                            <div data-cart-note-id="${escapeProductEditorValue(id)}" class="cart-line-note text-[10px] text-gray-400 mt-0.5 truncate ${String(item.note || '').trim() ? '' : 'hidden'}">${escapeProductEditorValue(String(item.note || '').trim())}</div>
                        </div>
                    </div>
                    <div class="cart-price font-semibold text-gray-700">${item.price.toLocaleString('vi-VN')}</div>
                    <div class="cart-qty">
                        ${isDeliveredReadOnlyPreview
                            ? `<div class="cart-qty-readonly font-bold text-gray-700 text-center tabular-nums">${item.qty}</div>`
                            : `<div class="cart-qty-control border border-gray-200 rounded-full bg-white shadow-sm">
                                <button onclick="updateCart('${id}', '${item.name}', ${item.price}, -1)" class="allow-fast-click w-4 h-4 flex items-center justify-center text-gray-500 hover:text-dark shrink-0"><i class="ph-bold ph-minus text-[8px]"></i></button>
                                <input type="number" value="${item.qty}" min="1" step="1" inputmode="numeric" data-qty-editor="cart" data-qty-id="${id}" data-qty-price="${item.price}" onfocus="selectQtyInputValue(this)" onmouseup="event.preventDefault(); selectQtyInputValue(this)" oninput="previewQtyInput(this)" onblur="commitQtyEditor(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}" class="qty-edit-input w-6 text-center font-bold text-gray-900 bg-transparent focus:outline-none text-[11px]">
                                <button onclick="updateCart('${id}', '${item.name}', ${item.price}, 1)" class="allow-fast-click w-4 h-4 bg-primary text-white rounded-full flex items-center justify-center active:scale-95 shrink-0"><i class="ph-bold ph-plus text-[8px]"></i></button>
                            </div>`}
                    </div>
                    <div class="cart-total font-extrabold text-gray-900">${(item.qty * item.price).toLocaleString('vi-VN')}</div>
                </div>`;
            }

            if (totalQty === 0) html = `<div class="py-12 text-center text-gray-400 text-sm flex flex-col items-center"><i class="ph ph-shopping-cart text-4xl mb-2 opacity-40"></i>Giỏ hàng trống</div>`;
            document.getElementById('cartItemList').innerHTML = html;
            
            let strTotal = totalPrice.toLocaleString('vi-VN');
            document.getElementById('headerQuickQty').innerText = totalQty; document.getElementById('headerQuickTotal').innerText = strTotal;
            document.getElementById('cartCountBadgeMob').innerText = totalQty; document.getElementById('cartTotalMob').innerText = strTotal;
            const cartLineCountEl = document.getElementById('cartLineCountDisplay');
            if (cartLineCountEl) cartLineCountEl.innerText = lineCount;
            document.getElementById('cartTotalQtyDisplay').innerText = totalQty;
            document.getElementById('cartTotalPriceDisplay').innerText = strTotal;
            
            if (totalQty > 0) document.getElementById('btnOpenCartMobile').classList.remove('hidden');
            else document.getElementById('btnOpenCartMobile').classList.add('hidden');
            renderCartFooterActions();
        }

        function openCartMobile() {
            if(window.innerWidth >= 768 && document.body.classList.contains('pc-mode')) return;
            document.getElementById('cartModalWrapper').classList.remove('pointer-events-none', 'opacity-0');
            setTimeout(() => document.getElementById('cartBottomSheet').classList.remove('translate-y-full'), 10);
        }
        function closeCartMobile() {
            // Khi đang sửa trên mobile, nút X chỉ đóng sheet Giỏ để người dùng sửa sản phẩm ở Bán hàng.
            // editingOrderInSaleMode: không gọi cancelEditingOrder(); Hủy sửa phải dùng nút Hủy ở footer.

            // Đóng một preview thì bỏ luôn đơn preview; không giữ "đơn gần nhất" trong Giỏ.
            if (editingOrderId && editingOrderSheet && !editingOrderInSaleMode) {
                cart = {};
                editingOrderId = null;
                editingOrderSheet = null;
                viewingOrderId = null;
                window.activeViewingSheet = null;

                const badge = document.getElementById('cartEditBadge');
                if (badge) badge.classList.add('hidden');

                if (currentAuthRole === 'user' && typeof syncUserSelfCustomer === 'function') {
                    syncUserSelfCustomer();
                } else {
                    selectedCustomer = { id: "", name: "Chọn khách" };
                    const customerDisplay = document.getElementById('selectedCustomerDisplay');
                    if (customerDisplay) customerDisplay.innerText = "Chọn khách";
                }

                renderProductList();
                renderCartUI();
                renderCartFooterActions();
            }

            if(window.innerWidth >= 768 && document.body.classList.contains('pc-mode')) return;
            document.getElementById('cartBottomSheet').classList.add('translate-y-full');
            setTimeout(() => document.getElementById('cartModalWrapper').classList.add('pointer-events-none', 'opacity-0'), 300);
        }

        function openCustomerModal(context = 'sale') {
            if (currentAuthRole === 'user' && context === 'sale') {
                syncUserSelfCustomer();
                renderCartFooterActions();
                return;
            }
            customerSelectionContext = context || 'sale';
            const search = document.getElementById('customerSearchInput');
            if (search) search.value = '';
            renderCustomerList();
            document.getElementById('customerModal').classList.remove('pointer-events-none', 'opacity-0');
            document.getElementById('customerBox').classList.remove('scale-95');
        }

        function closeCustomerModal() {
            document.getElementById('customerModal').classList.add('opacity-0', 'pointer-events-none');
            document.getElementById('customerBox').classList.add('scale-95');
        }

        function getAllCustomerRows() {
            const source = (appData.khachhang && appData.khachhang.length > 1)
                ? appData.khachhang
                : ((typeof PREVIEW_SAMPLE_DATA !== 'undefined' && PREVIEW_SAMPLE_DATA.khachhang)
                    ? PREVIEW_SAMPLE_DATA.khachhang
                    : []);
            return source.slice(1).filter(kh => String(kh[4] || '').toLowerCase().trim() === 'user');
        }

        function getUserSelfCustomerRow() {
            if (currentAuthRole !== 'user') return null;
            const rows = getAllCustomerRows();
            if (!rows.length) return null;

            // PREVIEW ONLY: username "user" chưa có auth.uid/customer_id thật.
            // Ưu tiên mapping đã lưu nếu có; nếu chưa có thì dùng khách user đầu tiên của dữ liệu mẫu.
            // Production Supabase: map auth.uid -> customer_id/profile_customer_id, không dựa vào thứ tự dòng.
            const preferredId = localStorage.getItem('APP_USER_CUSTOMER_ID') || sessionStorage.getItem('APP_USER_CUSTOMER_ID') || '';
            return rows.find(kh => String(kh[0]) === String(preferredId)) || rows[0];
        }

        function syncUserSelfCustomer() {
            if (currentAuthRole !== 'user') return false;
            const row = getUserSelfCustomerRow();
            if (!row) return false;

            selectedCustomer = { id: String(row[0]), name: String(row[1] || row[0]) };
            localStorage.setItem('APP_USER_CUSTOMER_ID', selectedCustomer.id);
            sessionStorage.setItem('APP_USER_CUSTOMER_ID', selectedCustomer.id);

            const display = document.getElementById('selectedCustomerDisplay');
            if (display) display.innerText = selectedCustomer.name;

            const trigger = document.getElementById('saleCustomerTrigger');
            if (trigger) {
                trigger.classList.remove('cursor-pointer');
                trigger.classList.add('cursor-default');
                trigger.setAttribute('aria-label', 'Khách hàng của tài khoản: ' + selectedCustomer.name);
            }
            return true;
        }

        function getCustomerRowsVisibleToCurrentRole() {
            const rows = getAllCustomerRows();
            if (currentAuthRole !== 'user') return rows;
            const self = getUserSelfCustomerRow();
            return self ? [self] : [];
        }

        function getRowsVisibleToCurrentRole(sheetRows) {
            if (!Array.isArray(sheetRows) || sheetRows.length <= 1) return [];
            const rows = sheetRows.slice(1);
            if (currentAuthRole !== 'user') return rows;
            const self = getUserSelfCustomerRow();
            if (!self) return [];
            const selfId = String(self[0]);
            return rows.filter(r => String(r[1]) === selfId);
        }

        function getCustomerRowsForSelector() {
            return getCustomerRowsVisibleToCurrentRole().slice().sort((a, b) => String(a[1] || '').localeCompare(
                String(b[1] || ''),
                'vi',
                { sensitivity: 'base' }
            ));
        }

        function customerInitials(name) {
            const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
            if (!parts.length) return '?';
            return parts.slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase();
        }

        function customerAvatarMarkup(kh) {
            const avatarUrl = String(kh[5] || '').trim();
            const initials = escapeProductEditorValue(customerInitials(kh[1] || kh[2] || kh[0]));
            if (!avatarUrl) {
                return `<span class="customer-avatar w-10 h-10 rounded-full bg-primaryLight text-primary border border-primary/10 flex items-center justify-center text-[11px] font-extrabold shrink-0">${initials}</span>`;
            }
            const safeUrl = escapeProductEditorValue(avatarUrl);
            return `<span class="relative w-10 h-10 shrink-0">
                <img class="customer-avatar w-10 h-10 rounded-full object-cover bg-gray-100 border border-gray-100" src="${safeUrl}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <span class="customer-avatar absolute inset-0 rounded-full bg-primaryLight text-primary border border-primary/10 items-center justify-center text-[11px] font-extrabold" style="display:none">${initials}</span>
            </span>`;
        }

        function renderCustomerList() {
            const list = document.getElementById('customerSelectList');
            if (!list) return;

            const query = normalizeSearchText(document.getElementById('customerSearchInput')?.value || '');
            const queryTokens = query ? query.split(' ').filter(Boolean) : [];
            const rows = getCustomerRowsForSelector().filter(kh => {
                if (!queryTokens.length) return true;
                const haystack = normalizeSearchText(`${kh[1] || ''} ${kh[2] || ''} ${kh[0] || ''}`);
                return queryTokens.every(token => haystack.includes(token));
            });
            if (!rows.length) {
                list.innerHTML = `<p class="text-center text-gray-400 py-8 text-xs">${query ? 'Không tìm thấy khách hàng.' : 'Chưa có khách hàng.'}</p>`;
                return;
            }

            const currentId = customerSelectionContext === 'debt'
                ? (document.getElementById('quickDebtCustomer')?.value || '')
                : (selectedCustomer.id || '');

            list.innerHTML = rows.map(kh => {
                const active = String(kh[0]) === String(currentId);
                const customerCode = kh[2] || kh[0];
                return `
                    <button type="button" onclick="selectCustomer('${kh[0]}', '${kh[1]}')" class="allow-fast-click w-full p-3 rounded-xl border ${active ? 'border-primary bg-primaryLight' : 'border-gray-100 bg-white hover:bg-gray-50'} cursor-pointer flex justify-between items-center transition text-left">
                        <span class="pointer-events-none min-w-0 flex items-center gap-3 flex-1">
                            ${customerAvatarMarkup(kh)}
                            <span class="min-w-0 flex-1">
                                <span class="block font-bold text-sm text-gray-900 truncate">${kh[1]}</span>
                                <span class="block text-xs text-gray-400 mt-0.5 truncate">Mã: ${customerCode}</span>
                            </span>
                        </span>
                        ${active ? '<i class="ph-fill ph-check-circle text-primary text-[16px] pointer-events-none ml-2"></i>' : ''}
                    </button>`;
            }).join('');
        }

        function selectCustomer(id, name) {
            if (customerSelectionContext === 'debt') {
                const hidden = document.getElementById('quickDebtCustomer');
                const display = document.getElementById('quickDebtCustomerDisplay');
                if (hidden) hidden.value = id;
                if (display) display.innerText = name;
                closeCustomerModal();
                return;
            }

            const previousCustomerId = String(selectedCustomer?.id || '');
            const nextCustomerId = String(id || '');
            const isDifferentCustomer = !!previousCustomerId && previousCustomerId !== nextCustomerId;

            if (isDifferentCustomer) {
                cart = {};
                editingOrderId = null;
                editingOrderSheet = null;
                editingOrderInSaleMode = false;
                viewingOrderId = null;
                window.activeViewingSheet = null;
                const badge = document.getElementById('cartEditBadge');
                if (badge) badge.classList.add('hidden');
            }

            selectedCustomer = { id, name };
            document.getElementById('selectedCustomerDisplay').innerText = name;
            renderProductList();
            renderCartUI();
            renderCartFooterActions();
            closeCustomerModal();

            if (isDifferentCustomer) {
                showToast('Đã đổi khách và xóa dữ liệu nhập cũ.', 'success');
            }
        }

        // ==========================================
        // 5. XỬ LÝ ĐẨY ĐƠN & LẬP PHIẾU NHANH CÔNG NỢ
        // ==========================================
