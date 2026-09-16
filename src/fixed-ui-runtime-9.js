        function openSourceDetail(sheetName, sourceName) {
            const built = buildSourceDetailData(sheetName, sourceName);
            activeSourceDetailState = {
                sheetName,
                source: sourceName,
                tab: 'detail',
                detailRows: built.detailRows,
                groupedRows: built.groupedRows,
                totalQty: built.totalQty,
                timeLabel: built.timeLabel
            };
            renderSourceDetailModal();
            const wrap = promoteSourceDetailModalLayer();
            const card = document.getElementById('sourceDetailModalCard');
            if (!wrap || !card) return;
            wrap.classList.remove('hidden');
            wrap.classList.remove('opacity-0','pointer-events-none');
            requestAnimationFrame(() => card.classList.remove('translate-y-full'));
        }

        function closeSourceDetailModal() {
            const wrap = document.getElementById('sourceDetailModalWrapper');
            const card = document.getElementById('sourceDetailModalCard');
            if (!wrap) return;
            card?.classList.add('translate-y-full');
            wrap.classList.add('opacity-0','pointer-events-none');
            setTimeout(() => wrap.classList.add('hidden'), 300);
        }

        function switchSourceDetailTab(tabName) {
            activeSourceDetailState.tab = tabName === 'grouped' ? 'grouped' : 'detail';
            const isDetail = activeSourceDetailState.tab === 'detail';
            const detailPanel = document.getElementById('sourceDetailPanelDetail');
            const groupedPanel = document.getElementById('sourceDetailPanelGrouped');
            if (detailPanel) {
                detailPanel.hidden = !isDetail;
                detailPanel.style.display = isDetail ? 'block' : 'none';
            }
            if (groupedPanel) {
                groupedPanel.hidden = isDetail;
                groupedPanel.style.display = isDetail ? 'none' : 'block';
            }

            const detailBtn = document.getElementById('sourceDetailTabDetail');
            const groupBtn = document.getElementById('sourceDetailTabGrouped');
            if (detailBtn) detailBtn.className = `allow-fast-click h-9 rounded-lg text-[12px] font-bold ${isDetail ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`;
            if (groupBtn) groupBtn.className = `allow-fast-click h-9 rounded-lg text-[12px] font-bold ${!isDetail ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`;
            const shareBtn = document.getElementById('sourceDetailShareButton');
            if (shareBtn) {
                const label = isDetail ? 'Chia sẻ ảnh chi tiết' : 'Chia sẻ ảnh gộp';
                shareBtn.title = label;
                shareBtn.setAttribute('aria-label', label);
            }
        }

        function getSourceDetailSheetLabel(sheetName) {
            return sheetName === 'dongiao' ? 'Đã giao' : 'Đơn tạm';
        }

        function buildSourceCaptureHeaderHtml(modeLabel) {
            return `
                <div class="source-detail-share-header" data-source-share-header>
                    <div class="source-detail-share-title">${escapeProductEditorValue(activeSourceDetailState.source)}</div>
                    <div class="source-detail-share-meta">${getSourceDetailSheetLabel(activeSourceDetailState.sheetName)} · ${escapeProductEditorValue(activeSourceDetailState.timeLabel)} · ${modeLabel}</div>
                </div>`;
        }

        function renderSourceDetailCaptureDetail() {
            const owner = document.getElementById('sourceDetailCaptureDetail');
            if (!owner) return;
            const rows = activeSourceDetailState.detailRows;
            if (!rows.length) {
                owner.innerHTML = '<div class="source-detail-empty">Không có dữ liệu.</div>';
                return;
            }
            const rowHtml = rows.map((row,index) => `
                <div class="source-detail-grid source-detail-data-row" data-source-share-row>
                    <div class="source-detail-stt">${index + 1}</div>
                    <div class="min-w-0">
                        <div class="source-detail-name">${escapeProductEditorValue(row.productName)}</div>
                        <div class="source-detail-buyer">${escapeProductEditorValue(row.buyerName)}</div>
                    </div>
                    <div class="source-detail-qty">${row.qty.toLocaleString('vi-VN')}</div>
                </div>`).join('');
            owner.innerHTML = `
                <div class="source-detail-grid source-detail-table-head" data-source-share-table-head>
                    <div class="text-right">STT</div><div>Tên SP / Người mua</div><div class="text-right">SL</div>
                </div>
                <div data-source-share-rows>${rowHtml}</div>
                <div class="source-detail-grid source-detail-total" data-source-share-footer>
                    <div class="source-detail-total-label">TỔNG · ${rows.length} dòng</div>
                    <div class="source-detail-total-qty">${activeSourceDetailState.totalQty.toLocaleString('vi-VN')}</div>
                </div>`;
        }

        function renderSourceDetailCaptureGrouped() {
            const owner = document.getElementById('sourceDetailCaptureGrouped');
            if (!owner) return;
            const rows = activeSourceDetailState.groupedRows;
            if (!rows.length) {
                owner.innerHTML = '<div class="source-detail-empty">Không có dữ liệu.</div>';
                return;
            }
            const rowHtml = rows.map((row,index) => `
                <div class="source-detail-grid source-detail-data-row" data-source-share-row>
                    <div class="source-detail-stt">${index + 1}</div>
                    <div class="source-detail-name">${escapeProductEditorValue(row.productName)}</div>
                    <div class="source-detail-qty">${row.qty.toLocaleString('vi-VN')}</div>
                </div>`).join('');
            owner.innerHTML = `
                <div class="source-detail-grid source-detail-table-head" data-source-share-table-head>
                    <div class="text-right">STT</div><div>Tên sản phẩm</div><div class="text-right">SL</div>
                </div>
                <div data-source-share-rows>${rowHtml}</div>
                <div class="source-detail-grid source-detail-total" data-source-share-footer>
                    <div class="source-detail-total-label">TỔNG · ${rows.length} mã</div>
                    <div class="source-detail-total-qty">${activeSourceDetailState.totalQty.toLocaleString('vi-VN')}</div>
                </div>`;
        }

        function renderSourceDetailModal() {
            const state = activeSourceDetailState;
            document.getElementById('sourceDetailSheetLabel').innerText = getSourceDetailSheetLabel(state.sheetName);
            document.getElementById('sourceDetailSourceName').innerText = state.source;
            document.getElementById('sourceDetailTimeLabel').innerText = state.timeLabel;
            renderSourceDetailCaptureDetail();
            renderSourceDetailCaptureGrouped();
            switchSourceDetailTab(state.tab);
        }

        function sanitizeSourceShareFileName(value) {
            return String(value || 'nguon')
                .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                .replace(/[đĐ]/g,'d')
                .replace(/[^a-zA-Z0-9_-]+/g,'_')
                .replace(/^_+|_+$/g,'') || 'nguon';
        }

        async function canvasToPngBlob(canvas) {
            return new Promise((resolve,reject) => {
                canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không tạo được ảnh PNG.')), 'image/png');
            });
        }

        function createSourceShareHeaderElement(modeLabel) {
            const host = document.createElement('div');
            host.innerHTML = buildSourceCaptureHeaderHtml(modeLabel).trim();
            return host.firstElementChild;
        }

        function buildSourceSharePageElements(source, width, modeLabel, maxPageHeight = 3600) {
            const measure = source.cloneNode(true);
            measure.removeAttribute('id');
            measure.style.width = width + 'px';
            measure.style.height = 'auto';
            measure.style.maxHeight = 'none';
            measure.style.overflow = 'visible';
            measure.style.background = '#ffffff';

            const measureHeader = createSourceShareHeaderElement(modeLabel);
            if (measureHeader) measure.prepend(measureHeader);

            const measureHost = document.createElement('div');
            measureHost.style.position = 'fixed';
            measureHost.style.left = '-100000px';
            measureHost.style.top = '0';
            measureHost.style.width = width + 'px';
            measureHost.style.background = '#ffffff';
            measureHost.style.pointerEvents = 'none';
            measureHost.appendChild(measure);
            document.body.appendChild(measureHost);

            const header = measure.querySelector('[data-source-share-header]');
            const tableHead = measure.querySelector('[data-source-share-table-head]');
            const footer = measure.querySelector('[data-source-share-footer]');
            const measuredRows = Array.from(measure.querySelectorAll('[data-source-share-row]'));

            const fixedHeight = (header?.offsetHeight || 0) + (tableHead?.offsetHeight || 0) + (footer?.offsetHeight || 0) + 12;
            const chunks = [];
            let chunk = [];
            let chunkHeight = fixedHeight;

            measuredRows.forEach((row, index) => {
                const rowHeight = Math.max(1, Math.ceil(row.offsetHeight));
                if (chunk.length && chunkHeight + rowHeight > maxPageHeight) {
                    chunks.push(chunk);
                    chunk = [];
                    chunkHeight = fixedHeight;
                }
                chunk.push(index);
                chunkHeight += rowHeight;
            });
            if (chunk.length || !measuredRows.length) chunks.push(chunk);

            const sourceRows = Array.from(source.querySelectorAll('[data-source-share-row]'));
            const sourceTableHead = source.querySelector('[data-source-share-table-head]');
            const sourceFooter = source.querySelector('[data-source-share-footer]');

            const pages = chunks.map((indices, pageIndex) => {
                const page = document.createElement('div');
                page.className = 'source-detail-capture source-detail-share-page bg-white';
                page.style.width = width + 'px';
                page.style.height = 'auto';
                page.style.maxHeight = 'none';
                page.style.overflow = 'visible';
                page.style.background = '#ffffff';

                const shareHeader = createSourceShareHeaderElement(modeLabel);
                if (shareHeader) page.appendChild(shareHeader);
                if (sourceTableHead) page.appendChild(sourceTableHead.cloneNode(true));

                const rowsWrap = document.createElement('div');
                rowsWrap.setAttribute('data-source-share-rows','');
                indices.forEach(index => {
                    const row = sourceRows[index];
                    if (row) rowsWrap.appendChild(row.cloneNode(true));
                });
                page.appendChild(rowsWrap);

                if (pageIndex === chunks.length - 1) {
                    if (sourceFooter) page.appendChild(sourceFooter.cloneNode(true));
                } else {
                    const note = document.createElement('div');
                    note.className = 'source-detail-page-note';
                    note.textContent = `Còn tiếp · Trang ${pageIndex + 1}/${chunks.length}`;
                    page.appendChild(note);
                }
                return page;
            });

            measureHost.remove();
            return pages;
        }
