import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api, authenticate, clearToken, deleteAccount, validateSession } from './src/api';

type User = { id: string; email: string };
type Tx = { id: string; description: string; amountPaise: number; kind: 'income' | 'expense'; category?: string; occurredOn: string };
type AccountItem = { id: string; name: string; type: string; balancePaise: number };
type GoalItem = { id: string; name: string; targetPaise: number; currentPaise: number; targetDate: string };
type BudgetItem = { id: string; category: string; limitPaise: number; month: string };

type Screen = 'home' | 'transactions' | 'accounts' | 'plan' | 'more';

type MoreView = 'main' | 'settings' | 'summary';

const C = {
  ink: '#0f1a16',
  inkSoft: '#4a5c54',
  inkFaint: '#8a9e94',
  paper: '#f5f2ea',
  white: '#faf9f5',
  surface: '#eceae0',
  line: '#dddbd0',
  gold: '#b8952a',
  goldLight: '#f5edcf',
  green: '#1a4a35',
  greenLight: '#d8ece1',
  terra: '#b85c3a',
  terraLight: '#f5ddd4',
  blue: '#2a4a7a',
  blueLight: '#d8e4f5',
};

const S = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

const card = {
  backgroundColor: C.white,
  borderRadius: 10,
  padding: S.md,
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 6,
  elevation: 2,
  marginBottom: S.md,
};

function formatMoney(value: number): string {
  return `₹${(value / 100).toLocaleString('en-IN')}`;
}

function getGreeting(email: string): string {
  const h = new Date().getHours();
  const time = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night';
  const raw = email.split('@')[0] ?? '';
  const first = (raw.split(/[._-]/)[0] ?? raw);
  const name = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return `Good ${time}, ${name}.`;
}

function formatDateStamp(dateString: string): string {
  if (!dateString) return 'Today';
  const dt = new Date(dateString);
  if (Number.isNaN(dt.getTime())) return 'Today';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function normalizeTransactions(data: unknown): Tx[] {
  const source = Array.isArray(data) ? data : Array.isArray((data as any)?.transactions) ? (data as any).transactions : [];
  return source.map((item: any, index: number) => ({
    id: String(item?.id ?? index),
    description: String(item?.description ?? 'Transaction'),
    amountPaise: Number(item?.amountPaise ?? item?.amount ?? 0),
    kind: item?.kind === 'income' ? 'income' : 'expense',
    category: item?.category ?? 'General',
    occurredOn: String(item?.occurredOn ?? new Date().toISOString()),
  }));
}

function normalizeAccounts(data: unknown): AccountItem[] {
  const source = Array.isArray(data) ? data : Array.isArray((data as any)?.accounts) ? (data as any).accounts : [];
  return source.map((item: any, index: number) => ({
    id: String(item?.id ?? index),
    name: String(item?.name ?? 'Account'),
    type: String(item?.type ?? 'bank'),
    balancePaise: Number(item?.balancePaise ?? item?.balance ?? 0),
  }));
}

function Splash() {
  const scheme = useColorScheme();
  return (
    <View style={[styles.splash, { backgroundColor: scheme === 'light' ? C.ink : C.ink }]}>
      <View style={styles.logoCircleSplash}><Text style={styles.logoCircleTextSplash}>PP</Text></View>
      <Text style={styles.splashTitle}>PaisaPilot</Text>
      <Text style={styles.splashSubtitle}>Your money, clearly.</Text>
      <ActivityIndicator color={C.gold} style={{ marginTop: 28 }} />
    </View>
  );
}

function OnboardingFlow({ onAuth }: { onAuth: (user: User) => void }) {
  const [step, setStep] = useState(0);
  const [showAuth, setShowAuth] = useState(false);

  const steps = [
    { icon: '💰', title: 'Know where your money goes', subtitle: 'Track income and expenses in seconds. No bank logins. No SMS reading. Just you and your numbers.' },
    { icon: '🎯', title: 'Plan with purpose', subtitle: 'Set goals, create budgets, and track loans. See your financial health score update in real time.' },
    { icon: '✨', title: 'Ask your finances anything', subtitle: 'PaisaPilot AI answers questions about your actual data. Labeled as fact, estimate, or recommendation.' },
  ];

  const done = async () => {
    await SecureStore.setItemAsync('pp_onboarded', '1');
    setShowAuth(true);
  };

  const skip = async () => {
    await SecureStore.setItemAsync('pp_onboarded', '1');
    setShowAuth(true);
  };

  if (showAuth) return <AuthScreen onAuth={onAuth} />;

  const current = steps[step];
  return (
    <View style={styles.introShell}>
      <Text style={styles.introSkip} onPress={skip}>Skip</Text>
      <View style={styles.introBadge}><Text style={styles.introIcon}>{current.icon}</Text></View>
      <Text style={styles.introHeadline}>{current.title}</Text>
      <Text style={styles.introSubtitle}>{current.subtitle}</Text>
      <View style={styles.dotsRow}>
        {steps.map((_, index) => (
          <View key={index} style={[styles.dot, index === step ? styles.dotActive : styles.dotInactive]} />
        ))}
      </View>
      <Pressable style={styles.introButton} onPress={() => {
        if (step === 2) {
          void done();
          return;
        }
        setStep((s) => s + 1);
      }}>
        <Text style={styles.introButtonText}>{step === 2 ? 'Get started →' : 'Next →'}</Text>
      </Pressable>
    </View>
  );
}

function AuthScreen({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [focusField, setFocusField] = useState<'email' | 'password' | null>(null);

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Email address is required.');
      return;
    }
    if (mode === 'register' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    if (mode === 'register' && password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await authenticate(trimmed, password, mode);
      onAuth(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.authPage}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.authLogoRow}>
            <View style={styles.logoCircleSmall}><Text style={styles.logoCircleTextSmall}>PP</Text></View>
            <Text style={styles.authBrand}>PaisaPilot</Text>
          </View>

          <Text style={styles.authTitle}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</Text>
          <Text style={styles.authSubtitle}>{mode === 'login' ? 'Sign in to your workspace' : 'Your private money workspace. Free forever.'}</Text>

          <Text style={styles.fieldLabel}>EMAIL ADDRESS</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onFocus={() => setFocusField('email')}
            onBlur={() => setFocusField(null)}
            placeholder="name@example.com"
            placeholderTextColor={C.inkFaint}
            style={[styles.authInput, focusField === 'email' ? { borderColor: C.ink } : null]}
          />

          <Text style={styles.fieldLabel}>{mode === 'login' ? 'PASSWORD' : 'PASSWORD (MIN 12 CHARACTERS)'}</Text>
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocusField('password')}
            onBlur={() => setFocusField(null)}
            placeholder="••••••••••••"
            placeholderTextColor={C.inkFaint}
            style={[styles.authInput, focusField === 'password' ? { borderColor: C.ink } : null]}
          />

          {error ? <Text style={styles.authError}>{error}</Text> : null}

          <Pressable style={styles.primaryButtonLarge} onPress={submit} disabled={busy}>
            <Text style={styles.primaryButtonText}>{busy ? 'Working...' : mode === 'login' ? 'Sign in →' : 'Create account →'}</Text>
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable onPress={() => setMode((m) => (m === 'login' ? 'register' : 'login'))}>
            <Text style={styles.toggleText}>
              {mode === 'login' ? 'New to PaisaPilot? ' : 'Already have an account? '}
              <Text style={{ color: C.ink, fontWeight: '700' }}>
                {mode === 'login' ? 'Create a free account' : 'Sign in'}
              </Text>
            </Text>
          </Pressable>

          <Text style={styles.privacyLink} onPress={() => Linking.openURL('https://paisapilot.app/privacy-policy')}>Privacy policy</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HomeScreen({ user, onQuickAdd, onViewTransactions, refreshKey }: { user: User; onQuickAdd: () => void; onViewTransactions: () => void; refreshKey: number; }) {
  const [summary, setSummary] = useState({ incomePaise: 0, expensePaise: 0, netPaise: 0 });
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [txRes, sumRes] = await Promise.all([api<unknown>('/v1/transactions'), api<unknown>('/v1/summary')]);
        if (!active) return;
        const tit = normalizeTransactions(txRes).slice(0, 5);
        setTransactions(tit);
        setSummary({
          incomePaise: Number((sumRes as any)?.incomePaise ?? 0),
          expensePaise: Number((sumRes as any)?.expensePaise ?? 0),
          netPaise: Number((sumRes as any)?.netPaise ?? 0),
        });
      } catch {
        setTransactions([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [refreshKey]);

  const score = 82;
  const deltaPositive = summary.netPaise >= 0;

  return (
    <View style={styles.homeRoot}>
      <ScrollView contentContainerStyle={styles.homeScroll}>
        <Text style={styles.eyebrow}>{new Date().toLocaleString('en-US', { month: 'long' }).toUpperCase()}</Text>

        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>MONTHLY NET FLOW</Text>
          <Text style={styles.heroValue}>{formatMoney(summary.netPaise)}</Text>
          <View style={[styles.deltaPill, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
            <Text style={[styles.deltaText, { color: deltaPositive ? '#a8d4b8' : '#f5ddd4' }]}>{deltaPositive ? '↑ after income and expenses' : '↓ spending exceeds income'}</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <View style={[styles.metricCard, { marginRight: S.sm }]}>
            <Text style={styles.metricLabel}>Income</Text>
            <Text style={[styles.metricValueText, { color: C.green }]}>{formatMoney(summary.incomePaise)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Spent</Text>
            <Text style={[styles.metricValueText, { color: C.terra }]}>{formatMoney(summary.expensePaise)}</Text>
          </View>
        </View>

        <Pressable style={styles.primaryButtonLarge} onPress={onQuickAdd}>
          <Text style={styles.primaryButtonText}>＋ Quick add</Text>
        </Pressable>

        <View style={{ marginTop: S.lg }}>
          <View style={styles.recentHeader}>
            <Text style={styles.eyebrow}>RECENT</Text>
            <Pressable onPress={onViewTransactions}><Text style={styles.recentLink}>See all →</Text></Pressable>
          </View>

          {loading ? <ActivityIndicator color={C.gold} /> : transactions.length === 0 ? <Text style={styles.emptyStateText}>No transactions yet — tap + to add your first</Text> : transactions.map((tx) => (
            <View key={tx.id} style={styles.transactionRow}>
              <View style={[styles.transactionBadge, { backgroundColor: tx.kind === 'income' ? C.greenLight : C.terraLight }]}>
                <Text style={[styles.transactionBadgeText, { color: tx.kind === 'income' ? C.green : C.terra }]}>{tx.kind === 'income' ? '+' : '-'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.transactionText}>{tx.description}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={styles.transactionMeta}>{formatDateStamp(tx.occurredOn)}</Text>
                  <Text style={[styles.badge, { marginLeft: 8 }]}>{tx.category ?? 'General'}</Text>
                </View>
              </View>
              <Text style={[styles.amountText, { color: tx.kind === 'income' ? C.green : C.terra }]}>{tx.kind === 'income' ? '+' : '-'}{formatMoney(Math.abs(tx.amountPaise))}</Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: S.lg }}>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>FINANCIAL HEALTH SCORE</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <Text style={styles.scoreNumber}>{score}</Text>
              <Text style={{ color: C.inkFaint, fontSize: 18, marginLeft: 4, marginBottom: 12 }}>/100</Text>
            </View>
            <View style={styles.progressOuter}><View style={[styles.scoreBar, { width: `${score}%` }]} /></View>
          </View>
        </View>
      </ScrollView>

      <Pressable style={styles.floatingAdd} onPress={onQuickAdd}><Text style={styles.floatingAddText}>+</Text></Pressable>
    </View>
  );
}

function TransactionsScreen({ onQuickAdd, refreshKey }: { onQuickAdd: () => void; refreshKey: number }) {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const result = await api<unknown>('/v1/transactions');
        if (!active) return;
        setTransactions(normalizeTransactions(result).sort((a, b) => new Date(b.occurredOn).getTime() - new Date(a.occurredOn).getTime()));
      } catch {
        setTransactions([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [refreshKey]);

  return (
    <View style={styles.screenRoot}>
      <View style={styles.topBar}>
        <Text style={styles.headerText}>Transactions</Text>
        <Text style={styles.headerAccent}>P</Text>
      </View>

      {loading ? <ActivityIndicator color={C.gold} style={{ marginTop: 32 }} /> : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: S.lg, paddingBottom: 90 }}
          renderItem={({ item }) => (
            <View style={styles.transactionRow}>
              <View style={[styles.transactionBadge, { backgroundColor: item.kind === 'income' ? C.greenLight : C.terraLight }]}>
                <Text style={[styles.transactionBadgeText, { color: item.kind === 'income' ? C.green : C.terra }]}>{item.kind === 'income' ? '+' : '-'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.transactionText}>{item.description}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text style={styles.transactionMeta}>{formatDateStamp(item.occurredOn)}</Text>
                  <Text style={[styles.badge, { marginLeft: 8 }]}>{item.category ?? 'General'}</Text>
                </View>
              </View>
              <Text style={[styles.amountText, { color: item.kind === 'income' ? C.green : C.terra }]}>{item.kind === 'income' ? '+' : '-'}{formatMoney(Math.abs(item.amountPaise))}</Text>
            </View>
          )}
        />
      )}

      <Pressable style={styles.floatingAdd} onPress={onQuickAdd}><Text style={styles.floatingAddText}>+</Text></Pressable>
    </View>
  );
}

function AccountsScreen() {
  const [items, setItems] = useState<AccountItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('');
  const [balance, setBalance] = useState('');
  const [type, setType] = useState('Bank');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadAccounts() {
    const result = await api<unknown>('/v1/accounts');
    setItems(normalizeAccounts(result));
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  const submit = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/v1/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), type: type.toLowerCase(), balancePaise: Math.round(Number(balance || 0) * 100) }),
      });
      setName('');
      setBalance('');
      setType('Bank');
      setExpanded(false);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screenRoot}>
      <View style={styles.topBar}>
        <Text style={styles.headerText}>Accounts</Text>
        <Text style={styles.headerAccent}>A</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 90 }}>
        <Pressable style={styles.cardAction} onPress={() => setExpanded((v) => !v)}>
          <Text style={styles.cardActionText}>{expanded ? '▲ Cancel' : '＋ Add account'}</Text>
        </Pressable>

        {expanded && (
          <View style={styles.innerForm}>
            <TextInput value={name} onChangeText={setName} placeholder="Account name" style={styles.inputField} />
            <TextInput value={balance} onChangeText={setBalance} placeholder="Opening balance" keyboardType="decimal-pad" style={styles.inputField} />
            <Text style={styles.fieldLabel}>TYPE</Text>
            <View style={styles.chipRow}>
              {['Bank', 'Cash', 'Credit card', 'UPI wallet'].map((item) => (
                <Pressable key={item} onPress={() => setType(item)} style={[styles.chip, type === item ? styles.chipActive : null]}>
                  <Text style={[styles.chipText, type === item ? styles.chipTextActive : null]}>{item}</Text>
                </Pressable>
              ))}
            </View>
            {error ? <Text style={styles.authError}>{error}</Text> : null}
            <Pressable style={styles.primaryButtonLarge} onPress={submit} disabled={busy}>
              <Text style={styles.primaryButtonText}>{busy ? 'Saving...' : 'Add account →'}</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.eyebrow}>YOUR ACCOUNTS</Text>
        {items.length === 0 ? <Text style={styles.emptyStateText}>No accounts yet. Add your first account above.</Text> : items.map((item) => (
          <View key={item.id} style={styles.cardAction}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={styles.bigListText}>{item.name}</Text>
                <Text style={styles.rowValue}>{item.type}</Text>
              </View>
              <Text style={[styles.amountText, { color: C.ink }]}>{formatMoney(item.balancePaise)}</Text>
            </View>
            <View style={styles.smallBadge}><Text style={styles.smallBadgeText}>{item.type}</Text></View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function PlanScreen() {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [goalOpen, setGoalOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDate, setGoalDate] = useState('');
  const [budgetCategory, setBudgetCategory] = useState('');
  const [budgetLimit, setBudgetLimit] = useState('');
  const [budgetMonth, setBudgetMonth] = useState(new Date().toISOString().slice(0, 7));
  const [goalError, setGoalError] = useState('');
  const [budgetError, setBudgetError] = useState('');
  const [budgetMessage, setBudgetMessage] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [gRes, bRes] = await Promise.all([api<{ goals: GoalItem[] }>('/v1/goals'), api<{ budgets: BudgetItem[] }>('/v1/budgets')]);
      setGoals(gRes.goals ?? []);
      setBudgets(bRes.budgets ?? []);
    } catch {
      setGoals([]);
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const addGoal = async () => {
    setGoalError('');
    if (!goalName.trim()) {
      setGoalError('Goal name is required.');
      return;
    }
    const target = Number(goalTarget);
    if (!Number.isFinite(target) || target <= 0) {
      setGoalError('Enter a valid positive amount.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(goalDate)) {
      setGoalError('Date must be YYYY-MM-DD.');
      return;
    }
    try {
      const result = await api<GoalItem>('/v1/goals', {
        method: 'POST',
        body: JSON.stringify({ name: goalName.trim(), targetPaise: Math.round(target * 100), targetDate: goalDate }),
      });
      setGoals((prev) => [result, ...prev]);
      setGoalName('');
      setGoalTarget('');
      setGoalDate('');
      setGoalOpen(false);
    } catch (err) {
      setGoalError(err instanceof Error ? err.message : 'Could not create goal.');
    }
  };

  const addBudget = async () => {
    setBudgetError('');
    setBudgetMessage('');
    if (!budgetCategory.trim()) {
      setBudgetError('Category is required.');
      return;
    }
    const limit = Number(budgetLimit);
    if (!Number.isFinite(limit) || limit <= 0) {
      setBudgetError('Enter a valid positive limit.');
      return;
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(budgetMonth)) {
      setBudgetError('Month must be YYYY-MM.');
      return;
    }
    try {
      await api('/v1/budgets', {
        method: 'POST',
        body: JSON.stringify({ category: budgetCategory.trim(), limitPaise: Math.round(limit * 100), month: budgetMonth }),
      });
      setBudgetMessage(`Budget set ✓ for ${budgetCategory.trim()}`);
      const result = await api<{ budgets: BudgetItem[] }>('/v1/budgets');
      setBudgets(result.budgets ?? []);
      setBudgetCategory('');
      setBudgetLimit('');
      setBudgetOpen(false);
    } catch (err) {
      setBudgetError(err instanceof Error ? err.message : 'Could not create budget.');
    }
  };

  if (loading) return <ActivityIndicator color={C.gold} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 90 }} style={{ backgroundColor: C.paper }}>
      <Text style={styles.eyebrow}>GOALS</Text>
      {goals.length === 0 ? <Text style={styles.emptyStateText}>No goals yet. Set a savings target with a realistic timeline.</Text> : goals.map((g) => {
        const percent = g.targetPaise > 0 ? Math.min(g.currentPaise / g.targetPaise, 1) : 0;
        return (
          <View key={g.id} style={[card, { marginBottom: S.md }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.bigListText}>{g.name}</Text>
              <Text style={styles.rowValue}>{Math.round(percent * 100)}%</Text>
            </View>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(percent * 100)}%` }]} /></View>
            <Text style={styles.rowValue}>{formatMoney(g.currentPaise)} of {formatMoney(g.targetPaise)} · by {g.targetDate}</Text>
          </View>
        );
      })}

      <Pressable style={styles.cardAction} onPress={() => setGoalOpen((v) => !v)}>
        <Text style={styles.cardActionText}>{goalOpen ? '▲ Cancel' : '＋ Add goal'}</Text>
      </Pressable>
      {goalOpen && (
        <View style={styles.innerForm}>
          <TextInput value={goalName} onChangeText={setGoalName} placeholder="Goal name" style={styles.inputField} />
          <TextInput value={goalTarget} onChangeText={setGoalTarget} placeholder="Target amount (₹)" keyboardType="decimal-pad" style={styles.inputField} />
          <TextInput value={goalDate} onChangeText={setGoalDate} placeholder="Target date (YYYY-MM-DD)" style={styles.inputField} />
          {goalError ? <Text style={styles.authError}>{goalError}</Text> : null}
          <Pressable style={styles.primaryButtonLarge} onPress={addGoal}><Text style={styles.primaryButtonText}>Set goal →</Text></Pressable>
        </View>
      )}

      <Text style={[styles.eyebrow, { marginTop: S.lg }]}>MONTHLY BUDGETS</Text>
      {budgets.length === 0 ? <Text style={styles.emptyStateText}>No budgets set yet. Set monthly spend limits by category.</Text> : budgets.map((budget) => (
        <View key={budget.id} style={[card, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <View>
            <Text style={styles.bigListText}>{budget.category}</Text>
            <Text style={styles.rowValue}>{budget.month}</Text>
          </View>
          <Text style={styles.amountText}>{formatMoney(budget.limitPaise)}</Text>
        </View>
      ))}

      <Pressable style={[styles.cardAction, { marginTop: S.md }]} onPress={() => setBudgetOpen((v) => !v)}>
        <Text style={styles.cardActionText}>{budgetOpen ? '▲ Cancel' : '＋ Set a budget'}</Text>
      </Pressable>
      {budgetOpen && (
        <View style={styles.innerForm}>
          <TextInput value={budgetCategory} onChangeText={setBudgetCategory} placeholder="Category (Food, Travel)" style={styles.inputField} />
          <TextInput value={budgetLimit} onChangeText={setBudgetLimit} placeholder="Monthly limit (₹)" keyboardType="decimal-pad" style={styles.inputField} />
          <TextInput value={budgetMonth} onChangeText={setBudgetMonth} placeholder="Month (YYYY-MM)" style={styles.inputField} />
          {budgetError ? <Text style={styles.authError}>{budgetError}</Text> : null}
          {budgetMessage ? <Text style={styles.successText}>{budgetMessage}</Text> : null}
          <Pressable style={styles.primaryButtonLarge} onPress={addBudget}><Text style={styles.primaryButtonText}>Set budget →</Text></Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function MoreScreen({ user, onLogout, onOpenSettings, onOpenSummary, onViewTab }: { user: User; onLogout: () => void; onOpenSettings: () => void; onOpenSummary: () => void; onViewTab: (tab: 'plan' | 'accounts') => void; }) {
  const [toast, setToast] = useState('');

  const showComingSoon = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 1200);
  };

  const exportData = async () => {
    try {
      const result = await api<unknown>('/v1/privacy/export');
      await Share.share({ title: 'PaisaPilot Data Export', message: JSON.stringify(result, null, 2) });
    } catch {
      showComingSoon('Coming in V2');
    }
  };

  const confirmDelete = () => {
    Alert.alert('Delete account?', 'This permanently removes your account and data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteAccount(); await clearToken(); onLogout(); } },
    ]);
  };

  const gridItems = [
    { label: 'Calendar view', icon: '📅', dim: true, action: () => showComingSoon('Coming in V2') },
    { label: 'Activity log', icon: '📋', dim: true, action: () => showComingSoon('Coming in V2') },
    { label: 'Subscriptions', icon: '🔁', dim: true, action: () => showComingSoon('Coming in V2') },
    { label: 'Scheduled', icon: '📅', dim: true, action: () => showComingSoon('Coming in V2') },
    { label: 'Goals', icon: '🎯', dim: false, action: () => onViewTab('plan') },
    { label: 'Loans', icon: '💳', dim: true, action: () => showComingSoon('Coming in V2') },
    { label: 'Accounts', icon: '🏦', dim: false, action: () => onViewTab('accounts') },
    { label: 'Budgets', icon: '📊', dim: false, action: () => onViewTab('plan') },
    { label: 'Export data', icon: '📤', dim: false, action: exportData },
    { label: 'Delete account', icon: '🗑', dim: false, action: confirmDelete },
  ];

  return (
    <View style={styles.screenRoot}>
      <View style={styles.topBar}>
        <Text style={styles.headerText}>More</Text>
        <Text style={styles.headerAccent}>{user.email.charAt(0).toUpperCase()}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: 90 }}>
        <Text style={styles.moreUser}>{user.email}</Text>

        <Pressable style={styles.cardAction} onPress={onOpenSettings}>
          <Text style={styles.cardActionText}>Settings & preferences</Text>
        </Pressable>

        <Pressable style={styles.cardAction} onPress={onOpenSummary}>
          <Text style={styles.cardActionText}>All spending summary</Text>
        </Pressable>

        <View style={styles.gridRow}>
          {gridItems.map((item) => (
            <Pressable key={item.label} onPress={item.action} style={[styles.gridCard, item.dim ? { backgroundColor: C.surface } : null]}>
              <Text style={{ fontSize: 24 }}>{item.icon}</Text>
              <Text style={[styles.gridCardText, item.dim ? { color: C.inkFaint } : null]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.secondaryButtonLarge} onPress={onLogout}><Text style={styles.secondaryButtonText}>Sign out</Text></Pressable>
        <Text style={styles.versionText}>PaisaPilot V1</Text>
      </ScrollView>

      {toast ? <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View> : null}
    </View>
  );
}

function SettingsView({ user, onBack, onLogout }: { user: User; onBack: () => void; onLogout: () => void }) {
  const [aiInsights, setAiInsights] = useState(true);
  const [productEmails, setProductEmails] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const result = await api<unknown>('/v1/privacy/export');
      await Share.share({ title: 'PaisaPilot data export', message: JSON.stringify(result, null, 2) });
    } catch {
      // inline handling only
    } finally {
      setExporting(false);
    }
  };

  const deleteAndLogout = () => {
    Alert.alert('Delete account?', 'This permanently removes your account and data.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteAccount(); await clearToken(); onLogout(); } },
    ]);
  };

  return (
    <View style={styles.screenRoot}>
      <View style={styles.subHeader}>
        <Text onPress={onBack} style={styles.backText}>← Back</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 90 }}>
        <Text style={styles.sectionTitle}>Settings & preferences</Text>

        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.rowCard}>
          <View>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue}>{user.email}</Text>
          </View>
          <Text style={styles.ghostText} onPress={onLogout}>Sign out</Text>
        </View>

        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <View style={styles.rowCard}>
          <Text style={styles.rowLabel}>AI insights</Text>
          <Switch value={aiInsights} onValueChange={setAiInsights} />
        </View>
        <View style={styles.rowCard}>
          <Text style={styles.rowLabel}>Product emails</Text>
          <Switch value={productEmails} onValueChange={setProductEmails} />
        </View>

        <Text style={styles.sectionLabel}>THEME</Text>
        <View style={styles.rowCard}>
          <Text style={styles.rowLabel}>Theme mode</Text>
          <Text style={styles.rowValue}>System</Text>
        </View>

        <Text style={styles.sectionLabel}>DATA</Text>
        <Pressable style={styles.buttonGhost} onPress={exportData}><Text style={styles.buttonGhostText}>{exporting ? 'Exporting...' : 'Export JSON'}</Text></Pressable>
        <Pressable style={[styles.buttonGhost, { marginTop: S.sm, borderColor: C.terra }]} onPress={deleteAndLogout}><Text style={[styles.buttonGhostText, { color: C.terra }]}>Delete account</Text></Pressable>

        <Text style={styles.sectionLabel}>LEGAL</Text>
        <Pressable style={styles.cardAction} onPress={() => Linking.openURL('https://paisapilot.app/privacy-policy')}>
          <Text style={styles.cardActionText}>Privacy policy</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function SpendingSummary({ onBack }: { onBack: () => void }) {
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const result = await api<unknown>('/v1/transactions');
        if (!active) return;
        setTransactions(normalizeTransactions(result).filter((item) => item.kind === 'expense'));
      } catch {
        setTransactions([]);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const totals = transactions.reduce<Record<string, number>>((acc, item) => {
    const category = item.category ?? 'Uncategorised';
    acc[category] = (acc[category] ?? 0) + Math.abs(item.amountPaise);
    return acc;
  }, {});
  const totalSpend = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  return (
    <View style={styles.screenRoot}>
      <View style={styles.subHeader}>
        <Text onPress={onBack} style={styles.backText}>← Back</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: S.lg, paddingBottom: 90 }}>
        <Text style={styles.sectionTitle}>Spending summary</Text>

        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>FINANCIAL HEALTH SCORE</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <Text style={styles.scoreNumber}>86</Text>
            <Text style={{ color: C.inkFaint, fontSize: 18, marginLeft: 4, marginBottom: 12 }}>/100</Text>
          </View>
          <View style={styles.progressOuter}><View style={[styles.scoreBar, { width: '86%' }]} /></View>
        </View>

        {loading ? <ActivityIndicator color={C.gold} style={{ marginTop: 24 }} /> : rows.map(([category, value]) => (
          <View key={category} style={{ marginTop: S.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: C.ink, fontWeight: '700' }}>{category}</Text>
              <Text style={{ color: C.inkSoft, fontWeight: '700' }}>{formatMoney(value)}</Text>
            </View>
            <View style={styles.progressOuter}><View style={[styles.scoreBar, { width: `${Math.max(8, (value / totalSpend) * 100)}%` }]} /></View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function QuickAddModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    async function load() {
      try {
        const result = await api<unknown>('/v1/accounts');
        if (!active) return;
        const list = normalizeAccounts(result);
        setAccounts(list);
        if (list[0]) setSelectedAccountId(list[0].id);
      } catch {
        setAccounts([]);
      }
    }
    void load();
    return () => { active = false; };
  }, [visible]);

  const submit = async () => {
    if (!selectedAccountId) {
      setError('Select an account first.');
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (!description.trim()) {
      setError('Description is required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api('/v1/transactions', {
        method: 'POST',
        body: JSON.stringify({
          accountId: selectedAccountId,
          amountPaise: Math.round(value * 100),
          kind,
          description: description.trim(),
          occurredOn: new Date().toISOString(),
        }),
      });
      setAmount('');
      setDescription('');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add transaction.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.handleBar} />
          <Text style={styles.modalTitle}>Quick add</Text>
          <View style={styles.modalToggleRow}>
            {(['expense', 'income'] as const).map((item) => (
              <Pressable key={item} onPress={() => setKind(item)} style={[styles.modalToggle, kind === item ? { backgroundColor: C.ink } : { backgroundColor: C.surface }]}>
                <Text style={[styles.modalToggleText, kind === item ? { color: C.white } : { color: C.inkSoft }]}>{item === 'expense' ? 'Expense' : 'Income'}</Text>
              </Pressable>
            ))}
          </View>

          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="₹ 0.00" placeholderTextColor={C.inkFaint} style={styles.amountInput} />
          <TextInput value={description} onChangeText={setDescription} placeholder="What was it for?" placeholderTextColor={C.inkFaint} style={styles.descriptionInput} />

          <Text style={styles.fieldLabel}>ACCOUNT</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: S.md }}>
            {accounts.map((account) => (
              <Pressable key={account.id} onPress={() => setSelectedAccountId(account.id)} style={[styles.chip, selectedAccountId === account.id ? styles.chipActive : null]}>
                <Text style={[styles.chipText, selectedAccountId === account.id ? styles.chipTextActive : null]}>{account.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {error ? <Text style={styles.authError}>{error}</Text> : null}
          <Pressable style={styles.primaryButtonLarge} onPress={submit} disabled={busy}><Text style={styles.primaryButtonText}>{busy ? 'Saving...' : 'Save →'}</Text></Pressable>
          <Pressable style={styles.modalCancel} onPress={onClose}><Text style={styles.modalCancelText}>Cancel</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<Screen>('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [moreView, setMoreView] = useState<MoreView>('main');
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const flag = await SecureStore.getItemAsync('pp_onboarded');
        if (active) setOnboarded(flag === '1');
        const sessionUser = await validateSession();
        if (active) setUser(sessionUser);
      } finally {
        if (active) setBooting(false);
      }
    }
    void init();
    return () => { active = false; };
  }, []);

  if (booting) return <Splash />;

  if (!user) {
    if (onboarded === false) return <OnboardingFlow onAuth={setUser} />;
    return <AuthScreen onAuth={setUser} />;
  }

  const body = (() => {
    if (moreView === 'settings') return <SettingsView user={user} onBack={() => setMoreView('main')} onLogout={async () => { await clearToken(); setUser(null); setMoreView('main'); }} />;
    if (moreView === 'summary') return <SpendingSummary onBack={() => setMoreView('main')} />;

    switch (screen) {
      case 'home':
        return <HomeScreen user={user} onQuickAdd={() => setShowQuickAdd(true)} onViewTransactions={() => setScreen('transactions')} refreshKey={refreshKey} />;
      case 'transactions':
        return <TransactionsScreen onQuickAdd={() => setShowQuickAdd(true)} refreshKey={refreshKey} />;
      case 'accounts':
        return <AccountsScreen />;
      case 'plan':
        return <PlanScreen />;
      case 'more':
        return <MoreScreen user={user} onLogout={async () => { await clearToken(); setUser(null); }} onOpenSettings={() => setMoreView('settings')} onOpenSummary={() => setMoreView('summary')} onViewTab={(tab) => { setScreen(tab); setMoreView('main'); }} />;
      default:
        return null;
    }
  })();

  const tabConfig: Array<{ key: Screen; label: string; icon: string }> = [
    { key: 'home', label: 'Home', icon: '⌂' },
    { key: 'transactions', label: 'Transactions', icon: '↕' },
    { key: 'accounts', label: 'Accounts', icon: '◉' },
    { key: 'plan', label: 'Plan', icon: '◇' },
    { key: 'more', label: 'More', icon: '···' },
  ];

  const headerTitle = screen === 'home' ? getGreeting(user.email) : screen === 'transactions' ? 'Transactions' : screen === 'accounts' ? 'Accounts' : screen === 'plan' ? 'Plan' : 'More';

  return (
    <View style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={styles.topBar}>
        <Text style={styles.headerText}>{headerTitle}</Text>
        <Pressable onPress={() => { setMoreView('settings'); setScreen('more'); }}>
          <View style={styles.headerAvatar}><Text style={styles.headerAvatarText}>{user.email.charAt(0).toUpperCase()}</Text></View>
        </Pressable>
      </View>

      {body}

      <View style={styles.tabBar}>
        {tabConfig.map((tab) => {
          const active = screen === tab.key;
          return (
            <Pressable key={tab.key} style={styles.tabButton} onPress={() => { setScreen(tab.key); setMoreView('main'); }}>
              <Text style={[styles.tabIcon, active ? styles.tabActive : styles.tabInactive]}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, active ? styles.tabActive : styles.tabInactive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <QuickAddModal visible={showQuickAdd} onClose={() => setShowQuickAdd(false)} onSaved={() => setRefreshKey((v) => v + 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink },
  logoCircleSplash: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  logoCircleTextSplash: { color: C.ink, fontWeight: '800', fontSize: 22 },
  splashTitle: { color: C.white, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginTop: 14 },
  splashSubtitle: { color: C.inkFaint, fontSize: 14, marginTop: 6 },

  introShell: { flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', padding: S.lg },
  introSkip: { position: 'absolute', top: 52, right: 20, color: C.inkSoft, fontSize: 15, fontWeight: '600' },
  introBadge: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', marginBottom: S.md },
  introIcon: { fontSize: 40 },
  introHeadline: { fontSize: 28, fontWeight: '800', color: C.white, textAlign: 'center', marginBottom: S.sm },
  introSubtitle: { fontSize: 15, color: C.inkFaint, textAlign: 'center', maxWidth: 280, lineHeight: 22 },
  dotsRow: { flexDirection: 'row', marginTop: 28, marginBottom: 20 },
  dot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 5 },
  dotActive: { backgroundColor: C.gold },
  dotInactive: { backgroundColor: C.inkSoft },
  introButton: { backgroundColor: C.gold, borderRadius: 8, padding: 16, width: '100%', alignItems: 'center' },
  introButtonText: { color: C.ink, fontWeight: '800', fontSize: 15 },

  authPage: { flex: 1, backgroundColor: C.paper },
  authScroll: { flexGrow: 1, padding: S.xl },
  authLogoRow: { flexDirection: 'row', alignItems: 'center' },
  authBrand: { fontSize: 20, fontWeight: '800', color: C.ink, marginLeft: S.sm },
  authTitle: { fontSize: 30, fontWeight: '800', color: C.ink, marginTop: 40 },
  authSubtitle: { fontSize: 14, color: C.inkSoft, marginTop: 6, marginBottom: 32 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: C.inkSoft, letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' },
  authInput: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line, borderRadius: 8, padding: 14, fontSize: 15, color: C.ink, marginBottom: S.md },
  authError: { color: C.terra, fontSize: 13, marginBottom: S.sm },
  primaryButtonLarge: { backgroundColor: C.ink, borderRadius: 8, padding: 15, width: '100%', alignItems: 'center' },
  primaryButtonText: { color: C.white, fontWeight: '800', fontSize: 15 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: S.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.line },
  dividerText: { marginHorizontal: S.sm, color: C.inkFaint, fontSize: 12 },
  toggleText: { fontSize: 13, color: C.inkSoft, textAlign: 'center' },
  privacyLink: { marginTop: S.md, fontSize: 12, color: C.inkFaint, textAlign: 'center' },
  logoCircleSmall: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  logoCircleTextSmall: { color: C.ink, fontSize: 13, fontWeight: '800' },

  homeRoot: { flex: 1, backgroundColor: C.paper },
  homeScroll: { padding: S.lg, paddingBottom: 90 },
  heroCard: { backgroundColor: C.ink, borderRadius: 12, padding: S.lg, marginBottom: S.md },
  heroEyebrow: { fontSize: 10, color: C.inkFaint, letterSpacing: 1.5, textTransform: 'uppercase' },
  heroValue: { fontSize: 52, fontWeight: '800', color: C.white, letterSpacing: -1 },
  deltaPill: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginTop: 12 },
  deltaText: { fontSize: 11, fontWeight: '600' },
  metricRow: { flexDirection: 'row', marginBottom: S.md },
  metricCard: { flex: 1, backgroundColor: C.white, borderRadius: 10, padding: S.md, borderTopWidth: 2, borderTopColor: C.gold },
  metricLabel: { fontSize: 11, color: C.inkFaint, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  metricValueText: { fontSize: 22, fontWeight: '800' },
  recentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: S.sm },
  recentLink: { fontSize: 13, color: C.ink, fontWeight: '700' },
  transactionRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 10, padding: S.md, marginBottom: S.sm },
  transactionBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: S.sm },
  transactionBadgeText: { fontSize: 22, fontWeight: '700' },
  transactionText: { color: C.ink, fontWeight: '700', fontSize: 15 },
  transactionMeta: { color: C.inkFaint, fontSize: 12 },
  amountText: { fontWeight: '800', fontSize: 15 },
  badge: { backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, color: C.inkSoft, fontSize: 10, overflow: 'hidden' },
  emptyStateText: { color: C.inkFaint, fontSize: 14, textAlign: 'center' },
  scoreCard: { backgroundColor: C.ink, borderRadius: 10, padding: S.lg },
  scoreLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: C.inkFaint, marginBottom: S.sm },
  scoreNumber: { fontSize: 64, fontWeight: '800', color: C.white },
  progressOuter: { height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden', marginTop: S.sm },
  scoreBar: { height: 3, backgroundColor: C.gold, borderRadius: 2 },
  floatingAdd: { position: 'absolute', bottom: 24, right: 24, width: 54, height: 54, borderRadius: 27, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  floatingAddText: { color: C.white, fontSize: 28, fontWeight: '700' },

  screenRoot: { flex: 1, backgroundColor: C.paper },
  topBar: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: S.lg, paddingVertical: S.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { fontSize: 18, fontWeight: '800', color: C.ink },
  headerAccent: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.ink, color: C.gold, fontSize: 15, fontWeight: '800', textAlign: 'center', textAlignVertical: 'center' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  headerAvatarText: { color: C.gold, fontWeight: '800', fontSize: 15 },

  cardAction: { backgroundColor: C.white, borderRadius: 10, padding: S.md, marginBottom: S.sm },
  cardActionText: { fontSize: 16, fontWeight: '700', color: C.ink },
  innerForm: { backgroundColor: C.white, borderRadius: 10, padding: S.md, marginBottom: S.md },
  inputField: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.line, borderRadius: 8, padding: 14, fontSize: 15, color: C.ink, marginBottom: S.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: S.md },
  chip: { backgroundColor: C.surface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, marginRight: S.sm, marginBottom: 8 },
  chipActive: { backgroundColor: C.ink },
  chipText: { color: C.inkSoft, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: C.white },
  smallBadge: { backgroundColor: C.surface, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 8 },
  smallBadgeText: { color: C.inkSoft, fontSize: 10, fontWeight: '700' },
  progressTrack: { height: 8, backgroundColor: C.surface, borderRadius: 4, overflow: 'hidden', marginVertical: S.sm },
  progressFill: { height: 8, backgroundColor: C.gold, borderRadius: 4 },
  successText: { color: C.green, fontSize: 13, marginBottom: S.sm },
  moreUser: { color: C.inkSoft, fontSize: 13, marginBottom: S.md },
  gridRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: S.sm },
  gridCard: { width: '48%', backgroundColor: C.white, borderRadius: 10, padding: S.md, marginBottom: S.sm },
  gridCardText: { marginTop: 8, fontSize: 15, fontWeight: '700', color: C.ink },
  secondaryButtonLarge: { backgroundColor: C.surface, borderRadius: 8, padding: 15, marginTop: S.md },
  secondaryButtonText: { color: C.ink, fontWeight: '700', textAlign: 'center' },
  versionText: { fontSize: 11, color: C.inkFaint, textAlign: 'center', marginTop: S.md },
  toast: { position: 'absolute', bottom: 96, left: 24, right: 24, backgroundColor: C.ink, borderRadius: 10, padding: 12, alignItems: 'center' },
  toastText: { color: C.white, fontSize: 12, fontWeight: '700' },
  sectionTitle: { fontSize: 24, fontWeight: '800', color: C.ink, marginBottom: S.md },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.inkSoft, letterSpacing: 1, marginTop: S.sm, marginBottom: S.sm },
  rowCard: { backgroundColor: C.white, borderRadius: 10, padding: S.md, marginBottom: S.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '700', color: C.ink },
  rowValue: { fontSize: 13, color: C.inkSoft },
  ghostText: { color: C.inkSoft, fontSize: 13 },
  buttonGhost: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 15, alignItems: 'center' },
  buttonGhostText: { color: C.ink, fontWeight: '700' },
  subHeader: { paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: S.sm },
  backText: { fontSize: 15, color: C.inkSoft, fontWeight: '600' },
  bigListText: { fontSize: 16, fontWeight: '700', color: C.ink },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,26,22,0.5)' },
  modalSheet: { backgroundColor: C.paper, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: S.lg, paddingBottom: S.xl },
  handleBar: { width: 40, height: 4, backgroundColor: C.line, alignSelf: 'center', borderRadius: 2, marginBottom: S.md },
  modalTitle: { fontSize: 26, fontWeight: '800', color: C.ink, marginBottom: S.md },
  modalToggleRow: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 12, padding: 4, marginBottom: S.md },
  modalToggle: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  modalToggleText: { fontSize: 14, fontWeight: '700' },
  amountInput: { fontSize: 42, fontWeight: '800', color: C.ink, borderBottomWidth: 1, borderBottomColor: C.line, marginBottom: S.md, paddingBottom: S.sm, textAlign: 'center' },
  descriptionInput: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 14, fontSize: 14, color: C.ink, marginBottom: S.md },
  modalCancel: { marginTop: S.md, alignItems: 'center' },
  modalCancelText: { color: C.inkSoft, fontSize: 14 },

  tabBar: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, height: 68, paddingTop: 6 },
  tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { fontSize: 18 },
  tabLabel: { fontSize: 10, fontWeight: '600' },
  tabActive: { color: C.gold },
  tabInactive: { color: C.inkFaint },
});
