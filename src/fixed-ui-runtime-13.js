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

        function populateOrderDetailContent(orderId, sheetName) {
            document.getElementById('detailModalTitle').innerText = orderId;

            let items = appData[sheetName].slice(1).filter(r => String(r[0]).trim() === orderId);
            if(items.length === 0) return false;

            let maKh = items[0][1]; let timeStr = items[0][6] || '';
            let spDict = {}; appData.sanpham.slice(1).forEach(sp => { spDict[sp[0]] = sp[1]; });

            let html = ''; let total = 0; let totalQty = 0;
            items.forEach((r, idx) => {
                let tenSp = spDict[r[2]] || r[2];
                let donGia = Number(r[4]) || 0;
                let sl = Number(r[3]) || 0;
                let tTien = Number(r[5]) || 0;
                total += tTien;
                totalQty += sl;
                html += `
                <div class="order-detail-compact-grid py-2 border-b border-gray-50 text-[12px]">
                    <div class="order-stt font-bold text-gray-400">${idx+1}</div>
                    <div class="order-name font-bold text-gray-900 leading-tight">${tenSp}</div>
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
            return true;
        }

        function showOrderDetailMobile(orderId, sheetName) {
            let modalWrap = document.getElementById('orderDetailModalWrapper');
            if(!modalWrap) return;
            if (!populateOrderDetailContent(orderId, sheetName)) return;

            modalWrap.classList.remove('hidden', 'opacity-0', 'pointer-events-none');
            setTimeout(() => {
                let bottomSheet = document.getElementById('orderDetailBottomSheet');
                if(bottomSheet) bottomSheet.classList.remove('translate-y-full');
            }, 10);
        }

        async function shareLoadedOrderImage() {
            if (!editingOrderId || !editingOrderSheet) return;
            if (!populateOrderDetailContent(editingOrderId, editingOrderSheet)) return;
            await shareOrderImage();
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
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: 'Đơn hàng', text: 'Chi tiết đơn hàng' });
                } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'donhang.png';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
            } catch (e) {
                showAlertPopup("Lỗi tạo ảnh", e.message);
            } finally {
                captureHost?.remove();
                hideLoading();
            }
        }
