import {createSupabaseGateway} from './supabase.js';
import {createBusinessService} from './business.js';

export function createApi({clientProvider}={}) {
  const gateway=createSupabaseGateway({clientProvider});
  return createBusinessService({gateway});
}
