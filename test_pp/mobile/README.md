# PaisaPilot Android app

This directory contains the Expo Android client. iOS configuration is intentionally omitted for now.

## Local development

1. Install Node.js 20+ and the mobile dependencies with `npm install` from this directory.
2. Start the API from the repository root with `npm run dev`.
3. Set `EXPO_PUBLIC_API_URL` when the API is not available at the Android emulator default `http://10.0.2.2:3000`.
4. Run `npm run start`, then open the project in an Android emulator or device.

The app requests no Android permissions. Data export uses the authenticated API and the Android share sheet; it does not write files or read device data.

## Release preparation

The `eas.json` profiles describe development, internal preview, and production build settings. Before a release, configure the EAS project and Android signing credentials in the EAS account, verify the production API URL, increment `versionCode` in `app.json`, run the mobile typecheck and tests, and review the generated Android App Bundle. This repository does not contain a signed build or signing credentials.

The API currently has no session-revocation endpoint. Sign out clears the local SecureStore token; an already-issued server token remains valid until expiry or account deletion. Account deletion is server-side and revokes that user's sessions.
