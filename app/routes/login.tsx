import { data, Form, Link, redirect, useActionData, useLoaderData } from 'react-router';
import { getAuth } from '../.server/auth/auth.server.ts';
import { authIsConfigured } from '../.server/auth/config.ts';
import { loginThrottle } from '../.server/security/login-throttle.server.ts';
import { isPrivateLoginPath, privateLoginPath } from '../.server/security/private-path.server.ts';
import { requireSameOrigin } from '../.server/security/same-origin.server.ts';
import './login.scss';

type ActionData = { message: string } | undefined;

const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' };

// Toute adresse qui n'est pas celle de la connexion privée répond exactement
// comme une page inexistante : rien ne distingue l'entrée du compte du reste.
function notFound(): never {
  throw new Response('Introuvable.', { status: 404, headers: privateHeaders });
}

export const headers = () => privateHeaders;

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  if (!isPrivateLoginPath(url.pathname)) notFound();
  if (url.search) throw redirect(privateLoginPath(), { headers: privateHeaders });
  if (!authIsConfigured()) return { ready: false };
  return { ready: true };
}

export async function action({ request }: { request: Request }) {
  if (!isPrivateLoginPath(new URL(request.url).pathname)) notFound();
  if (!authIsConfigured()) throw new Response('Espace privé indisponible.', { status: 503, headers: privateHeaders });
  requireSameOrigin(request);
  const formData = await request.formData();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { message: 'Renseigne ton adresse e-mail et ton mot de passe.' };

  const wait = loginThrottle.retryAfter(email);
  if (wait > 0) {
    return data(
      { message: 'Trop de tentatives. Réessaie dans quelques minutes.' },
      { status: 429, headers: { ...privateHeaders, 'Retry-After': String(wait) } },
    );
  }

  const { auth, config } = getAuth();
  const response = await auth.api.signInEmail({
    body: { email, password, rememberMe: false },
    headers: request.headers,
    asResponse: true,
  });
  if (!response.ok) {
    loginThrottle.fail(email);
    return { message: 'Identifiants incorrects ou accès non autorisé.' };
  }

  const cookies = response.headers.getSetCookie?.() ?? [];
  const sessionHeaders = new Headers(request.headers);
  sessionHeaders.set('cookie', cookies.map((cookie) => cookie.split(';', 1)[0]).join('; '));
  const session = await auth.api.getSession({ headers: sessionHeaders });
  if (!session || session.user.email.trim().toLowerCase() !== config.FINANCE_OWNER_EMAIL) {
    loginThrottle.fail(email);
    await auth.api.signOut({ headers: sessionHeaders, asResponse: true });
    return { message: 'Identifiants incorrects ou accès non autorisé.' };
  }

  loginThrottle.succeed(email);
  const headers = new Headers({ Location: '/finance' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return redirect('/finance', { headers });
}

export default function Login() {
  const { ready } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();

  return <main className="login-page">
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <section className="login-card" aria-labelledby="login-title">
      <p className="login-card__eyebrow">Espace personnel</p>
      <h1 id="login-title">Finance privée</h1>
      {ready ? <Form method="post" className="login-form">
        <label>Adresse e-mail<input name="email" type="email" autoComplete="username" required /></label>
        <label>Mot de passe<input name="password" type="password" autoComplete="current-password" required minLength={12} maxLength={128} /></label>
        {actionData?.message ? <p className="login-form__error" role="alert">{actionData.message}</p> : null}
        <button type="submit">Se connecter</button>
      </Form> : <p className="login-card__message">L’espace privé est en cours de configuration.</p>}
      <Link to="/">Revenir au portfolio</Link>
    </section>
  </main>;
}
