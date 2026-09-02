// Stub for expo-secure-store used by vitest only.
// The real package is a native Expo module that only works inside the Expo/Metro build
// pipeline. Tests that import mobile/src/api.ts mock this module via vi.mock(), so
// these implementations are never actually called — the stub just needs to be valid JS
// that Rollup can parse without errors.
export async function getItemAsync() { return null; }
export async function setItemAsync() {}
export async function deleteItemAsync() {}
