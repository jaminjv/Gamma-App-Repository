import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Protege todo lo que esté bajo /orders, /crews, /dumps, /dashboard:
// si no hay sesión, redirige a /login. De paso refresca el token de
// Supabase Auth, que es lo que mantiene viva la sesión.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          // Hay que escribir las cookies refrescadas en los dos lados: en
          // `request` para que los Server Components de ESTA petición vean
          // ya la sesión nueva, y en `response` para que el navegador se
          // la quede. Escribir solo en `response` provoca cierres de
          // sesión intermitentes cuando el token se refresca.
          cookiesToSet.forEach(({ name, value }: CookieToSet) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }: CookieToSet) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isProtected = ['/dashboard', '/orders', '/crews', '/dumps'].some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    // NextResponse.redirect() crea una respuesta nueva, así que hay que
    // arrastrarle las cookies que acabe de escribir Supabase.
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/orders/:path*', '/crews/:path*', '/dumps/:path*'],
};
