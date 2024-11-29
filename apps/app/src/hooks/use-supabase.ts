import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { type Database } from '@/types/supabase'

export function useSupabase() {
  return createClientComponentClient<Database>({
    cookieOptions: {
      name: 'sb-auth-token',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    }
  })
}