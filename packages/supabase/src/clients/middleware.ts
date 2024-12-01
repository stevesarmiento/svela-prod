import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

export const updateSession = async (
  request: NextRequest,
  response: NextResponse,
) => {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({
            name,
            value,
            ...options,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
          });
        },
        remove(name: string, options: any) {
          response.cookies.delete({
            name,
            ...options,
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
          });
        },
      },
    },
  );

  try {
    // First get the session
    const { data: { session } } = await supabase.auth.getSession();
    
    // If we have a session, verify the user
    if (session) {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      return { response, user, error: null };
    }
    
    return { response, user: null, error: null };
  } catch (error) {
    console.error('Auth error:', error);
    return { response, user: null, error };
  }
};