import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Clerk runs on every request so `auth()` works in route handlers.
 * No route is protected here on purpose: the app has no login wall.
 * API routes that need a user check `auth()` themselves and return 401.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
