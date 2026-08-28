export type AccountType = 'bank' | 'cash' | 'credit_card' | 'upi_wallet' | 'fd' | 'loan' | 'custom';
export type TransactionKind = 'income' | 'expense' | 'transfer';
export type Label = 'fact' | 'estimate' | 'recommendation';

export interface Account { id: string; userId: string; name: string; type: AccountType; balancePaise: number; currency: 'INR'; createdAt: string; }
export interface Transaction { id: string; userId: string; accountId: string; transferAccountId?: string; amountPaise: number; kind: TransactionKind; description: string; category?: string; occurredOn: string; createdAt: string; }
export interface Goal { id: string; userId: string; name: string; targetPaise: number; currentPaise: number; targetDate: string; }
export interface Budget { id: string; userId: string; category: string; limitPaise: number; month: string; }
export interface Loan { id: string; userId: string; name: string; principalPaise: number; annualRatePercent: number; monthlyPaymentPaise: number; }
export interface UserSettings { userId: string; currency: 'INR'; aiEnabled: boolean; marketingEmails: boolean; }
export interface ExportBundle { exportedAt: string; user: { id: string; email: string }; accounts: Account[]; transactions: Transaction[]; goals: Goal[]; budgets: Budget[]; loans: Loan[]; settings: UserSettings; }
