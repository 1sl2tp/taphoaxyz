const owners=({geometry='parent',paint='self',interaction='none',state='screen-controller',scroll='none',focus='none'}={})=>
  Object.freeze({geometry,paint,interaction,state,scroll,focus});

const node=(id,kind,parent,children,purpose,ownerSpec={},order=1,placement)=>Object.freeze({
  id,kind,parent,children:Object.freeze([...children]),purpose,owners:owners(ownerSpec),order,...(placement?{placement:Object.freeze(placement)}:{})
});

const flow=(id,source,action,mutationOwner,targetState,targetRegion,back)=>Object.freeze({
  id,source,action,mutationOwner,targetState,targetRegion,back
});

export const AUTH_STRUCTURE_CONTRACT=Object.freeze({
  id:'auth',
  root:Object.freeze({id:'auth-root',kind:'root',attribute:'data-root-id',value:'auth',children:Object.freeze(['auth-workspace'])}),
  nodes:Object.freeze([
    node('auth-workspace','workspace','auth-root',['auth-brand-region','auth-credential-region','auth-preference-region','auth-status-region','auth-action-region'],'Bố trí các vùng đăng nhập',{geometry:'self',state:'auth-controller'},1),
    node('auth-brand-region','region','auth-workspace',[],'Nhận diện cửa hàng',{state:'none'},1),
    node('auth-credential-region','region','auth-workspace',[],'Nhập tên đăng nhập và mật khẩu',{interaction:'auth-controller',state:'auth-controller',focus:'self'},2),
    node('auth-preference-region','region','auth-workspace',[],'Nhớ tên đăng nhập',{interaction:'auth-controller',state:'auth-controller',focus:'self'},3),
    node('auth-status-region','region','auth-workspace',[],'Hiển thị trạng thái xác thực inline',{state:'auth-controller'},4),
    node('auth-action-region','region','auth-workspace',[],'Gửi yêu cầu đăng nhập',{interaction:'auth-controller',state:'auth-service',focus:'self'},5)
  ]),
  flows:Object.freeze([
    flow('auth.login','auth-action-region','submit credentials','auth-controller','session/identity resolved','auth-action-region','stay:auth')
  ])
});

export const APP_STRUCTURE_CONTRACT=Object.freeze({
  id:'app',
  root:Object.freeze({id:'app-root',kind:'root',attribute:'data-root-id',value:'app',children:Object.freeze(['app-navigation','app-screen-host','app-system-layer'])}),
  nodes:Object.freeze([
    node('app-navigation','navigation','app-root',[],'Điều hướng bốn Screen nghiệp vụ',{geometry:'parent',interaction:'app-shell',state:'app-shell',focus:'self'},1),
    node('app-screen-host','screen-host','app-root',[],'Mount đúng một Active Screen',{geometry:'parent',state:'app-shell'},2),
    node('app-system-layer','system-layer','app-root',[],'Thông báo và trạng thái hệ thống không thuộc Screen',{geometry:'parent',interaction:'app-shell',state:'app-shell'},3)
  ]),
  flows:Object.freeze([
    flow('app.navigate','app-navigation','select screen','app-shell','active route changed','app-screen-host','stay:app')
  ])
});

const salesNodes=Object.freeze([
  node('sales-workspace','workspace','sales-root',['sales-primary-surface','sales-cart-surface'],'Bố trí Surface chính và Giỏ',{geometry:'self',state:'sales-controller'},1),
  node('sales-primary-surface','surface','sales-workspace',['sales-context-region','sales-product-controls','sales-product-list'],'Surface bán hàng chính',{geometry:'parent',state:'sales-controller'},1,{mobile:1,wide:1}),
  node('sales-context-region','region','sales-primary-surface',[],'Khách hàng, thời gian và trạng thái giỏ nhanh',{interaction:'sales-controller',state:'sales-controller',focus:'self'},1),
  node('sales-product-controls','region','sales-primary-surface',[],'Tìm kiếm và lọc nhóm sản phẩm',{interaction:'sales-controller',state:'sales-controller',focus:'self'},2),
  node('sales-product-list','region','sales-primary-surface',[],'Danh sách sản phẩm bán hàng',{interaction:'sales-controller',state:'sales-controller',scroll:'self',focus:'self'},3),
  node('sales-cart-surface','surface','sales-workspace',['sales-cart-list','sales-cart-total','sales-cart-actions'],'Surface giỏ hàng',{geometry:'parent',state:'sales-controller'},2,{mobile:1,wide:2}),
  node('sales-cart-list','region','sales-cart-surface',[],'Danh sách dòng hàng trong giỏ',{interaction:'sales-controller',state:'sales-controller',scroll:'self',focus:'self'},1),
  node('sales-cart-total','region','sales-cart-surface',[],'Tổng số lượng và thành tiền',{state:'sales-controller'},2),
  node('sales-cart-actions','region','sales-cart-surface',[],'Các hành động Xóa, Đặt, Bán, Cập nhật',{interaction:'sales-controller',state:'sales-controller',focus:'self'},3)
]);

const salesFlows=Object.freeze([
  flow('sales.search','sales-product-controls','search products','sales-controller','search filter changed','sales-product-list','stay:sales'),
  flow('sales.group.select','sales-product-controls','select product group','sales-controller','group filter changed','sales-product-list','stay:sales'),
  flow('sales.quantity.change','sales-product-list','change quantity','sales-controller','cart quantity changed','sales-product-list','stay:sales'),
  flow('sales.cart.open','sales-context-region','open cart','sales-controller','cart surface active','sales-cart-surface','surface:sales-primary-surface'),
  flow('sales.cart.back','sales-cart-surface','close cart','sales-controller','primary surface active','sales-primary-surface','stay:sales'),
  flow('sales.order.pending','sales-cart-actions','save pending order','sales-controller','pending order saved','sales-cart-surface','stay:sales'),
  flow('sales.order.done','sales-cart-actions','save delivered order','sales-controller','delivered order saved','sales-cart-surface','stay:sales'),
  flow('sales.order.update','sales-cart-actions','update edited order','sales-controller','order updated','sales-cart-surface','stay:sales'),
  flow('sales.cart.clear','sales-cart-actions','clear cart','sales-controller','cart cleared','sales-cart-surface','stay:sales')
]);

const deliveredNodes=Object.freeze([
  node('delivered-workspace','workspace','delivered-root',['delivered-list-surface','delivered-detail-surface','delivered-print-surface'],'Bố trí danh sách, chi tiết và bản in',{geometry:'self',state:'delivered-controller'},1),
  node('delivered-list-surface','surface','delivered-workspace',['delivered-filter-region','delivered-summary-region','delivered-order-list'],'Surface danh sách đơn đã giao',{state:'delivered-controller'},1,{mobile:1,wide:1}),
  node('delivered-filter-region','region','delivered-list-surface',[],'Tìm kiếm và lọc thời gian',{interaction:'delivered-controller',state:'delivered-controller',focus:'self'},1),
  node('delivered-summary-region','region','delivered-list-surface',[],'Tổng hợp đơn đã giao theo nguồn',{state:'delivered-controller'},2),
  node('delivered-order-list','region','delivered-list-surface',[],'Danh sách đơn đã giao',{interaction:'delivered-controller',state:'delivered-controller',scroll:'self'},3),
  node('delivered-detail-surface','surface','delivered-workspace',['delivered-detail-meta','delivered-detail-lines','delivered-detail-actions'],'Surface chi tiết đơn đã giao',{state:'delivered-controller'},2,{mobile:1,wide:2}),
  node('delivered-detail-meta','region','delivered-detail-surface',[],'Thông tin đầu đơn',{state:'delivered-controller'},1),
  node('delivered-detail-lines','region','delivered-detail-surface',[],'Danh sách dòng hàng chi tiết',{state:'delivered-controller',scroll:'self'},2),
  node('delivered-detail-actions','region','delivered-detail-surface',[],'Hành động trên đơn đã giao',{interaction:'delivered-controller',state:'delivered-controller',focus:'self'},3),
  node('delivered-print-surface','surface','delivered-workspace',['delivered-print-meta','delivered-print-lines','delivered-print-actions'],'Surface xem trước bản in',{state:'delivered-controller'},3,{mobile:1,wide:3}),
  node('delivered-print-meta','region','delivered-print-surface',[],'Thông tin bản in',{state:'delivered-controller'},1),
  node('delivered-print-lines','region','delivered-print-surface',[],'Dòng hàng bản in',{state:'delivered-controller',scroll:'self'},2),
  node('delivered-print-actions','region','delivered-print-surface',[],'Đóng hoặc in bản xem trước',{interaction:'delivered-controller',state:'delivered-controller',focus:'self'},3)
]);

const deliveredFlows=Object.freeze([
  flow('delivered.filter.search','delivered-filter-region','search orders','delivered-controller','search filter changed','delivered-order-list','stay:delivered'),
  flow('delivered.filter.date','delivered-filter-region','select date range','delivered-controller','date filter changed','delivered-order-list','stay:delivered'),
  flow('delivered.order.open','delivered-order-list','open order','delivered-controller','selected order set','delivered-detail-surface','surface:delivered-list-surface'),
  flow('delivered.detail.back','delivered-detail-surface','close detail','delivered-controller','selected order cleared','delivered-list-surface','stay:delivered'),
  flow('delivered.order.edit','delivered-detail-actions','edit order','delivered-controller','edit order staged','sales-primary-surface','route:sales'),
  flow('delivered.order.print','delivered-detail-actions','open print preview','delivered-controller','print order set','delivered-print-surface','surface:delivered-detail-surface'),
  flow('delivered.order.reverse','delivered-detail-actions','reverse delivered order','delivered-controller','order reversed','delivered-list-surface','stay:delivered')
]);

const pendingNodes=Object.freeze([
  node('pending-workspace','workspace','pending-root',['pending-list-surface','pending-source-surface','pending-detail-surface','pending-print-surface'],'Bố trí danh sách, nguồn, chi tiết và bản in',{geometry:'self',state:'pending-controller'},1),
  node('pending-list-surface','surface','pending-workspace',['pending-summary-region','pending-order-list'],'Surface danh sách đơn tạm',{state:'pending-controller'},1,{mobile:1,wide:1}),
  node('pending-summary-region','region','pending-list-surface',[],'Tổng hợp đơn tạm theo nguồn',{interaction:'pending-controller',state:'pending-controller'},1),
  node('pending-order-list','region','pending-list-surface',[],'Danh sách đơn tạm',{interaction:'pending-controller',state:'pending-controller',scroll:'self'},2),
  node('pending-source-surface','surface','pending-workspace',['pending-source-meta','pending-source-lines','pending-source-actions'],'Surface chi tiết theo nguồn',{state:'pending-controller'},2,{mobile:1,wide:2}),
  node('pending-source-meta','region','pending-source-surface',[],'Thông tin nguồn đang xem',{state:'pending-controller'},1),
  node('pending-source-lines','region','pending-source-surface',[],'Danh sách hàng của nguồn',{state:'pending-controller',scroll:'self'},2),
  node('pending-source-actions','region','pending-source-surface',[],'Hành động in/tổng theo nguồn',{interaction:'pending-controller',state:'pending-controller',focus:'self'},3),
  node('pending-detail-surface','surface','pending-workspace',['pending-detail-meta','pending-detail-lines','pending-detail-actions'],'Surface chi tiết đơn tạm',{state:'pending-controller'},3,{mobile:1,wide:2}),
  node('pending-detail-meta','region','pending-detail-surface',[],'Thông tin đầu đơn tạm',{state:'pending-controller'},1),
  node('pending-detail-lines','region','pending-detail-surface',[],'Danh sách dòng hàng đơn tạm',{state:'pending-controller',scroll:'self'},2),
  node('pending-detail-actions','region','pending-detail-surface',[],'Hành động trên đơn tạm',{interaction:'pending-controller',state:'pending-controller',focus:'self'},3),
  node('pending-print-surface','surface','pending-workspace',['pending-print-meta','pending-print-lines','pending-print-actions'],'Surface xem trước bản in',{state:'pending-controller'},4,{mobile:1,wide:3}),
  node('pending-print-meta','region','pending-print-surface',[],'Thông tin bản in đơn tạm',{state:'pending-controller'},1),
  node('pending-print-lines','region','pending-print-surface',[],'Dòng hàng bản in đơn tạm',{state:'pending-controller',scroll:'self'},2),
  node('pending-print-actions','region','pending-print-surface',[],'Đóng hoặc in bản xem trước',{interaction:'pending-controller',state:'pending-controller',focus:'self'},3)
]);

const pendingFlows=Object.freeze([
  flow('pending.source.open','pending-summary-region','open source','pending-controller','selected source set','pending-source-surface','surface:pending-list-surface'),
  flow('pending.source.back','pending-source-surface','close source','pending-controller','selected source cleared','pending-list-surface','stay:pending'),
  flow('pending.order.open','pending-order-list','open order','pending-controller','selected order set','pending-detail-surface','surface:pending-list-surface'),
  flow('pending.order.back','pending-detail-surface','close detail','pending-controller','selected order cleared','pending-list-surface','stay:pending'),
  flow('pending.order.edit','pending-detail-actions','edit order','pending-controller','edit order staged','sales-primary-surface','route:sales'),
  flow('pending.order.deliver','pending-detail-actions','deliver order','pending-controller','order delivered','pending-list-surface','stay:pending'),
  flow('pending.order.delete','pending-detail-actions','delete pending order','pending-controller','pending order deleted','pending-list-surface','stay:pending'),
  flow('pending.orders.delete-all','pending-summary-region','delete all pending orders','pending-controller','pending orders deleted','pending-list-surface','stay:pending'),
  flow('pending.order.print','pending-detail-actions','open print preview','pending-controller','print data set','pending-print-surface','surface:pending-detail-surface')
]);

const debtNodes=Object.freeze([
  node('debt-workspace','workspace','debt-root',['debt-list-surface','debt-ledger-surface','debt-order-surface'],'Bố trí danh sách khách, sổ công nợ và đơn đối soát',{geometry:'self',state:'debt-controller'},1),
  node('debt-list-surface','surface','debt-workspace',['debt-summary-region','debt-quick-action-region','debt-customer-list'],'Surface danh sách công nợ',{state:'debt-controller'},1,{mobile:1,wide:1}),
  node('debt-summary-region','region','debt-list-surface',[],'Tổng nợ và dư tiền',{state:'debt-controller'},1),
  node('debt-quick-action-region','region','debt-list-surface',[],'Lập phiếu Thu/Nợ nhanh',{interaction:'debt-controller',state:'debt-controller',focus:'self'},2),
  node('debt-customer-list','region','debt-list-surface',[],'Danh sách khách theo số dư',{interaction:'debt-controller',state:'debt-controller',scroll:'self'},3),
  node('debt-ledger-surface','surface','debt-workspace',['debt-ledger-meta','debt-ledger-list','debt-ledger-actions'],'Surface sổ giao dịch khách',{state:'debt-controller'},2,{mobile:1,wide:2}),
  node('debt-ledger-meta','region','debt-ledger-surface',[],'Thông tin khách và số dư',{state:'debt-controller'},1),
  node('debt-ledger-list','region','debt-ledger-surface',[],'Timeline giao dịch công nợ',{interaction:'debt-controller',state:'debt-controller',scroll:'self'},2),
  node('debt-ledger-actions','region','debt-ledger-surface',[],'Thu tiền, ghi nợ và chia sẻ',{interaction:'debt-controller',state:'debt-controller',focus:'self'},3),
  node('debt-order-surface','surface','debt-workspace',['debt-order-meta','debt-order-lines','debt-order-actions'],'Surface đơn đối soát từ giao dịch',{state:'debt-controller'},3,{mobile:1,wide:3}),
  node('debt-order-meta','region','debt-order-surface',[],'Thông tin đơn đối soát',{state:'debt-controller'},1),
  node('debt-order-lines','region','debt-order-surface',[],'Dòng hàng đơn đối soát',{state:'debt-controller',scroll:'self'},2),
  node('debt-order-actions','region','debt-order-surface',[],'Chia sẻ hoặc quay lại sổ',{interaction:'debt-controller',state:'debt-controller',focus:'self'},3)
]);

const debtFlows=Object.freeze([
  flow('debt.customer.open','debt-customer-list','open customer ledger','debt-controller','selected customer/detail set','debt-ledger-surface','surface:debt-list-surface'),
  flow('debt.ledger.back','debt-ledger-surface','close ledger','debt-controller','selected customer/detail cleared','debt-list-surface','stay:debt'),
  flow('debt.transaction.collect','debt-ledger-actions','collect payment','debt-controller','debt transaction saved','debt-ledger-surface','stay:debt'),
  flow('debt.transaction.debt','debt-ledger-actions','record debt','debt-controller','debt transaction saved','debt-ledger-surface','stay:debt'),
  flow('debt.order.open','debt-ledger-list','open linked order','debt-controller','selected order set','debt-order-surface','surface:debt-ledger-surface'),
  flow('debt.order.back','debt-order-surface','close linked order','debt-controller','selected order cleared','debt-ledger-surface','stay:debt'),
  flow('debt.share','debt-ledger-actions','share debt receipt','debt-controller','share artifact requested','debt-ledger-surface','stay:debt')
]);

const screenContract=(id,nodes,flows)=>Object.freeze({
  id,
  root:Object.freeze({id:`${id}-root`,kind:'screen',attribute:'data-screen-id',value:id,children:Object.freeze([`${id}-workspace`])}),
  nodes,
  flows
});

export const SCREEN_STRUCTURE_CONTRACTS=Object.freeze({
  sales:screenContract('sales',salesNodes,salesFlows),
  delivered:screenContract('delivered',deliveredNodes,deliveredFlows),
  pending:screenContract('pending',pendingNodes,pendingFlows),
  debt:screenContract('debt',debtNodes,debtFlows)
});
