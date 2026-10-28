import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_EXPIRES_COOKIE, SESSION_START_COOKIE } from '@/utils/sessionConfig'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname;

  // Check custom session expiration timestamp
  const sessionExpiresAtStr = request.cookies.get(SESSION_EXPIRES_COOKIE)?.value;
  const now = Date.now();
  let isSessionExpired = false;

  if (user) {
    if (!sessionExpiresAtStr) {
      isSessionExpired = true;
    } else {
      const expiresAt = parseInt(sessionExpiresAtStr, 10);
      if (isNaN(expiresAt) || now > expiresAt) {
        isSessionExpired = true;
      }
    }
  }

  // If session is expired, sign out and clear cookies
  if (user && isSessionExpired) {
    try {
      await supabase.auth.signOut();
    } catch {}

    if (pathname.startsWith('/dashboard') || pathname.startsWith('/factory') || pathname.startsWith('/portal') || pathname.startsWith('/api')) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('reason', 'expired');
      const redirectResponse = NextResponse.redirect(url);

      redirectResponse.cookies.delete(SESSION_EXPIRES_COOKIE);
      redirectResponse.cookies.delete(SESSION_START_COOKIE);
      request.cookies.getAll().forEach((c) => {
        if (c.name.startsWith('sb-') || c.name.startsWith('lv_')) {
          redirectResponse.cookies.delete(c.name);
        }
      });

      return redirectResponse;
    }
  }

  // Protect Portal: ONLY Admin can access the Portal selection hub
  if (pathname.startsWith('/portal')) {
    if (!user || isSessionExpired) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      if (isSessionExpired) {
        url.searchParams.set('reason', 'expired');
      }
      return NextResponse.redirect(url);
    }

    const role = user.user_metadata?.role;
    if (role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = role === 'manager' ? '/factory' : '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  // Protect Factory routes: Only Admin and Warehouse Manager can access
  if (pathname.startsWith('/factory')) {
    if (!user || isSessionExpired) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      if (isSessionExpired) {
        url.searchParams.set('reason', 'expired');
      }
      return NextResponse.redirect(url);
    }

    const role = user.user_metadata?.role;
    if (!['admin', 'manager'].includes(role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.redirect(url);
    }
  }

  // Protect Dashboard routes: Admin and Sales can access (Managers belong strictly to Factory)
  if (pathname.startsWith('/dashboard')) {
    if (!user || isSessionExpired) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      if (isSessionExpired) {
        url.searchParams.set('reason', 'expired');
      }
      return NextResponse.redirect(url);
    }

    const role = user.user_metadata?.role;

    // Managers cannot access ERP Dashboard
    if (role === 'manager') {
      const url = request.nextUrl.clone();
      url.pathname = '/factory';
      return NextResponse.redirect(url);
    }

    // If a non-admin tries to access Settings, block them
    if (pathname.startsWith('/dashboard/settings') && role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.redirect(url);
    }
    
    // If a non-admin tries to access User Management, block them
    if (pathname.startsWith('/dashboard/users') && role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.redirect(url);
    }

    // System logs are disabled for now
    if (pathname.startsWith('/dashboard/logs')) {
      const url = request.nextUrl.clone();
      url.pathname = '/unauthorized';
      return NextResponse.redirect(url);
    }
  }

  // Redirect logged-in users away from the login page only if session is active
  if (user && !isSessionExpired && pathname.startsWith('/login')) {
    const role = user.user_metadata?.role;
    const url = request.nextUrl.clone();
    if (role === 'admin') {
      url.pathname = '/portal';
    } else if (role === 'manager') {
      url.pathname = '/factory';
    } else {
      url.pathname = '/dashboard';
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse
}
