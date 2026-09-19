        function clearUserDeliveredPreviewForEditableTab(tabId) {
            const enteringEditableArea = tabId === 'tab-ban-hang' || tabId === 'tab-don-tam';
            if (currentAuthRole !== 'user' || !enteringEditableArea || editingOrderSheet !== 'dongiao') return;

            // User chỉ được xem Đã giao. Khi rời vùng xem để quay lại vùng có thể thao tác,
            // phải bỏ toàn bộ state của đơn đã giao để không khóa Lưu tạm và không thể sửa nhầm Đã giao.
            cart = {};
            editingOrderId = null;
            editingOrderSheet = null;
            editingOrderInSaleMode = false;
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

        // Product/source management is intentionally read-only on the Web.
        // The management Sheet is the only place that may add, edit or delete product data.
        // These lightweight definitions remain only so retired editor hooks cannot break older runtime code.
        let productEditorRows = [];
        let productEditorSourceFilter = 'Tất cả';
        let productEditorCustomSources = [];
        let productEditorActiveRow = null;
        let productEditorSourcePickerRow = null;
        const CORE_PRODUCT_EDITOR_SOURCE_KEYS = new Set(['hang-u','thuoc-la','sua','masan','hang-thuong']);

        function productEditorReadOnlyNotice() {
            showToast("Quản lý sản phẩm trong file Quản trị.", "warning");
        }

        function getProductEditorSources() {
            const backendSources = (window.TAPHOA_PRODUCTION?.getState?.()?.sources || [])
                .map(source => String(source?.name || source?.ten || source?.source_name || source?.source_key || '').trim())
                .filter(Boolean);
            return Array.from(new Set([
                ...backendSources,
                ...productEditorRows.map(r => String(r[4] || '').trim()).filter(Boolean)
            ]));
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

        function canDeleteProductEditorSource() {
            return false;
        }

        function updateProductEditorDeleteButton() {
            const btn = document.getElementById('productEditorDeleteRow');
            if (!btn) return;
            btn.classList.add('opacity-50', 'pointer-events-none', 'text-white/60');
            btn.classList.remove('text-white');
        }

        function openAddSourceModal() {
            productEditorReadOnlyNotice();
        }

        function closeAddSourceModal() {
            document.getElementById('productEditorAddSourceModal')?.classList.add('hidden');
        }

        async function saveNewProductEditorSource() {
            productEditorReadOnlyNotice();
        }

        function openProductEditorSourcePicker() {
            productEditorReadOnlyNotice();
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
                    return `<div class="product-editor-picker-option mb-2 last:mb-0 opacity-70">${safe}</div>`;
                }).join('')
                : '<div class="p-4 text-center text-gray-400 text-sm">Chưa có nguồn.</div>';
        }

        function requestDeleteProductEditorSource() {
            productEditorReadOnlyNotice();
        }

        async function chooseProductEditorSource() {
            productEditorReadOnlyNotice();
        }

        function setProductEditorActiveRow(index, shouldRender = true) {
            if (!Number.isInteger(index) || !productEditorRows[index]) return;
            productEditorActiveRow = index;
            updateProductEditorDeleteButton();
            if (shouldRender) renderProductEditor();
        }

        function deleteSelectedProductEditorRows() {
            productEditorReadOnlyNotice();
        }

        function openProductEditor() {
            productEditorReadOnlyNotice();
        }

        function closeProductEditor() {
            closeProductEditorSourcePicker();
            closeAddSourceModal();
            const page = document.getElementById('productEditorPage');
            page?.classList.add('hidden');
            page?.classList.remove('flex');
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
            productEditorReadOnlyNotice();
        }

        function rawProductEditorNumber(value) {
            return String(value ?? '').replace(/\D/g, '');
        }

        function formatProductEditorNumber(value) {
            const raw = rawProductEditorNumber(value).replace(/^0+(?=\d)/, '');
            if (!raw) return '';
            return raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        }