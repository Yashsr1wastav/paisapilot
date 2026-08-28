import type { Label } from '@paisapilot/contracts';

export interface AiAnswer { label: Label; text: string; disclaimer?: string; }
export interface AiGateway { answer(prompt: string, facts: Record<string, unknown>): Promise<AiAnswer>; }

const advicePattern = /\b(buy|sell|hold|invest|purchase|trade|guaranteed return|sure profit|price target|personalized portfolio|you should|i recommend|for you|your portfolio|allocate|switch to|exit the position|tax advice|tax strategy|tax saving|reduce my taxes|tax.*fund|fund.*tax|deduct|borrow|loan|lending|interest rate|which (stock|fund|bond|etf|instrument)|pick an? (stock|fund|bond|etf)|specific (stock|fund|bond|etf|security))\b|\b(kharid(na|o|e)?|becho|nivesh|tax bach|udhaar|loan lo|aapko lena chahiye|aapko kharidna chahiye)\b/i;
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
    return { label: 'fact', text: `Based on your recorded PaisaPilot data: ${Object.keys(facts).length} fact source(s) were provided.`, disclaimer: 'This answer is limited to data you supplied and may be incomplete.' };
  }
}

export class AnthropicAiGateway implements AiGateway {
  constructor(private readonly apiKey: string, private readonly model = 'claude-3-5-haiku-latest') {}

  async answer(prompt: string, facts: Record<string, unknown>): Promise<AiAnswer> {
    if (isUnsafeAiPrompt(prompt)) return new SafeAiGateway().answer(prompt, facts);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: this.model, max_tokens: 500, system: 'Return JSON only with label exactly fact, estimate, or recommendation and text. Never provide personalized buy, sell, hold, or instrument-selection advice.', messages: [{ role: 'user', content: `${prompt}\nRecorded facts: ${JSON.stringify(facts)}` }] })
    });
    if (!response.ok) throw new Error('AI provider unavailable');
    const payload = await response.json() as { content?: Array<{ text?: string }> };
    const raw = payload.content?.[0]?.text;
    if (!raw) throw new Error('AI provider returned an empty response');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error('AI provider returned invalid structured output'); }
    const answer = validateAiAnswer(parsed);
    return answer ?? new SafeAiGateway().answer(prompt, facts);
  }
}
