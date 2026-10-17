import {createSupabaseGateway} from './supabase.js';
import {createBusinessService} from './business.js?v=finance-png-20261017b';

export function createApi({clientProvider}={}) {
  const gateway=createSupabaseGateway({clientProvider});
  return createBusinessService({gateway});
}
