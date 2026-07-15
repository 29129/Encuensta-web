import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextMiddleware } from "next/server";
import { isDemoMode } from "./lib/demo";

const demoProxy: NextMiddleware = () => NextResponse.next();

export default isDemoMode() ? demoProxy : clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
