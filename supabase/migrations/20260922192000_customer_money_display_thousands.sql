create or replace function public.taphoa_chat_money(p_amount_vnd bigint)
returns text
language sql
immutable
set search_path = public
as $$
  select replace(
    to_char(abs(coalesce(p_amount_vnd,0)) / 1000,'FM999,999,999,999,990'),
    ',',
    '.'
  );
$$;

create or replace function public.taphoa_chat_balance_label(p_balance_vnd bigint,p_before boolean default false)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if coalesce(p_balance_vnd,0)>0 then
    return (case when p_before then 'Nợ trước: ' else 'Còn nợ: ' end)
      || public.taphoa_chat_money(p_balance_vnd);
  elsif coalesce(p_balance_vnd,0)<0 then
    return (case when p_before then 'Dư trước: ' else 'Còn dư: ' end)
      || public.taphoa_chat_money(p_balance_vnd);
  end if;
  return case when p_before then 'Trước giao dịch: 0' else 'Đã hết nợ: 0' end;
end;
$$;

revoke all on function public.taphoa_chat_money(bigint) from public,anon,authenticated;
revoke all on function public.taphoa_chat_balance_label(bigint,boolean) from public,anon,authenticated;
