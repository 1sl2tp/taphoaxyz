
        document.addEventListener('click', function(e) {
            if (document.activeElement && document.activeElement.tagName === 'BUTTON') { document.activeElement.blur(); }
            let el = e.target.closest('button') || e.target.closest('[onclick]');
            if (!el || el.tagName.toLowerCase() === 'input' || el.classList.contains('allow-fast-click')) return;
            if (el.dataset.isLocked === "true") { e.preventDefault(); e.stopPropagation(); return; }

            el.dataset.isLocked = "true";
            let oldOpacity = el.style.opacity;
            el.style.opacity = "0.6"; el.style.pointerEvents = "none";

            setTimeout(() => { el.dataset.isLocked = "false"; el.style.opacity = oldOpacity; el.style.pointerEvents = "auto"; }, 1500); 
        }, true); 

        let confirmActionCallback = null;
        function showConfirmModal(title, desc, btnText, btnColorClass, callback) {
            document.getElementById('confirmTitle').innerText = title; document.getElementById('confirmDesc').innerText = desc;
            let btn = document.getElementById('confirmBtn'); btn.innerText = btnText; btn.className = `flex-1 py-2.5 rounded-xl text-white font-bold transition allow-fast-click ${btnColorClass}`;
            confirmActionCallback = callback;
            let modal = document.getElementById('confirmModal'); modal.classList.remove('opacity-0', 'pointer-events-none'); document.getElementById('confirmBox').classList.remove('scale-95');
        }
        function closeConfirmModal() { document.getElementById('confirmModal').classList.add('opacity-0', 'pointer-events-none'); document.getElementById('confirmBox').classList.add('scale-95'); confirmActionCallback = null; }
        document.getElementById('confirmBtn').addEventListener('click', () => { if (confirmActionCallback) confirmActionCallback(); closeConfirmModal(); });

        function showAlertPopup(title, desc) {
            document.getElementById('alertTitle').innerText = title; document.getElementById('alertDesc').innerText = desc;
            let modal = document.getElementById('alertModal'); modal.classList.remove('opacity-0', 'pointer-events-none'); document.getElementById('alertBox').classList.remove('scale-95');
        }
        function closeAlertModal() { document.getElementById('alertModal').classList.add('opacity-0', 'pointer-events-none'); document.getElementById('alertBox').classList.add('scale-95'); }

        function showToast(msg, type = "success") {
            const statusBar = document.getElementById('statusBar'); const statusMsg = document.getElementById('statusMessage'); const statusIcon = document.getElementById('statusIcon');
            if (statusBar && statusMsg) {
                statusMsg.innerText = msg;
                if(type === "success") {
                    statusBar.classList.remove('bg-dark', 'bg-warning'); statusBar.classList.add('bg-primary');
                    statusIcon.classList.remove('text-success', 'ph-warning-circle'); statusIcon.classList.add('text-white', 'ph-check-circle');
                    statusMsg.classList.add('text-white');
                } else {
                    statusBar.classList.remove('bg-dark', 'bg-primary'); statusBar.classList.add('bg-warning');
                    statusIcon.classList.remove('text-success', 'ph-check-circle'); statusIcon.classList.add('text-white', 'ph-warning-circle');
                    statusMsg.classList.add('text-white');
                }
                setTimeout(() => {
                    statusMsg.innerText = "Hệ thống sẵn sàng";
                    statusBar.classList.add('bg-dark'); statusBar.classList.remove('bg-primary', 'bg-warning');
                    statusIcon.classList.add('text-success', 'ph-check-circle'); statusIcon.classList.remove('text-white', 'ph-warning-circle');
                    statusMsg.classList.remove('text-white');
                }, 3000);
            }
        }

        function showLoading(msg = "Đang xử lý...") { const overlay = document.getElementById('loadingOverlay'); const text = document.getElementById('loadingText'); if (text) text.innerText = msg; if (overlay) overlay.classList.remove('hidden', 'opacity-0'); }
        function hideLoading() { const overlay = document.getElementById('loadingOverlay'); if (overlay) { overlay.classList.add('opacity-0'); setTimeout(() => overlay.classList.add('hidden'), 300); } }

        const SheetDB = {
            API_URL: "taphoa://production",
            cache: {}, listeners: [],
            init: function() { this.API_URL = "taphoa://production"; },
            onChange: function(callback) { this.listeners.push(callback); },
            notifyListeners: function(sheetName) { this.listeners.forEach(cb => cb(sheetName, this.cache[sheetName])); },
            read: async function(sheetName) {
                if (!this.API_URL) return null;
                try { 
                    let res = await fetch(`${this.API_URL}?sheet=${sheetName}&t=${new Date().getTime()}`); 
                    let rows = await res.json(); 
                    if(rows) { this.cache[sheetName] = rows; this.notifyListeners(sheetName); } 
                    return rows; 
                } catch (e) { console.error("Lỗi đọc sheet " + sheetName, e); return []; }
            }
        };

        let appData = { sanpham: [], khachhang: [], dontam: [], dongiao: [], thuchi: [] };
        /*
         * ===============================================================
         * AUTH / PERMISSION CONTRACT — LOCKED FOR FUTURE SUPABASE
         * Admin là BASELINE toàn quyền. Mọi ẩn/khóa chỉ là overlay dành riêng cho User.
         * ===============================================================
         * owner
         *   - Full: Giá vốn, Lãi, Công nợ, Bán ngay, Đã giao, xóa/cập nhật Đã giao.
         * admin
         *   - TOÀN QUYỀN mặc định: cùng quyền vận hành với Owner trong preview.
         *   - Thấy Giá vốn / Chi / Thu / Lãi / Công nợ.
         *   - Được Lập phiếu nhanh, Thu tiền/Ghi nợ, Cập nhật sản phẩm, Bán ngay, quản lý Đã giao.
         *   - Đã giao chỉ xóa từng đơn; không có Xóa toàn bộ.
         * user
         *   - VẪN có Bán hàng để xem giá / chọn hàng.
         *   - Ở Bán hàng, User tự gắn khách hàng là chính tài khoản của họ; không bắt chọn khách.
         *   - Đơn tạm / Đã giao / Công nợ của User chỉ đọc dữ liệu thuộc customer_id của chính họ.
         *   - User vẫn được dùng bộ lọc thời gian ở Đơn tạm / Đã giao như Admin.
         *   - CHỈ được tạo/làm việc với Đơn tạm; KHÔNG Bán ngay.
         *   - ĐƯỢC xem Đã giao nhưng CHỈ ĐỌC; không sửa SL/cập nhật/xóa.
         *   - Khi xem Đã giao: ẩn toàn bộ action footer của Giỏ (Xóa/Sửa/Cập nhật).
         *   - Khi rời Đã giao về Bán hàng/Đơn tạm: xóa preview state Đã giao để User tạo Đơn tạm mới bình thường.
         *   - KHÔNG được Xóa toàn bộ Đơn tạm; Đã giao không có Xóa toàn bộ cho bất kỳ role nào.
         *   - ĐƯỢC xem Công nợ nhưng CHỈ ĐỌC; không Thu tiền / Ghi nợ.
         *   - KHÔNG thấy Giá vốn / Lãi.
         *
         * SECURITY NOTE — BẮT BUỘC KHI NỐI SUPABASE:
         *   ROLE_PERMISSIONS dưới đây chỉ là UI/UX guard, KHÔNG phải bảo mật.
         *   Supabase RLS / VIEW / RPC phải là lớp khóa thật ở server.
         *   User tuyệt đối không được tải xuống browser:
         *     - cột Giá vốn,
         *     - dữ liệu nhạy cảm dùng để suy ra Lãi.
         *   Admin là tài khoản quản trị toàn quyền: được tải dữ liệu quản trị cần thiết cho Giá vốn / Chi / Thu / Lãi / Công nợ.
         *   Admin/User ĐƯỢC nhận read-only projection Công nợ đủ để hiển thị tra cứu,
         *   nhưng RLS/RPC phải chặn mọi mutation Thu tiền / Ghi nợ.
         *   User ĐƯỢC nhận read-only projection Đã giao để xem đơn,
         *   nhưng không được INSERT/UPDATE/DELETE Đã giao.
         *   Không dùng cách "tải đủ dữ liệu nhạy cảm rồi CSS ẩn".
         */
        const ROLE_PERMISSIONS = Object.freeze({
            owner: Object.freeze({
                canViewCost: true,
                canViewProfit: true,
                canViewDebt: true,
                canMutateDebt: true,
                canManageProducts: true,
                canCreateDraft: true,
                canSellNow: true,
                canViewDelivered: true,
                canUpdateDelivered: true,
                canDeleteDelivered: true,
                canClearAllDrafts: true
            }),
            admin: Object.freeze({
                canViewCost: true,
                canViewProfit: true,
                canViewDebt: true,
                canMutateDebt: true,
                canManageProducts: true,
                canCreateDraft: true,
                canSellNow: true,
                canViewDelivered: true,
                canUpdateDelivered: true,
                canDeleteDelivered: true,
                canClearAllDrafts: true
            }),
            user: Object.freeze({
                canViewCost: false,
                canViewProfit: false,
                canViewDebt: true,
                canMutateDebt: false,
                canManageProducts: false,
                canCreateDraft: true,
                canSellNow: false,
                canViewDelivered: true,
                canUpdateDelivered: false,
                canDeleteDelivered: false,
                canClearAllDrafts: false
            })
        });

        let currentAuthRole = 'admin';

        function getRolePermissions() {
            // Preview contract: Owner/Admin = full quyền; chỉ User bị hạn chế.
            return ROLE_PERMISSIONS[currentAuthRole] || ROLE_PERMISSIONS.admin;
        }

        function hasPermission(permissionName) {
            return !!getRolePermissions()[permissionName];
        }

        function denyPermission(message) {
            showAlertPopup('Không có quyền', message);
            return false;
        }

        function setAuthRole(role, persist = true) {
            currentAuthRole = ['owner', 'admin', 'user'].includes(role) ? role : 'admin';
            if (persist) {
                localStorage.setItem('APP_ROLE', currentAuthRole);
                sessionStorage.setItem('APP_ROLE', currentAuthRole);
            }
            applyRolePermissions();
        }

        function applyRolePermissions() {
            document.body.setAttribute('data-auth-role', currentAuthRole);
            if (currentAuthRole === 'user') syncUserSelfCustomer();

            document.querySelectorAll('[data-permission]').forEach(el => {
                const allowed = hasPermission(el.dataset.permission);
                el.classList.toggle('hidden', !allowed);
                el.setAttribute('aria-hidden', allowed ? 'false' : 'true');
            });

            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab?.id === 'tab-da-giao' && !hasPermission('canViewDelivered')) {
                const salesBtn = document.querySelector('.tab-btn[onclick*="tab-ban-hang"]');
                if (salesBtn) switchTab('tab-ban-hang', salesBtn);
            }
            if (activeTab?.id === 'tab-cong-no' && !hasPermission('canViewDebt')) {
                const salesBtn = document.querySelector('.tab-btn[onclick*="tab-ban-hang"]');
                if (salesBtn) switchTab('tab-ban-hang', salesBtn);
            }

            renderCartFooterActions();
        }

        let currentFilter = 'Tất cả';
        let productSearchIndex = [];
        let productSearchIndexSource = null;
        let productSearchRenderFrame = 0;
        let currentUiMode = localStorage.getItem('APP_UI_MODE_PREF') || 'auto';
        let productViewMode = localStorage.getItem('APP_PRODUCT_VIEW') || 'default';
        let currentThemePreset = localStorage.getItem('APP_THEME_PRESET') || 'current';
        let currentFontChoice = localStorage.getItem('APP_FONT_CHOICE') || 'current';
        let sharpUiEnabled = localStorage.getItem('APP_SHARP_UI') === '1';
        let cart = {}; let selectedCustomer = { id: "", name: "Chọn khách hàng" }; let editingOrderId = null; let editingOrderSheet = null; let viewingOrderId = null; 
        let activeDebtCustomerId = null; 
        let currentDebtFilter = 'no'; 
        let customerSelectionContext = 'sale'; 

        setInterval(() => {
            let now = new Date(); let days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
            document.getElementById('currentDateStr').innerText = `${days[now.getDay()]}, ${('0'+now.getDate()).slice(-2)}/${('0'+(now.getMonth()+1)).slice(-2)}`;
            document.getElementById('currentTimeStr').innerText = `${('0'+now.getHours()).slice(-2)}:${('0'+now.getMinutes()).slice(-2)}`;
        }, 1000);

        function toggleModal(modalId) {
            const modal = document.getElementById(modalId); const box = modal.children[1];
            if (modal.classList.contains('opacity-0')) { modal.classList.remove('pointer-events-none', 'opacity-0'); box.classList.remove('scale-95'); } 
            else { modal.classList.add('opacity-0', 'pointer-events-none'); box.classList.add('scale-95'); }
        }

