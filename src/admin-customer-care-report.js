// Admin customer care report: single, explicit read-only RPC; no auto-send or background refresh.
export function createCustomerCareReport({rpc,getIdentity}){
  const $=id=>document.getElementById(id);
  const number=v=>Number(v||0).toLocaleString('vi-VN',{maximumFractionDigits:2});
  const amount=v=>v===null||v===undefined?'—':number(v);
  const percent=v=>v===null||v===undefined?'—':number(v)+'%';
  const day=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
  let rows=[],loaded=false,loading=false,selected='',generation=0,reloadQueued=false;
  function address(row){
    const name=String(row.name||'').trim();
    if(/^(Cô|Bác|Chú)\s/i.test(name))return {name,from:'em'};
    const m=name.match(/^([ECA])\s+(.+)$/i);
    if(!m)return {name:name||'anh/chị',from:'em'};
    const t=m[1].toUpperCase();
    return {name:(t==='E'?'Em':t==='C'?'Chị':'Anh')+' '+m[2],from:t==='E'?'chị':'em'};
  }
  const elapsed=()=>Number($('careInactiveDays').value)||7;
  function vietnamBusinessDate(){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',
      year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const item=k=>parts.find(p=>p.type===k)?.value||'';
    return item('year')+'-'+item('month')+'-'+item('day');
  }
  function reportPeriod(){
    const selector=$('carePeriod').value;
    if(selector==='all')return {p_start_date:null,p_end_date:null,label:'Toàn thời gian'};
    if(selector==='custom'){
      const start=$('carePeriodStart').value,end=$('carePeriodEnd').value;
      if(!start||!end)throw new Error('Chọn đủ ngày bắt đầu và ngày kết thúc.');
      if(start>end)throw new Error('Ngày kết thúc không được trước ngày bắt đầu.');
      return {p_start_date:start,p_end_date:end,label:day(start)+' – '+day(end)};
    }
    const days=Number(selector);
    const end=vietnamBusinessDate();
    const dt=new Date(end+'T00:00:00Z');
    dt.setUTCDate(dt.getUTCDate()-(days-1));
    const start=dt.toISOString().slice(0,10);
    return {p_start_date:start,p_end_date:end,label:'Từ '+day(start)+' đến '+day(end)};
  }
  function periodVisibility(){
    const custom=$('carePeriod').value==='custom';
    $('carePeriodStart').classList.toggle('hidden',!custom);
    $('carePeriodEnd').classList.toggle('hidden',!custom);
  }
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
    const costComplete=Number(r.missing_cost_lines||0)===0;
    const metrics=[
      ['Đơn giao kỳ / toàn thời gian',number(r.period_delivered_count)+' / '+number(r.delivered_count)],
      ['Doanh thu hàng bán · kỳ',amount(r.total_revenue)],
      ['Giá vốn tại lúc bán · kỳ',costComplete?amount(r.total_cost):'Thiếu giá vốn ('+number(r.missing_cost_lines)+' dòng)'],
      ['Lãi gộp · kỳ',amount(r.gross_profit)],
      ['Biên lãi / tỷ lệ vốn',percent(r.gross_margin_percent)+' / '+percent(r.cost_ratio_percent)],
      ['Tỷ trọng doanh thu / tổng hệ thống',percent(r.revenue_share_percent)],
      ['Tỷ trọng lãi / tổng lãi hệ thống',percent(r.profit_share_percent)],
      ['TB/đơn giao kỳ',amount(r.avg_order_value)],
      ['Tổng doanh thu đã giao · toàn thời gian',amount(r.lifetime_revenue)],
      ['Ghi nợ khác · trong kỳ',amount(r.period_manual_debt)],
      ['Ghi nợ khác · toàn thời gian',amount(r.lifetime_manual_debt)],
      ['Thu công nợ · trong kỳ',amount(r.period_collected)],
      ['Điều chỉnh giảm · trong kỳ',amount(r.period_adjusted)],
      ['Đã thu · toàn thời gian / số lần',amount(r.collected)+' / '+number(r.collection_count)],
      ['Công nợ hiện tại · toàn thời gian',balance],
      ['Nhịp mua / nhịp thu',buyGap+' / '+payGap],
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
      const values=[group(r),number(r.period_delivered_count),amount(r.total_revenue),
        amount(r.gross_profit),percent(r.gross_margin_percent),amount(r.period_manual_debt),amount(r.debt_balance)];
      values.forEach((v,i)=>{const cell=row.insertCell();cell.textContent=v;if(i>=1)cell.className='num';});
    }
    if(!list.length){const cell=tbody.insertRow().insertCell();cell.colSpan=8;cell.textContent='Không có khách phù hợp.';cell.className='empty';}
    if(!list.some(x=>x.id===selected))selected=list[0]?.id||'';
    detail(list.find(x=>x.id===selected)||null);
  }
  async function load(force=false){
    const identity=getIdentity();
    if(identity?.role!=='admin'||document.getElementById('customerCarePane')?.classList.contains('hidden'))return;
    if(loading||(!force&&loaded))return;
    let period;
    try{period=reportPeriod();}
    catch(error){$('careStatus').textContent=error.message;return;}
    loading=true;const requestGeneration=++generation;$('careStatus').textContent='Đang tải báo cáo…';
    try{
      const data=await rpc('taphoa_admin_customer_care_report',{
        p_inactive_days:elapsed(),p_start_date:period.p_start_date,p_end_date:period.p_end_date
      });
      if(generation!==requestGeneration||getIdentity()?.uid!==identity.uid||reloadQueued)return;
      rows=Array.isArray(data?.customers)?data.customers:[];
      for(const [id,key] of [
        ['careTotal','total_customers'],['careBought','bought_customers'],
        ['careNever','never_delivered_customers'],['carePending','pending_customers'],
        ['careLapsed','lapsed_customers'],['careOwing','owing_customers']
      ])$(id).textContent=number(data?.[key]);
      const totals=data?.system||{};
      $('careSystemRevenue').textContent=amount(totals.revenue);
      $('careSystemCost').textContent=Number(totals.missing_cost_lines)>0?'Thiếu '+totals.missing_cost_lines+' giá vốn':amount(totals.cost);
      $('careSystemProfit').textContent=amount(totals.gross_profit);
      $('careSystemMargin').textContent=percent(totals.gross_margin_percent);
      $('careSystemCostPct').textContent='Tỷ lệ vốn: '+percent(totals.cost_ratio_percent);
      loaded=true;render();
      $('careStatus').textContent='Kỳ '+period.label+' · dữ liệu '+String(data?.generated_on||'')+
        ' · công nợ hiện tại vẫn tính toàn thời gian · lý do đơn tạm chưa được ghi nhận.';
    }catch(e){
      $('careStatus').textContent='Không tải được báo cáo: '+String(e?.message||'Có lỗi');
    }finally{
      if(generation===requestGeneration){
        loading=false;
        if(reloadQueued){
          reloadQueued=false;
          if(!document.getElementById('customerCarePane')?.classList.contains('hidden'))void load(true);
        }
      }
    }
  }
  function reset(){
    generation++;loading=false;reloadQueued=false;rows=[];loaded=false;selected='';
    $('careBody').replaceChildren();
    $('careDetail').textContent='Chọn khách để xem báo cáo.';
    $('careStatus').textContent='Bấm tab để đọc báo cáo.';
    for(const id of ['careTotal','careBought','careNever','carePending','careLapsed','careOwing',
      'careSystemRevenue','careSystemCost','careSystemProfit','careSystemMargin','careSystemCostPct'])$(id).textContent='—';
    $('careSearch').value='';$('careFilter').value='all';
  }
  function refreshPeriod(){
    loaded=false;
    if(loading){reloadQueued=true;return;}
    void load(true);
  }
  $('careRefreshBtn').addEventListener('click',refreshPeriod);
  $('careInactiveDays').addEventListener('change',refreshPeriod);
  $('carePeriod').addEventListener('change',()=>{
    periodVisibility();loaded=false;
    if($('carePeriod').value!=='custom')refreshPeriod();
    else $('careStatus').textContent='Chọn từ ngày và đến ngày để tải báo cáo.';
  });
  for(const id of ['carePeriodStart','carePeriodEnd']){
    $(id).addEventListener('change',()=>{
      loaded=false;
      if($('carePeriodStart').value&&$('carePeriodEnd').value)refreshPeriod();
    });
  }
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
