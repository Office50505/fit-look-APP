# FitLook Mobile App

This project now includes a React Native Expo client in `mobile/` that uses the existing Express/MongoDB API in `server/`.

## Setup

1. Copy `.env.example` to `.env` at the project root and fill in real values for `MONGODB_URI`, `JWT_SECRET`, and `FAL_KEY`.
2. Copy `mobile/.env.example` to `mobile/.env`.
3. The mobile app defaults to the AWS backend: `EXPO_PUBLIC_API_URL=http://15.206.207.210/api`.
4. For local development only, Android emulator can use `EXPO_PUBLIC_API_URL=http://10.0.2.2:5050/api`.
5. For local development only, iOS simulator can use `EXPO_PUBLIC_API_URL=http://localhost:5050/api`.

## Run

```sh
npm install
npm --prefix mobile install
npm run server
npm run mobile
```

## iPhone

```sh
npm run mobile:ios
```

To generate or refresh the native iOS project, run:

```sh
npm run mobile:ios:prebuild
```

The mobile app includes the user-facing web features: signup/login with profile photo upload, product browsing and filtering, product details, token state, product try-ons, custom garment try-on, FAL VTO trial, StyleBot Amazon search, and informational pages.
