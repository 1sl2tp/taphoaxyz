import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// SPEC-TAPHOA-CART-REVIEW-20261116: real source functions, mocked DOM.
// No network, Supabase mutation, order write, or customer notification.
const runtime=readFileSync(new URL('../src/fixed-ui-runtime-6.js',import.meta.url),'utf8');
const start=runtime.indexOf('        let cartReviewState=');
const end=runtime.indexOf('        function renderCartUI()',start);
assert.ok(start>=0&&end>start,'Cart review helpers must remain in canonical runtime');
const functions=runtime.slice(start,end);
const createHarness=new Function('env','with(env){'+functions+
    ';return {syncCartReviewState,isCartReviewComplete,getCartReviewSelection,setCartReviewLine,setCartReviewAll,resetCartReview};}');

function harness(){
    const env={
        currentAuthRole:'admin',
        editingOrderId:'DT-01',
        editingOrderSheet:'dontam',
        editingOrderInSaleMode:false,
        cart:{milkA:{name:'Sua green',qty:2,price:400,note:''},milkB:{name:'Sua chua co x',qty:1,price:275,note:''}},
        selectedCustomer:{id:'KH-01'},
        tab:'tab-don-tam',
        getActiveTabId(){return this.tab;},
        window:{TAPHOA_PRODUCTION:{getAccessMode:()=> 'account'}},
        document:{getElementById:()=>null,querySelectorAll:()=>[]},
        renderCartFooterActions(){}
    };
    return {env,review:createHarness(env)};
}

test('draft approval needs every checked line and revocation disables approval',()=>{
    const {review}=harness();
    assert.equal(review.isCartReviewComplete(),false);
    review.setCartReviewLine('milkA',true);
    assert.equal(review.isCartReviewComplete(),false);
    assert.deepEqual(review.getCartReviewSelection(),['milkA']);
    review.setCartReviewLine('milkB',true);
    assert.equal(review.isCartReviewComplete(),true);
    review.setCartReviewLine('milkA',false);
    assert.equal(review.isCartReviewComplete(),false);
});

test('edits, another order, role change and leaving preview discard confirmations',()=>{
    const {env,review}=harness();
    const all=()=>{review.setCartReviewLine('milkA',true);review.setCartReviewLine('milkB',true);assert.equal(review.isCartReviewComplete(),true);};
    all();
    env.cart.milkB.qty=4;
    assert.equal(review.isCartReviewComplete(),false);
    all();
    env.editingOrderId='DT-02';
    assert.equal(review.isCartReviewComplete(),false);
    all();
    env.currentAuthRole='user';
    assert.equal(review.isCartReviewComplete(),false);
    env.currentAuthRole='admin';
    // Changing the underlying tab while the same draft sheet stays open
    // must not hide the picker controls on mobile.
    env.tab='tab-da-giao';
    all();
    env.editingOrderInSaleMode=true;
    assert.equal(review.isCartReviewComplete(),false);
});

test('approval button and authoritative mutation both gate on review completion',()=>{
    const footer=readFileSync(new URL('../src/fixed-ui-runtime-5.js',import.meta.url),'utf8');
    const mutation=readFileSync(new URL('../src/fixed-production-overrides.js',import.meta.url),'utf8');
    assert.match(footer,/canPromoteDraft[\s\S]{0,180}isCartReviewComplete\(\)/);
    assert.match(mutation,/isPartialPromotion=isPromotingDraft&&!isCartReviewComplete\(\)/);
    assert.match(mutation,/isSplittingSelection=isSplittingPending\|\|isPartialPromotion/);
    assert.match(runtime,/class="cart-review-qty"/);
    assert.match(runtime,/class="cart-stt font-bold/);
});

test('select all and clear all update only checklist and obey saved-draft access',()=>{
    const {env,review}=harness();
    let footerUpdates=0,checkedUpdates=0;
    const rows=Object.keys(env.cart).map(id=>({
        dataset:{cartReviewId:id},checked:false,
        closest:()=>({classList:{toggle(name,checked){
            assert.equal(name,'cart-row-reviewed');
            if(checked)checkedUpdates++;
        }}})
    }));
    env.document.querySelectorAll=()=>rows;
    env.renderCartFooterActions=()=>{footerUpdates++;};
    review.setCartReviewAll(true);
    assert.deepEqual(review.getCartReviewSelection(),['milkA','milkB']);
    assert.equal(review.isCartReviewComplete(),true);
    assert.deepEqual(rows.map(r=>r.checked),[true,true]);
    review.setCartReviewAll(false);
    assert.equal(review.isCartReviewComplete(),false);
    assert.deepEqual(rows.map(r=>r.checked),[false,false]);
    assert.equal(footerUpdates,2);
    assert.equal(checkedUpdates,2);
    // The selection never writes an order; user/PIN and edit mode cannot use it.
    env.currentAuthRole='user';
    review.setCartReviewAll(true);
    assert.deepEqual(review.getCartReviewSelection(),[]);
    env.currentAuthRole='admin';
    env.editingOrderInSaleMode=true;
    review.setCartReviewAll(true);
    assert.deepEqual(review.getCartReviewSelection(),[]);
});

test('select all cannot carry approval across a changed order, quantity or note',()=>{
    const {env,review}=harness();
    review.setCartReviewAll(true);
    assert.equal(review.isCartReviewComplete(),true);
    env.cart.milkB.note='Thay ghi chú';
    assert.deepEqual(review.getCartReviewSelection(),[]);
    review.setCartReviewAll(true);
    env.editingOrderId='DT-NEW';
    assert.deepEqual(review.getCartReviewSelection(),[]);
    review.setCartReviewAll(true);
    env.cart.milkA.qty=10;
    assert.equal(review.isCartReviewComplete(),false);
});

test('review toolbar and touch targets stay balanced on narrow PWA and desktop',()=>{
    const css=readFileSync(new URL('../src/fixed-ui-cart-spacing.css',import.meta.url),'utf8');
    const footer=readFileSync(new URL('../src/fixed-ui-runtime-5.js',import.meta.url),'utf8');
    assert.match(runtime,/action\.textContent=complete\?'Bỏ chọn tất cả':'Chọn tất cả'/);
    assert.match(runtime,/action\.type='button'/);
    assert.match(runtime,/action\.addEventListener\('click',\(\)=>setCartReviewAll/);
    assert.match(runtime,/role|aria-pressed/);
    assert.match(runtime,/\<label class="cart-review-qty"\>/);
    assert.match(runtime,/const checkedQtyWidth = reviewMode/);
    assert.match(css,/grid-template-areas:"review-title review-action" "review-help review-help"/);
    assert.match(css,/\.cart-review-all\{[\s\S]*?min-height:44px/);
    assert.match(css,/\.cart-review-qty\{[\s\S]*?height:44px/);
    assert.match(css,/@media\(max-width:360px\)\{[\s\S]*?grid-column:2 \/ -1 !important/);
    assert.match(footer,/cart-review-action-row/);
    assert.match(footer,/cart-review-action/);
});
