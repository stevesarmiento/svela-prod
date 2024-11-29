import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "../types";

export const createClient = () => {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          const store = await cookieStore;
          return store.getAll();
        },
        async setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              const store = await cookieStore;
              store.set(name, value, options);
            }
          } catch (error) {}
        },
      },
    },
  );
};
