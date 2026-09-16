const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

export function settingsMarkup({identity}={}){
  const name=String(identity?.displayName||identity?.username||'Tài khoản').trim()||'Tài khoản';
  const username=String(identity?.username||'').replace(/^@/,'');
  return `<section class="fixed-settings-screen" data-screen-id="settings" data-ui-source="TAPHOA_GEMINI_100_SAMPLE_FIXED">
    <header class="bg-[#1e293b] px-4 py-4 shrink-0 rounded-b-[20px] shadow-sm z-10 relative">
      <span class="text-white font-bold text-[15px]">Cài đặt</span>
    </header>
    <main class="fixed-settings-main p-4 no-scrollbar pb-20">
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
        <button class="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50 transition" type="button" data-settings-account>
          <span class="flex items-center gap-3 min-w-0"><span class="fixed-settings-icon"><i class="ph-bold ph-user"></i></span><span class="min-w-0"><span class="block text-[13px] font-bold text-gray-900 truncate">${esc(name)}</span><span class="block text-[10px] text-gray-400 mt-0.5 truncate">${username?`@${esc(username)}`:'Tài khoản đang đăng nhập'}</span></span></span><i class="ph ph-caret-right text-gray-400"></i>
        </button>
        <div class="px-4 py-3.5">
          <div class="flex items-center gap-3"><span class="fixed-settings-icon"><i class="ph-bold ph-device-mobile-camera"></i></span><span><span class="block text-[13px] font-bold text-gray-900">Giao diện</span><span class="block text-[10px] text-gray-400 mt-0.5">Auto: &lt; 768px = Mobile · ≥ 768px = PC</span></span></div>
        </div>
      </div>
      <button class="w-full mt-4 bg-white border border-red-100 text-red-500 rounded-2xl px-4 py-3.5 flex items-center justify-between font-bold text-[13px] shadow-sm hover:bg-red-50 transition" type="button" data-settings-logout><span class="flex items-center gap-3"><i class="ph-bold ph-sign-out text-[17px]"></i>Thoát</span><i class="ph ph-caret-right text-red-300"></i></button>
    </main>
  </section>`;
}

export async function mount(context){
  const root=context.root;
  root.innerHTML=settingsMarkup({identity:context.identity});
  const onClick=event=>{
    if(event.target.closest('[data-settings-account]')){context.openAccount?.();return;}
    if(event.target.closest('[data-settings-logout]'))context.logout?.().catch(error=>context.system?.toast(error?.message||'Không đăng xuất được'));
  };
  root.addEventListener('click',onClick);
  return()=>root.removeEventListener('click',onClick);
}
