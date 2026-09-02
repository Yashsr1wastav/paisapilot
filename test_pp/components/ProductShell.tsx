'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Account, Budget, Goal, Loan, Transaction } from '@paisapilot/contracts';
import { api, authenticate, session } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/format';
import { validateImportCsv } from '@/lib/import-validation';

type Domain = 'dashboard' | 'transactions' | 'accounts' | 'investments' | 'budgets' | 'goals' | 'bills' | 'loans' | 'analytics' | 'ai' | 'settings';
const nav: Array<[Domain, string, string]> = [
  ['dashboard', 'Overview', '01'], ['transactions', 'Transactions', '02'], ['accounts', 'Accounts', '03'],
  ['investments', 'Investments', '04'], ['budgets', 'Budgets', '05'], ['goals', 'Goals', '06'],
  ['bills', 'Bills', '07'], ['loans', 'Loans', '08'], ['analytics', 'Analytics & health', '09'],
  ['ai', 'Ask PaisaPilot', '10'], ['settings', 'Settings', '11'],
];
const subtitles: Record<Domain, string> = {
  dashboard: 'A clear view of what your money is doing.',
  transactions: 'Every rupee, accounted for.',
  accounts: 'Your financial world, in one place.',
  investments: 'Track holdings without the trading noise.',
  budgets: 'Give your monthly spending a shape.',
  goals: 'Small, intentional steps add up.',
  bills: 'The commitments coming up next.',
  loans: 'See the cost and the way out.',
  analytics: 'Signals for a steadier financial life.',
  ai: 'A practical answer, grounded in your data.',
  settings: 'Control your account and your data.',
};
const domainTitles: Record<Domain, string> = {
  dashboard: 'Overview', transactions: 'Transactions', accounts: 'Accounts',
  investments: 'Investments', budgets: 'Budgets', goals: 'Goals',
  bills: 'Bills', loans: 'Loans', analytics: 'Analytics & health',
  ai: 'Ask PaisaPilot', settings: 'Settings',
};

function greeting(name: string): string {
  const h = new Date().getHours();
  const time = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night';
  return `Good ${time}, ${name}.`;
}

export default function ProductShell({ initialDomain = 'dashboard', showImport = false }: { initialDomain?: Domain; showImport?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const domain = (pathname?.split('/')[1] as Domain) || initialDomain;

  const [authed, setAuthed] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [data, setData] = useState<Record<string, unknown>>({});
  const [userName, setUserName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'ai'; text: string; label?: string }>>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Skip the data-fetch effect after a local optimistic update (form submit)
  // so adding a transaction or account doesn't trigger a full reload spinner.
  const skipNextFetch = useRef(false);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();

  // Session check on mount only
  useEffect(() => {
    const token = session.get();
    if (!token) { setAuthed(false); setSessionChecked(true); return; }
    api<{ user: { id: string; email: string } }>('/v1/auth/session')
      .then((res: { user: { id: string; email: string } }) => {
        const raw = res.user.email.split('@')[0] ?? '';
        const first = raw.split(/[._-]/)[0] ?? raw;
        setUserName(first.charAt(0).toUpperCase() + first.slice(1).toLowerCase());
        setAuthed(true);
      })
      .catch(() => { session.clear(); setAuthed(false); })
      .finally(() => setSessionChecked(true));
  }, []);

  // Data fetch — skips when a form has just done an optimistic local update
  useEffect(() => {
    if (!authed) return;
    if (skipNextFetch.current) { skipNextFetch.current = false; return; }
    const endpoints: Partial<Record<Domain, string[]>> = {
      dashboard: ['/v1/summary', '/v1/accounts'],
      transactions: ['/v1/transactions', '/v1/accounts'],
      accounts: ['/v1/accounts'],
      investments: ['/v1/accounts'],
      budgets: ['/v1/budgets'],
      goals: ['/v1/goals'],
      loans: ['/v1/loans'],
      analytics: ['/v1/health-score', '/v1/transactions'],
    };
    const paths = endpoints[domain];
    if (!paths) { setLoading(false); return; }
    setLoading(true); setPageError('');
    Promise.all(paths.map((p) => api<Record<string, unknown>>(p)))
      .then((results: Record<string, unknown>[]) => setData(results.reduce<Record<string, unknown>>((acc: Record<string, unknown>, r: Record<string, unknown>) => ({ ...acc, ...r }), {})))
      .catch((reason: Error) => setPageError(reason.message))
      .finally(() => setLoading(false));
  }, [authed, domain]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setPageError('');
    try {
      const email = await authenticate(emailInput, password, register ? 'register' : 'login');
      const raw = email.split('@')[0] ?? '';
      const first = raw.split(/[._-]/)[0] ?? raw;
      setUserName(first.charAt(0).toUpperCase() + first.slice(1).toLowerCase());
      setAuthed(true);
    } catch (reason) { setPageError(reason instanceof Error ? reason.message : 'Could not sign in'); }
  }

  async function askAi(event: React.FormEvent) {
    event.preventDefault();
    if (!aiPrompt.trim() || aiLoading) return;
    const userMsg = aiPrompt.trim();
    setAiMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setAiPrompt(''); setAiLoading(true);
    try {
      const result = await api<{ text: string; label: string; disclaimer?: string }>('/v1/ai/answer', {
        method: 'POST', body: JSON.stringify({ prompt: userMsg }),
      });
      setAiMessages((prev) => [...prev, { role: 'ai', text: result.text + (result.disclaimer ? `\n\n${result.disclaimer}` : ''), label: result.label }]);
    } catch (reason) {
      setAiMessages((prev) => [...prev, { role: 'ai', text: reason instanceof Error ? reason.message : 'AI unavailable.', label: 'error' }]);
    } finally { setAiLoading(false); }
  }

  function signOut() {
    void api('/v1/auth/session', { method: 'DELETE' })
      .finally(() => { session.clear(); setAuthed(false); setSessionChecked(true); setData({}); });
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 2000);
  }

  // Optimistic update helpers — set the skip flag before updating data
  // so the useEffect that watches [authed, domain] doesn't refetch
  function updateTransactions(transactions: Transaction[]) {
    skipNextFetch.current = true;
    setData((c) => ({ ...c, transactions }));
  }
  function updateAccounts(accounts: Account[]) {
    skipNextFetch.current = true;
    setData((c) => ({ ...c, accounts }));
  }
  function updateBudgets(budgets: Budget[]) {
    skipNextFetch.current = true;
    setData((c) => ({ ...c, budgets }));
  }
  function updateGoals(goals: Goal[]) {
    skipNextFetch.current = true;
    setData((c) => ({ ...c, goals }));
  }
  function updateLoans(loans: Loan[]) {
    skipNextFetch.current = true;
    setData((c) => ({ ...c, loans }));
  }

  if (!sessionChecked) return (
    <div className="state"><span className="loader" />Loading your workspace...</div>
  );

  if (!authed) return (
    <main className="auth">
      <div className="auth-copy">
        <Link className="brand" href="/"><span>PP</span> paisapilot</Link>
        <p className="eyebrow">PERSONAL MONEY OS</p>
        <h1>Make your money feel less mysterious.</h1>
        <p>See where it goes, understand what matters, and make the next considered move.</p>
        <Link className="auth-privacy" href="/privacy-policy">Privacy policy</Link>
      </div>
      <form className="auth-form" onSubmit={signIn}>
        <h2>{register ? 'Create your workspace' : 'Welcome back'}</h2>
        <label>Email<input type="email" required value={emailInput} onChange={(e) => setEmailInput(e.target.value)} autoComplete="email" /></label>
        <label>Password<input type="password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={register ? 'new-password' : 'current-password'} /></label>
        {pageError && <p className="error" role="alert">{pageError}</p>}
        <button className="button primary">{register ? 'Create account' : 'Sign in'} <span>→</span></button>
        <button type="button" className="link-button" onClick={() => { setRegister(!register); setPageError(''); }}>
          {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
        <footer className="site-footer auth-footer">
          <Link href="/">PaisaPilot</Link>
          <Link href="/privacy-policy">Privacy policy</Link>
        </footer>
      </form>
    </main>
  );

  const title = domain === 'dashboard' ? greeting(userName || 'there') : domainTitles[domain];
  const subtitle = subtitles[domain];

  return (
    <div className="app">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard"><span>PP</span> paisapilot</Link>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {nav.map(([key, label, number]) => (
            <Link className={domain === key ? 'active' : ''} href={`/${key}`} key={key} prefetch={false}>
              <b>{number}</b>{label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/privacy-policy">Privacy</Link>
          <button className="button ghost" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{today}</p>
            <h1 className={domain === 'dashboard' ? 'dashboard-hero-title' : ''}>{title}</h1>
            <p className="subtitle">{subtitle}</p>
          </div>
          <div className="avatar" title={userName}>
            {(userName.charAt(0) || 'P').toUpperCase()}
          </div>
        </header>

        {pageError && <div className="error-banner" role="alert">{pageError}</div>}

        {loading
          ? <div className="state"><span className="loader" />Loading...</div>
          : <DomainView
              domain={domain}
              data={data}
              aiPrompt={aiPrompt}
              setAiPrompt={setAiPrompt}
              aiMessages={aiMessages}
              aiLoading={aiLoading}
              askAi={askAi}
              showImport={showImport}
              router={router}
              onAccountsChange={updateAccounts}
              onTransactionsChange={updateTransactions}
              onBudgetsChange={updateBudgets}
              onGoalsChange={updateGoals}
              onLoansChange={updateLoans}
              onAccountsRefetch={(accs) => setData((c) => ({ ...c, accounts: accs }))}
            />
        }

        {domain === 'dashboard' && (
          <button
            className="quick-add-fab"
            onClick={() => setShowQuickAdd(true)}
            aria-label="Quick add transaction"
          >
            +
          </button>
        )}

        {showQuickAdd && (
          <QuickAddModal
            accounts={(data.accounts ?? []) as Account[]}
            onClose={() => setShowQuickAdd(false)}
            onCreated={(tx) => {
              setShowQuickAdd(false);
              const kindLabel = tx.kind === 'income' ? 'income' : 'expense';
              showToast(`₹${tx.amountPaise / 100} ${kindLabel} added`);
              // Update summary locally if on dashboard
              api<{ incomePaise: number; expensePaise: number; netPaise: number }>('/v1/summary')
                .then((summary: { incomePaise: number; expensePaise: number; netPaise: number }) => setData((c) => ({ ...c, ...summary })))
                .catch(() => {});
            }}
          />
        )}

        {toastMessage && <div className="toast">{toastMessage}</div>}
      </main>
    </div>
  );
}

function DomainView({
  domain, data, aiPrompt, setAiPrompt, aiMessages, aiLoading, askAi, showImport, router,
  onAccountsChange, onTransactionsChange, onBudgetsChange, onGoalsChange, onLoansChange, onAccountsRefetch
}: {
  domain: Domain; data: Record<string, unknown>;
  aiPrompt: string; setAiPrompt: (v: string) => void;
  aiMessages: Array<{ role: 'user' | 'ai'; text: string; label?: string }>;
  aiLoading: boolean; askAi: (e: React.FormEvent) => void;
  showImport: boolean; router: ReturnType<typeof useRouter>;
  onAccountsChange: (a: Account[]) => void;
  onTransactionsChange: (t: Transaction[]) => void;
  onBudgetsChange: (b: Budget[]) => void;
  onGoalsChange: (g: Goal[]) => void;
  onLoansChange: (l: Loan[]) => void;
  onAccountsRefetch: (a: Account[]) => void;
}) {
  if (domain === 'dashboard') {
    const summary = data as { incomePaise?: number; expensePaise?: number; netPaise?: number };
    return (
      <>
        <section className="hero-grid">
          <div className="balance">
            <p className="eyebrow">MONTHLY NET FLOW</p>
            <strong>{formatINR(summary.netPaise ?? 0)}</strong>
            <span className={(summary.netPaise ?? 0) >= 0 ? 'positive' : 'negative'}>
              {(summary.netPaise ?? 0) >= 0 ? '↑' : '↓'} after income and expenses
            </span>
          </div>
          <div className="insight">
            <p className="eyebrow">PaisaPilot note</p>
            <h2>Start with one honest month.</h2>
            <p>Add an account and a few transactions to unlock patterns that are actually yours.</p>
            <Link href="/transactions" className="text-link">Review activity →</Link>
          </div>
        </section>
        <div className="metric-grid">
          <Metric label="Income" value={formatINR(summary.incomePaise ?? 0)} />
          <Metric label="Spent" value={formatINR(summary.expensePaise ?? 0)} />
          <Metric label="Runway" value="Not enough data" muted />
        </div>
        <section className="section-heading">
          <div><p className="eyebrow">YOUR NEXT MOVES</p><h2>Build the picture</h2></div>
          <Link href="/accounts" className="text-link">View all →</Link>
        </section>
        <div className="next-moves-stack">
          <div className="next-move-card">
            <span className="next-move-num">01</span>
            <h3>Add your first account</h3>
            <p>Bank, cash, card, or wallet. Manual entry keeps your data in your hands.</p>
          </div>
          <div className="next-move-card">
            <span className="next-move-num">02</span>
            <h3>Import a statement</h3>
            <p>Bring in a CSV when you are ready. No broker connection required.</p>
          </div>
          <div className="next-move-card">
            <span className="next-move-num">03</span>
            <h3>Ask a question</h3>
            <p>Use your own numbers as a starting point, not a generic prescription.</p>
          </div>
        </div>
      </>
    );
  }

  if (domain === 'accounts') {
    const accounts = (data.accounts ?? []) as Account[];
    return (
      <>
        <AccountForm onCreated={(a) => onAccountsChange([...accounts, a])} />
        <TransferForm accounts={accounts} onTransferred={onAccountsRefetch} />
        {accounts.length ? (
          <section className="table-wrap">
            <div className="table-head">
              <div><p className="eyebrow">YOUR ACCOUNTS</p><h2>{accounts.length} account{accounts.length === 1 ? '' : 's'}</h2></div>
            </div>
            <table><tbody>
              {accounts.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong><span>{item.type.replace(/_/g, ' ')}</span></td>
                  <td className="amount">{formatINR(item.balancePaise)}</td>
                </tr>
              ))}
            </tbody></table>
          </section>
        ) : (
          <Empty icon="🏦" title="No accounts yet" detail="Add your first account above to start tracking your money." />
        )}
      </>
    );
  }

  if (domain === 'transactions') {
    const transactions = (data.transactions ?? []) as Transaction[];
    const accounts = (data.accounts ?? []) as Account[];
    return (
      <>
        <TransactionForm
          accounts={accounts}
          onCreated={(tx) => onTransactionsChange([tx, ...transactions])}
        />
        {transactions.length ? (
          <section className="table-wrap">
            <div className="table-head">
              <div><p className="eyebrow">TRANSACTION HISTORY</p><h2>{transactions.length} transaction{transactions.length === 1 ? '' : 's'}</h2></div>
            </div>
            <table><tbody>
              {transactions.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.description}</strong>
                    <span>{formatDate(item.occurredOn)}{item.category ? ` · ${item.category}` : ''}</span>
                  </td>
                  <td className={`amount ${item.kind === 'income' ? 'income' : item.kind === 'expense' ? 'expense' : ''}`}>
                    {item.kind === 'income' ? '+' : item.kind === 'expense' ? '-' : ''}{formatINR(item.amountPaise)}
                  </td>
                </tr>
              ))}
            </tbody></table>
          </section>
        ) : (
          <Empty icon="💳" title="No transactions yet" detail="Add your first transaction above. Income, expense, or transfer." />
        )}
      </>
    );
  }

  if (domain === 'budgets') {
    const budgets = (data.budgets ?? []) as Budget[];
    return (
      <>
        <BudgetForm onCreated={(b) => onBudgetsChange([b, ...budgets])} />
        {budgets.length ? (
          <section className="table-wrap">
            <div className="table-head"><div><p className="eyebrow">MONTHLY BUDGETS</p><h2>{budgets.length} budget{budgets.length === 1 ? '' : 's'}</h2></div></div>
            <table><tbody>
              {budgets.map((item) => <tr key={item.id}><td><strong>{item.category}</strong><span>{item.month}</span></td><td className="amount">{formatINR(item.limitPaise)}</td></tr>)}
            </tbody></table>
          </section>
        ) : <Empty icon="📊" title="No budgets yet" detail="Set monthly spending limits per category to keep expenses on track." />}
      </>
    );
  }

  if (domain === 'goals') {
    const goals = (data.goals ?? []) as Goal[];
    return (
      <>
        <GoalForm onCreated={(g) => onGoalsChange([g, ...goals])} />
        {goals.length ? (
          <section className="table-wrap">
            <div className="table-head"><div><p className="eyebrow">YOUR GOALS</p><h2>{goals.length} goal{goals.length === 1 ? '' : 's'}</h2></div></div>
            <table><tbody>
              {goals.map((item) => {
                const target = item.targetPaise || 1;
                const current = item.currentPaise || 0;
                const pct = Math.min(100, Math.max(0, Math.round((current / target) * 100)));
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <span>Target date: {formatDate(item.targetDate)}</span>
                      <div className="goal-progress">
                        <div className="progress-track">
                          <div className="progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="amount">
                      {formatINR(item.targetPaise)}
                      <span>{pct}% funded</span>
                    </td>
                  </tr>
                );
              })}
            </tbody></table>
          </section>
        ) : <Empty icon="🎯" title="No goals yet" detail="Set targets for savings, emergency funds, or big purchases." />}
      </>
    );
  }

  if (domain === 'loans') {
    const loans = (data.loans ?? []) as Loan[];
    return (
      <>
        <LoanForm onCreated={(l) => onLoansChange([l, ...loans])} />
        {loans.length ? (
          <section className="table-wrap">
            <div className="table-head"><div><p className="eyebrow">YOUR LOANS</p><h2>{loans.length} loan{loans.length === 1 ? '' : 's'}</h2></div></div>
            <table><tbody>
              {loans.map((item) => {
                const tenureYears = item.monthlyPaymentPaise > 0 ? (item.principalPaise / item.monthlyPaymentPaise) / 12 : 1;
                const estInterest = Math.round(item.principalPaise * (item.annualRatePercent / 100) * tenureYears);
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <span>{item.annualRatePercent}% p.a. · Monthly EMI: {formatINR(item.monthlyPaymentPaise)}</span>
                      <span>Estimated total interest: {formatINR(estInterest)} (principal × rate × tenure estimate)</span>
                    </td>
                    <td className="amount">{formatINR(item.principalPaise)}</td>
                  </tr>
                );
              })}
            </tbody></table>
          </section>
        ) : <Empty icon="📜" title="No loans yet" detail="Track your EMIs, interest rates, and payoff timelines." />}
      </>
    );
  }

  if (domain === 'bills') return <Empty icon="🧾" title="Bills coming soon" detail="Recurring bills will be detected automatically from your transactions." />;

  if (domain === 'analytics') {
    const score = data as { score?: number; factors?: Record<string, number> };
    const transactions = (data.transactions ?? []) as Transaction[];
    const scoreValue = Math.min(100, Math.max(0, score?.score ?? 0));

    // Spending breakdown: only expenses, grouped by category
    const expenseTransactions = transactions.filter((t) => t.kind === 'expense');
    const categoryTotals: Record<string, number> = {};
    let totalExpensePaise = 0;
    for (const tx of expenseTransactions) {
      const cat = tx.category?.trim() || 'Uncategorised';
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + tx.amountPaise;
      totalExpensePaise += tx.amountPaise;
    }
    const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

    return (
      <>
        <section className="score">
          <p className="eyebrow">FINANCIAL HEALTH · V1</p>
          <strong>{scoreValue}<small>/100</small></strong>
          <p>Transparent scoring based on cash flow, emergency runway, and debt.</p>
          <div className="score-bar-track">
            <div className="score-bar-fill" style={{ width: `${scoreValue}%` }} />
          </div>
        </section>
        <div className="metric-grid" style={{ marginTop: 20 }}>
          {Object.entries(score.factors ?? {}).map(([key, value]) => (
            <Metric key={key} label={key.replace(/([A-Z])/g, ' $1').trim()} value={`${Math.round(value * 100)}%`} />
          ))}
        </div>

        <section className="spending-breakdown">
          <p className="eyebrow">SPENDING BREAKDOWN</p>
          <h2>Expenses by category</h2>
          {sortedCategories.length ? (
            sortedCategories.map(([cat, catPaise]) => {
              const proportion = totalExpensePaise > 0 ? Math.min(100, Math.max(0, Math.round((catPaise / totalExpensePaise) * 100))) : 0;
              return (
                <div key={cat} className="breakdown-row">
                  <div className="breakdown-header">
                    <span className="breakdown-category">{cat}</span>
                    <span className="breakdown-amount">{formatINR(catPaise)} ({proportion}%)</span>
                  </div>
                  <div className="breakdown-bar-track">
                    <div className="breakdown-bar-fill" style={{ width: `${proportion}%` }} />
                  </div>
                </div>
              );
            })
          ) : (
            <p className="muted" style={{ fontSize: 13, margin: '12px 0 0' }}>No expense transactions recorded yet.</p>
          )}
        </section>
      </>
    );
  }

  if (domain === 'ai') return <AiPanel prompt={aiPrompt} setPrompt={setAiPrompt} messages={aiMessages} loading={aiLoading} onSubmit={askAi} />;
  if (domain === 'settings') return <Settings />;
  if (domain === 'investments' || showImport) return <ImportPanel accounts={(data.accounts ?? []) as Account[]} />;

  return <Empty icon="✨" title={domainTitles[domain] ?? domain} detail="Nothing here yet. Check back soon." />;
}

function Metric({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return <div className={`metric${muted ? ' muted' : ''}`}><p>{label}</p><strong>{value}</strong></div>;
}

function Empty({ icon = '+', title, detail }: { icon?: string; title: string; detail: string }) {
  return (
    <div className="state empty">
      <div className="empty-mark">{icon}</div>
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}

function AiPanel({ prompt, setPrompt, messages, loading, onSubmit }: {
  prompt: string; setPrompt: (v: string) => void;
  messages: Array<{ role: 'user' | 'ai'; text: string; label?: string }>;
  loading: boolean; onSubmit: (e: React.FormEvent) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  const suggestions = ['How did I spend this month?', 'What should I focus on next?', 'How much can I save each month?', 'Where am I spending the most?'];
  return (
    <section className="ai-panel">
      <p className="eyebrow">CONTEXTUAL Q&A</p>
      <h2>What would you like to understand?</h2>
      <p className="muted">Answers are labeled fact, estimate, or recommendation. Investment content is educational only — not regulated financial advice.</p>
      {messages.length === 0 && (
        <div className="prompts">
          {suggestions.map((s) => <button key={s} onClick={() => setPrompt(s)}>{s}</button>)}
        </div>
      )}
      {messages.length > 0 && (
        <div className="ai-messages">
          {messages.map((msg, i) => {
            const labelClass = msg.label === 'fact' ? 'fact' : msg.label === 'estimate' ? 'estimate' : msg.label === 'recommendation' ? 'recommendation' : msg.label === 'error' ? 'error' : '';
            return (
              <div key={i} className={msg.role === 'user' ? 'user-message' : `ai-response${msg.label === 'error' ? ' error' : ''}`}>
                {msg.role === 'ai' && msg.label && <span className={`ai-label ${labelClass}`}>{msg.label}</span>}
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6 }}>{msg.text}</p>
              </div>
            );
          })}
          {loading && <div className="ai-response"><span className="loader" style={{ width: 14, height: 14, margin: 0, display: 'inline-block' }} /></div>}
          <div ref={bottomRef} />
        </div>
      )}
      <form onSubmit={onSubmit} className="ask">
        <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask about your money..." required maxLength={2000} disabled={loading} />
        <button className="button primary" disabled={loading || !prompt.trim()}>{loading ? '...' : 'Ask →'}</button>
      </form>
    </section>
  );
}

function AccountForm({ onCreated }: { onCreated: (a: Account) => void }) {
  const [name, setName] = useState(''); const [type, setType] = useState<Account['type']>('bank');
  const [bal, setBal] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('');
    try {
      const rupees = Number(bal);
      const balancePaise = bal.trim() && Number.isFinite(rupees) ? Math.round(rupees * 100) : undefined;
      const account = await api<Account>('/v1/accounts', { method: 'POST', body: JSON.stringify({ name, type, ...(balancePaise !== undefined ? { balancePaise } : {}) }) });
      onCreated(account); setName(''); setBal(''); setType('bank');
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not add account.'); }
    finally { setBusy(false); }
  }
  return (
    <form className="account-form" onSubmit={submit}>
      <p className="eyebrow">ADD AN ACCOUNT</p>
      <div className="account-form-fields">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="HDFC Savings" required maxLength={200} disabled={busy} /></label>
        <label>Type<select value={type} onChange={(e) => setType(e.target.value as Account['type'])} disabled={busy}>
          <option value="bank">Bank</option><option value="cash">Cash</option><option value="credit_card">Credit card</option>
          <option value="upi_wallet">UPI wallet</option><option value="fd">Fixed deposit</option><option value="loan">Loan</option><option value="custom">Custom</option>
        </select></label>
        <label>Opening balance (₹)<input value={bal} onChange={(e) => setBal(e.target.value)} placeholder="0" inputMode="decimal" disabled={busy} /></label>
        <button className="button primary" type="submit" disabled={!name.trim() || busy}>{busy ? 'Adding...' : 'Add account →'}</button>
      </div>
      {msg && <p className="status-message error" role="alert">{msg}</p>}
    </form>
  );
}

function TransferForm({ accounts, onTransferred }: { accounts: Account[]; onTransferred: (accs: Account[]) => void }) {
  const todayStr = new Date().toISOString().split('T')[0] ?? '';
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayStr);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (accounts.length >= 2) {
      if (!fromAccountId) setFromAccountId(accounts[0]?.id ?? '');
      if (!toAccountId) setToAccountId(accounts[1]?.id ?? '');
    } else if (accounts.length === 1) {
      if (!fromAccountId) setFromAccountId(accounts[0]?.id ?? '');
    }
  }, [accounts, fromAccountId, toAccountId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(''); setSuccessMsg('');
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) { setMsg('Amount must be a positive number.'); return; }
    if (!fromAccountId || !toAccountId) { setMsg('Select both source and destination accounts.'); return; }
    if (fromAccountId === toAccountId) { setMsg('From and To accounts must be different.'); return; }

    setBusy(true);
    try {
      await api('/v1/transfers', {
        method: 'POST',
        body: JSON.stringify({
          fromAccountId,
          toAccountId,
          amountPaise: Math.round(rupees * 100),
          description: description.trim() || 'Account transfer',
          occurredOn,
        }),
      });
      setSuccessMsg('Transfer completed successfully.');
      setAmount('');
      setDescription('');
      // Refetch accounts to reflect updated balances
      const res = await api<{ accounts: Account[] }>('/v1/accounts');
      onTransferred(res.accounts);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not complete transfer.');
    } finally {
      setBusy(false);
    }
  }

  if (accounts.length < 2) return null;

  return (
    <form className="account-form" onSubmit={submit}>
      <p className="eyebrow">TRANSFER BETWEEN ACCOUNTS</p>
      <div className="transfer-form-fields">
        <label>From
          <select value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} required disabled={busy}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label>To
          <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required disabled={busy}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label>Amount (₹)
          <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" required disabled={busy} />
        </label>
        <label>Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Savings transfer" disabled={busy} maxLength={500} />
        </label>
        <label>Date
          <input type="date" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} required disabled={busy} />
        </label>
        <button className="button secondary" type="submit" disabled={!amount || fromAccountId === toAccountId || busy}>
          {busy ? 'Transferring...' : 'Transfer →'}
        </button>
      </div>
      {msg && <p className="status-message error" role="alert">{msg}</p>}
      {successMsg && <p className="status-message success" role="status">{successMsg}</p>}
    </form>
  );
}

function TransactionForm({ accounts, onCreated }: { accounts: Account[]; onCreated: (t: Transaction) => void }) {
  const todayStr = new Date().toISOString().split('T')[0] ?? '';
  const [amount, setAmount] = useState(''); const [desc, setDesc] = useState('');
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [date, setDate] = useState(todayStr);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');

  useEffect(() => { if (!accountId && accounts[0]?.id) setAccountId(accounts[0].id); }, [accounts, accountId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) { setMsg('Amount must be a positive number.'); return; }
    if (!accountId) { setMsg('Please add an account first.'); return; }
    setBusy(true);
    try {
      const tx = await api<Transaction>('/v1/transactions', {
        method: 'POST',
        body: JSON.stringify({ accountId, amountPaise: Math.round(rupees * 100), kind, description: desc, occurredOn: date }),
      });
      onCreated(tx); setAmount(''); setDesc('');
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not add transaction.'); }
    finally { setBusy(false); }
  }

  return (
    <form className="account-form" onSubmit={submit}>
      <p className="eyebrow">ADD A TRANSACTION</p>
      <div className="transaction-form-fields">
        <label>Amount (₹)<input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" required disabled={busy} /></label>
        <label>Description<input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Groceries / Salary" required maxLength={500} disabled={busy} /></label>
        <label>Kind<select value={kind} onChange={(e) => setKind(e.target.value as 'income' | 'expense')} disabled={busy}>
          <option value="expense">Expense</option><option value="income">Income</option>
        </select></label>
        <label>Account<select value={accountId} onChange={(e) => setAccountId(e.target.value)} required disabled={!accounts.length || busy}>
          {!accounts.length ? <option value="">No accounts yet</option> : accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>
        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required disabled={busy} /></label>
        <button className="button primary" type="submit" disabled={!amount || !desc || !accountId || busy}>{busy ? 'Adding...' : 'Add →'}</button>
      </div>
      {!accounts.length && <p className="status-message error" style={{ marginTop: 10 }}>No accounts yet. <Link className="text-link" href="/accounts">Add one first →</Link></p>}
      {msg && <p className="status-message error" role="alert">{msg}</p>}
    </form>
  );
}

function BudgetForm({ onCreated }: { onCreated: (b: Budget) => void }) {
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(currentMonthStr);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const rupees = Number(amount);
    if (!category.trim()) { setMsg('Category is required.'); return; }
    if (!Number.isFinite(rupees) || rupees <= 0) { setMsg('Monthly limit must be a positive number.'); return; }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) { setMsg('Month must use YYYY-MM format.'); return; }

    setBusy(true);
    try {
      const budget = await api<Budget>('/v1/budgets', {
        method: 'POST',
        body: JSON.stringify({ category: category.trim(), limitPaise: Math.round(rupees * 100), month }),
      });
      onCreated(budget);
      setCategory('');
      setAmount('');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not create budget.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="account-form" onSubmit={submit}>
      <p className="eyebrow">CREATE A MONTHLY BUDGET</p>
      <div className="budget-form-fields">
        <label>Category
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Food / Dining / Transport" required disabled={busy} maxLength={100} />
        </label>
        <label>Monthly limit (₹)
          <input type="number" step="1" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="15000" required disabled={busy} />
        </label>
        <label>Month (YYYY-MM)
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required disabled={busy} />
        </label>
        <button className="button primary" type="submit" disabled={!category.trim() || !amount || busy}>
          {busy ? 'Creating...' : 'Create budget →'}
        </button>
      </div>
      {msg && <p className="status-message error" role="alert">{msg}</p>}
    </form>
  );
}

function GoalForm({ onCreated }: { onCreated: (g: Goal) => void }) {
  const nextYearStr = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0] ?? '';
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [targetDate, setTargetDate] = useState(nextYearStr);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const rupees = Number(amount);
    if (!name.trim()) { setMsg('Goal name is required.'); return; }
    if (!Number.isFinite(rupees) || rupees <= 0) { setMsg('Target amount must be a positive number.'); return; }
    if (!targetDate) { setMsg('Target date is required.'); return; }

    setBusy(true);
    try {
      const goal = await api<Goal>('/v1/goals', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), targetPaise: Math.round(rupees * 100), targetDate }),
      });
      onCreated(goal);
      setName('');
      setAmount('');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not create goal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="account-form" onSubmit={submit}>
      <p className="eyebrow">SET A FINANCIAL GOAL</p>
      <div className="goal-form-fields">
        <label>Goal name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="MacBook / Emergency Fund" required disabled={busy} maxLength={200} />
        </label>
        <label>Target amount (₹)
          <input type="number" step="1" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150000" required disabled={busy} />
        </label>
        <label>Target date
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required disabled={busy} />
        </label>
        <button className="button primary" type="submit" disabled={!name.trim() || !amount || busy}>
          {busy ? 'Setting...' : 'Set goal →'}
        </button>
      </div>
      {msg && <p className="status-message error" role="alert">{msg}</p>}
    </form>
  );
}

function LoanForm({ onCreated }: { onCreated: (l: Loan) => void }) {
  const [name, setName] = useState('');
  const [principal, setPrincipal] = useState('');
  const [annualRate, setAnnualRate] = useState('10.5');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const principalRupees = Number(principal);
    const rate = Number(annualRate);
    const emiRupees = Number(monthlyPayment);

    if (!name.trim()) { setMsg('Loan name is required.'); return; }
    if (!Number.isFinite(principalRupees) || principalRupees <= 0) { setMsg('Principal must be a positive number.'); return; }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) { setMsg('Annual rate must be between 0 and 100.'); return; }
    if (!Number.isFinite(emiRupees) || emiRupees <= 0) { setMsg('Monthly EMI must be a positive number.'); return; }

    setBusy(true);
    try {
      const loan = await api<Loan>('/v1/loans', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          principalPaise: Math.round(principalRupees * 100),
          annualRatePercent: rate,
          monthlyPaymentPaise: Math.round(emiRupees * 100),
        }),
      });
      onCreated(loan);
      setName('');
      setPrincipal('');
      setMonthlyPayment('');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not add loan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="account-form" onSubmit={submit}>
      <p className="eyebrow">TRACK A LOAN / EMI</p>
      <div className="loan-form-fields">
        <label>Loan name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="HDFC Personal Loan / Home Loan" required disabled={busy} maxLength={200} />
        </label>
        <label>Principal (₹)
          <input type="number" step="1" min="1" value={principal} onChange={(e) => setPrincipal(e.target.value)} placeholder="500000" required disabled={busy} />
        </label>
        <label>Interest rate (% p.a.)
          <input type="number" step="0.1" min="0" max="100" value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} placeholder="10.5" required disabled={busy} />
        </label>
        <label>Monthly EMI (₹)
          <input type="number" step="1" min="1" value={monthlyPayment} onChange={(e) => setMonthlyPayment(e.target.value)} placeholder="15000" required disabled={busy} />
        </label>
        <button className="button primary" type="submit" disabled={!name.trim() || !principal || !monthlyPayment || busy}>
          {busy ? 'Adding...' : 'Add loan →'}
        </button>
      </div>
      {msg && <p className="status-message error" role="alert">{msg}</p>}
    </form>
  );
}

function QuickAddModal({ accounts, onClose, onCreated }: { accounts: Account[]; onClose: () => void; onCreated: (tx: Transaction) => void }) {
  const todayStr = new Date().toISOString().split('T')[0] ?? '';
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<'income' | 'expense'>('expense');
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0]?.id ?? '');
    }
  }, [accounts, accountId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) { setMsg('Enter a valid positive amount.'); return; }
    if (!accountId) { setMsg('Add an account first before creating transactions.'); return; }

    setBusy(true);
    try {
      const tx = await api<Transaction>('/v1/transactions', {
        method: 'POST',
        body: JSON.stringify({
          accountId,
          amountPaise: Math.round(rupees * 100),
          kind,
          description: description.trim() || (kind === 'income' ? 'Income' : 'Expense'),
          occurredOn: todayStr,
        }),
      });
      onCreated(tx);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not create transaction.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <p className="eyebrow">QUICK ENTRY</p>
        <h2>Add a transaction</h2>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={`button ${kind === 'expense' ? 'primary' : 'secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setKind('expense')}
              >
                Expense
              </button>
              <button
                type="button"
                className={`button ${kind === 'income' ? 'primary' : 'secondary'}`}
                style={{ flex: 1 }}
                onClick={() => setKind('income')}
              >
                Income
              </button>
            </div>

            <label>Amount (₹)
              <input
                type="number"
                step="0.01"
                min="0.01"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="500"
                required
                disabled={busy}
              />
            </label>

            <label>Description
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Coffee / Groceries / Cab"
                required
                maxLength={500}
                disabled={busy}
              />
            </label>

            <label>Account
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required disabled={!accounts.length || busy}>
                {!accounts.length ? (
                  <option value="">No accounts available</option>
                ) : (
                  accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)
                )}
              </select>
            </label>
          </div>

          {msg && <p className="status-message error" style={{ marginTop: 12 }} role="alert">{msg}</p>}

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="button primary" disabled={!amount || !description.trim() || !accountId || busy}>
              {busy ? 'Adding...' : 'Add transaction →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Settings() {
  const [status, setStatus] = useState<'idle' | 'working' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function exportData() {
    setStatus('working'); setMessage('Preparing...');
    try { const result = await api<unknown>('/v1/privacy/export'); const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'paisapilot-export.json'; link.click(); URL.revokeObjectURL(link.href); setStatus('success'); setMessage('Export downloaded.'); }
    catch (err) { setStatus('error'); setMessage(err instanceof Error ? err.message : 'Could not export.'); }
  }
  async function deleteData() {
    if (!window.confirm('Permanently delete your account and all data?')) return;
    setStatus('working'); setMessage('Deleting...');
    try { await api('/v1/privacy/delete', { method: 'DELETE' }); setStatus('success'); setMessage('Account deleted.'); window.setTimeout(() => window.location.assign('/'), 800); }
    catch (err) { setStatus('error'); setMessage(err instanceof Error ? err.message : 'Could not delete.'); }
  }
  return (
    <section className="settings">
      <div className="setting-row">
        <div><h2>Data and privacy</h2><p>Export everything or permanently delete your account and data.</p></div>
        <div className="setting-actions">
          <button className="button secondary" disabled={status === 'working'} onClick={() => void exportData()}>Export JSON</button>
          <button className="button danger" disabled={status === 'working'} onClick={() => void deleteData()}>Delete account</button>
        </div>
      </div>
      {message && <p className={`status-message ${status === 'error' ? 'error' : 'success'}`} role={status === 'error' ? 'alert' : 'status'} aria-live="polite">{message}</p>}
      <div className="setting-row"><div><h2>Product boundaries</h2><p>No live broker connections, advertising, or billing in V1.</p></div><span className="tag">V1 FREE</span></div>
      <div className="setting-row"><div><h2>Legal</h2><p>Read how PaisaPilot handles your data.</p></div><Link className="text-link" href="/privacy-policy">Privacy policy →</Link></div>
    </section>
  );
}

function ImportPanel({ accounts }: { accounts: Account[] }) {
  const [csv, setCsv] = useState(''); const [accountId, setAccountId] = useState('');
  const [status, setStatus] = useState<'idle' | 'reading' | 'ready' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  async function chooseFile(selected: File | undefined) {
    if (!selected) return;
    if (selected.size > 2_000_000) { setCsv(''); setStatus('error'); setMessage('CSV is too large (max 2 MB).'); return; }
    setStatus('reading'); setMessage('');
    try { const contents = await selected.text(); const result = validateImportCsv(contents); setCsv(contents); setStatus('ready'); setMessage(`${result.rows} transaction${result.rows === 1 ? '' : 's'} ready.`); }
    catch (err) { setCsv(''); setStatus('error'); setMessage(err instanceof Error ? err.message : 'Could not read CSV.'); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!csv || !accountId) return;
    setStatus('submitting'); setMessage('Importing...');
    try { const result = await api<{ imported: number }>('/v1/import/transactions', { method: 'POST', body: JSON.stringify({ accountId, csv }) }); setStatus('success'); setMessage(`${result.imported} transaction${result.imported === 1 ? '' : 's'} imported.`); }
    catch (err) { setStatus('error'); setMessage(err instanceof Error ? err.message : 'Import failed.'); }
  }
  return (
    <section className="import-panel">
      <p className="eyebrow">IMPORT STATEMENT</p>
      <h2>Bring a statement into focus.</h2>
      <p className="muted">Import transaction CSVs into any account. Live broker connections are not part of V1.</p>
      <form onSubmit={submit}>
        <label className="account-select">Import into<select value={accountId} onChange={(e) => setAccountId(e.target.value)} required disabled={!accounts.length || status === 'submitting'}><option value="">Choose an account</option>{accounts.map((a) => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
        <label className="file-drop">Choose a CSV<input type="file" accept=".csv,text/csv" onChange={(e) => void chooseFile(e.target.files?.[0])} disabled={status === 'submitting'} /></label>
        <p className="fine-print">Required columns: date, description, amount, type. Max 2 MB. Duplicates are skipped automatically.</p>
        {!accounts.length && <p className="status-message error" role="alert">Add an account first. <Link className="text-link" href="/accounts">Add one →</Link></p>}
        {message && <p className={`status-message ${status === 'error' ? 'error' : 'success'}`} role={status === 'error' ? 'alert' : 'status'} aria-live="polite">{message}</p>}
        <button className="button primary" type="submit" disabled={!csv || !accountId || status === 'reading' || status === 'submitting'}>{status === 'submitting' ? 'Importing...' : 'Import transactions →'}</button>
      </form>
    </section>
  );
}

