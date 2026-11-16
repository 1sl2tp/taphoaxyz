import {createSupabaseGateway} from './supabase.js';
import {createBusinessService} from './business.js?v=split-pending-20261116';

export function createApi({clientProvider}={}) {
  const gateway=createSupabaseGateway({clientProvider});
  return createBusinessService({gateway});
}
