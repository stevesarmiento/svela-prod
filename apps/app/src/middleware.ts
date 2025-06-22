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
  "/(en|fr)/login",
  "/(en|fr)/register", 
  "/(en|fr)/forgot-password"
]);

export default clerkMiddleware(async (auth, req) => {
  // Check authentication status using Clerk
  const { userId } = await auth();
  const isAuthenticated = !!userId;

  // Check if this is a public route
  const isPublic = isPublicRoute(req);
  
  // Redirect authenticated users away from auth pages
  if (isPublic && isAuthenticated) {
    return NextResponse.redirect(new URL("/overview", req.url));
  }

  // Redirect unauthenticated users from protected routes to login
  if (!isPublic && !isAuthenticated) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Apply internationalization for all other requests
  return I18nMiddleware(req);
});

export const config = {
  matcher: [
    "/((?!_next/static|api|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};