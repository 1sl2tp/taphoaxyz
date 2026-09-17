        function clearUserDeliveredPreviewForEditableTab(tabId) {
            const enteringEditableArea = tabId === 'tab-ban-hang' || tabId === 'tab-don-tam';
            if (currentAuthRole !== 'user' || !enteringEditableArea || editingOrderSheet !== 'dongiao') return;

            // User chỉ được xem Đã giao. Khi rời vùng xem để quay lại vùng có thể thao tác,
            // phải bỏ toàn bộ state của đơn đã giao để không khóa Lưu tạm và không thể sửa nhầm Đã giao.
            cart = {};
            editingOrderId = null;
            editingOrderSheet = null;
            viewingOrderId = null;
            window.activeViewingSheet = null;
            syncUserSelfCustomer();

            const badge = document.getElementById('cartEditBadge');
            if (badge) badge.classList.add('hidden');

            renderProductList();
            renderCartUI();
        }

        function switchTab(tabId, element) {
            clearUserDeliveredPreviewForEditableTab(tabId);

            if (tabId === 'tab-da-giao' && !hasPermission('canViewDelivered')) {
                return denyPermission('User không được xem Đã giao.');
            }
            if (tabId === 'tab-cong-no' && !hasPermission('canViewDebt')) {
                return denyPermission('Công nợ chỉ dành cho Owner.');
            }
            document.querySelectorAll('.tab-btn').forEach(btn => { btn.classList.remove('text-primary', 'border-primary'); btn.classList.add('text-gray-400', 'border-transparent'); });
            element.classList.remove('text-gray-400', 'border-transparent'); element.classList.add('text-primary', 'border-primary');

            if(tabId === 'tab-don-tam') renderDonTam();
            if(tabId === 'tab-da-giao') renderDaGiao();
            if(tabId === 'tab-cong-no') renderCongNo();

            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            renderCartFooterActions();
        }

        function resolveAutoMode() {
            return window.innerWidth < 768 ? 'mobile' : 'pc';
        }

        function updateUiModeControls() {
            const buttons = {
                auto: document.getElementById('btnModeAuto'),
                mobile: document.getElementById('btnModeMobile'),
                pc: document.getElementById('btnModePC')
            };
            Object.entries(buttons).forEach(([key, btn]) => {
                if (!btn) return;
                const active = currentUiMode === key;
                btn.className = `allow-fast-click flex-1 py-2 rounded-lg text-[12px] font-bold transition ${active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 bg-transparent'}`;
            });
        }

        function applyResolvedMode(resolvedMode) {
            const body = document.body;
            const cartWrap = document.getElementById('cartModalWrapper');
            const forcePc = currentUiMode === 'pc';

            if (resolvedMode === 'pc') {
                body.classList.add('pc-mode');
                if (forcePc) body.setAttribute('data-force-pc', '1');
                else body.removeAttribute('data-force-pc');
                document.getElementById('cartBottomSheet')?.classList.add('translate-y-full');
                cartWrap?.classList.add('pointer-events-none', 'opacity-0');
            } else {
                body.classList.remove('pc-mode');
                body.removeAttribute('data-force-pc');
            }

            body.setAttribute('data-ui-mode', currentUiMode);
            body.setAttribute('data-resolved-mode', resolvedMode);
        }

        function setMode(mode, persist = true) {
            currentUiMode = ['auto', 'mobile', 'pc'].includes(mode) ? mode : 'auto';
            const resolvedMode = currentUiMode === 'auto' ? resolveAutoMode() : currentUiMode;
            applyResolvedMode(resolvedMode);
            updateUiModeControls();

            if (persist) {
                localStorage.setItem('APP_UI_MODE_PREF', currentUiMode);
            }
        }

        window.addEventListener('resize', () => {
            if (currentUiMode === 'auto') {
                applyResolvedMode(resolveAutoMode());
                updateUiModeControls();
            }
        });

        function saveAndFetch() { let url = document.getElementById('inputScriptUrl').value.trim(); if(url) { SheetDB.init(url); loadData(); showToast("Đã cập nhật kết nối dữ liệu.", "success"); } }

        let productEditorRows = [];
        let productEditorSourceFilter = 'Tất cả';
        let productEditorCustomSources = [];
        let productEditorActiveRow = null;
        let productEditorSourcePickerRow = null;
        const CORE_PRODUCT_EDITOR_SOURCE_KEYS = new Set(['hang-u','thuoc-la','sua','masan','hang-thuong']);

        function getProductEditorSources() {
            const backendSources = (window.TAPHOA_PRODUCTION?.getState?.()?.sources || [])
                .map(source => String(source?.name || source?.ten || source?.source_name || source?.source_key || '').trim())
                .filter(Boolean);
            const sources = [
                ...backendSources,
                ...productEditorRows.map(r => String(r[4] || '').trim()).filter(Boolean),
                ...productEditorCustomSources.map(v => String(v || '').trim()).filter(Boolean),
            ];
            return Array.from(new Set(sources));
        }

        function productEditorSourceKey(sourceName) {
            const wanted = String(sourceName || '').trim();
            if (!wanted) return '';
            const source = (window.TAPHOA_PRODUCTION?.getState?.()?.sources || []).find(item => {
                const key = String(item?.source_key || item?.key || item?.id || '').trim();
                const name = String(item?.name || item?.ten || key).trim();
                return key === wanted || name === wanted;
            });
            return String(source?.source_key || source?.key || source?.id || '').trim();
        }

        function canDeleteProductEditorSource(sourceName) {
            const key = productEditorSourceKey(sourceName);
            return !!key && !CORE_PRODUCT_EDITOR_SOURCE_KEYS.has(key);
        }

        function updateProductEditorDeleteButton() {
            const btn = document.getElementById('productEditorDeleteRow');
            if (!btn) return;
            const active = productEditorActiveRow !== null && !!productEditorRows[productEditorActiveRow];
            btn.classList.toggle('opacity-50', !active);
            btn.classList.toggle('pointer-events-none', !active);
            btn.classList.toggle('text-white/60', !active);
            btn.classList.toggle('text-white', active);
        }

        function openAddSourceModal() {
            const modal = document.getElementById('productEditorAddSourceModal');
            if (!modal) return;
            modal.classList.remove('hidden');
            const input = document.getElementById('productEditorNewSourceInput');
            if (input) {
                input.value = '';
                setTimeout(() => input.focus(), 0);
            }
        }

        function closeAddSourceModal() {
            document.getElementById('productEditorAddSourceModal')?.classList.add('hidden');
        }

        async function saveNewProductEditorSource() {
            const input = document.getElementById('productEditorNewSourceInput');
            const value = String(input?.value || '').trim();
            if (!value) {
                showToast("Nhập tên nguồn trước.", "warning");
                return;
            }
            try {
                const result = await window.TAPHOA_PRODUCTION.createSource(value);
                const savedName = String(result?.name || value).trim();
                const exists = getProductEditorSources().some(v => v.toLowerCase() === savedName.toLowerCase());
                if (!exists) productEditorCustomSources.push(savedName);
                renderProductEditorSources();
                renderProductEditorSourcePicker();
                closeAddSourceModal();
                showToast("Đã thêm nguồn mới.", "success");
            } catch (error) {
                console.error('create product source', error);
                showToast("Không thêm được nguồn.", "warning");
            }
        }

        function openProductEditorSourcePicker(index) {
            productEditorSourcePickerRow = index;
            renderProductEditorSourcePicker();
            document.getElementById('productEditorSourcePickerModal')?.classList.remove('hidden');
        }

        function closeProductEditorSourcePicker() {
            productEditorSourcePickerRow = null;
            document.getElementById('productEditorSourcePickerModal')?.classList.add('hidden');
        }

        function renderProductEditorSourcePicker() {
            const list = document.getElementById('productEditorSourcePickerList');
            if (!list) return;
            const sources = getProductEditorSources();
            list.innerHTML = sources.length
                ? sources.map(source => {
                    const safe = escapeProductEditorValue(source);
                    if (!canDeleteProductEditorSource(source)) {
                        return `<button type="button" class="product-editor-picker-option mb-2 last:mb-0" data-picker-source="${safe}">${safe}</button>`;
                    }
                    return `<div class="relative mb-2 last:mb-0">
                        <button type="button" class="product-editor-picker-option !mb-0 pr-12" data-picker-source="${safe}">${safe}</button>
                        <button type="button" data-delete-source="${safe}" class="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg text-red-500 text-lg font-bold" aria-label="Xóa nguồn ${safe}">×</button>
                    </div>`;
                }).join('')
                : '<div class="p-4 text-center text-gray-400 text-sm">Chưa có nguồn.</div>';
        }

        function requestDeleteProductEditorSource(source) {
            const value = String(source || '').trim();
            if (!value || !canDeleteProductEditorSource(value)) return;
            showConfirmModal(
                "Xóa nguồn?",
                `Bạn có chắc muốn xóa nguồn ${value}?`,
                "Xóa",
                "bg-danger",
                async () => {
                    try {
                        await window.TAPHOA_PRODUCTION.deleteSource(value);
                        productEditorCustomSources = productEditorCustomSources.filter(v => String(v || '').trim() !== value);
                        if (productEditorSourceFilter === value) productEditorSourceFilter = 'Tất cả';
                        renderProductEditorSources();
                        renderProductEditorSourcePicker();
                        showToast("Đã xóa nguồn.", "success");
                    } catch (error) {
                        console.error('delete product source', error);
                        const message = String(error?.message || error || '');
                        showToast(message.includes('source_has_active_products') ? "Nguồn còn sản phẩm, hãy xóa hoặc chuyển sản phẩm trước." : "Không xóa được nguồn.", "warning");
                    }
                }
            );
        }

        document.addEventListener('click', function(e) {
            const deleteSource = e.target.closest('#productEditorSourcePickerList [data-delete-source]');
            if (!deleteSource) return;
            e.preventDefault();
            e.stopPropagation();
            requestDeleteProductEditorSource(deleteSource.dataset.deleteSource || '');
        }, true);

        function chooseProductEditorSource(source) {
            if (productEditorSourcePickerRow === null || !productEditorRows[productEditorSourcePickerRow]) return;
            productEditorRows[productEditorSourcePickerRow][4] = source;
            syncProductEditorData();
            renderProductEditorSources();
            renderProductEditor();
            updateProductEditorDeleteButton();
            closeProductEditorSourcePicker();
        }

        function setProductEditorActiveRow(index, shouldRender = true) {
            if (!Number.isInteger(index) || !productEditorRows[index]) return;
            productEditorActiveRow = index;
            updateProductEditorDeleteButton();
            if (shouldRender) renderProductEditor();
        }

        function deleteSelectedProductEditorRows() {
            if (productEditorActiveRow === null || !productEditorRows[productEditorActiveRow]) return;
            const row = productEditorRows[productEditorActiveRow];
            const code = String(row[0] || '').trim();
            const name = String(row[1] || '').trim() || 'dòng chưa có tên';
            const localOnly = /^SP\d+$/i.test(code);

            showConfirmModal(
                "Xóa dòng?",
                `Bạn có chắc muốn xóa ${name}?`,
                "Xóa",
                "bg-danger",
                async () => {
                    try {
                        if (code && !localOnly) await window.TAPHOA_PRODUCTION.deleteProduct(code);
                        const index = productEditorRows.indexOf(row);
                        if (index >= 0) productEditorRows.splice(index, 1);
                        productEditorActiveRow = null;
                        syncProductEditorData();
                        renderProductEditorSources();
                        renderProductEditor();
                        updateProductEditorDeleteButton();
                        showToast("Đã xóa dòng hiện tại.", "success");
                    } catch (error) {
                        console.error('delete product editor row', error);
                        showToast("Không xóa được sản phẩm.", "warning");
                    }
                }
            );
        }

        function openProductEditor() {
            if (!hasPermission('canManageProducts')) {
                return denyPermission('Cập nhật sản phẩm và Giá vốn chỉ dành cho Owner.');
            }
            if (!appData.sanpham || appData.sanpham.length <= 1) {
                showToast("Chưa có dữ liệu sản phẩm.", "warning");
                return;
            }
            productEditorRows = appData.sanpham.slice(1).map(r => [...r]);
            productEditorSourceFilter = 'Tất cả';
            productEditorCustomSources = [];
            productEditorActiveRow = null;
            productEditorSourcePickerRow = null;
            document.getElementById('productEditorSearch').value = '';
            renderProductEditorSources();
            renderProductEditor();
            const page = document.getElementById('productEditorPage');
            page.classList.remove('hidden');
            page.classList.add('flex');
        }

        function closeProductEditor() {
            syncProductEditorData();
            renderSourceTags();
            renderProductList();
            renderDonTam();
            renderDaGiao();
            closeProductEditorSourcePicker();
            closeAddSourceModal();
            const page = document.getElementById('productEditorPage');
            page.classList.add('hidden');
            page.classList.remove('flex');
        }

        function renderProductEditorSources() {
            const container = document.getElementById('productEditorSourceChips');
            if (!container) return;

            const sources = ['Tất cả', ...getProductEditorSources()];

            if (!sources.includes(productEditorSourceFilter)) productEditorSourceFilter = 'Tất cả';

            container.innerHTML = sources.map(source => {
                const active = source === productEditorSourceFilter;
                const cls = active
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200';
                return `<button type="button" data-editor-source="${escapeProductEditorValue(source)}" class="allow-fast-click h-8 px-3 rounded-full border text-[11px] font-semibold whitespace-nowrap shrink-0 transition ${cls}">${escapeProductEditorValue(source)}</button>`;
            }).join('');
        }

        document.addEventListener('click', function(e) {
            const chip = e.target.closest('#productEditorSourceChips [data-editor-source]');
            if (!chip) return;
            productEditorSourceFilter = chip.dataset.editorSource || 'Tất cả';
            renderProductEditorSources();
            renderProductEditor();
        });

        function addProductEditorRow() {
            let maxNumber = 0;
            productEditorRows.forEach(r => {
                const m = String(r[0] || '').match(/(\d+)$/);
                if (m) maxNumber = Math.max(maxNumber, Number(m[1]) || 0);
            });
            const nextId = `SP${String(maxNumber + 1).padStart(3, '0')}`;
            const defaultSource = productEditorSourceFilter === 'Tất cả' ? '' : productEditorSourceFilter;
            productEditorRows.unshift([nextId, '', '', '', defaultSource]);
            productEditorActiveRow = 0;
            syncProductEditorData();

            renderProductEditorSources();
            renderProductEditor();
            updateProductEditorDeleteButton();

            const scrollOwner = document.getElementById('productEditorScroll');
            scrollOwner?.scrollTo({top:0,left:0,behavior:'auto'});

            requestAnimationFrame(() => {
                scrollOwner?.scrollTo({top:0,left:0,behavior:'auto'});
                const row = document.querySelector('[data-editor-row="0"]');
                if (row) {
                    row.querySelector('[data-editor-field="1"]')?.focus({preventScroll:true});
                    scrollOwner?.scrollTo({top:0,left:0,behavior:'auto'});
                }
            });
        }

        function rawProductEditorNumber(value) {
            return String(value ?? '').replace(/\D/g, '');
        }

        function formatProductEditorNumber(value) {
            const raw = rawProductEditorNumber(value).replace(/^0+(?=\d)/, '');
            if (!raw) return '';
            return raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        }
