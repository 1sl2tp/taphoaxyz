// Admin customer care report: single, explicit read-only RPC; no auto-send or background refresh.
export function createCustomerCareReport({rpc,getIdentity}){
  const $=id=>document.getElementById(id);
  const number=v=>Number(v||0).toLocaleString('vi-VN',{maximumFractionDigits:1});
  const day=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  let rows=[],loaded=false,loading=false,selected='',generation=0;
  function address(row){
    const name=String(row.name||'').trim();
    if(/^(Cô|Bác|Chú)\s/i.test(name))return {name,from:'em'};
    const m=name.match(/^([ECA])\s+(.+)$/i);
    if(!m)return {name:name||'anh/chị',from:'em'};
    const t=m[1].toUpperCase();
    return {name:(t==='E'?'Em':t==='C'?'Chị':'Anh')+' '+m[2],from:t==='E'?'chị':'em'};
  }
  const elapsed=()=>Number($('careInactiveDays').value)||7;
  function group(r){
    if(r.segment==='demo')return 'Dữ liệu thử';
    if(Number(r.pending_count)>0)return 'Đơn tạm chưa giao';
    if(!Number(r.delivered_count))return 'Chưa có đơn giao';
    if(r.days_since_purchase!=null&&Number(r.days_since_purchase)>=elapsed())return 'Lâu chưa mua';
    return r.segment==='repeat'?'Mua lặp lại':'Đã mua';
  }
  function payment(r){
    if(!Number(r.total_charged))return 'Chưa có giao dịch công nợ';
    if(Number(r.debt_balance)<0)return 'Trả dư';
    if(Number(r.debt_balance)===0)return 'Đã tất toán';
    if(!Number(r.collection_count))return 'Chưa ghi nhận thu';
    return Number(r.collection_days)>=3?'Đã thu qua nhiều ngày':'Đã thu theo đợt';
  }
  function message(r){
    const a=address(r),greet=a.name+' ơi, '+a.from;
    if(Number(r.pending_count)>0)return greet+' thấy mình còn đơn tạm '+String(r.pending_codes||'')+
      '. '+a.from+' hỏi mình muốn giữ đơn, điều chỉnh số lượng hoặc ghép thêm hàng cho tiện giao không ạ? '+
      a.from+' sẽ kiểm tra hàng và lịch giao rồi báo mình nhé.';
    if(!Number(r.delivered_count))return greet+' hỏi thăm. Nếu mình cần bổ sung mặt hàng nào, mình gửi danh sách để '+
      a.from+' kiểm tra hàng, báo giá và lịch giao phù hợp nhé.';
    if(Number(r.days_since_purchase)>=elapsed())return greet+' hỏi thăm, dạo này chưa thấy mình có đơn mới. '+
      'Nếu sắp cần bổ sung hàng, mình nhắn danh sách để '+a.from+' kiểm tra hàng và chuyến giao thuận tiện nhé.';
    if(Number(r.debt_balance)>0)return greet+' hỏi thăm mình có cần bổ sung hàng đợt tới không ạ? '+
      a.from+' có thể hỗ trợ lên danh sách, và đối chiếu công nợ riêng nếu mình cần nhé.';
    return greet+' hỏi thăm xem mình có cần bổ sung mặt hàng nào trong đợt tới không ạ? '+
      a.from+' kiểm tra hàng và lịch giao giúp mình nhé.';
  }
  function detail(r){
    const el=$('careDetail');el.replaceChildren();
    if(!r){el.textContent='Không có khách phù hợp.';return;}
    function add(tag,txt,cl,into=el){
      const node=document.createElement(tag);node.textContent=txt||'';
      if(cl)node.className=cl;into.append(node);return node;
    }
    add('h3',address(r).name);
    add('p',group(r)+' · '+payment(r));
    const stats=add('div','','care-stats');
    const buyGap=Number(r.purchase_days)>=2?number(r.avg_purchase_gap_days)+' ngày':'Chưa đủ dữ liệu';
    const payGap=Number(r.collection_days)>=2?number(r.avg_collection_gap_days)+' ngày':'Chưa đủ dữ liệu';
    const balance=Number(r.debt_balance)<0?'Dư '+number(Math.abs(Number(r.debt_balance))):number(r.debt_balance);
    const metrics=[
      ['Đơn giao / ngày mua',number(r.delivered_count)+' / '+number(r.purchase_days)],
      ['Doanh số / TB đơn',number(r.total_revenue)+' / '+number(r.avg_order_value)],
      ['Nhịp mua',buyGap],['Nhịp thu',payGap],
      ['Đã thu / lần thu',number(r.collected)+' / '+number(r.collection_count)],
      ['Công nợ',balance],
      ['Lần mua cuối',day(r.last_purchase_day)+(r.days_since_purchase==null?'':' · '+r.days_since_purchase+' ngày trước')],
      ['Nợ cũ nhất / đơn tạm',(r.oldest_unpaid_days==null?'—':r.oldest_unpaid_days+' ngày')+' / '+number(r.pending_count)]
    ];
    for(const [label,value] of metrics){
      const box=add('div','','',stats);add('span',label,'',box);add('strong',value,'',box);
    }
    const caution=Number(r.pending_count)>0
      ? 'Đơn tạm '+String(r.pending_codes||'')+': chưa có lý do xác nhận chưa giao. Không tự suy đoán ít hàng, không đủ chuyến hoặc nợ lâu.'
      : 'Đánh giá theo dữ liệu đã ghi nhận; không kết luận trả đúng/sai hẹn nếu thiếu kỳ hạn.';
    add('p',caution,'care-note');
    add('p','Gợi ý hỏi thăm (chỉ Admin xem; chưa gửi):');
    const area=add('textarea',message(r));area.id='careSuggestedMessage';area.readOnly=true;
    const button=add('button','Sao chép lời nhắn','btn primary');button.type='button';button.id='careCopySuggestion';
    add('p','Chỉ sao chép, không tự gửi Chat/Zalo.').id='careCopyStatus';
  }
  function render(){
    const q=String($('careSearch').value||'').trim().toLocaleLowerCase('vi-VN');
    const filter=$('careFilter').value;
    const list=rows.filter(r=>{
      if(q&&!(String(r.name||'')+' '+String(r.username||'')).toLocaleLowerCase('vi-VN').includes(q))return false;
      if(filter==='all')return true;
      if(filter==='owing')return Number(r.debt_balance)>0;
      if(filter==='pending')return Number(r.pending_count)>0;
      if(filter==='never')return !Number(r.delivered_count);
      if(filter==='lapsed')return Number(r.delivered_count)>0&&Number(r.days_since_purchase)>=elapsed();
      return r.segment===filter;
    });
    $('careCount').textContent=list.length+' khách phù hợp';
    const tbody=$('careBody');tbody.replaceChildren();
    for(const r of list){
      const row=tbody.insertRow();
      if(r.id===selected)row.className='active';
      const first=row.insertCell(),button=document.createElement('button');
      button.type='button';button.dataset.customerId=String(r.id);button.textContent=address(r).name;first.append(button);
      const values=[group(r),number(r.delivered_count),r.avg_order_value==null?'—':number(r.avg_order_value),
        day(r.last_purchase_day),number(r.pending_count),number(r.debt_balance)];
      values.forEach((v,i)=>{const cell=row.insertCell();cell.textContent=v;if([1,2,4,5].includes(i))cell.className='num';});
    }
    if(!list.length){const cell=tbody.insertRow().insertCell();cell.colSpan=7;cell.textContent='Không có khách phù hợp.';cell.className='empty';}
    if(!list.some(x=>x.id===selected))selected=list[0]?.id||'';
    detail(list.find(x=>x.id===selected)||null);
  }
  async function load(force=false){
    const identity=getIdentity();
    if(identity?.role!=='admin'||document.getElementById('customerCarePane')?.classList.contains('hidden'))return;
    if(loading||(!force&&loaded))return;
    loading=true;const requestGeneration=++generation;$('careStatus').textContent='Đang tải báo cáo…';
    try{
      const data=await rpc('taphoa_admin_customer_care_report',{p_inactive_days:elapsed()});
      if(generation!==requestGeneration||getIdentity()?.uid!==identity.uid)return;
      rows=Array.isArray(data?.customers)?data.customers:[];
      for(const [id,key] of [
        ['careTotal','total_customers'],['careBought','bought_customers'],
        ['careNever','never_delivered_customers'],['carePending','pending_customers'],
        ['careLapsed','lapsed_customers'],['careOwing','owing_customers']
      ])$(id).textContent=number(data?.[key]);
      loaded=true;render();
      $('careStatus').textContent='Dữ liệu '+String(data?.generated_on||'')+
        ' · chỉ khách nhóm KH · lý do đơn tạm chưa được ghi nhận.';
    }catch(e){
      $('careStatus').textContent='Không tải được báo cáo: '+String(e?.message||'Có lỗi');
    }finally{if(generation===requestGeneration)loading=false;}
  }
  function reset(){
    generation++;loading=false;rows=[];loaded=false;selected='';
    $('careBody').replaceChildren();
    $('careDetail').textContent='Chọn khách để xem báo cáo.';
    $('careStatus').textContent='Bấm tab để đọc báo cáo.';
    for(const id of ['careTotal','careBought','careNever','carePending','careLapsed','careOwing'])$(id).textContent='—';
    $('careSearch').value='';$('careFilter').value='all';
  }
  $('careRefreshBtn').addEventListener('click',()=>load(true));
  $('careInactiveDays').addEventListener('change',()=>{loaded=false;load(true);});
  $('careSearch').addEventListener('input',render);
  $('careFilter').addEventListener('change',render);
  $('careBody').addEventListener('click',e=>{
    const btn=e.target.closest('button[data-customer-id]');if(!btn)return;
    selected=btn.dataset.customerId;render();
  });
  $('careDetail').addEventListener('click',async e=>{
    if(e.target.id!=='careCopySuggestion')return;
    const text=$('careSuggestedMessage')?.value||'';
    try{await navigator.clipboard.writeText(text);$('careCopyStatus').textContent='Đã sao chép; chưa gửi.';}
    catch{$('careCopyStatus').textContent='Không sao chép được. Hãy chọn nội dung để sao chép thủ công.';}
  });
  return {load,reset};
}
