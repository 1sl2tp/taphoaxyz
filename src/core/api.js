import {createSupabaseGateway} from './supabase.js';
import {createBusinessService} from './business.js?v=order-cycle-readonly-20261104';

export function createApi({clientProvider}={}) {
  const gateway=createSupabaseGateway({clientProvider});
  return createBusinessService({gateway});
}
