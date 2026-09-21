        function renderDaGiao() {
            if (!hasPermission('canViewDelivered')) return;
            renderOrderTimeFilterUI('dongiao');
            if (!appData.dongiao || appData.dongiao.length <= 1) {
                document.getElementById('completedOrderListContainer').innerHTML = '<p class="text-center text-gray-400 mt-4 text-xs">Chưa có đơn đã giao nào</p>';
                document.getElementById('completedSummaryTableBody').innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-400">Không có dữ liệu</td></tr>';
                document.getElementById('completedCountBadge').innerText = '0'; return;
            }

            let rows = getRowsVisibleForOrderTab('dongiao');
            if (!rows.length) {
                document.getElementById('completedOrderListContainer').innerHTML = '<p class="text-center text-gray-400 mt-4 text-xs">Không có đơn đã giao trong khoảng thời gian này</p>';
                document.getElementById('completedSummaryTableBody').innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-400">Không có dữ liệu</td></tr>';
                document.getElementById('completedCountBadge').innerText = '0';
                return;
            }
            let orders = {}; let sourceSummary = {};
            let spDict = {}; appData.sanpham.slice(1).forEach(sp => { spDict[sp[0]] = { ten: sp[1], von: Number(sp[2]) || 0, nguon: sp[4] || 'Khác' }; });
            let khDict = {}; appData.khachhang.slice(1).forEach(kh => { khDict[kh[0]] = kh[1]; });

            rows.forEach(r => {
                let idDon = r[0]; let maKh = r[1]; let maSp = r[2];
                let sl = Number(r[3]) || 0; let donGia = Number(r[4]) || 0;
                let thoiGian = r[6] || '';
                if (!idDon) return;

                let spInfo = spDict[maSp] || { ten: maSp, von: 0, nguon: 'Khác' };
                let chi = spInfo.von * sl; let thu = donGia * sl; let lai = thu - chi;
                let nguon = spInfo.nguon;

                if (!sourceSummary[nguon]) sourceSummary[nguon] = { sl: 0, chi: 0, thu: 0, lai: 0 };
                sourceSummary[nguon].sl += sl; sourceSummary[nguon].chi += chi; sourceSummary[nguon].thu += thu; sourceSummary[nguon].lai += lai;

                if (!orders[idDon]) {
                    orders[idDon] = { maKh: maKh, tenKh: khDict[maKh] || maKh, thoiGian: thoiGian, tongSl: 0, tongThu: 0, tongLai: 0, countSp: 0, items: [] };
                }
                orders[idDon].tongSl += sl; orders[idDon].tongThu += thu; orders[idDon].tongLai += lai; orders[idDon].countSp += 1;
                orders[idDon].items.push({ code: maSp, name: spInfo.ten || maSp, qty: sl });
            });

            let sumHtml = ''; let tSl = 0, tChi = 0, tThu = 0, tLai = 0;
            for (let ng in sourceSummary) {
                let s = sourceSummary[ng]; tSl += s.sl; tChi += s.chi; tThu += s.thu; tLai += s.lai;
                sumHtml += `
                    <tr class="border-b border-gray-50 hover:bg-gray-50/50">
                        <td class="py-3 font-bold text-gray-800"><button type="button" data-source="${escapeProductEditorValue(ng)}" onclick="openSourceDetailFromCell(this, 'dongiao')" class="allow-fast-click source-summary-link text-left font-bold text-gray-800">${escapeProductEditorValue(ng)}</button></td>
                        <td class="py-3 text-right font-bold text-gray-600">${s.sl}</td>
                        <td class="py-3 text-right font-bold text-gray-500 pr-2">${s.chi.toLocaleString('vi-VN')}</td>
                        <td class="py-3 text-right font-bold text-success pr-2">${s.thu.toLocaleString('vi-VN')}</td>
                        <td class="py-3 text-right font-bold text-success pr-2">${s.lai.toLocaleString('vi-VN')}</td>
                    </tr>`;
            }
            sumHtml += `
                <tr class="summary-total-row font-extrabold text-gray-800">
                    <td class="py-3 pl-1">TỔNG</td><td class="py-3 text-right">${tSl}</td>
                    <td class="py-3 text-right text-gray-500 pr-2">${tChi.toLocaleString('vi-VN')}</td>
                    <td class="py-3 text-right text-success pr-2">${tThu.toLocaleString('vi-VN')}</td>
                    <td class="py-3 text-right text-success pr-2">${tLai.toLocaleString('vi-VN')}</td>
                </tr>`;
            document.getElementById('completedSummaryTableBody').innerHTML = sumHtml;

            let orderHtml = ''; let orderKeys = Object.keys(orders).reverse();
            document.getElementById('completedCountBadge').innerText = orderKeys.length;

            orderKeys.forEach((k, idx) => {
                let o = orders[k];
                let shortTime = o.thoiGian;
                try { let parts = shortTime.split(' '); if(parts.length >= 2) { shortTime = `${parts[0].split('/').slice(0,2).join('/')} ${parts[1].split(':').slice(0,2).join(':')}`; } } catch(e){}
                const productPreview = buildOrderProductPreview(o.items, 2);

                orderHtml += `
                    <div onclick="clickOrder('${k}', 'dongiao')" class="allow-fast-click bg-white rounded-[16px] p-3.5 shadow-sm border border-gray-100 hover:border-success/50 cursor-pointer transition flex justify-between items-center mb-3">
                        <div class="pointer-events-none flex items-center gap-3 min-w-0">
                            <div style="width: 36px; height: 36px;" class="rounded-full bg-green-50 text-success font-extrabold text-sm flex items-center justify-center shrink-0">${orderKeys.length - idx}</div>
                            <div class="min-w-0">
                                <p class="font-bold text-[14px] text-gray-700 truncate">${o.tenKh}</p>
                                <p class="text-[11px] text-gray-400 mt-0.5 truncate">${shortTime} · ${k} · ${o.countSp} mã · ${o.tongSl} SP</p>
                                ${productPreview ? `<p class="order-product-preview text-[10px] text-gray-500 mt-1 truncate">${escapeProductEditorValue(productPreview)}</p>` : ''}
                            </div>
                        </div>
                        <div class="pointer-events-none text-right">
                            <p class="font-extrabold text-[15px] text-gray-900">${o.tongThu.toLocaleString('vi-VN')}</p>
                            <p class="profit-only text-[11px] font-bold text-success mt-0.5">+${o.tongLai.toLocaleString('vi-VN')}</p>
                        </div>
                    </div>`;
            });
            document.getElementById('completedOrderListContainer').innerHTML = orderHtml;
        }

        function renderCongNo() {
            if (!hasPermission('canViewDebt')) return;
            if (!appData.khachhang || appData.khachhang.length <= 1) return;
            let khRows = getCustomerRowsVisibleToCurrentRole();
            
            const quickDebtCustomerEl = document.getElementById('quickDebtCustomer');
            const quickDebtCustomerDisplay = document.getElementById('quickDebtCustomerDisplay');
            if (quickDebtCustomerEl && quickDebtCustomerDisplay) {
                const selectedKh = khRows.find(kh => String(kh[0]) === String(quickDebtCustomerEl.value));
                quickDebtCustomerDisplay.innerText = selectedKh ? selectedKh[1] : 'Chọn khách hàng';
            }

            let customerDebts = {}; let customerHistory = {};
            let nowTime = new Date().getTime();

            khRows.forEach(kh => {
                let maKh = kh[0];
                customerDebts[maKh] = { name: kh[1], debt: 0, lastTime: "--", daysAgo: 0 };
                customerHistory[maKh] = [];
            });

            if (appData.thuchi && appData.thuchi.length > 1) {
                appData.thuchi.slice(1).forEach(r => {
                    let maKh = r[1]; let loaiGd = r[2] || 'Giao dịch'; let soTien = Number(r[3]) || 0; let time = r[4] || '';
                    if (customerDebts[maKh]) {
                        customerDebts[maKh].debt += soTien; 
                        if (time) {
                            customerDebts[maKh].lastTime = time;
                            try {
                                let parts = time.split(' ');
                                if(parts.length >= 2) {
                                    let dateParts = parts[1].split('/');
                                    if(dateParts.length === 3) {
                                        let d = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T${parts[0]}`);
                                        let diffDays = Math.floor((nowTime - d.getTime()) / (1000 * 60 * 60 * 24));
                                        if(diffDays >= 0) customerDebts[maKh].daysAgo = diffDays;
                                    }
                                }
                            } catch(e){}
                        }
                        customerHistory[maKh].push({ loaiGd, soTien, time, currentDebt: customerDebts[maKh].debt });
                    }
                });
            }

            let totalDebt = 0; let debtCount = 0;
            let totalSurplus = 0; let surplusCount = 0;
            let surplusList = []; let debtList = []; let zeroList = [];

            customersArray = Object.keys(customerDebts).map(maKh => ({ maKh, ...customerDebts[maKh] }));

            customersArray.forEach(c => {
                if (c.debt > 0) { totalDebt += c.debt; debtCount++; debtList.push(c); }
                else if (c.debt < 0) { totalSurplus += Math.abs(c.debt); surplusCount++; surplusList.push(c); }
                else { zeroList.push(c); }
            });

            let countNo = debtList.length;
            let countDu = surplusList.length;
            let countHet = zeroList.length;

            document.getElementById('btnFilterNo').innerHTML = `Còn nợ${countNo > 0 ? ` (${countNo})` : ''}`;
            document.getElementById('btnFilterDu').innerHTML = `Đang dư tiền${countDu > 0 ? ` (${countDu})` : ''}`;
            document.getElementById('btnFilterHet').innerHTML = `Đã hết nợ${countHet > 0 ? ` (${countHet})` : ''}`;

            let filteredList = [];
            if (currentDebtFilter === 'no') filteredList = debtList;
            if (currentDebtFilter === 'du') filteredList = surplusList;
            if (currentDebtFilter === 'het') filteredList = zeroList;

            if (currentDebtFilter === 'no') {
                let sortVal = document.getElementById('debtSortSelect').value;
                if (sortVal === 'days') {
                    filteredList.sort((a, b) => b.daysAgo - a.daysAgo);
                } else {
                    filteredList.sort((a, b) => b.debt - a.debt);
                }
                document.getElementById('debtGroupTitle').innerText = `Còn nợ (${filteredList.length})`;
            } else if (currentDebtFilter === 'du') {
                document.getElementById('debtGroupTitle').innerText = `Đang dư tiền (${filteredList.length})`;
            } else {
                document.getElementById('debtGroupTitle').innerText = `Đã hết nợ (${filteredList.length})`;
            }

            let listHtml = '';
            filteredList.forEach((c, idx) => {
                let badgeColor = ['bg-orange-500', 'bg-red-500', 'bg-purple-500', 'bg-blue-500', 'bg-emerald-500'][idx % 5];
                let initials = c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                
                let subText = `GD cuối: ${c.lastTime}`;
                if (currentDebtFilter === 'no' && c.debt > 0) {
                    subText = `GD cuối: ${c.lastTime} · Nợ ${c.daysAgo} ngày`;
                }

                listHtml += `
                    <div onclick="openCustomerDebtModal('${c.maKh}')" class="allow-fast-click bg-white rounded-[16px] p-3.5 shadow-sm border border-gray-100 hover:border-primary/50 cursor-pointer transition flex justify-between items-center">
                        <div class="pointer-events-none flex items-center gap-3">
                            <div style="width: 40px; height: 40px;" class="rounded-full ${badgeColor} text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-sm">${initials}</div>
                            <div>
                                <p class="font-bold text-[14px] text-gray-900">${c.name}</p>
                                <p class="text-[11px] text-gray-400 mt-0.5">${subText}</p>
                            </div>
                        </div>
                        <div class="pointer-events-none text-right">
                            <p class="font-extrabold text-[15px] ${c.debt > 0 ? 'text-danger' : c.debt < 0 ? 'text-success' : 'text-gray-700'}">${Math.abs(c.debt).toLocaleString('vi-VN')}</p>
                        </div>
                    </div>`;
            });

            if (filteredList.length === 0) {
                listHtml = '<p class="text-center text-gray-400 py-10 text-xs">Không có khách hàng nào trong nhóm này</p>';
            }

            document.getElementById('totalDebtDisplay').innerText = totalDebt.toLocaleString('vi-VN');
            document.getElementById('totalDebtCount').innerText = `${debtCount} khách nợ`;
            document.getElementById('totalSurplusDisplay').innerText = totalSurplus.toLocaleString('vi-VN');
            document.getElementById('totalSurplusCount').innerText = `${surplusCount} khách dư`;
            document.getElementById('debtCustomerListContainer').innerHTML = listHtml;
            window.customerDebtHistoryData = customerHistory;
        }

        function setDebtFilter(filterType, btnElement) {
            currentDebtFilter = filterType;
            ['btnFilterNo', 'btnFilterDu', 'btnFilterHet'].forEach(id => {
                let b = document.getElementById(id);
                b.className = "allow-fast-click flex-1 py-1.5 rounded-lg text-gray-500 transition";
            });
            btnElement.className = "allow-fast-click flex-1 py-1.5 rounded-lg bg-white text-gray-900 shadow-sm transition";

            let sortContainer = document.getElementById('sortContainer');
            if(filterType === 'no') {
                sortContainer.style.display = 'flex';
            } else {
                sortContainer.style.display = 'none';
            }
            renderCongNo();
        }
