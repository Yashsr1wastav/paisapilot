import { describe, expect, it } from 'vitest';
import { resolveRootRoute } from '../mobile/src/navigation.js';

describe('mobile startup reachability', () => {
  it('keeps splash, auth, and dashboard as reachable root states', () => {
    expect(resolveRootRoute(true, false)).toBe('splash');
    expect(resolveRootRoute(false, false)).toBe('auth');
    expect(resolveRootRoute(false, true)).toBe('dashboard');
  });
});
