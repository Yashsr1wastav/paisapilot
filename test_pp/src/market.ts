export interface MarketQuote { symbol: string; pricePaise: number; currency: 'INR'; asOf: string; delayed: boolean; source: string; }
export interface MarketDataProvider { quote(symbol: string): Promise<MarketQuote>; }

export class MockDelayedMarketProvider implements MarketDataProvider {
  async quote(symbol: string): Promise<MarketQuote> {
    const clean = symbol.trim().toUpperCase();
    if (!/^[A-Z0-9._-]{1,20}$/.test(clean)) throw new Error('Invalid symbol');
    return { symbol: clean, pricePaise: 100000, currency: 'INR', asOf: new Date().toISOString(), delayed: true, source: 'mock-delayed' };
  }
}
