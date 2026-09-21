        function clickOrder(orderId, sheetName) {
            if (sheetName === 'dongiao' && !hasPermission('canViewDelivered')) {
                return denyPermission('User không được xem Đã giao.');
            }
            viewingOrderId = orderId;
            window.activeViewingSheet = sheetName;
            loadOrderIntoCart(orderId, sheetName, { switchToSale: false, showSuccessToast: false });
            openCartMobile();
        }

        function editOrder(orderId, sheetName) {
            loadOrderIntoCart(orderId, sheetName, { switchToSale: true, showSuccessToast: true });
        }

        function showOrderDetailMobile(orderId, sheetName) {
            let modalWrap = document.getElementById('orderDetailModalWrapper');
            if(!modalWrap) return; // Thêm check an toàn
            
            modalWrap.classList.remove('hidden');
            document.getElementById('detailModalTitle').innerText = orderId;
            
            let items = appData[sheetName].slice(1).filter(r => String(r[0]).trim() === orderId);
            if(items.length === 0) return;

            let maKh = items[0][1]; let timeStr = items[0][6] || '';
            let spDict = {}; appData.sanpham.slice(1).forEach(sp => { spDict[sp[0]] = sp[1]; });

            let html = ''; let total = 0; let totalQty = 0;
            items.forEach((r, idx) => {
                let tenSp = spDict[r[2]] || r[2];
                let donGia = Number(r[4]) || 0;
                let sl = Number(r[3]) || 0;
                let tTien = Number(r[5]) || 0;
                let note = String(r[9] || '').trim();
                total += tTien;
                totalQty += sl;
                html += `
                <div class="order-detail-compact-grid py-2 border-b border-gray-50 text-[12px]">
                    <div class="order-stt font-bold text-gray-400">${idx+1}</div>
                    <div class="min-w-0">
                        <div class="order-name font-bold text-gray-900 leading-tight">${tenSp}</div>
                        ${note ? `<div class="order-line-note text-[10px] text-gray-400 mt-0.5 truncate">${escapeProductEditorValue(note)}</div>` : ''}
                    </div>
                    <div class="order-price font-semibold text-gray-700">${donGia.toLocaleString('vi-VN')}</div>
                    <div class="order-qty font-bold text-gray-700">${sl}</div>
                    <div class="order-total font-extrabold text-gray-900">${tTien.toLocaleString('vi-VN')}</div>
                </div>`;
            });

            let kh = appData.khachhang.find(r => r[0] == maKh);
            document.getElementById('detailModalKH').innerText = kh ? kh[1] : maKh;
            document.getElementById('detailModalTime').innerText = "Thời gian: " + timeStr;

            document.getElementById('detailModalItems').innerHTML = html;
            const detailLineCountEl = document.getElementById('detailLineCountDisplay');
            if (detailLineCountEl) detailLineCountEl.innerText = items.length;
            const detailTotalQtyEl = document.getElementById('detailTotalQtyDisplay');
            if (detailTotalQtyEl) detailTotalQtyEl.innerText = totalQty;
            document.getElementById('detailModalTotal').innerText = total.toLocaleString('vi-VN');
            const orderCodeEl = document.getElementById('detailModalOrderCode');
            if (orderCodeEl) orderCodeEl.innerText = "Mã đơn: " + orderId;

            let btnEdit = document.getElementById('btnEditPopupOrder');
            if(btnEdit) {
                btnEdit.style.display = 'flex';
                btnEdit.setAttribute('onclick', `editOrder('${orderId}', '${sheetName}')`);
            }

            modalWrap.classList.remove('opacity-0', 'pointer-events-none');
            setTimeout(() => {
                let bottomSheet = document.getElementById('orderDetailBottomSheet');
                if(bottomSheet) bottomSheet.classList.remove('translate-y-full');
            }, 10);
        }

        function closeOrderMobile() {
            let bottomSheet = document.getElementById('orderDetailBottomSheet');
            let modalWrap = document.getElementById('orderDetailModalWrapper');
            
            // Check null an toàn để không bao giờ bị đứng app
            if (bottomSheet) bottomSheet.classList.add('translate-y-full');
            if (modalWrap) {
                setTimeout(() => {
                    modalWrap.classList.add('pointer-events-none', 'opacity-0');
                    setTimeout(() => modalWrap.classList.add('hidden'), 300);
                }, 300);
            }
        }

        function isIosNativeFileShareContext() {
            const ua = String(navigator.userAgent || '');
            return /iPad|iPhone|iPod/.test(ua)
                || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
        }

        function legacyOrderSharePayload(file) {
            const files = [file];
            if (isIosNativeFileShareContext()) return { files };
            return { files, title: 'Đơn hàng', text: 'Chi tiết đơn hàng' };
        }

        function isNativeShareCancellation(error) {
            const name = String(error?.name || '');
            const message = String(error?.message || error || '');
            return /abort|cancel|canceled|cancelled/i.test(name + ' ' + message);
        }

        async function shareOrderImage() {
            const source = document.getElementById('orderDetailContentToShare');
            if (!source) return;

            let captureHost = null;
            try {
                showLoading("Đang tạo ảnh gửi Zalo...");

                const sourceWidth = Math.ceil(source.getBoundingClientRect().width);
                const width = Math.min(760, Math.max(360, sourceWidth));

                const clone = source.cloneNode(true);
                clone.removeAttribute('id');
                clone.style.width = width + 'px';
                clone.style.height = 'auto';
                clone.style.maxHeight = 'none';
                clone.style.minHeight = '0';
                clone.style.overflow = 'visible';
                clone.style.flex = 'none';

                const cloneItems = clone.querySelector('#detailModalItems');
                if (cloneItems) {
                    cloneItems.removeAttribute('id');
                    cloneItems.style.height = 'auto';
                    cloneItems.style.maxHeight = 'none';
                    cloneItems.style.minHeight = '0';
                    cloneItems.style.overflow = 'visible';
                    cloneItems.style.flex = 'none';
                }

                clone.querySelectorAll('.order-detail-compact-grid').forEach(row => {
                    row.style.minHeight = '34px';
                    row.style.height = 'auto';
                    row.style.overflow = 'visible';
                    row.style.alignItems = 'center';
                });

                clone.querySelectorAll('.order-name').forEach(name => {
                    name.style.overflow = 'visible';
                    name.style.textOverflow = 'clip';
                    name.style.whiteSpace = 'normal';
                    name.style.lineHeight = '1.35';
                    name.style.paddingTop = '2px';
                    name.style.paddingBottom = '2px';
                });

                captureHost = document.createElement('div');
                captureHost.setAttribute('aria-hidden', 'true');
                captureHost.style.position = 'fixed';
                captureHost.style.left = '-100000px';
                captureHost.style.top = '0';
                captureHost.style.width = width + 'px';
                captureHost.style.height = 'auto';
                captureHost.style.overflow = 'visible';
                captureHost.style.background = '#ffffff';
                captureHost.style.pointerEvents = 'none';
                captureHost.style.zIndex = '-1';
                captureHost.appendChild(clone);
                document.body.appendChild(captureHost);

                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

                const captureHeight = Math.ceil(clone.scrollHeight) + 4;
                const canvas = await html2canvas(clone, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    width: width,
                    height: captureHeight,
                    windowWidth: width,
                    windowHeight: captureHeight,
                    scrollX: 0,
                    scrollY: 0
                });

                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob(result => result ? resolve(result) : reject(new Error("Không tạo được ảnh đơn hàng.")), 'image/png');
                });

                const file = new File([blob], 'donhang.png', { type: 'image/png' });
                const iosPwaFallback = window.TAPHOA_IOS_SHARE_FALLBACK;
                if (iosPwaFallback?.shouldUse?.()) {
                    iosPwaFallback.open([file], { title:'Đơn hàng' });
                } else if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share(legacyOrderSharePayload(file));
                    } catch (error) {
                        if (isNativeShareCancellation(error) && isIosNativeFileShareContext()) {
                            window.TAPHOA_IOS_SHARE_FALLBACK?.open?.([file], { title:'Đơn hàng' });
                        } else {
                            throw error;
                        }
                    }
                } else if (iosPwaFallback) {
                    iosPwaFallback.open([file], { title:'Đơn hàng' });
                } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'donhang.png';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
            } catch (e) {
                if (!isNativeShareCancellation(e)) showAlertPopup("Lỗi tạo ảnh", e.message);
            } finally {
                captureHost?.remove();
                hideLoading();
            }
        }


        async function shareCartOrderImage() {
            const template = document.getElementById('orderDetailContentToShare');
            const cartEntries = Object.entries(cart || {}).sort(([, a], [, b]) =>
                (Number(b.__lastTouched) || 0) - (Number(a.__lastTouched) || 0)
            );
            if (!template || cartEntries.length === 0) {
                showAlertPopup('Giỏ hàng trống', 'Không có sản phẩm để chia sẻ.');
                return;
            }

            let captureHost = null;
            try {
                showLoading("Đang tạo ảnh gửi Zalo...");

                const escapeText = value => String(value ?? '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');

                let totalQty = 0;
                let totalPrice = 0;
                let rowsHtml = '';
                cartEntries.forEach(([id, item], idx) => {
                    const qty = Number(item?.qty) || 0;
                    const price = Number(item?.price) || 0;
                    const lineTotal = qty * price;
                    totalQty += qty;
                    totalPrice += lineTotal;
                    rowsHtml += `
                        <div class="order-detail-compact-grid py-2 border-b border-gray-50 text-[12px]">
                            <div class="order-stt font-bold text-gray-400">${idx + 1}</div>
                            <div class="min-w-0">
                                <div class="order-name font-bold text-gray-900 leading-tight">${escapeText(item?.name || id)}</div>
                                ${String(item?.note || '').trim() ? `<div class="order-line-note text-[10px] text-gray-500 mt-0.5">${escapeText(String(item.note).trim())}</div>` : ''}
                            </div>
                            <div class="order-price font-semibold text-gray-700">${price.toLocaleString('vi-VN')}</div>
                            <div class="order-qty font-bold text-gray-700">${qty}</div>
                            <div class="order-total font-extrabold text-gray-900">${lineTotal.toLocaleString('vi-VN')}</div>
                        </div>`;
                });

                let timeStr = '';
                if (editingOrderId && editingOrderSheet && Array.isArray(appData?.[editingOrderSheet])) {
                    const orderRows = appData[editingOrderSheet].slice(1)
                        .filter(r => String(r?.[0] ?? '').trim() === String(editingOrderId).trim());
                    timeStr = orderRows[0]?.[6] || '';
                }
                if (!timeStr) {
                    const dateText = document.getElementById('currentDateStr')?.textContent?.trim() || '';
                    const timeText = document.getElementById('currentTimeStr')?.textContent?.trim() || '';
                    timeStr = [dateText, timeText].filter(Boolean).join(' ');
                }

                const sourceWidth = Math.ceil(template.getBoundingClientRect().width);
                const width = Math.min(760, Math.max(360, sourceWidth));
                const clone = template.cloneNode(true);
                clone.removeAttribute('id');
                clone.style.width = width + 'px';
                clone.style.height = 'auto';
                clone.style.maxHeight = 'none';
                clone.style.minHeight = '0';
                clone.style.overflow = 'visible';
                clone.style.flex = 'none';

                const codeEl = clone.querySelector('#detailModalOrderCode');
                if (codeEl) codeEl.textContent = 'Mã đơn: ' + (editingOrderId || '--');
                const customerEl = clone.querySelector('#detailModalKH');
                if (customerEl) customerEl.textContent = selectedCustomer?.name || 'Khách lẻ';
                const timeEl = clone.querySelector('#detailModalTime');
                if (timeEl) timeEl.textContent = 'Thời gian: ' + (timeStr || '--');

                const cloneItems = clone.querySelector('#detailModalItems');
                if (cloneItems) {
                    cloneItems.innerHTML = rowsHtml;
                    cloneItems.style.height = 'auto';
                    cloneItems.style.maxHeight = 'none';
                    cloneItems.style.minHeight = '0';
                    cloneItems.style.overflow = 'visible';
                    cloneItems.style.flex = 'none';
                }

                const lineCountEl = clone.querySelector('#detailLineCountDisplay');
                if (lineCountEl) lineCountEl.textContent = String(cartEntries.length);
                const totalQtyEl = clone.querySelector('#detailTotalQtyDisplay');
                if (totalQtyEl) totalQtyEl.textContent = String(totalQty);
                const totalEl = clone.querySelector('#detailModalTotal');
                if (totalEl) totalEl.textContent = totalPrice.toLocaleString('vi-VN');

                clone.querySelectorAll('.order-detail-compact-grid').forEach(row => {
                    row.style.minHeight = '34px';
                    row.style.height = 'auto';
                    row.style.overflow = 'visible';
                    row.style.alignItems = 'center';
                });
                clone.querySelectorAll('.order-name').forEach(name => {
                    name.style.overflow = 'visible';
                    name.style.textOverflow = 'clip';
                    name.style.whiteSpace = 'normal';
                    name.style.lineHeight = '1.35';
                    name.style.paddingTop = '2px';
                    name.style.paddingBottom = '2px';
                });

                captureHost = document.createElement('div');
                captureHost.setAttribute('aria-hidden', 'true');
                captureHost.style.position = 'fixed';
                captureHost.style.left = '-100000px';
                captureHost.style.top = '0';
                captureHost.style.width = width + 'px';
                captureHost.style.height = 'auto';
                captureHost.style.overflow = 'visible';
                captureHost.style.background = '#ffffff';
                captureHost.style.pointerEvents = 'none';
                captureHost.style.zIndex = '-1';
                captureHost.appendChild(clone);
                document.body.appendChild(captureHost);

                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

                const captureHeight = Math.ceil(clone.scrollHeight) + 4;
                const canvas = await html2canvas(clone, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    width,
                    height: captureHeight,
                    windowWidth: width,
                    windowHeight: captureHeight,
                    scrollX: 0,
                    scrollY: 0
                });

                const blob = await new Promise((resolve, reject) => {
                    canvas.toBlob(result => result ? resolve(result) : reject(new Error("Không tạo được ảnh giỏ hàng.")), 'image/png');
                });

                const fileName = editingOrderId ? `donhang_${String(editingOrderId).replace(/[^a-zA-Z0-9_-]+/g, '_')}.png` : 'giohang.png';
                const file = new File([blob], fileName, { type: 'image/png' });
                const iosPwaFallback = window.TAPHOA_IOS_SHARE_FALLBACK;
                if (iosPwaFallback?.shouldUse?.()) {
                    iosPwaFallback.open([file], { title:'Đơn hàng' });
                } else if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share(legacyOrderSharePayload(file));
                    } catch (error) {
                        if (isNativeShareCancellation(error) && isIosNativeFileShareContext()) {
                            window.TAPHOA_IOS_SHARE_FALLBACK?.open?.([file], { title:'Đơn hàng' });
                        } else {
                            throw error;
                        }
                    }
                } else if (iosPwaFallback) {
                    iosPwaFallback.open([file], { title:'Đơn hàng' });
                } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
            } catch (e) {
                if (!isNativeShareCancellation(e)) showAlertPopup("Lỗi tạo ảnh", e.message);
            } finally {
                captureHost?.remove();
                hideLoading();
            }
        }
