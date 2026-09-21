        function setOrderTimeFilter(sheetName, mode) {
            if (!orderTimeFilters[sheetName]) return;
            orderTimeFilters[sheetName].mode = mode;
            if (mode !== 'custom') {
                orderTimeFilters[sheetName].from = '';
                orderTimeFilters[sheetName].to = '';
            }
            closeAllOrderTimeFilterMenus();
            renderOrderTimeFilterUI(sheetName);
            if (sheetName === 'dongiao') renderDaGiao();
            else renderDonTam();
        }

        function getVisibleOrderDateBounds(sheetName) {
            const rows = getRowsVisibleToCurrentRole(appData[sheetName]);
            const keys = rows.map(r => parseOrderDateKey(r?.[6])).filter(Boolean).sort();
            const today = getTodayKeyInAppTimezone();
            return { min: keys[0] || today, max: keys[keys.length - 1] || today };
        }



        function promoteOrderTimeModalLayer() {
            const wrap = document.getElementById('orderTimeCustomWrapper');
            const owner = document.querySelector('#appContainer > .content-body');
            if (!wrap) return null;
            if (owner && wrap.parentElement !== owner) owner.appendChild(wrap);
            return wrap;
        }

        function openOrderTimeCustom(sheetName) {
            activeOrderTimeCustomSheet = sheetName;
            promoteOrderTimeModalLayer();
            closeAllOrderTimeFilterMenus();
            const state = orderTimeFilters[sheetName];
            const range = getOrderTimeRange(sheetName);
            const bounds = getVisibleOrderDateBounds(sheetName);
            const from = state.mode === 'all' ? bounds.min : (range.from || bounds.min);
            const to = state.mode === 'all' ? bounds.max : (range.to || bounds.max);
            const fromEl = document.getElementById('orderTimeCustomFrom');
            const toEl = document.getElementById('orderTimeCustomTo');
            const today = getTodayKeyInAppTimezone();
            if (fromEl) {
                fromEl.dataset.max = today;
                fromEl.value = from;
            }
            if (toEl) {
                toEl.dataset.max = today;
                toEl.value = to;
            }
            activeOrderTimeCalendarSide = null;
            document.getElementById('orderTimeCalendar')?.classList.add('hidden');
            refreshOrderTimeCustomDisplays();
            const wrap = document.getElementById('orderTimeCustomWrapper');
            const card = document.getElementById('orderTimeCustomCard');
            if (!wrap || !card) return;
            wrap.classList.remove('hidden');
            wrap.classList.remove('opacity-0','pointer-events-none');
            requestAnimationFrame(() => card.classList.remove('translate-y-full'));
        }

        function updateOrderTimeCustomHint() {
            const from = document.getElementById('orderTimeCustomFrom')?.value || '';
            const to = document.getElementById('orderTimeCustomTo')?.value || '';
            const hint = document.getElementById('orderTimeCustomHint');
            if (!hint) return;
            const rangeText = from && to
                ? (from === to ? formatDateKeyVi(from) : `${formatDateKeyVi(from)} → ${formatDateKeyVi(to)}`)
                : 'Chọn khoảng ngày';
            hint.innerText = `${rangeText} · ${APP_TIME_ZONE}`;
        }

        function refreshOrderTimeCustomDisplays() {
            const from = document.getElementById('orderTimeCustomFrom')?.value || '';
            const to = document.getElementById('orderTimeCustomTo')?.value || '';
            const fromDisplay = document.querySelector('#orderTimeCustomFromDisplay span');
            const toDisplay = document.querySelector('#orderTimeCustomToDisplay span');
            if (fromDisplay) fromDisplay.innerText = from ? formatDateKeyVi(from) : '--/--/----';
            if (toDisplay) toDisplay.innerText = to ? formatDateKeyVi(to) : '--/--/----';

            document.getElementById('orderTimeCustomFromDisplay')?.classList.toggle('border-primary', activeOrderTimeCalendarSide === 'from');
            document.getElementById('orderTimeCustomToDisplay')?.classList.toggle('border-primary', activeOrderTimeCalendarSide === 'to');
            updateOrderTimeCustomHint();
        }

        let activeOrderTimeCalendarSide = null;
        let orderTimeCalendarMonthKey = '';

        function getCalendarMonthKey(dateKey) {
            return String(dateKey || getTodayKeyInAppTimezone()).slice(0,7);
        }

        function openInlineOrderCalendar(side) {
            activeOrderTimeCalendarSide = side === 'to' ? 'to' : 'from';
            const hidden = document.getElementById(activeOrderTimeCalendarSide === 'from' ? 'orderTimeCustomFrom' : 'orderTimeCustomTo');
            const fallback = document.getElementById('orderTimeCustomFrom')?.value || getTodayKeyInAppTimezone();
            orderTimeCalendarMonthKey = getCalendarMonthKey(hidden?.value || fallback);
            document.getElementById('orderTimeCalendar')?.classList.remove('hidden');
            refreshOrderTimeCustomDisplays();
            renderInlineOrderCalendar();
        }

        function closeInlineOrderCalendar() {
            activeOrderTimeCalendarSide = null;
            document.getElementById('orderTimeCalendar')?.classList.add('hidden');
            refreshOrderTimeCustomDisplays();
        }

        function moveInlineOrderCalendarMonth(delta) {
            const m = String(orderTimeCalendarMonthKey || getTodayKeyInAppTimezone().slice(0,7)).match(/^(\d{4})-(\d{2})$/);
            if (!m) return;
            const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
            orderTimeCalendarMonthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
            renderInlineOrderCalendar();
        }

        function renderInlineOrderCalendar() {
            const grid = document.getElementById('orderTimeCalendarGrid');
            const label = document.getElementById('orderTimeCalendarMonthLabel');
            if (!grid || !label) return;

            const m = String(orderTimeCalendarMonthKey || getTodayKeyInAppTimezone().slice(0,7)).match(/^(\d{4})-(\d{2})$/);
            if (!m) return;
            const year = Number(m[1]);
            const month = Number(m[2]);
            label.innerText = `Tháng ${month} ${year}`;

            const first = new Date(Date.UTC(year, month - 1, 1));
            const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
            const mondayOffset = (first.getUTCDay() + 6) % 7;
            const fromEl = document.getElementById('orderTimeCustomFrom');
            const toEl = document.getElementById('orderTimeCustomTo');
            const max = fromEl?.dataset.max || getTodayKeyInAppTimezone();
            const from = fromEl?.value || '';
            const to = toEl?.value || '';
            const today = getTodayKeyInAppTimezone();

            const cells = [];
            for (let i=0;i<mondayOffset;i++) cells.push('<button type="button" class="order-time-day is-outside" disabled></button>');
            for (let day=1; day<=daysInMonth; day++) {
                const key = toDateKey(year,month,day);
                const disabled = !!max && key > max;
                const selected = key === from || key === to;
                const inRange = from && to && key > from && key < to;
                const cls = [
                    'order-time-day','allow-fast-click',
                    selected ? 'is-selected' : '',
                    inRange ? 'is-in-range' : '',
                    key === today ? 'is-today' : ''
                ].filter(Boolean).join(' ');
                cells.push(`<button type="button" ${disabled ? 'disabled' : `onclick="selectInlineOrderCalendarDate('${key}')"`} class="${cls}">${day}</button>`);
            }
            grid.innerHTML = cells.join('');
        }

        function selectInlineOrderCalendarDate(key) {
            const fromEl = document.getElementById('orderTimeCustomFrom');
            const toEl = document.getElementById('orderTimeCustomTo');
            if (!fromEl || !toEl) return;

            if (activeOrderTimeCalendarSide === 'to') {
                toEl.value = key;
                if (!fromEl.value || toEl.value < fromEl.value) fromEl.value = toEl.value;
                closeInlineOrderCalendar();
            } else {
                fromEl.value = key;
                if (!toEl.value || fromEl.value > toEl.value) toEl.value = fromEl.value;
                activeOrderTimeCalendarSide = 'to';
                orderTimeCalendarMonthKey = getCalendarMonthKey(toEl.value);
                refreshOrderTimeCustomDisplays();
                renderInlineOrderCalendar();
            }
        }

        function closeOrderTimeCustom() {
            closeInlineOrderCalendar();
            const wrap = document.getElementById('orderTimeCustomWrapper');
            const card = document.getElementById('orderTimeCustomCard');
            if (!wrap) return;
            card?.classList.add('translate-y-full');
            wrap.classList.add('opacity-0','pointer-events-none');
            setTimeout(() => wrap.classList.add('hidden'), 300);
            activeOrderTimeCustomSheet = null;
        }

        function applyOrderTimeCustom() {
            const sheetName = activeOrderTimeCustomSheet;
            if (!sheetName || !orderTimeFilters[sheetName]) return;
            let from = document.getElementById('orderTimeCustomFrom')?.value || '';
            let to = document.getElementById('orderTimeCustomTo')?.value || '';
            const today = getTodayKeyInAppTimezone();
            if (!from && !to) from = to = today;
            else if (!from) from = to;
            else if (!to) to = from;
            if (from > to) [from, to] = [to, from];
            orderTimeFilters[sheetName] = { mode:'custom', from, to };
            closeOrderTimeCustom();
            renderOrderTimeFilterUI(sheetName);
            if (sheetName === 'dongiao') renderDaGiao();
            else renderDonTam();
        }

        document.addEventListener('click', closeAllOrderTimeFilterMenus);

        let activeSourceDetailState = {
            sheetName: null,
            source: '',
            tab: 'detail',
            detailRows: [],
            groupedRows: [],
            totalQty: 0,
            timeLabel: ''
        };

        function normalizeSourceGroupName(value) {
            return String(value || '').trim().toLocaleLowerCase('vi-VN');
        }

        function groupSourceRowsForSupplier(detailRows) {
            const map = new Map();
            (detailRows || []).forEach(row => {
                const productKey = normalizeSourceGroupName(row.productName);
                const note = String(row.note || '').trim();
                const noteKey = normalizeSourceGroupName(note);
                if (!productKey) return;
                const key = productKey + '||' + noteKey;
                if (!map.has(key)) map.set(key, { productName: row.productName, note, qty: 0 });
                map.get(key).qty += Number(row.qty) || 0;
            });
            return Array.from(map.values()).sort((a,b) => {
                const byName = String(a.productName).localeCompare(String(b.productName), 'vi', { sensitivity:'base' });
                if (byName) return byName;
                return String(a.note || '').localeCompare(String(b.note || ''), 'vi', { sensitivity:'base' });
            });
        }

        function buildSourceDetailData(sheetName, sourceName) {
            const rows = getRowsVisibleForOrderTab(sheetName);
            const spDict = {};
            appData.sanpham.slice(1).forEach(sp => {
                spDict[String(sp[0])] = {
                    productName: String(sp[1] || sp[0] || ''),
                    source: String(sp[4] || 'Khác')
                };
            });
            const customerDict = {};
            appData.khachhang.slice(1).forEach(kh => { customerDict[String(kh[0])] = String(kh[1] || kh[0] || ''); });

            const detailRows = [];
            rows.forEach(r => {
                const product = spDict[String(r[2])] || { productName:String(r[2] || ''), source:'Khác' };
                if (product.source !== sourceName) return;
                detailRows.push({
                    orderId: String(r[0] || ''),
                    productCode: String(r[2] || ''),
                    productName: product.productName,
                    buyerName: customerDict[String(r[1])] || String(r[1] || ''),
                    qty: Number(r[3]) || 0,
                    time: String(r[6] || ''),
                    note: String(r[9] || '').trim()
                });
            });

            const groupedRows = groupSourceRowsForSupplier(detailRows);
            return {
                detailRows,
                groupedRows,
                totalQty: detailRows.reduce((sum,row) => sum + (Number(row.qty) || 0), 0),
                timeLabel: getOrderTimeRange(sheetName).detail || getOrderTimeRange(sheetName).label || ''
            };
        }

        function openSourceDetailFromCell(button, sheetName) {
            const sourceName = String(button?.dataset?.source || '').trim();
            if (!sourceName) return;
            openSourceDetail(sheetName, sourceName);
        }

        function promoteSourceDetailModalLayer() {
            const wrap = document.getElementById('sourceDetailModalWrapper');
            const owner = document.querySelector('#appContainer > .content-body');
            if (!wrap) return null;
            if (owner && wrap.parentElement !== owner) owner.appendChild(wrap);
            return wrap;
        }

