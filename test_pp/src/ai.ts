import type { Label } from '@paisapilot/contracts';

export interface AiAnswer { label: Label; text: string; disclaimer?: string; }
export interface AiGateway { answer(prompt: string, facts: Record<string, unknown>): Promise<AiAnswer>; }

// Blocks investment-specific advice and instruction injection.
// "purchase" alone is NOT blocked — only "purchase [this/a] [stock/fund/etf/…]".
const advicePattern = /\b(buy|sell|hold|invest|trade|guaranteed return|sure profit|price target|personalized portfolio|you should|i recommend|for you|your portfolio|allocate|switch to|exit the position|tax advice|tax strategy|tax saving|reduce my taxes|tax.*fund|fund.*tax|deduct|borrow|loan|lending|interest rate|which (stock|fund|bond|etf|instrument)|pick an? (stock|fund|bond|etf)|specific (stock|fund|bond|etf|security)|purchase (this |a )?(stock|fund|bond|etf|instrument|share))|\b(kharid(na|o|e)?|becho|nivesh|tax bach|udhaar|loan lo|aapko lena chahiye|aapko kharidna chahiye)\b/i;
const injectionPattern = /\b(ignore|disregard|forget|override|bypass)\b.{0,50}\b(previous|earlier|prior|above|system|developer|instructions?|rules?|messages?)\b|\b(system prompt|developer message|jailbreak|reveal your instructions|act as unrestricted|do anything now|pretend you are)\b/i;

export function isUnsafeAiPrompt(prompt: string): boolean { return advicePattern.test(prompt) || injectionPattern.test(prompt); }

export function validateAiAnswer(value: unknown): AiAnswer | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result = value as { label?: unknown; text?: unknown; disclaimer?: unknown };
  if (!['fact', 'estimate'].includes(result.label as string) || typeof result.text !== 'string' || !result.text.trim() || result.text.length > 4000 || isUnsafeAiPrompt(result.text)) return undefined;
  if (result.disclaimer !== undefined && (typeof result.disclaimer !== 'string' || result.disclaimer.length > 500)) return undefined;
  return { label: result.label as Label, text: result.text, disclaimer: 'AI-generated educational information based on recorded data; not investment advice.' };
}

export class SafeAiGateway implements AiGateway {
  async answer(prompt: string, facts: Record<string, unknown>): Promise<AiAnswer> {
    if (isUnsafeAiPrompt(prompt)) return { label: 'recommendation', text: 'I cannot provide personalized investment recommendations or follow instruction-override requests. I can explain concepts or summarize your recorded data.', disclaimer: 'Educational information only; not investment advice.' };
    
    // Provide contextual responses based on the prompt and available data
    const promptLower = prompt.toLowerCase();
    const cashFlow = facts.cashFlow as { incomePaise?: number; expensePaise?: number; netPaise?: number } | undefined;
    const accountCount = typeof facts.accountCount === 'number' ? facts.accountCount : 0;
    const income = cashFlow?.incomePaise != null ? `₹${(cashFlow.incomePaise / 100).toLocaleString('en-IN')}` : 'not recorded yet';
    const expenses = cashFlow?.expensePaise != null ? `₹${(cashFlow.expensePaise / 100).toLocaleString('en-IN')}` : 'not recorded yet';
    const net = cashFlow?.netPaise != null ? `₹${(cashFlow.netPaise / 100).toLocaleString('en-IN')}` : 'not recorded yet';

    // Greetings
    if (/^(hi|hello|hey|namaste|greetings?)/i.test(promptLower)) {
      const greeting = `Hi there! I'm PaisaPilot, your personal finance assistant. I can see you have ${accountCount} account(s) and a net monthly flow of ${net}. Ask me anything about your money!`;
      return { label: 'fact', text: greeting };
    }

    // Spending questions
    if (/spend|spent|expense|cost|how much/i.test(promptLower)) {
      return { label: 'fact', text: `Based on your recorded PaisaPilot data: Your monthly expenses are ${expenses}. Your monthly income is ${income}. This gives you a net monthly flow of ${net}.` };
    }

    // Income questions
    if (/income|earn|earning|salary|revenue/i.test(promptLower)) {
      return { label: 'fact', text: `Your monthly income is ${income}. With expenses of ${expenses}, your net monthly flow is ${net}. You have ${accountCount} account(s) recorded.` };
    }

    // Affordability questions
    if (/afford|budget|can i|should i|within budget|extra money/i.test(promptLower)) {
      const netFlow = cashFlow?.netPaise ?? 0;
      if (netFlow > 0) {
        return { label: 'estimate', text: `Based on your net monthly flow of ${net}, you have room in your budget. Track your specific spending to make informed decisions about new expenses.` };
      } else if (netFlow < 0) {
        return { label: 'estimate', text: `Your net monthly flow is ${net} (negative). Focus on increasing income or reducing expenses before taking on new financial commitments.` };
      } else {
        return { label: 'estimate', text: `Your income and expenses are balanced at ${net}. Review specific categories to find opportunities for savings or growth.` };
      }
    }

    // Default response with their data
    return { label: 'fact', text: `Based on your recorded PaisaPilot data: ${Object.keys(facts).length} fact source(s) are available. Monthly income: ${income}, expenses: ${expenses}, net flow: ${net}. Feel free to ask about your spending, income, or any finance topic!`, disclaimer: 'This answer is limited to data you supplied and may be incomplete.' };
  }
}

export class GeminiAiGateway implements AiGateway {
  constructor(private readonly apiKey: string, private readonly model = 'gemini-1.5-flash') {}

  async answer(prompt: string, facts: Record<string, unknown>): Promise<AiAnswer> {
    if (isUnsafeAiPrompt(prompt)) return new SafeAiGateway().answer(prompt, facts);

    const cashFlow = facts.cashFlow as { incomePaise?: number; expensePaise?: number; netPaise?: number } | undefined;
    const accountCount = typeof facts.accountCount === 'number' ? facts.accountCount : 0;
    const income = cashFlow?.incomePaise != null ? `₹${(cashFlow.incomePaise / 100).toLocaleString('en-IN')}` : 'not recorded yet';
    const expenses = cashFlow?.expensePaise != null ? `₹${(cashFlow.expensePaise / 100).toLocaleString('en-IN')}` : 'not recorded yet';
    const net = cashFlow?.netPaise != null ? `₹${(cashFlow.netPaise / 100).toLocaleString('en-IN')}` : 'not recorded yet';

    const systemPrompt = `You are PaisaPilot, a personal finance assistant for Indian users. You have access to the user's financial data shown below. Your job is to give short, specific, useful answers grounded in their actual numbers.

Rules:
1. Respond ONLY with a JSON object: {"label": "fact|estimate", "text": "your answer", "disclaimer": "optional, only for investment topics"}
2. For greetings (hi, hello, hey), respond warmly and briefly mention one insight from their data, label as "fact"
3. For affordability questions (can I afford X), calculate based on their net flow and savings, label as "estimate"
4. For spending questions, use their actual income/expense numbers, label as "fact"
5. For planning questions, give a concrete suggestion based on their data, label as "estimate"
6. Never recommend specific stocks, mutual funds, or investment instruments
7. Keep answers under 3 sentences, specific and actionable
8. Always use ₹ symbol for Indian Rupees
9. If the user has no data yet, acknowledge that warmly and suggest what to add first

User financial data:
- Monthly income: ${income}
- Monthly expenses: ${expenses}
- Net monthly flow: ${net}
- Number of accounts: ${accountCount}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 300, temperature: 0.3 }
      })
    });

    if (!response.ok) throw new Error('AI provider unavailable');
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('AI provider returned an empty response');

    // Strip markdown code fences if Gemini wraps the JSON
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    let parsed: unknown;
    try { parsed = JSON.parse(cleaned); } catch { throw new Error('AI provider returned invalid structured output'); }
    const answer = validateAiAnswer(parsed);
    return answer ?? new SafeAiGateway().answer(prompt, facts);
  }
}
