import { Form, Link, redirect, useActionData, useLoaderData } from 'react-router';
import { getAuth } from '../.server/auth/auth.server.ts';
import { authIsConfigured } from '../.server/auth/config.ts';
import { requireOwner } from '../.server/auth/owner.server.ts';
import { accountsRepository } from '../.server/repositories/accounts.ts';
import { budgetRepository } from '../.server/repositories/budget.ts';
import { requireSameOrigin } from '../.server/security/same-origin.server.ts';
import { parseMonth } from '../lib/finance/dates.ts';
import { euroCents, eurosDecimal, formatEuros, parseEuros } from '../lib/finance/units.ts';
import './finance.scss';

const sections = ['overview', 'accounts', 'categories', 'transactions', 'budget'] as const;
type Section = typeof sections[number];
type ActionData = { error: string } | undefined;

const privateHeaders = () => ({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
const unavailable = () => { throw new Response('Espace privé indisponible.', { status: 503, headers: privateHeaders() }); };
const currentPeriod = () => new Date().toISOString().slice(0, 7);

function sectionFor(splat: string): Section {
  const section = splat.split('/')[0];
  if (!section) return 'overview';
  if ((sections as readonly string[]).includes(section)) return section as Section;
  throw new Response('Introuvable.', { status: 404, headers: privateHeaders() });
}
function field(data: FormData, key: string, max = 500) {
  const value = data.get(key);
  if (typeof value !== 'string' || value.length > max) throw new Error('invalid');
  return value;
}
function amount(data: FormData, key: string, signed = false) {
  const value = parseEuros(field(data, key, 32));
  if ((!signed && value <= 0) || !Number.isSafeInteger(value)) throw new Error('invalid');
  return value;
}
function back(request: Request) { const url = new URL(request.url); return redirect(`${url.pathname.replace(/\.data$/, '')}${url.search}`); }
function failure() { return { error: 'La saisie ne peut pas être enregistrée. Vérifie les champs et réessaie.' }; }

export async function loader({ request, params }: { request: Request; params: Record<string, string | undefined> }) {
  if (!authIsConfigured()) return unavailable();
  const session = await requireOwner(request);
  const url = new URL(request.url);
  const period = parseMonth(url.searchParams.get('period') ?? currentPeriod());
  const database = getAuth().connection.db;
  const accounts = accountsRepository(database, session.user.id);
  const budget = budgetRepository(database, session.user.id);
  return {
    name: session.user.name, section: sectionFor(params['*'] ?? ''), period,
    entities: accounts.listEntities(), accounts: accounts.listAccounts(), categories: budget.listCategories(),
    transactions: budget.listTransactions(period), dashboard: budget.dashboard(period),
  };
}

export async function action({ request }: { request: Request }) {
  if (!authIsConfigured()) return unavailable();
  const session = await requireOwner(request);
  requireSameOrigin(request);
  try {
    const data = await request.formData();
    const intent = field(data, 'intent', 40);
    if (intent === 'signOut') return getAuth().auth.api.signOut({ headers: request.headers, asResponse: true });
    const database = getAuth().connection.db;
    const accounts = accountsRepository(database, session.user.id);
    const budget = budgetRepository(database, session.user.id);
    switch (intent) {
      case 'createEntity': accounts.createEntity({ name: field(data, 'name', 100), type: field(data, 'type', 20) as 'personal' | 'business' }); break;
      case 'createAccount': accounts.createAccount({ entityId: field(data, 'entityId', 64), name: field(data, 'name', 100), type: field(data, 'type', 20) as 'checking' | 'savings' | 'cash', openingBalanceCents: amount(data, 'openingBalance', true), openingDate: field(data, 'openingDate', 10) }); break;
      case 'updateAccount': accounts.updateAccount({ id: field(data, 'id', 64), name: field(data, 'name', 100), type: field(data, 'type', 20) as 'checking' | 'savings' | 'cash', openingBalanceCents: amount(data, 'openingBalance', true), openingDate: field(data, 'openingDate', 10), isActive: field(data, 'isActive', 8) === 'true' }); break;
      case 'createCategory': budget.createCategory({ name: field(data, 'name', 100), kind: field(data, 'kind', 20) as 'income' | 'expense' }); break;
      case 'updateCategory': budget.updateCategory({ id: field(data, 'id', 64), name: field(data, 'name', 100), kind: field(data, 'kind', 20) as 'income' | 'expense', isActive: field(data, 'isActive', 8) === 'true' }); break;
      case 'createTransaction': budget.createTransaction({ accountId: field(data, 'accountId', 64), categoryId: field(data, 'categoryId', 64), kind: field(data, 'kind', 20) as 'income' | 'expense', amountCents: amount(data, 'amount'), occurredOn: field(data, 'occurredOn', 10), note: field(data, 'note', 240) }); break;
      case 'updateTransaction': budget.updateTransaction({ id: field(data, 'id', 64), accountId: field(data, 'accountId', 64), categoryId: field(data, 'categoryId', 64), kind: field(data, 'kind', 20) as 'income' | 'expense', amountCents: amount(data, 'amount'), occurredOn: field(data, 'occurredOn', 10), note: field(data, 'note', 240) }); break;
      case 'createTransfer': budget.createTransfer({ fromAccountId: field(data, 'fromAccountId', 64), toAccountId: field(data, 'toAccountId', 64), amountCents: amount(data, 'amount'), occurredOn: field(data, 'occurredOn', 10), note: field(data, 'note', 240) }); break;
      case 'deleteTransaction': if (field(data, 'confirmDelete', 10) !== 'delete') throw new Error('invalid'); budget.deleteTransaction(field(data, 'id', 64)); break;
      case 'setBudget': budget.setBudget({ categoryId: field(data, 'categoryId', 64), period: field(data, 'period', 7), plannedAmountCents: amount(data, 'plannedAmount') }); break;
      case 'deleteBudget': if (field(data, 'confirmDelete', 10) !== 'delete') throw new Error('invalid'); budget.deleteBudget(field(data, 'id', 64)); break;
      default: throw new Error('invalid');
    }
  } catch { return failure(); }
  return back(request);
}

export const headers = () => privateHeaders();
export const meta = () => [{ title: 'Finance privée — François Vittecoq' }, { name: 'robots', content: 'noindex, nofollow' }];

const path = (section: Exclude<Section, 'overview'>, period: string) => `/finance/${section}?period=${encodeURIComponent(period)}`;
function near(period: string, delta: -1 | 1) {
  const [year, month] = parseMonth(period).split('-').map(Number); const index = month - 1 + delta;
  return `${year + Math.floor(index / 12)}-${String((index + 12) % 12 + 1).padStart(2, '0')}`;
}
const money = (cents: number) => formatEuros(euroCents(cents));
const decimalMoney = (cents: number) => eurosDecimal(euroCents(cents));
const Currency = ({ cents }: { cents: number }) => <span>{money(cents)}</span>;

export default function Finance() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const activeAccounts = data.accounts.filter((item) => item.isActive);
  const activeCategories = data.categories.filter((item) => item.isActive);
  const balances = new Map(data.dashboard.accounts.map((item) => [item.id, item.balanceCents]));
  return <main className="finance-page">
    <header className="finance-header"><div><p className="finance-eyebrow">Espace personnel</p><h1>{({ overview: 'Vue d’ensemble', accounts: 'Comptes', categories: 'Catégories', transactions: 'Transactions', budget: 'Budget' })[data.section]}</h1><p>Bonjour {data.name}.</p></div><Form method="post"><input type="hidden" name="intent" value="signOut" /><button className="finance-button finance-button--quiet">Se déconnecter</button></Form></header>
    <nav className="finance-nav" aria-label="Navigation financière"><Link to={`/finance?period=${data.period}`} aria-current={data.section === 'overview' ? 'page' : undefined}>Synthèse</Link><Link to={path('accounts', data.period)} aria-current={data.section === 'accounts' ? 'page' : undefined}>Comptes</Link><Link to={path('categories', data.period)} aria-current={data.section === 'categories' ? 'page' : undefined}>Catégories</Link><Link to={path('transactions', data.period)} aria-current={data.section === 'transactions' ? 'page' : undefined}>Transactions</Link><Link to={path('budget', data.period)} aria-current={data.section === 'budget' ? 'page' : undefined}>Budget</Link></nav>
    {actionData?.error ? <p className="finance-alert" role="alert">{actionData.error}</p> : null}
    {data.section === 'overview' ? <Overview data={data} /> : null}
    {data.section === 'accounts' ? <Accounts data={data} balances={balances} /> : null}
    {data.section === 'categories' ? <Categories categories={data.categories} /> : null}
    {data.section === 'transactions' ? <Transactions data={data} accounts={activeAccounts} categories={activeCategories} /> : null}
    {data.section === 'budget' ? <Budget data={data} /> : null}
  </main>;
}

type Data = Awaited<ReturnType<typeof loader>>;
function Period({ period }: { period: string }) { return <nav className="finance-month" aria-label="Période budgétaire"><Link to={`/finance?period=${near(period, -1)}`}>Mois précédent</Link><strong>{period}</strong><Link to={`/finance?period=${near(period, 1)}`}>Mois suivant</Link></nav>; }
function Overview({ data }: { data: Data }) {
  if (data.accounts.length === 0) return <section className="finance-empty"><h2>Commencer par les comptes</h2><p>Ajoute une entité puis les soldes d’ouverture datés. Ils ne sont pas des revenus ni des dépenses.</p><Link className="finance-button" to={path('accounts', data.period)}>Configurer les comptes</Link></section>;
  return <section className="finance-content"><Period period={data.period} /><section className="finance-metrics"><Metric label="Revenus" cents={data.dashboard.incomeCents} /><Metric label="Dépenses" cents={data.dashboard.expenseCents} /><Metric label="Reste du mois" cents={data.dashboard.surplusCents} emphasis /></section><section className="finance-card"><h2>Soldes actuels</h2><List rows={data.dashboard.accounts.map((account) => [account.name, money(account.balanceCents)])} /></section><section className="finance-card"><h2>Suivi du budget</h2>{data.dashboard.budgets.length ? <List rows={data.dashboard.budgets.map(({ category, budget, actualCents }) => [category.name, `${money(actualCents)}${budget ? ` / ${money(budget.plannedAmountCents)}` : ''}`])} /> : <p>Ajoute des catégories de dépense puis un budget mensuel.</p>}<Link className="finance-text-link" to={path('budget', data.period)}>Ouvrir le budget</Link></section><section className="finance-card"><h2>Historique</h2><p>Le suivi commence avec {data.period}. Les tendances seront affichées seulement quand des mois réels seront disponibles.</p></section></section>;
}
function Metric({ label, cents, emphasis = false }: { label: string; cents: number; emphasis?: boolean }) { return <article className={`finance-metric ${emphasis ? 'finance-metric--emphasis' : ''}`}><p>{label}</p><strong><Currency cents={cents} /></strong></article>; }
function List({ rows }: { rows: [string, string][] }) { return <ul className="finance-list">{rows.map(([left, right]) => <li key={`${left}-${right}`}><span>{left}</span><span>{right}</span></li>)}</ul>; }

function Accounts({ data, balances }: { data: Data; balances: Map<string, number> }) { const date = `${data.period}-01`; return <section className="finance-content finance-grid"><section className="finance-card"><h2>Entité économique</h2><p className="finance-help">Crée ton foyer personnel avant d’ajouter un compte.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="createEntity" /><label>Nom<input name="name" required maxLength={100} /></label><label>Type<select name="type" defaultValue="personal"><option value="personal">Personnel</option><option value="business">Business</option></select></label><button className="finance-button">Ajouter l’entité</button></Form>{data.entities.length ? <List rows={data.entities.map((entity) => [entity.name, entity.type === 'personal' ? 'Personnel' : 'Business'])} /> : null}</section><section className="finance-card"><h2>Compte et solde d’ouverture</h2>{data.entities.length === 0 ? <p>Ajoute d’abord une entité économique.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="createAccount" /><label>Entité<select name="entityId">{data.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>Nom<input name="name" required maxLength={100} /></label><label>Type<select name="type" defaultValue="checking"><option value="checking">Compte courant</option><option value="savings">Épargne</option><option value="cash">Espèces</option></select></label><label>Solde d’ouverture (€)<input name="openingBalance" inputMode="decimal" placeholder="0,00" required /></label><label>Date d’ouverture<input name="openingDate" type="date" defaultValue={date} required /></label><button className="finance-button">Ajouter le compte</button></Form>}</section><section className="finance-card finance-card--wide"><h2>Comptes enregistrés</h2>{data.accounts.length === 0 ? <p>Aucun compte saisi.</p> : <ul className="finance-records">{data.accounts.map((account) => <li key={account.id}><div><strong>{account.name}</strong><p>{account.type} · ouverture le {account.openingDate} · {account.isActive ? 'actif' : 'archivé'}</p><p>Solde courant : <Currency cents={balances.get(account.id) ?? account.openingBalanceCents} /></p></div><details><summary>Modifier</summary><Form method="post" className="finance-form"><input type="hidden" name="intent" value="updateAccount" /><input type="hidden" name="id" value={account.id} /><input type="hidden" name="type" value={account.type} /><label>Nom<input name="name" defaultValue={account.name} required maxLength={100} /></label><label>Solde d’ouverture (€)<input name="openingBalance" defaultValue={decimalMoney(account.openingBalanceCents)} inputMode="decimal" required /></label><label>Date d’ouverture<input name="openingDate" type="date" defaultValue={account.openingDate} required /></label><label>État<select name="isActive" defaultValue={String(account.isActive)}><option value="true">Actif</option><option value="false">Archivé</option></select></label><button className="finance-button">Enregistrer</button></Form></details></li>)}</ul>}</section></section>; }

function Categories({ categories }: { categories: Data['categories'] }) { return <section className="finance-content finance-grid"><section className="finance-card"><h2>Nouvelle catégorie</h2><p className="finance-help">Les catégories séparent revenus et dépenses ; un transfert n’en utilise pas.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="createCategory" /><label>Nom<input name="name" required maxLength={100} /></label><label>Nature<select name="kind" defaultValue="expense"><option value="expense">Dépense</option><option value="income">Revenu</option></select></label><button className="finance-button">Ajouter la catégorie</button></Form></section><section className="finance-card"><h2>Catégories enregistrées</h2>{categories.length === 0 ? <p>Crée les catégories utiles avant de saisir le journal.</p> : <ul className="finance-records">{categories.map((category) => <li key={category.id}><div><strong>{category.name}</strong><p>{category.kind === 'income' ? 'Revenu' : 'Dépense'} · {category.isActive ? 'active' : 'archivée'}</p></div><details><summary>Modifier</summary><Form method="post" className="finance-form"><input type="hidden" name="intent" value="updateCategory" /><input type="hidden" name="id" value={category.id} /><label>Nom<input name="name" defaultValue={category.name} required maxLength={100} /></label><label>Nature<select name="kind" defaultValue={category.kind}><option value="expense">Dépense</option><option value="income">Revenu</option></select></label><label>État<select name="isActive" defaultValue={String(category.isActive)}><option value="true">Active</option><option value="false">Archivée</option></select></label><button className="finance-button">Enregistrer</button></Form></details></li>)}</ul>}</section></section>; }

function AccountSelect({ accounts, name, selected }: { accounts: Data['accounts']; name: string; selected?: string }) { return <select name={name} defaultValue={selected} required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>; }
function CategorySelect({ categories, selected }: { categories: Data['categories']; selected?: string }) { return <label>Catégorie<select name="categoryId" defaultValue={selected} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.kind === 'income' ? 'Revenu' : 'Dépense'} — {category.name}</option>)}</select></label>; }
function Delete({ intent, id, text }: { intent: 'deleteTransaction' | 'deleteBudget'; id: string; text: string }) { return <Form method="post" className="finance-delete"><input type="hidden" name="intent" value={intent} /><input type="hidden" name="id" value={id} /><label><input type="checkbox" name="confirmDelete" value="delete" required /> {text}</label><button>Supprimer</button></Form>; }

function Transactions({ data, accounts, categories }: { data: Data; accounts: Data['accounts']; categories: Data['categories'] }) { const date = `${data.period}-01`; const ready = accounts.length > 0 && categories.length > 0; return <section className="finance-content finance-grid"><section className="finance-card"><h2>Revenu ou dépense</h2>{!ready ? <p>Il faut un compte actif et une catégorie active pour saisir une transaction.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="createTransaction" /><label>Nature<select name="kind" defaultValue="expense"><option value="expense">Dépense</option><option value="income">Revenu</option></select></label><label>Compte<AccountSelect accounts={accounts} name="accountId" /></label><CategorySelect categories={categories} /><label>Montant (€)<input name="amount" inputMode="decimal" placeholder="0,00" required /></label><label>Date<input name="occurredOn" type="date" defaultValue={date} required /></label><label>Note facultative<input name="note" maxLength={240} /></label><button className="finance-button">Ajouter au journal</button></Form>}</section><section className="finance-card"><h2>Transfert entre comptes</h2>{accounts.length < 2 ? <p>Ajoute deux comptes actifs pour enregistrer un transfert.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="createTransfer" /><label>Depuis<AccountSelect accounts={accounts} name="fromAccountId" /></label><label>Vers<AccountSelect accounts={accounts} name="toAccountId" /></label><label>Montant (€)<input name="amount" inputMode="decimal" placeholder="0,00" required /></label><label>Date<input name="occurredOn" type="date" defaultValue={date} required /></label><label>Note facultative<input name="note" maxLength={240} /></label><button className="finance-button">Enregistrer le transfert</button></Form>}</section><section className="finance-card finance-card--wide"><h2>Journal — {data.period}</h2>{data.transactions.length === 0 ? <p>Aucun mouvement pour cette période.</p> : <ul className="finance-records">{data.transactions.map(({ transaction, accountName, categoryName }) => <li key={transaction.id}><div><strong>{transaction.occurredOn} · {accountName}</strong><p>{transaction.kind === 'transfer' ? 'Transfert' : `${transaction.kind === 'income' ? 'Revenu' : 'Dépense'} · ${categoryName}`}{transaction.note ? ` · ${transaction.note}` : ''}</p><p><Currency cents={transaction.amountCents} /></p></div>{transaction.kind === 'transfer' ? <Delete intent="deleteTransaction" id={transaction.id} text="Ce transfert supprimera ses deux écritures." /> : <details><summary>Corriger</summary><Form method="post" className="finance-form"><input type="hidden" name="intent" value="updateTransaction" /><input type="hidden" name="id" value={transaction.id} /><label>Nature<select name="kind" defaultValue={transaction.kind}><option value="expense">Dépense</option><option value="income">Revenu</option></select></label><label>Compte<AccountSelect accounts={accounts} name="accountId" selected={transaction.accountId} /></label><CategorySelect categories={categories} selected={transaction.categoryId ?? undefined} /><label>Montant (€)<input name="amount" defaultValue={decimalMoney(Math.abs(transaction.amountCents))} inputMode="decimal" required /></label><label>Date<input name="occurredOn" type="date" defaultValue={transaction.occurredOn} required /></label><label>Note facultative<input name="note" defaultValue={transaction.note} maxLength={240} /></label><button className="finance-button">Enregistrer</button></Form><Delete intent="deleteTransaction" id={transaction.id} text="Cette suppression est définitive." /></details>}</li>)}</ul>}</section></section>; }

function Budget({ data }: { data: Data }) { const expenses = data.categories.filter((category) => category.isActive && category.kind === 'expense'); return <section className="finance-content finance-grid"><section className="finance-card"><h2>Budget mensuel — {data.period}</h2>{expenses.length === 0 ? <p>Ajoute d’abord une catégorie de dépense.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="setBudget" /><input type="hidden" name="period" value={data.period} /><label>Catégorie<select name="categoryId">{expenses.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Prévu (€)<input name="plannedAmount" inputMode="decimal" placeholder="0,00" required /></label><button className="finance-button">Définir le budget</button></Form>}</section><section className="finance-card"><h2>Prévu et réalisé</h2>{data.dashboard.budgets.length === 0 ? <p>Aucun budget de dépense à afficher pour ce mois.</p> : <ul className="finance-records">{data.dashboard.budgets.map(({ category, budget, actualCents }) => <li key={category.id}><div><strong>{category.name}</strong><p>Prévu : {budget ? money(budget.plannedAmountCents) : '—'} · Réel : {money(actualCents)}</p></div>{budget ? <Delete intent="deleteBudget" id={budget.id} text="Retirer ce budget." /> : null}</li>)}</ul>}<p className="finance-help">Le réalisé provient des dépenses du journal. Les transferts ne sont ni revenus ni dépenses.</p></section></section>; }

export function ErrorBoundary() { return <main className="status-page"><h1>Espace privé indisponible</h1><p>L’accès nécessite une connexion personnelle.</p><Link to="/login">Ouvrir la connexion</Link></main>; }
