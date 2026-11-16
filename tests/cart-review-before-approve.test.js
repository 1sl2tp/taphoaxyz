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
    ';return {syncCartReviewState,isCartReviewComplete,setCartReviewLine,resetCartReview};}');

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
    assert.match(mutation,/isPromotingDraft && \(typeof isCartReviewComplete/);
    assert.match(runtime,/class="cart-review-qty"/);
    assert.match(runtime,/class="cart-stt font-bold/);
});
