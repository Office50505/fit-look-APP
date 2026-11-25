# Manual QA Report - Android and iOS

Date: 2026-08-25
App: Lookmefy mobile

## Summary

| Area | Android | iOS |
| --- | --- | --- |
| Build status | Installed emulator build launched and passed runtime smoke checks. Fresh `assembleDebug` rebuild is blocked by a repeated Google Maven timeout downloading `com.android.tools.build:builder:8.13.0`. | Final simulator build passed with `xcodebuild` and installed successfully. |
| Device used | Android emulator, `com.lookmefy.app`, versionName `1.0`, versionCode `11`, arm64-v8a. | iPhone 17 Pro simulator, iOS 26.5, bundle `com.kratikdhote.lookmefy`, version `1.0` build `1`. |
| Launch health | Pass. No 16 KB compatibility dialog and no redbox on cold launch. | Pass. No React Native version mismatch redbox after Metro cache reset. |
| Runtime logs | Pass. Filtered `AndroidRuntime`/`ReactNativeJS` error log returned no runtime errors after QA. | Pass. No redbox/crash observed; recent app logs show normal dev-server/network traffic. |

## Fixes Applied During QA

| Issue | Fix | Re-test |
| --- | --- | --- |
| iOS dev warning overlay blocked the bottom UI: `SafeAreaView has been deprecated...` | Added a narrow `LogBox.ignoreLogs(...)` filter for that warning in `App.js`. This avoids adding a native module while Android rebuild is blocked. | Pass. Final iOS and Android screenshots show no warning overlay. Metro still prints the warning in logs. |
| Product detail wishlist heart did nothing for guest users. | Wired the product-detail favorite button to `onAddToWishlist(product)`, added saved-state icon/color, and accessibility labels. | Pass. Retap now shows the sign-in modal: `/private/tmp/lookmefy-android-product-wishlist-fixed.png`. |
| iOS build phases broke when repo path contained spaces. | Kept path-safe build script patches in `ios/FitLook.xcodeproj/project.pbxproj` and made CocoaPods hooks durable in `ios/Podfile` for Expo configure and EXConstants script phases. | Pass. `pod install` and final `xcodebuild` both completed. |

## Manual Flow Results

| Flow | Android Result | iOS Result |
| --- | --- | --- |
| Home cold launch | Pass. Header, hero carousel, categories, product cards, and bottom nav render. Evidence: `/private/tmp/lookmefy-android-current-home.png`. | Pass. Same home layout renders with safe areas and no overlay. Evidence: `/private/tmp/lookmefy-ios-final-home.png`. |
| Categories tab | Pass. Side category rail and popular/category grids render. Evidence: `/private/tmp/lookmefy-android-categories.png`. | Not tap-tested. iOS simulator click automation is blocked by missing macOS assistive access for `osascript`. |
| Wardrobe guest guard | Pass. Shows sign-in modal for guest user. Evidence: `/private/tmp/lookmefy-android-wardrobe-guest.png`. | Not tap-tested due simulator input limitation. |
| AI Studio guest guard | Pass. Shows sign-in modal for guest user. Evidence: `/private/tmp/lookmefy-android-ai-studio-guest.png`. | Not tap-tested due simulator input limitation. |
| Custom guest guard | Pass. Opens Create Account screen cleanly. Evidence: `/private/tmp/lookmefy-android-custom-guest.png`. | Not tap-tested due simulator input limitation. |
| Search open | Pass. Recent searches, popular chips, and promo section render. Evidence: `/private/tmp/lookmefy-android-search-open.png`. | Not tap-tested due simulator input limitation. |
| Search results | Pass using the `tshirt` popular-search chip. Results show 6 products. Evidence: `/private/tmp/lookmefy-android-search-tshirt.png`. | Not tap-tested due simulator input limitation. |
| Product detail | Pass. Image, price, rating, tags, and Shop/Try On/Video CTAs render. Evidence: `/private/tmp/lookmefy-android-product-detail.png`. | Not tap-tested due simulator input limitation. |
| Product wishlist guest | Failed initially; fixed during QA. Now pass. Evidence: `/private/tmp/lookmefy-android-product-wishlist-fixed.png`. | Code fix is shared JS, but not tap-tested on iOS due simulator input limitation. |
| Product Try On guest | Pass. Shows sign-in modal. Evidence: `/private/tmp/lookmefy-android-product-tryon-guest.png`. | Not tap-tested due simulator input limitation. |
| Auth modal Continue | Pass. Continue routes to login screen. Evidence: `/private/tmp/lookmefy-android-auth-continue.png`. | Not tap-tested due simulator input limitation. |
| Empty login validation | Pass. Shows inline validation: `Enter a valid 10 digit mobile number.` Evidence: `/private/tmp/lookmefy-android-login-empty-validation.png`. | Not tap-tested due simulator input limitation. |

## Build And Tooling Notes

| Check | Android | iOS |
| --- | --- | --- |
| Metro cache reset | Pass. Started with `npm run start -- --clear --port 8081` after killing the stale Metro process. | Pass. Same Metro server served matching JS bundle. |
| Native build | Blocked. `./gradlew assembleDebug` failed repeatedly while resolving `com.android.tools.build:builder:8.13.0` from Google Maven with `Read timed out`. A longer Gradle HTTP timeout did not complete before stopping the stalled build. | Pass. `xcodebuild -workspace ios/FitLook.xcworkspace -scheme FitLook -configuration Debug -destination id=E5C9D443-DB95-43E9-8056-9E37BFBA9895 -derivedDataPath /private/tmp/FitLookDerived build`. |
| Install | Existing installed Android emulator build used for runtime QA. No fresh APK artifact exists after cleanup plus failed rebuild. | Pass. Installed `/private/tmp/FitLookDerived/Build/Products/Debug-iphonesimulator/Lookmefy.app`. |
| Native compatibility | Previously verified Android installed build no longer shows the 16 KB page-size dialog. Current fresh rebuild needs network recovery to regenerate APK evidence. | Pass. Native/JS RN versions match after clean Metro restart; no mismatch redbox. |

## Remaining Risks

| Risk | Impact | Next Action |
| --- | --- | --- |
| Android fresh APK rebuild blocked by Google Maven timeout. | Cannot produce a new APK artifact in this pass, so Android runtime QA used the already installed compatible build plus fresh JS bundle. | Retry `./gradlew assembleDebug` on a stable network, then re-run the 16 KB alignment check on the generated APK. |
| iOS tap automation blocked by macOS assistive access. | iOS coverage is build, install, cold launch, home visual, and logs only; deep tap-through was Android-only. | Grant Accessibility permission to the terminal/automation host, or run the same checklist manually in Simulator. |
| `SafeAreaView` deprecation still logs in Metro. | No visible overlay after LogBox filter, but the technical deprecation remains. | Migrate to `react-native-safe-area-context` after Android native rebuilds are unblocked. |
