import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createI18nMiddleware } from "next-international/middleware";
import { NextResponse } from "next/server";

const I18nMiddleware = createI18nMiddleware({
  locales: ["en", "fr"],
  defaultLocale: "en",
  urlMappingStrategy: "rewrite",
});

// Define route matchers with locale prefixes
const isPublicRoute = createRouteMatcher([
  "/login",
  "/register",
  "/forgot-password",
  "/sso-callback",
  "/(en|fr)/login",
  "/(en|fr)/register",
  "/(en|fr)/forgot-password",
  "/(en|fr)/sso-callback",
]);

export default clerkMiddleware(async (auth, req) => {
  // Ensure Clerk middleware runs for route handlers that call `auth()`.
  // We skip redirects and i18n for API routes.
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    await auth();
    return NextResponse.next();
  }

  // Check authentication status using Clerk
  const { userId } = await auth();
  const isAuthenticated = !!userId;

  // Check if this is a public route
  const isPublic = isPublicRoute(req);

  // Redirect authenticated users away from auth pages
  if (isPublic && isAuthenticated) {
    return NextResponse.redirect(new URL("/watchlists", req.url));
  }

  // Redirect unauthenticated users from protected routes to login
  if (!isPublic && !isAuthenticated) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Handle dashboard redirects to prevent flashing
  if (isAuthenticated) {
    const pathname = req.nextUrl.pathname;
    const cleanPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";

    // Redirect dashboard routes to watchlists
    if (cleanPath === "/" || cleanPath === "/dashboard") {
      return NextResponse.redirect(new URL("/watchlists", req.url));
    }
  }

  // Apply internationalization for all other requests
  return I18nMiddleware(req);
});

export const config = {
  matcher: [
    "/((?!_next/static|api|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    "/api/(.*)",
  ],
};
