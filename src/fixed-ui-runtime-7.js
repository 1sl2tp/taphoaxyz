        async function dayToanBoGioHang(tab) {
            if (currentAuthRole === 'user' && tab === 'dongiao') {
                return denyPermission('User chỉ được tạo Đơn tạm, không được Bán ngay.');
            }
            if (currentAuthRole === 'user' && tab === 'dontam' && editingOrderSheet === 'dongiao') {
                return denyPermission('Đơn đã giao chỉ để xem. Hãy quay lại Bán hàng để tạo Đơn tạm mới.');
            }
            if (tab === 'dontam' && !hasPermission('canCreateDraft')) {
                return denyPermission('Tài khoản này không được tạo Đơn tạm.');
            }
            if (!selectedCustomer.id) { showAlertPopup("Lỗi thao tác", "Vui lòng chọn khách hàng trước khi đẩy đơn!"); openCustomerModal(); return; }
            if (Object.keys(cart).length === 0) { showAlertPopup("Giỏ hàng trống", "Vui lòng chọn ít nhất 1 sản phẩm!"); return; }

            showLoading("Đang xử lý đẩy đơn...");
            let currentTime = formatNowInAppTimezone();
            let totalAll = 0;
            let orderId = editingOrderId || (tab === 'dongiao' ? "DG" : "DT") + String(Date.now()).slice(-3); 
            let finalTime = currentTime;

            try {
                if (editingOrderId) {
                    let targetSheet = editingOrderSheet || (editingOrderId.startsWith("DG") ? "dongiao" : "dontam");
                    let oldItems = appData[targetSheet].slice(1).filter(r => String(r[0]).trim() === editingOrderId);
                    if (oldItems.length > 0 && oldItems[0][6]) { finalTime = oldItems[0][6]; }

                    let rowsData = [];
                    for (let id in cart) {
                        let item = cart[id]; let tong = item.qty * item.price; totalAll += tong;
                        rowsData.push([orderId, selectedCustomer.id, id, item.qty, item.price, tong, finalTime]);
                    }

                    await fetch(SheetDB.API_URL, { 
                        method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, 
                        body: JSON.stringify({action: "update_order", sheet: targetSheet, orderId: editingOrderId, rowsData: rowsData}) 
                    });

                    if (targetSheet === "dongiao") {
                        await fetch(SheetDB.API_URL, { 
                            method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, 
                            body: JSON.stringify({action: "update_thuchi", orderId: editingOrderId, maKh: selectedCustomer.id, soTien: totalAll}) 
                        });
                    }
                } else {
                    for (let id in cart) {
                        let item = cart[id]; let tong = item.qty * item.price; totalAll += tong;
                        await fetch(SheetDB.API_URL, { method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify({action: "add", sheet: tab, data: [orderId, selectedCustomer.id, id, item.qty, item.price, tong, finalTime]}) });
                    }

                    if (tab === 'dongiao') {
                        let idGd = "GD" + String(Date.now()).slice(-3);
                        let thuchiData = [idGd, selectedCustomer.id, "Ghi nợ đơn " + orderId, String(totalAll), finalTime];
                        await fetch(SheetDB.API_URL, { method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify({action: "add", sheet: "thuchi", data: thuchiData}) });
                    }
                }
                
                showToast(editingOrderId ? "Đã cập nhật đơn thành công!" : "Đã đẩy đơn thành công!", "success");
                resetSaleSession(); 
                closeCartMobile();
                
                SheetDB.read('dontam'); SheetDB.read('dongiao'); SheetDB.read('thuchi');
            } catch(e) { console.error(e); showAlertPopup("Lỗi mạng", "Có lỗi kết nối khi đẩy đơn!"); } 
            finally { hideLoading(); }
        }

        async function submitQuickDebt(type, targetMaKh = null, targetAmount = null) {
            if (!hasPermission('canMutateDebt')) return denyPermission('Tài khoản này chỉ được xem Công nợ, không được Thu tiền/Ghi nợ.');
            let maKh = targetMaKh || document.getElementById('quickDebtCustomer').value;
            let amountStr = targetAmount !== null ? String(targetAmount) : document.getElementById('quickDebtAmount').value.trim();
            let amount = Number(amountStr) || 0;

            if (!maKh) { showAlertPopup("Chưa chọn khách", "Vui lòng chọn khách hàng!"); return; }
            if (amount <= 0) { showAlertPopup("Số tiền không hợp lệ", "Vui lòng nhập số tiền lớn hơn 0!"); return; }

            showLoading("Đang lập phiếu...");
            let time = formatNowInAppTimezone();
            let idGd = "GD" + String(Date.now()).slice(-3);
            let loaiGd = (type === 'thu') ? "Thu tiền mặt" : "Ghi nợ phát sinh";
            let finalSoTien = (type === 'thu') ? -amount : amount;

            try {
                let thuchiData = [idGd, maKh, loaiGd, String(finalSoTien), time];
                await fetch(SheetDB.API_URL, { 
                    method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, 
                    body: JSON.stringify({action: "add", sheet: "thuchi", data: thuchiData}) 
                });

                showToast("Lập phiếu thành công!", "success");
                if(!targetAmount) document.getElementById('quickDebtAmount').value = "";
                if(activeDebtCustomerId) openCustomerDebtModal(activeDebtCustomerId);
                SheetDB.read('thuchi');
            } catch(e) {
                showAlertPopup("Lỗi", "Không thể lưu phiếu: " + e);
            } finally {
                hideLoading();
            }
        }

        function submitPopupDebt(type) {
            let amount = document.getElementById('popupDebtAmount').value.trim();
            if(!activeDebtCustomerId) return;
            submitQuickDebt(type, activeDebtCustomerId, amount);
            document.getElementById('popupDebtAmount').value = "";
        }

        async function tuDongTaoMaThieu() {
            showLoading("Đang yêu cầu máy chủ tạo mã...");
            try {
                let response = await fetch(SheetDB.API_URL, {
                    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify({ action: "autofill", sheet: "sanpham" })
                });
                let result = await response.json();
                if (result.status === "success") { showToast(`Đã xử lý ${result.count} dòng.`, "success"); await SheetDB.read('sanpham'); }
                else { showAlertPopup("Lỗi máy chủ", result.message); }
            } catch(e) { showToast("Đang làm mới dữ liệu...", "warning"); setTimeout(() => { SheetDB.read('sanpham'); hideLoading(); }, 2000); } 
            finally { hideLoading(); }
        }

        // ==========================================
        // 6. RENDER DỮ LIỆU CÁC TAB
        // ==========================================
        const APP_TIME_ZONE = 'Asia/Ho_Chi_Minh';
        const orderTimeFilters = {
            dongiao: { mode: 'today', from: '', to: '' },
            dontam: { mode: 'all', from: '', to: '' }
        };
        let activeOrderTimeCustomSheet = null;

        function getTzDateParts(date = new Date()) {
            const parts = new Intl.DateTimeFormat('en-CA', {
                timeZone: APP_TIME_ZONE,
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).formatToParts(date);
            const map = {};
            parts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });
            return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
        }

        function toDateKey(y, m, d) {
            return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        }

        function getTodayKeyInAppTimezone() {
            const p = getTzDateParts();
            return toDateKey(p.year, p.month, p.day);
        }


        function formatNowInAppTimezone(date = new Date()) {
            const parts = new Intl.DateTimeFormat('en-GB', {
                timeZone: APP_TIME_ZONE,
                year:'numeric', month:'2-digit', day:'2-digit',
                hour:'2-digit', minute:'2-digit', second:'2-digit',
                hour12:false
            }).formatToParts(date);
            const map = {};
            parts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });
            return `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}:${map.second}`;
        }

        function parseOrderDateKey(value) {
            const m = String(value || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (!m) return '';
            return toDateKey(Number(m[3]), Number(m[2]), Number(m[1]));
        }

        function dateKeyToUtcDate(key) {
            const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m) return null;
            return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
        }

        function addDaysToDateKey(key, days) {
            const d = dateKeyToUtcDate(key);
            if (!d) return key;
            d.setUTCDate(d.getUTCDate() + days);
            return toDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
        }

        function getMondayDateKey(key) {
            const d = dateKeyToUtcDate(key);
            if (!d) return key;
            const day = d.getUTCDay();
            const diff = day === 0 ? -6 : 1 - day;
            return addDaysToDateKey(key, diff);
        }

        function formatDateKeyVi(key) {
            const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
            return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
        }

        function getWeekdayLabelVi(key) {
            const d = dateKeyToUtcDate(key);
            if (!d) return '';
            const raw = new Intl.DateTimeFormat('vi-VN', { weekday:'long', timeZone:'UTC' }).format(d);
            return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
        }

        function getOrderTimeRange(sheetName) {
            const state = orderTimeFilters[sheetName] || orderTimeFilters.dontam;
            const today = getTodayKeyInAppTimezone();
            if (state.mode === 'all') return { from:'', to:'', label:'Tất cả', detail:'Tất cả thời gian' };
            if (state.mode === 'today') return { from:today, to:today, label:'Hôm nay', detail:`${getWeekdayLabelVi(today)}, ngày ${formatDateKeyVi(today)}` };
            if (state.mode === 'yesterday') {
                const day = addDaysToDateKey(today, -1);
                return { from:day, to:day, label:'Hôm qua', detail:`${getWeekdayLabelVi(day)}, ngày ${formatDateKeyVi(day)}` };
            }
            if (state.mode === 'week') {
                const from = getMondayDateKey(today);
                return { from, to:today, label:'Tuần', detail:`${formatDateKeyVi(from)} → ${formatDateKeyVi(today)}` };
            }
            if (state.mode === 'month') {
                const from = `${today.slice(0,7)}-01`;
                return { from, to:today, label:'Tháng', detail:`Tháng ${today.slice(5,7)}/${today.slice(0,4)} · đến ${formatDateKeyVi(today)}` };
            }
            if (state.mode === 'year') {
                const from = `${today.slice(0,4)}-01-01`;
                return { from, to:today, label:'Năm', detail:`Năm ${today.slice(0,4)} · đến ${formatDateKeyVi(today)}` };
            }
            let from = state.from || today;
            let to = state.to || from;
            if (from > to) [from, to] = [to, from];
            return { from, to, label:'Tùy chọn', detail: from === to ? formatDateKeyVi(from) : `${formatDateKeyVi(from)} → ${formatDateKeyVi(to)}` };
        }

        function orderRowMatchesTimeFilter(row, sheetName) {
            const range = getOrderTimeRange(sheetName);
            if (!range.from && !range.to) return true;
            const key = parseOrderDateKey(row?.[6]);
            if (!key) return false;
            return key >= range.from && key <= range.to;
        }

        function getRowsVisibleForOrderTab(sheetName) {
            const source = appData[sheetName];
            return getRowsVisibleToCurrentRole(source).filter(row => orderRowMatchesTimeFilter(row, sheetName));
        }

        function renderOrderTimeFilterUI(sheetName) {
            const isDelivered = sheetName === 'dongiao';
            const range = getOrderTimeRange(sheetName);
            const buttonLabel = document.getElementById(isDelivered ? 'completedTimeFilterButtonLabel' : 'pendingTimeFilterButtonLabel');
            const dateLabel = document.getElementById(isDelivered ? 'completedTimeFilterDateLabel' : 'pendingTimeFilterDateLabel');
            if (buttonLabel) buttonLabel.innerText = range.label;
            if (dateLabel) dateLabel.innerText = range.detail;
        }

        function closeAllOrderTimeFilterMenus() {
            document.getElementById('completedTimeFilterMenu')?.classList.add('hidden');
            document.getElementById('pendingTimeFilterMenu')?.classList.add('hidden');
        }

        function toggleOrderTimeFilterMenu(sheetName, event) {
            event?.stopPropagation();
            const id = sheetName === 'dongiao' ? 'completedTimeFilterMenu' : 'pendingTimeFilterMenu';
            const target = document.getElementById(id);
            const willOpen = target?.classList.contains('hidden');
            closeAllOrderTimeFilterMenus();
            if (willOpen) target?.classList.remove('hidden');
        }

