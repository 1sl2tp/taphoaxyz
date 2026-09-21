        function selectProductEditorValue(input) {
            if (!input || !input.value) return;
            input.setSelectionRange(0, input.value.length);
        }

        function renderProductEditor() {
            const query = (document.getElementById('productEditorSearch')?.value || '').trim().toLowerCase();
            const list = document.getElementById('productEditorList');
            if (!list) return;

            const rows = productEditorRows
                .map((r, index) => ({r, index}))
                .filter(({r, index}) => {
                    const name = String(r[1] || '').trim();
                    const hasName = !!name;
                    const matchSearch = !query
                        || String(r[0] || '').toLowerCase().includes(query)
                        || name.toLowerCase().includes(query);
                    const matchSource = productEditorSourceFilter === 'Tất cả'
                        || String(r[4] || '').trim() === productEditorSourceFilter;
                    return (hasName || index === productEditorActiveRow) && matchSearch && matchSource;
                })
                .sort((a, b) => {
                    if (a.index === productEditorActiveRow && !String(a.r[1] || '').trim()) return -1;
                    if (b.index === productEditorActiveRow && !String(b.r[1] || '').trim()) return 1;
                    return String(a.r[1] || '').trim().localeCompare(
                        String(b.r[1] || '').trim(),
                        'vi',
                        { sensitivity: 'base' }
                    );
                });

            document.getElementById('productEditorCount').innerText = `${productEditorRows.length} sản phẩm`;

            if (!rows.length) {
                list.innerHTML = '<div class="py-10 text-center text-gray-400 text-sm">Không tìm thấy sản phẩm.</div>';
                return;
            }

            list.innerHTML = rows.map(({r, index}) => `
                <div class="product-editor-row ${index === productEditorActiveRow ? 'is-selected' : ''}" data-editor-row="${index}">
                    <input class="product-editor-input product-editor-name font-bold" data-editor-field="1" value="${escapeProductEditorValue(r[1])}" aria-label="Tên sản phẩm" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off">
                    <input class="product-editor-input product-editor-money" data-editor-field="2" inputmode="numeric" value="${escapeProductEditorValue(formatProductEditorNumber(r[2]))}" data-editor-number="1" aria-label="Giá vốn" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off">
                    <input class="product-editor-input product-editor-money text-primary" data-editor-field="3" inputmode="numeric" value="${escapeProductEditorValue(formatProductEditorNumber(r[3]))}" data-editor-number="1" aria-label="Giá bán" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off">
                    <button type="button" class="product-editor-source-btn" data-editor-source-cell="${index}" aria-label="Nguồn">${escapeProductEditorValue(r[4] || "")}</button>
                </div>
            `).join('');
        }

        function escapeProductEditorValue(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        document.addEventListener('input', function(e) {
            const input = e.target.closest('#productEditorList [data-editor-field]');
            if (!input) return;
            const row = input.closest('[data-editor-row]');
            const index = Number(row.dataset.editorRow);
            const field = Number(input.dataset.editorField);
            if (!productEditorRows[index]) return;

            if (input.dataset.editorNumber === '1') {
                const raw = rawProductEditorNumber(input.value);
                input.value = formatProductEditorNumber(raw);
                productEditorRows[index][field] = raw;
            } else {
                productEditorRows[index][field] = input.value;
            }
            syncProductEditorData();
        });




        document.addEventListener('click', function(e) {
            const pickerSource = e.target.closest('[data-picker-source]');
            if (pickerSource) {
                chooseProductEditorSource(pickerSource.dataset.pickerSource || '');
                return;
            }

            const sourceCell = e.target.closest('#productEditorList [data-editor-source-cell]');
            if (sourceCell) {
                const index = Number(sourceCell.dataset.editorSourceCell);
                setProductEditorActiveRow(index, true);
                openProductEditorSourcePicker(index);
                return;
            }

            const row = e.target.closest('#productEditorList .product-editor-row');
            if (row && !e.target.closest('[data-editor-field]') && !e.target.closest('[data-editor-source-cell]')) {
                setProductEditorActiveRow(Number(row.dataset.editorRow), true);
                return;
            }
        });

        document.addEventListener('focusin', function(e) {
            const input = e.target.closest('#productEditorList [data-editor-field]');
            if (!input) return;
            const row = input.closest('[data-editor-row]');
            const index = Number(row?.dataset.editorRow);
            if (Number.isInteger(index) && productEditorRows[index]) {
                productEditorActiveRow = index;
                updateProductEditorDeleteButton();
                document.querySelectorAll('#productEditorList .product-editor-row').forEach(el => {
                    el.classList.toggle('is-selected', Number(el.dataset.editorRow) === index);
                });
            }
            requestAnimationFrame(() => selectProductEditorValue(input));
        });

        document.addEventListener('click', function(e) {
            const input = e.target.closest('#productEditorList [data-editor-field]');
            if (!input) return;
            setTimeout(() => selectProductEditorValue(input), 0);
        });

        function syncProductEditorData() {
            if (!productEditorRows.length) return;

            const header = appData.sanpham?.[0] ? [...appData.sanpham[0]] : ['Mã','Tên sản phẩm','Vốn','Giá bán','Nguồn'];
            const namedRows = productEditorRows.filter(r => String(r[1] || '').trim()).map(r => [...r]);
            appData.sanpham = [header, ...namedRows];

            if (typeof PREVIEW_SAMPLE_DATA !== 'undefined') {
                PREVIEW_SAMPLE_DATA.sanpham = appData.sanpham.map(r => [...r]);
            }
            if (SheetDB && SheetDB.cache) {
                SheetDB.cache.sanpham = appData.sanpham.map(r => [...r]);
            }
            buildProductSearchIndex();
        }

        function saveProductEditorChanges() {
            syncProductEditorData();
            renderSourceTags();
            renderProductList();
            renderDonTam();
            renderDaGiao();
            showToast("Đã lưu thay đổi sản phẩm.", "success");
        }


        const APP_THEME_MAP = {
            chatgpt: {
                primary: '#2563eb',
                light: '#eff6ff',
                header: '#171717',
                canvas: '#f7f7f8',
                surface: '#ffffff',
                text: '#171717'
            },
            vercel: {
                primary: '#000000',
                light: '#f5f5f5',
                header: '#000000',
                canvas: '#fafafa',
                surface: '#ffffff',
                text: '#000000'
            },
            current: {
                primary: '#16a34a',
                light: '#f0fdf4',
                header: '#1e293b',
                canvas: '#f3f4f6',
                surface: '#ffffff',
                text: '#111827'
            }
        };

        const APP_FONT_MAP = {
            openai: '"OpenAI Sans", "Helvetica Neue", Arial, sans-serif',
            geist: '"Geist", "Geist Sans", "Helvetica Neue", Arial, sans-serif',
            current: '"Be Vietnam Pro", sans-serif'
        };

        function updateSettingsControls() {
            document.querySelectorAll('[data-theme-preset]').forEach(btn => {
                btn.classList.toggle('is-active', btn.dataset.themePreset === currentThemePreset);
            });
            document.querySelectorAll('[data-font-choice]').forEach(btn => {
                btn.classList.toggle('is-active', btn.dataset.fontChoice === currentFontChoice);
            });

            const sharpToggle = document.getElementById('sharpUiToggle');
            const sharpKnob = document.getElementById('sharpUiKnob');
            if (sharpToggle) {
                sharpToggle.classList.toggle('is-on', sharpUiEnabled);
                sharpToggle.setAttribute('aria-pressed', sharpUiEnabled ? 'true' : 'false');
            }
            if (sharpKnob) sharpKnob.style.transform = sharpUiEnabled ? 'translateX(20px)' : 'translateX(0)';

            const defaultBtn = document.getElementById('btnProductViewDefault');
            const imageBtn = document.getElementById('btnProductViewImage');
            if (defaultBtn && imageBtn) {
                defaultBtn.className = `allow-fast-click flex-1 py-2 rounded-lg text-[12px] font-bold transition ${productViewMode === 'default' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`;
                imageBtn.className = `allow-fast-click flex-1 py-2 rounded-lg text-[12px] font-bold transition ${productViewMode === 'image' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`;
            }
        }

        function setThemePreset(name, persist = true) {
            if (name === 'green') name = 'current';
            if (!APP_THEME_MAP[name]) name = 'current';

            currentThemePreset = name;
            const theme = APP_THEME_MAP[name];

            document.documentElement.style.setProperty('--app-primary', theme.primary);
            document.documentElement.style.setProperty('--app-primary-light', theme.light);
            document.documentElement.style.setProperty('--app-header', theme.header);
            document.documentElement.style.setProperty('--app-canvas', theme.canvas);
            document.documentElement.style.setProperty('--app-surface', theme.surface);
            document.documentElement.style.setProperty('--app-text', theme.text);

            document.getElementById('appContainer')?.setAttribute('data-theme-preset', name);

            if (persist) localStorage.setItem('APP_THEME_PRESET', name);
            updateSettingsControls();
        }

        function setAppFont(choice, persist = true) {
            if (choice === 'be') choice = 'current';
            if (choice === 'arial' || choice === 'system') choice = 'current';
            if (!APP_FONT_MAP[choice]) choice = 'current';

            currentFontChoice = choice;
            window.TAPHOA_FONT_LOADER?.ensure(choice);
            document.documentElement.style.setProperty('--app-font', APP_FONT_MAP[choice]);
            document.getElementById('appContainer')?.setAttribute('data-font-choice', choice);

            if (persist) localStorage.setItem('APP_FONT_CHOICE', choice);
            updateSettingsControls();
        }

        function setSharpUI(enabled, persist = true) {
            sharpUiEnabled = !!enabled;
            document.getElementById('appContainer')?.classList.toggle('font-sharp', sharpUiEnabled);
            if (persist) localStorage.setItem('APP_SHARP_UI', sharpUiEnabled ? '1' : '0');
            updateSettingsControls();
        }

        function toggleSharpUI() {
            setSharpUI(!sharpUiEnabled);
        }

        function setProductViewMode(mode, persist = true) {
            productViewMode = mode === 'image' ? 'image' : 'default';
            if (persist) localStorage.setItem('APP_PRODUCT_VIEW', productViewMode);
            updateSettingsControls();
            renderProductList();
        }

        function escapeSvgText(value) {
            return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        }

        function getProductImageSrc(row) {
            const candidate = String(row?.[5] || '').trim();
            if (/^(https?:\/\/|data:image\/)/i.test(candidate)) return candidate;
            const name = String(row?.[1] || 'SP').trim();
            const initials = name.split(/\s+/).filter(Boolean).slice(0,2).map(x => x[0]).join('').toUpperCase() || 'SP';
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="12" fill="#f8fafc"/><rect x="1" y="1" width="94" height="94" rx="11" fill="none" stroke="#e5e7eb"/><text x="48" y="54" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#64748b">${escapeSvgText(initials)}</text></svg>`;
            return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
        }

        function loadUiPreferences() {
            setThemePreset(currentThemePreset, false);
            setAppFont(currentFontChoice, false);
            setSharpUI(sharpUiEnabled, false);
            setProductViewMode(productViewMode, false);
            const savedMode = localStorage.getItem('APP_UI_MODE_PREF') || 'auto';
            setMode(savedMode, false);
            updateSettingsControls();
        }

