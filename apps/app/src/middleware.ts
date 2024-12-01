import { updateSession } from "@v1/supabase/middleware";
import { createI18nMiddleware } from "next-international/middleware";
import { type NextRequest, NextResponse } from "next/server";

const I18nMiddleware = createI18nMiddleware({
  locales: ["en", "fr"],
  defaultLocale: "en",
  urlMappingStrategy: "rewrite",
});

export async function middleware(request: NextRequest) {
  // First, handle session updates and get verified user
  const { response, user, error } = await updateSession(request, NextResponse.next());

  if (error) {
    console.error('Auth error:', error)
  }

  // Then, apply internationalization
  const i18nResponse = I18nMiddleware(request);
  
  // Merge headers from i18nResponse into the main response
  i18nResponse.headers.forEach((value, key) => {
    response.headers.set(key, value);
  });

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/register', '/forgot-password']
  const isPublicRoute = publicRoutes.some(route => 
    request.nextUrl.pathname.endsWith(route)
  )

  // Redirect unauthenticated users if necessary
  if (!isPublicRoute && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from auth pages
  if (isPublicRoute && user) {
    return NextResponse.redirect(new URL('/overview', request.url))
  }

  // Set security headers
  // response.headers.set('x-middleware-cache', 'yes')
  // response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  response.headers.set('x-middleware-cache', 'no-store')
  response.headers.set('Cache-Control', 'no-store, must-revalidate')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|api|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};