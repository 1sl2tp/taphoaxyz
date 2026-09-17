        function showLoginScreen() {
            const login = document.getElementById('loginScreen');
            const app = document.getElementById('appContainer');
            if (app) app.classList.add('hidden');
            if (login) {
                login.classList.remove('hidden');
                login.classList.add('flex');
            }
            document.getElementById('loginPassword')?.focus({ preventScroll: true });
        }

        function showAppScreen() {
            const login = document.getElementById('loginScreen');
            const app = document.getElementById('appContainer');
            if (login) {
                login.classList.add('hidden');
                login.classList.remove('flex');
            }
            if (app) app.classList.remove('hidden');
            applyRolePermissions();
        }

        function submitPreviewLogin(event) {
            event?.preventDefault();
            const username = String(document.getElementById('loginUsername')?.value || '').trim();
            const password = String(document.getElementById('loginPassword')?.value || '');

            if (!username || !password) {
                const missing = !username ? 'tài khoản' : 'mật khẩu';
                showAlertPopup('Chưa đủ thông tin', 'Vui lòng nhập ' + missing + '.');
                return;
            }

            // PREVIEW ONLY: username "owner" / "admin" / "user" để test permission contract.
            // Production: role phải lấy từ Supabase auth/profile + RLS, tuyệt đối không suy từ username.
            const normalizedUsername = username.toLowerCase();
            const previewRole = normalizedUsername === 'owner'
                ? 'owner'
                : (normalizedUsername === 'user' ? 'user' : 'admin');
            setAuthRole(previewRole);

            localStorage.setItem('APP_LOGIN', '1');
            sessionStorage.setItem('APP_LOGIN', '1');
            document.getElementById('loginPassword').value = '';
            showAppScreen();
            showToast('Đăng nhập thành công.', 'success');
        }

        function logoutApp() {
            showConfirmModal(
                'Thoát tài khoản?',
                'Bạn có chắc muốn thoát khỏi tài khoản hiện tại?',
                'Thoát',
                'bg-danger',
                () => {
                    ['APP_SESSION','AUTH_TOKEN','ACCESS_TOKEN','APP_ROLE'].forEach(key => {
                        localStorage.removeItem(key);
                        sessionStorage.removeItem(key);
                    });
                    currentAuthRole = 'admin';
                    localStorage.setItem('APP_LOGIN', '0');
                    sessionStorage.setItem('APP_LOGIN', '0');
                    resetSaleSession();
                    showLoginScreen();
                }
            );
        }

        async function loadData() {
            /*
             * SUPABASE DATA CONTRACT (production):
             * - owner: được SELECT đầy đủ Giá vốn + Công nợ.
             * - admin: toàn quyền quản trị; được SELECT dữ liệu cần thiết cho Giá vốn / Chi / Thu / Lãi / Công nợ và các mutation quản trị theo policy.
             * - user: product SELECT/view KHÔNG chứa Giá vốn và không chứa dữ liệu nhạy cảm suy ra Lãi.
             * - admin: được SELECT và mutation Công nợ theo policy quản trị.
             * - user: chỉ được SELECT read-only projection Công nợ của chính họ; cấm INSERT/UPDATE/DELETE Công nợ.
             * - user: được SELECT read-only projection Đã giao để xem đơn; cấm sửa SL/INSERT/UPDATE/DELETE Đã giao.
             * - user: cấm thao tác Xóa toàn bộ ở cả Đã giao và Đơn tạm.
             * - user: backend/RLS chỉ cho ghi phạm vi Đơn tạm theo rule nghiệp vụ.
             * Preview hiện còn SheetDB/sample nên vẫn dùng bộ dữ liệu demo để dựng UI.
             */ 
            try { 
                await Promise.all([
                    SheetDB.read('sanpham'), 
                    SheetDB.read('khachhang'), 
                    SheetDB.read('dontam'), 
                    SheetDB.read('dongiao'), 
                    SheetDB.read('thuchi')
                ]); 
            } catch(e) { console.error(e); } 
        }
        
        window.onload = function() {
            loadUiPreferences();
            const apiInput = document.getElementById('inputScriptUrl');
            if (apiInput) apiInput.value = SheetDB.API_URL;

            const loginState = localStorage.getItem('APP_LOGIN');
            if (loginState === '1') {
                const savedRole = localStorage.getItem('APP_ROLE');
                currentAuthRole = ['owner', 'admin', 'user'].includes(savedRole) ? savedRole : 'admin';
                showAppScreen();
            } else if (loginState === '0') {
                showLoginScreen();
            } else {
                currentAuthRole = 'admin';
                showAppScreen();
            }

            if (SheetDB.API_URL) loadData();
        };
        
        SheetDB.onChange(function(sheetName, data) {
            if (sheetName === 'sanpham') { appData.sanpham = data || []; buildProductSearchIndex(); renderSourceTags(); renderProductList(); renderDonTam(); renderDaGiao(); }
            if (sheetName === 'khachhang') { appData.khachhang = data || []; if (currentAuthRole === 'user') syncUserSelfCustomer(); renderCustomerList(); renderDonTam(); renderDaGiao(); renderCongNo(); renderCartFooterActions(); }
            if (sheetName === 'dontam') { appData.dontam = data || []; renderDonTam(); }
            if (sheetName === 'dongiao') { appData.dongiao = data || []; renderDaGiao(); }
            if (sheetName === 'thuchi') { appData.thuchi = data || []; renderCongNo(); if(activeDebtCustomerId) openCustomerDebtModal(activeDebtCustomerId); }
        });

        function normalizeSearchText(value) {
            return String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[đĐ]/g, 'd')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, ' ')
                .trim()
                .replace(/\s+/g, ' ');
        }

        function buildProductSearchIndex() {
            const rows = (appData.sanpham && appData.sanpham.length > 1)
                ? appData.sanpham.slice(1)
                : [];

            productSearchIndex = rows
                .filter(row => String(row?.[1] || '').trim())
                .map(row => {
                    const nameRaw = String(row[1] || '').trim();
                    const codeRaw = String(row[0] || '').trim();
                    const sourceRaw = String(row[4] || '').trim();
                    const nameNorm = normalizeSearchText(nameRaw);
                    const codeNorm = normalizeSearchText(codeRaw);
                    return {
                        row,
                        nameRaw,
                        sourceRaw,
                        nameNorm,
                        codeNorm,
                        nameTokens: nameNorm ? nameNorm.split(' ') : []
                    };
                })
                .sort((a, b) => a.nameRaw.localeCompare(
                    b.nameRaw,
                    'vi',
                    { sensitivity: 'base' }
                ));

            productSearchIndexSource = appData.sanpham;
        }

        function ensureProductSearchIndex() {
            if (productSearchIndexSource !== appData.sanpham) {
                buildProductSearchIndex();
            }
        }

        function matchesSearchTokens(entry, queryTokens) {
            if (!queryTokens.length) return true;

            return queryTokens.every(queryToken => {
                if (!queryToken) return true;

                if (entry.codeNorm && entry.codeNorm.includes(queryToken)) return true;

                return entry.nameTokens.some(nameToken =>
                    nameToken === queryToken || nameToken.startsWith(queryToken)
                );
            });
        }

        function getFilteredProductsFromSearchIndex(queryRaw) {
            ensureProductSearchIndex();

            const queryNorm = normalizeSearchText(queryRaw);
            const queryTokens = queryNorm ? queryNorm.split(' ').filter(Boolean) : [];

            return productSearchIndex
                .filter(entry => {
                    const matchSource = currentFilter === 'Tất cả' || entry.sourceRaw === currentFilter;
                    return matchSource && matchesSearchTokens(entry, queryTokens);
                })
                .map(entry => entry.row);
        }

        function scheduleProductSearchRender() {
            if (productSearchRenderFrame) cancelAnimationFrame(productSearchRenderFrame);
            productSearchRenderFrame = requestAnimationFrame(() => {
                productSearchRenderFrame = 0;
                renderProductList();
            });
        }

        function renderSourceTags() {
            if(!appData.sanpham || appData.sanpham.length <= 1) return;
            let rows = appData.sanpham.slice(1); let sources = new Set(); rows.forEach(r => { if(r[4]) sources.add(r[4].trim()); });
            let html = ['Tất cả', ...Array.from(sources)].map(src => {
                let activeClass = (src === currentFilter) ? 'bg-primary text-white shadow-sm' : 'border border-gray-200 text-gray-600 hover:bg-gray-50';
                return `<button onclick="filterSource('${src}')" class="allow-fast-click px-4 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap shrink-0 transition ${activeClass}">${src}</button>`;
            }).join('');
            document.getElementById('sourceTagsContainer').innerHTML = html;
        }

        function filterSource(src) { currentFilter = src; renderSourceTags(); renderProductList(); }

        function renderProductList() {
            if(!appData.sanpham || appData.sanpham.length <= 1) return;
            const query = document.getElementById('searchProductInput')?.value || '';
            const filtered = getFilteredProductsFromSearchIndex(query);
            if (filtered.length === 0) { document.getElementById('productList').innerHTML = `<div class="py-10 text-center text-gray-400 text-sm">Không tìm thấy sản phẩm.</div>`; return; }
            document.getElementById('productList').innerHTML = filtered.map(r => {
                let maSp = r[0]; let tenSp = r[1]; let giaBan = Number(r[3]) || 0; let qty = cart[maSp] ? cart[maSp].qty : 0;
                const imageHtml = productViewMode === 'image'
                    ? `<img src="${getProductImageSrc(r)}" alt="" class="product-thumb shrink-0" loading="lazy">`
                    : '';
                return `
                <div class="bg-white rounded-[16px] p-3.5 shadow-sm border border-gray-100 flex justify-between items-center hover:border-primary/30 transition">
                    <div class="flex items-center min-w-0 flex-1 pr-3 gap-3">
                        ${imageHtml}
                        <div class="min-w-0 flex-1">
                            <p class="font-bold text-[15px] text-gray-900 line-clamp-1">${tenSp}</p>
                            <p class="text-[13px] font-bold text-primary mt-1">${giaBan.toLocaleString('vi-VN')}</p>
                        </div>
                    </div>
                    <div class="flex items-center shrink-0">
                        <div class="flex items-center gap-1 border border-gray-200 rounded-full px-2 py-1 bg-white shadow-sm">
                            <button onclick="updateCart('${maSp}', '${tenSp}', ${giaBan}, -1)" class="allow-fast-click w-6 h-6 flex items-center justify-center text-gray-500 hover:text-dark shrink-0"><i class="ph-bold ph-minus text-[10px]"></i></button>
                            <input type="number" value="${qty}" min="1" step="1" inputmode="numeric" data-qty-editor="product" data-qty-id="${maSp}" data-qty-price="${giaBan}" onfocus="selectQtyInputValue(this)" onmouseup="event.preventDefault(); selectQtyInputValue(this)" oninput="previewQtyInput(this)" onblur="commitQtyEditor(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}" class="qty-edit-input w-7 text-center font-bold text-gray-900 bg-transparent focus:outline-none text-[12px]">
                            <button onclick="updateCart('${maSp}', '${tenSp}', ${giaBan}, 1)" class="allow-fast-click w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center active:scale-95 shrink-0"><i class="ph-bold ph-plus text-[10px]"></i></button>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }

        function selectQtyInputValue(input) {
            if (!input) return;
            requestAnimationFrame(() => {
                try { input.select(); } catch (e) {}
            });
        }

        function getQtyMeta(maSp, input) {
            const row = appData.sanpham.slice(1).find(r => String(r[0]) === String(maSp));
            const existing = cart[maSp];
            return {
                name: row?.[1] || existing?.name || maSp,
                price: Number(input?.dataset.qtyPrice) || Number(row?.[3]) || Number(existing?.price) || 0
            };
        }

        function clampQty(value, fallback = 1) {
            const n = Number.parseInt(value, 10);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(1, n);
        }

        function syncQtyEditors(maSp, qty, sourceInput = null) {
            document.querySelectorAll('[data-qty-id]').forEach(el => {
                if (el === sourceInput) return;
                if (String(el.dataset.qtyId) === String(maSp) && document.activeElement !== el) {
                    el.value = qty;
                }
            });
        }

