import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const footer=readFileSync('src/fixed-ui-runtime-5.js','utf8');
const review=readFileSync('src/fixed-ui-runtime-6.js','utf8');
const mutation=readFileSync('src/fixed-production-overrides.js','utf8');
const bridge=readFileSync('src/fixed-production-bridge.js','utf8');
const service=readFileSync('src/core/business.js','utf8');
const sql=readFileSync('supabase/migrations/20261116182500_taphoa_split_pending_order_atomic.sql','utf8');

test('checkboxes belong to the same quantity column; footer allows split and partial approval',()=>{
  assert.match(review,/function getCartReviewSelection\(\)/);
  assert.match(review,/data-cart-review-id/);
  assert.match(footer,/Tách đơn tạm/);
  assert.match(footer,/Duyệt đã chọn/);
  assert.match(footer,/canSplitDraft = canPromoteDraft && selectedLineCount < lineCount/);
});

test('a partial choice creates a new order; full review keeps original delivery',()=>{
  assert.match(mutation,/isPartialPromotion=isPromotingDraft&&!isCartReviewComplete\(\)/);
  assert.match(mutation,/isSplittingSelection=isSplittingPending\|\|isPartialPromotion/);
  assert.match(mutation,/backend\(\)\.splitPendingOrder\(/);
  assert.match(mutation,/else if\(isPromotingDraft\)\{[\s\S]*backend\(\)\.deliverOrder\(/);
  assert.match(mutation,/assertDraftAlreadySavedForDelivery\(backendEditOrderId,selectedCustomer\.id,items\)/);
  assert.match(mutation,/confirmedSelection=JSON\.stringify\(selected\)/);
  assert.match(mutation,/JSON\.stringify\(getCartReviewSelection\(\)\)!==JSON\.stringify\(selectedReviewCodes\)/);
});

test('one RPC mutation, and image notices only from the delivered child order',()=>{
  assert.match(service,/gateway\.rpc\('taphoa_split_pending_order'/);
  assert.match(bridge,/async function splitPendingOrder/);
  assert.match(bridge,/\['done','delivered'\]\.includes\(String\(result\?\.order\?\.status/);
  assert.match(bridge,/if\(result\?\.ok===true&&delivered\)/);
  assert.match(bridge,/staffCommandId:result\.child_command_id/);
  assert.match(bridge,/refresh\(delivered\?\['orders','debt'\]:\['orders'\]\)/);
});

test('SQL locks original and validates all lines before changing anything',()=>{
  assert.match(sql,/select \* into v_source from public\.taphoa_orders\s+where id=p_order_id for update/i);
  assert.match(sql,/v_source\.status<>'pending'/);
  assert.match(sql,/v_saved_compare is distinct from v_expected_compare/i);
  assert.match(sql,/v_selected_count>=v_line_count/);
  assert.match(sql,/v_source_result:=public\.taphoa_save_order/);
  assert.match(sql,/v_child_result:=public\.taphoa_save_order/);
  assert.match(sql,/unit_cost_vnd_snapshot/);
  assert.match(sql,/taphoa_command_log/);
  assert.match(sql,/v_target_status='delivered'/);
  assert.match(sql,/v_child_result:=jsonb_set\(v_child_result,'\{order\}'/);
  assert.match(sql,/UPDATE public\.taphoa_command_log\s+SET result=v_child_result/);
});

test('uninstalled RPC is a readable Vietnamese error; no hidden retry or source order edit',()=>{
  assert.match(mutation,/String\(error\?\.code\|\|''\)==='PGRST202'/);
  assert.match(mutation,/Tách đơn chưa hoạt động/);
  assert.match(mutation,/Chưa thay đổi đơn gốc, hàng hoặc công nợ/);
  assert.doesNotMatch(bridge.slice(bridge.indexOf('async function splitPendingOrder'),bridge.indexOf('async function deliverOrder')),/setTimeout\(/);
});

test('media failure after SQL commit never masquerades as an order-save failure',()=>{
  const p=bridge.slice(bridge.indexOf('async function splitPendingOrder'),bridge.indexOf('async function deliverOrder'));
  assert.match(p,/try\s*\{[\s\S]*staff_image_attached/);
  assert.match(p,/catch\(mediaError\)/);
  assert.match(p,/return result;/);
});
