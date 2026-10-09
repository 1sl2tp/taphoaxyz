        // UI-117: header and scrolling rows must have the same CONTENT
        // width. The list alone owns the vertical scrollbar. Reserve its
        // measured width on the non-scrolling header (never shift cells).
        function syncCartHeaderScrollbar() {
            const sheet = document.getElementById('cartBottomSheet');
            const body = document.getElementById('cartItemList');
            if (!sheet || !body) return;
            const style = window.getComputedStyle(body);
            const borders = (parseFloat(style.borderLeftWidth) || 0)
                + (parseFloat(style.borderRightWidth) || 0);
            const gutter = Math.max(0, Math.round(body.offsetWidth - body.clientWidth - borders));
            const value = gutter + 'px';
            if (sheet.style.getPropertyValue('--cart-scrollbar-inset') !== value) {
                sheet.style.setProperty('--cart-scrollbar-inset', value);
            }
            // One observer attached to the scroll owner, not to rows.
            // A scrollbar appearing changes the scrollport content box.
            if (!body.__cartHeaderScrollbarObserver && typeof ResizeObserver === 'function') {
                body.__cartHeaderScrollbarObserver = new ResizeObserver(() => {
                    syncCartHeaderScrollbar();
                });
                body.__cartHeaderScrollbarObserver.observe(body);
            }
        }


        // Explicit admin action. Never refresh snapshots on open, idle or render.
        let cartPriceRefreshInFlight = false;
        async function refreshEditedOrderPrices() {
            const orderId = String(editingOrderId || '');
            const sourceSheet = editingOrderSheet;
            const isDraft = sourceSheet === 'dontam';
            const allowed = !!orderId && (isDraft || sourceSheet === 'dongiao')
                && editingOrderInSaleMode && currentAuthRole !== 'user'
                && window.TAPHOA_PRODUCTION?.getAccessMode?.() === 'account';
            if (!allowed || cartPriceRefreshInFlight || !Object.keys(cart).length) return;
            cartPriceRefreshInFlight = true;
            const button = document.getElementById('cartRefreshPricesButton');
            if (button) button.disabled = true;
            try {
                const state = await window.TAPHOA_PRODUCTION.refresh(['products']);
                if (!Array.isArray(state?.products)) throw new Error('Không đọc được danh mục giá hiện tại.');
                const catalog = new Map(state.products.map(p => [
                    String(p?.id ?? p?.maSP ?? p?.product_code ?? ''), p
                ]));
                const updates = [];
                for (const [id, line] of Object.entries(cart)) {
                    const p = catalog.get(String(id));
                    const saleRaw = p?.gia ?? p?.price ?? p?.unit_price;
                    const costRaw = p?.von ?? p?.cost ?? p?.unit_cost;
                    const sale = Number(saleRaw);
                    const cost = Number(costRaw);
                    if (!p || p.is_active === false
                        || saleRaw === null || saleRaw === undefined || saleRaw === ''
                        || costRaw === null || costRaw === undefined || costRaw === ''
                        || !Number.isFinite(sale) || sale <= 0
                        || !Number.isFinite(cost) || cost < 0) {
                        throw new Error('Sản phẩm ' + (line.name || id)
                            + ' chưa có đủ giá vốn và giá bán hợp lệ. Giỏ hàng chưa thay đổi.');
                    }
                    updates.push([id, sale]);
                }
                if (orderId !== String(editingOrderId || '')
                    || !editingOrderInSaleMode || editingOrderSheet !== sourceSheet) return;
                // Same order and line identities; no DB mutation until explicit Save.
                // Delivered orders keep frozen historical costs on normal save.
                for (const [id, price] of updates) cart[id].price = price;
                window.__TAPHOA_REPRICE_DRAFT_ID = isDraft ? orderId : null;
                renderCartUI();
                renderProductList();
                showToast(isDraft
                    ? 'Đã lấy giá vốn + giá bán mới cho ' + updates.length
                      + ' sản phẩm. Bấm Cập nhật đơn để lưu.'
                    : 'Đã lấy giá bán mới cho ' + updates.length
                      + ' sản phẩm. Giá vốn đã giao giữ nguyên; lưu sẽ điều chỉnh tổng đơn, công nợ và có thể thông báo khách.', 'success');
            } catch (error) {
                showAlertPopup('Không thể cập nhật giá', error?.message || 'Vui lòng thử lại.');
            } finally {
                cartPriceRefreshInFlight = false;
                const current = document.getElementById('cartRefreshPricesButton');
                if (current) current.disabled = false;
            }
        }

        function renderCartUI() {
            const activeTabId = getActiveTabId();
            const isOrderPreview = !!editingOrderId && !!editingOrderSheet
                && (activeTabId === 'tab-da-giao' || activeTabId === 'tab-don-tam' || activeTabId === 'tab-cong-no')
                && !editingOrderInSaleMode;
            const isDeliveredReadOnlyPreview = (currentAuthRole === 'user' && editingOrderSheet === 'dongiao') || isOrderPreview;
            // Header and rows must use the same five-column ruler in each mode.
            // Read-only quantity needs a number only; editing reserves room for -/+.
            const cartSheet = document.getElementById('cartBottomSheet');
            const editBadge = document.getElementById('cartEditBadge');
            if (editBadge?.parentElement) {
                editBadge.parentElement.classList.add('cart-edit-header-group');
                let priceButton = document.getElementById('cartRefreshPricesButton');
                if (!priceButton) {
                    priceButton = document.createElement('button');
                    priceButton.id = 'cartRefreshPricesButton';
                    priceButton.type = 'button';
                    priceButton.className = 'cart-price-refresh hidden';
                    priceButton.textContent = 'Giá mới';
                    priceButton.addEventListener('click', refreshEditedOrderPrices);
                    editBadge.insertAdjacentElement('afterend', priceButton);
                }
                const isDraftEdit = editingOrderSheet === 'dontam';
                const isDeliveredEdit = editingOrderSheet === 'dongiao';
                priceButton.setAttribute('aria-label', isDraftEdit
                    ? 'Cập nhật giá vốn và giá bán cho đơn tạm'
                    : 'Cập nhật giá bán cho đơn đã giao, giữ vốn lịch sử; lưu sẽ điều chỉnh công nợ');
                priceButton.title = isDraftEdit ? 'Cập nhật giá vốn và giá bán của đơn tạm'
                    : 'Cập nhật giá bán; giữ giá vốn cũ, lưu sẽ tính lại công nợ';
                const visible = !!editingOrderId && (isDraftEdit || isDeliveredEdit)
                    && editingOrderInSaleMode && currentAuthRole !== 'user'
                    && window.TAPHOA_PRODUCTION?.getAccessMode?.() === 'account';
                priceButton.classList.toggle('hidden', !visible);
                priceButton.disabled = cartPriceRefreshInFlight;
            }
            if (cartSheet) {
                cartSheet.dataset.cartMode = isDeliveredReadOnlyPreview ? 'preview' : 'edit';
                const qtyHeader = cartSheet.querySelector('.cart-column-header .cart-qty');
                if (qtyHeader) qtyHeader.textContent = isDeliveredReadOnlyPreview ? 'SL' : 'Số lượng';
            }
            let totalQty = 0; let totalPrice = 0; let index = 1; let html = '';
            const cartEntries = Object.entries(cart).sort(([, a], [, b]) =>
                (Number(b.__lastTouched) || 0) - (Number(a.__lastTouched) || 0)
            );
            // Reserve the largest displayed amounts once, for header and
            // every row. Price ends at its track edge; total starts at its edge.
            // Thus the visible gap on each side of the centered quantity is equal.
            if (cartSheet) {
                const formattedLen = (value) => Number(value || 0).toLocaleString('vi-VN').length;
                const unitChars = Math.max(1, ...cartEntries.map(([, item]) => formattedLen(item.price)));
                const totalChars = Math.max(1, ...cartEntries.map(([, item]) => formattedLen((Number(item.price) || 0) * (Number(item.qty) || 0))));
                // Readonly has no +/- buttons: let the 'SL' header and largest
                // displayed quantity determine width instead of reserving 50px.
                const qtyChars = Math.max(1, ...cartEntries.map(([, item]) => formattedLen(item.qty)));
                cartSheet.style.setProperty('--cart-qty-readonly-track',
                    Math.max(32, Math.ceil(qtyChars * 8 + 8)) + 'px');
                cartSheet.style.setProperty('--cart-unit-track', Math.max(54, Math.ceil(unitChars * 7.2 + 8)) + 'px');
                cartSheet.style.setProperty('--cart-total-track', Math.max(69, Math.ceil(totalChars * 7.2 + 8)) + 'px');
            }
            const lineCount = cartEntries.length;
            for (const [id, item] of cartEntries) {
                totalQty += item.qty; totalPrice += (item.qty * item.price);
                html += `
                <div class="cart-compact-grid py-3 border-b border-gray-50 text-[12px]" data-cart-readonly="${isDeliveredReadOnlyPreview ? '1' : '0'}">
                    <div class="cart-left">
                        <div class="cart-stt font-bold text-gray-400">${index++}</div>
                        <div class="min-w-0">
                            <button type="button"
                                class="allow-fast-click cart-name cart-name-note-trigger font-bold text-gray-900 leading-tight text-left"
                                data-cart-note-id="${escapeProductEditorValue(id)}"
                                data-note-current="${escapeProductEditorValue(String(item.note || '').trim())}"
                                data-cart-product-name="${escapeProductEditorValue(item.name)}"
                                aria-label="Xem ghi chú sản phẩm ${escapeProductEditorValue(item.name)}"
                                onclick="openCartLineNoteEditor(this)">${escapeProductEditorValue(item.name)}</button>
                        </div>
                    </div>
                    <div class="cart-qty">
                        <span class="cart-field-caption">Số lượng</span>
                        ${isDeliveredReadOnlyPreview
                            ? `<div class="cart-qty-readonly font-bold text-gray-700 text-center tabular-nums">${item.qty}</div>`
                            : `<div class="cart-qty-control border border-gray-200 rounded-full bg-white">
                                <button onclick="updateCart('${id}', '${item.name}', ${item.price}, -1)" class="allow-fast-click w-4 h-4 flex items-center justify-center text-gray-500 hover:text-dark shrink-0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/></svg></button>
                                <input type="number" value="${item.qty}" min="1" step="1" inputmode="numeric" data-qty-editor="cart" data-qty-id="${id}" data-qty-price="${item.price}" onfocus="selectQtyInputValue(this)" onmouseup="event.preventDefault(); selectQtyInputValue(this)" oninput="previewQtyInput(this)" onblur="commitQtyEditor(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}" class="qty-edit-input w-6 text-center font-bold text-gray-900 bg-transparent focus:outline-none text-[11px]">
                                <button onclick="updateCart('${id}', '${item.name}', ${item.price}, 1)" class="allow-fast-click w-4 h-4 rounded-full flex items-center justify-center shrink-0" aria-label="Tăng số lượng"><svg class="cart-plus-circle" viewBox="0 0 32 32" width="30" height="30" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><circle cx="16" cy="16" r="15.5" fill="#16a34a"/><path d="M10 16h12M16 10v12" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg></button>
                            </div>`}
                    </div>
                    <div class="cart-price font-semibold text-gray-700"><span class="cart-field-caption">Đơn giá</span><span class="cart-money-value">${item.price.toLocaleString('vi-VN')}</span></div>
                    <div class="cart-total font-extrabold text-gray-900"><span class="cart-field-caption">Thành tiền</span><span class="cart-money-value">${(item.qty * item.price).toLocaleString('vi-VN')}</span></div>
                </div>`;
            }

            if (totalQty === 0) html = `<div class="py-12 text-center text-gray-400 text-sm flex flex-col items-center"><i class="ph ph-shopping-cart text-4xl mb-2 opacity-40"></i>Giỏ hàng trống</div>`;
            document.getElementById('cartItemList').innerHTML = html;
            syncCartHeaderScrollbar();

            // Single intrinsic-width ruler, like spreadsheet columns A–E:
            // the longest header/data content owns each column width.
            // Names take their natural maximum width up to available space,
            // then ellipsize. Quantity includes the FULL +/- control in edit.
            if (cartSheet) {
                const header = cartSheet.querySelector('.cart-column-header');
                const body = document.getElementById('cartItemList');
                if (header && body) {
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext && canvas.getContext('2d');
                    const getStyle = (node) => node ? window.getComputedStyle(node) : null;
                    const measure = (value, node) => {
                        const style = getStyle(node);
                        let text = String(value ?? '');
                        if (style?.textTransform === 'uppercase') text = text.toLocaleUpperCase('vi-VN');
                        if (style?.textTransform === 'lowercase') text = text.toLocaleLowerCase('vi-VN');
                        if (!context || !style) return text.length * 8;
                        context.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily]
                            .filter(Boolean).join(' ');
                        const tracking = Number.parseFloat(style.letterSpacing);
                        const addedSpace = Number.isFinite(tracking) ? Math.max(0, text.length - 1) * tracking : 0;
                        return context.measureText(text).width + addedSpace;
                    };
                    const head = (selector) => header.querySelector(selector);
                    const numberStyle = body.querySelector('.cart-price .cart-money-value') || head('.cart-price');
                    const totalStyle = body.querySelector('.cart-total .cart-money-value') || head('.cart-total');
                    const sttStyle = body.querySelector('.cart-stt') || head('.cart-stt');
                    const qtyStyle = body.querySelector('.cart-qty-readonly') || head('.cart-qty');
                    const maxWidth = (values, node) => Math.ceil(Math.max(0, ...values.map(v => measure(v, node))));
                    const priceTexts = cartEntries.map(([, item]) => Number(item.price || 0).toLocaleString('vi-VN'));
                    const amountTexts = cartEntries.map(([, item]) =>
                        ((Number(item.qty) || 0) * (Number(item.price) || 0)).toLocaleString('vi-VN'));
                    const quantityTexts = cartEntries.map(([, item]) => Number(item.qty || 0).toLocaleString('vi-VN'));
                    const indexTexts = cartEntries.map((_, idx) => String(idx + 1));
                    const columnWidth = (label, headerNode, values, valueNode, padding) =>
                        Math.ceil(Math.max(measure(label, headerNode), maxWidth(values, valueNode)) + padding);
                    const sttWidth = columnWidth('STT', head('.cart-stt'), indexTexts, sttStyle, 6);
                    // B/Tên receives all free space between left ID and right metrics.
                    // UI-111/112: C=SL, D=Đơn giá, E=Thành tiền.
                    // Unit-price caption follows the widest VALUE, just like
                    // the adaptive final-money caption. Keep the full meaning
                    // accessible via title/aria-label even when shortened.
                    const priceHead = head('.cart-price');
                    const widestPrice = maxWidth(priceTexts, numberStyle);
                    const priceLabels = ['Đơn giá', 'Đ.giá', 'Giá', 'ĐG'];
                    const priceLabel = !cartEntries.length ? 'Đơn giá'
                        : priceLabels.find(label => measure(label,priceHead) <= widestPrice) || 'ĐG';
                    if (priceHead) {
                        priceHead.textContent = priceLabel;
                        priceHead.title = 'Đơn giá';
                        priceHead.setAttribute('aria-label','Đơn giá');
                    }
                    const priceWidth = Math.ceil(Math.max(widestPrice,measure(priceLabel,priceHead))+2);
                    // UI-108: LAST MONEY column is sized by its largest NUMBER,
                    // never stretched merely to hold the long "Thành tiền" caption.
                    // Choose the longest semantic caption that fits that number;
                    // if the amount is unusually short, "TT" is the minimum label.
                    const totalHead = head('.cart-total');
                    // DOM glyph bounds include real tabular-number glyph advances,
                    // font loading and fractional widths. Canvas remains a
                    // fallback for a hidden/not-yet-painted preview.
                    const renderedGlyphWidth = node => {
                        if (!node || !document.createRange) return 0;
                        try {
                            const range = document.createRange();
                            range.selectNodeContents(node);
                            return Math.max(0, range.getBoundingClientRect().width);
                        } catch (_) { return 0; }
                    };
                    const visibleMoneyWidths = Array.from(
                        body.querySelectorAll('.cart-total .cart-money-value'),
                        renderedGlyphWidth
                    ).filter(width => width > 0);
                    const widestAmount = visibleMoneyWidths.length
                        ? Math.max(...visibleMoneyWidths)
                        : maxWidth(amountTexts, totalStyle);
                    const totalLabelOptions = ['Thành tiền', 'T.tiền', 'Tiền', 'TT'];
                    const totalLabel = !cartEntries.length
                        ? 'Thành tiền'
                        : totalLabelOptions.find(label => measure(label, totalHead) <= widestAmount) || 'TT';
                    if (totalHead && totalHead.textContent !== totalLabel) {
                        totalHead.textContent = totalLabel;
                        totalHead.title = 'Thành tiền';
                        totalHead.setAttribute('aria-label', 'Thành tiền');
                    }
                    // UI-109: the RIGHTMOST column has no trailing inner gutter.
                    // The former "+8" reserved empty space to the LEFT of its
                    // right-aligned digits, making price -> qty look tighter
                    // than qty -> amount even when both amounts have 3 digits.
                    // Keep one common E track across header and EVERY row;
                    // no per-row shift, so SL and +/- controls remain aligned.
                    const totalWidth = Math.ceil(Math.max(
                        widestAmount,
                        renderedGlyphWidth(totalHead) || measure(totalLabel, totalHead)
                    ));
                    const qtyInput = body.querySelector('.cart-qty-control > input');
                    const qtyInputWidth = Math.max(28, maxWidth(quantityTexts, qtyInput || qtyStyle) + 12);
                    // Two 30px buttons + editable number + 2 one-pixel gaps,
                    // 4px internal padding + 2px border, i.e. 96px for 1 digit.
                    const controlWidth = 30 + qtyInputWidth + 30 + 2 + 4 + 2;
                    const qtyWidth = isDeliveredReadOnlyPreview
                        ? columnWidth('SL', head('.cart-qty'), quantityTexts, qtyStyle, 8)
                        : Math.max(controlWidth, columnWidth('Số lượng', head('.cart-qty'), [], qtyStyle, 8));
                    // CSS 1fr name track also adapts when the panel resizes.
                    cartSheet.style.setProperty('--cart-stt-track', sttWidth + 'px');
                    cartSheet.style.setProperty('--cart-unit-track', priceWidth + 'px');
                    cartSheet.style.setProperty('--cart-qty-input-track', qtyInputWidth + 'px');
                    cartSheet.style.setProperty('--cart-qty-track', qtyWidth + 'px');
                    cartSheet.style.setProperty('--cart-total-track', totalWidth + 'px');
                    // UI-107: preserve product names if full +/- controls and
                    // long amounts leave almost no space for description.
                    // Only edit rows switch to two lines; the numeric C/D/E
                    // tracks and their captions still share the SAME ruler.
                    const captionLayout = getStyle(header);
                    const px = (value) => Number.parseFloat(value) || 0;
                    const innerWidth = Math.max(0, header.clientWidth
                        - px(captionLayout?.paddingLeft)
                        - px(captionLayout?.paddingRight));
                    // A 6px reserve is conservative even if CSS uses 4px
                    // gutters on an ultra-narrow viewport.
                    const gap = 6;
                    const availableName = innerWidth
                        - sttWidth - priceWidth - qtyWidth - totalWidth - 4 * gap;
                    // UI-114: increase the SAME gap for header and every row
                    // only when B/Tên still has enough room. Keep >=110px
                    // free for product names before borrowing up to 20px.
                    const gapExtra = Math.min(5, Math.max(0,
                        Math.floor((availableName - 110) / 22)));
                    cartSheet.style.setProperty('--cart-finance-gap',
                        (gap + gapExtra) + 'px');
                    cartSheet.dataset.compactTwoLine =
                        (!isDeliveredReadOnlyPreview && innerWidth > 0 && availableName < 68)
                            ? '1' : '0';
                    // On resize/orientation change, change only the presentation
                    // flag. No cart rebuild, network request or background timer.
                    if (!cartSheet.__semanticColumnsObserver && typeof ResizeObserver === 'function') {
                        const syncNarrowFlag = () => {
                            const ruler = cartSheet.querySelector('.cart-column-header');
                            if (!ruler) return;
                            const style = getComputedStyle(ruler);
                            const usable = ruler.clientWidth
                                - px(style.paddingLeft) - px(style.paddingRight);
                            const props = getComputedStyle(cartSheet);
                            const track = (name, fallback) =>
                                px(props.getPropertyValue(name)) || fallback;
                            const fixed = track('--cart-stt-track', 24)
                                + track('--cart-unit-track', 54)
                                + track('--cart-qty-track', 96)
                                + track('--cart-total-track', 69) + 24;
                            const freeName = Math.max(0,usable - fixed);
                            const extra = Math.min(5, Math.max(0,
                                Math.floor((freeName - 110) / 22)));
                            const nextGap = (6 + extra) + 'px';
                            if (cartSheet.style.getPropertyValue('--cart-finance-gap') !== nextGap) {
                                cartSheet.style.setProperty('--cart-finance-gap',nextGap);
                            }
                            const next = (cartSheet.dataset.cartMode === 'edit'
                                && usable > 0 && usable - fixed < 68) ? '1' : '0';
                            if (cartSheet.dataset.compactTwoLine !== next) {
                                cartSheet.dataset.compactTwoLine = next;
                            }
                        };
                        cartSheet.__semanticColumnsObserver = new ResizeObserver(syncNarrowFlag);
                        cartSheet.__semanticColumnsObserver.observe(header);
                    }
                    // UI-106: semantic columns. Each column is measured once
                    // from all values + visible label; no per-row horizontal shift.
                    // The data row establishes the visual axis, the label follows.
                    cartSheet.style.setProperty('--cart-numeric-axis-shift', '0px');
                    cartSheet.style.setProperty('--cart-header-axis-shift', '0px');
                }
            }

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
            // Only geometry, no data load. Useful after the sheet becomes visible.
            requestAnimationFrame(syncCartHeaderScrollbar);
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
            closeNewCustomerForm({ focusSearch: false });
            const newButton = document.getElementById('newCustomerButton');
            if (newButton) newButton.classList.toggle('hidden', !(currentAuthRole === 'admin' && customerSelectionContext === 'sale'));

            const search = document.getElementById('customerSearchInput');
            if (search) search.value = '';
            renderCustomerList();
            document.getElementById('customerModal').classList.remove('pointer-events-none', 'opacity-0');
            document.getElementById('customerBox').classList.remove('scale-95');

            if (search) {
                try {
                    search.focus({ preventScroll: true });
                } catch (_) {
                    search.focus();
                }
                requestAnimationFrame(() => {
                    if (document.activeElement !== search) {
                        try {
                            search.focus({ preventScroll: true });
                        } catch (_) {
                            search.focus();
                        }
                    }
                });
            }
        }

        function closeCustomerModal() {
            closeNewCustomerForm({ focusSearch: false });
            document.getElementById('customerModal').classList.add('opacity-0', 'pointer-events-none');
            document.getElementById('customerBox').classList.add('scale-95');
        }

        function setNewCustomerError(message = '') {
            const error = document.getElementById('newCustomerError');
            if (!error) return;
            error.textContent = String(message || '');
            error.classList.toggle('hidden', !message);
        }

        function openNewCustomerForm() {
            if (currentAuthRole !== 'admin' || customerSelectionContext !== 'sale') return;
            const form = document.getElementById('newCustomerForm');
            const input = document.getElementById('newCustomerName');
            const search = document.getElementById('customerSearchInput');
            if (!form || !input) return;
            setNewCustomerError('');
            form.classList.remove('hidden');
            input.value = String(search?.value || '').trim();
            requestAnimationFrame(() => {
                try {
                    input.focus({ preventScroll: true });
                    input.select();
                } catch (_) {
                    input.focus();
                }
            });
        }

        function closeNewCustomerForm({ focusSearch = true } = {}) {
            const form = document.getElementById('newCustomerForm');
            const input = document.getElementById('newCustomerName');
            const saveButton = document.getElementById('newCustomerSaveButton');
            if (form) form.classList.add('hidden');
            if (input) input.value = '';
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = 'Tạo khách';
            }
            setNewCustomerError('');
            if (focusSearch) {
                const search = document.getElementById('customerSearchInput');
                if (search) requestAnimationFrame(() => search.focus({ preventScroll: true }));
            }
        }

        async function submitNewCustomer(event) {
            event?.preventDefault();
            if (currentAuthRole !== 'admin' || customerSelectionContext !== 'sale') return;

            const input = document.getElementById('newCustomerName');
            const saveButton = document.getElementById('newCustomerSaveButton');
            const name = String(input?.value || '').replace(/\s+/g, ' ').trim();
            if (!name) {
                setNewCustomerError('Vui lòng nhập tên khách hàng.');
                input?.focus();
                return;
            }
            if (name.length > 50) {
                setNewCustomerError('Tên khách hàng tối đa 50 ký tự.');
                input?.focus();
                return;
            }

            const bridge = window.TAPHOA_PRODUCTION;
            if (!bridge?.createCustomer || !bridge?.readSheet) {
                setNewCustomerError('Chức năng thêm khách chưa sẵn sàng. Vui lòng tải lại trang.');
                return;
            }

            if (saveButton) {
                saveButton.disabled = true;
                saveButton.textContent = 'Đang tạo...';
            }
            setNewCustomerError('');

            try {
                const result = await bridge.createCustomer(name);
                const rows = await bridge.readSheet('khachhang');
                if (Array.isArray(rows)) appData.khachhang = rows;
                renderCustomerList();

                if (result?.ok === false && result?.error === 'customer_exists' && result?.existing?.id) {
                    const existing = result.existing;
                    closeNewCustomerForm({ focusSearch: false });
                    selectCustomer(String(existing.id), String(existing.name || name));
                    showToast('Khách này đã có, mình đã chọn khách cũ.', 'success');
                    return;
                }

                const customer = result?.customer;
                if (!result?.ok || !customer?.id) throw new Error('customer_create_failed');

                closeNewCustomerForm({ focusSearch: false });
                selectCustomer(String(customer.id), String(customer.name || name));
                showToast('Đã thêm khách mới vào nhóm KH.', 'success');
            } catch (error) {
                console.error(error);
                setNewCustomerError('Không tạo được khách hàng. Vui lòng thử lại.');
                if (saveButton) {
                    saveButton.disabled = false;
                    saveButton.textContent = 'Tạo khách';
                }
            }
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
