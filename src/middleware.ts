import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Static files (build output, icons, the launch film) skip the session check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|splash/|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|svg|webp|ico|mp4|webm)$).*)"],
};
