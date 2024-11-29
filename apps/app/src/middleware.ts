import { updateSession } from "@v1/supabase/middleware";
import { createI18nMiddleware } from "next-international/middleware";
import { type NextRequest, NextResponse } from "next/server";

const I18nMiddleware = createI18nMiddleware({
  locales: ["en", "fr"],
  defaultLocale: "en",
  urlMappingStrategy: "rewrite",
});

export async function middleware(request: NextRequest) {
  // First, handle session updates
  const { response, user } = await updateSession(request, NextResponse.next());

  // Then, apply internationalization
  const i18nResponse = I18nMiddleware(request);
  
  // Merge headers from i18nResponse into the main response
  i18nResponse.headers.forEach((value, key) => {
    response.headers.set(key, value);
  });

  // Redirect unauthenticated users if necessary
  if (!request.nextUrl.pathname.endsWith("/login") && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Set caching headers
  response.headers.set('x-middleware-cache', 'yes');
  response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|api|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};