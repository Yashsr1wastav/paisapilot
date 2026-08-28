# Personal Money OS — Product Blueprint (v0.1)

> Status: Pre-development planning doc. No code written yet.
> Owner: You. Editor/Contributor: Claude (acting as PM + UX + Fintech Architect + Full-stack/Mobile/AI/Security/QA).
> This file is meant to live in the repo root (or `/docs/plan.md`) and be updated as decisions get made — treat it as a living spec, not a one-time deliverable.

---

## 0. How to read this doc

Sections A–J map directly to what you asked for. I've added three extra sections (0, K, L) because they materially change scope/cost and you need to decide on them before architecture:

- **K. Where I disagree with the original brief** — specific pushback, not blanket agreement
- **L. Design direction** — turning your two reference screenshots into an actual, non-generic design system
- **Section J (Questions)** is at the very end — answer those before we move to `/docs/architecture.md`

---

## A. Product Definition

**What we're building:** A personal finance application for individuals in India (₹, Indian banks, UPI, stocks, mutual funds, PPF/NPS/FDs) that tracks money across accounts, investments, debts and goals, and actively turns that data into decisions via an integrated AI layer — not a bolt-on chatbot.

**What we are explicitly NOT building (v1):**
- Not a broker (no order execution, no custody of funds)
- Not a licensed investment advisor (AI gives estimates/education, not personalized regulated advice — see Section K3)
- Not an accounting/bookkeeping tool for businesses
- Not, initially, a bank-account-linking product via screen scraping

**One-line pitch:** *"See where your money is, understand why, and know exactly what to do next — without ever opening a spreadsheet."*

**Core loop (from your brief, this is the product's spine):**
`Track → Understand → Predict → Recommend → Act`, wrapping into `SEE → UNDERSTAND → PLAN → ACT → IMPROVE`.

---

## B. Complete Feature Map

Grouped into modules so each can later become its own service/domain in the codebase.

| Module | Core Features |
|---|---|
| **Auth & Identity** | Email/phone auth, biometric+PIN lock, session/device mgmt, account recovery |
| **Accounts** | Bank, cash, credit card, UPI wallet, FD/RD, loan, custom asset/liability; transfers (non-P&L) |
| **Transactions** | Expense/income entry, categorization, recurring detection, split transactions, search/filter |
| **Investments** | Stocks, mutual funds (SIP/lumpsum), FD/PPF/NPS, portfolio aggregation, P&L, XIRR |
| **Markets** | Search, quotes, historical charts, watchlists, alerts, indices — **read-only, licensed data** |
| **Broker Import/Connect** | CSV/statement import (v1), official API integration (v2+) |
| **Budgets** | Category budgets, smart/AI-suggested budgets, rollover, alerts |
| **Goals** | Goal creation, contribution tracking, projection, AI commentary |
| **Bills & Subscriptions** | Recurring bill detection, due-date tracking, unused-subscription flags |
| **Credit Cards** | Limits, statement/due dates, outstanding balance, reward tracking |
| **Loans** | EMI tracking, amortization, prepayment simulation |
| **Analytics** | Net worth over time, cash flow, category/merchant breakdowns, comparisons |
| **Financial Health Score** | Transparent, configurable scoring + improvement actions |
| **AI Layer** | Contextual insights embedded per-module + natural-language Q&A |
| **Notifications** | Budget/bill/portfolio/salary alerts, user-controlled frequency |
| **Gamification** | Streaks, badges, levels — toggleable |
| **Monetization** | Free/premium tiers, subscription billing |
| **Security/Privacy Core** | Encryption, audit log, data export/delete, least-privilege access |

---

## C. V1 — First Serious Release (Play Store + Web)

**Design principle for V1: prove the core loop end-to-end on manually-entered + imported data, before touching any live broker/bank integration.** Integrations are the highest-risk, highest-compliance-cost part of this product — they should not gate your first release.

**Included:**
- Auth (email/phone), biometric/PIN lock
- Manual accounts (bank, cash, credit card, UPI wallet, FD, loan)
- Fast transaction entry (amount + one-line description → AI infers category/account/date, user confirms)
- Recurring transaction detection, basic split transactions
- Transfers (correctly excluded from income/expense)
- Manual investment entry (stocks + mutual funds), portfolio dashboard with P&L and XIRR
- **CSV/statement import** for holdings (Groww/Zerodha/CAMS-KFintech statements) — this alone covers most of "connect your portfolio" value without touching broker APIs
- Markets: search + quote + historical chart, using **one licensed data provider** (see K4)
- Budgets (manual + smart-suggested from history)
- Goals (create, track, simple projection — no AI yet needed, just arithmetic)
- Bills/subscriptions: pattern-detected from transactions, manual add
- Loans: EMI tracker + prepayment simulator (pure calculation, no integration risk)
- Financial Health Score v1 (transparent formula, shown to user)
- Dashboard: net worth, monthly summary, health score, recent transactions, investment snapshot, goals — **customizable/reorderable cards**
- AI: 1) contextual insight strings on dashboard/spending/goals (templated + LLM-polished), 2) natural-language Q&A scoped to the user's own stored data, with clear fact/estimate/recommendation labeling and disclaimers on anything investment-adjacent
- Notifications: budget-risk, bill-due, salary-received (push, no SMS parsing in v1 — see K5)
- Dark + light mode
- Data export (CSV/JSON) and account deletion (needed for Play Store compliance day one, not a v2 nice-to-have)

**Explicitly deferred out of V1:** broker OAuth integrations, bank account aggregator linking, US stocks, crypto, gamification badges (ship the mechanism, not full content set), premium billing (ship free-only, wire up paywall UI but don't charge yet).

---

## D. V2 — Post-Launch

- Official broker integrations where APIs exist (Zerodha Kite Connect, Upstox API, Groww if/when available) — read-only holdings+trades sync
- Account Aggregator (AA) framework integration for bank data (India's RBI-regulated consent framework — this is the *correct* way to get bank data, not screen scraping; see K1)
- US stocks (if there's real demand — adds FX, tax-lot, and data-licensing complexity)
- Credit card reward/cashback comparison engine
- Advanced AI: "which card should I use," affordability checks with actual scenario modeling
- Premium tier goes live: advanced analytics, unlimited accounts, advanced AI usage limits raised
- Web/desktop gets full parity + desktop-only depth (large multi-month tables, CSV export/import UI, advanced filtering)
- Push-based, richer notifications (portfolio milestones, savings-rate trend alerts)
- Gamification content buildout, user-togglable

## E. V3 — Differentiators

These are the features that would actually make this stand out rather than be "Copilot Money/Walnut but Indian":

- **Scenario simulator**: "What if I got a 20% raise / took a ₹10L loan / stopped SIP for 6 months" — full net-worth projection, not just a single goal calc
- **Tax-aware investment view**: LTCG/STCG estimates on unrealized gains, harvesting suggestions (education-only, clearly disclaimed)
- **Merchant-level negotiated insights**: "You've paid Zomato ₹18,400 this year across 62 orders" — genuinely useful, not just a pie chart
- **Proactive AI, not just reactive Q&A**: AI surfaces the question before you ask it ("Your dining spend is on pace to beat last month's high — want to see why?")
- **Cross-account "true" cash flow**: unify UPI + card + cash into one coherent daily cash-flow line, which most Indian apps get wrong because UPI is undercounted
- **Financial Health Score you can simulate**: drag a slider ("what if my emergency fund covered 6 months instead of 2") and see the score move live

---

## F. Screen Architecture

### Mobile
```
Onboarding: Welcome → Auth → Currency/Locale confirm → Link/skip accounts → First transaction prompt
Home (Dashboard): customizable card feed
Quick Add (+): Expense / Income / Investment / Transfer / Goal contribution — bottom sheet, 2-tap flow
Transactions: List, Search, Filters, Transaction Detail
Accounts: List, Account Detail, Add/Edit Account
Investments: Portfolio Overview, Holding Detail, Add Transaction (Buy/Sell/SIP)
Markets: Search, Asset Detail (chart, fundamentals), Watchlist
Budgets: Overview, Category Detail, Create/Edit Budget
Goals: List, Goal Detail, Create Goal
Bills: Upcoming list, Bill Detail
Credit Cards: List, Card Detail
Loans: List, Loan Detail, Prepayment Simulator
Analytics: Net Worth, Cash Flow, Category/Merchant breakdown, Comparisons
AI: Chat/Q&A surface + inline insights (not a separate silo)
Settings: Profile, Security, Notifications, Data Export/Delete, Premium, Gamification toggle, Theme
```

### Web/Desktop
Same domains, but: persistent left nav (not bottom tabs), dense multi-column dashboard, larger charts with hover detail, table views with sort/filter/export for Transactions and Analytics, side-panel detail views instead of full-screen pushes, keyboard shortcuts for quick-add.

```
Dashboard | Transactions | Accounts | Investments | Markets | Budget | Goals | Bills | Loans | Analytics | AI | Settings
```

---

## G. User Journey

1. **Install → Onboarding**: Sign up, set currency (₹ default), quick 3-question setup (do you track expenses/investments/both?) to tailor first-run dashboard.
2. **First transaction**: App nudges "Add your first expense" with the fast-entry flow; shows immediately how categorization/inference works so the user trusts it.
3. **Adding accounts**: User adds bank/cash/card accounts manually; optionally imports a broker CSV statement, which auto-creates holdings + historical transactions — this is the "wow" moment for V1, replacing what would've been a broker OAuth flow.
4. **Viewing investments**: Portfolio dashboard populates from import; AI immediately gives one contextual insight (e.g., allocation skew) to demonstrate value beyond raw numbers.
5. **Using AI**: User asks a natural-language question from a suggested-prompts list (lowers activation energy vs. blank chat box); answer is labeled fact vs. estimate vs. recommendation.
6. **Setting goals**: User creates a goal, app calculates required monthly contribution and shows projected date; AI revisits this weekly via notification if pace changes materially.
7. **Ongoing loop**: Dashboard becomes the daily/weekly check-in; notifications pull the user back in only when something's actionable (never pure vanity pings).

---

## H. Feature Dependencies

- **AI insights** depend on having *enough* transaction/investment history — cold-start users need templated/rule-based insights before there's enough data for anything statistically meaningful. Plan for an explicit "not enough data yet" state, not a silent failure.
- **Smart/AI budgets** depend on ≥1–2 months of categorized transaction history.
- **Broker integrations (V2)** depend on: legal review of each broker's API terms, and on the Account Aggregator / CSV import pipeline already existing (integrations should extend the same internal "holdings sync" interface, not be built as one-offs).
- **Market data (Markets module, portfolio valuation)** depends on a licensed data provider being contracted before V1 ships — this is a legal dependency, not just technical.
- **Financial Health Score** depends on Accounts + Transactions + Investments + Goals all existing, since it aggregates across them — build it last among V1 features, even though it's dashboard-prominent.
- **Notifications** depend on a background job/scheduler + push infrastructure being in place early, since bill-detection and budget-risk alerts are core V1 features, not add-ons.
- **Premium tier** depends on having actual usage data to know what's worth paywalling — don't hard-code the paywall boundary before V1 usage data exists (your brief already says this — agreed, don't decide pricing yet, but do build the entitlement-check mechanism now since retrofitting it later touches every module).

---

## I. Technical Risks (hardest parts, ranked)

1. **Regulatory exposure on AI + investment content** (India: SEBI Investment Adviser regulations). If the AI ever says something that reads as personalized investment advice ("buy X," "sell Y"), you cross into regulated territory. Needs a compliance-reviewed prompt/response boundary, not just a disclaimer footer. **Highest risk, address before AI module ships even in V1.**
2. **Correct handling of transfers vs. income/expense.** Get this wrong and every downstream number (net worth, savings rate, health score) is wrong. Needs a solid transfer-detection + manual-override design early, not bolted on later.
3. **Market data licensing cost/reliability.** Real-time/historical Indian equity + MF data isn't free at scale; provider choice affects both cost and what fields (P/E, sector, etc.) are even available. Needs a decision before Markets module is built.
4. **Broker/bank data ingestion correctness** (even just CSV import): every broker's statement format differs, changes without notice, and errors here directly misstate someone's money — this needs its own test suite with real sample statements, not just happy-path testing.
5. **Recurring/subscription detection accuracy.** False positives (flagging one-off payments as subscriptions) erode trust fast; this is a harder ML problem than it looks and should start rule-based, not model-based, in V1.
6. **Security of financial data at rest** — encryption strategy, key management, and audit logging need to be designed once, correctly, up front; retrofitting is expensive and risky for a finance product specifically.
7. **XIRR/portfolio return calculation correctness** across partial sells, SIPs, and dividends — subtle bugs here are the kind that quietly erode user trust for months before anyone notices.

---

## K. Where I'd Push Back on the Original Brief

Being the "don't just agree" voice you asked for:

**K1. Broker integrations should not be positioned as a near-term feature, even in messaging.** Your brief lists brokers (Groww, Zerodha, etc.) prominently in Section 10. I'd demote this hard: CSV import gets you 80% of the value with 5% of the legal/technical risk. Official broker APIs are inconsistent in availability and terms change; building the product's V1 identity around "connect your broker" sets an expectation you can't reliably deliver on day one. Put statement import front and center in your own head, not as a "fallback."

**K2. Bank-account linking (not just broker) is a bigger decision than the brief treats it as.** For actual bank transaction sync (not just manual entry), India's correct path is the **Account Aggregator (AA) framework** (RBI-regulated, consent-based) — not screen scraping, and not a generic "Plaid-like" approach, which doesn't have the same regulatory standing here. This is worth calling out explicitly since it wasn't named in your brief. Recommend deferring to V2 and treating it as its own project, not a checkbox.

**K3. The AI natural-language Q&A list in your brief includes things like "Can I afford a ₹70,000 phone?" and investment projections.** These are fine as *educational estimates*, but I'd formalize a hard rule in the system design: the AI can calculate and project from the user's own data, but must never phrase output as a personalized recommendation to buy/sell/invest in a specific instrument. This isn't just a UX nicety — it's the line between "financial wellness app" and "unlicensed investment advice," which is a real regulatory category in India (SEBI IA Regulations, 2013, as amended). Worth a short legal consult before V1 ships the AI module, not after.

**K4. Market data: pick one provider and go deep, don't plan for "many" in v1.** Multi-provider abstraction is good architecture long-term, but for V1 it adds cost/complexity for no user-visible benefit. Suggest a single reliable provider (e.g., a licensed NSE/BSE data vendor) for launch, with the module designed so a second provider can be added later.

**K5. Your brief doesn't mention SMS-based transaction detection**, which is how most Indian expense apps (Walnut, Money View, etc.) actually achieve "fast" entry — reading bank/card SMS notifications to auto-log transactions. It's worth deciding explicitly whether you want this: it's the single biggest lever for "adding an expense takes zero seconds" (better than your own +→confirm flow), but it requires SMS permission on Android, which Play Store now restricts heavily (2024+ policy tightened this a lot) and is not available on iOS at all. I'd flag this as a real V1-scope decision, not an oversight — recommend **skipping it for V1**, leaning on fast manual entry + statement import instead, and revisiting only if user research shows it's a dealbreaker.

**K6. Gamification: agree with your instinct to keep it subtle**, but I'd go further — ship it disabled by default for new users and let them opt in, rather than opt out. Finance apps that gamify aggressively (streaks, points) can nudge toward stress/compulsive-checking behavior, which cuts against the "calm, trustworthy" personality you described in Section 25. Small design choice, but worth being deliberate about.

**K7. "Financial Health Score" needs a documented, versioned methodology from day one** — not because it's hard to build, but because if you ever change the formula, existing users' scores will jump for reasons they didn't cause, which reads as broken/untrustworthy in a finance app. Plan for a `score_version` field per calculation from the start.

---

## L. Design Direction (from your references)

**What to take from Image 1 (CashPilot-style):** big, confident number typography on net-worth/balance; soft card elevation rather than hard borders; pill-shaped buttons; a distinct "AI insight" card treatment (colored, separated from neutral data cards) so AI commentary is visually distinguishable from raw numbers at a glance; calm dark background rather than pure black.

**What to take from Image 2 (crypto-style):** the candlestick/line chart module for the Markets asset-detail screen (tooltip-on-hover with date+value is genuinely good UX); the account-switcher chip pattern (top-left "Hi, Mark ▾") is worth adapting for a multi-account context.

**What to deliberately avoid (so this doesn't read as "another AI-generated fintech app"):**
- Dark-mode-with-purple-accent-and-glow is now the *default* AI-generated fintech look — if you want it to feel unique, I'd suggest picking an accent color/typographic voice that isn't violet/indigo (warm terracotta, deep green, or an ink-navy + amber pairing all read as more distinctly "Indian premium fintech" than the generic purple-glow look, and differentiate from Cash App/Copilot/CashPilot-style references).
- Avoid the trading-terminal density of Image 2 outside the Markets module specifically — a personal finance dashboard shouldn't feel like a leverage/trading screen (also worth avoiding given Image 2's "50x leverage" pattern isn't something a personal finance app should visually echo at all, even accidentally).
- Vary card shapes/rhythm instead of uniform rounded-rectangle grids everywhere — deliberate asymmetry (one hero card + smaller supporting cards) reads as more designed than a uniform grid.
- Custom iconography for the 5-6 most-used actions (Add Expense, Add Investment, etc.) rather than stock icon-pack icons — this is one of the highest-leverage "doesn't look AI-made" moves for relatively low effort.

I'd treat this as its own short doc (`design-system.md`) once you're ready — color tokens, type scale, spacing scale, component inventory — rather than folding it fully into this plan.

---

## J. Questions For You (answer before we move to architecture)

1. **Platform priority**: Mobile-first with web later, or building both in parallel? (Affects whether we pick React Native/Flutter + separate web stack, or a shared-logic approach.)
2. **AI provider**: Are you planning to use the Claude API for the in-app AI layer, or evaluating others? (Affects cost modeling and the "AI architecture" doc.)
3. **Market data budget**: Do you have/want a budget for a licensed data provider from day one, or should V1 launch with a minimal free-tier data source and upgrade later?
4. **SMS-based auto-entry**: In scope for V1, or explicitly deferred per K5 above?
5. **Team size/skillset**: Is this you alone, or do you have/plan to bring in other engineers? (Materially changes how ambitious V1's timeline should be.)
6. **Timeline pressure**: Is there a target launch date, or is this need-it-right-not-fast?
7. **Legal/compliance budget**: Are you able to get even a short consult on the AI-advice boundary (K3) and data-privacy (DPDP Act) before V1 ships, or should I design conservatively assuming no legal review is available?
8. **Design system**: Want me to draft `design-system.md` next (colors/type/components), or do you want to art-direct that yourself and hand me tokens?

---

## Next Steps

Once K3–K7 and the questions above are answered, the next docs to produce (as separate files, this one stays the source of truth for scope) are:
- `design-system.md`
- `architecture-overview.md` (DB schema sketch, API shape, module boundaries)
- `ai-architecture.md` (prompt boundaries, fact/estimate/recommendation labeling, data access scoping)
- `security-privacy.md`
- `v1-build-plan.md` (sequenced, since Section H shows real ordering constraints — e.g., Health Score last, notifications infra early)
