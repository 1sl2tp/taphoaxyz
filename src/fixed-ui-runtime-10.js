        async function captureLongSourceSharePages(source, baseName, modeLabel) {
            if (!window.html2canvas) throw new Error('Chưa tải thư viện tạo ảnh.');
            let host = null;
            try {
                const sourceWidth = Math.ceil(source.getBoundingClientRect().width || 420);
                const width = Math.min(760, Math.max(420, sourceWidth));
                const pageElements = buildSourceSharePageElements(source, width, modeLabel, 3600);
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
                    const canvas = await html2canvas(pageEl, {
                        scale:2,
                        useCORS:true,
                        backgroundColor:'#ffffff',
                        width,
                        height,
                        windowWidth:width,
                        windowHeight:height,
                        scrollX:0,
                        scrollY:0
                    });
                    if (!canvas.width || !canvas.height) throw new Error(`Ảnh phần ${i+1} không hợp lệ.`);
                    const blob = await canvasToPngBlob(canvas);
                    const suffix = pageElements.length > 1 ? `_${i+1}-${pageElements.length}` : '';
                    files.push(new File([blob], `${baseName}${suffix}.png`, { type:'image/png' }));
                }
                return files;
            } finally {
                host?.remove();
            }
        }

        function shareActiveSourceDetailTab() {
            return shareSourceDetailTab(activeSourceDetailState.tab || 'detail');
        }

        async function shareSourceDetailTab(tabName) {
            const grouped = tabName === 'grouped';
            const source = document.getElementById(grouped ? 'sourceDetailCaptureGrouped' : 'sourceDetailCaptureDetail');
            if (!source) return;
            try {
                showLoading('Đang tạo ảnh đầy đủ...');
                const safeSource = sanitizeSourceShareFileName(activeSourceDetailState.source);
                const mode = grouped ? 'gop' : 'chitiet';
                const modeLabel = grouped ? 'Gộp để gửi NCC' : 'Chi tiết';
                const files = await captureLongSourceSharePages(source, `${safeSource}_${mode}`, modeLabel);
                if (!files.length) throw new Error('Không tạo được ảnh.');

                if (navigator.share && navigator.canShare && navigator.canShare({ files })) {
                    await navigator.share({
                        files,
                        title: `${activeSourceDetailState.source} · ${grouped ? 'Gộp' : 'Chi tiết'}`,
                        text: `${getSourceDetailSheetLabel(activeSourceDetailState.sheetName)} · ${activeSourceDetailState.timeLabel}`
                    });
                } else {
                    files.forEach((file,index) => {
                        const url = URL.createObjectURL(file);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = file.name;
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1500 + index * 100);
                    });
                }
            } catch (e) {
                showAlertPopup('Lỗi tạo ảnh', e?.message || 'Không thể tạo ảnh.');
            } finally {
                hideLoading();
            }
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
                                <p class="text-[11px] text-gray-400 mt-0.5 truncate"><span class="text-[#ea580c] font-extrabold">${k}</span> · ${o.countSp} mã · ${o.tongSl} SP · ${shortTime}</p>
                                ${productPreview ? `<p class="order-product-preview text-[10px] text-gray-500 mt-1 truncate">${escapeProductEditorValue(productPreview)}</p>` : ''}
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
