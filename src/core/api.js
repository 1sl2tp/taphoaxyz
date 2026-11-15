import {createSupabaseGateway} from './supabase.js';
import {createBusinessService} from './business.js?v=order-image-016';

export function createApi({clientProvider}={}) {
  const gateway=createSupabaseGateway({clientProvider});
  return createBusinessService({gateway});
}
