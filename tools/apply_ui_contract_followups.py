from pathlib import Path


def replace_once(path, old, new, marker=None):
    p = Path(path)
    text = p.read_text()
    if old in text:
        p.write_text(text.replace(old, new, 1))
        print(f"patched {path}")
        return
    if marker and marker in text:
        print(f"already patched {path}")
        return
    raise SystemExit(f"expected block not found: {path}")


replace_once(
    "src/fixed-ui-runtime-2.js",
    '''        function chooseProductEditorSource(source) {
            if (productEditorSourcePickerRow === null || !productEditorRows[productEditorSourcePickerRow]) return;
            productEditorRows[productEditorSourcePickerRow][4] = source;
            syncProductEditorData();
            renderProductEditorSources();
            renderProductEditor();
            updateProductEditorDeleteButton();
            closeProductEditorSourcePicker();
        }''',
    '''        async function chooseProductEditorSource(source) {
            if (productEditorSourcePickerRow === null || !productEditorRows[productEditorSourcePickerRow]) return;
            const selectedRow = productEditorSourcePickerRow;
            productEditorRows[selectedRow][4] = source;
            syncProductEditorData();
            renderProductEditorSources();
            renderProductEditor();
            updateProductEditorDeleteButton();
            try {
                if (typeof window.saveProductEditorRow === 'function') await window.saveProductEditorRow(selectedRow);
            } catch (error) {
                console.error('save product source selection', error);
                return;
            }
            closeProductEditorSourcePicker();
        }''',
    "await window.saveProductEditorRow(selectedRow)"
)

replace_once(
    "src/fixed-ui-behavior.js",
    '''clickOrderFromDebt = function(orderId) {
  closeCustomerDebtModal();
  const sheetName = String(orderId).startsWith('DG') ? 'dongiao' : 'dontam';
  viewingOrderId = orderId;
  window.activeViewingSheet = sheetName;
  setTimeout(() => showOrderDetailMobile(orderId, sheetName), 320);
};''',
    '''clickOrderFromDebt = function(orderId) {
  const sheetName = String(orderId).startsWith('DG') ? 'dongiao' : 'dontam';
  viewingOrderId = orderId;
  window.activeViewingSheet = sheetName;
  showOrderDetailMobile(orderId, sheetName);
};''',
    "showOrderDetailMobile(orderId, sheetName);\n};"
)

replace_once(
    "tests/taphoa-source-create-contract.test.js",
    "  assert.match(business,/createSource\\s*:\\s*.*taphoa_create_source_from_web/s);",
    "  assert.match(business,/createSource\\s*:\\s*.*directSheetMutation\\('create_source'/s);",
    "directSheetMutation\\('create_source'"
)
