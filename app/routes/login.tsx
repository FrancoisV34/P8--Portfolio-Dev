import { Form, Link, redirect, useActionData, useLoaderData } from 'react-router';
import { getAuth } from '../.server/auth/auth.server.ts';
import { authIsConfigured } from '../.server/auth/config.ts';
import { requireOwner } from '../.server/auth/owner.server.ts';
import './login.scss';

type ActionData = { message: string } | undefined;

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  if (url.search) throw redirect('/login');
  if (!authIsConfigured()) return { ready: false };
  try {
    await requireOwner(request);
    throw redirect('/finance');
  } catch (error) {
    if (error instanceof Response && error.status === 401) return { ready: true };
    throw error;
  }
}

export async function action({ request }: { request: Request }) {
  if (!authIsConfigured()) throw new Response('Espace privé indisponible.', { status: 503 });
  const formData = await request.formData();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) return { message: 'Renseigne ton adresse e-mail et ton mot de passe.' };

  const { auth } = getAuth();
  const response = await auth.api.signInEmail({
    body: { email, password, rememberMe: false },
    headers: request.headers,
    asResponse: true,
  });
  if (!response.ok) return { message: 'Identifiants incorrects ou accès non autorisé.' };

  const headers = new Headers({ Location: '/finance' });
  for (const cookie of response.headers.getSetCookie?.() ?? []) headers.append('Set-Cookie', cookie);
  return redirect('/finance', { headers });
}

export default function Login() {
  const { ready } = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();

  return <main className="login-page">
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
