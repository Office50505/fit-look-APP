# FitLook Mobile App

This project now includes a React Native Expo client in `mobile/` that uses the existing Express/MongoDB API in `server/`.

## Setup

1. Copy `.env.example` to `.env` at the project root and fill in real values for `MONGODB_URI`, `JWT_SECRET`, and `FAL_KEY`.
2. Copy `mobile/.env.example` to `mobile/.env`.
3. For Android emulator, use `EXPO_PUBLIC_API_URL=http://10.0.2.2:5050/api`.
4. For iOS simulator, use `EXPO_PUBLIC_API_URL=http://localhost:5050/api`.
5. For a physical phone, use your computer LAN address, for example `EXPO_PUBLIC_API_URL=http://192.168.1.20:5050/api`.

## Run

```sh
npm install
npm --prefix mobile install
npm run server
npm run mobile
```

The mobile app includes the user-facing web features: signup/login with profile photo upload, product browsing and filtering, product details, token state, product try-ons, custom garment try-on, FAL VTO trial, StyleBot Amazon search, and informational pages.
