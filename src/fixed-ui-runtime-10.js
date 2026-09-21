        async function captureLongSourceSharePages(source, baseName, modeLabel, showProgress = true) {
            const capture = window.TAPHOA_SHARE_CAPTURE;
            if (!capture) throw new Error('Chưa khởi tạo bộ tạo ảnh.');
            let host = null;
            try {
                const sourceWidth = Math.ceil(source.getBoundingClientRect().width || 420);
                const width = Math.min(760, Math.max(420, sourceWidth));
                const pageElements = buildSourceSharePageElements(source, width, modeLabel, 1800);
                if (!pageElements.length) throw new Error('Không có nội dung để tạo ảnh.');

                host = document.createElement('div');
                host.setAttribute('aria-hidden','true');
                host.style.position = 'fixed';
                host.style.left = '-100000px';
                host.style.top = '0';
                host.style.width = width + 'px';
                host.style.height = 'auto';
                host.style.overflow = 'visible';
                host.style.background = '#ffffff';
                host.style.pointerEvents = 'none';
                document.body.appendChild(host);

                const files = [];
                for (let i=0; i<pageElements.length; i++) {
                    const pageEl = pageElements[i];
                    host.innerHTML = '';
                    host.appendChild(pageEl);
                    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

                    const height = Math.ceil(pageEl.scrollHeight) + 4;
                    if (showProgress) showLoading(`Đang tạo ảnh ${i + 1}/${pageElements.length}...`);
                    const canvas = await capture.captureElement(pageEl, {
                        width,
                        height,
                        scale:1.4,
                        renderTimeout:10000,
                        libraryTimeout:5000
                    });
                    if (!canvas.width || !canvas.height) throw new Error(`Ảnh phần ${i+1} không hợp lệ.`);
                    const blob = await capture.canvasToPngBlob(canvas, `Không tạo được ảnh phần ${i+1}.`);
                    const suffix = pageElements.length > 1 ? `_${i+1}-${pageElements.length}` : '';
                    files.push(new File([blob], `${baseName}${suffix}.png`, { type:'image/png' }));
                }
                return files;
            } finally {
                host?.remove();
            }
        }

        const sourceShareCache = new Map();
        const sourceSharePreparing = new Map();

        function sourceShareHash(value) {
            const text = String(value || '');
            let hash = 2166136261;
            for (let i = 0; i < text.length; i++) {
                hash ^= text.charCodeAt(i);
                hash = Math.imul(hash, 16777619);
            }
            return (hash >>> 0).toString(36);
        }

        function getSourceShareDescriptor(tabName) {
            const grouped = tabName === 'grouped';
            const source = document.getElementById(grouped ? 'sourceDetailCaptureGrouped' : 'sourceDetailCaptureDetail');
            if (!source) return null;
            const safeSource = sanitizeSourceShareFileName(activeSourceDetailState.source);
            const mode = grouped ? 'gop' : 'chitiet';
            const modeLabel = grouped ? 'Gộp để gửi NCC' : 'Chi tiết';
            const signature = sourceShareHash([
                activeSourceDetailState.sheetName || '',
                activeSourceDetailState.source || '',
                activeSourceDetailState.timeLabel || '',
                grouped ? 'grouped' : 'detail',
                source.innerText || source.textContent || ''
            ].join('|'));
            return {
                grouped,
                source,
                safeSource,
                mode,
                modeLabel,
                signature,
                title: `${activeSourceDetailState.source} · ${grouped ? 'Gộp' : 'Chi tiết'}`,
                text: `${getSourceDetailSheetLabel(activeSourceDetailState.sheetName)} · ${activeSourceDetailState.timeLabel}`
            };
        }

        async function prepareSourceDetailShare(tabName) {
            const key = tabName === 'grouped' ? 'grouped' : 'detail';
            const descriptor = getSourceShareDescriptor(key);
            if (!descriptor) return null;
            const cached = sourceShareCache.get(key);
            if (cached?.signature === descriptor.signature) return cached;

            const inFlight = sourceSharePreparing.get(key);
            if (inFlight?.signature === descriptor.signature) return inFlight.promise;

            const promise = (async () => {
                const files = await captureLongSourceSharePages(
                    descriptor.source,
                    `${descriptor.safeSource}_${descriptor.mode}`,
                    descriptor.modeLabel,
                    false
                );
                if (!files.length) throw new Error('Không tạo được ảnh.');
                const artifact = {
                    signature: descriptor.signature,
                    files,
                    title: descriptor.title,
                    text: descriptor.text
                };
                const current = getSourceShareDescriptor(key);
                if (current?.signature === descriptor.signature) sourceShareCache.set(key, artifact);
                return artifact;
            })().catch(() => null).finally(() => {
                const current = sourceSharePreparing.get(key);
                if (current?.promise === promise) sourceSharePreparing.delete(key);
            });

            sourceSharePreparing.set(key, { signature: descriptor.signature, promise });
            return promise;
        }

        function sourceShareCancelled(error) {
            return /abort|cancel|canceled|cancelled/i.test(String(error?.name || '') + ' ' + String(error?.message || error || ''));
        }

        function downloadSourceShareFiles(files) {
            files.forEach((file,index) => {
                const url = URL.createObjectURL(file);
                const a = document.createElement('a');
                a.href = url;
                a.download = file.name;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1500 + index * 100);
            });
        }

        function shareActiveSourceDetailTab() {
            return shareSourceDetailTab(activeSourceDetailState.tab || 'detail');
        }

        let sourceNativeShareInFlight = false;

        function sourceIosShareContext() {
            const ua = String(navigator.userAgent || '');
            return /iPad|iPhone|iPod/.test(ua)
                || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
        }

        function sourceNativeSharePayload(ready) {
            if (sourceIosShareContext()) return { files: ready.files };
            return { files: ready.files, title: ready.title, text: ready.text };
        }

        function shareSourceDetailTab(tabName) {
            const key = tabName === 'grouped' ? 'grouped' : 'detail';
            const descriptor = getSourceShareDescriptor(key);
            if (!descriptor) return;

            const ready = sourceShareCache.get(key);
            if (ready?.signature === descriptor.signature) {
                hideLoading();

                const iosPwaFallback = window.TAPHOA_IOS_SHARE_FALLBACK;
                if (iosPwaFallback?.shouldUse?.()) {
                    iosPwaFallback.open(ready.files,{ title: ready.title || 'Ảnh chia sẻ' });
                    return;
                }

                if (navigator.share && navigator.canShare && navigator.canShare({ files: ready.files })) {
                    if (sourceNativeShareInFlight) return;
                    if (navigator.userActivation && navigator.userActivation.isActive === false) {
                        if (typeof showToast === 'function') showToast('Bấm Chia sẻ lại để mở bảng chia sẻ.','info');
                        return;
                    }
                    sourceNativeShareInFlight = true;
                    let shareResult;
                    try {
                        shareResult = navigator.share(sourceNativeSharePayload(ready));
                    } catch (error) {
                        sourceNativeShareInFlight = false;
                        if (sourceShareCancelled(error) && sourceIosShareContext()) {
                            window.TAPHOA_IOS_SHARE_FALLBACK?.open?.(ready.files,{ title: ready.title || 'Ảnh chia sẻ' });
                            return;
                        }
                        if (!sourceShareCancelled(error)) showAlertPopup('Lỗi chia sẻ', error?.message || 'Không thể chia sẻ ảnh.');
                        return;
                    }
                    return Promise.resolve(shareResult).catch(error => {
                        if (sourceShareCancelled(error) && sourceIosShareContext()) {
                            window.TAPHOA_IOS_SHARE_FALLBACK?.open?.(ready.files,{ title: ready.title || 'Ảnh chia sẻ' });
                            return;
                        }
                        showAlertPopup('Lỗi chia sẻ', error?.message || 'Không thể chia sẻ ảnh.');
                    }).finally(() => {
                        sourceNativeShareInFlight = false;
                    });
                }
                iosPwaFallback?.open?.(ready.files,{ title: ready.title || 'Ảnh chia sẻ' });
                if (!iosPwaFallback) downloadSourceShareFiles(ready.files);
                return;
            }

            return prepareSourceDetailShare(key).then(prepared => {
                hideLoading();
                if (!prepared) {
                    showAlertPopup('Lỗi tạo ảnh', 'Không thể tạo ảnh.');
                    return;
                }
                if (typeof showToast === 'function') {
                    showToast('Ảnh đã sẵn sàng. Bấm Chia sẻ lại để gửi ngay.', 'success');
                }
            });
        }

        if (typeof openSourceDetail === 'function') {
            const openSourceDetailBeforeSharePrep = openSourceDetail;
            openSourceDetail = function(...args) {
                sourceShareCache.clear();
                sourceSharePreparing.clear();
                const result = openSourceDetailBeforeSharePrep.apply(this,args);
                setTimeout(() => {
                    void prepareSourceDetailShare('grouped');
                    setTimeout(() => void prepareSourceDetailShare('detail'), 80);
                }, 20);
                return result;
            };
        }

        if (typeof switchSourceDetailTab === 'function') {
            const switchSourceDetailTabBeforeSharePrep = switchSourceDetailTab;
            switchSourceDetailTab = function(tabName) {
                const result = switchSourceDetailTabBeforeSharePrep.apply(this,arguments);
                setTimeout(() => void prepareSourceDetailShare(tabName), 0);
                return result;
            };
        }

        function renderDonTam() {
            renderOrderTimeFilterUI('dontam');
            if (!appData.dontam || appData.dontam.length <= 1) {
                document.getElementById('pendingOrderListContainer').innerHTML = '';
                document.getElementById('sourceSummaryTableBody').innerHTML = '';
                document.getElementById('pendingCountBadge').innerText = '0'; return;
            }

            let rows = getRowsVisibleForOrderTab('dontam');
            if (!rows.length) {
                document.getElementById('pendingOrderListContainer').innerHTML = '<p class="text-center text-gray-400 mt-4 text-xs">Không có đơn tạm trong khoảng thời gian này</p>';
                document.getElementById('sourceSummaryTableBody').innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-400">Không có dữ liệu</td></tr>';
                document.getElementById('pendingCountBadge').innerText = '0';
                return;
            }
            let orders = {}; let sourceSummary = {};
            let spDict = {}; appData.sanpham.slice(1).forEach(sp => { spDict[sp[0]] = { ten: sp[1], von: Number(sp[2]) || 0, nguon: sp[4] || 'Khác' }; });
            let khDict = {}; appData.khachhang.slice(1).forEach(kh => { khDict[kh[0]] = kh[1]; });

            rows.forEach(r => {
                let idTam = r[0]; let maKh = r[1]; let maSp = r[2];
                let sl = Number(r[3]) || 0; let donGia = Number(r[4]) || 0;
                let thoiGian = r[6] || '';
                if (!idTam) return;

                let spInfo = spDict[maSp] || { ten: maSp, von: 0, nguon: 'Khác' };
                let chi = spInfo.von * sl; let thu = donGia * sl; let lai = thu - chi;
                let nguon = spInfo.nguon;

                if (!sourceSummary[nguon]) sourceSummary[nguon] = { sl: 0, chi: 0, thu: 0, lai: 0 };
                sourceSummary[nguon].sl += sl; sourceSummary[nguon].chi += chi; sourceSummary[nguon].thu += thu; sourceSummary[nguon].lai += lai;

                if (!orders[idTam]) {
                    orders[idTam] = { maKh: maKh, tenKh: khDict[maKh] || maKh, thoiGian: thoiGian, tongSl: 0, tongThu: 0, tongLai: 0, countSp: 0, items: [] };
                }
                orders[idTam].tongSl += sl; orders[idTam].tongThu += thu; orders[idTam].tongLai += lai; orders[idTam].countSp += 1;
                orders[idTam].items.push({ code: maSp, name: spInfo.ten || maSp, qty: sl });
            });

            let sumHtml = ''; let tSl = 0, tChi = 0, tThu = 0, tLai = 0;
            for (let ng in sourceSummary) {
                let s = sourceSummary[ng]; tSl += s.sl; tChi += s.chi; tThu += s.thu; tLai += s.lai;
                sumHtml += `
                    <tr class="border-b border-gray-50 hover:bg-gray-50/50">
                        <td class="py-3 font-bold text-gray-800"><button type="button" data-source="${escapeProductEditorValue(ng)}" onclick="openSourceDetailFromCell(this, 'dontam')" class="allow-fast-click source-summary-link text-left font-bold text-gray-800">${escapeProductEditorValue(ng)}</button></td>
                        <td class="py-3 text-right font-bold text-gray-600">${s.sl}</td>
                        <td class="py-3 text-right font-bold text-gray-500 pr-2">${s.chi.toLocaleString('vi-VN')}</td>
                        <td class="py-3 text-right font-bold text-primary pr-2">${s.thu.toLocaleString('vi-VN')}</td>
                        <td class="py-3 text-right font-bold text-primary pr-2">${s.lai.toLocaleString('vi-VN')}</td>
                    </tr>`;
            }
            sumHtml += `
                <tr class="summary-total-row font-extrabold text-gray-800">
                    <td class="py-3 pl-1">TỔNG</td><td class="py-3 text-right">${tSl}</td>
                    <td class="py-3 text-right text-gray-500 pr-2">${tChi.toLocaleString('vi-VN')}</td>
                    <td class="py-3 text-right text-primary pr-2">${tThu.toLocaleString('vi-VN')}</td>
                    <td class="py-3 text-right text-primary pr-2">${tLai.toLocaleString('vi-VN')}</td>
                </tr>`;
            document.getElementById('sourceSummaryTableBody').innerHTML = sumHtml;

            let orderHtml = ''; let orderKeys = Object.keys(orders).reverse();
            document.getElementById('pendingCountBadge').innerText = orderKeys.length;

            orderKeys.forEach((k, idx) => {
                let o = orders[k];
                let shortTime = o.thoiGian;
                try { let parts = shortTime.split(' '); if(parts.length >= 2) { shortTime = `${parts[0].split('/').slice(0,2).join('/')} ${parts[1].split(':').slice(0,2).join(':')}`; } } catch(e){}
                const productPreview = buildOrderProductPreview(o.items, 2);

                orderHtml += `
                    <div onclick="clickOrder('${k}', 'dontam')" class="allow-fast-click bg-white rounded-[16px] p-3.5 shadow-sm border border-gray-100 hover:border-primary/50 cursor-pointer transition flex justify-between items-center mb-3">
                        <div class="pointer-events-none flex items-center gap-3 min-w-0">
                            <div style="width: 36px; height: 36px;" class="rounded-full bg-orange-50 text-orange-500 font-extrabold text-sm flex items-center justify-center shrink-0">${orderKeys.length - idx}</div>
                            <div class="min-w-0">
                                <p class="font-bold text-[14px] text-gray-700 truncate">${o.tenKh}</p>
                                <p class="text-[11px] text-gray-400 mt-0.5 truncate">${shortTime} · ${k} · ${o.countSp} mã · ${o.tongSl} SP</p>
                                ${productPreview ? `<div class="order-product-preview mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] leading-[1.3]">${productPreview}</div>` : ''}
                            </div>
                        </div>
                        <div class="pointer-events-none text-right">
                            <p class="font-extrabold text-[15px] text-gray-900">${o.tongThu.toLocaleString('vi-VN')}</p>
                            <p class="profit-only text-[11px] font-bold text-primary mt-0.5">+${o.tongLai.toLocaleString('vi-VN')}</p>
                        </div>
                    </div>`;
            });
            document.getElementById('pendingOrderListContainer').innerHTML = orderHtml;
        }
