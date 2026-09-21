        function openCustomerDebtModal(maKh) {
            if (!hasPermission('canViewDebt')) return denyPermission('Công nợ chỉ dành cho Owner.');
            activeDebtCustomerId = maKh;
            let kh = appData.khachhang.slice(1).find(r => r[0] == maKh);
            if(!kh) return;
            let tenKh = kh[1];
            let history = (window.customerDebtHistoryData && window.customerDebtHistoryData[maKh]) ? window.customerDebtHistoryData[maKh] : [];

            document.getElementById('cDebtModalName').innerText = "KH: " + tenKh;
            let currentTotalDebt = history.length > 0 ? history[history.length - 1].currentDebt : 0;
            let totalEl = document.getElementById('cDebtModalTotal');
            totalEl.innerText = currentTotalDebt.toLocaleString('vi-VN');
            totalEl.className = `text-[18px] font-extrabold ${currentTotalDebt >= 0 ? 'text-danger' : 'text-success'}`;

            let html = '';
            history.slice().reverse().forEach(h => {
                let isThu = h.soTien < 0;
                let sign = isThu ? "" : "+";
                let badgeColor = isThu ? "text-success bg-green-50" : "text-danger bg-red-50";
                let iconClass = isThu ? "ph-fill ph-arrow-down-left" : "ph-fill ph-push-pin";
                
                let orderIdMatch = h.loaiGd.match(/DG\d+|DT\d+/);
                let clickAttr = orderIdMatch ? `onclick="clickOrderFromDebt('${orderIdMatch[0]}')"` : '';
                let cursorStyle = orderIdMatch ? 'cursor-pointer hover:bg-gray-50' : '';

                html += `
                <div ${clickAttr} class="flex justify-between items-center py-2.5 px-2 rounded-xl transition ${cursorStyle} border-b border-gray-100 text-xs">
                    <div>
                        <p class="font-bold text-gray-900 flex items-center gap-1.5"><i class="${iconClass} ${badgeColor} p-1 rounded"></i> ${h.loaiGd} ${orderIdMatch ? '<i class="ph ph-caret-right text-gray-400"></i>' : ''}</p>
                        <p class="text-[10px] text-gray-400 mt-0.5">${h.time}</p>
                    </div>
                    <div class="text-right">
                        <p class="font-extrabold ${isThu ? 'text-success' : 'text-danger'}">${sign}${h.soTien.toLocaleString('vi-VN')}</p>
                        <p class="text-[10px] text-gray-400 mt-0.5">Nợ ${h.currentDebt.toLocaleString('vi-VN')}</p>
                    </div>
                </div>`;
            });
            if(history.length === 0) html = '<p class="text-center text-gray-400 py-6 text-xs">Chưa có lịch sử giao dịch</p>';
            document.getElementById('cDebtModalHistoryList').innerHTML = html;

            document.getElementById('customerDebtModalWrapper').classList.remove('hidden');
            setTimeout(() => {
                document.getElementById('customerDebtModalWrapper').classList.remove('opacity-0', 'pointer-events-none');
                document.getElementById('customerDebtBottomSheet').classList.remove('translate-y-full');
            }, 10);
        }

        function clickOrderFromDebt(orderId) {
            closeCustomerDebtModal();
            let sheetName = orderId.startsWith("DG") ? "dongiao" : "dontam";
            viewingOrderId = orderId;
            window.activeViewingSheet = sheetName;
            loadOrderIntoCart(orderId, sheetName, { switchToSale: false, showSuccessToast: false });
            setTimeout(() => openCartMobile(), 320);
        }

        function closeCustomerDebtModal() {
            activeDebtCustomerId = null;
            document.getElementById('customerDebtBottomSheet').classList.add('translate-y-full');
            setTimeout(() => {
                document.getElementById('customerDebtModalWrapper').classList.add('pointer-events-none', 'opacity-0');
                setTimeout(() => document.getElementById('customerDebtModalWrapper').classList.add('hidden'), 300);
            }, 300);
        }

        async function shareCustomerDebtImage() {
            const source = document.getElementById('customerDebtContentToShare');
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

                const customerName = String(document.getElementById('cDebtModalName')?.innerText || '')
                    .replace(/^KH:\s*/i, '')
                    .trim();
                if (customerName) {
                    const header = document.createElement('div');
                    header.style.padding = '16px 20px 12px';
                    header.style.background = '#ffffff';
                    header.style.borderBottom = '1px solid #f1f5f9';

                    const title = document.createElement('div');
                    title.textContent = customerName;
                    title.style.fontSize = '16px';
                    title.style.fontWeight = '700';
                    title.style.lineHeight = '1.35';
                    title.style.color = '#111827';

                    const subtitle = document.createElement('div');
                    subtitle.textContent = 'Công nợ';
                    subtitle.style.marginTop = '2px';
                    subtitle.style.fontSize = '11px';
                    subtitle.style.fontWeight = '500';
                    subtitle.style.lineHeight = '1.4';
                    subtitle.style.color = '#94a3b8';

                    header.appendChild(title);
                    header.appendChild(subtitle);
                    clone.insertBefore(header, clone.firstChild);
                }

                const cloneHistory = clone.querySelector('#cDebtModalHistoryList');
                if (cloneHistory) {
                    cloneHistory.removeAttribute('id');
                    cloneHistory.style.height = 'auto';
                    cloneHistory.style.maxHeight = 'none';
                    cloneHistory.style.minHeight = '0';
                    cloneHistory.style.overflow = 'visible';
                    cloneHistory.style.flex = 'none';
                    cloneHistory.style.paddingBottom = '12px';
                }

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
                    canvas.toBlob(result => result ? resolve(result) : reject(new Error("Không tạo được ảnh công nợ.")), 'image/png');
                });

                const file = new File([blob], 'congno.png', { type: 'image/png' });
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: 'Công nợ', text: 'Bảng đối soát công nợ' });
                } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'congno.png';
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

        function requestClearSheet(sheetName) {
            // Đã giao: tuyệt đối không có Xóa toàn bộ. Chỉ xử lý từng đơn theo quyền.
            if (sheetName === 'dongiao') {
                return denyPermission('Đã giao không hỗ trợ Xóa toàn bộ.');
            }
            if (sheetName === 'dontam' && !hasPermission('canClearAllDrafts')) {
                return denyPermission('Tài khoản này không được Xóa toàn bộ Đơn tạm.');
            }
            let sheetText = sheetName === 'dontam' ? 'đơn tạm' : 'đơn đã giao';
            showConfirmModal("Xóa toàn bộ dữ liệu?", `Hành động này sẽ xóa sạch tất cả ${sheetText}. Bạn chắc chắn chứ?`, "Xóa sạch", "bg-danger", 
                async () => {
                    showLoading("Đang xóa toàn bộ...");
                    try {
                        await fetch(SheetDB.API_URL, { method: "POST", headers: {"Content-Type": "text/plain"}, body: JSON.stringify({action: "clear_sheet", sheet: sheetName}) });
                        if (sheetName === 'dongiao') {
                            await fetch(SheetDB.API_URL, { method: "POST", headers: {"Content-Type": "text/plain"}, body: JSON.stringify({action: "clear_sheet", sheet: "thuchi"}) });
                        }
                        await SheetDB.read(sheetName);
                        await SheetDB.read('thuchi');
                        if(sheetName === 'dontam') resetSaleSession();
                        showToast(`Đã xóa sạch ${sheetText}!`, "success");
                    } catch(e) { showAlertPopup("Lỗi", "Không thể xóa: " + e); } finally { hideLoading(); }
                }
            );
        }

        function requestDeleteOrder(sheetName, orderId) {
            if (currentAuthRole === 'user' && sheetName === 'dongiao') {
                return denyPermission('User không được xóa đơn đã giao.');
            }
            showConfirmModal("Xóa đơn hàng", `Bạn có chắc chắn muốn xóa đơn ${orderId} không?`, "Xóa đơn", "bg-danger", 
                async () => {
                    closeOrderMobile(); showLoading("Đang xóa đơn...");
                    try {
                        await fetch(SheetDB.API_URL, { method: "POST", headers: {"Content-Type": "text/plain"}, body: JSON.stringify({action: "delete_order", sheet: sheetName, orderId: orderId}) });
                        
                        if (sheetName === 'dongiao') {
                            await fetch(SheetDB.API_URL, { method: "POST", headers: {"Content-Type": "text/plain"}, body: JSON.stringify({action: "delete_thuchi_by_order", sheet: "thuchi", orderId: orderId}) });
                            await SheetDB.read('thuchi');
                        }

                        await SheetDB.read(sheetName);
                        if (orderId === editingOrderId) {
                            resetSaleSession();
                        } else if(sheetName === 'dontam') {
                            resetSaleSession();
                        }
                        showToast("Đã xóa đơn " + orderId, "success");
                    } catch(e) { showAlertPopup("Lỗi", "Không thể xóa đơn: " + e); } finally { hideLoading(); }
                }
            );
        }

        function loadOrderIntoCart(orderId, sheetName, options = {}) {
            const { switchToSale = false, showSuccessToast = true } = options;
            if (Object.keys(cart).length > 0) { cart = {}; }
            closeOrderMobile();

            let items = appData[sheetName].slice(1).filter(r => String(r[0]).trim() === orderId);
            if (items.length === 0) return;

            let maKh = items[0][1]; let kh = appData.khachhang.find(r => r[0] == maKh);
            selectedCustomer = { id: maKh, name: kh ? kh[1] : maKh };
            document.getElementById('selectedCustomerDisplay').innerText = selectedCustomer.name;

            let spDict = {}; appData.sanpham.slice(1).forEach(sp => { spDict[sp[0]] = sp[1]; });

            cart = {};
            items.forEach(r => {
                let maSp = r[2]; let qty = Number(r[3]); let price = Number(r[4]); let note = String(r[9] || '');
                cart[maSp] = { name: spDict[maSp] || maSp, price: price, qty: qty, note };
            });

            editingOrderId = orderId;
            editingOrderSheet = sheetName;
            editingOrderInSaleMode = Boolean(switchToSale);
            const cartEditBadge = document.getElementById('cartEditBadge');
            if (cartEditBadge) {
                cartEditBadge.innerText = switchToSale ? 'Đang sửa đơn' : 'Đang xem đơn';
                cartEditBadge.classList.remove('hidden');
            }

            renderProductList();
            renderCartUI();
            renderCartFooterActions();

            if (switchToSale) {
                const tabBanHangBtn = document.querySelector('.tab-btn[onclick*="tab-ban-hang"]');
                if (tabBanHangBtn) switchTab('tab-ban-hang', tabBanHangBtn);
            }

            if (showSuccessToast) {
                showToast('Đã nạp đơn ' + orderId + ' vào giỏ hàng', 'success');
            }
        }
