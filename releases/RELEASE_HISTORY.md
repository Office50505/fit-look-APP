# Lookmefy Android release history

This file is the durable release baseline used for future APK/AAB builds and
comparison reports.

## iOS 1.0.1 (build 33; local distribution IPA)

- Built and verified: 2026-10-29 IST. iOS increments build 32 to 33 while the
  explicitly requested marketing version remains `1.0.1`. Android remains
  `1.0.2`/versionCode 35 and was not rebuilt.
- IPA: `lookmefy-ios-1.0.1-build33/lookmefy-ios-1.0.1-33.ipa`.
- Archive: `../mobile/release/lookmefy-ios-1.0.1-build33.xcarchive`; portable
  archive: the same path with `.zip` appended.
- IPA: 44,229,296 bytes; SHA-256
  `c7b51f9cd7505b47e16028a446cb0f12f2f5efbc0577b2d45440a15e4d1bf276`.
- Archive ZIP: 69,777,566 bytes; SHA-256
  `e8f1be00ed98a44d9c20bd53c3c39de8e4f89ed7e2660cc2c825a5acede09403`.
- Binary-verified identity: `com.kratikdhote.lookmefy`, version `1.0.1`, build
  `33`, arm64, minimum iOS 15.1, SDK iphoneos26.5/Xcode 26.6.
- Signing: archive is Apple Development signed and exported IPA is Apple
  Distribution signed for team LJ48CVC23W with `get-task-allow=false`.
- PASS: Xcode Release archive and App Store distribution export; archive/IPA
  identity; deep/strict signatures; IPA ZIP CRC; expected Release Hermes UUID
  `80D5528F-2C78-3B90-B90F-747E89A9F880`; stale-Hermes-marker regression;
  App.js Babel transform; 80 focused mobile tests and 10 authenticated
  private-media tests.
- Explicit comparison with build 32: IPA grows 2,303 bytes and archive ZIP
  grows 2,304 bytes. Bundle ID, version, architecture, minimum OS, SDK,
  signing team, privacy strings and Release Hermes UUID match except for the
  intended build-number increment. Both build-32 artifacts were present and
  their hashes were rechecked.
- Source-history inference: comparison with the last release source inventory
  shows pre-existing changes in App.js and privateMediaRecovery.js in addition
  to iOS build metadata. Focused tests show private-media signed-URL rendering
  with bearer compatibility and fail-closed invalid/revoked sessions, but no
  physical-device behavior was verified. These changes were present before
  release preparation and are not claimed as authored by this build task.
- Limits: the nested repository was dirty before building and contains
  modified/untracked source plus ignored native/generated files. No physical
  device/simulator smoke run, purchase sandbox transaction, App Store upload or
  TestFlight upload was performed.
- Evidence: archive/export logs, signature and identity facts, source/status
  comparison, test outputs and Hermes verification are retained in
  `lookmefy-ios-1.0.1-build33/`.

## 1.0.2 (Android versionCode 35)

- Built and verified: 2026-10-28 IST. Android increments 34 to 35. Because no
  semantic-version override was supplied, the repository convention increments
  versionName from `1.0.1` to `1.0.2`. iOS remains `1.0.1` build 32 and was not
  rebuilt.
- Artifacts: `lookmefy-1.0.2-build35/lookmefy-1.0.2-35.apk` and
  `lookmefy-1.0.2-build35/lookmefy-1.0.2-35.aab`; convenience copies are
  `../mobile/release/lookmefy-v1.0.2-vc35.apk` and the corresponding `.aab`.
- APK: 92,699,228 bytes; SHA-256
  `4b891784ae09946e86c004d66f0b65b56722e58271babfe4f4e46479b5d5e147`.
- AAB: 74,106,075 bytes; SHA-256
  `f39d34d863cf2225b55d6f7d85b4d5afc5d5b17d3e5c61a8fe90e2e975b5dbaa`.
- Binary-verified identity: `com.lookmefy.app`, `1.0.2`/35, minimum SDK 24,
  target/compile SDK 36; ABIs arm64-v8a, armeabi-v7a, x86 and x86_64.
- Manifest permissions match build 34: INTERNET, READ/WRITE_EXTERNAL_STORAGE,
  RECORD_AUDIO, SYSTEM_ALERT_WINDOW, VIBRATE, CAMERA, ACCESS_NETWORK_STATE and
  the app dynamic-receiver permission. `com.android.vending.BILLING` is absent.
- Upload certificate SHA-1:
  `E0:47:A9:8F:96:B2:3A:0F:D3:22:32:75:97:59:60:3D:51:05:B0:EB`.
- PASS: Gradle assembleRelease, bundleRelease and lintRelease; APK v2 and AAB
  JAR signatures; expected upload key; package/version identity; AAB ZIP CRC;
  APK 16 KB alignment; App.js Babel transform and 79 focused mobile tests.
- User-facing change: visible version metadata advances from `1.0.1` to
  `1.0.2`. No feature behavior change is claimed.
- Technical/source comparison: retained build-34 hashes show changes only in
  app.json, package.json, package-lock.json and generated Android build.gradle
  metadata. No feature source, dependency, SDK, ABI, signing or permission
  change was introduced. This is a metadata-only release with high confidence.
- Explicit comparison with build 34: APK grows by 4 bytes and AAB shrinks by
  5 bytes. Package identity, SDKs, ABIs, certificate and permissions are
  unchanged; versionName and versionCode are the intended differences. Both
  baseline artifacts were present and their hashes were rechecked.
- Limits: the nested repository remains dirty with pre-existing changes and
  ignored native/generated files. No physical-device/emulator smoke run, Play
  upload or Play-side version acceptance check was performed.
- Evidence: build log, binary facts, badging, signatures, alignment, ZIP test,
  source hashes/status and focused tests are in the build-35 release directory.
- PDF report: `../../output/pdf/lookmefy-release-1.0.2-android35-2026-10-28.pdf`
  (12,772 bytes); SHA-256
  `7c4ae140ad7e61c62335256beeb5897d92a19feb02ece9c4be4da87c1603888b`.

## 1.0.1 (Android versionCode 34; iOS build 32; local distribution IPA)

- Built and verified: 2026-10-28 IST. The user explicitly requested semantic
  version `1.0.1`; Android increments 33 to 34 and iOS increments 31 to 32.
- Android artifacts: `lookmefy-1.0.1-build34/lookmefy-1.0.1-34.apk` and
  `lookmefy-1.0.1-build34/lookmefy-1.0.1-34.aab`; convenience copies are
  `../mobile/release/lookmefy-v1.0.1-vc34.apk` and the corresponding `.aab`.
- APK: 92,699,224 bytes; SHA-256
  `93889c96476e9c533babf463927385ea2cc6501a03c8a91a23cc2ce2ba59080a`.
- AAB: 74,106,080 bytes; SHA-256
  `995176926b7773ea6ca9f5fc6afe20cec743db5ff52544ce48f4567e486085c0`.
- Binary-verified Android identity: `com.lookmefy.app`, `1.0.1`/34,
  minimum SDK 24, target/compile SDK 36; ABIs arm64-v8a, armeabi-v7a, x86 and
  x86_64. APK permissions match build 33 and include INTERNET,
  READ/WRITE_EXTERNAL_STORAGE, RECORD_AUDIO, SYSTEM_ALERT_WINDOW, VIBRATE,
  CAMERA, ACCESS_NETWORK_STATE and the app dynamic-receiver permission.
  `com.android.vending.BILLING` is absent.
- Android upload certificate SHA-1:
  `E0:47:A9:8F:96:B2:3A:0F:D3:22:32:75:97:59:60:3D:51:05:B0:EB`.
- PASS: Gradle assembleRelease, bundleRelease and lintRelease; APK v2 and AAB
  JAR signatures; expected upload key; package/version; AAB ZIP integrity;
  APK 16 KB alignment; App.js Babel transform; 79 focused mobile assertions
  and 10 authenticated private-media assertions.
- iOS IPA: `lookmefy-ios-1.0.1-build32/lookmefy-ios-1.0.1-32.ipa`.
- iOS archive: `../mobile/release/lookmefy-ios-1.0.1-build32.xcarchive`;
  portable archive: the same path with `.zip` appended.
- IPA: 44,226,993 bytes; SHA-256
  `d63abcfa7eaacf4bd127e4f3615012db28d6ab80e1830b955adf45929e43f043`.
- Archive ZIP: 69,775,262 bytes; SHA-256
  `7a93bce39f87f5ef1bda9c64cd61ce25ea737ee5aad3b346496314098bfda138`.
- Binary-verified iOS identity: `com.kratikdhote.lookmefy`, `1.0.1` (32),
  arm64, minimum iOS 15.1, SDK iphoneos26.5/Xcode 26.6. Release Hermes UUID
  `80D5528F-2C78-3B90-B90F-747E89A9F880` matches archive and IPA.
- PASS: Xcode Release archive, local App Store distribution export, archive/IPA
  identity, deep/strict signatures, ZIP CRC, Release Hermes verification and
  stale-Hermes-marker regression. The archive is Apple Development signed and
  the IPA is Apple Distribution signed for team LJ48CVC23W. No store upload
  occurred.
- Explicit comparison with Android 33 / iOS 31: APK grows 7,024 bytes, AAB
  grows 4,700 bytes, IPA grows 4,908 bytes and archive ZIP grows 4,911 bytes.
  Platform identities, semantic version, SDK/ABI facts, signing identities,
  Android permissions, iOS privacy strings and Release Hermes match except for
  the requested Android/iOS build-number increments. All immediately preceding
  artifacts were present and their recorded hashes were rechecked.
- Source-history inference: hash comparison with build 33 shows pre-existing
  changes in App.js, gestureNavigation.js, frontendReleaseSafety.js,
  storeKitProducts.js and privateMediaRecovery.js. These filenames suggest
  possible navigation, safety/consent, iOS purchase-presentation and private
  image-recovery changes, but no such behavior was device-verified. Release
  preparation itself aligned version metadata and resolved version-file merge
  markers; it did not intentionally add a user-facing feature or dependency.
- Limits: the nested mobile repository was dirty before building and contains
  modified/untracked source and ignored native/generated files. One optional
  backend Apple-payments test could not load the absent root
  `google-auth-library`; native builds and focused tests were unaffected. No
  physical-device/simulator smoke run, purchase sandbox transaction, Play
  upload, App Store upload or TestFlight upload was performed.
- Evidence: build/export logs, binary facts, badging, signatures, alignment,
  source hashes/status and test output are retained in the two build-34/build-32
  release directories.
- PDF report:
  `../../output/pdf/lookmefy-release-1.0.1-android34-ios32-2026-10-28.pdf`
  (17,723 bytes); SHA-256
  `a5e0bd2181a1843db25a3c1b7b5eee3c78e298f86ab74d5754d6796d1d7f7d03`.

## 1.0.1 (Android versionCode 33; iOS build 31; local distribution IPA)

- Built and verified: 2026-10-22 IST. User requested version `1.0.1`;
  Android increments 32 to 33 and iOS increments 30 to 31.
- Source: current local mobile source, including pre-existing dirty and
  untracked files. Comparison with the build-32 source-hash inventory identifies
  changes in App.js and privateMediaRecovery.js plus the new screenDataCache.js.
  Source observations show session-scoped private-image caching with shared
  pending requests, short-lived screen snapshots and cached private try-on
  preview recovery. These are source-history inferences rather than
  device-verified behavior.
- Android artifacts: `lookmefy-1.0.1-build33/lookmefy-1.0.1-33.apk` and
  `lookmefy-1.0.1-build33/lookmefy-1.0.1-33.aab`; convenience copies are
  `../mobile/release/lookmefy-v1.0.1-vc33.apk` and corresponding `.aab`.
- APK size: 92,692,200 bytes; SHA-256:
  `5a6479e0c29fe43b228b5a511f6d24f2b77930998ad37ede4ff86e57f7358b15`
- AAB size: 74,101,380 bytes; SHA-256:
  `1f1a2cbde7be4b759432d465157a9a0c33339c3073de112ca50d5b618ab44a8f`
- Binary-verified Android identity: `com.lookmefy.app`, `1.0.1`/33,
  minimum SDK 24, target/compile SDK 36; ABIs arm64-v8a, armeabi-v7a, x86,
  x86_64. Permissions are unchanged from build 32; BILLING remains absent.
- APK/AAB upload certificate SHA-1:
  `E0:47:A9:8F:96:B2:3A:0F:D3:22:32:75:97:59:60:3D:51:05:B0:EB`.
- PASS: Gradle assembleRelease/bundleRelease/lintRelease, expected upload key,
  APK/AAB identity, ZIP CRC, decoded AAB manifest, bundletool 1.18.2 validation
  and APK 16 KB ZIP alignment. The existing lint exception remains limited to
  the unused Expo Video background-service notification check; that service is
  absent from the decoded AAB. Other lint/JAR warnings remain in evidence.
- Technical changes for release preparation: increment app.json, native Gradle
  and Xcode build metadata; retain `1.0.1` in app/package/native versions. No
  intentional dependency upgrade or feature-code modification during release
  preparation. Existing Android expo-iap exclusion, BILLING removal and Hermes
  guard are retained.
- iOS IPA: `lookmefy-ios-1.0.1-build31/lookmefy-ios-1.0.1-31.ipa`.
- iOS archive: `../mobile/release/lookmefy-ios-1.0.1-build31.xcarchive`;
  portable archive: same path with `.zip` appended.
- `lookmefy-ios-1.0.1-build31.xcarchive.zip`: 69,770,351 bytes; SHA-256:
  `9ea5a6eb285ee098475c8ef8bf9ae44ba84f2ec4a15dbe748db609f06de7cd97`
- `lookmefy-ios-1.0.1-31.ipa`: 44,222,085 bytes; SHA-256:
  `fa8c7991bc5ad69d12cdef8783dc522a72e705ca3832ab7d152cfa380bc0bbcb`
- Binary-verified iOS identity: `com.kratikdhote.lookmefy`, `1.0.1` (31),
  arm64, minimum iOS 15.1, SDK iphoneos26.5/Xcode 26.6. Release Hermes UUID:
  `80D5528F-2C78-3B90-B90F-747E89A9F880` in archive and IPA.
- PASS: Xcode Release archive and local App Store IPA export, archive/IPA
  metadata, deep/strict signatures, Release Hermes engine and ZIP CRC. Archive
  is Apple Development signed; IPA is Apple Distribution signed for team
  LJ48CVC23W. Existing credentials/profile were used; no store upload occurred.
- PASS: JavaScript Babel transform, stale-Hermes-marker repair regression and
  53 focused tests covering product/category/frontend safety, screen cache,
  gestures and authenticated private-image handling. The unrelated
  server-session test was skipped by name.
- Explicit comparison with immediately preceding Android 32 / iOS 30:
  Android APK: 92,687,620 to 92,692,200 bytes (+4,580);
  Android AAB: 74,099,047 to 74,101,380 bytes (+2,333);
  iOS archive ZIP: 69,766,216 to 69,770,351 bytes (+4,135);
  iOS IPA: 44,217,939 to 44,222,085 bytes (+4,146). Android identity/version
  name, SDKs, ABIs, upload key and permissions match except versionCode. iOS
  bundle/version, SDK/minimum OS, usage descriptions, architecture and Release
  Hermes engine match except build number. Baseline artifacts were present and
  verified against the hashes recorded for the immediately preceding release.
- Source limits: root had unrelated Shopify changes; the nested repository was
  dirty before building, with untracked assets/helper and prior release folders.
  Existing work was preserved. Ignored native files and outputs limit Git-only
  reproducibility. Source hashes were checked for drift during building. Binary
  metadata/signing/integrity are directly verified; feature observations remain
  source inferences. No physical-device/simulator smoke run or store-side
  acceptance check was performed for this build.
- Evidence: build/export logs, source status/hashes, decoded manifest, baseline
  comparison, focused test outputs and verification facts in the release folders.
- PDF report: `../../output/pdf/lookmefy-release-1.0.1-android33-ios31-2026-10-22.pdf`
  SHA-256: `4e96d6163c4fbd2830831848103bdad7f994c3fb68d983c5d79d5d3d51a229b4`

## 1.0.1 (Android versionCode 32; iOS build 30; local distribution IPA)

- Built and verified: 2026-10-22 IST. User requested version `1.0.1`;
  Android increments 31 to 32 and iOS increments 29 to 30.
- Source: current local mobile source, including pre-existing dirty and
  untracked files. The build-31 source-hash comparison identifies changed
  App.js, frontendReleaseSafety.js and gestureNavigation.js before release
  metadata updates. Source observations show removal of the repeated
  per-request AI photo popup/checkbox, direct AI request submission and shorter,
  subtler route transitions. Existing private-image recovery, marketplace
  filtering, category assets and continuity changes remain included. These are
  source inferences rather than device-verified behavior.
- Android artifacts: `lookmefy-1.0.1-build32/lookmefy-1.0.1-32.apk` and
  `lookmefy-1.0.1-build32/lookmefy-1.0.1-32.aab`; convenience copies are
  `../mobile/release/lookmefy-v1.0.1-vc32.apk` and corresponding `.aab`.
- APK size: 92,687,620 bytes; SHA-256:
  `d369a94c775edaf15d28de5c94a2a0d08faca0fe3163db1a9ca3800372d2afd0`
- AAB size: 74,099,047 bytes; SHA-256:
  `01df26907fae935036fa2e5fa4a1a5e3fa6d8bd4f80238a22dc82104ffea4c31`
- Binary-verified Android identity: `com.lookmefy.app`, `1.0.1`/32,
  minimum SDK 24, target/compile SDK 36; ABIs arm64-v8a, armeabi-v7a, x86,
  x86_64. Permissions are unchanged from build 31; BILLING remains absent.
- APK/AAB upload certificate SHA-1:
  `E0:47:A9:8F:96:B2:3A:0F:D3:22:32:75:97:59:60:3D:51:05:B0:EB`.
- PASS: Gradle assembleRelease/bundleRelease/lintRelease, expected upload key,
  APK/AAB identity, ZIP CRC, decoded AAB manifest, bundletool 1.18.2 validation
  and APK 16 KB ZIP alignment. The existing lint exception is limited to the
  unused Expo Video background-service notification check; that service is
  absent from the decoded AAB. Other lint/JAR warnings remain in evidence.
- Technical changes for release preparation: increment app.json, native Gradle
  and Xcode build metadata; retain `1.0.1` in app/package/native versions. No
  intentional dependency upgrade or feature-code modification during release
  preparation. Existing Android expo-iap exclusion, BILLING removal and Hermes
  guard are retained.
- iOS IPA: `lookmefy-ios-1.0.1-build30/lookmefy-ios-1.0.1-30.ipa`.
- iOS archive: `../mobile/release/lookmefy-ios-1.0.1-build30.xcarchive`;
  portable archive: same path with `.zip` appended.
- `lookmefy-ios-1.0.1-build30.xcarchive.zip`: 69,766,216 bytes; SHA-256:
  `56dc0ef5fcb6c28caa1e4244d5ec8038348463da44107dbaf5482c75f084a254`
- `lookmefy-ios-1.0.1-30.ipa`: 44,217,939 bytes; SHA-256:
  `9aec4c4aeb204acacc682b0c85ae3247a51d6103c186be011b1eb6df3faaacc5`
- Binary-verified iOS identity: `com.kratikdhote.lookmefy`, `1.0.1` (30),
  arm64, minimum iOS 15.1, SDK iphoneos26.5/Xcode 26.6. Release Hermes UUID:
  `80D5528F-2C78-3B90-B90F-747E89A9F880` in archive and IPA.
- PASS: Xcode Release archive and local App Store IPA export, archive/IPA
  metadata, deep/strict signatures, Release Hermes engine and ZIP CRC. Archive
  is Apple Development signed; IPA is Apple Distribution signed for team
  LJ48CVC23W. Existing credentials/profile were used; no store upload occurred.
- PASS: JavaScript Babel transform, stale-Hermes-marker repair regression,
  47 focused product/category/frontend-safety tests and one focused authenticated
  private-image test. The unrelated server-session test was skipped by name.
- Explicit comparison with immediately preceding Android 31 / iOS 29:
  Android APK: 92,691,120 to 92,687,620 bytes (-3,500);
  Android AAB: 74,101,059 to 74,099,047 bytes (-2,012);
  iOS archive ZIP: 69,767,986 to 69,766,216 bytes (-1,770);
  iOS IPA: 44,219,733 to 44,217,939 bytes (-1,794). Android identity/version
  name, SDKs, ABIs, upload key and permissions match except versionCode. iOS
  bundle/version, SDK/minimum OS, usage descriptions, architecture and Release
  Hermes engine match except build number. Baseline artifacts were present and
  verified against the hashes recorded for the immediately preceding release.
- Source limits: root had unrelated Shopify changes; the nested repository was
  dirty before building, with untracked assets/helper and prior release folders.
  Existing work was preserved. Ignored native files and outputs limit Git-only
  reproducibility. Source hashes were checked for drift during building. Binary
  metadata/signing/integrity are directly verified; feature observations remain
  source inferences. No physical-device/simulator smoke run or store-side
  acceptance check was performed for this build.
- Evidence: build/export logs, source status/hashes, decoded manifest, baseline
  comparison, focused test outputs and verification facts in the release folders.
- PDF report: `../../output/pdf/lookmefy-release-1.0.1-android32-ios30-2026-10-22.pdf`
  SHA-256: `d71ecf6e101fa587c6f37f15eed2addac4ea8f78fa2fab919ba46c9b84e13e16`

## 1.0.1 (Android versionCode 31; iOS build 29; local distribution IPA)

- Built and verified: 2026-10-22 IST. User requested version `1.0.1`;
  Android increments 30 to 31 and iOS increments 28 to 29.
- Source: current local mobile source, including pre-existing dirty and
  untracked files. Comparison with the prior release source-hash inventory
  identifies changed App.js, products.js, privateMediaRecovery.js and assets.js.
  Source observations: authenticated private-image byte recovery with image
  type/size validation, marketplace product filtering/app integration and asset
  map updates. Earlier category assets/continuity/navigation changes are retained.
  These observations and unit tests do not establish device behavior.
- Android artifacts: `lookmefy-1.0.1-build31/lookmefy-1.0.1-31.apk` and
  `lookmefy-1.0.1-build31/lookmefy-1.0.1-31.aab`; convenience copies are
  `../mobile/release/lookmefy-v1.0.1-vc31.apk` and corresponding `.aab`.
- APK size: 92,691,120 bytes; SHA-256:
  `e02b668360cd19acde9fb319b12fef83e74e9bc7455fd50dbf2836c9bbacc5f3`
- AAB size: 74,101,059 bytes; SHA-256:
  `910664a7a67e1c9add04e8d2131b35aa957845bea8cae886d940a3a5029cc246`
- Binary-verified Android identity: `com.lookmefy.app`, `1.0.1`/31,
  minimum SDK 24, target/compile SDK 36; ABIs arm64-v8a, armeabi-v7a, x86,
  x86_64. Permissions unchanged from build 30; BILLING remains absent.
- APK/AAB upload certificate SHA-1:
  `E0:47:A9:8F:96:B2:3A:0F:D3:22:32:75:97:59:60:3D:51:05:B0:EB`.
- PASS: Gradle assembleRelease/bundleRelease/lintRelease, expected upload key,
  APK/AAB identity, ZIP CRC, decoded AAB manifest, bundletool 1.18.2 validation
  and APK 16 KB ZIP alignment. Existing lint exception is limited to the unused
  Expo Video background-service notification check; that service is absent in
  the decoded AAB. Other lint/JAR warnings are retained in evidence.
- Technical changes for release preparation: increment app.json, native Gradle
  and Xcode build metadata; retain `1.0.1` in app/package/native versions. No
  intentional dependency upgrade or feature-code modification during preparation.
  Existing Android expo-iap exclusion, BILLING removal and Hermes guard retained.
- iOS IPA: `lookmefy-ios-1.0.1-build29/lookmefy-ios-1.0.1-29.ipa`.
- iOS archive: `../mobile/release/lookmefy-ios-1.0.1-build29.xcarchive`;
  portable archive: same path with `.zip` appended.
- `lookmefy-ios-1.0.1-build29.xcarchive.zip`: 69,767,986 bytes; SHA-256:
  `393945b4c5ef7e015969d7dc9b3e7e32fe9fed17419327b57af2e00259dff250`
- `lookmefy-ios-1.0.1-29.ipa`: 44,219,733 bytes; SHA-256:
  `6c4e21f5aa94470113fca8f86e41af5b60b513c0d6c79883e0deefa18d085fec`
- Binary-verified iOS identity: `com.kratikdhote.lookmefy`, `1.0.1` (29),
  arm64, minimum iOS 15.1, SDK iphoneos26.5/Xcode 26.6. Release Hermes UUID:
  `80D5528F-2C78-3B90-B90F-747E89A9F880` in archive and IPA.
- PASS: Xcode Release archive and local App Store IPA export, archive/IPA metadata,
  deep/strict signatures, Release Hermes engine and ZIP CRC. Archive is Apple
  Development signed; IPA is Apple Distribution signed for team LJ48CVC23W.
  Export used existing signing credentials/profile; no store upload occurred.
- PASS: JavaScript Babel transform, stale-Hermes-marker repair regression,
  eleven product/category tests and one focused authenticated private-image test.
  The unrelated server-session test was skipped by name selection.
- Explicit comparison with immediately preceding Android 30 / iOS 28:
  Android APK: 92,671,948 to 92,691,120 bytes (+19,172);
  Android AAB: 74,089,216 to 74,101,059 bytes (+11,843);
  iOS archive ZIP: 69,755,520 to 69,767,986 bytes (+12,466);
  iOS IPA: 44,207,255 to 44,219,733 bytes (+12,478). Android identity/version
  name, SDKs, ABIs, upload key and permissions match except versionCode. iOS
  bundle/version, SDK/minimum OS, usage descriptions, architecture and Release
  Hermes engine match except build number. Baseline hashes and detailed binary
  comparisons are recorded in verification facts and the PDF report.
- Source limits: nested repository was dirty before building, with untracked
  assets/helper and prior release directories. Root started clean. Existing work
  was preserved. Ignored native files and outputs limit Git-only reproducibility.
  Source hashes were checked for drift during building. Preceding Android pair,
  iOS archive ZIP and IPA were present and verified against recorded hashes.
  Binary metadata/signing/integrity are directly verified; feature observations
  remain source inferences. No physical-device/simulator smoke run or store-side
  acceptance check was performed for this build.
- Evidence: build/export logs, source status/hashes, decoded manifest, baseline
  comparison, focused test outputs and verification facts in the release folders.
- PDF report: `../../output/pdf/lookmefy-release-1.0.1-android31-ios29-2026-10-22.pdf`
  SHA-256: `c137a5d9f2a719bb4c8a59bafdf81ab26f51f43318b00bb3fd7af17ee1fab03d`

## 1.0.1 (Android versionCode 30; iOS build 28; local distribution IPA)

- Built and verified: 2026-10-21 IST. Requested semantic version remains
  `1.0.1`; Android increments 29 to 30 and iOS increments 27 to 28.
- Source: current local mobile source including pre-existing dirty App.js,
  category presentation/assets, navigation transitions and category continuity
  helper. User-facing differences are source observations; no complete runtime
  comparison or device/TestFlight smoke test is claimed.
- Android artifacts: `lookmefy-1.0.1-build30/lookmefy-1.0.1-30.apk` and
  `lookmefy-1.0.1-build30/lookmefy-1.0.1-30.aab`; convenience copies are
  `../mobile/release/lookmefy-v1.0.1-vc30.apk` and corresponding `.aab`.
- APK size: 92,671,948 bytes; SHA-256:
  `67699108b90ef5dbcb7f5843bfe9be6af9c6738090f127df15ac6fc41683099b`
- AAB size: 74,089,216 bytes; SHA-256:
  `39add5f00b907f7cdbc29e5e1f188120a4745098273d2996d2c062c9748ad250`
- APK and decoded AAB confirm `com.lookmefy.app`, `1.0.1`/30,
  minimum SDK 24, target/compile SDK 36; ABIs arm64-v8a, armeabi-v7a, x86,
  x86_64. Permissions unchanged from build 29; BILLING remains absent.
- APK/AAB upload certificate SHA-1:
  `E0:47:A9:8F:96:B2:3A:0F:D3:22:32:75:97:59:60:3D:51:05:B0:EB`.
- PASS: Gradle assembleRelease/bundleRelease/lintRelease, expected upload key,
  APK/AAB identity, ZIP CRC, decoded AAB permissions, bundletool 1.18.2 validate
  and APK 16 KB ZIP alignment. Lint contains a documented exception limited to
  Expo Video's optional background-service notification warning; the service is
  absent from the decoded AAB. Other lint/JAR warnings are retained in evidence.
- Technical work: align app.json, package version, native Android and Xcode
  metadata; fix stale iOS marketing version; install declared missing Expo Blur
  15.0.8; refresh CocoaPods to Expo IAP 5.8.3/OpenIAP 3.6.1; restore Android
  expo-iap autolinking exclusion. Existing BILLING removal and Hermes guard remain.
- iOS IPA: `lookmefy-ios-1.0.1-build28/lookmefy-ios-1.0.1-28.ipa`.
- iOS archive: `../mobile/release/lookmefy-ios-1.0.1-build28.xcarchive`;
  portable archive: same path with `.zip` appended.
- `lookmefy-ios-1.0.1-build28.xcarchive.zip`: 69,755,520 bytes; SHA-256:
  `9a72f41b9d6d7854daee4416a30ce1df611e0e451843b68566acfa96a5d301fd`
- `lookmefy-ios-1.0.1-28.ipa`: 44,207,255 bytes; SHA-256:
  `b5f7ef05cb4067a7668c21fb0917a8fb59dfffbf17bd1d225dc0de35985b1cb7`
- iOS binary identity: `com.kratikdhote.lookmefy`, `1.0.1` (28), arm64,
  minimum iOS 15.1, SDK iphoneos26.5/Xcode 26.6. Release Hermes UUID:
  `80D5528F-2C78-3B90-B90F-747E89A9F880` in archive and IPA.
- PASS: Xcode Release archive, archive/IPA metadata, deep/strict signatures,
  Release Hermes engine, ZIP CRC and stale-Hermes-marker regression check.
  Archive is Apple Development signed; IPA is Apple Distribution signed for
  team LJ48CVC23W. Initial export failed due to a cached profile/certificate
  mismatch; local export succeeded after Xcode provisioning refresh.
- Explicit comparison with preceding Android 29 / iOS 27:
  Android APK changes from 85,629,415 to 92,671,948 bytes (+7,042,533);
  Android AAB changes from 67,387,838 to 74,089,216 bytes (+6,701,378);
  iOS archive ZIP changes from 62,575,125 to 69,755,520 bytes (+7,180,395).
  Android identity/version name, SDKs, ABIs, signing key and permissions match
  baseline except versionCode. iOS bundle/version, SDK/minimum OS, usage strings,
  architecture and Release Hermes UUID match except build number. No build-27
  IPA exists, so an IPA-to-IPA comparison is unavailable.
- Source limits: nested repository was dirty before building; local untracked
  assets/helper are included. Root had unrelated staged changes by final checks,
  which were preserved. Ignored native files/release outputs limit Git-only
  reproducibility. Both preceding Android artifacts and iOS archive were available.
  Binary metadata/signing/integrity are directly verified; source feature
  observations are not runtime evidence. No store upload/publication occurred.
- Evidence: build/dependency/export logs, source status/hashes, decoded manifests,
  verification facts and check outputs in both versioned release directories.
- PDF report: `../../output/pdf/lookmefy-release-1.0.1-android30-ios28-2026-10-21.pdf`
  SHA-256: `dbb78c5333cc9b94ec931080f400b246690ca3d5ee1f2513156e74708a0a665b`

## 1.0.1 (Android versionCode 29; iOS build 27 archive; fixes for build 28/26)

- Built and verified: 2026-10-19 IST. Version remains 1.0.1 on both platforms;
  Android increments 28 to 29 and iOS increments 26 to 27.
- Android artifacts: `lookmefy-1.0.1-build29/lookmefy-1.0.1-29.apk` and
  `lookmefy-1.0.1-build29/lookmefy-1.0.1-29.aab`; convenience copies are
  `../mobile/release/lookmefy-v1.0.1-vc29.apk` and the corresponding `.aab`.
- APK size: 85,629,415 bytes; SHA-256:
  `06f0bc634db75fd40ea7ea3478a8eeac283a1422b07f79242c92680d7f503e4b`
- AAB size: 67,387,838 bytes; SHA-256:
  `d0c325c31d8986e7067c304a90d59663c807ef58368bd287576127b966e084e2`
- Android correction: remove unused `com.android.vending.BILLING`. expo-iap
  is excluded from Android autolinking, no Google billing dependency resolves,
  but its config plugin left this permission, resulting in the reported Play
  legacy-AIDL error. Persistent config-plugin removal and blockedPermissions
  prevent reintroduction. No fake billing-version metadata was added.
- APK and decoded AAB confirm 1.0.1/code 29 and absent BILLING permission;
  no other permission changes from code 28. Same package `com.lookmefy.app`,
  minimum SDK 24, target/compile 36, ABIs arm64-v8a/armeabi-v7a/x86/x86_64,
  replacement upload-key SHA-1
  `E0:47:A9:8F:96:B2:3A:0F:D3:22:32:75:97:59:60:3D:51:05:B0:EB`.
- Gradle assembleRelease/bundleRelease, release lint, APK/AAB identity and signing,
  expected upload key, ZIP CRC and APK 16 KB alignment passed. The new verifier
  rejects build 28's stale billing permission and accepts build 29. Expo config
  introspection and dependency inspection passed. Bundletool/Play server
  validation was not run. APK/AAB are respectively 16/26 bytes smaller than 28.
- iOS archive: `../mobile/release/lookmefy-ios-1.0.1-build27.xcarchive`;
  portable ZIP: `../mobile/release/lookmefy-ios-1.0.1-build27.xcarchive.zip`.
- iOS archive ZIP: 62,575,125 bytes; SHA-256:
  `5bb56077447fcdc350d5b6f2c14ab43859af7f87c4c490e77b22a9ae1f473a8c`
- iOS correction: build 26 packaged a Debug Hermes engine in a Release app.
  The crash was reproduced in a Release simulator build; LLDB captured native
  EXC_BAD_ACCESS in Hermes runtime initialization. Debug UUID in archive 26:
  `3CB559A9-19A5-3571-886A-934297F3E6E6`. Build 27 contains the pinned Release
  engine UUID `80D5528F-2C78-3B90-B90F-747E89A9F880`.
- Added a Podfile build-phase guard that compares device/simulator engine and
  header hashes with pinned React Native 0.81.5 artifacts before trusting the
  configuration marker. Regression test repairs Debug files with a stale Release
  marker and confirms idempotence. New iOS verifier rejects the faulty 26 archive.
- Verified iOS bundle `com.kratikdhote.lookmefy`, 1.0.1 (27), arm64, minimum
  iOS 15.1, SDK iphoneos26.5, Xcode 26.6. Archive is Apple Development signed
  for team LJ48CVC23W and passed strict/deep codesign verification. Archive ZIP
  CRC passed. Same bundle/version/SDK/minimum OS and usage strings as build 26;
  archive file bytes decrease by 2,033,728 due to the configuration correction.
- Corrected iOS simulator Release renders home and passes three cold launches
  without Metro; a later check confirms continued execution. Home screenshot,
  pre-fix crash stack and smoke evidence are in `lookmefy-ios-1.0.1-build27/`.
- **App Store IPA export remains blocked:** no iOS Distribution signing identity
  is currently available in Keychain and Xcode account credentials are missing.
  Expo has no saved iOS credentials for this project. No new distribution IPA
  was produced. Restore distribution signing access, then export this archive.
  No certificates were created or revoked; no store upload/publication occurred.
- User-facing change: repair the reproduced startup crash and Android billing
  declaration. No feature or checkout-flow change was made. No physical-device
  or TestFlight retest was performed; the user's device stack was not supplied.
- Both repositories had existing dirty changes, which remain included. Native
  Android files are ignored in the nested repository, limiting exact source
  comparison. Prior Android pair and iOS archive/IPA were available. Binary facts
  and reproduced simulator behavior are verified; broader source-history feature
  differences are not inferred as verified behavior.
- Evidence: Android directory contains verification facts/signing/manifest/build/
  dependency/source records. iOS directory contains archive verification facts,
  regression/simulator evidence, debugger stack, build and failed-export logs.
- PDF report: `../../output/pdf/lookmefy-fix-release-1.0.1-android29-ios27-2026-10-19.pdf`
  (SHA-256 `281019a052b20614d0a8ed2df714cfd1b59eff4c2dd9a4af5e572594186a1535`)

## 1.0.1 (Android versionCode 28; iOS build 26; local signed, not uploaded)

- Built and verified: 2026-10-19 IST. Both platforms use version 1.0.1 at
  the user's explicit request. Android increments 27 to 28 while its versionName
  changes from 1.0.3 to 1.0.1; iOS increments 25 to 26 and retains 1.0.1.
- Android artifacts: `lookmefy-1.0.1-build28/lookmefy-1.0.1-28.apk` and
  `lookmefy-1.0.1-build28/lookmefy-1.0.1-28.aab`.
- Android convenience copies: `../mobile/release/lookmefy-v1.0.1-vc28.apk`
  and `../mobile/release/lookmefy-v1.0.1-vc28.aab`.
- APK size: 85,629,431 bytes; SHA-256:
  `4af175f9b55787123f036d369ac88df2fb7a6c8d2586b224b698646ce2db9aff`
- AAB size: 67,387,864 bytes; SHA-256:
  `0a3e14a6437eed0940290f53e2f7b54757c0035e3497b066ee8f4872249ca906`
- Binary-verified Android package `com.lookmefy.app`, versionName `1.0.1`,
  versionCode `28`; minimum SDK 24, target/compile SDK 36; ABIs arm64-v8a,
  armeabi-v7a, x86, x86_64. Permissions unchanged from code 27, including
  RECORD_AUDIO and READ/WRITE_EXTERNAL_STORAGE in the native manifest.
- APK/AAB signed with the same replacement upload key as code 27, SHA-1
  `E0:47:A9:8F:96:B2:3A:0F:D3:22:32:75:97:59:60:3D:51:05:B0:EB`.
- Gradle 8.13 assembleRelease/bundleRelease and release lint passed. APK signing,
  AAB JAR signature/key, APK/AAB version identity, ZIP CRC and APK 16 KB alignment
  checks passed. AAB protobuf manifest was decoded; bundletool validation was
  not run. APK is 23,760 bytes larger and AAB 13,604 bytes larger than code 27.
- iOS IPA: `lookmefy-ios-1.0.1-build26/lookmefy-ios-1.0.1-26.ipa`.
- iOS archive: `../mobile/release/lookmefy-ios-1.0.1-build26.xcarchive`;
  portable ZIP: `../mobile/release/lookmefy-ios-1.0.1-build26.xcarchive.zip`.
- iOS IPA: 38,184,781 bytes; SHA-256:
  `72f10b2684e797ca968f578aaa81d31206cc66284e45f5c8ac867e3fdb11c432`
- iOS archive ZIP: 63,182,215 bytes; SHA-256:
  `22b1d2317253c56ce3c66b7aac002babc5270cec18cee888462d615d7a868bf4`
- Binary-verified iOS bundle `com.kratikdhote.lookmefy`, version `1.0.1`,
  build `26`, arm64, minimum iOS 15.1, SDK iphoneos26.5. Xcode 26.6 Release
  archive and local App Store Connect IPA export succeeded. Archive is Apple
  Development signed; IPA is Apple Distribution signed for team LJ48CVC23W.
  Both passed deep/strict codesign verification with system trust services.
  IPA and archive ZIP passed CRC checks. IPA is for App Store Connect distribution.
- Compared with iOS build 25: build increment; same semantic version, bundle ID,
  minimum OS, SDK and camera/photo usage strings. Archive file bytes increased
  by 92,994; no baseline build-25 IPA was present for IPA-to-IPA comparison.
- No feature changes were intentionally made in this task. Existing dirty mobile
  source is included. Source-history observations of try-on/home/navigation work
  are inferences, not binary-verified new behavior. Root and nested repositories
  were dirty before building; native Android sources are ignored by the nested
  repository, limiting exact source comparison. Prior Android APK/AAB and iOS
  build-25 archive were available and inspected.
- No store upload/publication, device smoke test or App Store server validation
  was performed. Initial SDK/cache/trust sandbox issues were resolved before
  final build/signature verification.
- Evidence: Android and iOS versioned release directories contain
  `verification-facts.json`, `VERIFICATION.txt` and build logs; Android also has
  decoded manifest, ZIP alignment and source-status/history evidence.
- PDF report: `../../output/pdf/lookmefy-release-1.0.1-android28-ios26-2026-10-19.pdf`
  (SHA-256 `f0d83ca89d4f29d95c01836f275bc6fa1c91fda6a6a1bf3071a4af7130dc91aa`)

## 1.0.3 (Android versionCode 27; local signed, not uploaded)

- Built and verified: 2026-10-15 IST. VersionCode 27 explicitly requested;
  preceding recorded baseline is version 1.0.2 / code 25. No code-26 release
  is recorded. VersionName 1.0.3 follows the patch increment from that baseline.
- Artifacts: `lookmefy-1.0.3-build27/lookmefy-1.0.3-27.aab` and
  `lookmefy-1.0.3-build27/lookmefy-1.0.3-27.apk`.
- Convenience copies: `../mobile/release/lookmefy-v1.0.3-vc27.aab` and
  `../mobile/release/lookmefy-v1.0.3-vc27.apk`.
- AAB size: 67,374,260 bytes; SHA-256:
  `8280a828669c09c4b4c4212e7e82ca5ef6d9428a3d5ee2cf826464e9c0c3d813`
- APK size: 85,605,671 bytes; SHA-256:
  `e1fb588d770cb1e527a11febaf08f344dd1f09c70494559c3901d468e0055a15`
- Binary-verified package `com.lookmefy.app`, versionName `1.0.3`, code `27`;
  minimum SDK 24, target/compile SDK 36; ABIs arm64-v8a, armeabi-v7a, x86, x86_64.
- Signed using the replacement EAS upload key, SHA-1
  `E0:47:A9:8F:96:B2:3A:0F:D3:22:32:75:97:59:60:3D:51:05:B0:EB`.
  The user-supplied Play confirmation schedules activation for 2026-10-17
  07:17 UTC / 12:47 IST. No Play upload or publication was performed.
- Private EAS keystore, credentials JSON and Gradle signing properties were
  downloaded/saved locally with private permissions and are excluded from Git.
- Gradle 8.13 assembleRelease and bundleRelease passed. APK signature,
  AAB JAR signature, expected certificate, binary identity, ZIP CRC checks,
  bundletool validation and APK 16 KB zipalign verification passed.
- Binary permission comparison: no additions; FOREGROUND_SERVICE and
  FOREGROUND_SERVICE_MEDIA_PLAYBACK removed compared with code 25. Microphone
  and external-storage permissions remain present in the native binary.
- Compared with code 25: semantic version/code increase, target/compile SDK
  35 to 36, replacement signing certificate, same ABI set, and changed sizes.
  No feature changes were intentionally made in this task; existing source
  commits indicate try-on/home/navigation/style-rail updates, an inference
  rather than binary-verified behavior. No device smoke test was performed.
- Dirty root and nested working trees existed before this task, including
  version/signing and iOS changes. Native Android files are ignored in the
  nested repository, limiting exact source comparison. Both baseline artifacts
  were available and binary-inspected.
- Evidence: `lookmefy-1.0.3-build27/verification-facts.json`, `VERIFICATION.txt`,
  and decoded `AndroidManifest.xml` in the same release directory.
- PDF report: `../../output/pdf/lookmefy-android-1.0.3-vc27-local-signed-2026-10-15.pdf`
  (SHA-256 `c8580f93c3c73f188e7018b027b40f9d3b56a0a339740c9dcac77b5398e7fd07`)

## 1.0.2 (Android versionCode 25)

- Release artifacts: `lookmefy-1.0.2-build25/lookmefy-1.0.2-25.apk` and
  `lookmefy-1.0.2-build25/lookmefy-1.0.2-25.aab`
- Convenience copies: `../mobile/release/lookmefy-v1.0.2-vc25.apk` and
  `../mobile/release/lookmefy-v1.0.2-vc25.aab`
- Artifact timestamp: 2026-09-28 IST
- APK size: 83,700,771 bytes; SHA-256:
  `f72050d6d7e86f4925e1d619e51ebedfb3afbd78f0896234e8cbb9bf5b70d317`
- AAB size: 62,595,052 bytes; SHA-256:
  `7aaf5d295819c8320db74c6a2f8c2d5d5c97643e5542b61eb17e98dc6951aa28`
- Package `com.lookmefy.app`; versionName `1.0.2`; versionCode `25`
- Minimum SDK 24; target/compile SDK 35; ABIs: arm64-v8a, armeabi-v7a, x86, x86_64
- APK and AAB upload certificate SHA-1:
  `4C:27:9B:A5:0B:3A:85:11:82:F5:DA:1B:8C:BB:B7:14:60:56:CB:75`
- Permissions match code 24: INTERNET, READ/WRITE_EXTERNAL_STORAGE,
  RECORD_AUDIO, SYSTEM_ALERT_WINDOW, VIBRATE, BILLING, FOREGROUND_SERVICE,
  FOREGROUND_SERVICE_MEDIA_PLAYBACK, CAMERA, ACCESS_NETWORK_STATE, and the
  app dynamic-receiver permission.
- Local Gradle assembleRelease and bundleRelease succeeded. The release pair
  passed package/version/signature/ZIP pre-upload checks and APK alignment.
  A release task without local signing properties failed before producing output.
- PDF report: `../../output/pdf/lookmefy-android-1.0.2-vc25-signing-comparison-2026-09-28.pdf`
  (SHA-256 `ccda4252bd8e92c1406262d489615fed3d71f9dfb6a3a25125f5975d9a86a4c1`)
- No Play upload or device smoke test was performed. The remote EAS credential
  remains different from Play's upload key, and Android release builds without
  local signing properties are blocked until EAS is corrected.

Compared with code 24, this build increments the version and uses Lookmefy's
original Play upload key instead of the debug key. No user-facing change was
intentionally made for this signing correction. The mobile directory is ignored
by the parent Git repository, limiting source-history comparison.

## 1.0.1 (Android versionCode 24; iOS build 24)

- Android release artifacts: `lookmefy-1.0.1-build24/lookmefy-1.0.1-24.apk`
  and `lookmefy-1.0.1-build24/lookmefy-1.0.1-24.aab`
- Android convenience copies: `../mobile/release/lookmefy-v1.0.1-vc24.apk`
  and `../mobile/release/lookmefy-v1.0.1-vc24.aab`
- iOS archive: `../mobile/release/lookmefy-ios-1.0.1-build24.xcarchive`
- Artifact timestamp: 2026-09-14 15:51 IST
- APK size: 83,822,286 bytes
- AAB size: 62,653,463 bytes
- APK SHA-256:
  `2985e4a80d90e47ca27299520978a2075f0eaaf7e8c9b40455cbc113fb87ffa5`
- AAB SHA-256:
  `4802bee40dfb39401d8645e0198a7ae965985045943b3486f0842a64c96c50d8`
- APK package: `com.lookmefy.app`
- APK version name: `1.0.1`
- APK minimum SDK: 24; target SDK: 35; compile SDK: 35
- Native ABIs: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`
- App icon: original Lookmefy LM/hanger launcher icon restored on both iOS and
  Android; the accidental Skillomate icon was removed from the build-24
  artifacts.
- Manifest permissions: `android.permission.INTERNET`,
  `android.permission.READ_EXTERNAL_STORAGE`,
  `android.permission.RECORD_AUDIO`,
  `android.permission.SYSTEM_ALERT_WINDOW`, `android.permission.VIBRATE`,
  `android.permission.WRITE_EXTERNAL_STORAGE`, `com.android.vending.BILLING`,
  `android.permission.FOREGROUND_SERVICE`,
  `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK`,
  `android.permission.CAMERA`, `android.permission.ACCESS_NETWORK_STATE`, and
  `com.lookmefy.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`
- APK/AAB signing certificate SHA-256:
  `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`
- Android signing note: these local artifacts are debug-signed with the local
  debug keystore. The AAB verifies with jarsigner but reports expected
  self-signed certificate and no-timestamp warnings, so the artifacts are
  verified local outputs but not Play-upload-ready.
- iOS bundle identifier: `com.kratikdhote.lookmefy`
- iOS marketing version: `1.0.1`; build number: `24`; minimum iOS: 15.1
- iOS archive facts: arm64 app archive, 142,860 KiB, 125 files
- iOS signing note: the archive is Apple Development signed by
  `Apple Development: Ali Hussain Khan (JGXF4R39DG)`, team `LJ48CVC23W`; it is
  a verified local archive, not a TestFlight/App Store distribution export.
- PDF report:
  `output/pdf/lookmefy-release-difference-1.0.1-android24-ios24.pdf`
- PDF SHA-256:
  `cb2b70093923fd2a0e3ba0a9b77a97c0e071258b46e74a5488ada142e3234b84`
- Verification notes: Expo public config confirmed app name `Lookmefy`, slug
  `lookmefy`, Android package `com.lookmefy.app`, version `1.0.1`, Android
  versionCode `24`, iOS bundle identifier `com.kratikdhote.lookmefy`, and iOS
  build `24`; local Gradle `assembleRelease` and `bundleRelease` completed
  successfully; `aapt`, `apksigner`, and `jarsigner` inspected Android
  artifacts; `xcodebuild archive` completed successfully from
  `FitLook.xcworkspace`; the embedded iOS AppIcon60x60@2x was rendered and
  visually confirmed as the Lookmefy LM/hanger icon.
- Source/worktree note: `fit-look-APP/` is ignored by the root `.gitignore`, so
  binary confidence comes from direct artifact verification rather than Git
  status. Root Git status includes the prior build-23 PDF as an untracked file.

The immediately preceding recorded baseline was version `1.0.1`, Android
versionCode `23`, iOS build `23`. This release intentionally keeps the semantic
version at `1.0.1` per user request, increments only the Android versionCode
and iOS build number to `24`, and restores the original Lookmefy icon instead
of the accidental Skillomate icon.

## 1.0.1 (Android versionCode 23; iOS build 23)

- Android release artifacts: `lookmefy-1.0.1-build23/lookmefy-1.0.1-23.apk`
  and `lookmefy-1.0.1-build23/lookmefy-1.0.1-23.aab`
- Android convenience copies: `../mobile/release/lookmefy-v1.0.1-vc23.apk`
  and `../mobile/release/lookmefy-v1.0.1-vc23.aab`
- Re-verification report generated on 2026-10-01 for an explicit
  out-of-sequence request to deliver Android versionName `1.0.1` and
  versionCode `23`:
  `../../output/pdf/lookmefy-android-1.0.1-vc23-reverified-2026-10-01.pdf`
  (SHA-256 `d61055c8b26eb7fce2d7fef621738d4b6b9538cf1f982d683b7dcbc87efc9504`).
  The APK/AAB were binary-verified again, but a fresh rebuild was blocked
  because `LOOKMEFY_KEYSTORE_PROPERTIES` and the Play upload keystore were not
  available in the shell.
- iOS archive: `../mobile/release/lookmefy-ios-1.0.1-build23.xcarchive`
- Artifact timestamp: 2026-09-14 15:18 IST
- APK size: 83,871,438 bytes
- AAB size: 62,703,067 bytes
- APK SHA-256:
  `19a6001f894b76905e5bbb825094342e3cbcaae87ba9b08b534bb8b1ea0a702c`
- AAB SHA-256:
  `3753d042f6964cf5b9fd10c4d38f5df583410df9a522a310545458076a4a649d`
- APK package: `com.lookmefy.app`
- APK version name: `1.0.1`
- APK minimum SDK: 24; target SDK: 35; compile SDK: 35
- Native ABIs: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`
- Manifest permissions: `android.permission.INTERNET`,
  `android.permission.READ_EXTERNAL_STORAGE`,
  `android.permission.RECORD_AUDIO`,
  `android.permission.SYSTEM_ALERT_WINDOW`, `android.permission.VIBRATE`,
  `android.permission.WRITE_EXTERNAL_STORAGE`, `com.android.vending.BILLING`,
  `android.permission.FOREGROUND_SERVICE`,
  `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK`,
  `android.permission.CAMERA`, `android.permission.ACCESS_NETWORK_STATE`, and
  `com.lookmefy.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`
- APK/AAB signing certificate SHA-256:
  `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`
- Android signing note: these local artifacts are debug-signed with the local
  debug keystore. The AAB verifies with jarsigner but reports expected
  self-signed certificate and no-timestamp warnings, so the artifacts are
  verified local outputs but not Play-upload-ready.
- iOS bundle identifier: `com.kratikdhote.lookmefy`
- iOS marketing version: `1.0.1`; build number: `23`; minimum iOS: 15.1
- iOS archive facts: arm64 app archive, 143,464 KiB, 125 files
- iOS signing note: the archive is Apple Development signed by
  `Apple Development: Ali Hussain Khan (JGXF4R39DG)`, team `LJ48CVC23W`; it is
  a verified local archive, not a TestFlight/App Store distribution export.
- PDF report:
  `output/pdf/lookmefy-release-difference-1.0.1-android23-ios23.pdf`
- PDF SHA-256:
  `3642ac23e4f549e8a24eeaf4544e010577b41ef00238f6af14bbfe1ef9d6543f`
- Verification notes: Expo public config confirmed app name `Lookmefy`, slug
  `lookmefy`, Android package `com.lookmefy.app`, version `1.0.1`, Android
  versionCode `23`, iOS bundle identifier `com.kratikdhote.lookmefy`, and iOS
  build `23`; local Gradle `assembleRelease` and `bundleRelease` completed
  successfully; `aapt`, `apksigner`, and `jarsigner` inspected Android
  artifacts; `xcodebuild archive` completed successfully from
  `FitLook.xcworkspace`.
- Source/worktree note: `fit-look-APP/` is ignored by the root `.gitignore`, so
  binary confidence comes from direct artifact verification rather than Git
  status. The user-supplied icon was applied to Expo icon assets, the iOS app
  icon catalog, and Android launcher resources.

The immediately preceding recorded baseline was version `1.0.3`, Android
versionCode `22`, iOS build `23`. This release increments Android versionCode
by one but intentionally sets the semantic version back to `1.0.1` per user
request, keeps iOS build `23`, and changes the launcher icon on both platforms.
The older duplicate Xcode recent project was identified as
`/Users/kratik/Desktop/fitlookapp/Fitlook-main`; automated deletion was blocked
because it is a large project containing environment/uploads data.

## 1.0.3 (Android versionCode 22; iOS build 23)

- Android release artifacts: `lookmefy-1.0.3-build22/lookmefy-1.0.3-22.apk` and
  `lookmefy-1.0.3-build22/lookmefy-1.0.3-22.aab`
- Android convenience copies: `../mobile/release/lookmefy-v1.0.3-vc22.apk`
  and `../mobile/release/lookmefy-v1.0.3-vc22.aab`
- iOS archive: `../mobile/release/lookmefy-ios-1.0.3-build23.xcarchive`
- Artifact timestamp: 2026-09-11 18:33 IST
- APK size: 84,268,750 bytes
- AAB size: 63,073,671 bytes
- APK SHA-256: `fc265a6181a70908dcb9d0d79835581dfc07943a00794d711394084ac3994d9c`
- AAB SHA-256: `3eaac6bf1d01ec3aa1b83c960d5c8fcdc713cd9efe1a48623e50e5fc204ca5ff`
- APK package: `com.lookmefy.app`
- APK version name: `1.0.3`
- APK minimum SDK: 24; target SDK: 35; compile SDK: 35
- Native ABIs: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`
- APK/AAB signing certificate SHA-256:
  `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`
- Android signing note: these local artifacts are debug-signed with the local
  debug keystore, so they are verified build outputs but not Play-upload-ready.
  EAS remote Android versionCode was set to `22`, but EAS cloud builds were not
  started because that requires explicit approval to upload source/configuration
  to Expo.
- iOS bundle identifier: `com.kratikdhote.lookmefy`
- iOS marketing version: `1.0.3`; build number: `23`; minimum iOS: 15.1
- iOS archive facts: arm64 app archive, 143,664 KiB, 125 files
- iOS signing note: the archive is Apple Development signed by
  `Apple Development: Ali Hussain Khan (JGXF4R39DG)`, team `LJ48CVC23W`; it is
  a verified local archive, not a TestFlight/App Store distribution export.
- PDF report:
  `output/pdf/lookmefy-release-report-1.0.3-android22-ios23.pdf`
- PDF SHA-256:
  `3bc3fdffc5005cfb10850572944e78ac2add07179042e23c3e8ccde4e4bdde2a`
- Verification notes: Babel transform of `App.js` passed, Expo public config
  confirmed version `1.0.3`, Android versionCode `22`, and iOS build `23`;
  local Gradle `assembleRelease` and `bundleRelease` completed successfully;
  `aapt`, `apksigner`, and `jarsigner` inspected Android artifacts; `xcodebuild
  archive` completed successfully from `FitLook.xcworkspace`.

The preceding binary-verified baseline was version `1.0.2`, Android
versionCode `21`, signed through EAS-managed release/upload credentials. This
release increments the patch version and Android versionCode, adds iOS build
`23`, and fixes Android hardware back navigation so a single non-home route
returns to Home instead of exiting the app.

## 1.0.2 (Android versionCode 21)

- Release artifacts: `lookmefy-1.0.2-build21/lookmefy-1.0.2-21.apk` and
  `lookmefy-1.0.2-build21/lookmefy-1.0.2-21.aab`
- Convenience copies: `../mobile/release/lookmefy-v1.0.2-vc21.apk` and
  `../mobile/release/lookmefy-v1.0.2-vc21.aab`
- Artifact timestamp: 2026-09-11 16:08 IST
- EAS project: `@office50505/lookmefy`
- EAS AAB build: `2d1707f4-a722-4605-838f-6aea4f1893a0`
  (`https://expo.dev/accounts/office50505/projects/lookmefy/builds/2d1707f4-a722-4605-838f-6aea4f1893a0`)
- EAS APK build: `78a47624-4eff-458f-a3ed-3d74a89b131a`
  (`https://expo.dev/accounts/office50505/projects/lookmefy/builds/78a47624-4eff-458f-a3ed-3d74a89b131a`)
- APK size: 84,146,515 bytes
- AAB size: 63,014,966 bytes
- APK SHA-256: `78f4c6905b35e7e1973d57628a6ee2a938acc8be25224ac29cb4f1d3622d8392`
- AAB SHA-256: `d117f6757e56d502bb4bf4f10b5a75a78e40aa3b45b1fa965e69caef362dbb5d`
- APK package: `com.lookmefy.app`
- APK version name: `1.0.2`
- APK minimum SDK: 24; target SDK: 35; compile SDK: 35
- Native ABIs: `arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`
- APK/AAB signing certificate SHA-256:
  `b010b9a7b007fc50cecaad78ebff2c5869bde4c14708f2ddadd97f8f63c73d83`
- Signing note: EAS-managed release/upload credentials were used. The release
  build type does not reference `signingConfigs.debug`, and this certificate
  does not match the previous debug certificate from versionCode 20.
- Production API used by EAS builds: `https://api.lookmefy.in/api`
- PDF report: `output/pdf/lookmefy-android-release-report-1.0.2-build21.pdf`
- PDF SHA-256: `c7c2a53ef41ec902dbbebb20a62f7cbcfd4f426dc3c39e5360966c7db875cbc1`
- Verification notes: `npx expo config --type public` confirmed app name
  `Lookmefy`, slug `lookmefy`, package `com.lookmefy.app`, version `1.0.2`,
  and Android versionCode `21`. `npx expo-doctor` reported 17/18 checks passed;
  the remaining warning is the known non-CNG native config sync warning because
  native `android` and `ios` folders exist.

The preceding baseline was version `1.0.1`, Android versionCode `20`, whose
history entry documents debug signing. This release increments the patch
version and versionCode, preserves the same Android package identity, removes
debug signing from the native release build, and produces a Play-upload-ready
production AAB plus an installable APK for testing.

## 1.0.1 (Android versionCode 20)

- Release artifacts: `lookmefy-1.0.1-build20/lookmefy-1.0.1-20.apk` and
  `lookmefy-1.0.1-build20/lookmefy-1.0.1-20.aab`
- Convenience copies: `../mobile/release/lookmefy-v1.0.1-vc20.apk` and
  `../mobile/release/lookmefy-v1.0.1-vc20.aab`
- iOS archive: `../mobile/release/lookmefy-ios-1.0.1-build22.xcarchive`
- Artifact timestamp: 2026-09-08 14:14 IST
- APK size: 84,135,051 bytes
- AAB size: 63,008,131 bytes
- APK SHA-256: `64491b9b0966ea8fa90e87f9a529ac75416e2dec91d495f98483b9b785ce758c`
- AAB SHA-256: `c2f661516fad61a544c70812e4195585bfff8d453feeb7b869b2eedf1216ef33`
- APK package: `com.lookmefy.app`
- APK minimum SDK: 24; target SDK: 35; compile SDK: 35
- APK signing certificate SHA-256:
  `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`
- Signing note: this local build is debug-signed and does not match the
  versionCode 19 release certificate.
- PDF report: `output/pdf/lookmefy-release-difference-android-vc20-ios-build22.pdf`
- PDF SHA-256: `39b9a291566699e124573272281166aeef662db0c3bd7059aaef4361b2719dc5`

The preceding binary-verified baseline is Android versionCode 19 with the same
`1.0.1` version name. The iOS build metadata is version `1.0.1`, build `22`, but
the local archive is unsigned and not TestFlight-ready from this machine.

## 1.0.1 (Android versionCode 19)

- Release artifacts: `lookmefy-1.0.1-build19/lookmefy-1.0.1-19.apk` and
  `lookmefy-1.0.1-build19/lookmefy-1.0.1-19.aab`
- Artifact timestamp: 2026-09-03 14:15 IST
- APK SHA-256: `e52ec82afc449eb8380a5854f24d98a9a03e66ee5b56ba0b88fe47066677615b`
- AAB SHA-256: `c7249aac69a21106ebe91102ebac51b6304144dcd0a63e22ea1848001dc2ffd1`
- APK package: `com.lookmefy.app`
- APK minimum SDK: 24; target SDK: 36; compile SDK: 36
- APK signing certificate SHA-256:
  `5f6b3f0a310b9677899f16708948e7c8874b81970475d429df8764eede218bcb`
- PDF report: `output/pdf/lookmefy-android-release-report-1.0.1-build19.pdf`
- PDF SHA-256: `ad2c9d14b8d6ca6de9fc71b510aae8ef046dcf873c2d3b992f6a64833e09ab71`

The preceding configuration baseline is Android versionCode 18 with the same
`1.0.1` version name. No build-18 APK/AAB is present, so that comparison is
source-history based rather than binary-to-binary verified.

## Next-release default

Unless explicitly overridden by the user, the next Android release after code 35
is version `1.0.3`, Android versionCode `36`, with both APK and AAB artifacts and
a new PDF comparison against this release. The latest iOS build is 33.
