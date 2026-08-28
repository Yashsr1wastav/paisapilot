export type RootRoute = 'splash' | 'auth' | 'dashboard';

export function resolveRootRoute(booting: boolean, hasUser: boolean): RootRoute {
  if (booting) return 'splash';
  return hasUser ? 'dashboard' : 'auth';
}
