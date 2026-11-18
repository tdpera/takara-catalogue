import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

const PUBLIC_PATHS = [/^\/login(\/|$)/, /^\/s\//, /^\/api\/public\//];

/** Refreshes the auth session cookie and sends signed-out visitors to /login. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Validates the JWT with Supabase Auth; don't put code between createServerClient and this call.
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!data.user && !PUBLIC_PATHS.some((re) => re.test(path))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
