import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { useFonts } from 'expo-font';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { SafeAreaProvider, SafeAreaView as InsetSafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Component, createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  Animated,
  AppState,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  LogBox,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  StatusBar as NativeStatusBar,
  useWindowDimensions,
  View
} from 'react-native';
import { api as sendApi, clearToken, filePart, formatMoney, getToken, imageUrl, saveToken } from './src/api';
import { authenticatedMediaSource, cachedAuthenticatedImageDataUri, cachedPrivateImage, clearPrivateImageCache, privateMediaPath, renewPrivateImageUrl } from './src/privateMediaRecovery';
import { clearScreenSnapshots, readScreenSnapshot, writeScreenSnapshot } from './src/screenDataCache';
import { accountDeletionOutcome, requireGeneratedImage, contentReportReasons, createContentReportClient, reportContentReference, createAiPhotoConsentGuard, sendsPhotosToAi } from './src/frontendReleaseSafety';
import { creditPackageDescription, creditPackageDisplayPrice, creditPurchaseAvailability, creditSubscriptionStatus, knownCreditBalance, paymentCatalogAvailable, recurringPeriodLabel, showMandateTermsForPlatform } from './src/creditPresentation';
import { persistWishlistProducts, removeWishlistProduct, wishlistFilterTabMinWidth, wishlistGridColumnsForWidth, wishlistPriceValue } from './src/wishlistPresentation';
import { buildCategorySections, categoryAtScrollPosition, uniqueCategoryTiles } from './src/categoryContinuity';
import { beginGooglePlayPurchase, googlePlayPurchaseCancelled, initGooglePlayCatalog } from './src/googlePlayClient';
import { subscriptionTerms } from './src/paymentTerms';
import { categories, images, infoPages, policyPages } from './src/assets';
import { calculateCreditPercentage, isMarketplaceProduct, normalizeProduct, normalizeProducts, productCategoryPresentation, resolveImageUrl, verifiedProductBrand, verifiedProductRating } from './src/products';
import { routeTransitionSpec } from './src/gestureNavigation';
import { nativeAppearanceStyles } from './src/nativeAppearance';
import {
  STOREKIT_CONSUMABLE_PRODUCT_IDS,
  STOREKIT_CREDIT_TOP_UP_PRODUCT_IDS_BY_PLAN_ID,
  STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_ID,
  advertisedStoreKitProductIdForTopUpPlan,
  isLookmefyStoreKitProductId,
  isStoreKitConsumableProductId,
  storeKitAppAccountTokenForUser
} from './src/storeKitProducts';

const logoSymbol = require('./assets/lookmefy-symbol.png');
const wardrobeBottomsIcon = require('./assets/wardrobe-bottoms-icon.png');
const wardrobeFootwearIcon = require('./assets/wardrobe-footwear-icon.png');

const USER_PASSWORD_MIN_LENGTH = 6;
const USER_PASSWORD_MAX_BYTES = 72;

const ContentReportingContext = createContext('');
const PrivateMediaSessionContext = createContext('');
async function refreshPrivateImage(uri) {
  return renewPrivateImageUrl(uri, {
    apiOrigin: imageUrl('/api/health'), request: sendApi, resolveUrl: imageUrl, getSessionToken: getToken
  });
}
async function recoverPrivateImage(uri, sessionToken) {
  try {
    return await cachedAuthenticatedImageDataUri(uri, { apiOrigin: imageUrl('/api/health'), sessionToken });
  } catch {}
  try {
    const renewed = await refreshPrivateImage(uri);
    if (!renewed) return '';
    return await cachedAuthenticatedImageDataUri(renewed, {
      apiOrigin: imageUrl('/api/health'), sessionToken: await getToken()
    });
  } catch { return ''; }
}
const requireAiPhotoConsent = createAiPhotoConsentGuard({
  getIdentity: getToken,
  requestPermission: () => new Promise((resolve) => {
    const message = 'Lookmefy may send your profile photo and selected clothing or product images to AI processors, including Pruna and fal.ai, to analyze clothing or create your try-on. Allow this for AI photo requests during this sign-in session? You can reset this choice in Profile.';
    if (Platform.OS === 'web') {
      resolve(typeof window !== 'undefined' && window.confirm(message));
      return;
    }
    Alert.alert('Allow AI photo processing?', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Privacy Policy', onPress: () => { openLegalPolicy('privacy'); resolve(false); } },
      { text: 'Allow & Continue', onPress: () => resolve(true) }
    ], { cancelable: true, onDismiss: () => resolve(false) });
  })
});

async function api(path, options = {}) {
  if (sendsPhotosToAi(path, options)) await requireAiPhotoConsent();
  return sendApi(path, options);
}

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  LogBox.ignoreLogs(['SafeAreaView has been deprecated and will be removed in a future release.']);
}

const genders = ['men', 'women', 'unisex'];
const profileGenderOptions = [
  { value: 'female', label: 'Female', icon: 'female-outline' },
  { value: 'male', label: 'Male', icon: 'male-outline' },
  { value: 'other', label: 'Other', icon: 'person-outline' }
];
const sortOptions = [
  ['', 'Relevant'],
  ['newest', 'Newest'],
  ['price-asc', 'Price low'],
  ['price-desc', 'Price high']
];
const supportEmail = 'support@lookmefy.com';
const aiPreviewDisclaimer = 'Note: AI previews can make mistakes. Check fit, colour, and product details before buying.';
const appTopInset = Platform.OS === 'android' ? Math.max(76, NativeStatusBar.currentHeight || 0) : 0;
const bottomNavigationHeight = 86;
const screenBottomInset = 40;
const homeHeroShowcaseSlides = [
  {
    key: 'black-coat',
    model: images.homeSliderAtelier,
    garment: images['category-generated/jackets.png']
  },
  {
    key: 'denim-shirt',
    model: images.homeSliderArchway,
    garment: images['category-generated/men-shirts.png']
  },
  {
    key: 'light-suiting',
    model: images.homeSliderNaturalLight,
    garment: images['category-generated/tops.png']
  }
];
const screenScrollProps = {
  showsVerticalScrollIndicator: false,
  keyboardShouldPersistTaps: 'handled',
  nestedScrollEnabled: true,
  scrollEventThrottle: 16,
  ...(Platform.OS === 'android'
    ? { overScrollMode: 'never' }
    : {
        alwaysBounceVertical: true,
        bounces: true,
        scrollIndicatorInsets: { bottom: screenBottomInset }
      })
};
const horizontalScrollProps = {
  horizontal: true,
  showsHorizontalScrollIndicator: false,
  keyboardShouldPersistTaps: 'handled',
  nestedScrollEnabled: true,
  directionalLockEnabled: true,
  scrollEventThrottle: 16
};
const homeCategorySnapInterval = 70;
const productImageAspectRatio = 0.72;
const aiTryOnRequestTimeoutMs = 420000;
const aiTryOnJobTimeoutMs = 420000;
const defaultTryOnCreditCost = 1;
const avatarCropReferenceSize = 132;
const wishlistStorageVersion = 'v1';
const collectionStorageVersion = 'v1';
const homeHeroSlideIntervalMs = 4200;
const homeHeroSlides = [
  { key: 'summer', title: 'SUMMER ESSENTIALS', cta: 'SHOP NOW', image: 'homeSliderAtelier', route: 'shop' },
  { key: 'natural-light', title: 'LIGHT LAYERING', cta: 'EXPLORE', image: 'homeSliderNaturalLight', route: 'shop' },
  { key: 'archway', title: 'NEW SEASON EDIT', cta: 'VIEW ALL', image: 'homeSliderArchway', route: 'shop' }
];
const missionProductPresets = {
  college: {
    id: 'college',
    title: 'College Fits',
    subtitle: 'Easy denim, tees, sneakers and light layers for campus days.',
    params: { sort: 'newest' },
    boost: ['college', 'casual', 'denim', 'jeans', 'tshirt', 't-shirt', 'top', 'sneaker', 'shoe', 'backpack', 'bag', 'jacket', 'hoodie', 'shirt'],
    chips: [
      { label: 'Denim', params: { q: 'college denim jeans tshirt', sort: 'newest' } },
      { label: 'T-Shirts', params: { q: 'college tshirt casual top', sort: 'newest' } },
      { label: 'Sneakers', params: { q: 'college sneakers shoes', sort: 'newest' } }
    ]
  },
  office: {
    id: 'office',
    title: 'Office Looks',
    subtitle: 'Polished shirts, trousers, blazers and work-ready shoes.',
    params: { sort: 'newest' },
    boost: ['office', 'formal', 'shirt', 'trouser', 'pant', 'blazer', 'jacket', 'loafer', 'shoe', 'watch', 'bag', 'kurti'],
    chips: [
      { label: 'Shirts', params: { q: 'office formal shirt', sort: 'newest' } },
      { label: 'Trousers', params: { q: 'office trousers pants formal', sort: 'newest' } },
      { label: 'Blazers', params: { q: 'office blazer jacket formal', sort: 'newest' } }
    ]
  },
  date: {
    id: 'date',
    title: 'Date Looks',
    subtitle: 'Bodycon, party, maxi and evening dresses first, with accessories after.',
    params: { q: 'date night bodycon dress party maxi evening dress', sort: 'newest' },
    priorityGroups: ['dress'],
    boost: ['bodycon', 'dress', 'maxi', 'midi', 'party', 'evening', 'date', 'night', 'gown', 'one piece', 'western dress'],
    chips: [
      { label: 'Bodycon', params: { q: 'bodycon dress date night party', sort: 'newest' } },
      { label: 'Maxi', params: { q: 'maxi dress date night evening', sort: 'newest' } },
      { label: 'Party', params: { q: 'party dress evening date night', sort: 'newest' } },
      { label: 'Accessories', params: { q: 'date jewellery watch bag', sort: 'newest' } }
    ]
  },
  wedding: {
    id: 'wedding',
    title: 'Wedding Ready',
    subtitle: 'Sarees, kurtis, ethnic sets, jewellery and celebration pieces.',
    params: { q: 'wedding ethnic saree kurti lehenga jewellery', sort: 'newest' },
    priorityGroups: ['saree', 'kurti', 'jewellery', 'dress'],
    boost: ['wedding', 'ethnic', 'saree', 'lehenga', 'kurti', 'jewellery', 'bangle', 'necklace', 'dress'],
    chips: [
      { label: 'Sarees', params: { q: 'wedding saree festive', sort: 'newest' } },
      { label: 'Kurtis', params: { q: 'wedding kurti ethnic', sort: 'newest' } },
      { label: 'Jewellery', params: { q: 'wedding jewellery bangle necklace', sort: 'newest' } }
    ]
  },
  travel: {
    id: 'travel',
    title: 'Travel Looks',
    subtitle: 'Comfort-first vacation fits, sneakers, jackets and easy layers.',
    params: { sort: 'newest' },
    boost: ['travel', 'vacation', 'casual', 'co ord', 'coord', 'sneaker', 'shoe', 'jacket', 'tshirt', 'dress', 'bag', 'shorts', 'shirt'],
    chips: [
      { label: 'Vacation', params: { q: 'travel vacation dress casual', sort: 'newest' } },
      { label: 'Sneakers', params: { q: 'travel sneakers shoes', sort: 'newest' } },
      { label: 'Layers', params: { q: 'travel jacket casual layer', sort: 'newest' } }
    ]
  },
  festive: {
    id: 'festive',
    title: 'Festive Picks',
    subtitle: 'Ethnicwear, sarees, kurtis and jewellery for festive styling.',
    params: { q: 'festive ethnic saree kurti jewellery', sort: 'newest' },
    priorityGroups: ['saree', 'kurti', 'jewellery', 'dress'],
    boost: ['festive', 'festival', 'ethnic', 'saree', 'kurti', 'jewellery', 'bangle', 'dress', 'gold'],
    chips: [
      { label: 'Ethnic', params: { q: 'festive ethnic kurti saree', sort: 'newest' } },
      { label: 'Sarees', params: { q: 'festive saree', sort: 'newest' } },
      { label: 'Jewellery', params: { q: 'festive jewellery bangle gold', sort: 'newest' } }
    ]
  }
};
const fontAssets = {
  BodoniModa_400Regular: require('@expo-google-fonts/bodoni-moda/400Regular/BodoniModa_400Regular.ttf'),
  BodoniModa_600SemiBold: require('@expo-google-fonts/bodoni-moda/600SemiBold/BodoniModa_600SemiBold.ttf'),
  PlusJakartaSans_600SemiBold: require('@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf'),
  PlusJakartaSans_700Bold: require('@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf'),
  Manrope_400Regular: require('@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf'),
  Manrope_500Medium: require('@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf'),
  Manrope_600SemiBold: require('@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf'),
  Manrope_700Bold: require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf')
};
const fontFamilies = {
  logo: 'BodoniModa_400Regular',
  hero: 'BodoniModa_600SemiBold',
  headingSemiBold: 'PlusJakartaSans_600SemiBold',
  headingBold: 'PlusJakartaSans_700Bold',
  bodyRegular: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold'
};

function openSupportEmail(subject = 'Lookmefy support request') {
  const mailUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}`;
  Linking.openURL(mailUrl).catch(() => {
    Alert.alert('Email support', supportEmail);
  });
}
const typography = {
  display: { fontFamily: fontFamilies.headingBold, fontSize: 30, lineHeight: 38, fontWeight: '700', letterSpacing: 0 },
  h1: { fontFamily: fontFamilies.headingBold, fontSize: 28, lineHeight: 35, fontWeight: '700', letterSpacing: 0 },
  h2: { fontFamily: fontFamilies.headingSemiBold, fontSize: 24, lineHeight: 31, fontWeight: '600', letterSpacing: 0 },
  h3: { fontFamily: fontFamilies.headingSemiBold, fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: 0 },
  h4: { fontFamily: fontFamilies.headingSemiBold, fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: 0 },
  productTitle: { fontFamily: fontFamilies.bodyMedium, fontSize: 16, lineHeight: 22, fontWeight: '500', letterSpacing: 0 },
  body: { fontFamily: fontFamilies.bodyRegular, fontSize: 15, lineHeight: 22, fontWeight: '400', letterSpacing: 0 },
  smallBody: { fontFamily: fontFamilies.bodyRegular, fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: 0 },
  caption: { fontFamily: fontFamilies.bodyMedium, fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0 },
  button: { fontFamily: fontFamilies.bodySemiBold, fontSize: 16, lineHeight: 21, fontWeight: '600', letterSpacing: 0 },
  price: { fontFamily: fontFamilies.bodyBold, fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: 0 },
  label: { fontFamily: fontFamilies.bodySemiBold, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0 },
  nav: { fontFamily: fontFamilies.bodySemiBold, fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0 }
};
const aiStudioStarterPrompts = [
  {
    title: 'Linen shirts',
    text: 'Easy smart-casual.',
    icon: 'shirt-outline',
    prompt: 'Find linen shirts under ₹1500.'
  },
  {
    title: 'Casual sneakers',
    text: 'Daily footwear picks.',
    icon: 'walk-outline',
    prompt: 'Show casual sneakers under ₹2000.'
  },
  {
    title: 'Office trousers',
    text: 'Polished work options.',
    icon: 'briefcase-outline',
    prompt: 'Find office trousers under ₹1200.'
  }
];
const recentSearchLimit = 5;
const recentSearchStoragePrefix = 'lookmefy_recent_searches';
const aiStudioHistoryStoragePrefix = 'lookmefy_ai_studio_history';
const aiStudioHistoryLimit = 24;
const onboardingPendingStorageKey = 'lookmefy_onboarding_pending';
const onboardingSeenStoragePrefix = 'lookmefy_onboarding_seen';
const onboardingTourSteps = [
  {
    key: 'intro',
    eyebrow: 'YOUR STYLE, YOUR STUDIO',
    title: 'Welcome to Lookmefy',
    text: 'Try clothing virtually, build your wardrobe, and find inspiration with your personal AI stylist.',
    icon: 'sparkles-outline',
    primary: 'Start the tour'
  },
  {
    key: 'shop',
    eyebrow: 'DISCOVER',
    title: 'Explore categories',
    text: 'Start with the category rail to jump into dresses, tops, shoes, eyewear, and live product cards.',
    icon: 'grid-outline',
    targetKey: 'home-catalog',
    route: { name: 'home' },
    placement: 'below',
    target: ({ width, height }) => ({
      x: 14,
      y: Math.min(height * 0.44, Platform.OS === 'android' ? appTopInset + 320 : 330),
      width: width - 28,
      height: 128
    })
  },
  {
    key: 'stylist',
    eyebrow: 'AI STYLIST',
    title: 'Style starts with you',
    text: 'Ask for an outfit, a particular piece, or a little inspiration tailored to the moment.',
    icon: 'sparkles-outline',
    targetKey: 'ai-studio-composer',
    route: { name: 'stylebot' },
    placement: 'above',
    target: ({ width, height }) => ({
      x: 20,
      y: Math.max(340, height - bottomNavigationHeight - 92),
      width: width - 40,
      height: 62
    })
  },
  {
    key: 'wardrobe',
    eyebrow: 'WARDROBE',
    title: 'Your wardrobe, reimagined',
    text: 'Save the clothes you own and discover new ways to style them.',
    icon: 'shirt-outline',
    targetKey: 'wardrobe-upload',
    route: { name: 'closet', params: { view: 'add' } },
    placement: 'below',
    focusTarget: (target) => {
      const focusHeight = Math.min(132, target.height);
      const horizontalInset = Math.min(12, Math.max(0, (target.width - 48) / 2));
      return {
        x: target.x + horizontalInset,
        y: target.y + Math.max(0, (target.height - focusHeight) / 2),
        width: target.width - horizontalInset * 2,
        height: focusHeight
      };
    },
    target: ({ width, height }) => ({
      x: 20,
      y: Math.min(292, Math.max(210, height * 0.24)),
      width: width - 40,
      height: Math.min(360, Math.max(230, height * 0.38))
    })
  },
  {
    key: 'profile',
    eyebrow: 'PROFILE',
    title: 'Keep your studio ready',
    text: 'Your profile holds orders, credits, try-on portraits, and account settings.',
    icon: 'person-outline',
    targetKey: 'profile-avatar',
    route: { name: 'profile' },
    primary: 'Finish',
    placement: 'below',
    target: ({ width }) => ({
      x: Math.max(18, width - 132),
      y: Platform.OS === 'android' ? appTopInset + 34 : 68,
      width: 108,
      height: 108
    })
  }
];
const validRoutes = new Set(['auth', 'home', 'shop', 'search', 'tryon', 'closet', 'custom', 'stylebot', 'tokens', 'profile', 'generation-history', 'product', 'checkout', 'wishlist', 'collections', 'orders', 'signup', 'login', 'how', 'info']);
const tabletLayoutMinWidth = 768;
const tabletContentMaxWidth = 1180;

function responsiveContentWidthForWindow(windowWidth) {
  const safeWidth = Math.max(1, Math.round(Number(windowWidth) || 0));
  if (safeWidth < tabletLayoutMinWidth) return safeWidth;
  const contentRatio = safeWidth >= 1024 ? 0.9 : 0.88;
  return Math.min(tabletContentMaxWidth, Math.round(safeWidth * contentRatio));
}

function productColumnsForWindow(windowWidth) {
  const safeWidth = Math.max(1, Number(windowWidth) || 0);
  if (safeWidth >= 1024) return 4;
  if (safeWidth >= tabletLayoutMinWidth) return 3;
  return 2;
}

function gridWidthForColumns(columns) {
  if (columns >= 4) return '23.5%';
  if (columns === 3) return '31.5%';
  return null;
}

function responsiveLayoutForWindow(windowWidth) {
  const safeWindowWidth = Math.max(1, Math.round(Number(windowWidth) || 0));
  const isTablet = safeWindowWidth >= tabletLayoutMinWidth;
  const productColumns = productColumnsForWindow(safeWindowWidth);
  const gridWidth = gridWidthForColumns(productColumns);
  const contentWidth = responsiveContentWidthForWindow(safeWindowWidth);
  return {
    windowWidth: safeWindowWidth,
    contentWidth,
    isTablet,
    isLargeTablet: safeWindowWidth >= 1024,
    productColumns,
    contentFrameStyle: isTablet ? { width: contentWidth } : null,
    productGridItemStyle: gridWidth ? { flexGrow: 0, flexBasis: gridWidth, maxWidth: gridWidth } : null,
    productGridWidthStyle: gridWidth ? { width: gridWidth } : null,
    categoryTileStyle: isTablet ? { width: productColumns >= 4 ? '23.5%' : '31.5%' } : null
  };
}

const defaultResponsiveLayout = responsiveLayoutForWindow(390);
const ResponsiveLayoutContext = createContext(defaultResponsiveLayout);

function useResponsiveLayout() {
  return useContext(ResponsiveLayoutContext);
}

function normalizeRoute(name, params = {}) {
  const routeName = typeof name === 'string' && validRoutes.has(name) ? name : 'home';
  const routeParams = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
  return { name: routeName, params: routeParams };
}

class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.routeName !== this.props.routeName && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ScrollView contentContainerStyle={styles.scrollContent} {...screenScrollProps}>
          <View style={styles.statusPanel}>
            <Text style={styles.statusTitle}>Screen could not open</Text>
            <Text style={styles.statusText}>{this.state.error?.message || 'Try another tab or reload the app.'}</Text>
            <AppButton label="Go Home" icon="home-outline" onPress={this.props.onHome} />
          </View>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

function titleCase(value = '') {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function authPhoneValue(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  let local = '';
  if (digits.length === 10) local = digits;
  else if (digits.length === 11 && digits.startsWith('0')) local = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith('91')) local = digits.slice(2);
  else if (digits.length === 14 && digits.startsWith('0091')) local = digits.slice(4);
  return /^[6-9]\d{9}$/.test(local) ? local : '';
}

function normalizeOtpInput(value = '') {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

function utf8ByteLength(value = '') {
  let bytes = 0;
  for (const char of String(value || '')) {
    const codePoint = char.codePointAt(0);
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function passwordValidationMessage(value = '') {
  const password = String(value || '');
  if (!password) return 'Password is required.';
  if (password.length < USER_PASSWORD_MIN_LENGTH) return `Password must be at least ${USER_PASSWORD_MIN_LENGTH} characters.`;
  if (utf8ByteLength(password) > USER_PASSWORD_MAX_BYTES) return `Password must be at most ${USER_PASSWORD_MAX_BYTES} bytes.`;
  return '';
}

function shopResultTitle(filters = {}, tryOnMode = false) {
  if (tryOnMode) return 'AI Try-On';
  if (filters.discounted === 'true' || filters.sale === 'true') return 'Top Deals';
  if (filters.maxPrice) return `Under ₹${filters.maxPrice}`;
  if (filters.q) return filters.q;
  if (filters.category) return titleCase(filters.category);
  return 'All Products';
}

function productSearchBlob(product = {}) {
  return [
    product.name,
    product.brand,
    product.category,
    product.gender,
    product.fit,
    product.description,
    ...(Array.isArray(product.tags) ? product.tags : [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function missionProductScore(product, missionPreset) {
  if (!missionPreset) return 0;
  const text = productSearchBlob(product);
  const group = missionProductGroup(product);
  let score = 0;
  if (missionPreset.priorityGroups?.includes(group)) score += 16;
  (missionPreset.boost || []).forEach((term, index) => {
    if (text.includes(String(term).toLowerCase())) score += Math.max(1, 8 - Math.floor(index / 2));
  });
  if (product.imageUrl || product.imageUrls?.length) score += 2;
  if (product.isNew || product.isNewArrival) score += 1;
  if (Number(product.rating || 0) >= 4) score += 1;
  return score;
}

function missionProductGroup(product = {}) {
  const text = productSearchBlob(product);
  const groups = [
    ['saree', /\bsarees?\b/],
    ['kurti', /\bkurt[ai]s?\b|\bethnic\b/],
    ['jewellery', /\bjewell?ery\b|\bnecklace\b|\bbangles?\b|\bearrings?\b|\bbracelet\b/],
    ['dress', /\bdresses?\b|\bgown\b|\blehenga\b/],
    ['jeans', /\bjeans?\b|\bdenim\b/],
    ['trousers', /\btrousers?\b|\bpants?\b|\bchinos?\b/],
    ['tshirt', /\bt-?shirts?\b|\btees?\b/],
    ['shirt', /\bshirts?\b/],
    ['top', /\btops?\b|\bblouse\b/],
    ['jacket', /\bjackets?\b|\bblazers?\b|\bhoodies?\b|\bshrugs?\b/],
    ['shoes', /\bshoes?\b|\bsneakers?\b|\bheels?\b|\bloafers?\b|\bsandals?\b|\bfootwear\b/],
    ['bag', /\bbags?\b|\bbackpacks?\b|\btotes?\b|\bclutches?\b/],
    ['watch', /\bwatches?\b/]
  ];
  const found = groups.find(([, pattern]) => pattern.test(text));
  return found?.[0] || String(product.category || 'other').toLowerCase() || 'other';
}

function orderProductsForMission(products = [], missionPreset = null) {
  if (!missionPreset) return products;
  const ranked = [...products].sort((a, b) => {
    const scoreDiff = missionProductScore(b, missionPreset) - missionProductScore(a, missionPreset);
    if (scoreDiff) return scoreDiff;
    return Number(b.rating || 0) - Number(a.rating || 0);
  });
  const output = [];
  const usedIds = new Set();
  const groupCounts = {};
  const maxPerRound = 2;
  while (output.length < ranked.length) {
    const before = output.length;
    ranked.forEach((product) => {
      const id = String(product.id || product._id || '');
      if (!id || usedIds.has(id)) return;
      const group = missionProductGroup(product);
      if ((groupCounts[group] || 0) >= maxPerRound) return;
      usedIds.add(id);
      groupCounts[group] = (groupCounts[group] || 0) + 1;
      output.push(product);
    });
    if (output.length === before) {
      ranked.forEach((product) => {
        const id = String(product.id || product._id || '');
        if (!id || usedIds.has(id)) return;
        usedIds.add(id);
        output.push(product);
      });
    }
  }
  return output;
}

function friendlyFirstName(user) {
  const name = String(user?.name || '').split(' ')?.[0] || '';
  const suspicious = /^(?:red|blue|green|black|white|test|user|admin)$/i.test(name.trim());
  return name && !suspicious ? titleCase(name) : '';
}

function aiStudioWelcomeText(user) {
  const firstName = friendlyFirstName(user);
  return `${firstName ? `Hi ${firstName}. ` : ''}Tell me what you're looking for — an outfit, a particular piece, or a little inspiration.`;
}

function initialAiStudioMessages(user) {
  return [
    {
      id: `welcome-${user?.id || user?._id || user?.phone || 'guest'}`,
      role: 'assistant',
      text: aiStudioWelcomeText(user)
    }
  ];
}

function normalizeAiStudioAction(action) {
  if (!action) return null;
  if (typeof action === 'string') return { type: 'message', label: action, prompt: action };
  const label = String(action.label || action.type || 'Action').replace(/\s+/g, ' ').trim();
  if (!label) return null;
  return {
    type: String(action.type || 'message'),
    label,
    prompt: String(action.prompt || label).replace(/\s+/g, ' ').trim(),
    disabled: Boolean(action.disabled),
    disabledReason: String(action.disabledReason || '').replace(/\s+/g, ' ').trim()
  };
}

function normalizeAiStudioActions(data = {}) {
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const visible = actions.length ? actions : Array.isArray(data.suggestions) ? data.suggestions : [];
  return visible.map(normalizeAiStudioAction).filter((action) => action && !/amazon|online|web/i.test(`${action.type} ${action.label} ${action.prompt}`)).slice(0, 4);
}

function stylistResponseText(value = '') {
  return String(value || '').replace(/\bAmazon(?:\.in)?\b/gi, 'Lookmefy catalog');
}

function normalizeAiStudioOutfits(outfits = []) {
  return (Array.isArray(outfits) ? outfits : []).map((outfit, index) => ({
    ...outfit,
    id: String(outfit.id || outfit.title || `outfit-${index}`),
    title: String(outfit.title || 'Recommended outfit'),
    reason: String(outfit.reason || ''),
    sourceLabel: String(outfit.sourceLabel || (outfit.source === 'hybrid' ? 'Mixed look' : 'Wardrobe item')),
    items: Array.isArray(outfit.items) ? outfit.items : [],
    products: Array.isArray(outfit.products) ? outfit.products : []
  })).filter((outfit) => outfit.id);
}

function normalizeAiStudioProducts(products = [], outfits = []) {
  const outfitProducts = outfits.flatMap((outfit) => outfit.products || []);
  return uniqueProductsById(normalizeProducts([...(Array.isArray(products) ? products : []), ...outfitProducts]));
}

function recentSearchStorageKey(user) {
  const owner = user?.id || user?._id || user?.phone || user?.username || 'guest';
  return `${recentSearchStoragePrefix}:${owner}`;
}

function aiStudioHistoryStorageKey(user) {
  const owner = user?.id || user?._id || user?.phone || user?.username || 'guest';
  return `${aiStudioHistoryStoragePrefix}:${owner}`;
}

function aiStudioHasUserMessages(messages = []) {
  return Array.isArray(messages) && messages.some((message) => message?.role === 'user');
}

function aiStudioChatTitle(messages = []) {
  const userMessage = (Array.isArray(messages) ? messages : []).find((message) => message?.role === 'user' && String(message.text || '').trim());
  const title = String(userMessage?.text || '').trim().replace(/\s+/g, ' ');
  if (!title) return 'New styling chat';
  return title.length > 44 ? `${title.slice(0, 41).trim()}...` : title;
}

function normalizeAiStudioChatRecord(record = {}) {
  const messages = Array.isArray(record.messages) ? record.messages : [];
  if (!aiStudioHasUserMessages(messages)) return null;
  const updatedAt = record.updatedAt || record.createdAt || new Date().toISOString();
  return {
    id: String(record.id || record.conversationId || `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    title: String(record.title || aiStudioChatTitle(messages)),
    conversationId: String(record.conversationId || ''),
    messages,
    tryOns: record.tryOns && typeof record.tryOns === 'object' ? record.tryOns : {},
    tryOnErrors: record.tryOnErrors && typeof record.tryOnErrors === 'object' ? record.tryOnErrors : {},
    createdAt: record.createdAt || updatedAt,
    updatedAt
  };
}

function createAiStudioChatRecord({ id, conversationId, messages, tryOns, tryOnErrors }) {
  return normalizeAiStudioChatRecord({
    id: id || `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: aiStudioChatTitle(messages),
    conversationId,
    messages,
    tryOns,
    tryOnErrors,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function mergeAiStudioChatHistory(history = [], record) {
  const normalizedRecord = normalizeAiStudioChatRecord(record);
  const normalizedHistory = (Array.isArray(history) ? history : [])
    .map(normalizeAiStudioChatRecord)
    .filter(Boolean);
  if (!normalizedRecord) return normalizedHistory.slice(0, aiStudioHistoryLimit);
  return [
    normalizedRecord,
    ...normalizedHistory.filter((item) => item.id !== normalizedRecord.id)
  ].slice(0, aiStudioHistoryLimit);
}

function onboardingSeenStorageKey(user) {
  const owner = user?.id || user?._id || user?.phone || user?.username || 'guest';
  return `${onboardingSeenStoragePrefix}:${owner}`;
}

function isMissingRouteError(message = '') {
  return /\b404\b|not found|not available on the running backend/i.test(String(message || ''));
}

function tryOnProfileBlockMessage(user) {
  if (!user) return '';
  if (user.bodyPhotoStatus === 'generating') {
    return 'Your full-body try-on profile is being prepared. You can keep browsing and try again in a moment.';
  }
  if (user.bodyPhotoStatus === 'failed') {
    return 'Could not prepare your full-body try-on profile. Upload a clearer profile photo before trying on products.';
  }
  if (!user.bodyPhotoUrl) {
    return 'Upload a profile photo before generating AI try-ons.';
  }
  return '';
}

function aiFeatureErrorMessage(error, fallback = 'AI request could not be completed. Try again in a moment.') {
  const message = String(error?.message || '').trim();
  if (!message) return fallback;
  if (isMissingRouteError(message)) return 'This AI feature is unavailable right now. Please try again later.';
  return message;
}

function aiStudioErrorMessage(error) {
  const status = Number(error?.status) || 0;
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').trim();
  const detail = String(error?.detail || '').trim();
  const combined = `${message} ${detail}`;
  if (status === 401) return 'Your session expired. Please log in again.';
  if (status === 429) return 'Your stylist is receiving a lot of requests. Please wait a moment and try again.';
  if (code === 'timeout' || /timed out|still processing/i.test(combined)) return 'Your stylist is taking longer than expected. Please try again.';
  if (code === 'network_unreachable' || /cannot reach|network request failed|failed to fetch|connection refused/i.test(combined)) {
    return 'Your stylist could not connect. Check your connection and try again.';
  }
  if (/not enough (?:tokens|credits)|insufficient (?:tokens|credits)/i.test(combined)) {
    return 'You do not have enough credits for this request.';
  }
  if (isMissingRouteError(message)) return 'Your stylist is unavailable on the running backend. Please try again later.';
  return "Your stylist couldn't respond. Please try again.";
}

function customGarmentErrorMessage(error) {
  const message = aiFeatureErrorMessage(error, 'Could not generate custom try-on. Try again in a moment.');
  const garmentIssue = /(?:garment|cloth(?:ing)?).*(?:invalid|unsupported|unclear|unreadable|not detected|could not detect)|(?:invalid|unsupported|unclear|unreadable|not detected|could not detect).*(?:garment|cloth(?:ing)?)/i;
  return garmentIssue.test(message) ? 'Please choose a clearer clothing photo.' : message;
}

function isAuthExpiredError(error) {
  const message = String(error?.message || error?.detail || '').trim();
  return Number(error?.status) === 401 || /session expired|session has ended|invalid or expired session|please log in again|sign in again/i.test(message);
}

function userAvatarUrl(user) {
  const avatarUrl = user?.avatarPhotoUrl || user?.profilePhotoUrl || user?.photoUrl || user?.imageUrl || '';
  const bodyUrl = user?.bodyPhotoUrl || '';
  if (isGeneratedFullBodySource(user?.bodyPhotoSource) && bodyUrl) return bodyUrl;
  return avatarUrl || bodyUrl || '';
}

function isGeneratedFullBodySource(source) {
  return source === 'pruna-full-body' || source === 'fal-full-body';
}

function profilePhotoFeedback(user, message) {
  if (message !== 'Photo saved. Your AI try-on portrait is being generated.') return message;
  if (user?.bodyPhotoStatus === 'generating') return message;
  if (user?.bodyPhotoStatus === 'failed') return 'AI portrait generation failed. Choose a clearer photo to try again.';
  return isGeneratedFullBodySource(user?.bodyPhotoSource)
    ? 'Profile photo updated. Your AI try-on portrait is ready.'
    : 'Photo saved.';
}

function userAvatarResizeMode(user) {
  if (isGeneratedFullBodyAvatar(user)) return 'stretch';
  return 'cover';
}

function isGeneratedFullBodyAvatar(user) {
  return isGeneratedFullBodySource(user?.bodyPhotoSource) && Boolean(user?.bodyPhotoUrl);
}

function clampAvatarNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function defaultAvatarCrop(user) {
  return isGeneratedFullBodyAvatar(user)
    ? { scale: 4.2, translateX: 0, translateY: 0 }
    : { scale: 1.04, translateX: 0, translateY: 0 };
}

function avatarCropForUser(user, override) {
  const defaults = defaultAvatarCrop(user);
  const source = override || (isGeneratedFullBodyAvatar(user) ? {} : user?.avatarCrop) || {};
  const minScale = isGeneratedFullBodyAvatar(user) ? 4.2 : 1;
  return {
    scale: clampAvatarNumber(source.scale, minScale, 5, defaults.scale),
    translateX: clampAvatarNumber(source.translateX ?? source.x, -160, 160, defaults.translateX),
    translateY: clampAvatarNumber(source.translateY ?? source.y, -160, 160, defaults.translateY)
  };
}

function avatarImageStyleForUser(user, size, override) {
  const crop = avatarCropForUser(user, override);
  const cropScale = Number.isFinite(Number(size)) && Number(size) > 0 ? Number(size) / avatarCropReferenceSize : 1;
  const translateX = crop.translateX * cropScale;
  const translateY = crop.translateY * cropScale;
  if (isGeneratedFullBodyAvatar(user)) {
    const width = size * crop.scale;
    const height = width * 1.5;
    const faceCenterY = height * 0.13;
    return {
      position: 'absolute',
      width,
      height,
      left: ((size - width) / 2) + translateX,
      top: (size / 2) - faceCenterY + translateY
    };
  }
  return {
    transform: [
      { scale: crop.scale },
      { translateX },
      { translateY }
    ]
  };
}

function avatarImageBaseStyleForUser(user) {
  return isGeneratedFullBodyAvatar(user) ? styles.avatarPositionedImage : null;
}

function userInitials(user) {
  const seed = String(user?.name || user?.username || user?.phone || 'L').trim();
  const words = seed.replace(/^\+?91/, '').split(/[\s_@.-]+/).filter(Boolean);
  const letters = words.length > 1
    ? `${words[0][0] || ''}${words[1][0] || ''}`
    : (words[0] || 'L').slice(0, 2);
  return letters.toUpperCase();
}

function productGenderForUser(user) {
  if (user?.genderPreference === 'male') return 'men';
  if (user?.genderPreference === 'female') return 'women';
  return '';
}

function productApiGenderForUser(user) {
  if (user?.genderPreference === 'male') return 'male';
  if (user?.genderPreference === 'female') return 'female';
  return '';
}

function normalizeRecentSearches(searches = [], limit = recentSearchLimit) {
  const seen = new Set();
  return searches
    .map((item) => String(item?.query || item || '').trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

async function loadStoredRecentSearches(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    return normalizeRecentSearches(JSON.parse(raw || '[]'));
  } catch {
    return [];
  }
}

async function saveStoredRecentSearches(key, searches) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(normalizeRecentSearches(searches)));
  } catch {
    // Search history is a convenience feature; failed local storage should not block search.
  }
}

function dateInputValue(value = new Date()) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function productImageSource(product, tryOn) {
  const url = tryOn?.imageUrl ? tryOnImageUrl(tryOn) : resolveImageUrl(product?.imageUrl || product?.imageUrls?.[0]);
  return url ? { uri: url } : null;
}

function productImageResizeMode(tryOn) {
  return 'contain';
}

function mediaUrlWithVersion(url, version) {
  const resolved = imageUrl(url);
  const signature = String(version || '').trim();
  if (!resolved || !signature || /[?&]_v=/.test(resolved)) return resolved;
  return `${resolved}${resolved.includes('?') ? '&' : '?'}_v=${encodeURIComponent(signature)}`;
}

function tryOnMediaVersion(tryOn, kind = 'image') {
  return [kind, tryOn?.updatedAt, tryOn?.videoGeneratedAt, tryOn?.createdAt, tryOn?.id]
    .filter(Boolean)
    .join(':');
}

function tryOnImageUrl(tryOn) {
  return mediaUrlWithVersion(tryOn?.imageUrl, tryOnMediaVersion(tryOn, 'image'));
}

function tryOnVideoUrl(tryOn) {
  return mediaUrlWithVersion(tryOn?.videoUrl, tryOnMediaVersion(tryOn, 'video'));
}

function isLocalMockTryOn(tryOn) {
  return String(tryOn?.provider || '').toLowerCase() === 'local'
    || String(tryOn?.model || '').toLowerCase() === 'local-mock-tryon';
}

function tryOnDisplayLabel(tryOn, videoUri = '') {
  if (isLocalMockTryOn(tryOn)) return videoUri ? 'Mock Video' : 'Mock Preview';
  return videoUri ? 'Video Try-On' : 'AI Try-On';
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchProductTryOn(productId, { waitForImage = false } = {}) {
  if (!productId) return null;
  const attempts = waitForImage ? 4 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const data = await api(`/tryons?productIds=${encodeURIComponent(productId)}`, { noCache: true });
    const latest = (data?.tryOns || []).find((item) => String(item.productId) === String(productId)) || null;
    if (!waitForImage || latest?.imageUrl || latest?.videoUrl || attempt === attempts - 1) return latest;
    await wait(1200);
  }
  return null;
}

function chatProductKey(product = {}) {
  return String(product?.id || product?.sourceUrl || product?.affiliateLink || product?.name || 'product');
}

function isOnlineAiStudioProduct(product = {}) {
  const source = String([product?.source, product?.searchSource, product?.sourceLabel].filter(Boolean).join(' ')).toLowerCase();
  if (/lookmefy|catalog/.test(source)) return false;
  return product?.tryOnAvailable === false
    || product?.aiTryOnAvailable === false
    || /web|amazon|serpapi|online/.test(source);
}

function chatTryOnStateKey(messageId, product = {}) {
  return `${String(messageId || 'message')}:${chatProductKey(product)}`;
}

function useTourTarget(targetKey, registerTourTarget, options = {}) {
  const { request, scrollRef, scrollOffset = 110 } = options || {};
  const ref = useRef(null);
  const measure = useCallback((delay = 40) => {
    if (!targetKey || !registerTourTarget || !ref.current?.measureInWindow) return;
    setTimeout(() => {
      ref.current?.measureInWindow?.((x, y, width, height) => {
        if (width > 0 && height > 0) registerTourTarget(targetKey, { x, y, width, height });
      });
    }, delay);
  }, [targetKey, registerTourTarget]);

  const focus = useCallback(() => {
    if (!targetKey) return;
    const node = ref.current;
    const scroller = scrollRef?.current;
    const scrollTarget = scroller?.getNativeScrollRef?.() || scroller;
    const scrollToTarget = scroller?.scrollTo
      ? (y) => scroller.scrollTo({ y, animated: true })
      : scroller?.scrollToOffset
        ? (y) => scroller.scrollToOffset({ offset: y, animated: true })
        : null;
    if (node?.measureLayout && scrollTarget && scrollToTarget) {
      try {
        node.measureLayout(
          scrollTarget,
          (_x, y) => {
            scrollToTarget(Math.max(0, y - scrollOffset));
            measure(280);
          },
          () => measure(80)
        );
      } catch {
        measure(80);
      }
      return;
    }
    measure(120);
  }, [measure, scrollOffset, scrollRef, targetKey]);

  useEffect(() => {
    measure();
    const timer = setTimeout(measure, 360);
    return () => clearTimeout(timer);
  }, [measure]);

  useEffect(() => {
    if (!request?.targetKey || request.targetKey !== targetKey) return undefined;
    const timer = setTimeout(focus, 180);
    return () => clearTimeout(timer);
  }, [focus, request?.nonce, request?.targetKey, targetKey]);

  return { ref, onLayout: () => measure(40) };
}

function sourceSignature(source) {
  if (!source) return '';
  if (typeof source === 'number') return `asset:${source}`;
  if (Array.isArray(source)) return source.map(sourceSignature).join(',');
  return source.uri || JSON.stringify(source);
}

function wishlistStorageKey(user) {
  const identity = user?.id || user?.phone || user?.email || 'guest';
  return `lookmefy:wishlist:${wishlistStorageVersion}:${identity}`;
}

function collectionStorageKey(user) {
  const identity = user?.id || user?.phone || user?.email || 'guest';
  return `lookmefy:collections:${collectionStorageVersion}:${identity}`;
}

const ResilientImage = memo(function ResilientImage({ source, fallbackSource, style, imageStyle, imageBaseStyle, resizeMode = 'cover', alt, fallbackIcon = 'image-outline', fallbackText, backdropBlurRadius = 0, onImageLoad, retryOnFailure = false }) {
  const privateMediaSession = useContext(PrivateMediaSessionContext);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [privateResult, setPrivateResult] = useState({ url: '', session: '', data: '' });
  const sources = useMemo(() => {
    const entries = [source, fallbackSource].filter(Boolean);
    const seen = new Set();
    return entries.filter((entry) => {
      const key = sourceSignature(entry);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [source, fallbackSource]);
  const signature = sources.map(sourceSignature).join('|');
  const activeSource = sources[sourceIndex];
  const mediaOrigin = imageUrl('/api/health');
  const privateUrl = activeSource?.uri && privateMediaPath(activeSource.uri, mediaOrigin) ? activeSource.uri : '';
  const privateData = privateUrl
    ? cachedPrivateImage(privateUrl, { apiOrigin: mediaOrigin, sessionToken: privateMediaSession }) || (privateResult.url === privateUrl && privateResult.session === privateMediaSession ? privateResult.data : '')
    : '';
  const renderSource = privateUrl
    ? (privateData ? { uri: privateData } : null)
    : authenticatedMediaSource(activeSource, { apiOrigin: mediaOrigin, sessionToken: privateMediaSession });
  const fallbackPrivateUrl = fallbackSource?.uri && privateMediaPath(fallbackSource.uri, mediaOrigin) ? fallbackSource.uri : '';
  const fallbackLayerSource = fallbackPrivateUrl
    ? (cachedPrivateImage(fallbackPrivateUrl, { apiOrigin: mediaOrigin, sessionToken: privateMediaSession }) || '')
    : authenticatedMediaSource(fallbackSource, { apiOrigin: mediaOrigin, sessionToken: privateMediaSession });

  useEffect(() => {
    if (!privateUrl) return undefined;
    if (!privateMediaSession) {
      setFailed(true);
      return undefined;
    }
    let active = true;
    const cached = cachedPrivateImage(privateUrl, { apiOrigin: mediaOrigin, sessionToken: privateMediaSession });
    if (cached) {
      setPrivateResult({ url: privateUrl, session: privateMediaSession, data: cached });
      return undefined;
    }
    recoverPrivateImage(privateUrl, privateMediaSession).then((data) => {
      if (!active) return;
      if (data) setPrivateResult({ url: privateUrl, session: privateMediaSession, data });
      else if (sourceIndex < sources.length - 1) setSourceIndex((current) => current + 1);
      else setFailed(true);
    });
    return () => { active = false; };
  }, [privateUrl, privateMediaSession, sourceIndex, signature, retryKey]);

  useEffect(() => {
    setPrivateResult({ url: '', session: '', data: '' });
    setSourceIndex(0);
    setLoaded(false);
    setFailed(false);
  }, [signature, privateMediaSession, retryKey]);

  if (privateUrl && !privateData && !failed) {
    return <View style={[style, styles.resilientImageFrame]} accessibilityLabel={alt || 'Loading image'}><View style={styles.resilientImageSkeleton} /></View>;
  }

  if (!renderSource || failed) {
    if (retryOnFailure && privateUrl) {
      return (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry loading saved try-on image"
          style={[style, styles.resilientImageFrame, styles.resilientImageFallback]}
          onPress={(event) => { event.stopPropagation(); setRetryKey((value) => value + 1); }}>
          <Ionicons name="refresh-outline" size={22} color="#9b8f89" />
          <Text style={styles.resilientImageFallbackText}>Image could not load. Tap to retry.</Text>
        </TouchableOpacity>
      );
    }
    return (
      <View style={[style, styles.resilientImageFrame, styles.resilientImageFallback]} accessibilityLabel={alt || 'Image unavailable'}>
        <Ionicons name={fallbackIcon} size={22} color="#9b8f89" />
        {fallbackText ? <Text style={styles.resilientImageFallbackText}>{fallbackText}</Text> : null}
      </View>
    );
  }

  const hasFallbackLayer = fallbackLayerSource && sourceSignature(fallbackSource) !== sourceSignature(activeSource);

  return (
    <View style={[style, styles.resilientImageFrame]}>
      {backdropBlurRadius > 0 ? <Image source={renderSource} style={styles.resilientImage} resizeMode="cover" blurRadius={backdropBlurRadius} /> : null}
      {hasFallbackLayer ? <Image source={typeof fallbackLayerSource === 'string' ? { uri: fallbackLayerSource } : fallbackLayerSource} style={[imageBaseStyle || styles.resilientImage, imageStyle]} resizeMode={resizeMode} /> : null}
      {!loaded && !hasFallbackLayer ? <View style={styles.resilientImageSkeleton} /> : null}
      <Image
        accessibilityLabel={alt}
        source={renderSource}
        style={[imageBaseStyle || styles.resilientImage, imageStyle]}
        resizeMode={resizeMode}
        fadeDuration={160}
        onLoad={(event) => {
          setLoaded(true);
          onImageLoad?.(event.nativeEvent.source);
        }}
        onError={() => {
          if (sourceIndex < sources.length - 1) {
            setLoaded(false);
            setSourceIndex((current) => current + 1);
          } else {
            setLoaded(true);
            setFailed(true);
          }
        }}
      />
    </View>
  );
});

const ProductImage = memo(function ProductImage({ product, tryOn, style, resizeMode, alt, fallbackIcon = 'image-outline', verifyPrivateTryOn = false, onLoadSuccess, onLoadFailure }) {
  const privateMediaSession = useContext(PrivateMediaSessionContext);
  const [imageIndex, setImageIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [renewedUri, setRenewedUri] = useState('');
  const [privateTryOnUri, setPrivateTryOnUri] = useState('');
  const [privateTryOnSession, setPrivateTryOnSession] = useState('');
  const [privateTryOnStatus, setPrivateTryOnStatus] = useState('loading');
  const renewalAttempted = useRef('');
  const sourceEpoch = useRef(0);
  const previewCallbacks = useRef({});
  previewCallbacks.current = { onLoadSuccess, onLoadFailure };
  const tryOnUrl = tryOnImageUrl(tryOn);
  const isPrivateTryOn = Boolean(verifyPrivateTryOn && tryOnUrl && privateMediaPath(tryOnUrl, imageUrl('/api/health')));
  const cachedTryOnUri = isPrivateTryOn ? cachedPrivateImage(tryOnUrl, { apiOrigin: imageUrl('/api/health'), sessionToken: privateMediaSession }) : '';
  const effectivePrivateTryOnStatus = cachedTryOnUri ? 'ready' : privateTryOnSession === privateMediaSession ? privateTryOnStatus : 'loading';
  const imageUrls = useMemo(() => (
    tryOnUrl ? [tryOnUrl] : (product?.imageUrls?.length ? product.imageUrls : [product?.imageUrl]).filter(Boolean)
  ), [tryOnUrl, product?.imageUrl, product?.imageUrls]);
  const imageSignature = imageUrls.join('|');
  const activeUri = isPrivateTryOn ? (cachedTryOnUri || (privateTryOnSession === privateMediaSession ? privateTryOnUri : '')) : (renewedUri || imageUrls[imageIndex]);
  const source = useMemo(() => (activeUri ? {
    uri: activeUri,
    ...(!isPrivateTryOn && /^https?:\/\//i.test(activeUri) ? { cache: 'force-cache' } : {})
  } : null), [activeUri, isPrivateTryOn]);
  const renderSource = authenticatedMediaSource(source, { apiOrigin: imageUrl('/api/health'), sessionToken: privateMediaSession });

  useEffect(() => {
    if (!isPrivateTryOn) {
      setPrivateTryOnUri('');
      setPrivateTryOnSession('');
      setPrivateTryOnStatus('loading');
      return undefined;
    }
    setPrivateTryOnUri('');
    setPrivateTryOnSession('');
    setPrivateTryOnStatus('loading');
    if (!privateMediaSession) {
      setPrivateTryOnStatus('failed');
      return undefined;
    }
    let active = true;
    const timeout = setTimeout(() => {
      active = false;
      setPrivateTryOnSession(privateMediaSession);
      setPrivateTryOnStatus('failed');
    }, 45000);
    recoverPrivateImage(tryOnUrl, privateMediaSession)
      .then((uri) => {
        if (!active) return;
        setPrivateTryOnSession(privateMediaSession);
        setPrivateTryOnUri(uri || '');
        setPrivateTryOnStatus(uri ? 'ready' : 'failed');
      })
      .catch(() => { if (active) { setPrivateTryOnSession(privateMediaSession); setPrivateTryOnStatus('failed'); } })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); };
  }, [isPrivateTryOn, tryOnUrl, privateMediaSession]);

  useEffect(() => {
    sourceEpoch.current += 1;
    renewalAttempted.current = '';
    setRenewedUri('');
    setImageIndex(0);
    setLoaded(false);
    setFailed(false);
    return () => { sourceEpoch.current += 1; };
  }, [product?.id, tryOnUrl, imageSignature, privateMediaSession]);

  useEffect(() => {
    if (!isPrivateTryOn || effectivePrivateTryOnStatus !== 'ready' || loaded || failed) return undefined;
    const timeout = setTimeout(() => setFailed(true), 12000);
    return () => clearTimeout(timeout);
  }, [isPrivateTryOn, effectivePrivateTryOnStatus, privateTryOnUri, loaded, failed]);

  useEffect(() => {
    if (!isPrivateTryOn) return;
    if (effectivePrivateTryOnStatus === 'failed' || failed) previewCallbacks.current.onLoadFailure?.();
    else if (loaded) previewCallbacks.current.onLoadSuccess?.();
  }, [isPrivateTryOn, effectivePrivateTryOnStatus, failed, loaded]);

  if (isPrivateTryOn && effectivePrivateTryOnStatus === 'loading') {
    return (
      <View style={[style, styles.productImageFallback]} accessibilityLabel="Loading your AI Try-On image">
        <ActivityIndicator size="small" color="#9b8f89" />
        <Text style={styles.productImageFallbackText}>Loading your Try-On image…</Text>
      </View>
    );
  }

  if (!renderSource || failed || (isPrivateTryOn && effectivePrivateTryOnStatus === 'failed')) {
    return (
      <View style={[style, styles.productImageFallback]} accessibilityLabel={alt || product?.title || product?.name || 'Product image unavailable'}>
        <Ionicons name={fallbackIcon} size={26} color="#9b8f89" />
        <Text style={styles.productImageFallbackText}>{tryOnUrl ? 'Try-On image unavailable' : 'No image'}</Text>
      </View>
    );
  }

  return (
    <View style={[style, styles.productImageFrame]}>
      {!loaded ? <View style={styles.productImageSkeleton} /> : null}
      <Image
        accessibilityLabel={alt || product?.title || product?.name || 'Product image'}
        source={renderSource}
        style={[StyleSheet.absoluteFillObject, styles.productImage]}
        resizeMode={resizeMode || productImageResizeMode(tryOn)}
        fadeDuration={160}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (isPrivateTryOn) { setFailed(true); return; }
          if (source?.uri && renewalAttempted.current !== imageSignature && privateMediaPath(source.uri, imageUrl('/api/health'))) {
            renewalAttempted.current = imageSignature;
            const epoch = sourceEpoch.current;
            recoverPrivateImage(source.uri, privateMediaSession)
              .then((renewed) => {
                if (epoch !== sourceEpoch.current) return;
                if (renewed) { setRenewedUri(renewed); setLoaded(false); return; }
                if (imageIndex < imageUrls.length - 1) { setImageIndex((current) => current + 1); setRenewedUri(''); setLoaded(false); }
                else { setLoaded(true); setFailed(true); }
              })
              .catch(() => {
                if (epoch !== sourceEpoch.current) return;
                if (imageIndex < imageUrls.length - 1) { setImageIndex((current) => current + 1); setRenewedUri(''); setLoaded(false); }
                else { setLoaded(true); setFailed(true); }
              });
            return;
          }
          if (imageIndex < imageUrls.length - 1) {
            setRenewedUri('');
            setLoaded(false);
            setImageIndex((current) => current + 1);
          } else {
            setLoaded(true);
            setFailed(true);
          }
        }}
      />
    </View>
  );
});

function productListPath(query, extras = {}) {
  const search = new URLSearchParams(query);
  Object.entries(extras).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const nextQuery = search.toString();
  return `/products${nextQuery ? `?${nextQuery}` : ''}`;
}

function uniqueProductsById(products = []) {
  const seen = new Set();
  return products.filter((product) => {
    if (!product?.id) return false;
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

function productDiscountPercent(product) {
  const price = Number(product?.price || 0);
  const compareAtPrice = Number(product?.compareAtPrice || 0);
  if (!price || !compareAtPrice || compareAtPrice <= price) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

function productMetric(product, keys = []) {
  return keys.reduce((best, key) => Math.max(best, Number(product?.[key] || 0)), 0);
}

function uniqueProductsWithImages(products = []) {
  const seen = new Set();
  return products.filter((product) => {
    if (!product?.id || !product?.imageUrl || seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

function productImageKey(productOrImage) {
  const image = typeof productOrImage === 'string' ? productOrImage : productOrImage?.imageUrl;
  return String(image || '').trim().split('?')[0].toLowerCase();
}

function pickCardProduct(productPools = [], usedImageKeys = new Set(), matcher = () => true) {
  const pools = Array.isArray(productPools[0]) ? productPools : [productPools];
  const candidates = uniqueProductsWithImages(pools.flat().filter(Boolean));
  const product = candidates.find((candidate) => {
    const key = productImageKey(candidate);
    return key && !usedImageKeys.has(key) && matcher(candidate);
  });
  if (product) usedImageKeys.add(productImageKey(product));
  return product || null;
}

function productMatchesAnyCategory(product, words = []) {
  const text = [product?.category, product?.name, product?.tags?.join?.(' ') || product?.tags]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return words.some((word) => text.includes(word));
}

function stableExploreProducts(products = []) {
  return [...products]
    .sort((a, b) => String(a.id || a.name || '').localeCompare(String(b.id || b.name || '')))
    .sort((a, b) => ((String(a.id || '').charCodeAt(0) || 0) % 7) - ((String(b.id || '').charCodeAt(0) || 0) % 7));
}

function fillProductRailProducts(products = [], fallbackProducts = [], minimum = 8) {
  const primary = uniqueProductsWithImages(products);
  if (primary.length >= minimum) return primary;
  const seen = new Set(primary.map((product) => product.id));
  const fillers = stableExploreProducts(fallbackProducts).filter((product) => product?.id && product?.imageUrl && !seen.has(product.id));
  return uniqueProductsWithImages([...primary, ...fillers]).slice(0, minimum);
}

function homeProductGroup(product = {}) {
  const text = [
    product.category,
    product.subcategory,
    product.name,
    product.title,
    Array.isArray(product.tags) ? product.tags.join(' ') : product.tags
  ].filter(Boolean).join(' ').toLowerCase();
  if (/shoe|sneaker|sandal|heel|footwear|boot|loafer/.test(text)) return 'footwear';
  if (/watch/.test(text)) return 'watches';
  if (/jewel|earring|necklace|ring|bracelet|accessor/.test(text)) return 'accessories';
  if (/glass|eyewear|sunglass|goggle/.test(text)) return 'eyewear';
  if (/saree|kurti|lehenga|ethnic|salwar|dupatta/.test(text)) return 'ethnic';
  if (/dress|gown|bodycon|jumpsuit/.test(text)) return 'dresses';
  if (/shirt|t-shirt|tee|top|blouse|crop/.test(text)) return 'tops';
  if (/jean|denim|pant|trouser|bottom|skirt|short/.test(text)) return 'bottoms';
  if (/jacket|blazer|coat|hoodie|sweater|sweatshirt/.test(text)) return 'layers';
  if (/beauty|makeup|cream|serum|lipstick|skin|hair|perfume/.test(text)) return 'beauty';
  return String(product.category || product.displayLabel || 'other').toLowerCase() || 'other';
}

function fashionFirstHomeProducts(products = []) {
  const priority = {
    dresses: 0,
    ethnic: 0,
    tops: 0,
    bottoms: 0,
    layers: 0,
    footwear: 1,
    accessories: 2,
    eyewear: 2,
    watches: 4,
    beauty: 4,
    other: 3
  };
  return uniqueProductsWithImages(products)
    .map((product, index) => ({ product, index, rank: priority[homeProductGroup(product)] ?? 3 }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ product }) => product);
}

function diversifyHomeProducts(products = [], fallbackProducts = [], minimum = 8) {
  const pool = fillProductRailProducts(products, fallbackProducts, Math.max(minimum, 12));
  const groups = new Map();
  pool.forEach((product) => {
    const group = homeProductGroup(product);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(product);
  });
  const diversified = [];
  const used = new Set();
  const groupKeys = [...groups.keys()].sort((a, b) => groups.get(a).length - groups.get(b).length || a.localeCompare(b));
  while (diversified.length < pool.length) {
    let added = false;
    groupKeys.forEach((group) => {
      const next = groups.get(group)?.find((product) => !used.has(product.id));
      if (!next) return;
      used.add(next.id);
      diversified.push(next);
      added = true;
    });
    if (!added) break;
  }
  pool.forEach((product) => {
    if (!used.has(product.id)) diversified.push(product);
  });
  return uniqueProductsWithImages(diversified);
}

function buildHomeAiRecommendationCards(products = [], seed = 0, feedGender = '') {
  const allProducts = uniqueProductsWithImages(products).filter((product) => {
    if (product.isAvailable === false) return false;
    if (!feedGender) return true;
    const gender = String(product.gender || '').toLowerCase();
    return !gender || gender === feedGender || gender === 'unisex';
  });
  const outfitProducts = allProducts.filter((product) => (
    productMatchesAnyCategory(product, ['dress', 'gown', 'saree', 'kurti', 'lehenga', 'jumpsuit', 'co-ord', 'set', 'top', 'shirt', 'blazer', 'jacket', 'pants', 'jeans', 'skirt'])
  ));
  const pool = outfitProducts.length >= 4 ? outfitProducts : allProducts;
  const stablePool = stableExploreProducts(pool);
  if (!stablePool.length) return [];
  const offset = Math.abs(Number(seed) || 0) % stablePool.length;
  const rotated = [...stablePool.slice(offset), ...stablePool.slice(0, offset)];
  const labels = ['Best for today', 'One-piece easy', 'Fresh pairing', 'Style match'];
  const cards = [];
  for (let index = 0; index < rotated.length && cards.length < 4; index += 2) {
    const pair = [rotated[index], rotated[(index + 1) % rotated.length]].filter(Boolean);
    const uniquePair = uniqueProductsWithImages(pair);
    if (!uniquePair.length) continue;
    cards.push({
      id: uniquePair.map((product) => product.id).join('-'),
      title: labels[cards.length % labels.length],
      products: uniquePair
    });
  }
  return cards;
}

function buildHomeOfferCards({ catalogProducts = [], arrivalProducts = [], tryOnPickProducts = [], feedGender = '' }) {
  const pricedProducts = catalogProducts.filter((product) => Number(product.price || 0) > 0);
  const catalogProductsWithImages = uniqueProductsWithImages(catalogProducts);
  const discountedProducts = uniqueProductsWithImages(catalogProducts)
    .filter((product) => productDiscountPercent(product) > 0)
    .sort((a, b) => productDiscountPercent(b) - productDiscountPercent(a));
  const under499Products = pricedProducts.filter((product) => Number(product.price || 0) < 499);
  const under999Products = pricedProducts.filter((product) => Number(product.price || 0) < 999);
  const genderProducts = feedGender
    ? catalogProducts.filter((product) => String(product.gender || '').toLowerCase() === feedGender)
    : [];
  const usedImageKeys = new Set();
  const cards = [];
  const contextText = (product) => `${product?.category || ''} ${product?.name || ''} ${Array.isArray(product?.tags) ? product.tags.join(' ') : product?.tags || ''}`;
  const discountedProduct = pickCardProduct(discountedProducts, usedImageKeys);
  const under499Product = pickCardProduct(under499Products, usedImageKeys);
  const under999Product = pickCardProduct(under999Products, usedImageKeys);
  const arrivalProduct = pickCardProduct(arrivalProducts, usedImageKeys);
  const tryOnProduct = pickCardProduct(tryOnPickProducts, usedImageKeys);
  const genderProduct = pickCardProduct(genderProducts, usedImageKeys);
  const occasionProduct = pickCardProduct(
    [arrivalProducts, catalogProductsWithImages],
    usedImageKeys,
    (product) => /dress|saree|gown|jumpsuit|co-ord|set|blazer|jacket|occasion|party|date|work/i.test(contextText(product))
  ) || pickCardProduct([arrivalProducts, catalogProductsWithImages], usedImageKeys);

  if (discountedProduct) cards.push({
    id: 'deal-drop',
    kicker: 'Top Deals',
    title: `Up to ${productDiscountPercent(discountedProduct)}% off`,
    copy: `${discountedProducts.length} live markdowns`,
    cta: 'Shop now',
    route: 'shop',
    params: { discounted: 'true' },
    product: discountedProduct
  });
  if (under499Product) cards.push({
    id: 'under-499-offer',
    kicker: 'Budget Edit',
    title: 'Under ₹499',
    copy: `${under499Products.length} catalog picks`,
    cta: 'Explore',
    route: 'shop',
    params: { maxPrice: '499' },
    product: under499Product
  });
  if (under999Product) cards.push({
    id: 'under-999-offer',
    kicker: 'Easy Prices',
    title: 'Under ₹999',
    copy: `${under999Products.length} styles available`,
    cta: 'View picks',
    route: 'shop',
    params: { maxPrice: '999' },
    product: under999Product
  });
  if (arrivalProduct) cards.push({
    id: 'new-arrivals-offer',
    kicker: 'Fresh Drop',
    title: 'New arrivals',
    copy: `${arrivalProducts.length} recent styles`,
    cta: 'Shop new',
    route: 'shop',
    params: { sort: 'newest' },
    product: arrivalProduct
  });
  if (tryOnProduct) cards.push({
    id: 'ai-tryon-offer',
    kicker: 'AI Try-On',
    title: 'See it on you',
    copy: `${tryOnPickProducts.length} preview-ready picks`,
    cta: 'Try now',
    route: 'custom',
    params: {},
    product: tryOnProduct
  });
  if (genderProduct) cards.push({
    id: 'gender-feed-offer',
    kicker: feedGender === 'women' ? "Women's edit" : "Men's edit",
    title: feedGender === 'women' ? 'Curated for women' : 'Curated for men',
    copy: `${genderProducts.length} matching styles`,
    cta: 'Open edit',
    route: 'shop',
    params: { gender: feedGender },
    product: genderProduct
  });
  if (occasionProduct) cards.push({
    id: 'occasion-edit-offer',
    kicker: 'Occasion edit',
    title: 'Plan every look',
    copy: 'Work, dates, weekends',
    cta: 'Get ideas',
    route: 'tryon',
    params: {},
    product: occasionProduct
  });
  return cards.slice(0, 6);
}

function useProducts(params, token) {
  const enabled = params?.enabled !== false;
  const fetchAll = params?.all === true;
  const pageSize = useMemo(() => {
    const limit = Number(params?.limit);
    return Number.isFinite(limit) && limit > 0 ? Math.min(limit, 96) : 96;
  }, [params?.limit]);
  const query = useMemo(() => {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (key === 'all' || key === 'enabled' || key === 'refreshKey') return;
      if (value !== undefined && value !== null && value !== '') search.set(key, value);
    });
    return search.toString();
  }, [JSON.stringify(params || {})]);
  const cacheKey = `products:${query}:${fetchAll}:${pageSize}:${enabled}`;
  const emptyState = () => ({
    products: [],
    total: 0,
    facets: { brands: [], categories: [], categoryCounts: [] },
    loading: true,
    error: ''
  });
  const [state, setState] = useState(() => readScreenSnapshot(cacheKey, token) || emptyState());

  const load = useCallback(() => {
    let alive = true;
    if (!enabled) {
      setState({ products: [], total: 0, facets: { brands: [], categories: [], categoryCounts: [] }, loading: false, error: '' });
      return () => {
        alive = false;
      };
    }
    setState(readScreenSnapshot(cacheKey, token) || emptyState());
    const loadProducts = async () => {
      if (!fetchAll) return api(productListPath(query));

      const firstPage = await api(productListPath(query, { limit: pageSize, skip: 0 }));
      const allProducts = [...(firstPage.products || [])];
      const total = Number(firstPage.total) || allProducts.length;
      let skip = allProducts.length;

      while (alive && skip < total) {
        const page = await api(productListPath(query, { limit: pageSize, skip }));
        const products = page.products || [];
        if (!products.length) break;
        allProducts.push(...products);
        skip += products.length;
      }

      return { ...firstPage, products: allProducts };
    };

    loadProducts()
      .then((data) => {
        if (!alive) return;
        const products = uniqueProductsById(normalizeProducts(data.products || []));
        const nextState = {
          products,
          total: data.total || 0,
          facets: data.facets || { brands: [], categories: [], categoryCounts: [] },
          loading: false,
          error: ''
        };
        writeScreenSnapshot(cacheKey, token, nextState);
        setState(nextState);
      })
      .catch((error) => {
        if (!alive) return;
        setState((current) => ({ ...current, loading: false, error: error.message }));
      });
    return () => {
      alive = false;
    };
  }, [query, token, fetchAll, pageSize, enabled, cacheKey, params?.refreshKey]);

  useEffect(load, [load]);
  return { ...state, reload: load };
}

function usePagedShopProducts(filters, token, missionPreset, pageSize = shopProductPageSize) {
  const query = useMemo(() => {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, value);
    });
    return search.toString();
  }, [JSON.stringify(filters)]);
  const cacheKey = `paged-products:${query}:${missionPreset?.id || ''}:${pageSize}`;
  const emptyState = () => ({ products: [], total: 0, loading: true, loadingMore: false, error: '', loadMoreError: '', hasMore: false });
  const [state, setState] = useState(() => readScreenSnapshot(cacheKey, token) || emptyState());
  const pageRef = useRef(null);

  useEffect(() => {
    const cached = readScreenSnapshot(cacheKey, token);
    const cachedProducts = cached?.products || [];
    const page = {
      alive: true, inFlight: false, failed: false,
      skip: cached?.pageSkip ?? cachedProducts.length, total: cached?.total ?? Infinity,
      hasMore: cached ? cached.hasMore : true,
      products: cachedProducts, ids: new Set(cachedProducts.map((product) => product.id)), load: null
    };
    pageRef.current = page;
    setState(cached || emptyState());

    page.load = async (retry = false) => {
      if (!page.alive || page.inFlight || !page.hasMore || (page.failed && !retry)) return;
      page.failed = false;
      page.inFlight = true;
      const firstPage = page.skip === 0;
      if (!firstPage) setState((current) => ({ ...current, loadingMore: true, loadMoreError: '' }));
      try {
        // Some deployed catalogs still include marketplace rows that normalizeProducts hides.
        // Keep advancing through those pages until a visible item arrives or the API is exhausted.
        while (page.alive && page.hasMore) {
          const data = await api(productListPath(query, { limit: pageSize, skip: page.skip, includeTotal: 'true' }));
          if (!page.alive) return;
          const records = Array.isArray(data.products) ? data.products : [];
          const incoming = orderProductsForMission(uniqueProductsById(normalizeProducts(records)), missionPreset);
          if (incoming.length && incoming.every((product) => page.ids.has(product.id))) {
            page.failed = true;
            setState((current) => ({ ...current, loading: false, loadingMore: false, loadMoreError: 'More products are unavailable from the catalog service right now.' }));
            return;
          }
          incoming.forEach((product) => page.ids.add(product.id));
          page.skip += records.length;
          page.total = Number.isFinite(Number(data.total)) ? Number(data.total) : page.skip;
          page.hasMore = records.length > 0 && page.skip < page.total;
          page.products = uniqueProductsById(firstPage ? incoming : [...page.products, ...incoming]);
          if (incoming.length || !page.hasMore) break;
        }
        const nextState = {
          products: page.products,
          total: page.total,
          loading: false,
          loadingMore: false,
          error: '',
          loadMoreError: '',
          hasMore: page.hasMore,
          pageSkip: page.skip
        };
        writeScreenSnapshot(cacheKey, token, nextState);
        setState(nextState);
      } catch (error) {
        if (!page.alive) return;
        page.failed = true;
        setState((current) => ({ ...current, loading: false, loadingMore: false, error: firstPage ? error.message : '', loadMoreError: firstPage ? '' : error.message }));
      } finally {
        page.inFlight = false;
      }
    };

    if (!cached) page.load();
    return () => {
      page.alive = false;
      if (pageRef.current === page) pageRef.current = null;
    };
  }, [query, token, missionPreset?.id, pageSize, cacheKey]);

  const loadMore = useCallback(() => pageRef.current?.load(), []);
  const retryLoadMore = useCallback(() => pageRef.current?.load(true), []);
  return { ...state, loadMore, retryLoadMore };
}

function useRecommendedProducts(user, token, limit = 8, refreshKey = 0) {
  const cacheKey = `recommendations:${user?.id || user?._id || 'guest'}:${limit}`;
  const emptyState = () => ({
    products: [],
    total: 0,
    facets: { brands: [], categories: [], categoryCounts: [] },
    loading: Boolean(user),
    error: ''
  });
  const [state, setState] = useState(() => readScreenSnapshot(cacheKey, token) || emptyState());

  useEffect(() => {
    let alive = true;
    if (!user) {
      setState({ products: [], total: 0, facets: { brands: [], categories: [], categoryCounts: [] }, loading: false, error: '' });
      return () => {
        alive = false;
      };
    }
    setState(readScreenSnapshot(cacheKey, token) || emptyState());
    api(`/recommendations/for-you?limit=${encodeURIComponent(limit)}`)
      .then((data) => {
        if (!alive) return;
        const products = uniqueProductsById(normalizeProducts(data.products || []));
        const nextState = {
          products,
          total: data.total || products.length,
          facets: data.facets || { brands: [], categories: [], categoryCounts: [] },
          loading: false,
          error: ''
        };
        writeScreenSnapshot(cacheKey, token, nextState);
        setState(nextState);
      })
      .catch((error) => {
        if (!alive) return;
        setState((current) => ({ ...current, loading: false, error: error.message }));
      });
    return () => {
      alive = false;
    };
  }, [Boolean(user), user?.id, user?._id, token, limit, refreshKey, cacheKey]);

  return state;
}

function useApiState(path, token, enabled = true, emptyData = {}) {
  const cacheKey = `api-state:${path}`;
  const [state, setState] = useState(() => readScreenSnapshot(cacheKey, token) || { data: emptyData, loading: Boolean(enabled), error: '' });

  const load = useCallback(() => {
    if (!enabled || !path) {
      setState({ data: emptyData, loading: false, error: '' });
      return undefined;
    }
    let alive = true;
    setState(readScreenSnapshot(cacheKey, token) || { data: emptyData, loading: true, error: '' });
    api(path)
      .then((data) => {
        if (alive) {
          const nextState = { data: data || emptyData, loading: false, error: '' };
          writeScreenSnapshot(cacheKey, token, nextState);
          setState(nextState);
        }
      })
      .catch((error) => {
        if (alive) setState((current) => ({ ...current, loading: false, error: error.message }));
      });
    return () => {
      alive = false;
    };
  }, [path, token, enabled, cacheKey]);

  useEffect(load, [load]);
  return { ...state, reload: load };
}

function useTryOns(user, products, token) {
  const productIds = useMemo(
    () => [...new Set((products || []).map((product) => product?.id).filter(Boolean))].slice(0, 96).join(','),
    [products]
  );
  const cacheKey = `tryons:${user?.id || user?._id || 'guest'}:${productIds}`;
  const [tryOns, setTryOns] = useState(() => readScreenSnapshot(cacheKey, token) || {});

  useEffect(() => {
    if (!user || !productIds) {
      setTryOns({});
      return undefined;
    }
    let alive = true;
    setTryOns(readScreenSnapshot(cacheKey, token) || {});
    api(`/tryons?productIds=${encodeURIComponent(productIds)}`)
      .then((data) => {
        if (!alive) return;
        const saved = Object.fromEntries((data.tryOns || []).map((tryOn) => [tryOn.productId, tryOn]));
        writeScreenSnapshot(cacheKey, token, saved);
        setTryOns(saved);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user?.id, user?.bodyPhotoUrl, productIds, token, cacheKey]);

  return [tryOns, setTryOns];
}

function showMediaPermissionAlert(title, message, permission) {
  if (permission?.canAskAgain !== false) {
    Alert.alert(title, message);
    return;
  }

  Alert.alert(title, message, [
    { text: 'Not now', style: 'cancel' },
    {
      text: 'Open Settings',
      onPress: () => {
        Linking.openSettings().catch(() => {
          Alert.alert('Settings unavailable', 'Open Settings and enable access for Lookmefy.');
        });
      },
    },
  ]);
}

async function pickImage() {
  // The image-only system picker grants access to the selected photo; broad library access is unnecessary.
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9
    });
    if (result.canceled) return null;
    return result.assets?.[0] || null;
  } catch (error) {
    if (/permission|denied/i.test(error?.message || '')) {
      showMediaPermissionAlert('Photo access needed', 'Choose a photo or enable photo access for Lookmefy in Settings.', { canAskAgain: false });
    } else {
      Alert.alert('Photos unavailable', 'Your photos could not be opened. Please try again.');
    }
    return null;
  }
}

async function takePhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    showMediaPermissionAlert(
      'Camera access needed',
      'Allow camera access to take a Lookmefy profile photo.',
      permission,
    );
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9
  });
  if (result.canceled) return null;
  return result.assets?.[0] || null;
}

function DecorativeCloseIcon({ size, color }) {
  return (
    <View collapsable={false} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Ionicons name="close" size={size} color={color} accessible={false} />
    </View>
  );
}

function AppButton({ label, icon, variant = 'primary', disabled, onPress, style, labelProps }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'ghost' && styles.ghostButton,
        pressed && !disabled && styles.buttonPressed,
        disabled && styles.disabledButton,
        style
      ]}
    >
      {icon ? <Ionicons name={icon} size={17} color={variant === 'primary' ? '#fff' : '#111827'} /> : null}
      <Text style={[styles.buttonText, variant !== 'primary' && styles.secondaryButtonText]} {...labelProps}>{label}</Text>
    </Pressable>
  );
}

function BrandLogo({ compact = false, light = false, style, textStyle, textProps, symbolStyle, dividerStyle }) {
  return (
    <View style={[styles.brandLogo, compact && styles.brandLogoCompact, style]}>
      <Image
        source={logoSymbol}
        style={[
          styles.brandLogoSymbol,
          compact && styles.brandLogoSymbolCompact,
          light && styles.brandLogoSymbolLight,
          symbolStyle
        ]}
        resizeMode="contain"
      />
      <View style={[styles.brandLogoDivider, compact && styles.brandLogoDividerCompact, light && styles.brandLogoDividerLight, dividerStyle]} />
      <Text style={[styles.brandLogoText, compact && styles.brandLogoTextCompact, light && styles.brandLogoTextLight, textStyle]} numberOfLines={1} {...textProps}>
        Lookmefy
      </Text>
    </View>
  );
}

function Header({ user, canGoBack, onBack, onNavigate, onLogout }) {
  const avatarUri = userAvatarUrl(user);
  const avatarResizeMode = userAvatarResizeMode(user);
  const avatarImageStyle = avatarImageStyleForUser(user, 34);
  const avatarImageBaseStyle = avatarImageBaseStyleForUser(user);
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <View>
          <Pressable onPress={() => onNavigate('home')}>
            <BrandLogo />
          </Pressable>
          <Text style={styles.headerSub}>{user ? `${user.tokens} tokens ready` : 'AI fitting room'}</Text>
          {user?.bodyPhotoStatus === 'generating' ? <Text style={styles.headerNotice}>Profile preparing</Text> : null}
        </View>
      </View>
      <View style={styles.headerActions}>
        {user ? (
          <TouchableOpacity style={styles.iconButton} onPress={() => onNavigate('profile')}>
            {avatarUri ? <ResilientImage source={{ uri: imageUrl(avatarUri) }} style={styles.headerAvatar} imageStyle={avatarImageStyle} imageBaseStyle={avatarImageBaseStyle} resizeMode={avatarResizeMode} fallbackIcon="person-outline" /> : <InitialsAvatar user={user} style={styles.headerAvatar} textStyle={styles.headerAvatarInitials} />}
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.iconButton} onPress={() => onNavigate('tokens')}>
          <Ionicons name="sparkles-outline" size={19} color="#111827" />
        </TouchableOpacity>
        {user ? (
          <TouchableOpacity style={styles.iconButton} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={20} color="#111827" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.iconButton} onPress={() => onNavigate('login')}>
            <Ionicons name="person-outline" size={20} color="#111827" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function userCreditBalance(user) {
  if (!user) return 0;
  const rawCredits = Number(
    user?.credits?.remaining ??
    user?.tokens ??
    user?.remainingCredits ??
    user?.creditBalance ??
    0
  );
  if (!Number.isFinite(rawCredits) || rawCredits < 0) return 0;
  return Math.floor(rawCredits);
}

function headerCreditLabel(user) {
  const rawCredits = userCreditBalance(user);
  if (rawCredits >= 1000000) return `${Math.floor(rawCredits / 100000) / 10}M`;
  if (rawCredits >= 1000) {
    const compact = rawCredits / 1000;
    const formatted = compact >= 10 ? Math.floor(compact).toString() : compact.toFixed(1).replace(/\.0$/, '');
    return `${formatted}k`;
  }
  return rawCredits.toLocaleString('en-IN');
}

function AppHeader({ onNavigate, title = 'Lookmefy', leftIcon = 'menu-outline', leftRoute = 'profile', rightIcon = 'receipt-outline', rightRoute = 'orders', user, showAvatar = false, hideLeft = true, brandAlign = 'left', compact = false, showWishlist = true, showSearch = true, preserveWordmarkOnNarrow = false, registerTourTarget, tourTargetKeys = {} }) {
  const { width, fontScale } = useWindowDimensions();
  const narrowHeader = width < 390;
  const compactToSymbol = width / Math.max(1, fontScale) < 390
    && (!preserveWordmarkOnNarrow || width < 350 || fontScale > 1);
  const openLeft = () => leftRoute && onNavigate(leftRoute);
  const openRight = () => rightRoute && onNavigate(rightRoute);
  const showWishlistAction = showWishlist && !showAvatar;
  const showProfileAction = Boolean(user) && !showAvatar;
  const brandLeft = brandAlign === 'left';
  const avatarTourTarget = useTourTarget(tourTargetKeys.avatar, registerTourTarget);
  const avatarUri = userAvatarUrl(user);
  const avatarResizeMode = userAvatarResizeMode(user);
  const avatarImageStyle = avatarImageStyleForUser(user, 32);
  const avatarImageBaseStyle = avatarImageBaseStyleForUser(user);
  const creditLabel = headerCreditLabel(user);
  const creditAccessibilityLabel = `Open credits, ${userCreditBalance(user).toLocaleString('en-IN')} credits available`;
  return (
    <View style={[styles.appHeader, compact && styles.appHeaderCompact, narrowHeader && styles.appHeaderNarrow]}>
      <SurfaceBackdrop />
      {!brandLeft ? (
        <View style={[styles.appHeaderSide, styles.appHeaderLeftSide]}>
          {hideLeft ? null : (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open left action" style={styles.appHeaderAction} onPress={openLeft}>
              <Ionicons name={leftIcon} size={22} color="#171412" />
            </TouchableOpacity>
          )}
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Go to feed" onPress={() => onNavigate('home')} style={[styles.appHeaderBrandWrap, brandLeft && styles.appHeaderBrandWrapLeft, compactToSymbol && styles.appHeaderBrandWrapNarrow]}>
        {title === 'Lookmefy' ? (
          compactToSymbol
            ? <Image source={logoSymbol} style={styles.appHeaderNarrowLogo} resizeMode="contain" />
            : <BrandLogo compact={compact} style={preserveWordmarkOnNarrow && narrowHeader ? styles.aiStudioHeaderBrandLogo : null} textStyle={preserveWordmarkOnNarrow && narrowHeader ? styles.aiStudioHeaderBrandText : null} textProps={preserveWordmarkOnNarrow && narrowHeader ? { maxFontSizeMultiplier: 1 } : undefined} />
        ) : <Text style={styles.appHeaderBrand} numberOfLines={1}>{title}</Text>}
      </Pressable>
      <View style={[styles.appHeaderSide, styles.appHeaderRightSide, narrowHeader && styles.appHeaderRightSideNarrow]}>
        {showWishlistAction ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open wishlist" style={styles.appHeaderAction} onPress={() => onNavigate('wishlist')}>
            <Ionicons name="heart-outline" size={21} color="#171412" />
          </TouchableOpacity>
        ) : null}
        {!showAvatar ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={creditAccessibilityLabel} style={[styles.appHeaderAction, styles.appHeaderCreditAction]} onPress={() => onNavigate('tokens')}>
            <Ionicons name="sparkles-outline" size={11} color="#171412" />
            <Text style={styles.appHeaderCreditText} numberOfLines={1}>{creditLabel}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity ref={avatarTourTarget.ref} onLayout={avatarTourTarget.onLayout} accessibilityRole="button" accessibilityLabel={rightRoute === 'orders' ? 'Open orders' : 'Open bag'} style={styles.appHeaderAction} onPress={openRight}>
          {showAvatar ? (
            avatarUri ? <ResilientImage source={{ uri: imageUrl(avatarUri) }} style={styles.appHeaderAvatar} imageStyle={avatarImageStyle} imageBaseStyle={avatarImageBaseStyle} resizeMode={avatarResizeMode} fallbackIcon="person-outline" /> : <InitialsAvatar user={user} style={styles.appHeaderAvatar} textStyle={styles.appHeaderAvatarInitials} />
          ) : <Ionicons name={rightIcon} size={20} color="#171412" />}
        </TouchableOpacity>
        {showProfileAction ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open profile" style={styles.appHeaderAction} onPress={() => onNavigate('profile')}>
            {avatarUri ? <ResilientImage source={{ uri: imageUrl(avatarUri) }} style={styles.appHeaderAvatar} imageStyle={avatarImageStyle} imageBaseStyle={avatarImageBaseStyle} resizeMode={avatarResizeMode} fallbackIcon="person-outline" /> : <InitialsAvatar user={user} style={styles.appHeaderAvatar} textStyle={styles.appHeaderAvatarInitials} />}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function SurfaceBackdrop({ intensity = 34 }) {
  return (
    <BlurView
      pointerEvents="none"
      intensity={intensity}
      tint={Platform.OS === 'ios' ? 'systemUltraThinMaterialLight' : 'light'}
      experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
      blurReductionFactor={2.5}
      style={[StyleSheet.absoluteFillObject, styles.surfaceBackdrop]}
    />
  );
}

function BottomNav({ route = { name: 'home' }, onNavigate = () => {} }) {
  const layout = useResponsiveLayout();
  const { width, fontScale } = useWindowDimensions();
  const compactNav = width < 360 || fontScale > 1.15;
  // Scale the font and line height together so the fixed tab bar stays readable.
  const navTextScale = Math.max(1, Math.min(Number(fontScale) || 1, 1.3));
  const navTextSize = { fontSize: 10.5 * navTextScale, lineHeight: 13 * navTextScale };
  const routeName = route?.name || 'home';
  const activeRoute = routeName === 'product' || routeName === 'wishlist' || routeName === 'search'
      ? 'shop'
      : routeName;
  const items = [
    ['home', 'home-outline', 'home', 'Home'],
    ['shop', 'grid-outline', 'grid', 'Categories'],
    ['tryon', 'scan-outline', 'scan', 'Try-On'],
    ['closet', 'shirt-outline', 'shirt', 'Wardrobe'],
    ['stylebot', 'sparkles-outline', 'sparkles', 'AI Stylist']
  ];
  return (
    <View style={[styles.bottomNav, compactNav && styles.bottomNavCompact, layout.isTablet && styles.bottomNavTablet]}>
      {items.map(([name, icon, activeIcon, label]) => {
        const active = activeRoute === name;
        const displayLabel = compactNav ? ({ shop: 'Shop', closet: 'Closet', stylebot: 'Stylist' }[name] || label) : label;
        return (
          <TouchableOpacity
            key={name}
            activeOpacity={0.82}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            style={styles.navItem}
            onPress={() => {
              Keyboard.dismiss();
              onNavigate(name);
            }}
          >
            <View style={[styles.navIconWrap, active && styles.navIconWrapCenter]}>
              <Ionicons name={active ? activeIcon : icon} size={active ? 21 : 20} color={active ? '#ffffff' : 'rgba(255, 255, 255, 0.78)'} />
            </View>
            <Text numberOfLines={1} allowFontScaling={false} style={[styles.navText, navTextSize, active && styles.navTextActive]}>{displayLabel}</Text>
            <View style={[styles.navActiveUnderline, active && styles.navActiveUnderlineVisible]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Hero({ compact, onNavigate }) {
  return (
    <View style={[styles.hero, compact && styles.heroCompact]}>
      <Image source={images.hero} style={styles.heroImage} resizeMode="cover" />
      <View style={styles.heroOverlay} />
      <View style={styles.heroCopy}>
        <Text style={styles.kicker}>AI Try-On</Text>
        <Text style={styles.heroTitle}>See it on you, before you buy.</Text>
        <Text style={styles.heroText}>Upload once. Try thousands of outfits and shop from top brands.</Text>
        <AppButton label="Start Trying" icon="sparkles-outline" onPress={() => onNavigate('shop')} style={styles.heroButton} />
      </View>
    </View>
  );
}

function StatusPanel({ loading, error, empty, text }) {
  if (loading) {
    return (
      <View style={[styles.statusPanel, styles.surfaceCard, styles.loadingPanel]}>
        <SurfaceBackdrop />
        <View style={styles.skeletonIcon} />
        <View style={styles.skeletonLineWide} />
        <View style={styles.skeletonLine} />
        <Text style={styles.statusText}>{text || 'Loading...'}</Text>
      </View>
    );
  }
  if (error || empty) {
    return (
      <View style={[styles.statusPanel, styles.surfaceCard]}>
        <SurfaceBackdrop />
        <View style={[styles.statusIcon, error ? styles.statusIconError : styles.statusIconEmpty]}>
          <Ionicons name={error ? 'alert-circle-outline' : 'sparkles-outline'} size={22} color={error ? '#9b5658' : '#0f766e'} />
        </View>
        <Text style={styles.statusTitle}>{error ? 'Something needs attention' : 'No products yet'}</Text>
        <Text style={styles.statusText}>{error || text || 'Products will appear here as soon as the catalog is available.'}</Text>
      </View>
    );
  }
  return null;
}

function EmptyStateCard({ icon = 'sparkles-outline', title = 'Nothing here yet', text, actionLabel, actionIcon = 'arrow-forward', onAction, compact }) {
  return (
    <View style={[styles.emptyStateCard, styles.surfaceCard, compact && styles.emptyStateCardCompact]}>
      <SurfaceBackdrop />
      <View style={styles.emptyStateIcon}>
        <Ionicons name={icon} size={24} color="#9b5658" />
      </View>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      {text ? <Text style={styles.emptyStateText}>{text}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={styles.emptyStateButton} activeOpacity={0.86} onPress={onAction}>
          <Text style={styles.emptyStateButtonText}>{actionLabel}</Text>
          <Ionicons name={actionIcon} size={16} color="#ffffff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function InitialsAvatar({ user, style, textStyle }) {
  return (
    <View style={[styles.initialsAvatar, style]}>
      <Text style={[styles.initialsAvatarText, textStyle]}>{userInitials(user)}</Text>
    </View>
  );
}

function SkeletonBlock({ style }) {
  return <View style={[styles.skeletonBlock, style]} />;
}

function ProductCardSkeleton({ variant = 'grid' }) {
  const layout = useResponsiveLayout();
  const useHomeImageFrame = variant === 'homeFrame';
  const responsiveCardStyle = variant === 'carousel' ? null : layout.productGridItemStyle;
  return (
    <View style={[styles.productCard, styles.skeletonProductCard, useHomeImageFrame && styles.productCardHomeFrame, responsiveCardStyle, variant === 'carousel' && styles.productCardCarousel]}>
      <View style={[styles.productImageWrap, useHomeImageFrame && styles.homeProductImageWrap]}>
        <SkeletonBlock style={styles.skeletonFill} />
      </View>
      <View style={styles.productBody}>
        <SkeletonBlock style={styles.skeletonTextLarge} />
        <SkeletonBlock style={styles.skeletonTextMedium} />
        <SkeletonBlock style={styles.skeletonTextSmall} />
      </View>
    </View>
  );
}

function ProductGridSkeleton({ count = 6 }) {
  return (
    <View style={styles.productGrid}>
      {Array.from({ length: count }).map((_, index) => <ProductCardSkeleton key={`product-skeleton-${index}`} variant="homeFrame" />)}
    </View>
  );
}

function HorizontalProductSkeleton({ count = 4 }) {
  return (
    <ScrollView {...horizontalScrollProps} contentContainerStyle={styles.horizontalList}>
      {Array.from({ length: count }).map((_, index) => <ProductCardSkeleton key={`horizontal-product-skeleton-${index}`} variant="carousel" />)}
    </ScrollView>
  );
}

function HomeProductSkeletonGrid({ count }) {
  const layout = useResponsiveLayout();
  const skeletonCount = count || layout.productColumns * 2;
  return Array.from({ length: skeletonCount }).map((_, index) => (
    <View key={`home-product-skeleton-${index}`} style={[styles.homeProductCard, layout.productGridWidthStyle]}>
      <View style={styles.homeProductImageWrap}>
        <SkeletonBlock style={styles.skeletonFill} />
      </View>
      <SkeletonBlock style={[styles.skeletonTextSmall, styles.homeSkeletonLine]} />
      <SkeletonBlock style={[styles.skeletonTextLarge, styles.homeSkeletonLine]} />
      <SkeletonBlock style={[styles.skeletonTextMedium, styles.homeSkeletonLine]} />
    </View>
  ));
}

function HomeJournalSkeletonGrid({ count }) {
  const layout = useResponsiveLayout();
  const skeletonCount = count || (layout.isTablet ? 6 : layout.productColumns * 2);
  return (
    <View style={styles.homeJournalGrid}>
      {Array.from({ length: skeletonCount }).map((_, index) => (
        <View key={`home-journal-skeleton-${index}`} style={[styles.homeJournalProductCard, layout.isTablet && styles.homeJournalProductCardTablet]}>
          <View style={styles.homeJournalImageFrame}>
            <SkeletonBlock style={styles.skeletonFill} />
          </View>
          <View style={styles.homeJournalProductBody}>
            <SkeletonBlock style={styles.skeletonTextSmall} />
            <SkeletonBlock style={styles.skeletonTextLarge} />
            <SkeletonBlock style={styles.skeletonTextMedium} />
          </View>
        </View>
      ))}
    </View>
  );
}

function WardrobeGridSkeleton({ count }) {
  const layout = useResponsiveLayout();
  const skeletonCount = count || layout.productColumns * 2;
  return (
    <View style={styles.closetGrid}>
      {Array.from({ length: skeletonCount }).map((_, index) => (
        <View key={`wardrobe-skeleton-${index}`} style={[styles.closetItemCard, layout.productGridWidthStyle]}>
          <View style={styles.closetItemImage}>
            <SkeletonBlock style={styles.skeletonFill} />
          </View>
          <View style={styles.closetItemBody}>
            <SkeletonBlock style={styles.skeletonTextLarge} />
            <SkeletonBlock style={styles.skeletonTextMedium} />
            <SkeletonBlock style={styles.skeletonTextSmall} />
          </View>
        </View>
      ))}
    </View>
  );
}

function CreditHistorySkeleton({ rows = 3 }) {
  return Array.from({ length: rows }).map((_, index) => (
    <View key={`credit-history-skeleton-${index}`} style={styles.profileCreditHistoryRow}>
      <View style={styles.profileCreditEventCopy}>
        <SkeletonBlock style={[styles.profileCreditSkeletonCell, { width: '65%' }]} />
        <SkeletonBlock style={[styles.profileCreditSkeletonCell, { width: '85%', marginTop: 7 }]} />
      </View>
      <SkeletonBlock style={[styles.profileCreditSkeletonCell, { width: 36 }]} />
    </View>
  ));
}

const profileCreditPreviewLimit = 4;

function creditHistoryProductLabel(event = {}) {
  const title = String(event.productTitle || '').trim();
  const isCustomTryOn = /custom/i.test(String(event.action || ''));
  if (!title || title === 'Product') return isCustomTryOn ? 'Custom upload' : 'Product';
  if (isCustomTryOn && /^[^/\s]+\.(?:jpe?g|png|webp|avif)$/i.test(title)) return 'Custom upload';
  return title;
}

function creditHistoryAmountLabel(event = {}) {
  const amount = Math.abs(Number(event.tokens) || 0);
  if (!amount) return '0';
  return event.direction === 'credit' ? `+${amount}` : `-${amount}`;
}

function formatCreditRate(plan = {}) {
  const rate = Number(plan.ratePerCredit);
  if (!Number.isFinite(rate) || rate <= 0) return '';
  return `${formatMoney(rate, plan.currency)} / credit${plan.billingFrequency === 'monthly' ? ' monthly' : ''}`;
}

function mobilePaymentReturnUrl() {
  return 'lookmefy://tokens';
}

function merchantOrderIdFromUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    return url.searchParams.get('merchantOrderId') || url.searchParams.get('orderId') || '';
  } catch {
    return '';
  }
}

function mobileRouteFromUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    const path = url.protocol === 'http:' || url.protocol === 'https:'
      ? url.pathname
      : `/${url.host}${url.pathname}`;
    if (/^\/tokens(?:\/|$)/i.test(path)) return { name: 'tokens', params: {} };
    if (/^\/generation-history\/?$/i.test(path)) return { name: 'generation-history', params: {} };
    const product = path.match(/^\/product\/([a-f0-9]{24})\/?$/i);
    if (product) return { name: 'product', params: { id: product[1] } };
  } catch {
    return null;
  }
  return null;
}

function openLegalPolicy(page) {
  const path = ({ terms: 'terms', privacy: 'privacy', deletion: 'data-deletion', support: 'contact' })[page] || 'privacy';
  return Linking.openURL(`https://lookmefy.in/${path}`).catch(() => {
    Alert.alert('Policy unavailable', 'The policy could not be opened. Please try again before continuing.');
  });
}

function ReportContentAction({ content }) {
  const owner = useContext(ContentReportingContext);
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const client = useRef(null);
  if (!client.current) client.current = createContentReportClient(api, () => ownerRef.current);
  const generation = useRef(0);
  const submitting = useRef(false);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState('idle');
  const [reason, setReason] = useState('other');
  const [message, setMessage] = useState('');
  useEffect(() => {
    generation.current += 1;
    submitting.current = false;
    client.current = createContentReportClient(api, () => ownerRef.current);
    setVisible(false); setState('idle'); setMessage('');
    return () => { generation.current += 1; };
  }, [owner, content?.type, content?.id]);
  const open = async () => {
    const request = ++generation.current;
    setVisible(true); setState('checking'); setReason('other'); setMessage('Checking reporting availability…');
    if (!owner || !content) {
      setState('unavailable');
      setMessage(!owner ? 'Sign in to report AI content. No report has been submitted.' : 'This result has no server reporting identifier. No report has been submitted. Contact support.');
      return;
    }
    try {
      const available = await client.current.availability(owner, content);
      if (request !== generation.current) return;
      setState(available ? 'ready' : 'unavailable');
      setMessage(available ? 'Choose a reason. Only the content identifier and reason are sent, not your photos.' : 'In-app reporting is unavailable. No report has been submitted. Contact support for help.');
    } catch {
      if (request !== generation.current) return;
      setState('unavailable'); setMessage('In-app reporting could not be reached. No report has been submitted. Try reopening or contact support.');
    }
  };
  const close = () => { if (submitting.current) return; generation.current += 1; setVisible(false); };
  const submit = async () => {
    if (submitting.current || !['ready', 'error'].includes(state)) return;
    submitting.current = true;
    const request = generation.current;
    setState('submitting'); setMessage('Submitting your report… Receipt is not confirmed yet.');
    try {
      await client.current.submit(owner, content, reason);
      if (request !== generation.current) return;
      setState('received'); setMessage('Report received for review. This does not confirm that the content has been removed.');
    } catch (error) {
      if (request !== generation.current) return;
      setState('error'); setMessage(error.message || 'Report receipt could not be confirmed. Retry or contact support.');
    } finally { if (request === generation.current) submitting.current = false; }
  };
  const canSubmit = ['ready', 'error'].includes(state) && Boolean(owner && content);
  return (
    <View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Report AI content" style={styles.releaseReportAction} onPress={open}>
        <Ionicons name="flag-outline" size={16} color="#8c4d50" />
        <Text style={styles.releaseReportText}>Report content</Text>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <SafeAreaView style={styles.releaseConsentOverlay}>
          <View style={styles.releaseConsentCard} accessibilityViewIsModal>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.releaseConsentBody}>
              <Text accessibilityRole="header" style={styles.releaseConsentTitle}>Report AI content</Text>
              <Text accessibilityLiveRegion="polite" style={styles.releaseConsentCopy}>{message}</Text>
              {['ready', 'error'].includes(state) ? contentReportReasons.map(value => (
                <TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{ checked: reason === value }} accessibilityLabel={`Report reason: ${value}`} style={styles.releaseLegalAction} onPress={() => setReason(value)}>
                  <Text style={styles.releaseConsentCopy}>{reason === value ? '●' : '○'} {titleCase(value)}</Text>
                </TouchableOpacity>
              )) : null}
            </ScrollView>
            <View style={styles.releaseConsentActions}>
              <AppButton label={state === 'submitting' ? 'Submitting…' : state === 'received' ? 'Report received' : 'Submit report'} disabled={!canSubmit} onPress={submit} style={styles.releaseConsentButton} />
              <AppButton label="Contact support" variant="secondary" disabled={state === 'submitting'} onPress={() => openSupportEmail('AI content reporting help')} style={styles.releaseConsentButton} />
              <AppButton label="Close reporting" variant="secondary" disabled={state === 'submitting'} onPress={close} style={styles.releaseConsentButton} />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function AiPreviewNote({ style, content }) {
  return (
    <View>
      <View style={[styles.aiPreviewNote, style]}>
        <Ionicons name="information-circle-outline" size={16} color="#8c4d50" />
        <Text style={styles.aiPreviewNoteText}>{aiPreviewDisclaimer}</Text>
      </View>
      {content ? <ReportContentAction content={content} /> : null}
    </View>
  );
}

const ProductCard = memo(function ProductCard({ product, tryOn, loading, videoLoading, error, videoError, locked, onPress, onTryOn, onTryOnVideo, onAddToWishlist, isWishlisted, variant = 'grid' }) {
  const layout = useResponsiveLayout();
  const verifiedRating = verifiedProductRating(product);
  const price = Number(product?.price);
  const hasPrice = Number.isFinite(price);
  const hasDiscount = hasPrice && product?.compareAtPrice && product.compareAtPrice > product.price;
  const discount = hasDiscount ? `${Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}% off` : '';
  const videoUri = imageUrl(tryOn?.videoUrl);
  const hasTryOnImage = Boolean(tryOn?.imageUrl);
  const tryOnLabel = tryOnDisplayLabel(tryOn, videoUri);
  const useHomeImageFrame = variant === 'homeFrame';
  const useStableGridBody = variant === 'homeFrame' || variant === 'grid';
  const responsiveCardStyle = variant === 'carousel' ? null : layout.productGridItemStyle;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={product?.title || product?.name || 'Open product'}
      style={({ pressed }) => [styles.productCard, styles.surfaceCard, useHomeImageFrame && styles.productCardHomeFrame, responsiveCardStyle, variant === 'carousel' && styles.productCardCarousel, pressed && !locked && styles.productCardPressed, locked && styles.lockedCard]}
      onPress={locked ? undefined : onPress}
    >
      <View style={[styles.productImageWrap, useHomeImageFrame && styles.homeProductImageWrap]}>
        {videoUri ? (
          <TryOnVideoPlayer uri={videoUri} style={styles.productImage} nativeControls={false} />
        ) : (
          <ProductImage product={product} tryOn={tryOn} style={styles.productImage} alt={product?.title || product?.name} />
        )}
        {locked ? <View style={styles.lockOverlay}><Ionicons name="lock-closed" size={22} color="#fff" /></View> : null}
        {hasTryOnImage ? <Text style={styles.badge}>{tryOnLabel}</Text> : product?.isNew ? <Text style={styles.badge}>New</Text> : product?.badge ? <Text style={styles.badge}>{product.badge}</Text> : null}
        {onAddToWishlist && !locked ? <WishlistDoneButton saved={isWishlisted} compact={variant === 'carousel'} onPress={() => onAddToWishlist(product)} /> : null}
        {loading || videoLoading ? <TryOnLoading text={videoLoading ? 'Video' : 'Generating'} /> : null}
      </View>
      <View style={[styles.productBody, useStableGridBody && styles.productGridCardBody]}>
        <Text style={styles.productTitle} numberOfLines={2}>{product?.title || product?.name || 'Untitled product'}</Text>
        <Text style={styles.productBrand} numberOfLines={1}>{product?.displayLabel || titleCase(product?.category || 'Catalog')}</Text>
        {verifiedRating ? <View style={styles.ratingRow}>
          <Ionicons name="star" size={13} color="#f59e0b" />
          <Text style={styles.ratingText}>{verifiedRating.rating.toFixed(1)} ({verifiedRating.ratingCount})</Text>
        </View> : null}
        <View style={styles.priceRow}>
          <Text style={styles.price}>{hasPrice ? formatMoney(price, product?.currency) : 'Price unavailable'}</Text>
          {discount ? <Text style={styles.discount}>{discount}</Text> : null}
        </View>
        {product?.colors?.length ? (
          <View style={styles.productSwatchPreviewRow}>
            {product.colors.slice(0, 4).map((color) => <View key={`${product.id}-${color.name}`} style={[styles.productSwatchPreview, { backgroundColor: color.value }]} />)}
            {product.colors.length > 4 ? <Text style={styles.productSwatchMore}>+{product.colors.length - 4}</Text> : null}
          </View>
        ) : null}
        {onTryOn ? (
          <AppButton
            label={loading ? 'Generating...' : hasTryOnImage ? 'Generate Again' : 'Try On'}
            icon="sparkles-outline"
            disabled={loading}
            onPress={onTryOn}
            style={[styles.cardButton, useStableGridBody && styles.productGridCardButton]}
          />
        ) : null}
        {onTryOnVideo ? (
          <AppButton
            label={videoLoading ? 'Video...' : videoUri ? 'New Video' : 'Video Try-On'}
            icon="videocam-outline"
            variant="secondary"
            disabled={loading || videoLoading}
            onPress={onTryOnVideo}
            style={styles.cardButton}
          />
        ) : null}
        {hasTryOnImage || videoUri ? <ReportContentAction content={reportContentReference(tryOn, 'product_tryon')} /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {videoError ? <Text style={styles.errorText}>{videoError}</Text> : null}
      </View>
    </Pressable>
  );
});

function ProductRow({ title, state, onNavigate, user, token, onAddToWishlist, wishlistIds }) {
  const products = (state.products || []).slice(0, 6);
  const [tryOns] = useTryOns(user, products, token);
  const keyExtractor = useCallback((item) => String(item.id), []);
  const renderProduct = useCallback(({ item }) => (
    <ProductCard
      variant="carousel"
      product={item}
      tryOn={tryOns[item.id]}
      onPress={() => onNavigate('product', { id: item.id })}
      onAddToWishlist={onAddToWishlist}
      isWishlisted={wishlistIds?.has(item.id)}
    />
  ), [onNavigate, onAddToWishlist, wishlistIds, tryOns]);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity onPress={() => onNavigate('shop')}>
          <Text style={styles.viewAll}>View all</Text>
        </TouchableOpacity>
      </View>
      {state.loading ? <HorizontalProductSkeleton /> : (
        <>
          <StatusPanel error={state.error} empty={!products.length} text="No products found yet." />
          {products.length ? (
            <FlatList
              horizontal
              data={products}
              keyExtractor={keyExtractor}
              showsHorizontalScrollIndicator={false}
              directionalLockEnabled
              nestedScrollEnabled
              scrollEventThrottle={16}
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              windowSize={3}
              removeClippedSubviews={Platform.OS === 'android'}
              updateCellsBatchingPeriod={40}
              contentContainerStyle={styles.horizontalList}
              renderItem={renderProduct}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const homeCategoryItems = [
  { label: 'Shirts', count: 31, image: 'category-generated/men-shirts.png', params: { category: 'shirts' } },
  { label: 'T Shirts', count: 95, image: 'category-generated/tshirts.png', params: { category: 't-shirts' } },
  { label: 'Dresses', count: 110, image: 'category-generated/dresses.png', params: { category: 'dresses' } },
  { label: 'Pants', count: 79, image: 'category-generated/bottomwear.png', params: { category: 'pants' } },
  { label: 'Jeans', count: 70, image: 'category-generated/jeans.png', params: { q: 'jeans' } },
  { label: 'Jackets', count: 68, image: 'category-generated/jackets.png', params: { category: 'jackets' } },
  { label: 'Shoes', count: 104, image: 'category-generated/sneakers.png', params: { category: 'shoes' } },
  { label: 'Watches', count: 124, image: 'category-generated/watches.png', params: { category: 'watches' } },
  { label: 'Accessories', count: 52, image: 'category-generated/accessories.png', params: { category: 'accessories' } },
  { label: 'Ethnic Wear', count: 136, image: 'category-generated/kurti-dress-material.png', params: { category: 'ethnic wear' } },
  { label: 'Eyewear', count: 37, image: 'category-generated/eyewear.png', params: { category: 'eyewear' } },
  { label: 'Innerwear', count: 97, image: 'category-generated/innerwear.png', params: { category: 'innerwear' } },
  { label: 'Sleepwear', count: 36, image: 'category-generated/sleepwear.png', params: { category: 'sleepwear' } }
];
const homeCategoryItemsByGender = {
  men: [
    { label: 'Shirts', count: 31, image: 'category-generated/men-shirts.png', params: { category: 'shirts', gender: 'men' } },
    { label: 'T Shirts', count: 95, image: 'category-generated/tshirts.png', params: { category: 't-shirts', gender: 'men' } },
    { label: 'Pants', count: 79, image: 'category-generated/bottomwear.png', params: { category: 'pants', gender: 'men' } },
    { label: 'Jeans', count: 70, image: 'category-generated/jeans.png', params: { q: 'jeans', gender: 'men' } },
    { label: 'Jackets', count: 68, image: 'category-generated/jackets.png', params: { category: 'jackets', gender: 'men' } },
    { label: 'Shoes', count: 104, image: 'category-generated/men-footwear.png', params: { category: 'shoes', gender: 'men' } },
    { label: 'Watches', count: 124, image: 'category-generated/watches.png', params: { category: 'watches', gender: 'men' } },
    { label: 'Accessories', count: 52, image: 'category-generated/accessories.png', params: { category: 'accessories', gender: 'men' } },
    { label: 'Eyewear', count: 37, image: 'category-generated/eyewear.png', params: { category: 'eyewear', gender: 'men' } }
  ],
  women: [
    { label: 'Shirts', count: 31, image: 'category-generated/men-shirts.png', params: { category: 'shirts', gender: 'women' } },
    { label: 'T Shirts', count: 95, image: 'category-generated/tshirts.png', params: { category: 't-shirts', gender: 'women' } },
    { label: 'Dresses', count: 110, image: 'category-generated/dresses.png', params: { category: 'dresses', gender: 'women' } },
    { label: 'Pants', count: 79, image: 'category-generated/bottomwear.png', params: { category: 'pants', gender: 'women' } },
    { label: 'Jeans', count: 70, image: 'category-generated/jeans.png', params: { q: 'jeans', gender: 'women' } },
    { label: 'Jackets', count: 68, image: 'category-generated/jackets.png', params: { category: 'jackets', gender: 'women' } },
    { label: 'Shoes', count: 104, image: 'category-generated/women-footwear.png', params: { category: 'shoes', gender: 'women' } },
    { label: 'Watches', count: 124, image: 'category-generated/watches.png', params: { category: 'watches', gender: 'women' } },
    { label: 'Accessories', count: 52, image: 'category-generated/accessories.png', params: { category: 'accessories', gender: 'women' } },
    { label: 'Ethnic Wear', count: 136, image: 'category-generated/kurti-dress-material.png', params: { q: 'ethnic wear', gender: 'women' } },
    { label: 'Eyewear', count: 37, image: 'category-generated/eyewear.png', params: { category: 'eyewear', gender: 'women' } },
    { label: 'Innerwear', count: 97, image: 'category-generated/innerwear.png', params: { category: 'innerwear', gender: 'women' } },
    { label: 'Sleepwear', count: 36, image: 'category-generated/sleepwear.png', params: { category: 'sleepwear', gender: 'women' } }
  ]
};

const shopCategoryItems = [
  ['Tops', 'category-generated/tops.png', 'tops'],
  ['Bottoms', 'category-generated/bottomwear.png', 'bottoms'],
  ['Shirts', 'category-generated/men-shirts.png', 'shirts'],
  ['Shoes', 'category-generated/sneakers.png', 'shoes'],
  ['Eyewear', 'category-generated/eyewear.png', 'eyewear']
];
const categoryRailItems = [
  { key: 'popular', label: 'Popular', icon: 'star', iconColor: '#f0b429' },
  { key: 'ethnic', label: 'Kurti, Saree\n& Lehenga', image: 'category-generated/kurti-dress-material.png' },
  { key: 'western', label: 'Women\nWestern', image: 'category-generated/tops.png' },
  { key: 'lingerie', label: 'Lingerie', image: 'category-generated/innerwear.png' },
  { key: 'men', label: 'Men', image: 'category-generated/men-shirts.png' },
  { key: 'beauty', label: 'Beauty', image: 'category-generated/beauty.png' },
  { key: 'footwear', label: 'Footwear', image: 'category-generated/sneakers.png' },
  { key: 'accessories', label: 'Accessories', image: 'category-generated/accessories.png' },
  { key: 'watches', label: 'Watches', image: 'category-generated/watches.png' },
  { key: 'eyewear', label: 'Eyewear', image: 'category-generated/eyewear.png' },
  { key: 'bottomwear', label: 'Bottomwear', image: 'category-generated/bottomwear.png' }
];
const categoryPageContent = {
  popular: {
    kicker: 'POPULAR',
    title: 'Featured on Lookmefy',
    featured: [
      { label: 'Top Brands', image: 'category-generated/new-arrivals.png', params: { sort: 'newest' } },
      { label: 'Premium\nCollection', image: 'category-generated/dresses.png', params: { category: 'dresses', gender: 'women' } },
      { label: 'New Arrivals', image: 'category-generated/new-arrivals.png', params: { sort: 'newest' } },
      { label: 'Accessories', image: 'category-generated/accessories.png', params: { category: 'accessories' } }
    ],
    sectionTitle: 'All Popular',
    items: [
      { label: 'Kurtis & Dress\nMaterials', image: 'category-generated/kurti-dress-material.png', params: { category: 'ethnic wear', gender: 'women' } },
      { label: 'Sarees', image: 'category-generated/saree.png', params: { q: 'saree', gender: 'women' } },
      { label: 'Westernwear', image: 'category-generated/tops.png', params: { gender: 'women' } },
      { label: 'Jewellery', image: 'category-generated/jewellery.png', params: { category: 'accessories' } },
      { label: 'Men Fashion', image: 'category-generated/men-shirts.png', params: { gender: 'men' } },
      { label: 'Footwear', image: 'category-generated/sneakers.png', params: { category: 'shoes' } },
      { label: 'Beauty &\nPersonal Care', image: 'category-generated/beauty.png', params: { category: 'beauty' } },
      { label: 'Watches', image: 'category-generated/watches.png', params: { category: 'watches' } },
      { label: 'Eyewear', image: 'category-generated/eyewear.png', params: { category: 'eyewear' } },
      { label: 'Bottomwear', image: 'category-generated/bottomwear.png', params: { category: 'bottoms' } },
      { label: 'Shirts', image: 'category-alt-shirts.png', params: { category: 'shirts' } }
    ]
  },
  ethnic: {
    kicker: 'ETHNIC',
    title: 'Occasion Ready',
    featured: [
      { label: 'Kurtis', image: 'category-generated/kurti-dress-material.png', params: { category: 'ethnic wear', gender: 'women' } },
      { label: 'Dress Sets', image: 'category-generated/dresses.png', params: { category: 'dresses', gender: 'women' } },
      { label: 'Premium Sarees', image: 'category-generated/saree.png', params: { q: 'saree', gender: 'women' } }
    ],
    sectionTitle: 'All Ethnic Wear',
    items: [
      { label: 'Daily Kurtis', image: 'category-alt-ethnicwear.png', params: { q: 'kurti', gender: 'women' } },
      { label: 'Festive Looks', image: 'category-generated/saree.png', params: { category: 'dresses', gender: 'women' } },
      { label: 'Ethnic Tops', image: 'category-alt-ethnic-tops-editorial.png', params: { category: 'tops', gender: 'women' } },
      { label: 'Jewellery', image: 'category-generated/jewellery.png', params: { category: 'accessories', gender: 'women' } },
      { label: 'Footwear', image: 'category-generated/women-footwear.png', params: { category: 'shoes', gender: 'women' } },
      { label: 'New In', image: 'category-generated/new-arrivals.png', params: { sort: 'newest', gender: 'women' } }
    ]
  },
  western: {
    kicker: 'WESTERN',
    title: 'Modern Wardrobe',
    featured: [
      { label: 'Tops', image: 'category-generated/tops.png', params: { category: 'tops', gender: 'women' } },
      { label: 'Jeans', image: 'category-generated/jeans.png', params: { category: 'jeans', gender: 'women' } },
      { label: 'Dresses', image: 'category-generated/dresses.png', params: { category: 'dresses', gender: 'women' } }
    ],
    sectionTitle: 'All Women Western',
    items: [
      { label: 'T-Shirts', image: 'category-generated/tshirts.png', params: { category: 't-shirts', gender: 'women' } },
      { label: 'Tops', image: 'category-generated/tops.png', params: { category: 'tops', gender: 'women' } },
      { label: 'Jeans', image: 'category-generated/jeans.png', params: { category: 'jeans', gender: 'women' } },
      { label: 'Jackets', image: 'category-generated/jackets.png', params: { category: 'jackets', gender: 'women' } },
      { label: 'Bottomwear', image: 'category-generated/bottomwear.png', params: { category: 'bottoms', gender: 'women' } },
      { label: 'Eyewear', image: 'category-generated/eyewear.png', params: { category: 'eyewear', gender: 'women' } }
    ]
  },
  lingerie: {
    kicker: 'LINGERIE',
    title: 'Innerwear Essentials',
    featured: [
      { label: 'Innerwear', image: 'category-generated/innerwear.png', params: { category: 'innerwear', gender: 'women' } },
      { label: 'Sleepwear', image: 'category-generated/sleepwear.png', params: { category: 'sleepwear', gender: 'women' } },
      { label: 'Soft Basics', image: 'category-generated/lounge.png', params: { q: 'basic', gender: 'women' } }
    ],
    sectionTitle: 'All Lingerie',
    items: [
      { label: 'Everyday Wear', image: 'category-generated/innerwear.png', params: { category: 'innerwear', gender: 'women' } },
      { label: 'Nightwear', image: 'category-generated/sleepwear.png', params: { category: 'sleepwear', gender: 'women' } },
      { label: 'Lounge Sets', image: 'category-alt-sleepwear.png', params: { q: 'lounge', gender: 'women' } },
      { label: 'New In', image: 'category-alt-innerwear.png', params: { sort: 'newest', gender: 'women' } }
    ]
  },
  men: {
    kicker: 'MEN',
    title: 'Featured For Men',
    featured: [
      { label: 'Shirts', image: 'category-generated/men-shirts.png', params: { category: 'shirts', gender: 'men' } },
      { label: 'T-Shirts', image: 'category-generated/tshirts.png', params: { category: 't-shirts', gender: 'men' } },
      { label: 'Shoes', image: 'category-generated/men-footwear.png', params: { category: 'shoes', gender: 'men' } }
    ],
    sectionTitle: 'All Men Fashion',
    items: [
      { label: 'Shirts', image: 'category-generated/men-shirts.png', params: { category: 'shirts', gender: 'men' } },
      { label: 'Pants', image: 'category-generated/bottomwear.png', params: { category: 'pants', gender: 'men' } },
      { label: 'Jeans', image: 'category-generated/jeans.png', params: { category: 'jeans', gender: 'men' } },
      { label: 'Jackets', image: 'category-generated/jackets.png', params: { category: 'jackets', gender: 'men' } },
      { label: 'Watches', image: 'category-generated/watches.png', params: { category: 'watches', gender: 'men' } },
      { label: 'Eyewear', image: 'category-generated/eyewear.png', params: { category: 'eyewear', gender: 'men' } }
    ]
  },
  beauty: {
    kicker: 'BEAUTY',
    title: 'Beauty Picks',
    featured: [
      { label: 'Personal Care', image: 'category-generated/beauty.png', params: { category: 'beauty' } },
      { label: 'Accessories', image: 'category-generated/accessories.png', params: { category: 'accessories' } },
      { label: 'Premium Edit', image: 'category-alt-beauty-premium.png', params: { category: 'beauty', sort: 'newest' } }
    ],
    sectionTitle: 'All Beauty',
    items: [
      { label: 'Beauty &\nPersonal Care', image: 'category-generated/beauty.png', params: { category: 'beauty' } },
      { label: 'Jewellery', image: 'category-generated/jewellery.png', params: { category: 'accessories' } },
      { label: 'Eyewear', image: 'category-generated/eyewear.png', params: { category: 'eyewear' } },
      { label: 'Watches', image: 'category-generated/watches.png', params: { category: 'watches' } }
    ]
  },
  footwear: {
    kicker: 'FOOTWEAR',
    title: 'Step Into Style',
    featured: [
      { label: 'Sneakers', image: 'category-generated/sneakers.png', params: { category: 'shoes' } },
      { label: 'Women Shoes', image: 'category-generated/women-footwear.png', params: { category: 'shoes', gender: 'women' } },
      { label: 'Men Shoes', image: 'category-generated/men-footwear.png', params: { category: 'shoes', gender: 'men' } }
    ],
    sectionTitle: 'All Footwear',
    items: [
      { label: 'Shoes', image: 'category-generated/sneakers.png', params: { category: 'shoes' } },
      { label: 'Women Footwear', image: 'category-generated/women-footwear.png', params: { category: 'shoes', gender: 'women' } },
      { label: 'Men Footwear', image: 'category-generated/men-footwear.png', params: { category: 'shoes', gender: 'men' } },
      { label: 'New Arrivals', image: 'category-shoes-updated.jpg', params: { category: 'shoes', sort: 'newest' } }
    ]
  },
  accessories: {
    kicker: 'ACCESSORIES',
    title: 'The Finishing Touch',
    featured: [
      { label: 'Jewellery', image: 'category-generated/jewellery.png', params: { q: 'jewellery' } },
      { label: 'Bags', image: 'category-generated/accessories.png', params: { q: 'bags' } },
      { label: 'Watches', image: 'category-generated/watches.png', params: { category: 'watches' } },
      { label: 'Eyewear', image: 'category-generated/eyewear.png', params: { category: 'eyewear' } }
    ],
    sectionTitle: 'All Accessories',
    items: [
      { label: 'Women’s Accessories', image: 'category-alt-womens-bags.png', params: { category: 'accessories', gender: 'women' } },
      { label: 'Men’s Accessories', image: 'category-alt-mens-accessories-editorial.png', params: { category: 'accessories', gender: 'men' } },
      { label: 'Jewellery', image: 'category-generated/jewellery.png', params: { q: 'jewellery' } },
      { label: 'Bags', image: 'category-generated/accessories.png', params: { q: 'bags' } },
      { label: 'Watches', image: 'category-generated/watches.png', params: { category: 'watches' } },
      { label: 'Eyewear', image: 'category-generated/eyewear.png', params: { category: 'eyewear' } }
    ]
  },
  watches: {
    kicker: 'WATCHES',
    title: 'Timeless Details',
    featured: [
      { label: 'All Watches', image: 'category-generated/watches.png', params: { category: 'watches' } },
      { label: 'Women’s Watches', image: 'category-alt-watch-women.png', params: { category: 'watches', gender: 'women' } },
      { label: 'Men’s Watches', image: 'category-alt-watch-men.png', params: { category: 'watches', gender: 'men' } }
    ],
    sectionTitle: 'Shop Watches',
    items: [
      { label: 'Women’s Watches', image: 'category-alt-watch-women.png', params: { category: 'watches', gender: 'women' } },
      { label: 'Men’s Watches', image: 'category-alt-watch-men.png', params: { category: 'watches', gender: 'men' } },
      { label: 'New Arrivals', image: 'category-alt-watch-collection.png', params: { category: 'watches', sort: 'newest' } }
    ]
  },
  eyewear: {
    kicker: 'EYEWEAR',
    title: 'A New Perspective',
    featured: [
      { label: 'All Eyewear', image: 'category-generated/eyewear.png', params: { category: 'eyewear' } },
      { label: 'Women’s Eyewear', image: 'category-eyewear-updated.jpg', params: { category: 'eyewear', gender: 'women' } },
      { label: 'Men’s Eyewear', image: 'category-alt-eyewear-men.png', params: { category: 'eyewear', gender: 'men' } }
    ],
    sectionTitle: 'Shop Eyewear',
    items: [
      { label: 'Women’s Eyewear', image: 'category-eyewear-updated.jpg', params: { category: 'eyewear', gender: 'women' } },
      { label: 'Men’s Eyewear', image: 'category-alt-eyewear-men.png', params: { category: 'eyewear', gender: 'men' } },
      { label: 'New Arrivals', image: 'category-alt-eyewear-collection.png', params: { category: 'eyewear', sort: 'newest' } }
    ]
  },
  bottomwear: {
    kicker: 'BOTTOMWEAR',
    title: 'Find Your Fit',
    featured: [
      { label: 'Jeans', image: 'category-generated/jeans.png', params: { category: 'jeans' } },
      { label: 'Pants', image: 'category-generated/bottomwear.png', params: { category: 'pants' } },
      { label: 'New Arrivals', image: 'category-bottoms-updated.jpg', params: { category: 'bottoms', sort: 'newest' } }
    ],
    sectionTitle: 'All Bottomwear',
    items: [
      { label: 'Women’s Bottomwear', image: 'category-alt-womens-bottoms.png', params: { category: 'bottoms', gender: 'women' } },
      { label: 'Men’s Bottomwear', image: 'category-alt-pants.png', params: { category: 'bottoms', gender: 'men' } },
      { label: 'Jeans', image: 'category-generated/jeans.png', params: { category: 'jeans' } },
      { label: 'Pants', image: 'category-generated/bottomwear.png', params: { category: 'pants' } },
      { label: 'New Arrivals', image: 'category-bottoms-updated.jpg', params: { category: 'bottoms', sort: 'newest' } }
    ]
  }
};
const categoryFollowOnSections = { watches: 'eyewear', eyewear: 'bottomwear' };
const categoryContinuousSections = buildCategorySections(categoryRailItems, categoryPageContent);
const homeProductFeedPageSize = 48;
const shopProductGridLimit = 50;
const shopProductPageSize = 96;
const searchQuickSuggestions = ['short kurti', 'saree', 'kurti', 'tshirt', 'earring', 'top for women', 'slipper', 'watch', 'top', 'kurti set', 'shoes', 'eyewear'];

function categorySearchText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

const categorySearchReferences = (() => {
  const references = [];
  const seen = new Set();
  const addReference = (item = {}, sectionKey = '', sectionLabel = '') => {
    const label = categorySearchText(item.label);
    if (!label) return;
    const params = item.params || (sectionKey ? { section: sectionKey } : { q: label });
    const key = `${label.toLowerCase()}|${JSON.stringify(params)}`;
    if (seen.has(key)) return;
    seen.add(key);
    references.push({
      ...item,
      label,
      params,
      sectionKey,
      sectionLabel
    });
  };

  categoryRailItems.forEach((item) => addReference(item, item.key, item.label));
  Object.entries(categoryPageContent).forEach(([sectionKey, content]) => {
    const rail = categoryRailItems.find((item) => item.key === sectionKey);
    const sectionLabel = categorySearchText(rail?.label || content.title || sectionKey);
    [...(content.featured || []), ...(content.items || [])].forEach((item) => addReference(item, sectionKey, sectionLabel));
  });
  return references;
})();

function PageBackRow({ onBack, children }) {
  if (!onBack && !children) return null;
  return (
    <View style={styles.pageBackRow}>
      {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} style={styles.pageBackButton} onPress={onBack}>
        <Ionicons name="chevron-back" size={18} color="#211f1d" />
        <Text style={styles.pageBackButtonText}>Back</Text>
      </Pressable> : null}
      {children}
    </View>
  );
}

function ShopTopBar({ onNavigate, user, onBack }) {
  return (
    <>
      <AppHeader onNavigate={onNavigate} user={user} compact showSearch={false} />
      <PageBackRow onBack={onBack} />
    </>
  );
}

function CategoryBubble({ item, size = 'large', active = false, tablet = false }) {
  const imageSource = item.image ? images[item.image] : null;
  const frameStyle = size === 'rail'
    ? styles.categoryRailImageFrame
    : size === 'reference'
      ? styles.categoryReferenceImageFrame
      : size === 'featured'
        ? styles.categoryFeaturedImageFrame
        : styles.categoryContentImageFrame;
  const imageStyle = size === 'rail'
    ? styles.categoryRailImage
    : size === 'reference'
      ? styles.categoryReferenceImage
      : size === 'featured'
        ? styles.categoryFeaturedImage
        : styles.categoryContentImage;
  const iconSize = size === 'rail' ? 30 : size === 'reference' ? 17 : size === 'featured' ? (tablet ? 48 : 42) : tablet ? 44 : 38;
  const tabletFrameStyle = tablet ? size === 'rail' ? styles.categoryRailImageFrameTablet : size === 'featured' ? styles.categoryFeaturedImageFrameTablet : size === 'reference' ? null : styles.categoryContentImageFrameTablet : null;

  return (
    <View style={[frameStyle, tabletFrameStyle, active && styles.categoryRailImageFrameActive]}>
      {imageSource ? (
        <Image source={imageSource} style={imageStyle} resizeMode="contain" />
      ) : (
        <Ionicons name={item.icon || 'sparkles'} size={iconSize} color={item.iconColor || '#9b5658'} />
      )}
    </View>
  );
}

function CategoryLandingScreen({ selectedCategory, onSelectCategory, onNavigate, onBack, user, initialScrollY = 0, onScrollPositionChange }) {
  const layout = useResponsiveLayout();
  const categoryMainScrollRef = useRef(null);
  const categoryRailScrollRef = useRef(null);
  const categorySectionOffsetsRef = useRef({});
  const initialSectionRef = useRef(selectedCategory);
  const initialSectionJumpedRef = useRef(false);
  const activeCategoryRef = useRef(selectedCategory);
  const [categoryMainWidth, setCategoryMainWidth] = useState(0);
  const [categoryQuery, setCategoryQuery] = useState('');
  const [categorySearchFocused, setCategorySearchFocused] = useState(false);
  const content = categoryPageContent[selectedCategory] || categoryPageContent.popular;
  const nextCategoryKey = categoryFollowOnSections[selectedCategory];
  const nextContent = nextCategoryKey ? categoryPageContent[nextCategoryKey] : null;
  const featuredItems = nextContent ? uniqueCategoryTiles([...content.featured, ...content.items]).slice(0, 4) : content.featured;
  const gridItems = nextContent ? uniqueCategoryTiles([...nextContent.featured, ...nextContent.items]).slice(0, 4) : content.items;
  const gridTitle = nextContent ? nextContent.sectionTitle : content.sectionTitle;
  const categoryRailWidth = layout.isTablet ? 116 : layout.windowWidth <= 340 ? 82 : layout.windowWidth <= 375 ? 84 : layout.windowWidth >= 414 ? 90 : 88;
  const categoryPanelWidth = Math.max(180, categoryMainWidth || layout.contentWidth - categoryRailWidth);
  const categoryPanelPadding = layout.isTablet ? 28 : layout.windowWidth <= 340 ? 10 : 12;
  const categoryGridGap = layout.isTablet ? 18 : layout.windowWidth <= 340 ? 8 : 10;
  const categoryPanelInnerWidth = Math.max(160, categoryPanelWidth - (categoryPanelPadding * 2));
  const categoryFeatureHorizontalPadding = layout.windowWidth <= 340 ? 8 : 12;
  // Include the featured band's horizontal padding and a small border/rounding allowance.
  const categoryFeaturedInnerWidth = Math.max(136, categoryPanelInnerWidth - (categoryFeatureHorizontalPadding * 2) - 4);
  const categoryGridColumns = layout.isTablet ? (categoryPanelWidth >= 720 ? 4 : 3) : categoryPanelInnerWidth >= 270 ? 3 : 2;
  const categoryFeaturedColumns = layout.isTablet
    ? (categoryPanelWidth >= 720 ? 4 : featuredItems.length === 4 ? 2 : 3)
    : categoryFeaturedInnerWidth >= 270 && featuredItems.length % 3 === 0
      ? 3
      : 2;
  const categoryTileWidth = Math.floor((categoryPanelInnerWidth - (categoryGridGap * (categoryGridColumns - 1))) / categoryGridColumns);
  const categoryFeaturedTileWidth = Math.floor((categoryFeaturedInnerWidth - (categoryGridGap * (categoryFeaturedColumns - 1))) / categoryFeaturedColumns);
  const normalizedCategoryQuery = categorySearchText(categoryQuery).toLowerCase();
  const categoryMatches = useMemo(() => {
    if (!normalizedCategoryQuery) return [];
    return categorySearchReferences
      .map((item) => {
        const label = categorySearchText(item.label).toLowerCase();
        const section = categorySearchText(item.sectionLabel).toLowerCase();
        const params = categorySearchText([item.params?.q, item.params?.category, item.params?.gender].filter(Boolean).join(' ')).toLowerCase();
        const haystack = `${label} ${section} ${params}`;
        if (!haystack.includes(normalizedCategoryQuery)) return null;
        const score = label === normalizedCategoryQuery
          ? 0
          : label.startsWith(normalizedCategoryQuery)
            ? 1
            : section.startsWith(normalizedCategoryQuery)
              ? 2
              : 3;
        const specificity = item.params?.gender ? 1 : 0;
        return { item, score, specificity };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || a.specificity - b.specificity || a.item.label.localeCompare(b.item.label))
      .map(({ item }) => item)
      .slice(0, 6);
  }, [normalizedCategoryQuery]);
  const openCategoryReference = (item) => {
    setCategoryQuery('');
    if (item.sectionKey && item.params?.section === item.sectionKey) {
      selectCategory(item.sectionKey);
      return;
    }
    onNavigate('shop', item.params || { q: item.label });
  };
  const submitCategorySearch = () => {
    const firstMatch = categoryMatches[0];
    if (firstMatch) {
      openCategoryReference(firstMatch);
      return;
    }
    const query = categorySearchText(categoryQuery);
    if (query) onNavigate('shop', { q: query });
  };
  const openTile = (item) => onNavigate('shop', item.params || { sort: 'newest' });
  const selectCategory = (key) => {
    if (layout.isTablet) {
      initialSectionJumpedRef.current = true;
      activeCategoryRef.current = key;
      onSelectCategory(key);
      categoryMainScrollRef.current?.scrollTo?.({ y: categorySectionOffsetsRef.current[key] || 0, animated: false });
      return;
    }
    if (key === selectedCategory) return;
    onSelectCategory(key);
    categoryMainScrollRef.current?.scrollTo?.({ y: 0, animated: false });
  };

  useEffect(() => {
    activeCategoryRef.current = selectedCategory;
  }, [selectedCategory]);

  useEffect(() => {
    if (!initialScrollY) return undefined;
    const restoreTimer = setTimeout(() => {
      categoryMainScrollRef.current?.scrollTo?.({ y: initialScrollY, animated: false });
    }, 80);
    return () => clearTimeout(restoreTimer);
  }, [initialScrollY]);

  return (
    <View style={styles.categoryScreen}>
      <AppHeader onNavigate={onNavigate} user={user} compact />
      <PageBackRow onBack={onBack}>
        <View style={styles.categorySearchDock}>
          <View style={[styles.categorySearchBox, categorySearchFocused && styles.categorySearchBoxFocused]}>
            <Ionicons name="search-outline" size={18} color="#625c56" />
            <TextInput
              accessibilityLabel="Search categories"
              value={categoryQuery}
              onChangeText={setCategoryQuery}
              placeholder="Search categories"
              placeholderTextColor="#77716c"
              returnKeyType="search"
              onSubmitEditing={submitCategorySearch}
              onFocus={() => setCategorySearchFocused(true)}
              onBlur={() => setCategorySearchFocused(false)}
              style={styles.categorySearchInput}
            />
            {categoryQuery ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear category search" hitSlop={8} style={styles.categorySearchIconButton} onPress={() => setCategoryQuery('')}>
                <DecorativeCloseIcon size={16} color="#706a75" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Search categories" hitSlop={4} style={styles.categorySearchSubmit} onPress={submitCategorySearch}>
              <Ionicons name="arrow-forward" size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
          {categoryQuery ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.categoryReferenceTrack}>
              {categoryMatches.length ? categoryMatches.map((item) => (
                <TouchableOpacity key={`${item.sectionKey}-${item.label}-${JSON.stringify(item.params || {})}`} style={styles.categoryReferenceChip} activeOpacity={0.82} onPress={() => openCategoryReference(item)}>
                  <CategoryBubble item={item} size="reference" />
                  <View style={styles.categoryReferenceCopy}>
                    <Text style={styles.categoryReferenceText} numberOfLines={1}>{item.label}</Text>
                    <Text style={styles.categoryReferenceMeta} numberOfLines={1}>{item.sectionLabel || 'Category'}</Text>
                  </View>
                </TouchableOpacity>
              )) : (
                <TouchableOpacity style={styles.categoryReferenceChip} activeOpacity={0.82} onPress={submitCategorySearch}>
                  <Ionicons name="search-outline" size={15} color="#9b5658" />
                  <Text style={styles.categoryReferenceText} numberOfLines={1}>Search "{categorySearchText(categoryQuery)}"</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          ) : null}
        </View>
      </PageBackRow>
      <View style={styles.categoryBrowser}>
        <ScrollView
          ref={categoryRailScrollRef}
          style={[styles.categoryRail, { width: categoryRailWidth, maxWidth: categoryRailWidth, flexBasis: categoryRailWidth }, layout.isTablet && styles.categoryRailTablet]}
          contentContainerStyle={[styles.categoryRailContent, layout.isTablet && styles.categoryRailContentTablet]}
          showsVerticalScrollIndicator={false}
        >
          {categoryRailItems.map((item) => {
            const active = item.key === selectedCategory;
            return (
              <TouchableOpacity
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={`${categorySearchText(item.label)} category`}
                accessibilityState={{ selected: active }}
                activeOpacity={0.86}
                style={[styles.categoryRailItem, layout.isTablet && styles.categoryRailItemTablet, active && styles.categoryRailItemActive, active && layout.isTablet && styles.categoryRailItemActiveTablet]}
                onPress={() => selectCategory(item.key)}
              >
                {active && !layout.isTablet ? <View style={styles.categoryRailAccent} /> : null}
                <CategoryBubble item={item} size="rail" active={active} tablet={layout.isTablet} />
                <Text style={[styles.categoryRailLabel, layout.isTablet && styles.categoryRailLabelTablet, active && styles.categoryRailLabelActive]} numberOfLines={3}>{categorySearchText(item.label)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView
          ref={categoryMainScrollRef}
          style={styles.categoryMain}
          onLayout={(event) => {
            const width = Math.round(event.nativeEvent.layout.width);
            setCategoryMainWidth((current) => current === width ? current : width);
          }}
          contentContainerStyle={[styles.categoryMainContent, { paddingHorizontal: categoryPanelPadding }, layout.isTablet && styles.categoryMainContentTablet]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => {
            const y = event.nativeEvent.contentOffset.y;
            onScrollPositionChange?.(y);
            if (!layout.isTablet) return;
            const visibleY = y + event.nativeEvent.layoutMeasurement.height * 0.45;
            const visibleKey = categoryAtScrollPosition(categoryContinuousSections, categorySectionOffsetsRef.current, visibleY);
            if (visibleKey !== activeCategoryRef.current) {
              activeCategoryRef.current = visibleKey;
              onSelectCategory(visibleKey);
              const railIndex = categoryRailItems.findIndex((item) => item.key === visibleKey);
              categoryRailScrollRef.current?.scrollTo?.({ y: Math.max(0, railIndex * 102 - 204), animated: true });
            }
          }}
        >
          {layout.isTablet ? categoryContinuousSections.map((section) => (
            <View
              key={section.key}
              style={styles.categoryContinuousSectionTablet}
              onLayout={(event) => {
                const offset = event.nativeEvent.layout.y;
                categorySectionOffsetsRef.current[section.key] = offset;
                if (initialScrollY || initialSectionJumpedRef.current || section.key !== initialSectionRef.current) return;
                initialSectionJumpedRef.current = true;
                if (offset) requestAnimationFrame(() => categoryMainScrollRef.current?.scrollTo?.({ y: offset, animated: false }));
                const railIndex = categoryRailItems.findIndex((item) => item.key === section.key);
                categoryRailScrollRef.current?.scrollTo?.({ y: Math.max(0, railIndex * 102 - 204), animated: false });
              }}
            >
              <View style={styles.categoryKickerRow}>
                <Text style={styles.categoryKicker}>{section.content.kicker}</Text>
                <View style={styles.categoryKickerLine} />
              </View>
              <Text accessibilityRole="header" style={[styles.categoryHeadline, styles.categoryHeadlineTablet]}>{section.content.title}</Text>
              <View style={[styles.categoryTileGrid, styles.categoryTileGridTablet, { columnGap: categoryGridGap }]}>
                {section.items.map((item) => (
                  <TouchableOpacity key={`${section.key}-${item.label}`} accessibilityRole="button" accessibilityLabel={`Browse ${categorySearchText(item.label)}`} activeOpacity={0.82} style={[styles.categoryTile, styles.categoryTileTablet, { width: categoryTileWidth }]} onPress={() => openTile(item)}>
                    <CategoryBubble item={item} tablet />
                    <Text style={[styles.categoryTileLabel, styles.categoryTileLabelTablet]} numberOfLines={2}>{categorySearchText(item.label)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )) : <>
          <View style={[styles.categoryFeatureBand, layout.isTablet && styles.categoryFeatureBandTablet, { paddingHorizontal: categoryFeatureHorizontalPadding }]}>
            <SurfaceBackdrop />
            <View style={styles.categoryKickerRow}>
              <Text style={styles.categoryKicker}>{content.kicker}</Text>
              <View style={styles.categoryKickerLine} />
            </View>
            <Text style={[styles.categoryHeadline, layout.isTablet && styles.categoryHeadlineTablet]}>{content.title}</Text>
            <View style={[styles.categoryFeaturedGrid, { columnGap: categoryGridGap }, layout.isTablet && styles.categoryTileGridTablet]}>
              {featuredItems.map((item) => (
                <TouchableOpacity key={`${content.kicker}-${item.label}`} accessibilityRole="button" accessibilityLabel={`Browse ${categorySearchText(item.label)}`} activeOpacity={0.82} style={[styles.categoryFeaturedTile, layout.isTablet && styles.categoryFeaturedTileTablet, { width: categoryFeaturedTileWidth }]} onPress={() => openTile(item)}>
                  <CategoryBubble item={item} size="featured" tablet={layout.isTablet} />
                  <Text
                    style={[styles.categoryFeaturedLabel, layout.isTablet && styles.categoryFeaturedLabelTablet]}
                    numberOfLines={2}
                    minimumFontScale={0.82}
                  >
                    {categorySearchText(item.label)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.categorySectionHeader, layout.isTablet && styles.categorySectionHeaderTablet]}>
            <Text style={[styles.categorySectionTitle, layout.isTablet && styles.categorySectionTitleTablet]}>{gridTitle}</Text>
            <View style={styles.categorySectionRule} />
          </View>
          <View style={[styles.categoryTileGrid, { columnGap: categoryGridGap }, layout.isTablet && styles.categoryTileGridTablet]}>
            {gridItems.map((item) => (
              <TouchableOpacity key={`${gridTitle}-${item.label}`} accessibilityRole="button" accessibilityLabel={`Browse ${categorySearchText(item.label)}`} activeOpacity={0.82} style={[styles.categoryTile, layout.isTablet && styles.categoryTileTablet, { width: categoryTileWidth }]} onPress={() => openTile(item)}>
                <CategoryBubble item={item} tablet={layout.isTablet} />
                <Text style={[styles.categoryTileLabel, layout.isTablet && styles.categoryTileLabelTablet]} numberOfLines={2}>{categorySearchText(item.label)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          </>}
        </ScrollView>
      </View>
    </View>
  );
}

function CurationProductCard({ product, onPress, onTryOn, onVideoTryOn, onAddToWishlist, isWishlisted, rail = false }) {
  const layout = useResponsiveLayout();
  const price = Number(product.price);
  const discount = productDiscountPercent(product);
  const handleTryOnPress = (event) => {
    event?.stopPropagation?.();
    onTryOn?.();
  };
  const handleVideoTryOnPress = (event) => {
    event?.stopPropagation?.();
    onVideoTryOn?.();
  };
  const handleWishlistPress = (event) => {
    event?.stopPropagation?.();
    onAddToWishlist?.(product);
  };
  return (
    <TouchableOpacity style={[styles.homeProductCard, styles.surfaceCard, rail && styles.homeProductCardRail, !rail && layout.productGridWidthStyle]} onPress={onPress}>
      <View style={styles.homeProductImageWrap}>
        <ProductImage product={product} style={styles.homeProductImage} alt={product.title || product.name} />
        {discount ? <Text style={styles.homeDealBadge}>{discount}% OFF</Text> : product.isNew ? <Text style={styles.homeNewBadge}>NEW</Text> : null}
        {onAddToWishlist && !rail ? <WishlistDoneButton saved={isWishlisted} compact onPress={() => onAddToWishlist(product)} /> : null}
      </View>
      <Text style={styles.homeProductEyebrow} numberOfLines={1}>{product.displayLabel || titleCase(product.category || 'Catalog')}</Text>
      <Text style={styles.homeProductTitle} numberOfLines={2}>{product.title || product.name}</Text>
      <View style={styles.homeProductPriceRow}>
        <Text style={styles.homeProductPrice}>{Number.isFinite(price) ? formatMoney(price, product.currency) : 'Price unavailable'}</Text>
        {discount && Number.isFinite(Number(product.compareAtPrice)) ? <Text style={styles.homeProductComparePrice}>{formatMoney(product.compareAtPrice, product.currency)}</Text> : null}
      </View>
      {onTryOn || onVideoTryOn || (onAddToWishlist && rail) ? (
        <View style={styles.homeProductActionRow}>
          {onTryOn ? (
            <TouchableOpacity style={styles.homeProductTryOnButton} activeOpacity={0.86} onPress={handleTryOnPress}>
              <Ionicons name="shirt-outline" size={15} color="#ffffff" />
              <Text style={styles.homeProductTryOnText}>Try On</Text>
            </TouchableOpacity>
          ) : null}
          {onVideoTryOn ? (
            <TouchableOpacity style={styles.homeProductVideoButton} activeOpacity={0.86} onPress={handleVideoTryOnPress}>
              <Ionicons name="videocam-outline" size={14} color="#111827" />
              <Text style={styles.homeProductVideoText}>Video Try-On</Text>
            </TouchableOpacity>
          ) : null}
          {onAddToWishlist && rail ? (
            <TouchableOpacity style={[styles.homeProductHeartButton, isWishlisted && styles.homeProductHeartButtonSaved]} activeOpacity={0.86} onPress={handleWishlistPress}>
              <Ionicons name={isWishlisted ? 'heart' : 'heart-outline'} size={18} color={isWishlisted ? '#ffffff' : '#171412'} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function HomeOfferCards({ offers = [], onNavigate }) {
  const layout = useResponsiveLayout();
  if (!offers.length) return null;
  return (
    <View style={styles.homeOfferSection}>
      <ScrollView {...horizontalScrollProps} contentContainerStyle={[styles.homeOfferTrack, layout.isTablet && styles.homeOfferTrackTablet]}>
        {offers.map((offer) => (
          <TouchableOpacity
            key={offer.id}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={`${offer.title}. ${offer.cta}`}
            style={[styles.homeOfferCard, styles.surfaceCard, layout.isTablet && styles.homeOfferCardTablet]}
            onPress={() => onNavigate(offer.route, offer.params || {})}
          >
            <SurfaceBackdrop />
            <View style={styles.homeOfferCopy}>
              <Text style={styles.homeOfferKicker} numberOfLines={1}>{offer.kicker}</Text>
              <Text style={styles.homeOfferTitle} numberOfLines={2}>{offer.title}</Text>
              <Text style={styles.homeOfferText} numberOfLines={1}>{offer.copy}</Text>
              <Text style={styles.homeOfferCta} numberOfLines={1}>{offer.cta}</Text>
            </View>
            <View style={styles.homeOfferImageWrap}>
              <ProductImage product={offer.product} style={styles.homeOfferImage} resizeMode="cover" alt="" />
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function HomeProductRail({ title, subtitle, products = [], loading, error, onNavigate, onAddToWishlist, wishlistIds }) {
  const visibleProducts = uniqueProductsWithImages(products).slice(0, 4);
  if (!loading && (error || !visibleProducts.length)) return null;
  return (
    <View style={styles.homeCommerceSection}>
      <View style={styles.homeCommerceHead}>
        <View style={styles.homeCommerceTitleWrap}>
          <Text style={styles.homeCommerceTitle}>{title}</Text>
          {subtitle ? <Text style={styles.homeCommerceSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {loading ? (
        <HorizontalProductSkeleton count={4} />
      ) : error || !visibleProducts.length ? (
        <StatusPanel error={error} empty={!visibleProducts.length} text="No products found yet." />
      ) : (
        <View style={styles.homeCommerceTrack}>
          {visibleProducts.map((product) => (
            <CurationProductCard
              key={`${title}-${product.id}`}
              product={product}
              onPress={() => onNavigate('product', { id: product.id })}
              onTryOn={() => onNavigate('product', { id: product.id })}
              onVideoTryOn={() => onNavigate('product', { id: product.id })}
              onAddToWishlist={onAddToWishlist}
              isWishlisted={wishlistIds?.has(product.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function HomeWardrobeTile({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.homeWardrobeTile} activeOpacity={0.86} onPress={onPress}>
      <View style={styles.homeWardrobeImageWrap}>
        <Image source={images[item.image]} style={styles.homeWardrobeImage} resizeMode="contain" />
      </View>
      <Text style={styles.homeWardrobeLabel} numberOfLines={1}>{item.label}</Text>
      {Number.isFinite(Number(item.count)) ? <Text style={styles.homeWardrobeCount} numberOfLines={1}>{Number(item.count)} ITEMS</Text> : null}
    </TouchableOpacity>
  );
}

const homeStudioActions = [
  { key: 'catalog', title: 'Shop Catalog', text: 'Discover styles', icon: 'grid-outline', route: 'shop' },
  { key: 'upload', title: 'Add to Wardrobe', text: 'Upload clothing', icon: 'cloud-upload-outline', route: 'closet', params: { view: 'add' } },
  { key: 'stylist', title: 'Ask AI Stylist', text: 'Personalized ideas', icon: 'sparkles-outline', route: 'stylebot' }
];

function HomeStudioSectionHead({ title, subtitle, onPress }) {
  return (
    <View style={styles.homeStudioSectionHead}>
      <View style={styles.homeStudioSectionCopy}>
        <Text style={styles.homeStudioSectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.homeStudioSectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {onPress ? (
        <TouchableOpacity style={styles.homeStudioSeeAll} activeOpacity={0.78} onPress={onPress}>
          <Text style={styles.homeStudioSeeAllText}>See All</Text>
          <Ionicons name="chevron-forward" size={16} color="#111111" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function HomeStudioHero({ onNavigate }) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 350;
  const tablet = width >= 768;
  const baseHeight = tablet ? Math.min(470, Math.round((width - 40) / 2)) : compact ? 220 : 228;
  const scaledHeight = { height: baseHeight + (fontScale > 1 ? Math.ceil((fontScale - 1) * 145) : 0) };
  return (
    <View style={[styles.homeStudioHero, compact && styles.homeStudioHeroCompact, scaledHeight]}>
      <Image source={images.homeCinematicTryOn} style={[styles.homeStudioHeroImage, tablet && styles.homeStudioHeroImageTablet]} resizeMode="cover" accessibilityIgnoresInvertColors />
      <View style={styles.homeStudioHeroTextScrim} pointerEvents="none" />
      <View style={[styles.homeStudioHeroCopy, compact && styles.homeStudioHeroCopyCompact, tablet && styles.homeStudioHeroCopyTablet]}>
        <Text style={[styles.homeStudioKicker, tablet && styles.homeStudioKickerTablet]}>AI VIRTUAL TRY-ON</Text>
        <Text style={[styles.homeStudioTitle, compact && styles.homeStudioTitleCompact, tablet && styles.homeStudioTitleTablet]} numberOfLines={2} adjustsFontSizeToFit={Platform.OS === 'ios'} minimumFontScale={0.88}>{'See it. Try it.\nLove it.'}</Text>
        <Text style={[styles.homeStudioText, tablet && styles.homeStudioTextTablet]}>Preview outfits on yourself before you buy.</Text>
        <TouchableOpacity style={[styles.homeStudioPrimaryButton, fontScale > 1 && styles.homeStudioPrimaryButtonLargeText, tablet && styles.homeStudioPrimaryButtonTablet]} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Create Your Look" onPress={() => onNavigate('tryon')}>
          <Text numberOfLines={1} style={[styles.homeStudioPrimaryText, tablet && styles.homeStudioPrimaryTextTablet]}>Create Your Look</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function HomeStudioActionTile({ item, onNavigate, narrow = false, largeText = false }) {
  return (
    <TouchableOpacity
      style={[styles.homeStudioActionTile, styles.surfaceCard, narrow && styles.homeStudioActionTileNarrow, largeText && styles.homeStudioActionTileLargeText]}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.text}`}
      onPress={() => onNavigate(item.route, item.params || {})}
    >
      <SurfaceBackdrop />
      <View style={[styles.homeStudioActionIcon, narrow && styles.homeStudioActionIconNarrow, largeText && styles.homeStudioActionIconLargeText]}>
        <Ionicons name={item.icon} size={26} color="#171412" />
      </View>
      <View style={[narrow && styles.homeStudioActionCopyNarrow, largeText && styles.homeStudioActionCopyLargeText]}>
        <Text style={[styles.homeStudioActionTitle, narrow && styles.homeStudioActionTitleNarrow]}>{item.title}</Text>
        <Text style={[styles.homeStudioActionText, narrow && styles.homeStudioActionTextNarrow]}>{item.text}</Text>
      </View>
    </TouchableOpacity>
  );
}

function HomeStyleStudio({ onNavigate }) {
  const { width, fontScale } = useWindowDimensions();
  const narrow = width / Math.max(1, fontScale) < 350;
  const largeText = narrow && fontScale >= 2;
  return (
    <View style={[styles.homeStudioPanel, styles.homeStyleStudioPanel]}>
      <HomeStudioSectionHead title="Your Style Studio" subtitle="Three ways to begin." />
      <View style={[styles.homeStudioActionGrid, narrow && styles.homeStudioActionGridNarrow]}>
        {homeStudioActions.map((item) => <HomeStudioActionTile key={item.key} item={item} onNavigate={onNavigate} narrow={narrow} largeText={largeText} />)}
      </View>
    </View>
  );
}

function HomeStudioLookCard({ product, title, meta, imageSource, onPress, compact = false, cardWidth, onAddToWishlist, isWishlisted }) {
  return (
    <TouchableOpacity
      style={[styles.homeStudioLookCard, cardWidth ? { width: cardWidth } : null, compact && styles.homeStudioLookCardCompact]}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${meta}`}
      onPress={onPress}
    >
      <View style={styles.homeStudioLookImageWrap}>
        {product?.imageUrl || product?.imageUrls?.length ? (
          <ProductImage product={product} style={styles.homeStudioLookImage} resizeMode="contain" alt={product?.title || product?.name || title} />
        ) : (
          <Image source={imageSource || images['lookmefy_model_01.png']} style={styles.homeStudioLookImage} resizeMode="cover" />
        )}
        {onAddToWishlist && product?.id ? <WishlistDoneButton saved={isWishlisted} compact onPress={() => onAddToWishlist(product)} /> : null}
      </View>
      <Text style={styles.homeStudioLookTitle} numberOfLines={2}>{title}</Text>
      <Text style={styles.homeStudioLookMeta} numberOfLines={1}>{meta}</Text>
    </TouchableOpacity>
  );
}

function HomeCuratedStyleRail({ products = [], onNavigate, onAddToWishlist, wishlistIds, itemKeyPrefix }) {
  const { width } = useWindowDimensions();
  const cardGap = 12;
  const cardWidth = Math.max(134, Math.min(184, (width - 40 - cardGap) / 2));
  const visibleProducts = fashionFirstHomeProducts(products).slice(0, 8);
  if (!visibleProducts.length) return null;
  return (
    <View style={styles.homeStudioPanel}>
      <HomeStudioSectionHead title="Curated for Your Style" subtitle="Discover pieces and looks you'll love." onPress={() => onNavigate('shop')} />
      <ScrollView {...horizontalScrollProps} contentContainerStyle={styles.homeStudioLookRow}>
        {visibleProducts.map((product) => (
          <HomeStudioLookCard
            key={`${itemKeyPrefix}-${product.id}`}
            cardWidth={cardWidth}
            product={product}
            title={product.title || product.name || product.displayLabel || 'Curated style'}
            meta={Number.isFinite(Number(product.price)) ? formatMoney(product.price, product.currency) : 'Price unavailable'}
            onPress={() => onNavigate('product', { id: product.id })}
            onAddToWishlist={onAddToWishlist}
            isWishlisted={wishlistIds?.has(product.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function HomeStudioWardrobeBanner({ closetItems = [], onNavigate }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width / Math.max(1, fontScale) < 350;
  const savedItems = closetItems.filter((item) => item?.imageUrl).slice(0, 3);
  const returning = closetItems.length > 0;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={returning ? 'Explore your wardrobe' : 'Add your first wardrobe item'}
      style={[styles.homeStudioWardrobeBanner, styles.surfaceCard, stacked && styles.homeStudioWardrobeBannerStacked]}
      activeOpacity={0.86}
      onPress={() => onNavigate('closet', returning ? { view: 'stylist' } : { view: 'add' })}
    >
      <SurfaceBackdrop />
      <View style={[styles.homeStudioWardrobeBannerCopy, stacked && styles.homeStudioWardrobeBannerCopyStacked]}>
        <Text style={styles.homeStudioBannerTitle}>{returning ? 'Your Wardrobe' : 'Your wardrobe, reimagined.'}</Text>
        <Text style={styles.homeStudioBannerText}>
          {returning ? 'Rediscover the pieces you have saved.' : 'Save your clothes. Discover new ways to style them.'}
        </Text>
        <View style={styles.homeStudioBannerButton}>
          <Text style={styles.homeStudioBannerButtonText}>{returning ? 'Explore wardrobe' : 'Add first item'}</Text>
          <Ionicons name="arrow-forward" size={15} color="#ffffff" />
        </View>
      </View>
      {savedItems.length ? (
        <View style={[styles.homeStudioSavedPreview, stacked && styles.homeStudioSavedPreviewStacked]}>
          {savedItems.map((item, index) => (
            <ResilientImage
              key={item.id || item._id || `${item.imageUrl}-${index}`}
              source={{ uri: imageUrl(item.imageUrl) }}
              style={[styles.homeStudioSavedImage, index > 0 && styles.homeStudioSavedImageOverlap]}
              resizeMode="cover"
              fallbackIcon="shirt-outline"
            />
          ))}
        </View>
      ) : returning ? (
        <View style={[styles.homeStudioSavedPreviewFallback, stacked && styles.homeStudioSavedPreviewStacked]}>
          <Ionicons name="shirt-outline" size={34} color="#5e5853" />
        </View>
      ) : (
        <Image source={images.homeStarterWardrobe} style={[styles.homeStudioBannerImage, stacked && styles.homeStudioBannerImageStacked]} resizeMode="cover" />
      )}
    </TouchableOpacity>
  );
}

function NewUserHomeStudio({ products = [], onNavigate, onAddToWishlist, wishlistIds }) {
  return (
    <>
      <HomeStudioHero onNavigate={onNavigate} />
      <HomeStyleStudio onNavigate={onNavigate} />
      <HomeStudioWardrobeBanner onNavigate={onNavigate} />
      <HomeCuratedStyleRail products={products} onNavigate={onNavigate} onAddToWishlist={onAddToWishlist} wishlistIds={wishlistIds} itemKeyPrefix="new-home" />
    </>
  );
}

function ReturningUserHomeStudio({ products = [], closetItems = [], onNavigate, onAddToWishlist, wishlistIds }) {
  return (
    <>
      <HomeStudioHero onNavigate={onNavigate} />
      <HomeStyleStudio onNavigate={onNavigate} />
      <HomeStudioWardrobeBanner closetItems={closetItems} onNavigate={onNavigate} />
      <HomeCuratedStyleRail products={products} onNavigate={onNavigate} onAddToWishlist={onAddToWishlist} wishlistIds={wishlistIds} itemKeyPrefix="return-home" />
    </>
  );
}

function HomeHeroShowcase() {
  const progress = useRef(new Animated.Value(0)).current;
  const slideCount = homeHeroShowcaseSlides.length;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: slideCount,
        duration: homeHeroSlideIntervalMs * slideCount,
        useNativeDriver: true
      })
    );
    animation.start();
    return () => animation.stop();
  }, [progress, slideCount]);

  return (
    <View style={styles.homeHeroRightPane} pointerEvents="box-none">
      {homeHeroShowcaseSlides.map((slide, index) => {
        const inputRange = [
          index - 1,
          index - 0.1,
          index,
          index + 0.82,
          index + 1,
          index + 1.1
        ];
        const firstSlideInputRange = index === 0
          ? [0, 0.82, 1, slideCount - 0.18, slideCount, slideCount + 0.1]
          : inputRange;
        const opacity = progress.interpolate({
          inputRange: firstSlideInputRange,
          outputRange: index === 0 ? [1, 1, 0, 0, 1, 1] : [0, 0, 1, 1, 0, 0],
          extrapolate: 'clamp'
        });
        const translateX = progress.interpolate({
          inputRange: firstSlideInputRange,
          outputRange: index === 0 ? [0, 0, -14, 16, 0, 0] : [16, 16, 0, 0, -14, -14],
          extrapolate: 'clamp'
        });
        const translateY = progress.interpolate({
          inputRange: firstSlideInputRange,
          outputRange: index === 0 ? [0, 0, 6, -8, 0, 0] : [-8, -8, 0, 0, 6, 6],
          extrapolate: 'clamp'
        });
        return (
          <Animated.View key={slide.key} pointerEvents="none" style={[styles.homeHeroVisualLayer, { opacity, transform: [{ translateX }] }]}>
            <Image source={slide.model} style={styles.homeHeroModel} resizeMode="cover" />
            <View style={styles.homeHeroGarmentPanel} pointerEvents="none">
              <Animated.Image source={slide.garment} style={[styles.homeHeroGarment, { opacity, transform: [{ translateY }] }]} resizeMode="contain" />
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

function HomeBeforeAfterSlider() {
  const dividerX = useRef(new Animated.Value(0)).current;
  const dividerXRef = useRef(0);
  const dragStartXRef = useRef(0);
  const [frameWidth, setFrameWidth] = useState(0);

  const handleFrameLayout = useCallback((event) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (!nextWidth) {
      return;
    }
    setFrameWidth((previousWidth) => {
      if (Math.abs(previousWidth - nextWidth) < 1) {
        return previousWidth;
      }
      const nextDividerX = previousWidth
        ? clamp(dividerXRef.current, 0, nextWidth)
        : Math.round(nextWidth / 2);
      dividerXRef.current = nextDividerX;
      dividerX.setValue(nextDividerX);
      return nextWidth;
    });
  }, [dividerX]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => frameWidth > 0,
    onStartShouldSetPanResponderCapture: () => frameWidth > 0,
    onMoveShouldSetPanResponder: (_, gesture) => (
      frameWidth > 0
      && Math.abs(gesture.dx) > 2
      && Math.abs(gesture.dx) >= Math.abs(gesture.dy)
    ),
    onMoveShouldSetPanResponderCapture: (_, gesture) => (
      frameWidth > 0
      && Math.abs(gesture.dx) > 2
      && Math.abs(gesture.dx) >= Math.abs(gesture.dy)
    ),
    onPanResponderGrant: (event) => {
      const startX = clamp(event.nativeEvent.locationX, 0, frameWidth);
      dividerXRef.current = startX;
      dragStartXRef.current = startX;
      dividerX.setValue(startX);
    },
    onPanResponderMove: (_, gesture) => {
      const nextDividerX = clamp(dragStartXRef.current + gesture.dx, 0, frameWidth);
      dividerXRef.current = nextDividerX;
      dividerX.setValue(nextDividerX);
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true
  }), [dividerX, frameWidth]);

  const afterImageStyle = frameWidth
    ? [
      styles.homeTryOnSliderImage,
      {
        width: frameWidth,
        transform: [{ translateX: Animated.multiply(dividerX, -1) }]
      }
    ]
    : styles.homeTryOnSliderImage;
  const beforeBadgeOpacity = dividerX.interpolate({
    inputRange: [0, 32, 64],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp'
  });
  const afterBadgeOpacity = frameWidth
    ? dividerX.interpolate({
      inputRange: [Math.max(frameWidth - 64, 0), Math.max(frameWidth - 32, 0), frameWidth],
      outputRange: [1, 0, 0],
      extrapolate: 'clamp'
    })
    : 1;

  return (
    <View
      style={styles.homeTryOnCompareFrame}
      onLayout={handleFrameLayout}
      {...panResponder.panHandlers}
    >
      <Image pointerEvents="none" source={images.lookmefyTryOnBefore} style={styles.homeTryOnSliderImage} resizeMode="cover" />
      <Animated.View pointerEvents="none" style={[styles.homeTryOnSliderAfterClip, { left: dividerX }]}>
        <Animated.Image source={images.lookmefyTryOnAfter} style={afterImageStyle} resizeMode="cover" />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.homeTryOnSliderDivider, { left: dividerX }]} />
      <Animated.View pointerEvents="none" style={[styles.homeTryOnCompareHandle, { left: dividerX }]}>
        <Ionicons name="chevron-back" size={13} color="#111111" />
        <Ionicons name="chevron-forward" size={13} color="#111111" />
      </Animated.View>
      <View pointerEvents="none" style={styles.homeTryOnCompareBadgeLayer}>
        <Animated.View style={[styles.homeTryOnCompareBadge, { opacity: beforeBadgeOpacity }]}>
          <Text style={styles.homeTryOnCompareBadgeText}>Before</Text>
        </Animated.View>
        <Animated.View style={[styles.homeTryOnCompareBadge, styles.homeTryOnCompareBadgeRight, { opacity: afterBadgeOpacity }]}>
          <Text style={styles.homeTryOnCompareBadgeText}>After</Text>
        </Animated.View>
      </View>
    </View>
  );
}

function ProductTopBar({ onNavigate, user, onBack, showSearch = true, preserveWordmarkOnNarrow = false, children }) {
  return (
    <>
      <AppHeader onNavigate={onNavigate} user={user} compact showSearch={showSearch} preserveWordmarkOnNarrow={preserveWordmarkOnNarrow} />
      <PageBackRow onBack={onBack}>{children}</PageBackRow>
    </>
  );
}

function CompleteLookCard({ product, fallback, onPress, onAddToWishlist, isWishlisted }) {
  const source = product ? productImageSource(product) : images[fallback.image];
  const price = Number(product?.price);
  return (
    <TouchableOpacity style={styles.completeLookCard} activeOpacity={0.86} onPress={onPress}>
      <View style={styles.completeLookImageWrap}>
        {product ? <ProductImage product={product} style={styles.completeLookImage} alt={product.title || product.name} /> : <ResilientImage source={source} fallbackSource={images.hero} style={styles.completeLookImage} resizeMode="cover" fallbackIcon="shirt-outline" />}
        {product && onAddToWishlist ? <WishlistDoneButton saved={isWishlisted} compact onPress={() => onAddToWishlist(product)} /> : null}
      </View>
      <Text style={styles.completeLookBrand} numberOfLines={1}>{product?.displayLabel || fallback?.brand}</Text>
      <Text style={styles.completeLookName} numberOfLines={2}>{product?.title || product?.name || fallback?.name}</Text>
      <Text style={styles.completeLookPrice}>{product ? (Number.isFinite(price) ? formatMoney(price, product.currency) : 'Price unavailable') : fallback?.price}</Text>
    </TouchableOpacity>
  );
}

function ConciergeSuggestionCard({ product, fallback, featured, onOpenProduct, onShop, onTryOn, onPreview, tryOn, tryOnLoading, tryOnError, actionLabel = 'Generate Try-On' }) {
  const source = product ? productImageSource(product) : images[fallback.image];
  const price = Number(product?.price);
  const handleCardPress = onOpenProduct || onShop;
  const handleImagePress = onPreview || handleCardPress;
  const onlineProduct = isOnlineAiStudioProduct(product);
  const sourceLabel = onlineProduct ? 'Online result' : product?.sourceLabel || (product?.source === 'wardrobe' ? 'Wardrobe item' : product?.source ? 'Lookmefy catalog' : '');
  return (
    <View style={[styles.conciergeSuggestionCard, styles.surfaceCard]}>
      <TouchableOpacity
        style={styles.conciergeSuggestionImageWrap}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={tryOn?.imageUrl ? `View AI preview for ${product?.title || product?.name || 'product'}` : `View product photo for ${product?.title || product?.name || fallback?.name || 'product'}`}
        onPress={handleImagePress}
      >
        {product ? <ProductImage product={product} tryOn={tryOn} style={styles.conciergeSuggestionImage} alt={product.title || product.name} /> : <ResilientImage source={source} fallbackSource={images.hero} style={styles.conciergeSuggestionImage} resizeMode="cover" fallbackIcon="shirt-outline" />}
        {tryOn?.imageUrl ? <Text style={styles.badge}>AI Try-On</Text> : null}
        {tryOnLoading ? <TryOnLoading text="Generating" /> : null}
        {featured ? (
          <TouchableOpacity style={styles.conciergeSparkButton} onPress={onTryOn || onShop}>
            <Ionicons name="sparkles" size={24} color="#050505" />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>
      <View style={styles.conciergeSuggestionBody}>
        <TouchableOpacity
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={`Open product details for ${product?.title || product?.name || fallback?.name || 'product'}`}
          onPress={handleCardPress}
        >
          {sourceLabel ? <Text style={styles.conciergeSourceBadge} numberOfLines={1}>{sourceLabel}</Text> : null}
          <Text style={styles.conciergeSuggestionBrand} numberOfLines={1}>{product?.displayLabel || fallback?.brand}</Text>
          <Text style={styles.conciergeSuggestionName} numberOfLines={2}>{product?.title || product?.name || fallback?.name}</Text>
          <Text style={styles.conciergeSuggestionPrice}>{product ? (Number.isFinite(price) ? formatMoney(price, product.currency) : 'Price unavailable') : fallback?.price}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.conciergeShopButton, tryOnLoading && styles.disabledButton]} disabled={tryOnLoading} onPress={onTryOn || onShop}>
          <Text style={styles.conciergeShopText}>{tryOnLoading ? 'Generating...' : actionLabel}</Text>
        </TouchableOpacity>
        {tryOn?.imageUrl ? <ReportContentAction content={reportContentReference(tryOn, isOnlineAiStudioProduct(product) ? 'external_tryon' : 'product_tryon')} /> : null}
        {tryOnError ? <Text style={styles.errorText}>{tryOnError}</Text> : null}
        {product?.id && !onlineProduct && onShop && onTryOn ? <TouchableOpacity style={styles.conciergeExternalLink} onPress={onShop}><Text style={styles.conciergeExternalLinkText}>View product</Text></TouchableOpacity> : null}
      </View>
    </View>
  );
}

function AiStudioOutfitCard({ outfit }) {
  const items = Array.isArray(outfit?.items) ? outfit.items : [];
  return (
    <View style={styles.aiOutfitCard}>
      <View style={styles.aiOutfitHead}>
        <Text style={styles.aiOutfitTitle} numberOfLines={2}>{outfit?.title || 'Recommended outfit'}</Text>
        {outfit?.sourceLabel ? <Text style={styles.aiOutfitSource} numberOfLines={1}>{stylistResponseText(outfit.sourceLabel)}</Text> : null}
      </View>
      {outfit?.reason ? <Text style={styles.aiOutfitReason}>{outfit.reason}</Text> : null}
      {items.length ? (
        <ScrollView {...horizontalScrollProps} contentContainerStyle={styles.aiOutfitItems}>
          {items.map((item) => (
            <View style={styles.aiOutfitItem} key={item.id || item.name}>
              {item.imageUrl ? (
                <ResilientImage source={{ uri: imageUrl(item.imageUrl) }} style={styles.aiOutfitItemImage} resizeMode="cover" />
              ) : (
                <View style={styles.aiOutfitItemFallback}>
                  <Ionicons name="shirt-outline" size={20} color="#9b5658" />
                </View>
              )}
              <Text style={styles.aiOutfitItemName} numberOfLines={2}>{item.name || 'Wardrobe item'}</Text>
              <Text style={styles.aiOutfitItemMeta} numberOfLines={1}>{[item.category, item.color].filter(Boolean).join(' · ') || 'Wardrobe'}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function HomeScreen({ onNavigate, user, token, onAddToWishlist, wishlistIds, registerTourTarget, tourFocusRequest, initialScrollY = 0, onScrollPositionChange }) {
  const layout = useResponsiveLayout();
  const homeScrollRef = useRef(null);
  const homeScrollMetricsRef = useRef({ offset: 0, viewport: 0, content: 0 });
  const homeRestorePendingRef = useRef(initialScrollY > 0 ? initialScrollY : null);
  const homeRestoreWarmedContentRef = useRef(0);
  const homeRestoreSettleTimerRef = useRef(null);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [homeAiRecommendationSeed, setHomeAiRecommendationSeed] = useState(0);
  const preferredGender = productGenderForUser(user);
  const preferredApiGender = productApiGenderForUser(user);
  const curated = useProducts({ sort: 'newest', limit: homeProductFeedPageSize, gender: preferredApiGender, refreshKey: homeRefreshKey }, token);
  const recommended = useRecommendedProducts(user, token, 16, homeRefreshKey);
  const shopLooks = usePagedShopProducts({ sort: 'newest', refreshKey: homeRefreshKey }, token, null, layout.isTablet ? 12 : 24);
  const closet = useApiState('/closet', token, Boolean(user), { items: [], outfits: [], suggestions: [], stats: {} });
  const closetData = closet.data || {};
  const closetItems = Array.isArray(closetData.items) ? closetData.items : [];
  const catalogProducts = useMemo(() => uniqueProductsWithImages(curated.products), [curated.products]);
  const arrivalProducts = useMemo(() => {
    const newArrivalProducts = catalogProducts.filter((product) => product.isNew);
    return diversifyHomeProducts([...newArrivalProducts, ...catalogProducts.filter((product) => !product.isNew)], catalogProducts);
  }, [catalogProducts]);
  const tryOnPickProducts = useMemo(() => (
    catalogProducts
      .filter((product) => !arrivalProducts.some((arrival) => arrival.id === product.id))
      .slice(0, 8)
  ), [arrivalProducts, catalogProducts]);
  const recommendedProducts = useMemo(
    () => diversifyHomeProducts(recommended.products, catalogProducts),
    [recommended.products, catalogProducts]
  );
  const homeAiRecommendationProducts = useMemo(
    () => uniqueProductsWithImages([...recommendedProducts, ...arrivalProducts, ...tryOnPickProducts, ...catalogProducts]),
    [arrivalProducts, catalogProducts, recommendedProducts, tryOnPickProducts]
  );
  const homeAiRecommendationCards = useMemo(
    () => buildHomeAiRecommendationCards(homeAiRecommendationProducts, homeAiRecommendationSeed, preferredGender),
    [homeAiRecommendationProducts, homeAiRecommendationSeed, preferredGender]
  );
  const homeOffers = useMemo(
    () => buildHomeOfferCards({ catalogProducts, arrivalProducts, tryOnPickProducts, feedGender: preferredGender }),
    [arrivalProducts, catalogProducts, preferredGender, tryOnPickProducts]
  );
  const commerceSections = useMemo(() => {
    const pricedProducts = catalogProducts.filter((product) => Number(product.price || 0) > 0);
    const byDiscount = uniqueProductsWithImages(catalogProducts)
      .filter((product) => productDiscountPercent(product) > 0)
      .sort((a, b) => productDiscountPercent(b) - productDiscountPercent(a));
    const byRating = uniqueProductsWithImages(catalogProducts)
      .filter((product) => Number(product.rating || 0) > 0)
      .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
    const bestSellers = uniqueProductsWithImages(catalogProducts)
      .filter((product) => productMetric(product, ['soldCount', 'salesCount', 'orderCount', 'orders']) > 0)
      .sort((a, b) => productMetric(b, ['soldCount', 'salesCount', 'orderCount', 'orders']) - productMetric(a, ['soldCount', 'salesCount', 'orderCount', 'orders']));
    return [
      {
        id: 'top-deals',
        title: 'Top Deals',
        subtitle: 'Live markdowns from the catalog',
        products: diversifyHomeProducts(byDiscount, catalogProducts),
        loading: curated.loading,
        error: curated.error,
        viewParams: { discounted: 'true' }
      },
      {
        id: 'under-499',
        title: 'Under ₹499',
        subtitle: 'Budget-friendly finds',
        products: diversifyHomeProducts(pricedProducts.filter((product) => Number(product.price || 0) < 499), catalogProducts),
        loading: curated.loading,
        error: curated.error,
        viewParams: { maxPrice: '499' }
      },
      {
        id: 'under-999',
        title: 'Under ₹999',
        subtitle: 'More styles at easy prices',
        products: diversifyHomeProducts(pricedProducts.filter((product) => Number(product.price || 0) < 999), catalogProducts),
        loading: curated.loading,
        error: curated.error,
        viewParams: { maxPrice: '999' }
      },
      {
        id: 'top-rated',
        title: 'Top Rated',
        subtitle: 'Highest rated catalog products',
        products: diversifyHomeProducts(byRating, catalogProducts),
        loading: curated.loading,
        error: curated.error,
        viewParams: preferredApiGender ? { gender: preferredApiGender, sort: 'newest' } : { sort: 'newest' }
      },
      {
        id: 'best-sellers',
        title: 'Best Sellers',
        subtitle: 'Ranked from available sales data',
        products: diversifyHomeProducts(bestSellers, catalogProducts),
        loading: curated.loading,
        error: curated.error,
        viewParams: preferredApiGender ? { gender: preferredApiGender } : {}
      }
    ].filter((section) => section.loading || uniqueProductsWithImages(section.products).length >= 4);
  }, [catalogProducts, curated.error, curated.loading, preferredGender, recommended.error, recommended.loading, recommendedProducts]);
  const shopLookProducts = shopLooks.products;
  const shopLookRows = useMemo(() => {
    const columns = layout.isTablet ? 3 : 2;
    const rows = [];
    for (let index = 0; index < shopLookProducts.length; index += columns) {
      rows.push(shopLookProducts.slice(index, index + columns));
    }
    return rows;
  }, [layout.isTablet, shopLookProducts]);
  const loadMoreHomeLooksNearEnd = useCallback(() => {
    const { offset, viewport, content } = homeScrollMetricsRef.current;
    if (viewport > 0 && content > 0 && content - offset - viewport < 700
      && shopLooks.hasMore && !shopLooks.loading && !shopLooks.loadingMore && !shopLooks.loadMoreError) {
      shopLooks.loadMore();
    }
  }, [shopLooks.hasMore, shopLooks.loading, shopLooks.loadingMore, shopLooks.loadMoreError, shopLooks.loadMore]);
  const restoreHomeScrollWhenReady = useCallback(() => {
    const offset = homeRestorePendingRef.current;
    if (offset == null) return;
    const { viewport, content } = homeScrollMetricsRef.current;
    if (viewport <= 0) return;
    if (content - viewport < offset - 24) {
      // FlatList measures distant rows lazily. Warm its end once per content-size change
      // so a saved position beyond the initial render window becomes reachable.
      if (!shopLooks.loading && shopLookRows.length && content > homeRestoreWarmedContentRef.current + 1) {
        homeRestoreWarmedContentRef.current = content;
        requestAnimationFrame(() => homeScrollRef.current?.scrollToEnd?.({ animated: false }));
      }
      return;
    }
    homeScrollRef.current?.scrollToOffset?.({ offset, animated: false });
    if (homeRestoreSettleTimerRef.current) clearTimeout(homeRestoreSettleTimerRef.current);
    homeRestoreSettleTimerRef.current = setTimeout(() => {
      homeScrollRef.current?.scrollToOffset?.({ offset, animated: false });
      homeRestorePendingRef.current = null;
      homeRestoreSettleTimerRef.current = null;
    }, 350);
  }, [shopLooks.loading, shopLookRows.length]);
  useEffect(() => {
    const timer = setTimeout(loadMoreHomeLooksNearEnd, 120);
    return () => clearTimeout(timer);
  }, [loadMoreHomeLooksNearEnd, shopLookProducts.length]);
  const homeCurationTitle = preferredGender === 'men' ? "Men's New Arrivals" : preferredGender === 'women' ? "Women's New Arrivals" : 'Curated New Arrivals';
  const isReturningHomeUser = Boolean(user && (closetItems.length || (Array.isArray(closetData.outfits) && closetData.outfits.length) || (Array.isArray(closetData.suggestions) && closetData.suggestions.length)));
  const studioProducts = uniqueProductsWithImages([...recommendedProducts, ...arrivalProducts, ...tryOnPickProducts, ...catalogProducts]);
  const catalogTourTarget = useTourTarget('home-catalog', registerTourTarget, { request: tourFocusRequest, scrollRef: homeScrollRef, scrollOffset: 92 });
  const handleHomeRefresh = useCallback(() => {
    const nextSeed = Date.now();
    setHomeRefreshing(true);
    setHomeRefreshKey(nextSeed);
    setHomeAiRecommendationSeed(nextSeed);
  }, []);
  const refreshHomeAiRecommendations = useCallback(() => {
    const nextSeed = Date.now();
    setHomeAiRecommendationSeed(nextSeed);
    setHomeRefreshKey(nextSeed);
  }, []);

  useEffect(() => {
    if (!homeRefreshing) return undefined;
    const refreshTimer = setTimeout(() => {
      if (!curated.loading && !recommended.loading && !shopLooks.loading) setHomeRefreshing(false);
    }, 500);
    return () => clearTimeout(refreshTimer);
  }, [curated.loading, homeRefreshing, recommended.loading, shopLooks.loading]);

  useEffect(() => {
    const restoreTimer = setTimeout(restoreHomeScrollWhenReady, 80);
    return () => {
      clearTimeout(restoreTimer);
      if (homeRestoreSettleTimerRef.current) clearTimeout(homeRestoreSettleTimerRef.current);
    };
  }, [restoreHomeScrollWhenReady]);

  return (
    <View style={styles.homeScreen}>
      <AppHeader onNavigate={onNavigate} user={user} compact showSearch={false} />
      <FlatList
        ref={homeScrollRef}
        style={styles.homeScroll}
        contentContainerStyle={[styles.homeContent, layout.isTablet && styles.homeContentTablet]}
        data={shopLookRows}
        keyExtractor={(row) => row[0].id}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={40}
        windowSize={5}
        onEndReached={shopLooks.loadMore}
        onEndReachedThreshold={0.5}
        onLayout={(event) => {
          homeScrollMetricsRef.current.viewport = event.nativeEvent.layout.height;
          restoreHomeScrollWhenReady();
          loadMoreHomeLooksNearEnd();
        }}
        onContentSizeChange={(_width, height) => {
          homeScrollMetricsRef.current.content = height;
          restoreHomeScrollWhenReady();
          loadMoreHomeLooksNearEnd();
        }}
        refreshControl={(
          <RefreshControl
            refreshing={homeRefreshing}
            onRefresh={handleHomeRefresh}
            tintColor="#9b5658"
            colors={['#9b5658']}
            progressBackgroundColor="#fffdfb"
          />
        )}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          homeScrollMetricsRef.current = {
            offset: contentOffset.y,
            viewport: layoutMeasurement.height,
            content: contentSize.height
          };
          if (homeRestorePendingRef.current == null) onScrollPositionChange?.(contentOffset.y);
          loadMoreHomeLooksNearEnd();
        }}
        {...screenScrollProps}
        scrollEventThrottle={32}
        ListHeaderComponent={<>
        {isReturningHomeUser ? (
          <ReturningUserHomeStudio
            products={studioProducts}
            closetItems={closetItems}
            onNavigate={onNavigate}
            onAddToWishlist={onAddToWishlist}
            wishlistIds={wishlistIds}
          />
        ) : (
          <NewUserHomeStudio
            products={studioProducts}
            onNavigate={onNavigate}
            onAddToWishlist={onAddToWishlist}
            wishlistIds={wishlistIds}
          />
        )}

        <View ref={catalogTourTarget.ref} onLayout={catalogTourTarget.onLayout} />

      <HomeProductRail
        title="Recommended for Your Style"
        subtitle="Selected from your Lookmefy profile"
        products={recommendedProducts}
        loading={(curated.loading || recommended.loading) && !recommendedProducts.length}
        error={recommendedProducts.length ? '' : recommended.error || curated.error}
        viewParams={preferredApiGender ? { gender: preferredApiGender } : {}}
        onNavigate={onNavigate}
        onAddToWishlist={onAddToWishlist}
        wishlistIds={wishlistIds}
      />

      <HomeOfferCards offers={homeOffers} onNavigate={onNavigate} />

      <HomeProductRail
        title={homeCurationTitle}
        subtitle="Fresh styles from the live catalog"
        products={arrivalProducts}
        loading={curated.loading}
        error={curated.error}
        viewParams={preferredApiGender ? { gender: preferredApiGender, sort: 'newest' } : { sort: 'newest' }}
        onNavigate={onNavigate}
        onAddToWishlist={onAddToWishlist}
        wishlistIds={wishlistIds}
      />

      {commerceSections.map((section) => (
        <HomeProductRail
          key={section.id}
          title={section.title}
          subtitle={section.subtitle}
          products={section.products}
          loading={section.loading}
          error={section.error}
          viewParams={section.viewParams}
          onNavigate={onNavigate}
          onAddToWishlist={onAddToWishlist}
          wishlistIds={wishlistIds}
        />
      ))}

      <View style={styles.homeJournalBand}>
        <View style={styles.homeJournalHead}>
          <View>
            <Text style={styles.homeJournalKicker}>LIVE CATALOG</Text>
            <Text style={styles.homeJournalTitle}>Explore the Catalog</Text>
          </View>
        </View>
        <Text style={[styles.homeJournalIntro, layout.isTablet && styles.homeJournalIntroTablet]}>Browse products from the live catalog. Open an item for details and try-on options.</Text>
        {shopLooks.loading || (!shopLookProducts.length && shopLooks.loadingMore) ? (
          <HomeJournalSkeletonGrid />
        ) : shopLooks.error || !shopLookProducts.length ? (
          <StatusPanel error={shopLooks.error} empty={!shopLookProducts.length} text="No catalog products found yet." />
        ) : null}
      </View>
        </>}
        renderItem={({ item: row }) => (
          <View style={[styles.homeJournalGridRow, layout.isTablet && styles.homeJournalGridRowTablet]}>
            {row.map((product) => {
              const price = Number(product.price);
              return (
                <TouchableOpacity key={product.id} style={[styles.homeJournalProductCard, styles.surfaceCard, layout.isTablet && styles.homeJournalProductCardTablet]} activeOpacity={0.86} onPress={() => onNavigate('product', { id: product.id })}>
                  <View style={styles.homeJournalImageFrame}>
                    <ProductImage product={product} style={styles.homeJournalImage} resizeMode="cover" alt={product.title || product.name} />
                    {onAddToWishlist ? <WishlistDoneButton saved={wishlistIds?.has(product.id)} compact onPress={() => onAddToWishlist(product)} /> : null}
                  </View>
                  <View style={styles.homeJournalProductBody}>
                    <Text style={styles.homeJournalProductLabel} numberOfLines={1}>{product.displayLabel || titleCase(product.category || 'Catalog')}</Text>
                    <Text style={styles.homeJournalProductTitle} numberOfLines={2}>{product.title || product.name}</Text>
                    <Text style={styles.homeJournalProductPrice}>{Number.isFinite(price) ? formatMoney(price, product.currency) : 'Price unavailable'}</Text>
                    <TouchableOpacity
                      style={styles.homeJournalTryOnButton}
                      activeOpacity={0.86}
                      onPress={(event) => {
                        event?.stopPropagation?.();
                        onNavigate('product', { id: product.id });
                      }}
                    >
                      <Ionicons name="shirt-outline" size={14} color="#ffffff" />
                      <Text style={styles.homeJournalTryOnText}>Try On</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.homeJournalVideoButton}
                      activeOpacity={0.86}
                      onPress={(event) => {
                        event?.stopPropagation?.();
                        onNavigate('product', { id: product.id });
                      }}
                    >
                      <Ionicons name="videocam-outline" size={14} color="#111827" />
                      <Text style={styles.homeJournalVideoText}>Video Try-On</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        ListFooterComponent={<View style={styles.homeJournalFooter}>
        {shopLooks.loadingMore && shopLookProducts.length ? <ActivityIndicator style={styles.shopProductLoadingMore} color="#252221" /> : null}
        {shopLooks.loadMoreError ? (
          <TouchableOpacity accessibilityRole="button" style={styles.shopProductRetry} onPress={shopLooks.retryLoadMore}>
            <Text style={styles.shopProductRetryText}>{shopLooks.loadMoreError} Tap to retry.</Text>
          </TouchableOpacity>
        ) : null}
        {shopLookProducts.length ? (
          <Text style={styles.homeJournalCount}>
            {shopLooks.hasMore
              ? `${shopLookProducts.length.toLocaleString('en-IN')} products loaded · Scroll for more`
              : `All ${shopLookProducts.length.toLocaleString('en-IN')} available products shown`}
          </Text>
        ) : null}
        </View>}
      />
    </View>
  );
}

function FilterChips({ selected, options, onSelect, compact, wrap }) {
  const content = options.map((option) => {
    const value = Array.isArray(option) ? option[0] : option;
    const label = Array.isArray(option) ? option[1] : titleCase(option);
    const active = selected === value;
    return (
      <TouchableOpacity
        key={`${value || 'all'}-${label}`}
        accessibilityRole="button"
        style={[styles.chip, active && styles.activeChip, compact && styles.compactChip, wrap && styles.wrappedChip]}
        onPress={() => onSelect(value)}
      >
        <Text style={[styles.chipText, active && styles.activeChipText]}>{label}</Text>
      </TouchableOpacity>
    );
  });

  if (wrap) return <View style={[styles.chipRow, styles.wrappedChipRow]}>{content}</View>;

  return (
    <ScrollView {...horizontalScrollProps} contentContainerStyle={styles.chipRow}>
      {content}
    </ScrollView>
  );
}

function FilterDropdown({ label, selected, options, onSelect }) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => (Array.isArray(option) ? option[0] : option) === selected) || options[0];
  const selectedLabel = String(Array.isArray(selectedOption) ? selectedOption[1] : titleCase(selectedOption || '') || label);
  const hasValue = Boolean(selected) || label === 'Sort';

  return (
    <>
      <TouchableOpacity accessibilityRole="button" activeOpacity={0.82} style={[styles.dropdownButton, hasValue && styles.dropdownButtonActive]} onPress={() => setOpen(true)}>
        <View style={styles.dropdownCopy}>
          <Text style={styles.dropdownLabel}>{label}</Text>
          <Text style={styles.dropdownValue} numberOfLines={1}>{selectedLabel}</Text>
        </View>
        <Ionicons name="chevron-down" size={14} color={hasValue ? '#8c4d50' : '#6f6863'} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.dropdownBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.dropdownSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.dropdownHandle} />
            <Text style={styles.dropdownTitle}>{label}</Text>
            <ScrollView style={styles.dropdownOptions} {...screenScrollProps}>
              {options.map((option) => {
                const value = Array.isArray(option) ? option[0] : option;
                const optionLabel = Array.isArray(option) ? option[1] : titleCase(option);
                const active = selected === value;
                return (
                  <TouchableOpacity
                    key={`${value || 'all'}-${optionLabel}`}
                    style={[styles.dropdownOption, active && styles.dropdownOptionActive]}
                    onPress={() => {
                      setOpen(false);
                      onSelect(value);
                    }}
                  >
                    <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}>{optionLabel}</Text>
                    {active ? <Ionicons name="checkmark" size={18} color="#0f766e" /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function TryOnVideoPlayer({ uri, style, nativeControls = true }) {
  const privateMediaSession = useContext(PrivateMediaSessionContext);
  const source = authenticatedMediaSource(uri ? { uri } : null, { apiOrigin: imageUrl('/api/health'), sessionToken: privateMediaSession });
  const player = useVideoPlayer(source ? { ...source, useCaching: false } : null, (instance) => {
    instance.loop = true;
    instance.muted = true;
    if (source) instance.play();
  });

  return (
    <View style={[style || styles.detailVideo, styles.videoSurface]}>
      <VideoView
        player={player}
        style={styles.videoSurfacePlayer}
        nativeControls={nativeControls}
        contentFit="contain"
        allowsFullscreen
        allowsPictureInPicture
      />
    </View>
  );
}

function SearchScreen({ initial = {}, user, token, onNavigate, onBack, onAddToWishlist, wishlistIds }) {
  const inputRef = useRef(null);
  const initialQuery = String(initial.q || '');
  const [query, setQuery] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery.trim());
  const [recentSearches, setRecentSearches] = useState([]);
  const hasSubmittedQuery = Boolean(submittedQuery);
  const state = useProducts({ q: submittedQuery, limit: shopProductGridLimit, enabled: hasSubmittedQuery }, token);
  const products = state.products || [];
  const recentKey = useMemo(() => recentSearchStorageKey(user), [user?.id, user?._id, user?.phone, user?.username]);

  useEffect(() => {
    const nextQuery = String(initial.q || '');
    setQuery(nextQuery);
    setSubmittedQuery(nextQuery.trim());
  }, [JSON.stringify(initial || {})]);

  useEffect(() => {
    let alive = true;
    async function loadRecentSearches() {
      const stored = await loadStoredRecentSearches(recentKey);
      let synced = [];
      if (user && token) {
        try {
          const data = await api(`/recommendations/recent-searches?limit=${recentSearchLimit}`);
          synced = normalizeRecentSearches(data.searches || []);
        } catch {
          synced = [];
        }
      }
      const nextSearches = synced.length ? synced : stored;
      if (!alive) return;
      setRecentSearches(nextSearches);
      if (synced.length) saveStoredRecentSearches(recentKey, synced);
    }
    loadRecentSearches();
    return () => {
      alive = false;
    };
  }, [recentKey, token, user?.id, user?._id]);

  const runSearch = useCallback((nextValue = query) => {
    const nextQuery = String(nextValue || '').trim();
    setQuery(nextQuery);
    setSubmittedQuery(nextQuery);
    if (nextQuery) {
      setRecentSearches((current) => {
        const nextSearches = normalizeRecentSearches([nextQuery, ...current]);
        saveStoredRecentSearches(recentKey, nextSearches);
        return nextSearches;
      });
      if (user && token) {
        api('/recommendations/events', {
          method: 'POST',
          body: JSON.stringify({ type: 'search', query: nextQuery })
        }).catch(() => {});
      }
    }
  }, [query, recentKey, token, user?.id, user?._id]);

  const clearSearch = () => {
    setQuery('');
    setSubmittedQuery('');
    inputRef.current?.focus?.();
  };
  return (
    <View style={styles.searchScreen}>
      <View style={styles.searchTopBar}>
        <View style={styles.searchCompactInputWrap}>
          <Ionicons name="search-outline" size={23} color="#9e99ad" />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by Keyword or Product ID"
            placeholderTextColor="#8d8a99"
            returnKeyType="search"
            onSubmitEditing={() => runSearch()}
            style={styles.searchCompactInput}
          />
          {query ? (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search" style={styles.searchTopIconButton} onPress={clearSearch}>
              <Ionicons name="close-circle" size={20} color="#9e99ad" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.searchContent} {...screenScrollProps}>
        {!hasSubmittedQuery ? (
          <>
            <View style={styles.searchUtilitySection}>
              <Text style={styles.searchUtilityTitle}>Your Recent Searches</Text>
              {recentSearches.length ? (
                <View style={styles.recentSearchList}>
                  {recentSearches.map((item) => (
                    <TouchableOpacity key={item} style={styles.recentSearchRow} activeOpacity={0.76} onPress={() => runSearch(item)}>
                      <Ionicons name="time-outline" size={24} color="#4e4a54" />
                      <Text style={styles.recentSearchText}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.recentSearchEmpty}>Your searches will appear here.</Text>
              )}
            </View>
            <View style={styles.searchPopularBlock}>
              <Text style={styles.searchUtilityTitle}>Popular Searches</Text>
              <View style={styles.searchSuggestionGrid}>
                {searchQuickSuggestions.map((suggestion) => (
                  <TouchableOpacity key={suggestion} style={styles.searchSuggestionChip} activeOpacity={0.82} onPress={() => runSearch(suggestion)}>
                    <Text style={styles.searchSuggestionText}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={styles.searchPromoBanner} activeOpacity={0.86} onPress={() => runSearch('saree earrings')}>
              <View style={styles.searchPromoCopy}>
                <Text style={styles.searchPromoTitle}>Jhumka Bareilly ka ya Saree Banarasi</Text>
                <Text style={styles.searchPromoText}>Shop what you love</Text>
              </View>
              <View style={styles.searchPromoImageCluster}>
                <Image source={images['category-generated/jewellery.png']} style={[styles.searchPromoImage, styles.searchPromoImageSmall]} resizeMode="contain" />
                <Image source={images['category-generated/saree.png']} style={[styles.searchPromoImage, styles.searchPromoImageLarge]} resizeMode="contain" />
              </View>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.searchResultsHead}>
              <Text style={styles.searchResultsTitle}>Results for "{submittedQuery}"</Text>
              <Text style={styles.searchResultsMeta}>{state.loading ? 'Searching...' : `${state.total || products.length} products`}</Text>
            </View>
            {state.loading ? <ProductGridSkeleton /> : null}
            {state.error ? <StatusPanel error={state.error} /> : null}
            {!state.loading && !state.error && !products.length ? (
              <View style={styles.searchEmptyCard}>
                <Ionicons name="search-outline" size={25} color="#9b5658" />
                <Text style={styles.searchEmptyTitle}>No results found</Text>
                <Text style={styles.searchEmptyText}>Try a broader term, another category, or a different spelling.</Text>
              </View>
            ) : null}
            {!state.loading && products.length ? (
              <View style={styles.productGrid}>
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    variant="homeFrame"
                    product={product}
                    onPress={() => onNavigate('product', { id: product.id })}
                    onAddToWishlist={onAddToWishlist}
                    isWishlisted={wishlistIds?.has(product.id)}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ShopScreen({ initial = {}, tryOnMode, user, setUser, token, onNavigate, onBack, onRequireAuth, onAuthExpired, onAddToWishlist, wishlistIds, initialScrollY = 0, onScrollPositionChange }) {
  if (tryOnMode) {
    return <StyleBotScreen user={user} setUser={setUser} token={token} onNavigate={onNavigate} onRequireAuth={onRequireAuth} />;
  }

  const layout = useResponsiveLayout();
  const [draft, setDraft] = useState(initial.q || '');
  const [filters, setFilters] = useState({
    q: initial.q || '',
    category: initial.category || '',
    brand: initial.brand || '',
    gender: initial.gender || '',
    sort: initial.sort || '',
    newArrival: initial.newArrival || '',
    maxPrice: initial.maxPrice || '',
    discounted: initial.discounted || '',
    sale: initial.sale || ''
  });
  const explicitCategorySection = initial.section || initial.categoryGroup || '';
  const initialCategorySection = categoryPageContent[explicitCategorySection] ? explicitCategorySection : 'popular';
  const [selectedCategory, setSelectedCategory] = useState(initialCategorySection);
  const [tryOnLoading, setTryOnLoading] = useState({});
  const [tryOnVideoLoading, setTryOnVideoLoading] = useState({});
  const [tryOnErrors, setTryOnErrors] = useState({});
  const [tryOnVideoErrors, setTryOnVideoErrors] = useState({});
  const shopScrollRef = useRef(null);
  const missionPreset = missionProductPresets[String(initial.mission || '').toLowerCase()] || null;
  const state = usePagedShopProducts(filters, token, missionPreset);
  const [tryOns, setTryOns] = useTryOns(user, state.products, token);
  const resultTitle = missionPreset?.title || shopResultTitle(filters, false);
  const searchPlaceholder = filters.category
    ? `Search in ${titleCase(filters.category)}`
    : filters.q
      ? `Search ${String(filters.q).toLowerCase()}, brands, colours`
      : 'Search products, brands, colours';
  const hasSearchIntent = Boolean(filters.q || filters.category || filters.brand || filters.gender || filters.newArrival || filters.maxPrice || filters.discounted || filters.sale);
  const showStorefront = !tryOnMode && !hasSearchIntent && !filters.sort;

  useEffect(() => {
    setDraft(initial.q || '');
    setFilters({
      q: initial.q || '',
      category: initial.category || '',
      brand: initial.brand || '',
      gender: initial.gender || '',
      sort: initial.sort || '',
      newArrival: initial.newArrival || '',
      maxPrice: initial.maxPrice || '',
      discounted: initial.discounted || '',
      sale: initial.sale || ''
    });
  }, [JSON.stringify(initial || {}), tryOnMode]);

  useEffect(() => {
    if (explicitCategorySection) {
      setSelectedCategory(categoryPageContent[explicitCategorySection] ? explicitCategorySection : 'popular');
      return;
    }
    if (initial.q || initial.category || initial.gender || initial.brand || initial.newArrival || initial.maxPrice || initial.discounted || initial.sale) return;
    setSelectedCategory('popular');
  }, [JSON.stringify(initial || {}), explicitCategorySection]);

  useEffect(() => {
    if (!initialScrollY || showStorefront) return undefined;
    const restoreTimer = setTimeout(() => {
      shopScrollRef.current?.scrollToOffset?.({ offset: initialScrollY, animated: false });
    }, 80);
    return () => clearTimeout(restoreTimer);
  }, [initialScrollY, showStorefront]);

  const runSearch = () => {
    setFilters((current) => ({ ...current, q: draft.trim() }));
  };
  const selectMissionChip = useCallback((params = {}) => {
    setDraft(params.q || '');
    setFilters((current) => ({
      ...current,
      q: params.q || '',
      category: params.category || '',
      brand: params.brand || '',
      sort: params.sort || current.sort || 'newest',
      newArrival: params.newArrival || '',
      maxPrice: params.maxPrice || '',
      discounted: params.discounted || '',
      sale: params.sale || ''
    }));
  }, []);

  const generateTryOn = useCallback(async (product) => {
    if (!user) {
      onRequireAuth?.('Log in with your mobile number to try this product on.');
      return;
    }
    if (!product?.id || tryOnLoading[product.id]) return;
    const profileMessage = tryOnProfileBlockMessage(user);
    if (profileMessage) {
      setTryOnErrors((current) => ({ ...current, [product.id]: profileMessage }));
      return;
    }
    const existing = tryOns[product.id];
    setTryOnLoading((current) => ({ ...current, [product.id]: true }));
    setTryOnErrors((current) => ({ ...current, [product.id]: '' }));
    try {
      const data = await api(`/tryons/${product.id}`, {
        method: 'POST',
        body: existing?.imageUrl ? JSON.stringify({ force: true }) : undefined,
        timeoutMs: aiTryOnRequestTimeoutMs,
        jobTimeoutMs: aiTryOnJobTimeoutMs
      });
      let nextTryOn = data.tryOn || null;
      if (!nextTryOn?.imageUrl) nextTryOn = await fetchProductTryOn(product.id, { waitForImage: true });
      requireGeneratedImage(nextTryOn);
      if (nextTryOn) setTryOns((current) => ({ ...current, [product.id]: nextTryOn }));
      if (data.user) setUser(data.user);
    } catch (error) {
      if (isAuthExpiredError(error)) {
        await onAuthExpired?.();
        setTryOnErrors((current) => ({ ...current, [product.id]: '' }));
        return;
      }
      setTryOnErrors((current) => ({ ...current, [product.id]: aiFeatureErrorMessage(error, 'Could not generate this AI try-on. Try again in a moment.') }));
    } finally {
      setTryOnLoading((current) => ({ ...current, [product.id]: false }));
    }
  }, [user, tryOnLoading, tryOns, onRequireAuth, onAuthExpired]);

  const generateTryOnVideo = useCallback(async (product) => {
    if (!user) {
      onRequireAuth?.('Log in with your mobile number to create a video try-on.');
      return;
    }
    if (!product?.id || tryOnVideoLoading[product.id] || tryOnLoading[product.id]) return;
    const profileMessage = tryOnProfileBlockMessage(user);
    if (profileMessage) {
      setTryOnVideoErrors((current) => ({ ...current, [product.id]: profileMessage }));
      return;
    }
    setTryOnVideoLoading((current) => ({ ...current, [product.id]: true }));
    setTryOnVideoErrors((current) => ({ ...current, [product.id]: '' }));
    setTryOnErrors((current) => ({ ...current, [product.id]: '' }));
    try {
      let existing = tryOns[product.id];
      if (!existing?.imageUrl) {
        const imageData = await api(`/tryons/${product.id}`, {
          method: 'POST',
          timeoutMs: aiTryOnRequestTimeoutMs,
          jobTimeoutMs: aiTryOnJobTimeoutMs
        });
        existing = imageData.tryOn || null;
        if (!existing?.imageUrl) existing = await fetchProductTryOn(product.id, { waitForImage: true });
        if (existing) setTryOns((current) => ({ ...current, [product.id]: existing }));
        if (imageData.user) setUser(imageData.user);
      }
      if (!existing?.imageUrl) throw new Error('Could not generate the image try-on needed for video.');
      const data = await api(`/tryons/${product.id}/video`, {
        method: 'POST',
        body: existing.videoUrl ? JSON.stringify({ force: true }) : undefined,
        timeoutMs: aiTryOnRequestTimeoutMs,
        jobTimeoutMs: aiTryOnJobTimeoutMs
      });
      if (!data.tryOn?.videoUrl) throw new Error('Your AI video is not ready yet. Please try again in a moment.');
      setTryOns((current) => ({ ...current, [product.id]: data.tryOn }));
      if (data.user) setUser(data.user);
    } catch (error) {
      if (isAuthExpiredError(error)) {
        await onAuthExpired?.();
        setTryOnVideoErrors((current) => ({ ...current, [product.id]: '' }));
        return;
      }
      setTryOnVideoErrors((current) => ({ ...current, [product.id]: aiFeatureErrorMessage(error, 'Could not generate this video try-on. Try again in a moment.') }));
    } finally {
      setTryOnVideoLoading((current) => ({ ...current, [product.id]: false }));
    }
  }, [user, tryOnLoading, tryOnVideoLoading, tryOns, onRequireAuth, onAuthExpired]);

  if (showStorefront) {
    return (
      <CategoryLandingScreen
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        onNavigate={onNavigate}
        onBack={onBack}
        user={user}
        initialScrollY={initialScrollY}
        onScrollPositionChange={onScrollPositionChange}
      />
    );
  }

  return (
    <View style={styles.shopScreen}>
      <ShopTopBar onNavigate={onNavigate} user={user} onBack={onBack} />
      <FlatList
        key={layout.productColumns}
        ref={shopScrollRef}
        data={state.products}
        numColumns={layout.productColumns}
        keyExtractor={(product) => product.id}
        renderItem={({ item: product }) => (
          <ProductCard
            variant="homeFrame"
            product={product}
            tryOn={tryOns[product.id]}
            loading={Boolean(tryOnLoading[product.id])}
            videoLoading={Boolean(tryOnVideoLoading[product.id])}
            error={tryOnErrors[product.id]}
            videoError={tryOnVideoErrors[product.id]}
            onPress={() => onNavigate('product', { id: product.id })}
            onAddToWishlist={onAddToWishlist}
            isWishlisted={wishlistIds?.has(product.id)}
            onTryOn={() => generateTryOn(product)}
            onTryOnVideo={() => generateTryOnVideo(product)}
          />
        )}
        columnWrapperStyle={styles.shopProductGridRow}
        contentContainerStyle={styles.shopProductListContent}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={40}
        windowSize={5}
        onEndReached={state.loadMore}
        onEndReachedThreshold={0.65}
        onScroll={(event) => {
          onScrollPositionChange?.(event.nativeEvent.contentOffset.y);
        }}
        {...screenScrollProps}
        scrollEventThrottle={32}
        ListHeaderComponent={<View style={styles.shopProductListHeader}>
      <View style={styles.searchPanel}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={19} color="#66748a" />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={searchPlaceholder}
            placeholderTextColor="#68768c"
            returnKeyType="search"
            onSubmitEditing={runSearch}
            style={styles.searchInput}
          />
          <TouchableOpacity style={styles.searchButton} onPress={runSearch}>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.filterRail}>
          <FilterDropdown label="Category" selected={filters.category} options={[['', 'All'], ...categories.map(([label, , value]) => [value, label])]} onSelect={(category) => {
            setFilters((current) => ({ ...current, category }));
          }} />
          <FilterDropdown label="Gender" selected={filters.gender} options={[['', 'All genders'], ...genders.map((gender) => [gender, titleCase(gender)])]} onSelect={(gender) => {
            setFilters((current) => ({ ...current, gender }));
          }} />
          <FilterDropdown label="Sort" selected={filters.sort} options={sortOptions} onSelect={(sort) => {
            setFilters((current) => ({ ...current, sort }));
          }} />
        </View>
      </View>

      <View style={styles.resultsHead}>
        <View>
          <Text style={styles.screenTitle}>{titleCase(resultTitle)}</Text>
          <Text style={styles.muted}>{state.loading ? 'Searching...' : `${state.total} products`}</Text>
        </View>
      </View>
      {missionPreset ? (
        <View style={styles.missionSuggestionPanel}>
          <Text style={styles.missionSuggestionKicker}>Suggested For {missionPreset.title}</Text>
          <Text style={styles.missionSuggestionText}>{missionPreset.subtitle}</Text>
          <View style={styles.missionSuggestionChips}>
            {missionPreset.chips.map((chip) => {
              const active = String(filters.q || '') === String(chip.params.q || '');
              return (
                <TouchableOpacity
                  key={chip.label}
                  activeOpacity={0.82}
                  style={[styles.missionSuggestionChip, active && styles.missionSuggestionChipActive]}
                  onPress={() => selectMissionChip(chip.params)}
                >
                  <Text style={[styles.missionSuggestionChipText, active && styles.missionSuggestionChipTextActive]}>{chip.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
      {state.loading ? <ProductGridSkeleton /> : null}
      {!state.loading ? <StatusPanel error={state.error} empty={!state.products.length} text="Try a different search or browse another category." /> : null}
        </View>}
        ListFooterComponent={state.loadingMore ? <ActivityIndicator style={styles.shopProductLoadingMore} color="#252221" /> : state.loadMoreError || state.error ? (
          <TouchableOpacity accessibilityRole="button" style={styles.shopProductRetry} onPress={state.retryLoadMore}>
            <Text style={styles.shopProductRetryText}>{state.loadMoreError || state.error} Tap to retry.</Text>
          </TouchableOpacity>
        ) : null}
      />
    </View>
  );
}

function ProductScreen({ id, user, setUser, token, onNavigate, onBack, onRequireAuth, onAuthExpired, onAddToWishlist, wishlistIds }) {
  const { width } = useWindowDimensions();
  const layout = useResponsiveLayout();
  const [state, setState] = useState({ product: null, loading: true, error: '' });
  const [tryOn, setTryOn] = useState(null);
  const [tryOnLoaded, setTryOnLoaded] = useState(false);
  const [tryOnLoading, setTryOnLoading] = useState(false);
  const [tryOnVideoLoading, setTryOnVideoLoading] = useState(false);
  const [tryOnError, setTryOnError] = useState('');
  const [tryOnVideoError, setTryOnVideoError] = useState('');
  const [tryOnPreviewFailed, setTryOnPreviewFailed] = useState(false);
  const [tryOnPreviewRetry, setTryOnPreviewRetry] = useState(0);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const productScrollRef = useRef(null);
  const mediaScrollRef = useRef(null);
  const detailContentWidth = layout.contentWidth || width;
  const mediaWidth = Math.max(1, Math.round(layout.isTablet ? Math.min(520, detailContentWidth - 28) : detailContentWidth - 28));
  const categoryPresentation = useMemo(() => productCategoryPresentation(state.product || {}), [state.product]);
  const related = useProducts({ category: categoryPresentation.category, limit: 5, enabled: categoryPresentation.reliable }, token);
  const relatedProducts = related.products.filter((item) => item.id !== id).slice(0, 4);
  const [relatedTryOns] = useTryOns(user, relatedProducts, token);

  useEffect(() => {
    let alive = true;
    setState({ product: null, loading: true, error: '' });
    api(`/products/${encodeURIComponent(id)}`)
      .then((data) => alive && setState({ product: data.product ? normalizeProduct(data.product) : null, loading: false, error: '' }))
      .catch((error) => alive && setState({ product: null, loading: false, error: error.message }));
    return () => {
      alive = false;
    };
  }, [id, token]);

  useEffect(() => {
    setTitleExpanded(false);
  }, [id]);

  useEffect(() => {
    setTryOnPreviewFailed(false);
    setTryOnPreviewRetry(0);
  }, [id, tryOn?.imageUrl, tryOn?.updatedAt]);

  useEffect(() => {
    if (!user || !id) {
      setTryOn(null);
      setTryOnLoaded(true);
      return undefined;
    }
    let alive = true;
    setTryOn(null);
    setTryOnLoaded(false);
    fetchProductTryOn(id)
      .then((data) => { if (alive) { setTryOn(data || null); setTryOnLoaded(true); } })
      .catch(() => { if (alive) { setTryOn(null); setTryOnLoaded(true); } });
    return () => {
      alive = false;
    };
  }, [id, user?.id, user?.bodyPhotoUrl, token]);

  useEffect(() => {
    if (!tryOn?.imageUrl && !tryOn?.videoUrl) return undefined;
    const timer = setTimeout(() => {
      mediaScrollRef.current?.scrollTo?.({ x: 0, animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [tryOn?.id, tryOn?.imageUrl, tryOn?.videoUrl, tryOn?.updatedAt, tryOn?.videoGeneratedAt, mediaWidth]);

  const scrollToTryOnPreview = useCallback(() => {
    productScrollRef.current?.scrollTo?.({ y: 0, animated: true });
    mediaScrollRef.current?.scrollTo?.({ x: 0, animated: true });
  }, []);

  const generate = async () => {
    if (!user) {
      onRequireAuth?.('Log in with your mobile number to generate AI try-ons.');
      return;
    }
    if (tryOnLoading || !state.product?.id) return;
    const profileMessage = tryOnProfileBlockMessage(user);
    if (profileMessage) {
      setTryOnError(profileMessage);
      return;
    }
    scrollToTryOnPreview();
    setTryOnLoading(true);
    setTryOnError('');
    try {
      const regenerate = Boolean(tryOn?.imageUrl);
      const data = await api(`/tryons/${state.product.id}`, {
        method: 'POST',
        body: regenerate ? JSON.stringify({ force: true }) : undefined,
        timeoutMs: aiTryOnRequestTimeoutMs,
        jobTimeoutMs: aiTryOnJobTimeoutMs
      });
      let nextTryOn = data.tryOn || null;
      if (!nextTryOn?.imageUrl) nextTryOn = await fetchProductTryOn(state.product.id, { waitForImage: true });
      requireGeneratedImage(nextTryOn);
      if (nextTryOn) setTryOn(nextTryOn);
      if (regenerate && data.reused) setTryOnError('Your previous AI look was returned. A new look was not confirmed.');
      if (data.user) setUser(data.user);
    } catch (error) {
      if (isAuthExpiredError(error)) {
        await onAuthExpired?.();
        setTryOnError('');
        return;
      }
      setTryOnError(aiFeatureErrorMessage(error, 'Could not generate this AI try-on. Try again in a moment.'));
    } finally {
      setTryOnLoading(false);
    }
  };

  const handleTryOnAction = () => {
    if (tryOn?.imageUrl && tryOnPreviewFailed) {
      setTryOnPreviewFailed(false);
      setTryOnPreviewRetry((current) => current + 1);
      scrollToTryOnPreview();
      return;
    }
    if (savedLegacyProduct) return;
    generate();
  };

  const generateVideo = async () => {
    if (!user) {
      onRequireAuth?.('Log in with your mobile number to create a video try-on.');
      return;
    }
    if (tryOnLoading || tryOnVideoLoading || !state.product?.id) return;
    const profileMessage = tryOnProfileBlockMessage(user);
    if (profileMessage) {
      setTryOnVideoError(profileMessage);
      return;
    }
    scrollToTryOnPreview();
    setTryOnVideoLoading(true);
    setTryOnVideoError('');
    setTryOnError('');
    try {
      let currentTryOn = tryOn;
      if (!currentTryOn?.imageUrl) {
        const imageData = await api(`/tryons/${state.product.id}`, {
          method: 'POST',
          timeoutMs: aiTryOnRequestTimeoutMs,
          jobTimeoutMs: aiTryOnJobTimeoutMs
        });
        currentTryOn = imageData.tryOn || null;
        if (!currentTryOn?.imageUrl) currentTryOn = await fetchProductTryOn(state.product.id, { waitForImage: true });
        if (currentTryOn) setTryOn(currentTryOn);
        if (imageData.user) setUser(imageData.user);
      }
      if (!currentTryOn?.imageUrl) throw new Error('Could not generate the image try-on needed for video.');
      const regenerate = Boolean(currentTryOn?.videoUrl);
      const data = await api(`/tryons/${state.product.id}/video`, {
        method: 'POST',
        body: regenerate ? JSON.stringify({ force: true }) : undefined,
        timeoutMs: aiTryOnRequestTimeoutMs,
        jobTimeoutMs: aiTryOnJobTimeoutMs
      });
      if (!data.tryOn?.videoUrl) throw new Error('Your AI video is not ready yet. Please try again in a moment.');
      setTryOn(data.tryOn);
      if (regenerate && data.reused) setTryOnVideoError('Your previous video was returned. A new video was not confirmed.');
      if (data.user) setUser(data.user);
    } catch (error) {
      if (isAuthExpiredError(error)) {
        await onAuthExpired?.();
        setTryOnVideoError('');
        return;
      }
      setTryOnVideoError(aiFeatureErrorMessage(error, 'Could not generate this video try-on. Try again in a moment.'));
    } finally {
      setTryOnVideoLoading(false);
    }
  };

  const savedLegacyProduct = Boolean(state.product && isMarketplaceProduct(state.product));
  const legacyLookUnavailable = savedLegacyProduct && tryOnLoaded && !tryOn?.imageUrl;
  if (state.loading || state.error || !state.product || (savedLegacyProduct && !tryOnLoaded) || legacyLookUnavailable) {
    return (
      <View style={styles.productDetailScreen}>
        <ProductTopBar onNavigate={onNavigate} user={user} onBack={onBack} />
        <ScrollView contentContainerStyle={styles.scrollContent} {...screenScrollProps}>
          <StatusPanel loading={state.loading || (savedLegacyProduct && !tryOnLoaded)} error={state.error} empty={!state.loading && (!state.product || legacyLookUnavailable)} text="This item may have been removed from the catalog." />
        </ScrollView>
      </View>
    );
  }

  const product = state.product;
  const productTitle = product.title || product.name;
  const productBrand = verifiedProductBrand(product);
  const collapsibleTitle = productTitle.length > 105;
  const isWishlisted = wishlistIds?.has(product.id);
  const originalUri = imageUrl(product.imageUrl);
  const tryOnUri = tryOnImageUrl(tryOn);
  const tryOnVideoUri = tryOnVideoUrl(tryOn);
  const mediaItems = [
    tryOnVideoUri ? { key: 'video', label: tryOnDisplayLabel(tryOn, tryOnVideoUri), type: 'video', uri: tryOnVideoUri } : null,
    tryOnUri ? { key: 'tryon', label: tryOnDisplayLabel(tryOn), source: { uri: tryOnUri }, uri: tryOnUri } : null,
    { key: 'original', label: 'Original Product', source: originalUri ? { uri: originalUri } : null, uri: originalUri, product }
  ].filter(Boolean);
  const productRating = verifiedProductRating(product);
  const mediaHeight = layout.isTablet
    ? Math.min(690, Math.max(480, Math.round(mediaWidth * 1.3)))
    : Math.min(425, Math.max(300, Math.round(mediaWidth * 1.04)));
  const productColors = (product.colors || [])
    .map((color) => String(color?.name || color || '').trim())
    .filter((color) => color && color.length <= 32 && !/[₹$€£]|\b(?:get it|delivery|discount|offer)\b/i.test(color))
    .slice(0, 5);
  const productSizes = (product.sizes || []).map((size) => String(size || '').trim()).filter(Boolean).slice(0, 8);
  const openShop = () => {
    if (!user) {
      onRequireAuth?.('Log in with your mobile number to checkout.');
      return;
    }
    onNavigate('checkout', { productId: product.id });
  };
  const openCategory = () => onNavigate('shop', categoryPresentation.reliable ? { category: categoryPresentation.category } : {});

  return (
    <View style={styles.productDetailScreen}>
      <ProductTopBar onNavigate={onNavigate} user={user} onBack={onBack} showSearch={false} />
      <ScrollView ref={productScrollRef} contentContainerStyle={styles.productDetailContent} {...screenScrollProps}>
      <View style={[styles.productHeroMedia, layout.isTablet && styles.productHeroMediaTablet, { height: mediaHeight, width: mediaWidth }]}>
        <ScrollView ref={mediaScrollRef} {...horizontalScrollProps} pagingEnabled contentContainerStyle={styles.productMediaTrack}>
          {mediaItems.map((item, index) => (
            <Pressable key={item.key} style={[styles.productMediaSlide, { width: mediaWidth }]} onPress={() => item.type !== 'video' && item.uri && setLightbox(item.uri)}>
              {item.type === 'video' ? (
                <TryOnVideoPlayer uri={item.uri} style={styles.productHeroVideo} nativeControls />
              ) : item.key === 'original' ? (
                <ProductImage product={product} style={styles.productHeroImage} resizeMode="contain" alt={productTitle} />
              ) : item.key === 'tryon' ? (
                <ProductImage key={`${tryOn?.id || 'tryon'}:${tryOnPreviewRetry}`} product={product} tryOn={tryOn} verifyPrivateTryOn onLoadSuccess={() => setTryOnPreviewFailed(false)} onLoadFailure={() => setTryOnPreviewFailed(true)} style={styles.productHeroImage} resizeMode="contain" alt="Your AI try-on" />
              ) : (
                <ProductImage product={item.product} style={styles.productHeroImage} resizeMode="contain" alt={product.title} />
              )}
              <Text style={styles.productMediaBadge}>{item.label}</Text>
              {mediaItems.length > 1 ? <Text style={styles.productMediaCount}>{index + 1}/{mediaItems.length}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isWishlisted ? 'Remove product from wishlist' : 'Add product to wishlist'}
          activeOpacity={0.84}
          style={[styles.productFavoriteButton, isWishlisted && styles.productFavoriteButtonSaved]}
          onPress={() => onAddToWishlist?.(product)}
        >
          <Ionicons name={isWishlisted ? 'heart' : 'heart-outline'} size={24} color={isWishlisted ? '#ffffff' : '#5d5754'} />
        </TouchableOpacity>
        {mediaItems.length > 1 ? (
          <View style={styles.productSwipeHint}>
            <Ionicons name="swap-horizontal-outline" size={14} color="#111111" />
            <Text style={styles.productSwipeText}>Slide to compare</Text>
          </View>
        ) : null}
        {tryOnLoading || tryOnVideoLoading ? <TryOnLoading text={tryOnVideoLoading ? 'Generating video' : 'Generating try-on'} large /> : null}
      </View>

      <View style={styles.productSummary}>
        {savedLegacyProduct ? <Text style={styles.productBrandLabel}>SAVED TRY-ON</Text> : productBrand ? <Text style={styles.productBrandLabel}>{productBrand}</Text> : null}
        <Text
          accessibilityLabel={productTitle}
          numberOfLines={collapsibleTitle && !titleExpanded ? 2 : undefined}
          ellipsizeMode="tail"
          style={styles.productNameText}
        >
          {productTitle}
        </Text>
        {collapsibleTitle ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={titleExpanded ? 'Show less of product title' : 'Read full product title'}
            activeOpacity={0.72}
            style={styles.productTitleDisclosure}
            onPress={() => setTitleExpanded((current) => !current)}
          >
            <Text style={styles.productTitleDisclosureText}>{titleExpanded ? 'Show less' : 'Read more'}</Text>
            <Ionicons name={titleExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#625a55" />
          </TouchableOpacity>
        ) : null}
        {!savedLegacyProduct ? <View style={styles.productValueRow}>
          <Text style={styles.productDetailPrice}>{Number.isFinite(Number(product.price)) ? formatMoney(Number(product.price), product.currency) : 'Price unavailable'}</Text>
          {productRating ? (
            <View style={styles.productRatingLine}>
              <Ionicons name="star" size={13} color="#8c665d" />
              <Text style={styles.productRatingText}>{productRating.rating.toFixed(1)} ({productRating.ratingCount})</Text>
            </View>
          ) : null}
        </View> : null}
        {!savedLegacyProduct ? <View style={styles.productMetadataRow}>
          <TouchableOpacity style={styles.productMetadataItem} activeOpacity={0.76} onPress={openCategory}>
            <Text style={styles.productCategoryMetaLabel}>PRODUCT TYPE</Text>
            <Text style={styles.productCategoryMetaValue}>{categoryPresentation.label}</Text>
          </TouchableOpacity>
          {product.gender ? (
            <View style={styles.productMetadataItem}>
              <Text style={styles.productCategoryMetaLabel}>FOR</Text>
              <Text style={styles.productCategoryMetaValue}>{titleCase(product.gender)}</Text>
            </View>
          ) : null}
        </View> : null}

        {!savedLegacyProduct || tryOnPreviewFailed ? <View style={styles.productActionRow}>
          <TouchableOpacity style={[styles.productPrimaryAction, tryOnLoading && styles.disabledButton]} activeOpacity={0.86} disabled={tryOnLoading} onPress={handleTryOnAction} accessibilityHint="Creates a look by sending your profile and product photos to AI providers.">
            <Ionicons name="sparkles-outline" size={17} color="#ffffff" />
            <Text style={styles.productPrimaryActionText}>{tryOnLoading ? 'Creating your try-on…' : tryOnPreviewFailed ? 'Retry Preview — no credits' : tryOn?.imageUrl ? 'Try It On Again' : 'Try It On'}</Text>
            {!tryOnLoading ? <Ionicons name="arrow-forward" size={17} color="#ffffff" /> : null}
          </TouchableOpacity>
          {!savedLegacyProduct ? <View style={styles.productSecondaryActionRow}>
            {Number.isFinite(Number(product.price)) && Number(product.price) > 0 ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Checkout this product" style={styles.productSecondaryAction} activeOpacity={0.8} onPress={openShop}>
                <Text style={styles.productSecondaryActionText}>Checkout</Text>
                <Ionicons name="arrow-forward" size={15} color="#211f1d" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[styles.productVideoAction, (tryOnLoading || tryOnVideoLoading) && styles.disabledButton]} activeOpacity={0.8} disabled={tryOnLoading || tryOnVideoLoading} onPress={generateVideo}>
              <Ionicons name="play-circle-outline" size={17} color="#514b47" />
              <Text style={styles.productVideoActionText}>{tryOnVideoLoading ? 'Creating…' : tryOn?.videoUrl ? 'New Video' : 'Video Try-On'}</Text>
            </TouchableOpacity>
          </View> : null}
          {!savedLegacyProduct && !(Number.isFinite(Number(product.price)) && Number(product.price) > 0) ? <Text style={styles.productCommerceUnavailable}>Checkout is unavailable for this item.</Text> : null}
          {!savedLegacyProduct ? <Text style={styles.productTryOnDisclosure}>
            Try-On shares your profile and product photos with AI providers.{' '}
            <Text accessibilityRole="link" style={styles.aiPhotoDisclosureLink} onPress={() => openLegalPolicy('privacy')}>Privacy Policy</Text>
          </Text> : null}
        </View> : null}
        {tryOn?.imageUrl || tryOn?.videoUrl ? <AiPreviewNote content={reportContentReference(tryOn, 'product_tryon')} /> : null}
        {tryOnError ? <Text style={styles.errorText}>{tryOnError}</Text> : null}
        {tryOnVideoError ? <Text style={styles.errorText}>{tryOnVideoError}</Text> : null}
      </View>

      {!savedLegacyProduct ? <View style={styles.productStorySection}>
        <Text style={styles.productStoryTitle}>Product Description</Text>
        <Text style={styles.productStoryText}>
          {product.description || 'No additional product description is available yet.'}
        </Text>
        {productColors.length || productSizes.length || product.sizeNotes ? (
          <View style={styles.productFacts}>
            {productColors.length ? (
              <View style={styles.productFactRow}>
                <Text style={styles.productFactLabel}>Colors</Text>
                <Text style={styles.productFactValue}>{productColors.join(', ')}</Text>
              </View>
            ) : null}
            {productSizes.length ? (
              <View style={styles.productFactRow}>
                <Text style={styles.productFactLabel}>Sizes</Text>
                <Text style={styles.productFactValue}>{productSizes.join(', ')}</Text>
              </View>
            ) : null}
            {product.sizeNotes ? (
              <View style={styles.productFactRow}>
                <Text style={styles.productFactLabel}>Fit & sizing</Text>
                <Text style={styles.productFactValue}>{product.sizeNotes}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View> : null}

      {!savedLegacyProduct ? <View style={styles.completeLookSection}>
        <View style={styles.completeLookHead}>
          <Text style={styles.completeLookTitle}>Complete the Look</Text>
          <TouchableOpacity onPress={openCategory}>
            <Text style={styles.completeLookAll}>SHOP ALL</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.completeLookGrid}>
          {relatedProducts.length ? relatedProducts.slice(0, 2).map((item) => {
            return (
              <CompleteLookCard
                key={item.id}
                product={item}
                onPress={() => onNavigate('product', { id: item.id })}
                onAddToWishlist={onAddToWishlist}
                isWishlisted={wishlistIds?.has(item.id)}
              />
            );
          }) : <StatusPanel empty text={categoryPresentation.reliable ? 'No related products found yet.' : 'Related products are unavailable while this item’s category is reviewed.'} />}
        </View>
      </View> : null}
      </ScrollView>
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </View>
  );
}

const phoneAuthPerks = [
  { label: 'Try-on', icon: 'sparkles-outline' },
  { label: 'Wishlist', icon: 'heart-outline' },
  { label: 'Wardrobe', icon: 'shirt-outline' }
];

function AuthPasswordField({ value, onChangeText, placeholder, visible, onToggle, fieldHeight, autoComplete = 'password', textContentType = 'password' }) {
  const { width, fontScale } = useWindowDimensions();
  const compactAccessibleInput = width < 340 && fontScale > 1;
  const inputRef = useRef(null);
  return (
    <View style={[styles.loginInputWrap, { minHeight: fieldHeight }, compactAccessibleInput && { paddingHorizontal: 12, gap: 8 }]}>
      <Ionicons name="lock-closed-outline" size={23} color="#555a5d" />
      <TextInput
        ref={inputRef}
        accessibilityLabel={placeholder}
        style={styles.loginInput}
        defaultValue={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6f7687"
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={textContentType}
        returnKeyType="done"
        contextMenuHidden
        selectTextOnFocus={false}
      />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} hitSlop={4} style={styles.passwordVisibilityButton} activeOpacity={0.72} onPress={onToggle}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={21} color="#5d5754" />
      </TouchableOpacity>
    </View>
  );
}

function AuthScreen({ mode, setUser, setToken, onNavigate, onAuthenticated, onBack, onExit, registerBackHandler }) {
  const isSignup = mode === 'signup';
  const leaveScreen = onExit || (() => onNavigate('home'));
  const returnToPreviousScreen = onBack || leaveScreen;
  const { width, height } = useWindowDimensions();
  const tablet = width >= 900;
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpSession, setOtpSession] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const phoneInputRef = useRef(null);
  const authRequestRef = useRef(false);
  const phoneDraftRef = useRef('');
  const passwordDraftRef = useRef('');
  const confirmPasswordDraftRef = useRef('');
  const [signupStage, setSignupStage] = useState('otp');
  const [signupToken, setSignupToken] = useState('');
  const [resetStage, setResetStage] = useState('idle');
  const [resetToken, setResetToken] = useState('');
  const [detailName, setDetailName] = useState('');
  const [detailGender, setDetailGender] = useState('');
  const [detailPhoto, setDetailPhoto] = useState(null);
  const authScreenPadding = clamp(width * 0.064, 20, 30);
  const titleSize = clamp(width * 0.082, 31, 38);
  const fieldHeight = clamp(height * 0.052, 54, 60);
  const authEditorialHeight = tablet ? clamp(height * 0.34, 240, 360) : clamp(height * 0.17, 118, 158);
  const completingSignup = isSignup && signupStage === 'details';
  const resetOtpStage = !isSignup && resetStage === 'otp';
  const resetPasswordStage = !isSignup && resetStage === 'password';
  const baseLoginStage = !isSignup && resetStage === 'idle';
  const currentPhoneValue = () => authPhoneValue(phoneDraftRef.current || phone);
  const currentPassword = () => passwordDraftRef.current || password;
  const currentConfirmPassword = () => confirmPasswordDraftRef.current || confirmPassword;
  const clearPasswordDrafts = () => {
    passwordDraftRef.current = '';
    confirmPasswordDraftRef.current = '';
    setPassword('');
    setConfirmPassword('');
  };

  useEffect(() => {
    setOtp('');
    setOtpSent(false);
    setOtpSession('');
    setPhone('');
    phoneDraftRef.current = '';
    clearPasswordDrafts();
    setShowPassword(false);
    setShowConfirmPassword(false);
    setMessage('');
    setSignupStage('otp');
    setSignupToken('');
    setDetailName('');
    setDetailGender('');
    setDetailPhoto(null);
    setResetStage('idle');
    setResetToken('');
  }, [mode]);

  const finishAuthenticated = async (data) => {
    await saveToken(data.token);
    setToken(data.token);
    setUser(data.user);
    if (onAuthenticated) onAuthenticated();
    else onNavigate('home');
  };

  const sendSignupOtp = async () => {
    if (authRequestRef.current) return;
    const phoneValue = currentPhoneValue();
    if (phoneValue.length !== 10) {
      setMessage('Enter a valid 10 digit mobile number.');
      return;
    }
    authRequestRef.current = true;
    setLoading(true);
    setMessage('Sending OTP...');
    try {
      const data = await api('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: phoneValue, purpose: 'signup' })
      });
      setOtp('');
      setOtpSession(data.otpSession || '');
      setOtpSent(true);
      setMessage(data.message ? `${data.message}. Enter the code from SMS.` : 'OTP sent. Enter the code from SMS.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      authRequestRef.current = false;
      setLoading(false);
    }
  };

  const verifySignupOtp = async () => {
    if (authRequestRef.current) return;
    const phoneValue = currentPhoneValue();
    const cleanOtp = normalizeOtpInput(otp);
    if (phoneValue.length !== 10 || !/^\d{6}$/.test(cleanOtp)) {
      setMessage('Enter your mobile number and the 6-digit OTP.');
      return;
    }
    authRequestRef.current = true;
    setLoading(true);
    setMessage('Verifying OTP...');
    try {
      const data = await api('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone: phoneValue, otp: cleanOtp, otpSession, purpose: 'signup' })
      });
      setSignupToken(data.signupToken || '');
      clearPasswordDrafts();
      setSignupStage('details');
      setMessage('');
    } catch (error) {
      setMessage(error.message);
    } finally {
      authRequestRef.current = false;
      setLoading(false);
    }
  };

  const loginWithPassword = async () => {
    if (authRequestRef.current) return;
    const phoneValue = currentPhoneValue();
    const passwordValue = currentPassword();
    if (phoneValue.length !== 10) {
      setMessage('Enter a valid 10 digit mobile number.');
      return;
    }
    if (!passwordValue) {
      setMessage('Enter your password.');
      return;
    }
    authRequestRef.current = true;
    setLoading(true);
    setMessage('Logging in...');
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone: phoneValue, password: passwordValue })
      });
      await finishAuthenticated(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      authRequestRef.current = false;
      setLoading(false);
    }
  };

  const startPasswordReset = async () => {
    if (authRequestRef.current) return;
    const phoneValue = currentPhoneValue();
    if (phoneValue.length !== 10) {
      setMessage('Enter your mobile number first.');
      return;
    }
    authRequestRef.current = true;
    setLoading(true);
    setMessage('Sending reset OTP...');
    try {
      const data = await api('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: phoneValue, purpose: 'password-reset' })
      });
      setOtp('');
      setOtpSession(data.otpSession || '');
      setOtpSent(true);
      setResetStage('otp');
      setMessage(data.message ? `${data.message}. Enter the code from SMS.` : 'OTP sent. Enter the code from SMS.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      authRequestRef.current = false;
      setLoading(false);
    }
  };

  const verifyPasswordResetOtp = async () => {
    if (authRequestRef.current) return;
    const phoneValue = currentPhoneValue();
    const cleanOtp = normalizeOtpInput(otp);
    if (phoneValue.length !== 10 || !/^\d{6}$/.test(cleanOtp)) {
      setMessage('Enter your mobile number and the 6-digit OTP.');
      return;
    }
    authRequestRef.current = true;
    setLoading(true);
    setMessage('Verifying OTP...');
    try {
      const data = await api('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone: phoneValue, otp: cleanOtp, otpSession, purpose: 'password-reset' })
      });
      setResetToken(data.resetToken || '');
      setResetStage('password');
      setOtp('');
      setOtpSent(false);
      clearPasswordDrafts();
      setMessage('');
    } catch (error) {
      setMessage(error.message);
    } finally {
      authRequestRef.current = false;
      setLoading(false);
    }
  };

  const completePasswordReset = async () => {
    if (authRequestRef.current) return;
    const passwordValue = currentPassword();
    const confirmPasswordValue = currentConfirmPassword();
    const passwordError = passwordValidationMessage(passwordValue);
    if (passwordError) {
      setMessage(passwordError);
      return;
    }
    if (passwordValue !== confirmPasswordValue) {
      setMessage('Passwords do not match.');
      return;
    }
    if (!resetToken) {
      setMessage('Verify the OTP before setting a new password.');
      setResetStage('otp');
      return;
    }
    authRequestRef.current = true;
    setLoading(true);
    setMessage('Saving password...');
    try {
      const data = await api('/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ resetToken, password: passwordValue, confirmPassword: confirmPasswordValue }),
        timeoutMs: 60000
      });
      await finishAuthenticated(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      authRequestRef.current = false;
      setLoading(false);
    }
  };

  const cancelPendingOtp = async (purpose) => {
    if (!otpSession) return;
    const path = purpose === 'password-reset' ? '/auth/password-reset/cancel-otp' : '/auth/signup/cancel-otp';
    try {
      await api(path, {
        method: 'POST',
        body: JSON.stringify({ phone: currentPhoneValue(), otpSession })
      });
    } catch {
      // OTP challenges expire quickly; cancellation must not trap the user on this screen.
    }
    setOtpSession('');
  };

  const changeSignupMobile = async () => {
    await cancelPendingOtp('signup');
    setOtpSent(false);
    setOtp('');
    setSignupToken('');
    setMessage('');
  };

  const returnToLogin = async () => {
    await cancelPendingOtp('password-reset');
    setResetStage('idle');
    setResetToken('');
    setOtp('');
    setOtpSent(false);
    clearPasswordDrafts();
    setMessage('');
  };

  const exitSignupDetails = async () => {
    await cancelPendingOtp('signup');
    await clearToken();
    setSignupToken('');
    setSignupStage('otp');
    clearPasswordDrafts();
    setMessage('');
    leaveScreen();
  };

  const leaveAuth = async (routeName) => {
    if (isSignup && otpSent) await cancelPendingOtp('signup');
    if (!isSignup && resetStage !== 'idle') await cancelPendingOtp('password-reset');
    if (routeName === 'home') leaveScreen();
    else onNavigate(routeName);
  };

  useEffect(() => {
    if (!registerBackHandler) return undefined;
    registerBackHandler(async () => {
      if (completingSignup) {
        await exitSignupDetails();
        return;
      }
      if (isSignup && otpSent) await cancelPendingOtp('signup');
      if (!isSignup && resetStage !== 'idle') await cancelPendingOtp('password-reset');
      returnToPreviousScreen();
    });
    return () => registerBackHandler(null);
  });

  const pickDetailPhoto = async () => {
    try {
      const asset = await pickImage();
      if (asset?.uri) setDetailPhoto(asset);
    } catch {
      setMessage('Could not open your photos. Please try again.');
    }
  };

  const completeSignupDetails = async () => {
    if (authRequestRef.current) return;
    const passwordValue = currentPassword();
    const confirmPasswordValue = currentConfirmPassword();
    const cleanName = detailName.trim().replace(/\s+/g, ' ');
    if (cleanName.length < 2) {
      setMessage('Enter your full name.');
      return;
    }
    if (!detailGender) {
      setMessage('Choose your gender preference.');
      return;
    }
    if (!detailPhoto?.uri) {
      setMessage('Upload a profile photo.');
      return;
    }
    const passwordError = passwordValidationMessage(passwordValue);
    if (passwordError) {
      setMessage(passwordError);
      return;
    }
    if (passwordValue !== confirmPasswordValue) {
      setMessage('Passwords do not match.');
      return;
    }

    authRequestRef.current = true;
    setLoading(true);
    setMessage('Saving your profile...');
    try {
      const form = new FormData();
      form.append('signupToken', signupToken);
      form.append('name', cleanName);
      form.append('genderPreference', detailGender);
      form.append('password', passwordValue);
      form.append('confirmPassword', confirmPasswordValue);
      form.append('requireBodyPhoto', 'true');
      form.append('profilePhotoMode', 'ai-full-body');
      form.append('bodyPhoto', filePart(detailPhoto, 'body-photo.jpg'));
      const data = await api('/auth/signup/complete', { method: 'POST', body: form, timeoutMs: 60000 });
      const nextUser = data.user;
      if (nextUser) {
        try {
          await AsyncStorage.setItem(onboardingPendingStorageKey, onboardingSeenStorageKey(nextUser));
        } catch {
          // Onboarding is optional; profile completion should keep moving.
        }
      }
      await finishAuthenticated(data);
      setSignupToken('');
      setSignupStage('otp');
      setMessage('');
    } catch (error) {
      if (error.status === 401 || (error.status === 400 && /verify your phone number first/i.test(error.message))) {
        setSignupToken('');
        setOtpSession('');
        setOtpSent(false);
        setOtp('');
        clearPasswordDrafts();
        setSignupStage('otp');
        setMessage('Mobile verification expired. Request a new OTP to continue your profile setup.');
      } else {
        setMessage(isMissingRouteError(error.message) ? 'Profile setup is not active on the running backend. Restart the backend, then try again.' : error.message);
      }
    } finally {
      authRequestRef.current = false;
      setLoading(false);
    }
  };

  const submit = isSignup
    ? (otpSent ? verifySignupOtp : sendSignupOtp)
    : resetOtpStage
      ? verifyPasswordResetOtp
      : resetPasswordStage
        ? completePasswordReset
        : loginWithPassword;
  const actionLabel = isSignup
    ? (otpSent ? 'Verify & Continue' : 'Continue')
    : resetOtpStage
      ? 'Verify OTP'
      : resetPasswordStage
        ? 'Save Password'
        : 'Login';
  const authTitle = isSignup
    ? 'Create Account'
    : resetOtpStage
      ? 'Reset Password'
      : resetPasswordStage
        ? 'Set New Password'
        : 'Welcome Back';
  const authSubtitle = isSignup
    ? 'Verify your mobile number once, then set a password for future logins.'
    : resetOtpStage
      ? 'Enter the OTP sent to your mobile number.'
      : resetPasswordStage
        ? 'Choose a password you will use with your mobile number.'
        : 'Log in with your mobile number and password.';
  const authIcon = isSignup ? 'phone-portrait-outline' : resetStage === 'idle' ? 'lock-closed-outline' : 'keypad-outline';

  if (completingSignup) {
    const genderOptions = [
      ['male', 'Male', 'man-outline'],
      ['female', 'Female', 'woman-outline'],
      ['other', 'Other', 'accessibility-outline']
    ];

    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.loginScreen}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.phoneAuthContent, tablet && styles.phoneAuthContentTablet, { paddingHorizontal: authScreenPadding, paddingTop: clamp(height * 0.06, 46, 72) }]}
          {...screenScrollProps}
        >
          <View style={[styles.signupDetailsCard, tablet && styles.signupDetailsCardTablet, styles.surfaceCard]}>
            <SurfaceBackdrop />
            <View style={styles.phoneAuthIcon}>
              <Ionicons name="scan-outline" size={24} color="#625c56" />
            </View>
            <Text style={styles.signupDetailsEyebrow}>YOUR FITTING PROFILE</Text>
            <Text style={styles.signupDetailsTitle}>Let's create your fitting profile.</Text>
            <Text style={styles.phoneAuthSubtitle}>Add your details and a clear full-body photo to get started with virtual try-on.</Text>

            <View style={styles.signupDetailsFieldStack}>
              <View style={[styles.loginInputWrap, { minHeight: fieldHeight }]}>
                <Ionicons name="person-outline" size={23} color="#555a5d" />
                <TextInput
                  style={styles.loginInput}
                  value={detailName}
                  onChangeText={setDetailName}
                  placeholder="Full name"
                  placeholderTextColor="#6f7687"
                  autoCapitalize="words"
                  autoComplete="name"
                />
              </View>

              <View>
                <Text style={styles.signupDetailsLabel}>Gender preference</Text>
                <View style={styles.signupDetailsGenderRow}>
                  {genderOptions.map(([value, label, icon]) => {
                    const active = detailGender === value;
                    return (
                      <TouchableOpacity key={value} style={[styles.signupDetailsGenderButton, active && styles.signupDetailsGenderButtonActive]} activeOpacity={0.84} onPress={() => setDetailGender(value)}>
                        <Ionicons name={icon} size={18} color={active ? '#ffffff' : '#5d5754'} />
                        <Text style={[styles.signupDetailsGenderText, active && styles.signupDetailsGenderTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <AuthPasswordField
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                fieldHeight={fieldHeight}
                autoComplete="new-password"
              />

              <AuthPasswordField
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm"
                visible={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((value) => !value)}
                fieldHeight={fieldHeight}
                autoComplete="new-password"
              />

              <TouchableOpacity style={styles.signupDetailsUploadBox} activeOpacity={0.84} onPress={pickDetailPhoto}>
                {detailPhoto?.uri ? (
                  <>
                    <Image source={{ uri: detailPhoto.uri }} style={styles.signupDetailsUploadImage} resizeMode="contain" />
                    <View style={styles.signupDetailsUploadOverlay}>
                      <Ionicons name="camera-outline" size={18} color="#ffffff" />
                      <Text style={styles.signupDetailsUploadOverlayText}>Change photo</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.signupDetailsUploadCopy}>
                    <View style={styles.signupDetailsUploadIcon}>
                      <Ionicons name="camera-outline" size={25} color="#625c56" />
                    </View>
                    <Text style={styles.signupDetailsUploadTitle}>Add a full-body photo</Text>
                    <Text style={styles.signupDetailsUploadText}>Use a clear, front-facing photo with your head, outfit, and feet visible.</Text>
                    <Text style={styles.signupDetailsUploadMeta}>Required for virtual try-on</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity accessibilityRole="button" accessibilityLabel={loading ? 'Please wait' : actionLabel} accessibilityState={{ disabled: loading, busy: loading }} style={[styles.loginSubmit, loading && styles.signupSubmitDisabled]} activeOpacity={0.88} disabled={loading} onPress={completeSignupDetails}>
              {loading ? <ActivityIndicator size="small" color="#ffffff" /> : null}
              <Text style={styles.loginSubmitText}>{loading ? 'Creating your profile' : 'Create My Profile'}</Text>
              {!loading ? <Ionicons name="arrow-forward" size={22} color="#ffffff" /> : null}
            </TouchableOpacity>

            <Text style={styles.signupDetailsLegalText}>
              By signing up, you agree to Lookmefy's{' '}
              <Text accessibilityRole="link" style={styles.signupDetailsLegalLink} onPress={() => openLegalPolicy('terms')}>Terms & Conditions</Text>
              {' '}and{' '}
              <Text accessibilityRole="link" style={styles.signupDetailsLegalLink} onPress={() => openLegalPolicy('privacy')}>Privacy Policy</Text>
              .
            </Text>

            {message ? <Text style={[styles.formMessage, styles.signupMessage, /saving/i.test(message) ? styles.phoneAuthMessage : styles.errorText]}>{message}</Text> : null}
          </View>
          <TouchableOpacity accessibilityRole="button" style={styles.phoneAuthBrowseButton} activeOpacity={0.75} onPress={exitSignupDetails}>
            <Text style={styles.phoneAuthBrowseText}>Continue browsing products</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.loginScreen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.phoneAuthContent, tablet && styles.phoneAuthContentTablet, { paddingHorizontal: authScreenPadding, paddingTop: tablet ? 30 : clamp(height * 0.065, 46, 70) }]}
        {...screenScrollProps}
      >
        <View style={[styles.phoneAuthLayout, tablet && styles.phoneAuthLayoutTablet]}>
        <View style={[styles.phoneAuthFormColumn, tablet && styles.phoneAuthFormColumnTablet]}>
        <View style={[styles.phoneAuthCard, tablet && styles.phoneAuthCardTablet]}>
          <View style={styles.phoneAuthIcon}>
            <Ionicons name={authIcon} size={26} color="#9b5658" />
          </View>
          <Text style={[styles.loginTitle, { fontSize: titleSize, lineHeight: titleSize * 1.18 }]}>
            {authTitle}
          </Text>
          <Text style={styles.phoneAuthSubtitle}>{authSubtitle}</Text>

          <View style={styles.phoneAuthFieldStack}>
            <View style={[styles.loginInputWrap, { minHeight: fieldHeight }]}>
              <Ionicons name="call-outline" size={23} color="#555a5d" />
              <TextInput
                ref={phoneInputRef}
                accessibilityLabel="Mobile number"
                style={styles.loginInput}
                value={phone}
                onChangeText={(value) => {
                  phoneDraftRef.current = value;
                  setPhone(value);
                }}
                placeholder="Mobile number"
                placeholderTextColor="#6f7687"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={16}
                editable={!loading && !resetPasswordStage}
                returnKeyType="next"
                selectTextOnFocus={false}
              />
            </View>

            {baseLoginStage ? (
              <AuthPasswordField
                value={password}
                onChangeText={(value) => {
                  passwordDraftRef.current = value;
                }}
                placeholder="Password"
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                fieldHeight={fieldHeight}
                autoComplete="current-password"
                textContentType="password"
              />
            ) : null}

            {(isSignup && otpSent) || resetOtpStage ? (
              <View style={styles.phoneAuthOtpBlock}>
                <View style={[styles.loginInputWrap, { minHeight: fieldHeight }]}>
                  <Ionicons name="keypad-outline" size={23} color="#555a5d" />
                  <TextInput
                    style={styles.loginInput}
                    value={otp}
                    onChangeText={(value) => setOtp(normalizeOtpInput(value))}
                    placeholder="Enter OTP"
                    placeholderTextColor="#6f7687"
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    maxLength={8}
                  />
                </View>
              </View>
            ) : null}

            {resetPasswordStage ? (
              <>
                <AuthPasswordField
                  value={password}
                  onChangeText={(value) => {
                    passwordDraftRef.current = value;
                  }}
                  placeholder="New password"
                  visible={showPassword}
                  onToggle={() => setShowPassword((value) => !value)}
                  fieldHeight={fieldHeight}
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
                <AuthPasswordField
                  value={confirmPassword}
                  onChangeText={(value) => {
                    confirmPasswordDraftRef.current = value;
                  }}
                  placeholder="Confirm new password"
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((value) => !value)}
                  fieldHeight={fieldHeight}
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
              </>
            ) : null}
          </View>

          <TouchableOpacity accessibilityRole="button" accessibilityLabel={loading ? 'Please wait' : actionLabel} accessibilityState={{ disabled: loading, busy: loading }} style={[styles.loginSubmit, loading && styles.signupSubmitDisabled]} activeOpacity={0.88} disabled={loading} onPress={submit}>
            {loading ? <ActivityIndicator size="small" color="#ffffff" /> : null}
            <Text style={styles.loginSubmitText}>{loading ? 'Please wait' : actionLabel}</Text>
            {!loading ? <Ionicons name="arrow-forward" size={22} color="#ffffff" /> : null}
          </TouchableOpacity>

          {isSignup && otpSent ? (
            <TouchableOpacity style={styles.phoneAuthTextButton} activeOpacity={0.75} onPress={changeSignupMobile}>
              <Ionicons name="call-outline" size={17} color="#2b2321" />
              <Text style={styles.phoneAuthTextButtonLabel}>Change mobile number</Text>
            </TouchableOpacity>
          ) : null}

          {baseLoginStage ? (
            <TouchableOpacity style={styles.phoneAuthTextButton} activeOpacity={0.75} onPress={startPasswordReset}>
              <Ionicons name="refresh-outline" size={17} color="#2b2321" />
              <Text style={styles.phoneAuthTextButtonLabel}>Set or reset password</Text>
            </TouchableOpacity>
          ) : null}

          {!isSignup && resetStage !== 'idle' ? (
            <TouchableOpacity style={styles.phoneAuthTextButton} activeOpacity={0.75} onPress={returnToLogin}>
              <Ionicons name="arrow-back" size={17} color="#2b2321" />
              <Text style={styles.phoneAuthTextButtonLabel}>Back to login</Text>
            </TouchableOpacity>
          ) : null}

          {message ? <Text style={[styles.formMessage, styles.signupMessage, /sent|Verifying|Sending|Preparing|Logging|Saving/i.test(message) ? styles.phoneAuthMessage : styles.errorText]}>{message}</Text> : null}

          <View style={styles.authModeSwitch}>
            <Text style={styles.authModeSwitchText}>{isSignup ? 'Already have an account?' : 'New to Lookmefy?'}</Text>
            <TouchableOpacity activeOpacity={0.75} onPress={() => leaveAuth(isSignup ? 'login' : 'signup')}>
              <Text style={styles.authModeSwitchLink}>{isSignup ? 'Log in' : 'Create account'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        </View>

        <View style={[styles.phoneAuthStoryColumn, tablet && styles.phoneAuthStoryColumnTablet]}>
        <View style={[styles.phoneAuthEditorial, tablet && styles.phoneAuthEditorialTablet]}>
          <View style={[styles.phoneAuthEditorialImageFrame, { height: authEditorialHeight }]}>
            <Image source={images.homeSliderAtelier} style={styles.phoneAuthEditorialImage} resizeMode="cover" />
            <View style={styles.phoneAuthEditorialShade} />
            <View style={styles.phoneAuthEditorialBadge}>
              <Ionicons name="sparkles-outline" size={15} color="#111111" />
              <Text style={styles.phoneAuthEditorialBadgeText}>Styled profile</Text>
            </View>
          </View>
          <Text style={styles.phoneAuthEditorialTitle}>Save looks, generate try-ons, and keep your wardrobe in one place.</Text>
          <View style={styles.phoneAuthPerkRow}>
            {phoneAuthPerks.map((item) => (
              <View key={item.label} style={styles.phoneAuthPerk}>
                <Ionicons name={item.icon} size={15} color="#2b2321" />
                <Text style={styles.phoneAuthPerkText}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity accessibilityRole="button" style={styles.phoneAuthBrowseButton} activeOpacity={0.75} onPress={() => leaveAuth('home')}>
          <Text style={styles.phoneAuthBrowseText}>Continue browsing products</Text>
        </TouchableOpacity>
        </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const authEntryFeatures = [
  { icon: 'scan-outline', title: 'AI Try-On', text: 'See clothing on you' },
  { icon: 'shirt-outline', title: 'Digital Wardrobe', text: 'Keep your pieces together' },
  { icon: 'sparkles-outline', title: 'AI Stylist', text: 'Find ideas that feel like you' }
];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function AuthEntryScreen({ onNavigate }) {
  const { width, height, fontScale = 1 } = useWindowDimensions();
  const compact = height < 720 || width < 360;
  const screenPadding = clamp(width * 0.052, 16, 24);
  const heroHeight = clamp((height * 0.42) + (Math.max(0, fontScale - 1) * 100), 330, 420);
  const titleSize = clamp(width * 0.088, 28, 34);

  return (
    <ScrollView
      style={styles.authEntryScroll}
      contentContainerStyle={[
        styles.authEntryContent,
        { paddingBottom: compact ? 18 : 24 }
      ]}
      showsVerticalScrollIndicator={false}
      {...screenScrollProps}
    >
      <View style={[styles.authEntryHero, { height: heroHeight }]}>
        <Image source={images.homeAtelierHero} style={styles.authEntryBackground} resizeMode="cover" />
        <View style={styles.authEntryImageWash} />
        <View style={styles.authEntryHeroTop}>
          <BrandLogo
            light
            style={styles.authEntryLogoMark}
            symbolStyle={styles.authEntryLogoSymbol}
            dividerStyle={styles.authEntryLogoDivider}
            textStyle={styles.authEntryLogoText}
          />
          <TouchableOpacity accessibilityRole="button" style={styles.authEntrySignInTop} activeOpacity={0.78} onPress={() => onNavigate('login')}>
            <Text style={styles.authEntrySignInTopText}>Sign in</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.authEntryHeroCaption}>
          <Text style={styles.authEntryEyebrow}>YOUR PERSONAL STYLE STUDIO</Text>
          <Text style={[styles.authEntryHeroTitle, { fontSize: titleSize, lineHeight: titleSize * 1.12 }]}>See it. Try it.{"\n"}Love it.</Text>
          <Text style={styles.authEntryHeroText}>Discover how outfits look on you before you buy.</Text>
        </View>
      </View>

      <View style={[styles.authEntryMain, { paddingHorizontal: screenPadding }, compact && styles.authEntryMainCompact]}>
        <View style={styles.authEntryIntro}>
          <Text style={styles.authEntryIntroTitle}>Style, made personal.</Text>
          <Text style={styles.authEntryIntroText}>Everything you need to try, organize, and discover your style.</Text>
        </View>

        <View style={styles.authEntryFeatureList}>
          {authEntryFeatures.map((feature) => (
            <View key={feature.title} style={styles.authEntryFeature}>
              <View style={styles.authEntryFeatureIcon}>
                <Ionicons name={feature.icon} size={20} color="#211f1d" />
              </View>
              <View style={styles.authEntryFeatureCopy}>
                <Text style={styles.authEntryFeatureTitle}>{feature.title}</Text>
                <Text style={styles.authEntryFeatureText}>{feature.text}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity accessibilityRole="button" style={styles.authEntryCta} activeOpacity={0.88} onPress={() => onNavigate('signup')}>
          <Text style={styles.authEntryCtaText}>Create your profile</Text>
          <Ionicons name="arrow-forward" size={19} color="#ffffff" />
        </TouchableOpacity>

        <TouchableOpacity accessibilityRole="button" style={styles.authEntryExplore} activeOpacity={0.75} onPress={() => onNavigate('home')}>
          <Text style={styles.authEntryExploreText}>Explore Lookmefy first</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const closetCategories = ['tops', 'bottoms', 'dresses', 'suits', 'full-outfit', 'outerwear', 'shoes', 'accessories', 'activewear', 'ethnic', 'other'];
const closetCategoryLabel = (category) => category === 'full-outfit' ? 'Full Outfit' : titleCase(category || '');
const closetViews = ['stylist', 'combo', 'add', 'wardrobe', 'looks'];
const closetOccasions = ['today casual', 'office meeting', 'date night', 'party', 'wedding function', 'college day', 'travel', 'rainy weather'];
const closetSceneOptions = {
  backdrop: ['neutral studio', 'office lobby', 'cafe', 'outdoor street', 'wedding venue'],
  pose: ['front facing', 'relaxed standing', 'walking pose', 'three-quarter angle'],
  lighting: ['natural light', 'studio softbox', 'evening warm', 'bright daylight']
};
const closetComboSlots = [
  { key: 'topwear', label: 'Topwear', helper: 'Shirts, tops, kurtas', short: 'To', categories: ['tops', 'dresses', 'suits', 'full-outfit', 'outerwear', 'activewear', 'ethnic'] },
  { key: 'bottomwear', label: 'Bottomwear', helper: 'Pants, denim, skirts', short: 'Bo', categories: ['bottoms'] },
  { key: 'goggles', label: 'Goggles', helper: 'Glasses and shades', short: 'Go', categories: ['accessories'], keywords: ['goggle', 'goggles', 'glass', 'glasses', 'sunglass', 'eyewear'] },
  { key: 'watch', label: 'Watch', helper: 'Watches and wristwear', short: 'Wa', categories: ['accessories'], keywords: ['watch', 'watches', 'wristwatch', 'wristwear'] },
  { key: 'cap', label: 'Cap', helper: 'Caps and hats', short: 'Ca', categories: ['accessories'], keywords: ['cap', 'hat'] },
  { key: 'footwear', label: 'Footwear', helper: 'Shoes, boots, sandals', short: 'Fo', categories: ['shoes'] }
];
const wardrobeCategoryTabs = [
  { key: 'tops', label: 'Tops', icon: 'shirt-outline', slot: 'topwear', side: 'left' },
  { key: 'bottoms', label: 'Bottoms', icon: 'pants', slot: 'bottomwear', side: 'left' },
  { key: 'outerwear', label: 'Outerwear', icon: 'body-outline', slot: 'topwear', side: 'left' },
  { key: 'shoes', label: 'Footwear', icon: 'shoe', slot: 'footwear', side: 'left' },
  { key: 'accessories', label: 'Accessories', icon: 'sparkles-outline', slot: 'goggles', side: 'right', filter: 'accessories' },
  { key: 'full-outfit', label: 'Full Outfit', icon: 'layers-outline', slot: 'topwear', side: 'right', filter: 'all' },
  { key: 'watches', label: 'Watches', icon: 'watch-outline', slot: 'watch', side: 'right', filter: 'accessories' },
  { key: 'bags-hats', label: 'Bags & Hats', icon: 'bag-handle-outline', slot: 'cap', side: 'right', filter: 'accessories' }
];
function wardrobeStoredCategoryForTab(tabKey) {
  if (tabKey === 'watches' || tabKey === 'bags-hats') return 'accessories';
  return tabKey;
}

function wardrobeTabKeyForItem(item = {}) {
  if (!item.category) return '';
  if (item.category === 'accessories') {
    if (wardrobeTabMatchesItem(wardrobeCategoryTabs.find((tab) => tab.key === 'watches'), item)) return 'watches';
    if (wardrobeTabMatchesItem(wardrobeCategoryTabs.find((tab) => tab.key === 'bags-hats'), item)) return 'bags-hats';
    return 'accessories';
  }
  if (['dresses', 'suits', 'full-outfit'].includes(item.category)) return 'full-outfit';
  if (['ethnic', 'activewear'].includes(item.category)) {
    return wardrobeTabMatchesItem(wardrobeCategoryTabs.find((tab) => tab.key === 'full-outfit'), item) ? 'full-outfit' : 'tops';
  }
  return wardrobeCategoryTabs.some((tab) => tab.key === item.category) ? item.category : '';
}

function wardrobeTypeFromItemDetails(fields = {}) {
  const categoryType = wardrobeTabKeyForItem(fields);
  if (categoryType) return categoryType;
  const name = String(fields.name || '').toLowerCase();
  if (/\b(dress(?:es)?|gowns?|frocks?|jumpsuits?|rompers?)\b/.test(name)) return 'full-outfit';
  if (/\b(watches?|wristwatches?)\b/.test(name)) return 'watches';
  if (/\b(bags?|handbags?|purses?|caps?|hats?)\b/.test(name)) return 'bags-hats';
  if (/\b(shoes?|sneakers?|boots?|heels?|sandals?|slippers?)\b/.test(name)) return 'shoes';
  if (/\b(pants?|trousers?|jeans?|skirts?|leggings?|shorts?)\b/.test(name)) return 'bottoms';
  if (/\b(jackets?|coats?|cardigans?|shrugs?)\b/.test(name)) return 'outerwear';
  if (/\b(shirts?|t-?shirts?|tees?|tops?|blouses?|kurtis?|hoodies?|sweaters?)\b/.test(name)) return 'tops';
  return '';
}

function wardrobeTypeTag(tabKey) {
  if (tabKey === 'watches' || tabKey === 'bags-hats') return `wardrobe:${tabKey}`;
  return '';
}
const wardrobeFallbackRecommendations = [
  { title: 'Urban Sophisticate', images: ['trending-2.jpg', 'category-3.jpg', 'category-6.jpg'] },
  { title: 'Neutral Casual', images: ['arrival-1.jpg', 'arrival-2.jpg', 'category-8.jpg'] },
  { title: 'Soft Gallery Fit', images: ['arrival-4.jpg', 'category-4.jpg', 'category-6.jpg'] }
];
const wardrobeFreshLookTitles = ['Fresh Closet Pair', 'New Daily Combo', 'Smart Wardrobe Mix', 'Easy Outfit Idea', 'Balanced Style Set'];

function rotateWardrobePick(entries = [], seed = 0, offset = 0) {
  if (!entries.length) return null;
  return entries[Math.abs(seed + offset) % entries.length];
}

function uniqueWardrobeItems(entries = []) {
  const seen = new Set();
  return entries.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function buildLocalWardrobeSuggestions(entries = [], occasion = 'today casual', seed = Date.now()) {
  const wardrobeItems = entries.filter((item) => item?.id);
  if (!wardrobeItems.length) return [];

  const tops = wardrobeItems.filter((item) => ['tops', 'outerwear', 'activewear', 'ethnic'].includes(item.category));
  const statementPieces = wardrobeItems.filter((item) => ['dresses', 'suits', 'full-outfit'].includes(item.category));
  const bottoms = wardrobeItems.filter((item) => item.category === 'bottoms');
  const shoes = wardrobeItems.filter((item) => item.category === 'shoes');
  const accessories = wardrobeItems.filter((item) => item.category === 'accessories');
  const fallbackPool = wardrobeItems.filter((item) => !['accessories'].includes(item.category));
  const suggestions = [];

  for (let index = 0; index < 3; index += 1) {
    const baseSeed = seed + index * 7;
    const statement = rotateWardrobePick(statementPieces, baseSeed, 1);
    const top = rotateWardrobePick(tops, baseSeed, 2);
    const bottom = rotateWardrobePick(bottoms, baseSeed, 3);
    const shoe = rotateWardrobePick(shoes, baseSeed, 4);
    const accessory = rotateWardrobePick(accessories, baseSeed, 5);
    const fallback = rotateWardrobePick(fallbackPool, baseSeed, 6);
    const outfitItems = uniqueWardrobeItems(statement
      ? [statement, rotateWardrobePick(tops, baseSeed, 8), shoe, accessory, fallback]
      : [top, bottom, rotateWardrobePick(statementPieces, baseSeed, 9), shoe, accessory, fallback]
    ).slice(0, 4);
    if (!outfitItems.length) continue;
    const itemNames = outfitItems.slice(0, 2).map((item) => item.name).filter(Boolean).join(' + ');
    suggestions.push({
      key: `local-look-${seed}-${index}`,
      title: wardrobeFreshLookTitles[(seed + index) % wardrobeFreshLookTitles.length],
      reason: itemNames
        ? `${titleCase(occasion)} idea using ${itemNames}.`
        : `${titleCase(occasion)} idea from your wardrobe.`,
      itemIds: outfitItems.map((item) => item.id),
      items: outfitItems,
      source: 'local'
    });
  }

  return suggestions;
}

function mergeWardrobeSuggestions(primary = [], secondary = []) {
  const seen = new Set();
  return [...primary, ...secondary].filter((suggestion) => {
    const key = (suggestion.itemIds || suggestion.items?.map((item) => item.id) || []).filter(Boolean).join(':') || suggestion.title || suggestion.key;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function WardrobeTopBar({ user, onNavigate }) {
  return (
    <AppHeader onNavigate={onNavigate} user={user} compact showSearch={false} />
  );
}

function WardrobeRecommendationCard({ suggestion, fallback, onPress }) {
  const suggestionItems = suggestion?.items || [];
  const title = suggestion?.title || fallback.title;
  const fallbackSources = fallback.images.map((image) => images[image] || images.hero);
  const thumbnails = suggestionItems.length
    ? suggestionItems.slice(0, 3).map((item, index) => ({
        key: item.id,
        source: item.imageUrl ? { uri: imageUrl(item.imageUrl) } : fallbackSources[index] || images.hero,
        fallbackSource: fallbackSources[index] || images.hero
      }))
    : fallbackSources.map((source, index) => ({ key: fallback.images[index], source, fallbackSource: images.hero }));

  return (
    <TouchableOpacity style={styles.wardrobeRecommendationCard} activeOpacity={0.86} onPress={onPress}>
      <View style={styles.wardrobeRecommendationImages}>
        {thumbnails.map((thumb) => (
          <ResilientImage
            key={thumb.key}
            source={thumb.source}
            fallbackSource={thumb.fallbackSource}
            style={styles.wardrobeRecommendationImage}
            resizeMode="cover"
            fallbackIcon="shirt-outline"
          />
        ))}
      </View>
      <View style={styles.wardrobeRecommendationFooter}>
        <Text style={styles.wardrobeRecommendationTitle} numberOfLines={1}>{title}</Text>
        <Ionicons name="chevron-forward" size={25} color="#111111" />
      </View>
    </TouchableOpacity>
  );
}

function slotMatchesItem(slot, item, strict = false) {
  if (!slot?.categories?.includes(item?.category)) return false;
  if (!slot.keywords?.length) return true;
  const text = [item.name, item.category, item.color, item.formality, ...(item.tags || []), ...(item.occasions || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const keywordMatch = slot.keywords.some((keyword) => text.includes(keyword));
  return strict ? keywordMatch : keywordMatch || slot.categories.includes(item.category);
}

function optionsForSlot(slot, items) {
  const exactOptions = items.filter((item) => slotMatchesItem(slot, item, true));
  return exactOptions.length ? exactOptions : items.filter((item) => slotMatchesItem(slot, item));
}

function wardrobeUploadCategory(tab) {
  if (tab?.key === 'full-outfit') return 'all';
  const category = tab?.filter || tab?.key || 'tops';
  return closetCategories.includes(category) ? category : 'accessories';
}

function wardrobeTabItemText(item = {}) {
  return [item.name, item.category, item.color, item.formality, ...(item.tags || []), ...(item.occasions || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function wardrobeTabMatchesItem(tab, item = {}) {
  if (!tab) return true;
  const category = wardrobeUploadCategory(tab);
  if (category !== 'all' && item.category !== category) return false;
  const text = wardrobeTabItemText(item);
  if (tab.key === 'full-outfit') return ['dresses', 'suits', 'full-outfit'].includes(item.category) || /\b(jumpsuits?|rompers?|gowns?|sarees?|saris?|lehengas?|sherwanis?|co[-\s]?ords?|matching sets?|kurta sets?|outfits?)\b/.test(text);
  const explicitAccessoryType = (Array.isArray(item.tags) ? item.tags : []).find((tag) => /^wardrobe:(watches|bags-hats)$/.test(String(tag || '').toLowerCase()))?.slice('wardrobe:'.length);
  if (tab.key === 'accessories' && explicitAccessoryType) return false;
  if (explicitAccessoryType && (tab.key === 'watches' || tab.key === 'bags-hats')) return explicitAccessoryType === tab.key;
  if (tab.key === 'watches') return /\b(watches?|wrist\s*watches?|wristwatch|wristwear)\b/.test(text);
  if (tab.key === 'bags-hats') return /\b(bags?|purses?|handbags?|caps?|hats?)\b/.test(text);
  return true;
}

function isSupportedWardrobeLookItem(item = {}) {
  const category = String(item.category || '').toLowerCase();
  if (['tops', 'bottoms', 'dresses', 'suits', 'full-outfit', 'outerwear', 'shoes', 'accessories', 'activewear', 'ethnic'].includes(category)) return true;
  return /\b(dress|gown|jumpsuit|romper|saree|sari|lehenga|sherwani|kurta set|co-ord|coord|one[-\s]?piece|shirt|top|pants|jeans|shoe|sneaker|watch|glasses|bag|hat)\b/i.test(wardrobeTabItemText(item));
}

function hasSupportedWardrobeLookItem(items = []) {
  return items.some(isSupportedWardrobeLookItem);
}

function selectedIdsFromComboSlots(slots = {}) {
  const ids = closetComboSlots.map((slot) => slots[slot.key]).filter(Boolean);
  return [...new Set(ids)];
}

function tryOnSelectionsFromWardrobe(slotItems = [], fallbackItems = []) {
  const used = new Set();
  const selections = slotItems
    .map((slot) => {
      const item = slot.selected || slot.options.find((option) => !used.has(option.id));
      if (!item?.id || used.has(item.id)) return null;
      used.add(item.id);
      return { slot: slot.key, label: slot.label, item };
    })
    .filter(Boolean);
  if (selections.length) return selections;
  return fallbackItems.slice(0, 5).map((item, index) => ({ slot: `fallback-${index}`, label: titleCase(item.category || 'Item'), item }));
}

function wardrobeTryOnSlotForItem(item = {}) {
  const category = String(item.category || '').toLowerCase();
  const text = [item.name, category, item.color, item.formality, ...(item.tags || []), ...(item.occasions || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (category === 'shoes') return 'footwear';
  if (category === 'bottoms') return 'bottomwear';
  if (category === 'outerwear') return 'outerwear';
  if (category === 'dresses' || category === 'suits' || category === 'full-outfit') return category;
  if (['tops', 'activewear', 'ethnic'].includes(category)) return 'topwear';
  if (category === 'accessories') {
    if (/\b(watches?|wrist\s*watches?|wristwear)\b/.test(text)) return 'watch';
    if (/\b(glasses?|goggles?|sunglasses?|eyewear|spectacles?)\b/.test(text)) return 'goggles';
    if (/\b(caps?|hats?|bags?|purses?|handbags?)\b/.test(text)) return 'cap';
    return 'accessories';
  }
  return category || 'selection';
}

function wardrobeItemSlotsFromItems(entries = []) {
  return entries.map((item, index) => ({
    itemId: item.id,
    slot: wardrobeTryOnSlotForItem(item),
    label: titleCase(item.category || `Item ${index + 1}`)
  }));
}

function wardrobeGarmentForTryOn(items, itemId, user) {
  const owner = String(user?.id || user?._id || '');
  if (!owner || !itemId) return null;
  const item = (items || []).find((entry) => String(entry.id) === String(itemId));
  if (!item?.imageUrl || item.deleted || item.deletedAt) return null;
  const itemOwner = item.userId || item.ownerId;
  if (itemOwner && String(itemOwner) !== owner) return null;
  return { uri: imageUrl(item.imageUrl), wardrobeItemId: item.id, ownerId: owner };
}

function ClosetDetectionCard({ detection, fields, compact = false }) {
  if (!detection) return null;
  const loading = detection.status === 'loading';
  const failed = detection.status === 'error';
  const ready = detection.status === 'ready';
  const title = loading ? 'Analyzing clothing photo' : failed ? 'Detection unavailable' : detection.source === 'vision' ? 'AI details detected' : 'Basic details detected';
  const detail = detection.message || (ready ? 'Review and edit before saving.' : 'Fill the fields manually.');

  return (
    <View style={[styles.itemDetectionCard, compact && styles.itemDetectionCardCompact, failed && styles.itemDetectionCardError]}>
      <View style={styles.itemDetectionHead}>
        <View style={[styles.itemDetectionIcon, failed && styles.itemDetectionIconError]}>
          {loading ? <ActivityIndicator size="small" color="#9b5658" /> : <Ionicons name={failed ? 'alert-circle-outline' : 'sparkles-outline'} size={18} color={failed ? '#b4232a' : '#9b5658'} />}
        </View>
        <View style={styles.itemDetectionCopy}>
          <Text style={styles.itemDetectionTitle}>{title}</Text>
          <Text style={styles.itemDetectionText}>{detail}</Text>
        </View>
      </View>
      {ready && fields?.length ? (
        <View style={styles.itemDetectionPills}>
          {fields.slice(0, 6).map(([label, value]) => (
            <View key={`${label}-${value}`} style={styles.itemDetectionPill}>
              <Text style={styles.itemDetectionPillText}>{label}: {value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ClosetScreen({ user, setUser, setToken, token, onNavigate, onBack, initial = {}, registerTourTarget, tourFocusRequest }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const [wardrobeMeasurements, setWardrobeMeasurements] = useState({ viewport: 0, header: 0, controls: 0 });
  const measureWardrobePart = useCallback((part, value) => {
    const rounded = Math.round(value);
    setWardrobeMeasurements((current) => current[part] === rounded ? current : { ...current, [part]: rounded });
  }, []);
  const addStudioScrollRef = useRef(null);
  const wardrobeScrollRef = useRef(null);
  const emptyCloset = { items: [], outfits: [], suggestions: [], stats: {} };
  const closet = useApiState('/closet', token, Boolean(user), emptyCloset);
  const initialItemCategory = closetCategories.includes(initial.category)
    ? initial.category
    : wardrobeCategoryTabs.some((tab) => tab.key === initial.type) ? wardrobeStoredCategoryForTab(initial.type) : '';
  const initialWardrobeType = wardrobeCategoryTabs.some((tab) => tab.key === initial.type)
    ? initial.type
    : wardrobeTabKeyForItem({ category: initialItemCategory });
  const [closetView, setClosetView] = useState(initial.view === 'add' ? 'add' : 'stylist');
  const [selectedIds, setSelectedIds] = useState([]);
  const [comboSlots, setComboSlots] = useState({});
  const [wardrobePreviewSelections, setWardrobePreviewSelections] = useState(() => initial.selectedCategoryKey && initial.selectedItemId
    ? { [initial.selectedCategoryKey]: initial.selectedItemId }
    : {});
  const [wardrobePickerTab, setWardrobePickerTab] = useState(null);
  const [activeSlot, setActiveSlot] = useState('topwear');
  const [filter, setFilter] = useState('all');
  const [activeWardrobeTabKey, setActiveWardrobeTabKey] = useState('');
  const [itemPhoto, setItemPhoto] = useState(null);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState(initialItemCategory);
  const [itemWardrobeType, setItemWardrobeType] = useState(initialWardrobeType);
  const itemTypeChosenManuallyRef = useRef(Boolean(initial.type));
  const [itemCategoryPickerOpen, setItemCategoryPickerOpen] = useState(false);
  const [itemColor, setItemColor] = useState('');
  const [itemFabric, setItemFabric] = useState('');
  const [itemPattern, setItemPattern] = useState('');
  const [itemSeason, setItemSeason] = useState('all-season');
  const [itemFormality, setItemFormality] = useState('any');
  const [itemOccasions, setItemOccasions] = useState('');
  const [itemTags, setItemTags] = useState('');
  const [itemDetection, setItemDetection] = useState(null);
  const [occasion, setOccasion] = useState('today casual');
  const [weather, setWeather] = useState('');
  const [mood, setMood] = useState('');
  const [plannedFor, setPlannedFor] = useState(dateInputValue());
  const [backdrop, setBackdrop] = useState('neutral studio');
  const [pose, setPose] = useState('front facing');
  const [lighting, setLighting] = useState('natural light');
  const [stylistText, setStylistText] = useState('');
  const [chat, setChat] = useState([
    { role: 'assistant', text: 'Ask what to wear today, for an occasion, or which pants fit a shirt from your closet.' }
  ]);
  const [suggestionOverrides, setSuggestionOverrides] = useState(null);
  const [savedClosetItems, setSavedClosetItems] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const [generatedWardrobeOutfit, setGeneratedWardrobeOutfit] = useState(null);
  const wardrobeUploadTourTarget = useTourTarget('wardrobe-upload', registerTourTarget, { request: tourFocusRequest, scrollRef: addStudioScrollRef, scrollOffset: 116 });

  useEffect(() => {
    if (initial.view === 'wardrobe') setClosetView('stylist');
    else if (closetViews.includes(initial.view)) setClosetView(initial.view);
    else setClosetView('stylist');
    if (!initial.view || initial.view === 'wardrobe') {
      setSelectedIds([]);
      setComboSlots({});
    }
    const validType = wardrobeCategoryTabs.some((tab) => tab.key === initial.type) ? initial.type : '';
    const validCategory = closetCategories.includes(initial.category) ? initial.category : '';
    if (validCategory) setFilter(validCategory);
    if (initial.view === 'add') {
      itemTypeChosenManuallyRef.current = Boolean(validType);
      setItemCategory(validCategory || (validType ? wardrobeStoredCategoryForTab(validType) : ''));
      setItemWardrobeType(validType || wardrobeTabKeyForItem({ category: validCategory }));
    }
    if (initial.type && wardrobeCategoryTabs.some((tab) => tab.key === initial.type)) {
      setActiveWardrobeTabKey(initial.type);
    } else if (initial.category) {
      setActiveWardrobeTabKey('');
    }
  }, [initial.category, initial.type, initial.view]);

  if (!user) return <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={onNavigate} />;

  const isAddStudio = initial.view === 'add' || closetView === 'add';

  const closetItems = closet.data.items || [];
  const savedClosetItemIds = new Set(savedClosetItems.map((item) => item.id).filter(Boolean));
  const items = [
    ...savedClosetItems,
    ...closetItems.filter((item) => !savedClosetItemIds.has(item.id))
  ];
  const outfits = closet.data.outfits || [];
  const suggestions = suggestionOverrides || closet.data.suggestions || [];
  const latestOutfit = outfits[0];
  const selectedItems = selectedIds.map((id) => items.find((item) => item.id === id)).filter(Boolean);
  const activeWardrobeTab = wardrobeCategoryTabs.find((tab) => tab.key === activeWardrobeTabKey) || null;
  const filteredItems = items.filter((item) => {
    if (filter !== 'all' && item.category !== filter) return false;
    return wardrobeTabMatchesItem(activeWardrobeTab, item);
  });
  const activeAddTab = wardrobeCategoryTabs.find((tab) => tab.key === itemWardrobeType);
  const addItemTypeLabel = activeAddTab?.label || 'Clothing';
  const activeAddSectionItems = activeAddTab ? items.filter((item) => wardrobeTabMatchesItem(activeAddTab, item)).slice(0, 8) : [];
  const selectedKey = selectedIds.slice().sort().join(':');
  const comboPreviewItems = (selectedItems.length ? selectedItems : items.filter((item) => ['tops', 'bottoms', 'suits', 'outerwear', 'shoes'].includes(item.category))).slice(0, 4);
  const mainPreview = generatedWardrobeOutfit?.imageUrl || user.bodyPhotoUrl || latestOutfit?.imageUrl || null;
  const lookbookCards = outfits.length
    ? outfits.slice(0, 5).map((outfit) => ({ id: outfit.id, title: outfit.title, imageUrl: outfit.imageUrl, items: outfit.items || [] }))
    : suggestions.slice(0, 5).map((suggestion, index) => ({ id: suggestion.key || `${suggestion.title}-${index}`, title: suggestion.title, items: suggestion.items || [] }));
  const slotItems = closetComboSlots.map((slot) => ({
    ...slot,
    selected: items.find((item) => item.id === comboSlots[slot.key]) || null,
    options: optionsForSlot(slot, items)
  }));
  const activeWardrobeSlot = slotItems.find((slot) => slot.key === activeSlot) || slotItems[0];
  const selectionCards = [
    {
      key: 'add',
      step: '01',
      title: 'Add Clothes',
      copy: 'Upload wardrobe photos and save category, color, fabric, season and occasion tags.',
      meta: `${closet.data.stats?.total || items.length} saved`,
      action: 'Open Add',
      icon: 'cloud-upload-outline',
      tone: '#0f5132',
      items: items.slice(0, 3)
    },
    {
      key: 'combo',
      step: '02',
      title: 'Build Combo',
      copy: 'Select which pant fits which shirt, add shoes or accessories, then generate it on you.',
      meta: selectedItems.length ? `${selectedItems.length} selected` : 'Shirt + pant picker',
      action: 'Choose Items',
      icon: 'shirt-outline',
      tone: '#7c4f2b',
      items: comboPreviewItems
    },
    {
      key: 'wardrobe',
      step: '03',
      title: 'Your Closet',
      copy: 'Browse saved clothes with filters and send selected pieces to the combo builder.',
      meta: `${closetCategories.length} filters`,
      action: 'View Wardrobe',
      icon: 'grid-outline',
      tone: '#5b4b7a',
      items: items.slice(0, 4)
    }
  ];
  const wardrobePreviewSource = mainPreview
    ? { uri: imageUrl(mainPreview) }
    : null;
  const wardrobeLeftCategoryTabs = wardrobeCategoryTabs.filter((tab) => tab.side !== 'right');
  const wardrobeRightCategoryTabs = wardrobeCategoryTabs.filter((tab) => tab.side === 'right');
  const wardrobePickerItems = wardrobePickerTab ? items.filter((item) => wardrobeTabMatchesItem(wardrobePickerTab, item)) : [];
  const wardrobeFilterLabel = activeWardrobeTab?.label || (filter === 'all' ? 'All Items' : titleCase(filter));
  const wardrobeFilterTitle = filter === 'all' && !activeWardrobeTab ? 'Your Closet' : `${wardrobeFilterLabel} Entries`;
  const comboSlotSelectedIds = selectedIdsFromComboSlots(comboSlots);
  const tryThisSelections = wardrobeCategoryTabs.map((tab) => {
    const item = items.find((entry) => entry.id === wardrobePreviewSelections[tab.key]);
    return item && wardrobeTabMatchesItem(tab, item) ? { tab, item } : null;
  }).filter(Boolean).filter((selection, index, selections) => selections.findIndex((entry) => entry.item.id === selection.item.id) === index);
  const tryThisLookIds = tryThisSelections.map(({ item }) => item.id);
  const tryThisItemSlots = tryThisSelections.map(({ tab, item }) => ({
    slot: wardrobeTryOnSlotForItem(item),
    label: tab.label,
    itemId: item.id
  }));
  const selectedWardrobeEntries = selectedIds.map((id) => items.find((item) => item.id === id)).filter(Boolean);
  const selectedWardrobeHasSupportedItem = hasSupportedWardrobeLookItem(selectedWardrobeEntries);
  const selectedWardrobeCanGenerate = selectedIds.length > 0 && selectedWardrobeHasSupportedItem;
  const selectedWardrobeGenerateHint = selectedIds.length && !selectedWardrobeHasSupportedItem
    ? 'Select a clothing, footwear, or accessory item before generating a look.'
    : '';
  const compactWardrobePreview = height < 640 || layout.windowWidth < 350;
  const wardrobeStudioImageHeight = Math.max(1, layout.windowWidth - 36) * 1.5;
  const wardrobeTabletSideWidth = 120;
  const wardrobeBasePreviewHeight = layout.isTablet
    ? clamp(Math.round(Math.min(height - 290, (layout.contentWidth - wardrobeTabletSideWidth * 2) / 0.67)), 600, 980)
    : compactWardrobePreview
      ? clamp(wardrobeStudioImageHeight, 390, 450)
      : clamp(Math.min((layout.windowWidth - 66) / 0.7, height - 390), 360, 560);
  const wardrobeBottomClearance = 66 + (Platform.OS === 'ios' ? Math.max(insets.bottom - 10, 10) : Math.max(insets.bottom, 10)) + 16;
  const wardrobePreviewHeight = !layout.isTablet && wardrobeMeasurements.viewport && wardrobeMeasurements.header && wardrobeMeasurements.controls
    ? Math.max(wardrobeBasePreviewHeight, wardrobeMeasurements.viewport - wardrobeMeasurements.header - wardrobeMeasurements.controls - 12 - wardrobeBottomClearance - (generatedWardrobeOutfit?.imageUrl ? 32 : 0))
    : wardrobeBasePreviewHeight;
  const wardrobePhonePhotoWidth = Math.min(layout.windowWidth - 36, Math.round(wardrobeBasePreviewHeight * 0.7));
  const wardrobeTabletPhotoWidth = layout.isTablet
    ? Math.max(280, Math.min(Math.round(wardrobePreviewHeight * 0.67), layout.contentWidth - wardrobeTabletSideWidth * 2, 700))
    : null;
  const recommendationSource = suggestions.slice(0, 3);
  const detectionSummaryFields = [
    ['Name', itemName],
    ['Type', activeAddTab?.label || ''],
    ['Color', itemColor]
  ].filter(([, value]) => String(value || '').trim());

  const toggleItem = (id) => {
    if (selectedIds.includes(id)) setComboSlots((slots) => Object.fromEntries(Object.entries(slots).filter(([, itemId]) => itemId !== id)));
    setSelectedIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id].slice(-5));
  };

  const selectedIdsFromSlots = selectedIdsFromComboSlots;

  const slotsFromItems = (entries = []) => {
    const next = {};
    closetComboSlots.forEach((slot) => {
      const item = entries.find((entry) => slotMatchesItem(slot, entry));
      if (item) next[slot.key] = item.id;
    });
    return next;
  };

  const applySuggestion = (suggestion) => {
    const suggestionItems = suggestion.items || (suggestion.itemIds || []).map((id) => items.find((item) => item.id === id)).filter(Boolean);
    setSelectedIds((suggestion.itemIds || suggestionItems.map((item) => item.id)).filter(Boolean));
    setComboSlots(slotsFromItems(suggestionItems));
    setOccasion(suggestion.title || 'today');
    setClosetView('combo');
    setMessage(suggestion.reason || 'Suggestion selected.');
  };

  const applyComboItems = (entries = []) => {
    const nextSlots = slotsFromItems(entries);
    setComboSlots(nextSlots);
    setSelectedIds(entries.map((item) => item.id).filter(Boolean).slice(0, 5));
    setClosetView('combo');
  };

  const setSlotItem = (slotKey, itemId) => {
    setComboSlots((current) => ({ ...current, [slotKey]: itemId }));
    setSelectedIds((current) => {
      const slot = closetComboSlots.find((entry) => entry.key === slotKey);
      const replaced = current.filter((id) => {
        const item = items.find((entry) => entry.id === id);
        return !slot || !item || !slotMatchesItem(slot, item);
      });
      return itemId ? [...replaced, itemId].slice(-5) : replaced;
    });
  };

  const chooseSlotItem = (slotKey, item) => {
    setComboSlots((current) => {
      const next = { ...current };
      if (!item) delete next[slotKey];
      else next[slotKey] = item.id;
      setSelectedIds(selectedIdsFromSlots(next).slice(0, 5));
      return next;
    });
  };

  const openWardrobeCategory = (tab) => {
    setWardrobePickerTab(tab);
  };

  const chooseWardrobePreviewItem = (item) => {
    if (!wardrobePickerTab) return;
    setWardrobePreviewSelections((current) => {
      const next = { ...current };
      if (next[wardrobePickerTab.key] === item.id) delete next[wardrobePickerTab.key];
      else next[wardrobePickerTab.key] = item.id;
      return next;
    });
    setGeneratedWardrobeOutfit(null);
    setWardrobePickerTab(null);
  };

  const switchClosetView = (nextView) => {
    if (nextView === 'stylist' || nextView === 'wardrobe') {
      setSelectedIds([]);
      setComboSlots({});
    }
    setClosetView(nextView === 'wardrobe' ? 'stylist' : nextView);
  };

  const tabletWardrobeEmpty = layout.isTablet && closetView === 'wardrobe' && !closet.loading && !closet.error && !items.length;

  const openSavedAddSectionItem = (item) => {
    const tab = wardrobeCategoryTabs.find((entry) => entry.key === wardrobeTabKeyForItem(item));
    if (tab) setWardrobePreviewSelections((current) => ({ ...current, [tab.key]: item.id }));
    setGeneratedWardrobeOutfit(null);
    setClosetView('stylist');
    onNavigate('closet', { view: 'stylist', selectedCategoryKey: tab?.key, selectedItemId: item.id });
  };

  const applyDetectedItemFields = (fields = {}) => {
    const nextCategory = closetCategories.includes(fields.category) && fields.category !== 'other' ? fields.category : '';
    if (fields.name) setItemName(fields.name);
    if (!itemTypeChosenManuallyRef.current) {
      const detectedType = wardrobeTypeFromItemDetails(fields);
      if (detectedType) {
        setItemCategory(nextCategory || wardrobeStoredCategoryForTab(detectedType));
        setItemWardrobeType(detectedType);
      }
    }
    if (fields.color) setItemColor(fields.color);
    if (fields.fabric) setItemFabric(fields.fabric);
    if (fields.pattern) setItemPattern(fields.pattern);
    if (fields.season) setItemSeason(fields.season);
    if (fields.formality) setItemFormality(fields.formality);
    if (Array.isArray(fields.occasions)) setItemOccasions(fields.occasions.join(', '));
    else if (fields.occasions) setItemOccasions(String(fields.occasions));
    if (Array.isArray(fields.tags)) setItemTags(fields.tags.join(', '));
    else if (fields.tags) setItemTags(String(fields.tags));
  };

  const pickClosetItemPhoto = async () => {
    const asset = await pickImage();
    if (!asset?.uri) return;
    setItemPhoto(asset);
    setItemDetection({ status: 'loading', message: 'Reading item details.' });
    setBusy('analyze-item');
    setMessage('Analyzing clothing photo...');
    try {
      const form = new FormData();
      form.append('item', filePart(asset, 'closet-item.jpg'));
      form.append('name', itemName);
      form.append('tags', itemTags);
      const data = await api('/closet/items/analyze', { method: 'POST', body: form, timeoutMs: 45000 });
      const detection = data.detection || {};
      const fields = data.details || detection.fields || {};
      const visualProfile = data.visualProfile || {};
      applyDetectedItemFields(fields);
      setItemDetection({
        status: 'ready',
        source: visualProfile.source || detection.source || 'basic',
        confidence: visualProfile.confidence ?? detection.confidence,
        message: detection.message || 'Review the item name, type, and color before saving.'
      });
      setMessage(detection.message || 'Item details added. Review the name, type, and color before saving.');
    } catch (error) {
      const missingRoute = isMissingRouteError(error.message);
      const detectionMessage = missingRoute
        ? 'Detection service is not active on the running backend. Restart the backend, then try again.'
        : 'AI detection is unavailable right now. You can still fill the details manually and save this item.';
      setItemDetection({
        status: 'error',
        message: detectionMessage
      });
      setMessage(detectionMessage);
    } finally {
      setBusy('');
    }
  };

  const swapSelected = (item) => {
    const replacement = items
      .filter((candidate) => candidate.id !== item.id && candidate.category === item.category && !selectedIds.includes(candidate.id))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))[0];
    if (!replacement) {
      setMessage(`No other ${item.category} item is available to swap.`);
      return;
    }
    setSelectedIds((current) => current.map((id) => (id === item.id ? replacement.id : id)));
    setComboSlots((current) => {
      const matchedSlot = closetComboSlots.find((slot) => slotMatchesItem(slot, item));
      if (!matchedSlot || current[matchedSlot.key] !== item.id) return current;
      return { ...current, [matchedSlot.key]: replacement.id };
    });
    setMessage(`Swapped ${item.name} with ${replacement.name}.`);
  };

  const updateItem = async (item, updates) => {
    setBusy(`update-${item.id}`);
    try {
      await api(`/closet/items/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      closet.reload();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  };

  const addItem = async () => {
    if (busy === 'analyze-item') {
      setMessage('Wait for item detection to finish, then review and save.');
      return;
    }
    if (!itemPhoto) {
      setMessage('Upload a closet item photo first.');
      return;
    }
    if (!itemWardrobeType) {
      setMessage('Choose a clothing type before saving.');
      return;
    }
    setBusy('add');
    setMessage('Saving closet item...');
    try {
      const form = new FormData();
      form.append('item', filePart(itemPhoto, 'closet-item.jpg'));
      form.append('name', itemName || itemPhoto.fileName || 'Closet item');
      form.append('category', wardrobeStoredCategoryForTab(itemWardrobeType));
      form.append('color', itemColor);
      form.append('fabric', itemFabric);
      form.append('pattern', itemPattern);
      form.append('season', itemSeason);
      form.append('formality', itemFormality);
      form.append('occasions', itemOccasions);
      form.append('tags', [itemTags, wardrobeTypeTag(itemWardrobeType)].filter(Boolean).join(', '));
      const data = await api('/closet/items', { method: 'POST', body: form });
      const savedItem = data.item;
      const savedCategory = savedItem?.category || wardrobeStoredCategoryForTab(itemWardrobeType);
      setSuggestionOverrides(null);
      setItemPhoto(null);
      setItemDetection(null);
      setItemName('');
      setItemColor('');
      setItemFabric('');
      setItemPattern('');
      setItemSeason('all-season');
      setItemFormality('any');
      setItemOccasions('');
      setItemTags('');
      if (savedItem?.id) setSavedClosetItems((current) => [savedItem, ...current.filter((item) => item.id !== savedItem.id)]);
      setComboSlots({});
      setSelectedIds([]);
      setFilter(savedCategory);
      const savedTab = wardrobeCategoryTabs.find((entry) => entry.key === itemWardrobeType)
        || wardrobeCategoryTabs.find((entry) => savedItem && wardrobeTabMatchesItem(entry, savedItem));
      if (savedTab) setWardrobePreviewSelections((current) => ({ ...current, [savedTab.key]: savedItem.id }));
      setGeneratedWardrobeOutfit(null);
      setClosetView('stylist');
      setMessage(`${savedItem?.name || 'Closet item'} added to ${closetCategoryLabel(savedCategory)}.`);
      closet.reload();
      onNavigate('closet', { view: 'stylist', selectedCategoryKey: savedTab?.key, selectedItemId: savedItem?.id });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  };

  const generateOutfit = async (ids = selectedIds, details = {}) => {
    if (!ids.length) {
      setMessage('Select at least one closet item first.');
      return;
    }
    const entries = ids.map((id) => items.find((item) => item.id === id)).filter(Boolean);
    if (!hasSupportedWardrobeLookItem(entries)) {
      setMessage('Select a clothing, footwear, or accessory item before generating a look.');
      return;
    }
    const profileMessage = tryOnProfileBlockMessage(user);
    if (profileMessage) {
      setMessage(profileMessage);
      return;
    }
    setBusy('generate');
    setMessage('Generating your closet look...');
    try {
      const data = await api('/closet/outfits/generate', {
        method: 'POST',
        timeoutMs: 240000,
        jobTimeoutMs: 300000,
        body: JSON.stringify({
          itemIds: ids,
          itemSlots: details.itemSlots || ids.map((id, index) => ({ itemId: id, slot: `selection-${index}` })),
          occasion: details.occasion || occasion,
          weather,
          mood,
          plannedFor,
          backdrop,
          pose,
          lighting,
          notes: [backdrop, pose, lighting].filter(Boolean).join(' | '),
          title: details.title || `Closet look for ${details.occasion || occasion || 'today'}`
        })
      });
      requireGeneratedImage(data.outfit, 'Your wardrobe look');
      if (data.user) setUser(data.user);
      setSuggestionOverrides(null);
      setMessage('Closet look is ready.');
      setGeneratedWardrobeOutfit(data.outfit);
      if (details.clearSelectionAfterGenerate) {
        setSelectedIds([]);
        setComboSlots({});
      } else {
        setSelectedIds(ids);
      }
      closet.reload();
      if (!details.showInWardrobe && data.outfit?.imageUrl) setLightbox(imageUrl(data.outfit.imageUrl));
    } catch (error) {
      setMessage(aiFeatureErrorMessage(error, 'Could not generate the closet look. Try again in a moment.'));
    } finally {
      setBusy('');
    }
  };

  const generateSelectedWardrobeLook = () => {
    const ids = selectedIds.filter((id) => items.some((item) => item.id === id));
    const entries = ids.map((id) => items.find((item) => item.id === id)).filter(Boolean);
    if (!ids.length) {
      setMessage('Select at least one closet item first.');
      return;
    }
    if (!hasSupportedWardrobeLookItem(entries)) {
      setMessage('Select a clothing, footwear, or accessory item before generating a look.');
      return;
    }
    generateOutfit(ids, {
      title: 'My wardrobe look',
      itemSlots: wardrobeItemSlotsFromItems(entries),
      clearSelectionAfterGenerate: true,
      showInWardrobe: true
    });
  };

  const askForSuggestions = async (nextOccasion = occasion) => {
    const generationSeed = Date.now();
    const localSuggestions = buildLocalWardrobeSuggestions(items, nextOccasion, generationSeed);
    setOccasion(nextOccasion);
    setBusy('suggest');
    if (localSuggestions.length) setSuggestionOverrides(localSuggestions);
    setMessage(localSuggestions.length ? 'Fresh wardrobe ideas ready.' : 'Finding the best combos from your closet...');
    try {
      const data = await api('/closet/suggest', {
        method: 'POST',
        body: JSON.stringify({ occasion: nextOccasion, weather, mood, seed: generationSeed, avoidItemSets: localSuggestions.map((suggestion) => suggestion.itemIds || []) })
      });
      setSuggestionOverrides(mergeWardrobeSuggestions(localSuggestions, data.suggestions || []));
      setMessage('Suggestions ready.');
    } catch (error) {
      setMessage(localSuggestions.length ? 'Fresh wardrobe ideas ready.' : error.message);
    } finally {
      setBusy('');
    }
  };

  const askStylist = async () => {
    const prompt = stylistText.trim();
    if (!prompt) return;
    setBusy('chat');
    setMessage('Building closet ideas...');
    setChat((current) => [...current, { role: 'user', text: prompt }]);
    try {
      const data = await api('/closet/chat', { method: 'POST', body: JSON.stringify({ message: prompt }) });
      const reply = data.reply || 'Look ideas are ready.';
      setChat((current) => [...current, { role: 'assistant', text: reply }]);
      setMessage(reply);
      if (data.suggestions) setSuggestionOverrides(data.suggestions);
      setStylistText('');
    } catch (error) {
      const messageText = aiFeatureErrorMessage(error, 'Closet stylist could not respond right now.');
      setChat((current) => [...current, { role: 'assistant', text: messageText }]);
      setMessage(messageText);
    } finally {
      setBusy('');
    }
  };

  const removeItem = async (id) => {
    setBusy(`delete-${id}`);
    setMessage('Removing item...');
    try {
      await api(`/closet/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setSuggestionOverrides(null);
      setSavedClosetItems((current) => current.filter((item) => item.id !== id));
      setSelectedIds((current) => current.filter((itemId) => itemId !== id));
      setComboSlots((current) => Object.fromEntries(Object.entries(current).filter(([, itemId]) => itemId !== id)));
      setMessage('Closet item removed.');
      closet.reload();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  };

  const leaveAddStudio = () => {
    Keyboard.dismiss();
    if (onBack) onBack();
    else onNavigate('closet', { view: 'stylist' });
  };

  const discardAddDraft = () => {
    setItemPhoto(null);
    setItemDetection(null);
    setItemName('');
    setItemColor('');
    setItemFabric('');
    setItemPattern('');
    setItemSeason('all-season');
    setItemFormality('any');
    setItemOccasions('');
    setItemTags('');
    setMessage('');
    leaveAddStudio();
  };

  const renderWardrobeCategoryButton = (tab) => {
    const selectedItem = items.find((item) => item.id === wardrobePreviewSelections[tab.key]);
    const selected = Boolean(selectedItem);
    const renderCategoryIcon = () => {
      if (tab.icon === 'pants') return <Image source={wardrobeBottomsIcon} style={[styles.wardrobeCategoryAssetIcon, layout.isTablet && styles.wardrobeCategoryAssetIconTablet]} resizeMode="contain" />;
      if (tab.icon === 'shoe') return <Image source={wardrobeFootwearIcon} style={[styles.wardrobeCategoryAssetIcon, layout.isTablet && styles.wardrobeCategoryAssetIconTablet]} resizeMode="contain" />;
      return <Ionicons name={tab.icon} size={layout.isTablet ? 28 : 22} color="#514b47" />;
    };
    return (
      <Pressable
        key={tab.key}
        accessibilityRole="button"
        accessibilityLabel={selectedItem ? `${tab.label}: ${selectedItem.name || 'selected item'}. Change selection` : `Choose ${tab.label} from your wardrobe`}
        accessibilityState={{ selected }}
        style={[styles.wardrobeCategoryButton, compactWardrobePreview && styles.wardrobeCategoryButtonCompact, layout.isTablet && styles.wardrobeCategoryButtonTablet]}
        onPress={() => openWardrobeCategory(tab)}
      >
        {({ pressed }) => (
          <>
            <View style={[styles.wardrobeCategoryIcon, compactWardrobePreview && styles.wardrobeCategoryIconCompact, layout.isTablet && styles.wardrobeCategoryIconTablet, selected && styles.wardrobeCategoryIconSelected, selected && layout.isTablet && styles.wardrobeCategoryIconSelectedTablet, pressed && styles.wardrobeCategoryIconPressed]}>
              {selectedItem?.imageUrl ? <ResilientImage source={{ uri: imageUrl(selectedItem.imageUrl) }} style={styles.wardrobeCategorySelectedImage} resizeMode="contain" fallbackIcon="shirt-outline" /> : renderCategoryIcon()}
              {selected ? <View pointerEvents="none" style={styles.wardrobeCategorySelectedBadge}><Ionicons name="checkmark" size={layout.isTablet ? 12 : 10} color="#ffffff" /></View> : null}
            </View>
            <Text
              style={[styles.wardrobeCategoryLabel, compactWardrobePreview && styles.wardrobeCategoryLabelCompact, layout.isTablet && styles.wardrobeCategoryLabelTablet, selected && styles.wardrobeCategoryLabelSelected]}
              numberOfLines={2}
              maxFontSizeMultiplier={1.2}
            >
              {tab.label}
            </Text>
          </>
        )}
      </Pressable>
    );
  };

  if (isAddStudio) {
    const addStudioFooter = (
      <View style={[styles.addStudioFooter, layout.isTablet && styles.addStudioFooterTablet]}>
        <TouchableOpacity style={styles.addStudioDiscardButton} onPress={discardAddDraft}>
          <Text style={styles.addStudioDiscardText}>DISCARD DRAFT</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.addStudioSaveButton, (busy === 'add' || busy === 'analyze-item') && styles.disabledButton]} disabled={busy === 'add' || busy === 'analyze-item'} onPress={addItem}>
          <Text style={styles.addStudioSaveText}>{busy === 'analyze-item' ? 'ANALYZING...' : busy === 'add' ? 'SAVING...' : 'SAVE CLOTHING\nITEM'}</Text>
        </TouchableOpacity>
      </View>
    );
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.addStudioScreen}>
        <ScrollView ref={addStudioScrollRef} style={styles.flex} contentContainerStyle={[styles.addStudioContent, layout.isTablet && styles.addStudioContentTablet]} {...screenScrollProps}>
          <WardrobeTopBar user={user} onNavigate={onNavigate} />

          <Pressable accessibilityRole="button" accessibilityLabel="Back to previous page" disabled={busy === 'add'} style={[styles.addStudioBackButton, layout.isTablet && styles.addStudioBackButtonTablet, busy === 'add' && styles.disabledButton]} onPress={discardAddDraft}>
            <Ionicons name="chevron-back" size={20} color="#211f1d" />
            <Text style={styles.addStudioBackText}>Back</Text>
          </Pressable>

          <View style={[styles.wardrobeHeroHead, styles.addStudioHeroHead, compactWardrobePreview && styles.wardrobeHeroHeadCompact, layout.isTablet && styles.addStudioHeaderTablet]}>
            <View style={styles.wardrobeHeroCopy}>
              <Text style={[styles.wardrobeTitle, compactWardrobePreview && styles.wardrobeTitleCompact]} numberOfLines={1} adjustsFontSizeToFit={Platform.OS === 'ios'} minimumFontScale={0.88} maxFontSizeMultiplier={1.1}>My Wardrobe</Text>
              <Text style={[styles.wardrobeSubtitle, compactWardrobePreview && styles.wardrobeSubtitleCompact]} numberOfLines={2} maxFontSizeMultiplier={1.15}>Your personal style collection</Text>
            </View>
            {!layout.isTablet ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add wardrobe item" style={[styles.wardrobeAddButton, compactWardrobePreview && styles.wardrobeAddButtonCompact]} activeOpacity={0.85} onPress={pickClosetItemPhoto}>
              <Ionicons name="add" size={compactWardrobePreview ? 20 : 22} color="#ffffff" />
              <Text style={[styles.wardrobeAddText, compactWardrobePreview && styles.wardrobeAddTextCompact]} numberOfLines={1} maxFontSizeMultiplier={1.15}>Add Item</Text>
            </TouchableOpacity> : null}
          </View>


          <View style={[styles.addStudioMain, layout.isTablet && styles.addStudioMainTablet]}>
          <View style={[styles.addStudioMediaColumn, layout.isTablet && styles.addStudioMediaColumnTablet]}>
          <TouchableOpacity ref={wardrobeUploadTourTarget.ref} onLayout={wardrobeUploadTourTarget.onLayout} style={[styles.addStudioUploadBox, layout.isTablet && styles.addStudioUploadBoxTablet]} activeOpacity={0.84} onPress={pickClosetItemPhoto}>
            {itemPhoto?.uri ? (
              <>
                <ResilientImage source={{ uri: itemPhoto.uri }} style={styles.addStudioUploadImage} resizeMode={layout.isTablet ? 'contain' : 'cover'} fallbackIcon="shirt-outline" />
                {busy === 'analyze-item' ? (
                  <View style={styles.addStudioAnalyzeOverlay}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.addStudioAnalyzeText}>Analyzing item</Text>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.addStudioUploadCopy}>
                <Ionicons name="camera-outline" size={32} color="#57514f" />
                <Text style={styles.addStudioUploadTitle}>Upload Clothing Photo</Text>
                <Text style={styles.addStudioUploadText}>High resolution, neutral background preferred</Text>
              </View>
            )}
          </TouchableOpacity>

          <ClosetDetectionCard detection={itemDetection} fields={detectionSummaryFields} />

          {!layout.isTablet ? <View style={styles.addStudioArchiveHead}>
            <Text style={styles.addStudioArchiveTitle}>Archive Entry: {addItemTypeLabel}</Text>
            <View style={styles.addStudioArchiveLine} />
          </View> : null}

          <View style={[styles.addStudioSavedSection, layout.isTablet && styles.addStudioSavedSectionTablet]}>
            <View style={styles.addStudioSavedHead}>
              <Text style={styles.addStudioSavedTitle}>Saved {activeAddTab?.label || 'Items'}</Text>
              <Text style={styles.addStudioSavedCount}>{activeAddSectionItems.length}</Text>
            </View>
            {closet.loading && !activeAddSectionItems.length ? (
              <View style={styles.addStudioSavedEmpty}>
                <ActivityIndicator size="small" color="#9b5658" />
              </View>
            ) : activeAddSectionItems.length ? (
              <ScrollView {...horizontalScrollProps} contentContainerStyle={styles.addStudioSavedTrack}>
                {activeAddSectionItems.map((item) => (
                  <TouchableOpacity key={item.id} style={styles.addStudioSavedCard} activeOpacity={0.86} onPress={() => openSavedAddSectionItem(item)}>
                    <ResilientImage source={item.imageUrl ? { uri: imageUrl(item.imageUrl) } : null} style={styles.addStudioSavedImage} resizeMode="cover" fallbackIcon="shirt-outline" />
                    <Text style={styles.addStudioSavedName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.addStudioSavedMeta} numberOfLines={1}>{[item.color, wardrobeCategoryTabs.find((tab) => tab.key === wardrobeTabKeyForItem(item))?.label].filter(Boolean).map(titleCase).join(' | ')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.addStudioSavedEmpty}>
                <Ionicons name="shirt-outline" size={22} color="#9b5658" />
                <Text style={styles.addStudioSavedEmptyText}>{activeAddTab ? `No saved ${activeAddTab.label.toLowerCase()} yet` : 'Choose a clothing type to see saved items'}</Text>
              </View>
            )}
          </View>
          </View>

          <View style={[styles.addStudioDetailsColumn, layout.isTablet && styles.addStudioDetailsColumnTablet]}>
          {layout.isTablet ? <View style={[styles.addStudioArchiveHead, styles.addStudioArchiveHeadTablet]}>
            <Text style={styles.addStudioArchiveTitle}>Archive Entry: {addItemTypeLabel}</Text>
            <View style={styles.addStudioArchiveLine} />
          </View> : null}

          <Text style={[styles.addStudioSectionLabel, layout.isTablet && styles.addStudioSectionLabelTablet]}>ITEM SPECIFICATIONS</Text>
          <View style={[styles.addStudioForm, layout.isTablet && styles.addStudioFormTablet]}>
            <Text style={styles.addStudioFieldLabel}>Item Name</Text>
            <TextInput style={styles.addStudioInput} value={itemName} onChangeText={(name) => {
              setItemName(name);
              if (!itemTypeChosenManuallyRef.current) {
                const detectedType = wardrobeTypeFromItemDetails({ name });
                if (detectedType) {
                  setItemCategory(wardrobeStoredCategoryForTab(detectedType));
                  setItemWardrobeType(detectedType);
                }
              }
            }} placeholder="e.g. Black ribbed dress" placeholderTextColor="#8a817b" />

            <View style={styles.addStudioTwoCol}>
              <View style={styles.addStudioFieldHalf}>
                <Text style={styles.addStudioFieldLabel}>Type</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose clothing type" accessibilityHint="Shows every wardrobe category" style={styles.addStudioSelectInput} onPress={() => setItemCategoryPickerOpen(true)}>
                  <Text style={styles.addStudioInputText}>{activeAddTab?.label || 'Choose type'}</Text>
                  <Ionicons name="chevron-down" size={18} color="#6f7680" />
                </TouchableOpacity>
              </View>
              <View style={styles.addStudioFieldHalf}>
                <Text style={styles.addStudioFieldLabel}>Color</Text>
                <View style={styles.addStudioColorInput}>
                  <View style={styles.addStudioColorDot} />
                  <TextInput style={styles.addStudioColorTextInput} value={itemColor} onChangeText={setItemColor} placeholder="Charcoal" placeholderTextColor="#2b2a29" />
                </View>
              </View>
            </View>

          </View>

          {message ? <Text style={[styles.formMessage, styles.addStudioMessage, layout.isTablet && styles.addStudioMessageTablet, /failed|missing|error|upload/i.test(message) ? styles.errorText : null]}>{message}</Text> : null}
          {layout.isTablet ? addStudioFooter : null}
          </View>
          </View>
        </ScrollView>

        {!layout.isTablet ? addStudioFooter : null}
        <Modal visible={itemCategoryPickerOpen} transparent animationType="slide" onRequestClose={() => setItemCategoryPickerOpen(false)}>
          <View style={styles.wardrobePickerOverlay}>
            <Pressable accessibilityLabel="Close category picker" style={styles.wardrobePickerBackdrop} onPress={() => setItemCategoryPickerOpen(false)} />
            <SafeAreaView style={[styles.wardrobePickerSheet, layout.isTablet && styles.wardrobePickerSheetTablet]}>
              <View style={styles.wardrobePickerHeader}>
                <View style={styles.wardrobePickerHeaderCopy}>
                  <Text style={styles.wardrobePickerEyebrow}>ARCHIVE ENTRY</Text>
                  <Text style={styles.wardrobePickerTitle}>Clothing type</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Close category picker" hitSlop={12} style={styles.wardrobePickerClose} onPress={() => setItemCategoryPickerOpen(false)}>
                  <DecorativeCloseIcon size={20} color="#211f1d" />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.wardrobePickerContent}>
                <View style={styles.addStudioCategoryGrid}>
                  {wardrobeCategoryTabs.map((tab) => {
                    const selected = itemWardrobeType === tab.key;
                    return <Pressable key={tab.key} accessibilityRole="button" accessibilityLabel={`Choose ${tab.label}`} accessibilityState={{ selected }} style={[styles.addStudioCategoryChoice, selected && styles.addStudioCategoryChoiceSelected]} onPress={() => { itemTypeChosenManuallyRef.current = true; setItemCategory(wardrobeStoredCategoryForTab(tab.key)); setItemWardrobeType(tab.key); setItemCategoryPickerOpen(false); }}>
                      <View style={styles.addStudioCategoryChoiceIcon}>
                        {tab.icon === 'pants' ? <Image source={wardrobeBottomsIcon} style={styles.addStudioCategoryChoiceAsset} resizeMode="contain" />
                          : tab.icon === 'shoe' ? <Image source={wardrobeFootwearIcon} style={styles.addStudioCategoryChoiceAsset} resizeMode="contain" />
                            : <Ionicons name={tab.icon} size={18} color="#211f1d" />}
                      </View>
                      <Text style={[styles.addStudioCategoryChoiceText, selected && styles.addStudioCategoryChoiceTextSelected]} numberOfLines={2} maxFontSizeMultiplier={1.2}>{tab.label}</Text>
                      {selected ? <Ionicons name="checkmark-circle" size={17} color="#fff" style={styles.addStudioCategoryChoiceCheck} /> : null}
                    </Pressable>;
                  })}
                </View>
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wardrobeScreen}>
      <WardrobeTopBar user={user} onNavigate={onNavigate} />
      <ScrollView ref={wardrobeScrollRef} style={styles.flex} onLayout={(event) => measureWardrobePart('viewport', event.nativeEvent.layout.height)} contentContainerStyle={[styles.wardrobeContent, !layout.isTablet && { paddingBottom: wardrobeBottomClearance }, layout.isTablet && styles.wardrobeContentTablet]} {...screenScrollProps}>
        <View onLayout={(event) => measureWardrobePart('header', event.nativeEvent.layout.height)} style={[styles.wardrobeHeroHead, compactWardrobePreview && styles.wardrobeHeroHeadCompact, layout.isTablet && styles.wardrobeHeroHeadTablet]}>
          <View style={styles.wardrobeHeroCopy}>
            <Text style={[styles.wardrobeTitle, compactWardrobePreview && styles.wardrobeTitleCompact, layout.isTablet && styles.wardrobeTitleTablet]} numberOfLines={1} adjustsFontSizeToFit={Platform.OS === 'ios'} minimumFontScale={0.88} maxFontSizeMultiplier={1.1}>My Wardrobe</Text>
            <Text style={[styles.wardrobeSubtitle, compactWardrobePreview && styles.wardrobeSubtitleCompact, layout.isTablet && styles.wardrobeSubtitleTablet]} numberOfLines={2} maxFontSizeMultiplier={1.15}>Your personal style collection</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add wardrobe item" style={[styles.wardrobeAddButton, compactWardrobePreview && styles.wardrobeAddButtonCompact, layout.isTablet && styles.wardrobeAddButtonTablet]} activeOpacity={0.85} onPress={() => onNavigate('closet', { view: 'add' })}>
            <Ionicons name="add" size={compactWardrobePreview ? 20 : 22} color="#ffffff" />
            <Text style={[styles.wardrobeAddText, compactWardrobePreview && styles.wardrobeAddTextCompact]} numberOfLines={1} maxFontSizeMultiplier={1.15}>Add Item</Text>
          </TouchableOpacity>
        </View>


        {closetView === 'stylist' ? (
          <>
            <View style={[styles.wardrobePreviewWrap, layout.isTablet && styles.wardrobePreviewWrapTablet]}>
              <View style={[styles.wardrobePreviewStage, compactWardrobePreview && styles.wardrobePreviewStageCompact, !layout.isTablet && styles.wardrobePreviewStagePhone, layout.isTablet && styles.wardrobePreviewStageTablet, layout.isTablet && { width: wardrobeTabletPhotoWidth + wardrobeTabletSideWidth * 2 }]}>
                <Pressable accessibilityRole={mainPreview ? 'button' : undefined} accessibilityLabel={mainPreview ? 'View wardrobe model full screen' : undefined} style={[styles.wardrobePreviewCard, compactWardrobePreview && styles.wardrobePreviewCardCompact, !layout.isTablet && styles.wardrobePreviewCardPhone, layout.isTablet && styles.wardrobePreviewCardTablet, { height: wardrobePreviewHeight }, { width: layout.isTablet ? wardrobeTabletPhotoWidth : wardrobePhonePhotoWidth }]} onPress={() => mainPreview && setLightbox(imageUrl(mainPreview))}>
                  {wardrobePreviewSource ? (
                    <ResilientImage source={wardrobePreviewSource} style={styles.wardrobePreviewImage} resizeMode={layout.isTablet ? 'contain' : 'cover'} fallbackIcon="shirt-outline" fallbackText="Look unavailable. Try again." />
                  ) : <View style={styles.wardrobePortraitEmpty}>
                    <View style={styles.wardrobePortraitEmptyIcon}><Ionicons name="person-outline" size={28} color="#9b5658" /></View>
                    <Text style={styles.wardrobePortraitEmptyTitle}>Add your photo</Text>
                    <Text style={styles.wardrobePortraitEmptyCopy}>Upload a clear full-body portrait to preview your wardrobe looks.</Text>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Upload full-body portrait" style={styles.wardrobePortraitEmptyAction} onPress={() => onNavigate('profile')}>
                      <Text style={styles.wardrobePortraitEmptyActionText}>Upload portrait</Text>
                      <Ionicons name="arrow-forward" size={15} color="#fff" />
                    </TouchableOpacity>
                  </View>}
                  {busy === 'generate' ? <View style={styles.previewGenerating}><ActivityIndicator color="#fff" /><Text style={styles.previewGeneratingText}>Generating look</Text></View> : null}
                </Pressable>
                <View style={[styles.wardrobeCategoryRail, compactWardrobePreview && styles.wardrobeCategoryRailCompact, layout.isTablet && styles.wardrobeCategoryRailTablet, styles.wardrobeCategoryRailLeft, !layout.isTablet && styles.wardrobeCategoryRailLeftPhone]}>
                  {wardrobeLeftCategoryTabs.map(renderWardrobeCategoryButton)}
                </View>
                <View style={[styles.wardrobeCategoryRail, compactWardrobePreview && styles.wardrobeCategoryRailCompact, layout.isTablet && styles.wardrobeCategoryRailTablet, styles.wardrobeCategoryRailRight, !layout.isTablet && styles.wardrobeCategoryRailRightPhone]}>
                  {wardrobeRightCategoryTabs.map(renderWardrobeCategoryButton)}
                </View>
              </View>
              <View onLayout={(event) => measureWardrobePart('controls', event.nativeEvent.layout.height)} style={[styles.wardrobeTryButtonDock, compactWardrobePreview && styles.wardrobeTryButtonDockCompact, layout.isTablet && styles.wardrobeTryButtonDockTablet]}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={tryThisLookIds.length ? 'Try this wardrobe look on' : 'Add clothing to enable try-on'}
                  accessibilityState={{ disabled: !tryThisLookIds.length || busy === 'generate' }}
                  style={[styles.wardrobeTryButton, compactWardrobePreview && styles.wardrobeTryButtonCompact, layout.isTablet && styles.wardrobeTryButtonTablet, (!tryThisLookIds.length || busy === 'generate') && styles.wardrobeTryButtonDisabled]}
                  disabled={!tryThisLookIds.length || busy === 'generate'}
                  onPress={() => generateOutfit(tryThisLookIds, { title: 'My wardrobe look', itemSlots: tryThisItemSlots, showInWardrobe: true })}
                >
                  <Text style={[styles.wardrobeTryText, !tryThisLookIds.length && styles.wardrobeTryTextDisabled]} maxFontSizeMultiplier={1.2}>{busy === 'generate' ? 'Generating…' : 'Try On'}</Text>
                  {busy !== 'generate' ? <Ionicons name="arrow-forward" size={16} color={tryThisLookIds.length ? '#ffffff' : '#8a837e'} /> : null}
                </TouchableOpacity>
                {!tryThisLookIds.length ? <Text style={[styles.wardrobeTryHint, layout.isTablet && styles.wardrobeTryHintTablet]} maxFontSizeMultiplier={1.2}>Choose a category, then select a saved item</Text> : null}
              </View>
              {generatedWardrobeOutfit?.imageUrl ? <Text style={styles.wardrobeResultCaption}>Your look is ready in the wardrobe preview above.</Text> : null}
            </View>
          </>
        ) : (
          <View style={[styles.wardrobeModeTabs, layout.isTablet && styles.wardrobeModeTabsTablet]}>
            {layout.isTablet ? (
              <View style={styles.wardrobeTabletTabs}>
                {[['stylist', 'Preview'], ['combo', 'Combo'], ['add', 'Add'], ['looks', 'Looks']].map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: closetView === value }}
                    style={[styles.wardrobeTabletTab, closetView === value && styles.wardrobeTabletTabActive]}
                    onPress={() => switchClosetView(value)}
                  >
                    <Text style={[styles.wardrobeTabletTabText, closetView === value && styles.wardrobeTabletTabTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <FilterChips
                selected={closetView}
                options={[['stylist', 'Preview'], ['combo', 'Combo'], ['add', 'Add'], ['looks', 'Looks']]}
                onSelect={switchClosetView}
                compact
              />
            )}
          </View>
        )}

        {closetView === 'add' ? <View style={styles.closetPanel}>
          <Text style={styles.sectionTitle}>Add Clothing</Text>
          <TouchableOpacity style={styles.uploadBox} onPress={pickClosetItemPhoto}>
            {itemPhoto?.uri ? <ResilientImage source={{ uri: itemPhoto.uri }} style={styles.uploadPreview} resizeMode="cover" fallbackIcon="shirt-outline" /> : <Ionicons name="cloud-upload-outline" size={30} color="#0f766e" />}
            <View style={styles.uploadCopy}>
              <Text style={styles.uploadTitle}>{busy === 'analyze-item' ? 'Analyzing clothing photo' : itemPhoto ? 'Closet photo selected' : 'Upload clothing photo'}</Text>
              <Text style={styles.photoGuideText}>{itemPhoto ? 'Detected details will be filled below for review.' : 'Use one clear item per photo for best combo selection.'}</Text>
            </View>
          </TouchableOpacity>
          <ClosetDetectionCard detection={itemDetection} fields={detectionSummaryFields} compact />
          <TextInput style={styles.input} value={itemName} onChangeText={setItemName} placeholder="Item name" placeholderTextColor="#94a3b8" />
          <FilterChips selected={itemCategory} options={closetCategories.map((item) => [item, closetCategoryLabel(item)])} onSelect={setItemCategory} compact />
          <View style={styles.twoColumnInputs}>
            <TextInput style={[styles.input, styles.halfInput]} value={itemColor} onChangeText={setItemColor} placeholder="Color" placeholderTextColor="#94a3b8" />
            <TextInput style={[styles.input, styles.halfInput]} value={itemFabric} onChangeText={setItemFabric} placeholder="Fabric" placeholderTextColor="#94a3b8" />
          </View>
          <View style={styles.twoColumnInputs}>
            <TextInput style={[styles.input, styles.halfInput]} value={itemPattern} onChangeText={setItemPattern} placeholder="Pattern" placeholderTextColor="#94a3b8" />
            <TextInput style={[styles.input, styles.halfInput]} value={itemOccasions} onChangeText={setItemOccasions} placeholder="Occasions" placeholderTextColor="#94a3b8" />
          </View>
          <Text style={styles.formLabel}>Season</Text>
          <FilterChips selected={itemSeason} options={['all-season', 'summer', 'winter', 'rainy'].map((item) => [item, titleCase(item)])} onSelect={setItemSeason} compact />
          <Text style={styles.formLabel}>Vibe</Text>
          <FilterChips selected={itemFormality} options={['any', 'casual', 'smart-casual', 'formal', 'party', 'active'].map((item) => [item, titleCase(item)])} onSelect={setItemFormality} compact />
          <TextInput style={styles.input} value={itemTags} onChangeText={setItemTags} placeholder="Tags or occasions" placeholderTextColor="#94a3b8" />
          <AppButton label={busy === 'analyze-item' ? 'Analyzing...' : busy === 'add' ? 'Saving...' : 'Add To Closet'} icon="add-circle-outline" disabled={busy === 'add' || busy === 'analyze-item'} onPress={addItem} />
        </View> : null}

        {closetView === 'combo' ? <View style={styles.closetPanel}>
          <Text style={styles.sectionTitle}>Combo Builder</Text>
          <Text style={styles.muted}>Pick pieces by slot, then generate the selected outfit on your profile.</Text>
          <View style={styles.twoColumnInputs}>
            <TextInput style={[styles.input, styles.halfInput]} value={occasion} onChangeText={setOccasion} placeholder="Occasion" placeholderTextColor="#94a3b8" />
            <TextInput style={[styles.input, styles.halfInput]} value={weather} onChangeText={setWeather} placeholder="Weather" placeholderTextColor="#94a3b8" />
          </View>
          <View style={styles.twoColumnInputs}>
            <TextInput style={[styles.input, styles.halfInput]} value={mood} onChangeText={setMood} placeholder="Mood" placeholderTextColor="#94a3b8" />
            <TextInput style={[styles.input, styles.halfInput]} value={plannedFor} onChangeText={setPlannedFor} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" />
          </View>
          <Text style={styles.formLabel}>Backdrop</Text>
          <FilterChips selected={backdrop} options={closetSceneOptions.backdrop.map((item) => [item, titleCase(item)])} onSelect={setBackdrop} compact />
          <Text style={styles.formLabel}>Pose</Text>
          <FilterChips selected={pose} options={closetSceneOptions.pose.map((item) => [item, titleCase(item)])} onSelect={setPose} compact />
          <Text style={styles.formLabel}>Lighting</Text>
          <FilterChips selected={lighting} options={closetSceneOptions.lighting.map((item) => [item, titleCase(item)])} onSelect={setLighting} compact />
          <AppButton label={busy === 'suggest' ? 'Finding Ideas...' : 'Suggest Combos'} icon="sparkles-outline" variant="secondary" disabled={busy === 'suggest' || !items.length} onPress={() => askForSuggestions()} />
          <View style={styles.comboSlotGrid}>
            {closetComboSlots.map((slot) => {
              const selectedItem = items.find((item) => item.id === comboSlots[slot.key]);
              const isActive = activeSlot === slot.key;
              return (
                <TouchableOpacity key={slot.key} style={[styles.comboSlot, isActive && styles.comboSlotActive]} onPress={() => setActiveSlot(slot.key)}>
                  <Text style={styles.comboSlotLabel}>{slot.label}</Text>
                  <Text style={styles.comboSlotValue} numberOfLines={1}>{selectedItem?.name || slot.helper}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {closetComboSlots.map((slot) => {
            if (slot.key !== activeSlot) return null;
            const options = optionsForSlot(slot, items);
            return (
              <View key={slot.key} style={styles.slotOptions}>
                <Text style={styles.formLabel}>{slot.label}</Text>
                {options.length ? (
                  <ScrollView {...horizontalScrollProps} contentContainerStyle={styles.suggestionRow}>
                    {options.map((item) => {
                      const active = comboSlots[slot.key] === item.id;
                      return (
                        <TouchableOpacity key={item.id} style={[styles.slotOptionCard, active && styles.slotOptionActive]} onPress={() => setSlotItem(slot.key, item.id)}>
                          <ResilientImage source={item.imageUrl ? { uri: imageUrl(item.imageUrl) } : null} style={styles.slotOptionImage} resizeMode="cover" fallbackIcon="shirt-outline" />
                          <Text style={styles.slotOptionName} numberOfLines={2}>{item.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : <Text style={styles.muted}>Add a {slot.helper.toLowerCase()} item to fill this slot.</Text>}
                {comboSlots[slot.key] ? <AppButton label="Clear Slot" icon="close-circle-outline" variant="secondary" onPress={() => setSlotItem(slot.key, '')} /> : null}
              </View>
            );
          })}
          {selectedItems.length ? (
            <View style={styles.selectedComboStrip}>
              {selectedItems.map((item) => (
                <View key={item.id} style={styles.selectedChipCard}>
                  <ResilientImage source={item.imageUrl ? { uri: imageUrl(item.imageUrl) } : null} style={styles.selectedChipImage} resizeMode="cover" fallbackIcon="shirt-outline" />
                  <Text style={styles.selectedChipName} numberOfLines={1}>{item.name}</Text>
                  <TouchableOpacity onPress={() => swapSelected(item)}><Text style={styles.selectedChipAction}>Swap</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleItem(item.id)}><Text style={styles.selectedChipAction}>Remove</Text></TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
          <AppButton label={busy === 'generate' ? 'Generating...' : `Generate Combo On Me (${selectedIds.length})`} icon="sparkles-outline" disabled={busy === 'generate' || !selectedIds.length} onPress={() => generateOutfit()} />
          <View style={styles.comboSuggestionList}>
            <Text style={styles.formLabel}>Combo Selection</Text>
            {suggestions.length ? suggestions.slice(0, 6).map((combo, index) => {
              const comboIds = combo.itemIds || [];
              const active = comboIds.slice().sort().join(':') === selectedKey;
              return (
                <TouchableOpacity key={combo.key || combo.title || index} style={[styles.comboSuggestionCard, active && styles.comboSuggestionActive]} onPress={() => applyComboItems(combo.items || [])}>
                  <Text style={styles.comboNumber}>{String(index + 1).padStart(2, '0')}</Text>
                  <View style={styles.comboThumbs}>
                    {(combo.items || []).slice(0, 4).map((item) => (
                      <ResilientImage key={item.id} source={item.imageUrl ? { uri: imageUrl(item.imageUrl) } : null} style={styles.comboThumb} resizeMode="cover" fallbackIcon="shirt-outline" />
                    ))}
                  </View>
                  <View style={styles.comboSuggestionCopy}>
                    <Text style={styles.suggestionTitle}>{combo.title || `Combo ${index + 1}`}</Text>
                    <Text style={styles.suggestionCopy} numberOfLines={2}>{combo.reason || 'AI-picked from your closet'}</Text>
                  </View>
                </TouchableOpacity>
              );
            }) : (
              <TouchableOpacity style={styles.comboSuggestionCard} onPress={() => askForSuggestions()}>
                <Text style={styles.comboNumber}>AI</Text>
                <View style={styles.comboSuggestionCopy}>
                  <Text style={styles.suggestionTitle}>Create combos</Text>
                  <Text style={styles.suggestionCopy}>Get recommendations from your uploaded closet.</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View> : null}

        {closetView === 'combo' ? <View style={styles.closetPanel}>
          <View style={styles.panelHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Look Preview</Text>
              <Text style={styles.muted}>Your clothes only</Text>
            </View>
            <Text style={styles.statPill}>{user.tokens} tokens</Text>
          </View>
          <View style={styles.chatTranscript}>
            {chat.map((entry, index) => (
              <View key={`${entry.role}-${index}`} style={[styles.chatBubble, entry.role === 'user' && styles.chatBubbleUser]}>
                <Text style={[styles.chatBubbleText, entry.role === 'user' && styles.chatBubbleUserText]}>{entry.text}</Text>
              </View>
            ))}
          </View>
          <View style={styles.searchRow}>
            <TextInput style={styles.searchInput} value={stylistText} onChangeText={setStylistText} placeholder="Describe a look: office, date, rain..." placeholderTextColor="#94a3b8" />
            <TouchableOpacity style={[styles.searchButton, busy === 'chat' && styles.disabledButton]} disabled={busy === 'chat'} onPress={askStylist}>
              <Ionicons name="sparkles-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          {suggestions.length ? (
            <ScrollView {...horizontalScrollProps} contentContainerStyle={styles.suggestionRow}>
              {suggestions.map((suggestion) => (
                <TouchableOpacity key={suggestion.key || suggestion.title} style={styles.suggestionCard} onPress={() => applySuggestion(suggestion)}>
                  <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                  <Text style={styles.suggestionCopy} numberOfLines={2}>{suggestion.reason}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}
        </View> : null}

        {closetView !== 'stylist' && !closet.loading && closet.error ? <StatusPanel error={closet.error} /> : null}
        {tabletWardrobeEmpty ? (
          <View style={styles.wardrobeTabletEmpty}>
            <Image source={images.homeStarterWardrobe} style={styles.wardrobeTabletEmptyImage} resizeMode="cover" />
            <View style={styles.wardrobeTabletEmptyBody}>
              <Text style={styles.wardrobeTabletEmptyTitle}>Start your wardrobe</Text>
              <Text style={styles.wardrobeTabletEmptyCopy}>Add a clothing photo to start building your collection. Lookmefy will organise its details for you.</Text>
              <TouchableOpacity accessibilityRole="button" style={styles.wardrobeTabletEmptyButton} onPress={() => switchClosetView('add')}>
                <Ionicons name="add" size={20} color="#ffffff" />
                <Text style={styles.wardrobeTabletEmptyButtonText}>Add first item</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {closetView !== 'stylist' && !closet.loading && !closet.error && !items.length && !tabletWardrobeEmpty ? (
          <View style={styles.closetEmptyWrap}>
            <EmptyStateCard
              icon="shirt-outline"
              title="No clothes yet"
              text="Upload your first item and Lookmefy will read the type, colour, fabric, pattern, and tags."
              actionLabel="Add Clothes"
              actionIcon="add"
              onAction={() => setClosetView('add')}
            />
          </View>
        ) : null}
        {closetView === 'wardrobe' && !tabletWardrobeEmpty ? <View style={styles.closetPanel}>
          <View style={styles.panelHeaderRow}>
            <View style={styles.wardrobeHeaderCopy}>
              <Text style={styles.sectionTitle}>{wardrobeFilterTitle}</Text>
              <Text style={styles.muted}>{filter === 'all' && !activeWardrobeTab ? 'Browse, save favorites, remove old items, or send selected pieces to combo.' : `Saved ${wardrobeFilterLabel.toLowerCase()} from your wardrobe.`}</Text>
            </View>
            <View style={styles.wardrobeHeaderActions}>
              {selectedIds.length ? <TouchableOpacity style={styles.smallOutlineButton} onPress={() => setClosetView('combo')}><Text style={styles.smallOutlineText}>Build ({selectedIds.length})</Text></TouchableOpacity> : null}
            </View>
          </View>
          <FilterChips
            selected={filter}
            options={[['all', 'All'], ...closetCategories.map((item) => [item, closetCategoryLabel(item)])]}
            onSelect={(nextFilter) => {
              setFilter(nextFilter);
              setActiveWardrobeTabKey('');
            }}
            compact
          />
        </View> : null}
        {closetView === 'wardrobe' || closetView === 'combo' ? closet.loading ? <WardrobeGridSkeleton /> : items.length ? (
          <View style={styles.closetGrid}>
            {(closetView === 'wardrobe' ? filteredItems : items).map((item) => {
              const selected = selectedIds.includes(item.id);
              return (
                <Pressable key={item.id} style={[styles.closetItemCard, layout.productGridWidthStyle, selected && styles.closetItemSelected]} onPress={() => toggleItem(item.id)}>
                  <ResilientImage source={item.imageUrl ? { uri: imageUrl(item.imageUrl) } : null} style={styles.closetItemImage} resizeMode="cover" fallbackIcon="shirt-outline" />
                  <View style={styles.closetItemBody}>
                    <Text style={styles.productTitle} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.productBrand} numberOfLines={2}>{[item.color, item.fabric, item.category, item.formality].filter(Boolean).map(titleCase).join(' | ')}</Text>
                    <View style={styles.closetItemActions}>
                      <Text style={[styles.selectText, selected && styles.selectTextActive]}>{selected ? 'Selected' : 'Tap to select'}</Text>
                      <TouchableOpacity onPress={() => updateItem(item, { favorite: !item.favorite })} disabled={busy === `update-${item.id}`}>
                        <Ionicons name={item.favorite ? 'heart' : 'heart-outline'} size={17} color={item.favorite ? '#b91c1c' : '#64748b'} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeItem(item.id)} disabled={busy === `delete-${item.id}`}>
                        <Ionicons name="trash-outline" size={17} color="#b91c1c" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Pressable>
              );
            })}
            {closetView === 'wardrobe' && !filteredItems.length ? (
              <EmptyStateCard compact icon="filter-outline" title="No matches" text="Try another category filter or add a new wardrobe item." />
            ) : null}
          </View>
        ) : null : null}
        {closetView === 'wardrobe' && items.length ? (
          <View style={styles.wardrobeGenerateFooter}>
            {selectedWardrobeGenerateHint ? <Text style={styles.wardrobeGenerateHint}>{selectedWardrobeGenerateHint}</Text> : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Try on selected wardrobe items"
              style={[styles.wardrobeGenerateLookButton, (!selectedIds.length || !selectedWardrobeCanGenerate || busy === 'generate') && styles.disabledButton]}
              activeOpacity={0.88}
              disabled={!selectedWardrobeCanGenerate || busy === 'generate'}
              onPress={generateSelectedWardrobeLook}
            >
              <Ionicons name="sparkles-outline" size={20} color="#ffffff" />
              <Text style={styles.wardrobeGenerateLookText}>{busy === 'generate' ? 'CREATING LOOK...' : 'TRY ON'}</Text>
              {selectedIds.length ? <Text style={styles.wardrobeGenerateLookCount}>{selectedIds.length}</Text> : null}
            </TouchableOpacity>
          </View>
        ) : null}
        {closetView === 'wardrobe' && generatedWardrobeOutfit?.imageUrl ? (
          <View style={styles.wardrobeGeneratedResult} onLayout={(event) => wardrobeScrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: true })}>
            <Text style={styles.wardrobeGeneratedTitle}>Your wardrobe look</Text>
            <Text style={styles.wardrobeGeneratedCopy}>Saved to Looks. Tap the image to view it full screen.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="View generated wardrobe look full screen" onPress={() => setLightbox(imageUrl(generatedWardrobeOutfit.imageUrl))}>
              <ResilientImage source={{ uri: imageUrl(generatedWardrobeOutfit.imageUrl) }} style={styles.wardrobeGeneratedImage} resizeMode="contain" fallbackIcon="shirt-outline" />
            </Pressable>
            <ReportContentAction content={reportContentReference(generatedWardrobeOutfit, 'wardrobe_outfit')} />
          </View>
        ) : null}
        {closetView === 'looks' ? (
          <View style={styles.looksList}>
            {outfits.map((outfit) => (
              <Pressable key={outfit.id} style={styles.latestOutfitCard} onPress={() => outfit.imageUrl && setLightbox(imageUrl(outfit.imageUrl))}>
                <ResilientImage source={outfit.imageUrl ? { uri: imageUrl(outfit.imageUrl) } : null} style={styles.latestOutfitImage} resizeMode="cover" fallbackIcon="shirt-outline" />
                <View style={styles.latestOutfitCopy}>
                  <Text style={styles.latestOutfitTitle}>{outfit.title || 'Generated outfit'}</Text>
                  <ReportContentAction content={reportContentReference(outfit, 'wardrobe_outfit')} />
                  <Text style={styles.muted}>{outfit.items?.map((item) => item.name).join(' + ') || outfit.occasion || 'Saved closet look'}</Text>
                </View>
              </Pressable>
            ))}
            {!outfits.length ? <StatusPanel empty text="Generated closet looks will appear here." /> : null}
          </View>
        ) : null}
        {message ? <Text style={[styles.formMessage, styles.closetMessage, /failed|missing|error|not enough|upload|select/i.test(message) ? styles.errorText : null]}>{message}</Text> : null}
      </ScrollView>
      <Modal visible={Boolean(wardrobePickerTab)} transparent animationType="slide" onRequestClose={() => setWardrobePickerTab(null)}>
        <View style={styles.wardrobePickerOverlay}>
          <Pressable accessibilityLabel="Close clothing picker" style={styles.wardrobePickerBackdrop} onPress={() => setWardrobePickerTab(null)} />
          <SafeAreaView style={[styles.wardrobePickerSheet, layout.isTablet && styles.wardrobePickerSheetTablet]}>
            <View style={styles.wardrobePickerHeader}>
              <View style={styles.wardrobePickerHeaderCopy}>
                <Text style={styles.wardrobePickerEyebrow}>MY WARDROBE</Text>
                <Text style={styles.wardrobePickerTitle}>Choose {wardrobePickerTab?.label}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close clothing picker" hitSlop={12} style={styles.wardrobePickerClose} onPress={() => setWardrobePickerTab(null)}>
                <DecorativeCloseIcon size={20} color="#211f1d" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.wardrobePickerContent}>
              {wardrobePickerItems.length ? <View style={styles.wardrobePickerGrid}>
                {wardrobePickerItems.map((item) => {
                  const selected = wardrobePreviewSelections[wardrobePickerTab?.key] === item.id;
                  return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${selected ? 'Remove' : 'Select'} ${item.name || wardrobePickerTab?.label}`} accessibilityState={{ selected }} style={[styles.wardrobePickerItem, layout.isTablet && styles.wardrobePickerItemTablet, selected && styles.wardrobePickerItemSelected]} onPress={() => chooseWardrobePreviewItem(item)}>
                    <ResilientImage source={item.imageUrl ? { uri: imageUrl(item.imageUrl) } : null} style={styles.wardrobePickerItemImage} resizeMode="contain" fallbackIcon="shirt-outline" />
                    <Text style={styles.wardrobePickerItemName} numberOfLines={2}>{item.name || wardrobePickerTab?.label}</Text>
                    {selected ? <Text style={styles.wardrobePickerItemStatus}>Tap to remove</Text> : null}
                  </Pressable>;
                })}
              </View> : <View style={styles.wardrobePickerEmpty}>
                <Ionicons name="shirt-outline" size={30} color="#8a7365" />
                <Text style={styles.wardrobePickerEmptyTitle}>No {wardrobePickerTab?.label?.toLowerCase()} saved yet</Text>
                <Text style={styles.wardrobePickerEmptyCopy}>Add a clothing photo to choose it for this look.</Text>
                <Pressable accessibilityRole="button" style={styles.wardrobePickerAddButton} onPress={() => { const type = wardrobePickerTab?.key; setWardrobePickerTab(null); onNavigate('closet', { view: 'add', type }); }}>
                  <Text style={styles.wardrobePickerAddText}>Add Item</Text>
                </Pressable>
              </View>}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </KeyboardAvoidingView>
  );
}

function fittedTryOnPhotoCardWidth(imageSize, cardHeight, rowWidth, gap) {
  const imageWidth = Number(imageSize?.width);
  const imageHeight = Number(imageSize?.height);
  const maxCardWidth = Math.floor((rowWidth - gap) / 2);
  if (!(imageWidth > 0 && imageHeight > 0 && cardHeight > 0 && maxCardWidth >= 140)) return null;
  const imageWidthAtCardHeight = Math.round(cardHeight * imageWidth / imageHeight);
  return imageWidthAtCardHeight < maxCardWidth - 8
    ? Math.max(140, imageWidthAtCardHeight)
    : null;
}

function CustomTryOnScreen({ user, setUser, setToken, token, onNavigate, onBack, refreshUser, initial = {} }) {
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [garment, setGarment] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const customRequestRef = useRef(false);
  const [lightbox, setLightbox] = useState(null);
  const [garmentImageSize, setGarmentImageSize] = useState(null);
  const [uploadRowWidth, setUploadRowWidth] = useState(0);
  const [actionDockHeight, setActionDockHeight] = useState(0);
  const latestCustom = useApiState('/tryons/custom/latest', token, Boolean(user), { tryOn: null });
  const wardrobe = useApiState('/closet', token, Boolean(user && initial.wardrobeItemId), { items: [] });
  const paymentPlans = useApiState('/payments/plans', token, Boolean(user), { costs: { imageTokens: defaultTryOnCreditCost } });

  useEffect(() => {
    if (!initial.wardrobeItemId) return;
    setGarment(null);
    setResult(null);
    if (wardrobe.loading) return;
    const selected = wardrobeGarmentForTryOn(wardrobe.data?.items, initial.wardrobeItemId, user);
    setGarment(selected);
    setMessage(selected ? '' : 'This wardrobe item is no longer available. Choose another garment.');
  }, [initial.wardrobeItemId, user?.id, user?._id, wardrobe.data, wardrobe.loading]);

  if (!user) return <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={onNavigate} />;

  const avatarUri = userAvatarUrl(user);
  const bodyProfileUri = user.bodyPhotoUrl ? imageUrl(user.bodyPhotoUrl) : '';
  const avatarProfileUri = avatarUri ? imageUrl(avatarUri) : '';
  const profilePreviewUri = bodyProfileUri || avatarProfileUri;
  const profilePreviewIsFullBody = Boolean(bodyProfileUri && isGeneratedFullBodySource(user.bodyPhotoSource));
  const profilePreviewResizeMode = profilePreviewIsFullBody ? 'contain' : userAvatarResizeMode(user);
  const profilePreviewImageStyle = profilePreviewIsFullBody ? null : avatarImageStyleForUser(user, 116);
  const profilePreviewBaseStyle = profilePreviewIsFullBody ? null : avatarImageBaseStyleForUser(user);
  const generatedUri = result?.imageUrl ? imageUrl(result.imageUrl) : '';
  const hasGenerated = Boolean(generatedUri);
  const hasGarment = Boolean(garment?.uri);
  const actionDockBottom = Math.max(insets.bottom - 10, 10) + 78;
  const latestCustomTryOn = latestCustom.data?.tryOn;
  const configuredTryOnCost = Number(paymentPlans.data?.costs?.imageTokens ?? paymentPlans.data?.creditCosts?.customTryOn);
  const customTryOnCreditCost = user.devMode
    ? 0
    : Number.isFinite(configuredTryOnCost) && configuredTryOnCost > 0
      ? Math.ceil(configuredTryOnCost)
      : defaultTryOnCreditCost;
  const customTryOnCostLabel = customTryOnCreditCost === 0
    ? 'Included'
    : `${customTryOnCreditCost} credit${customTryOnCreditCost === 1 ? '' : 's'}`;
  const customTextProps = { maxFontSizeMultiplier: 1.2 };
  const compactCustomTryOn = height < 640 && !layout.isTablet;
  const narrowCustomTryOn = layout.windowWidth < 340 && !layout.isTablet;
  const customInputHeight = layout.isTablet
    ? clamp(Math.round(height * 0.39), 400, 540)
    : Math.round(Math.min(236, Math.max(184, (layout.contentWidth - (narrowCustomTryOn ? 42 : 44)) * 0.67)));
  const currentGarmentImageSize = Number(garment?.width) > 0 && Number(garment?.height) > 0
    ? garment
    : garmentImageSize?.uri === garment?.uri ? garmentImageSize : null;
  const fittedPhotoCardWidth = garment?.uri
    ? fittedTryOnPhotoCardWidth(currentGarmentImageSize, customInputHeight, uploadRowWidth, layout.isTablet ? 18 : 10)
    : null;
  const fittedPhotoCardStyle = fittedPhotoCardWidth ? { flex: 0, width: fittedPhotoCardWidth } : null;
  const customResultHeight = hasGenerated
    ? layout.isTablet
      ? clamp(Math.round(height * 0.45), 440, 600)
      : compactCustomTryOn ? 300 : 388
    : layout.isTablet ? clamp(Math.round(height * 0.22), 250, 310) : compactCustomTryOn ? 108 : 120;

  useEffect(() => {
    if (initial.wardrobeItemId || garment || result || loading || !latestCustomTryOn?.imageUrl) return;
    setResult(latestCustomTryOn);
  }, [initial.wardrobeItemId, garment, latestCustomTryOn, loading, result]);

  const chooseGarment = async () => {
    const selected = await pickImage();
    if (!selected) return;
    setGarment(selected);
    setResult(null);
    setMessage('');
  };

  const submit = async () => {
    if (customRequestRef.current) return;
    if (!garment?.uri) {
      setMessage('Upload a clothing photo first.');
      return;
    }
    const profileMessage = tryOnProfileBlockMessage(user);
    if (profileMessage) {
      setMessage(profileMessage);
      return;
    }
    customRequestRef.current = true;
    setLoading(true);
    setMessage(hasGenerated ? 'Regenerating custom try-on...' : 'Generating custom try-on...');
    try {
      const form = new FormData();
      form.append('garment', filePart(garment, 'garment.jpg'));
      const data = await api('/tryons/custom', { method: 'POST', body: form, timeoutMs: aiTryOnRequestTimeoutMs, jobTimeoutMs: aiTryOnJobTimeoutMs });
      const nextTryOn = requireGeneratedImage(data.tryOn);
      setResult(nextTryOn);
      if (data.user) {
        setUser(data.user);
      }
      refreshUser?.().catch(() => {});
      latestCustom.reload?.();
      setMessage('Custom try-on ready.');
    } catch (error) {
      setMessage(customGarmentErrorMessage(error));
    } finally {
      customRequestRef.current = false;
      setLoading(false);
    }
  };

  const generateButton = (
    <>
      {message || !hasGarment ? (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole={message ? 'alert' : undefined}
          style={[styles.customActionMessage, message && !/ready|generating|regenerating/i.test(message) ? styles.errorText : null]}
          {...customTextProps}
        >
          {message || (hasGenerated ? 'Upload a garment photo to create another look.' : 'Choose a garment photo to get started.')}
        </Text>
      ) : null}
      <AppButton
        label={loading ? (hasGenerated ? 'Regenerating…' : 'Creating your look…') : !hasGarment ? 'Upload garment photo' : hasGenerated ? `Regenerate My Look · ${customTryOnCostLabel}` : `Generate My Look · ${customTryOnCostLabel}`}
        icon={hasGarment ? 'sparkles-outline' : 'cloud-upload-outline'}
        disabled={loading}
        onPress={hasGarment ? submit : chooseGarment}
        style={[styles.customGenerateButton, layout.isTablet && styles.customGenerateButtonTablet]}
        labelProps={{
          adjustsFontSizeToFit: Platform.OS === 'ios',
          maxFontSizeMultiplier: 1.2,
          minimumFontScale: 0.85,
          numberOfLines: 1
        }}
      />
    </>
  );

  return (
    <View style={styles.customTryOnScreen}>
      <ScrollView style={styles.customTryOnScroll} contentContainerStyle={[styles.customTryOnContent, compactCustomTryOn && styles.customTryOnContentCompact, layout.isTablet ? styles.customTryOnContentTablet : { paddingBottom: actionDockBottom + actionDockHeight + 16 }]} {...screenScrollProps}>
        <PageBackRow onBack={onBack} />
        <View style={[styles.customHeroPanel, compactCustomTryOn && styles.customHeroPanelCompact, layout.isTablet && styles.customHeroPanelTablet]}>
          <View style={styles.customHeroMetaRow}>
            <Text style={styles.customHeroEyebrow} {...customTextProps}>AI FITTING STUDIO</Text>
            <View style={styles.customTokenPill}>
              <Ionicons name="sparkles" size={12} color="#9b5658" />
              <Text style={styles.customTokenText} {...customTextProps}>{customTryOnCostLabel}</Text>
            </View>
          </View>
          <Text style={[styles.customHeroTitle, compactCustomTryOn && styles.customHeroTitleCompact, layout.isTablet && styles.customHeroTitleTablet]} {...customTextProps}>Your look, reimagined.</Text>
          <Text style={[styles.customHeroDescription, compactCustomTryOn && styles.customHeroDescriptionCompact, layout.isTablet && styles.customHeroDescriptionTablet]} {...customTextProps}>Upload a garment and see how it looks on you.</Text>
        </View>


        <View style={[styles.customUploadRow, compactCustomTryOn && styles.customUploadRowCompact, layout.isTablet && styles.customUploadRowTablet]} onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setUploadRowWidth((current) => current === width ? current : width);
        }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View saved profile photo"
            disabled={!profilePreviewUri}
            style={[styles.customProfileCard, { height: customInputHeight }, fittedPhotoCardStyle]}
            onPress={() => profilePreviewUri && setLightbox(profilePreviewUri)}
          >
            {profilePreviewUri ? (
              <ResilientImage source={{ uri: profilePreviewUri }} style={styles.customProfileImage} imageStyle={profilePreviewImageStyle} imageBaseStyle={profilePreviewBaseStyle} resizeMode={profilePreviewResizeMode} backdropBlurRadius={profilePreviewIsFullBody ? 28 : 0} fallbackIcon="person-outline" />
            ) : (
              <View style={styles.customProfileEmpty}>
                <Ionicons name="person-outline" size={24} color="#8d8682" />
                <Text style={styles.customProfileEmptyText} {...customTextProps}>Add a photo in Profile</Text>
              </View>
            )}
            <View style={styles.customCardBadge}>
              <Text style={styles.customCardBadgeText} {...customTextProps}>YOUR PROFILE</Text>
            </View>
            {!profilePreviewIsFullBody ? <View style={styles.customProfileCaption}>
              <Text style={styles.customProfileLabel} {...customTextProps}>{profilePreviewUri ? (profilePreviewIsFullBody ? 'Full-body profile' : 'Profile photo') : 'Profile required'}</Text>
              <Text style={styles.customProfileSub} numberOfLines={1} {...customTextProps}>{profilePreviewUri ? (user.bodyPhotoStatus === 'generating' ? 'Preparing' : 'Saved') : 'Add in Profile'}</Text>
            </View> : null}
          </Pressable>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={garment?.uri ? 'Change garment photo' : 'Upload garment photo'}
            style={[styles.customGarmentDrop, { height: customInputHeight }, garment?.uri && styles.customGarmentDropReady, fittedPhotoCardStyle]}
            activeOpacity={0.86}
            accessibilityState={{ disabled: loading }}
            disabled={loading}
            onPress={chooseGarment}
          >
            {garment?.uri ? (
              <>
                <ResilientImage source={{ uri: garment.uri }} style={styles.customGarmentImage} resizeMode="contain" backdropBlurRadius={fittedPhotoCardWidth ? 0 : 28} onImageLoad={(source) => {
                  if (!source?.width || !source?.height) return;
                  setGarmentImageSize((current) => current?.uri === garment.uri && current?.width === source.width && current?.height === source.height
                    ? current
                    : { uri: garment.uri, width: source.width, height: source.height });
                }} />
                <View style={styles.customCardBadge}>
                  <Text style={styles.customCardBadgeText} {...customTextProps}>CHANGE GARMENT</Text>
                </View>
              </>
            ) : (
              <View style={styles.customGarmentCopy}>
                <View style={styles.customGarmentIcon}>
                  <Ionicons name="cloud-upload-outline" size={24} color="#9b5658" />
                </View>
                <Text style={styles.customGarmentTitle} {...customTextProps}>Upload garment</Text>
                <Text style={styles.customGarmentHelp} {...customTextProps}>Use a clear photo showing the clothing you want to try.</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.customResultCard}>
          <View style={styles.customResultHead}>
            <View style={styles.customResultCopy}>
              <Text style={styles.customResultTitle} {...customTextProps}>Your styled preview</Text>
              <Text style={styles.customResultSub} numberOfLines={2} {...customTextProps}>{hasGenerated ? 'Tap the image to view it full screen.' : loading ? 'Creating your AI try-on…' : 'Your generated look will appear here.'}</Text>
            </View>
            {hasGenerated ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open generated look full screen" style={styles.customResultOpen} onPress={() => setLightbox(generatedUri)}>
                <Ionicons name="expand-outline" size={16} color="#111111" />
              </TouchableOpacity>
            ) : null}
          </View>
          <Pressable accessibilityRole={hasGenerated ? 'button' : undefined} accessibilityLabel={hasGenerated ? 'Open generated look full screen' : undefined} disabled={!hasGenerated} style={[styles.customResultFrame, { minHeight: customResultHeight }]} onPress={() => hasGenerated && setLightbox(generatedUri)}>
            {hasGenerated ? (
              <ResilientImage
                source={{ uri: generatedUri }}
                style={[styles.customResultImage, { height: customResultHeight }]}
                resizeMode="contain"
                fallbackIcon="alert-circle-outline"
                fallbackText="Result unavailable. Generate again."
              />
            ) : null}
            {loading ? (
              <View style={[styles.customResultState, hasGenerated && styles.customResultStateOverlay]}>
                <TryOnLoading text={hasGenerated ? 'Regenerating' : 'Generating'} large />
              </View>
            ) : !hasGenerated ? (
              <View style={styles.customResultState}>
                <View style={styles.customResultIcon}>
                  <Ionicons name="sparkles-outline" size={22} color="#9b5658" />
                </View>
                <Text style={styles.customResultPlaceholder} {...customTextProps}>Ready when you are</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {hasGenerated ? <AiPreviewNote style={styles.customAiPreviewNote} content={reportContentReference(result, 'custom_tryon')} /> : null}
        {layout.isTablet ? <View style={styles.customActionInlineTablet}>{generateButton}</View> : null}
      </ScrollView>
      {!layout.isTablet ? <View onLayout={(event) => setActionDockHeight(event.nativeEvent.layout.height)} style={[styles.customActionDock, { bottom: actionDockBottom }]}>{generateButton}</View> : null}
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </View>
  );
}

function StyleBotScreen({
  user,
  setUser = () => {},
  setToken = () => {},
  token,
  onNavigate,
  onBack,
  registerTourTarget,
  tourFocusRequest,
  aiStudioConversationId = '',
  setAiStudioConversationId = () => {},
  aiStudioMessages = [],
  setAiStudioMessages = () => {},
  aiStudioActiveChatId = '',
  setAiStudioActiveChatId = () => {},
  aiStudioChatHistory = [],
  setAiStudioChatHistory = () => {},
  aiStudioTryOns = {},
  setAiStudioTryOns = () => {},
  aiStudioTryOnErrors = {},
  setAiStudioTryOnErrors = () => {}
}) {
  const { width } = useWindowDimensions();
  const isTabletLayout = width >= 700;
  const conversationInset = isTabletLayout ? Math.max(32, (width - 920) / 2) : 16;
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [composerHeight, setComposerHeight] = useState(66);
  const [chatTryOnLoading, setChatTryOnLoading] = useState({});
  const [lightbox, setLightbox] = useState(null);
  const scrollRef = useRef(null);
  const requestInFlightRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const userScrollingRef = useRef(false);
  const composerBottom = useRef(new Animated.Value(Platform.OS === 'ios' ? 10 : 14)).current;
  const composerTourTarget = useTourTarget('ai-studio-composer', registerTourTarget, { request: tourFocusRequest, scrollOffset: 84 });
  const messages = aiStudioMessages?.length ? aiStudioMessages : initialAiStudioMessages(user);
  const setMessages = setAiStudioMessages;
  const hasUserMessages = aiStudioHasUserMessages(messages);
  const chatTryOns = aiStudioTryOns || {};
  const setChatTryOns = setAiStudioTryOns;
  const chatTryOnErrors = aiStudioTryOnErrors || {};
  const setChatTryOnErrors = setAiStudioTryOnErrors;
  const drawerWidth = Math.min(Math.max(width * 0.82, 286), 340);
  const currentChatId = aiStudioActiveChatId || aiStudioConversationId || '';
  const currentDrawerChat = hasUserMessages
    ? {
      id: currentChatId || 'current-chat',
      title: aiStudioChatTitle(messages),
      current: true
    }
    : null;
  const drawerChats = [
    ...(currentDrawerChat ? [currentDrawerChat] : []),
    ...(aiStudioChatHistory || []).filter((chat) => chat.id !== currentDrawerChat?.id)
  ];

  const archiveCurrentChat = useCallback(() => {
    const record = createAiStudioChatRecord({
      id: aiStudioActiveChatId || aiStudioConversationId,
      conversationId: aiStudioConversationId,
      messages,
      tryOns: chatTryOns,
      tryOnErrors: chatTryOnErrors
    });
    if (!record) return null;
    setAiStudioChatHistory((current) => mergeAiStudioChatHistory(current, record));
    return record;
  }, [aiStudioActiveChatId, aiStudioConversationId, chatTryOnErrors, chatTryOns, messages, setAiStudioChatHistory]);

  const startNewChat = useCallback(() => {
    archiveCurrentChat();
    setAiStudioActiveChatId(`chat-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setAiStudioConversationId('');
    setMessages(initialAiStudioMessages(user));
    setChatTryOns({});
    setChatTryOnErrors({});
    setQuery('');
    setHistoryOpen(false);
  }, [archiveCurrentChat, setAiStudioActiveChatId, setAiStudioConversationId, setChatTryOnErrors, setChatTryOns, setMessages, user]);

  const openHistoryChat = useCallback((chat) => {
    if (!chat?.id) return;
    if (chat.current || chat.id === currentChatId) {
      setHistoryOpen(false);
      return;
    }
    archiveCurrentChat();
    setAiStudioActiveChatId(chat.id);
    setAiStudioConversationId(chat.conversationId || '');
    setMessages(Array.isArray(chat.messages) && chat.messages.length ? chat.messages : initialAiStudioMessages(user));
    setChatTryOns(chat.tryOns || {});
    setChatTryOnErrors(chat.tryOnErrors || {});
    setQuery('');
    setHistoryOpen(false);
  }, [archiveCurrentChat, currentChatId, setAiStudioActiveChatId, setAiStudioConversationId, setChatTryOnErrors, setChatTryOns, setMessages, user]);

  useEffect(() => {
    const baseBottom = Platform.OS === 'ios' ? 10 : 14;
    const keyboardGap = 8;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    let scrollTimer;
    const updateForKeyboard = (event) => {
      const keyboardHeight = Math.max(0, event?.endCoordinates?.height || 0);
      if (Platform.OS === 'ios') setKeyboardInset(keyboardHeight);
      Animated.timing(composerBottom, {
        // Android adjustResize has already moved the screen above the keyboard.
        toValue: Platform.OS === 'android' ? baseBottom : keyboardHeight + keyboardGap,
        duration: event?.duration || 220,
        useNativeDriver: false
      }).start();
      if (shouldAutoScrollRef.current) {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), (event?.duration || 220) + 40);
      }
    };
    const showSub = Keyboard.addListener(showEvent, updateForKeyboard);
    const frameSub = Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillChangeFrame', updateForKeyboard) : null;
    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      if (Platform.OS === 'ios') setKeyboardInset(0);
      Animated.timing(composerBottom, {
        toValue: baseBottom,
        duration: event?.duration || 180,
        useNativeDriver: false
      }).start();
    });
    return () => {
      clearTimeout(scrollTimer);
      showSub.remove();
      frameSub?.remove();
      hideSub.remove();
    };
  }, [composerBottom]);

  const submit = async (preset, requestOptions = {}) => {
    const prompt = String(preset || query || '').trim();
    if (!prompt || requestInFlightRef.current) return;
    const retryMessageId = String(requestOptions.retryMessageId || '');
    const retryUserMessageId = String(requestOptions.retryUserMessageId || '');
    const retrying = Boolean(retryMessageId);
    if (!aiStudioActiveChatId) {
      setAiStudioActiveChatId(`chat-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    }
    const requestId = retryMessageId || `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const userMessageId = retryUserMessageId || `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const userMessage = { id: userMessageId, role: 'user', text: prompt, requestId };
    const loadingMessage = {
      id: requestId,
      role: 'assistant',
      text: 'Your stylist is putting ideas together…',
      loading: true,
      error: false,
      requestStatus: 'loading',
      retryPrompt: prompt,
      userMessageId
    };

    setQuery('');
    Keyboard.dismiss();
    requestInFlightRef.current = true;
    shouldAutoScrollRef.current = true;
    userScrollingRef.current = false;
    setBusy(true);
    setMessages((current) => retrying
      ? current.map((message) => message.id === requestId ? { ...message, ...loadingMessage } : message)
      : [...current, userMessage, loadingMessage]);

    try {
      const requestHistory = messages
        .filter((message) => !message.loading && !message.error && message.id !== retryUserMessageId)
        .slice(-8)
        .map((message) => ({ role: message.role, text: message.text }));
      const data = await api('/recommendations/studio-chat', {
        method: 'POST',
        headers: { 'x-fitlook-sync': '1' },
        timeoutMs: 70000,
        body: JSON.stringify({
          message: prompt,
          catalogOnly: true,
          conversationId: aiStudioConversationId || '',
          history: requestHistory
        })
      });
      const outfits = normalizeAiStudioOutfits(data.outfits || []);
      const products = normalizeAiStudioProducts(data.products || [], outfits);
      const actions = normalizeAiStudioActions(data);
      if (!String(data.reply || '').trim() && !products.length && !outfits.length && !actions.length) {
        throw new Error('Empty AI stylist response');
      }
      if (data.conversationId) setAiStudioConversationId(data.conversationId);
      setMessages((current) => current.map((message) => (
        message.id === requestId
          ? {
            ...message,
            text: stylistResponseText(data.reply || 'I found a few directions for you.'),
            products,
            outfits,
            actions,
            suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
            reportableContent: reportContentReference(data.reportableContent, 'stylist_message'),
            mode: data.mode || '',
            intent: data.intent || '',
            loading: false,
            error: false,
            requestStatus: 'succeeded',
            retryPrompt: ''
          }
          : message
      )));
    } catch (error) {
      const messageText = aiStudioErrorMessage(error);
      setMessages((current) => current.map((message) => (
        message.id === requestId
          ? { ...message, text: messageText, error: true, loading: false, requestStatus: 'failed', retryPrompt: prompt, userMessageId }
          : message
      )));
    } finally {
      requestInFlightRef.current = false;
      setBusy(false);
    }
  };

  const generateChatTryOn = async (product, stateKey) => {
    const key = stateKey || chatProductKey(product);
    if (!product || product.searchLink || product.tryOnAvailable === false || product.aiTryOnAvailable === false || chatTryOnLoading[key]) return;
    const profileMessage = tryOnProfileBlockMessage(user);
    if (profileMessage) {
      setChatTryOnErrors((current) => ({ ...current, [key]: profileMessage }));
      return;
    }
    setChatTryOnLoading((current) => ({ ...current, [key]: true }));
    setChatTryOnErrors((current) => ({ ...current, [key]: '' }));
    try {
      const isExternalProduct = isOnlineAiStudioProduct(product);
      const regenerate = Boolean(chatTryOns[key]?.imageUrl);
      const data = await api(isExternalProduct ? '/tryons/external' : `/tryons/${product.id}`, {
        method: 'POST',
        timeoutMs: aiTryOnRequestTimeoutMs,
        jobTimeoutMs: aiTryOnJobTimeoutMs,
        body: JSON.stringify(isExternalProduct ? { product, force: regenerate } : { force: regenerate })
      });
      requireGeneratedImage(data.tryOn);
      setChatTryOns((current) => ({ ...current, [key]: data.tryOn }));
      if (regenerate && data.reused) {
        setChatTryOnErrors((current) => ({ ...current, [key]: 'Your previous AI look was returned. A new look was not confirmed.' }));
      }
      if (data.user) setUser(data.user);
    } catch (error) {
      setChatTryOnErrors((current) => ({ ...current, [key]: aiFeatureErrorMessage(error, 'Could not generate try-on.') }));
    } finally {
      setChatTryOnLoading((current) => ({ ...current, [key]: false }));
    }
  };

  const lastMessage = messages[messages.length - 1];
  const lastMessageScrollKey = `${messages.length}:${lastMessage?.id || ''}:${lastMessage?.loading ? 'loading' : 'settled'}:${String(lastMessage?.text || '').length}`;

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return undefined;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [lastMessageScrollKey]);

  const handleConversationScroll = useCallback((event) => {
    if (!userScrollingRef.current) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    shouldAutoScrollRef.current = distanceFromBottom < 120;
  }, []);

  const scrollToLatest = useCallback(() => {
    if (shouldAutoScrollRef.current) scrollRef.current?.scrollToEnd?.({ animated: true });
  }, []);

  useEffect(() => {
    if (user && !aiStudioMessages?.length) setMessages(initialAiStudioMessages(user));
  }, [aiStudioMessages?.length, setMessages, user?.id, user?._id, user?.phone]);

  if (!user) return <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={onNavigate} />;

  const tabletChatToolbar = isTabletLayout ? (
    <View style={[styles.aiStudioToolbarTablet, hasUserMessages && styles.aiStudioToolbarActiveTablet]}>
      <View style={styles.aiStudioToolbarLeading}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to previous page" style={styles.aiStudioBackButton} activeOpacity={0.82} onPress={() => onBack ? onBack() : onNavigate('home')}>
          <Ionicons name="chevron-back" size={19} color="#3b3531" />
          <Text style={styles.aiStudioBackButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.aiStudioToolbarLabel}>AI STYLIST</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open chat history" style={styles.aiStudioHistoryButtonTablet} activeOpacity={0.82} onPress={() => setHistoryOpen(true)}>
        <Ionicons name="chatbubbles-outline" size={18} color="#3b3531" />
        <Text style={styles.aiStudioHistoryButtonText}>Chats</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <View style={styles.aiStudioScreen}>
      <ProductTopBar onNavigate={onNavigate} user={user} preserveWordmarkOnNarrow>
        {!isTabletLayout ? (
          <View style={styles.aiStudioMobileToolbar}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to previous page" style={styles.aiStudioBackButton} activeOpacity={0.82} onPress={() => onBack ? onBack() : onNavigate('home')}>
              <Ionicons name="chevron-back" size={19} color="#3b3531" />
              <Text style={styles.aiStudioBackButtonText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.aiStudioMenuButton} activeOpacity={0.84} accessibilityLabel="Open chat history" onPress={() => setHistoryOpen(true)}>
              <Ionicons name="menu-outline" size={22} color="#252221" />
            </TouchableOpacity>
          </View>
        ) : null}
      </ProductTopBar>
      {isTabletLayout && hasUserMessages ? <View style={[styles.aiStudioToolbarDockTablet, { width: width - 64 }]}>{tabletChatToolbar}</View> : null}
      <Modal visible={historyOpen} transparent animationType="fade" onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.aiHistoryModal}>
          <Pressable accessible={false} importantForAccessibility="no" style={styles.aiHistoryBackdrop} onPress={() => setHistoryOpen(false)} />
          <View style={[styles.aiHistoryDrawer, { width: drawerWidth }]}>
            <View style={styles.aiHistoryHeader}>
              <Text style={styles.aiHistoryTitle}>Chats</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close chat history" style={styles.aiHistoryCloseButton} activeOpacity={0.82} onPress={() => setHistoryOpen(false)}>
                <DecorativeCloseIcon size={19} color="#625b57" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.aiHistoryNewButton} activeOpacity={0.86} onPress={startNewChat}>
              <Ionicons name="create-outline" size={17} color="#ffffff" />
              <Text style={styles.aiHistoryNewText}>New chat</Text>
            </TouchableOpacity>
            <Text style={styles.aiHistorySectionLabel}>Chat history</Text>
            <ScrollView style={styles.aiHistoryList} contentContainerStyle={styles.aiHistoryListContent} showsVerticalScrollIndicator>
              {drawerChats.length ? drawerChats.map((chat) => {
                const active = chat.current || chat.id === currentChatId;
                return (
                  <TouchableOpacity key={chat.id} style={[styles.aiHistoryItem, active && styles.aiHistoryItemActive]} activeOpacity={0.84} onPress={() => openHistoryChat(chat)}>
                    <Ionicons name={active ? 'chatbubble' : 'chatbubble-outline'} size={15} color={active ? '#9b5658' : '#8a7e78'} />
                    <Text style={[styles.aiHistoryItemText, active && styles.aiHistoryItemTextActive]} numberOfLines={2}>{chat.title}</Text>
                  </TouchableOpacity>
                );
              }) : (
                <Text style={styles.aiHistoryEmpty}>No previous chats yet.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <ScrollView
        ref={scrollRef}
        style={styles.aiStudioScroll}
        contentContainerStyle={[styles.aiStudioContent, isTabletLayout && styles.aiStudioContentTablet, !hasUserMessages && isTabletLayout && styles.aiStudioContentWelcome, Platform.OS === 'ios' && keyboardInset > 0 && { paddingBottom: keyboardInset + composerHeight + 20 }]}
        {...screenScrollProps}
        showsVerticalScrollIndicator={hasUserMessages}
        onScroll={handleConversationScroll}
        onScrollBeginDrag={() => { userScrollingRef.current = true; }}
        onScrollEndDrag={(event) => { handleConversationScroll(event); userScrollingRef.current = false; }}
        onMomentumScrollBegin={() => { userScrollingRef.current = true; }}
        onMomentumScrollEnd={(event) => { handleConversationScroll(event); userScrollingRef.current = false; }}
        onContentSizeChange={scrollToLatest}
        onLayout={scrollToLatest}
      >
        <View style={[styles.aiStudioConversation, !hasUserMessages && isTabletLayout && styles.aiStudioWelcomePanel]}>
        {!hasUserMessages ? tabletChatToolbar : null}
        {!hasUserMessages ? (
          <View style={styles.aiStudioHero}>
            <View style={styles.aiStudioHeroCopy}>
              <Text style={styles.aiStudioHeroLabel}>YOUR PERSONAL AI STYLIST</Text>
              <Text style={[styles.aiStudioHeroTitle, isTabletLayout && !hasUserMessages && styles.aiStudioHeroTitleTablet]}>What are we styling today?</Text>
              <Text style={[styles.aiStudioHeroText, isTabletLayout && !hasUserMessages && styles.aiStudioHeroTextTablet]}>Discover pieces, explore styles, and find what feels like you.</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.aiChatThread}>
          {messages.map((message, index) => {
            const userBubble = message.role === 'user';
            const introBubble = !hasUserMessages && !userBubble && index === 0;
            return (
              <View key={message.id} style={styles.aiMessageBlock}>
                <View style={[styles.aiMessageBubble, userBubble ? styles.aiMessageBubbleUser : styles.aiMessageBubbleAssistant, introBubble && styles.aiMessageBubbleIntro, message.error && styles.aiMessageBubbleError]}>
                  {message.loading ? <ActivityIndicator size="small" color="#9b5658" /> : null}
                  {message.error ? <Ionicons name="alert-circle-outline" size={18} color="#7b6258" style={styles.aiMessageErrorIcon} /> : null}
                  <Text style={[styles.aiMessageText, introBubble && styles.aiMessageTextIntro, introBubble && isTabletLayout && styles.aiMessageTextIntroTablet, userBubble && styles.aiMessageTextUser, message.error && styles.aiMessageTextError]}>{introBubble ? aiStudioWelcomeText(user) : userBubble ? message.text : stylistResponseText(message.text)}</Text>
                </View>
                {!userBubble && !introBubble && !message.loading && !message.error && message.reportableContent ? <ReportContentAction content={message.reportableContent} /> : null}
                {message.error && message.retryPrompt ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Retry stylist request"
                    activeOpacity={0.78}
                    disabled={busy}
                    onPress={() => {
                      const precedingUser = [...messages.slice(0, index)].reverse().find((item) => item.role === 'user');
                      submit(message.retryPrompt, {
                        retryMessageId: message.id,
                        retryUserMessageId: message.userMessageId || precedingUser?.id || ''
                      });
                    }}
                    style={[styles.aiRetryButton, busy && styles.disabledButton]}
                  >
                    <Ionicons name="refresh-outline" size={15} color="#5f5853" />
                    <Text style={styles.aiRetryButtonText}>Retry</Text>
                  </TouchableOpacity>
                ) : null}
                {message.products?.some((product) => !isOnlineAiStudioProduct(product)) ? (
                  <View>
                    <ScrollView {...horizontalScrollProps} contentContainerStyle={styles.aiSuggestionProductsTrack}>
                      {message.products.filter((product) => !isOnlineAiStudioProduct(product)).map((product) => {
                        const key = chatTryOnStateKey(message.id, product);
                        const tryOnEnabled = !product.searchLink
                          && product.tryOnAvailable !== false
                          && product.aiTryOnAvailable !== false
                          && Boolean(product.imageUrl || product.remoteImageUrl || product.thumbnail);
                        const tryOn = tryOnEnabled ? chatTryOns[key] : null;
                        const previewUri = productImageSource(product, tryOn)?.uri;
                        return (
                          <ConciergeSuggestionCard
                            key={key}
                            product={product}
                            actionLabel={tryOnEnabled ? (tryOn?.imageUrl ? 'Generate Again' : 'Generate Try-On') : 'View product'}
                            tryOn={tryOn}
                            tryOnLoading={tryOnEnabled && Boolean(chatTryOnLoading[key])}
                            tryOnError={tryOnEnabled ? chatTryOnErrors[key] : ''}
                            onPreview={previewUri ? () => setLightbox(previewUri) : null}
                            onOpenProduct={() => onNavigate('product', { id: product.id })}
                            onShop={() => onNavigate('product', { id: product.id })}
                            onTryOn={tryOnEnabled ? () => generateChatTryOn(product, key) : undefined}
                          />
                        );
                      })}
                    </ScrollView>
                    {message.products.some((product) => {
                      const key = chatTryOnStateKey(message.id, product);
                      return !isOnlineAiStudioProduct(product) && Boolean(chatTryOns[key]?.imageUrl);
                    }) ? <AiPreviewNote style={styles.aiStudioPreviewNote} /> : null}
                  </View>
                ) : null}
                {message.outfits?.length ? (
                  <View style={styles.aiOutfitList}>
                    {message.outfits.map((outfit) => <AiStudioOutfitCard key={outfit.id} outfit={outfit} />)}
                  </View>
                ) : null}
                {message.actions?.length ? (
                  <View style={styles.aiFollowUpRow}>
                    {message.actions.filter((action) => !/amazon|online|web/i.test(`${action.type || ''} ${action.label || ''} ${action.prompt || ''}`)).map((action) => (
                      <TouchableOpacity
                        key={`${message.id}-${action.type}-${action.label}`}
                        style={[styles.aiFollowUpChip, (action.disabled || busy) && styles.disabledButton]}
                        activeOpacity={0.82}
                        disabled={action.disabled || busy}
                        onPress={() => submit(action.prompt || action.label)}
                      >
                        <Text style={styles.aiFollowUpText}>{action.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                {!message.actions?.length && message.suggestions?.length ? (
                  <View style={styles.aiFollowUpRow}>
                    {message.suggestions.map((suggestion) => (
                      <TouchableOpacity key={suggestion} style={[styles.aiFollowUpChip, busy && styles.disabledButton]} activeOpacity={0.82} disabled={busy} onPress={() => submit(suggestion)}>
                        <Text style={styles.aiFollowUpText}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {!hasUserMessages ? (
          <View style={styles.aiStarterPanel}>
            <Text style={styles.aiStarterTitle}>Explore a style</Text>
            {isTabletLayout ? (
              <View style={styles.aiStarterGridTablet}>
                {aiStudioStarterPrompts.map((starter) => (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ask your stylist about ${starter.title}`} key={starter.prompt} style={styles.aiStarterCardTablet} activeOpacity={0.76} disabled={busy} onPress={() => submit(starter.prompt)}>
                    <View style={styles.aiStarterIconTablet}><Ionicons name={starter.icon} size={23} color="#9b5658" /></View>
                    <Text style={styles.aiStarterCardTitleTablet}>{starter.title}</Text>
                    <Text style={styles.aiStarterCardTextTablet}>{starter.text}</Text>
                    <Ionicons name="arrow-forward-outline" size={18} color="#625b57" style={styles.aiStarterArrowTablet} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <ScrollView {...horizontalScrollProps} contentContainerStyle={styles.aiStarterGrid}>
                {aiStudioStarterPrompts.map((starter) => (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Ask your stylist about ${starter.title}`} key={starter.prompt} style={styles.aiStarterCard} activeOpacity={0.76} disabled={busy} onPress={() => submit(starter.prompt)}>
                    <Text style={styles.aiStarterCardTitle} numberOfLines={1}>{starter.title}</Text>
                    <Ionicons name="arrow-up-outline" size={14} color="#625b57" style={styles.aiStarterArrow} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
        </View>
      </ScrollView>

      <Animated.View ref={composerTourTarget.ref} onLayout={(event) => { composerTourTarget.onLayout(event); setComposerHeight(event.nativeEvent.layout.height); }} style={[styles.aiComposer, isTabletLayout && styles.aiComposerTablet, { left: conversationInset, right: conversationInset, bottom: composerBottom }, composerFocused && styles.aiComposerFocused]}>
        <TextInput accessibilityLabel="Message your AI stylist" style={[styles.aiComposerInput, isTabletLayout && styles.aiComposerInputTablet]} value={query} onChangeText={setQuery} onFocus={() => { setComposerFocused(true); shouldAutoScrollRef.current = true; }} onBlur={() => setComposerFocused(false)} placeholder="Ask your stylist anything..." placeholderTextColor="#77716c" returnKeyType="send" onSubmitEditing={() => submit()} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send message" style={[styles.aiSendButton, isTabletLayout && styles.aiSendButtonTablet, !busy && !query.trim() && styles.aiSendButtonDisabled]} disabled={!query.trim() || busy} onPress={() => submit()}>
          <Ionicons name={busy ? 'hourglass-outline' : 'send'} size={22} color={!busy && !query.trim() ? '#625c56' : '#ffffff'} />
        </TouchableOpacity>
      </Animated.View>
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </View>
  );
}

const fallbackSubscriptionPlan = {
  id: 'monthly_150_credits',
  type: 'subscription',
  purchaseType: 'subscription_setup',
  name: 'FitLook Monthly',
  headline: '150 credits every month',
  amount: 49900,
  currency: 'INR',
  tokens: 150,
  credits: 150,
  billingFrequency: 'monthly',
  cadence: 'Monthly',
  ratePerCredit: 3.33,
  appStoreProductId: STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_ID,
  description: '150 credits every month for AI try-on images, videos, and styling work.',
  summary: 'Cancel future monthly billing before the next renewal from your account or by contacting support.'
};

const fallbackTopUpPlans = [
  { id: 'top_up_50_credits', type: 'top_up', name: 'Top-up', headline: '50 credits', amount: 19900, currency: 'INR', tokens: 50, credits: 50, billingFrequency: 'one_time', cadence: 'One-time', ratePerCredit: 3.98, appStoreProductId: STOREKIT_CREDIT_TOP_UP_PRODUCT_IDS_BY_PLAN_ID.top_up_50_credits, description: 'One-time refill for extra image try-ons and videos.' },
  { id: 'top_up_75_credits', type: 'top_up', name: 'Top-up', headline: '75 credits', amount: 29900, currency: 'INR', tokens: 75, credits: 75, billingFrequency: 'one_time', cadence: 'One-time', ratePerCredit: 3.99, appStoreProductId: STOREKIT_CREDIT_TOP_UP_PRODUCT_IDS_BY_PLAN_ID.top_up_75_credits, description: 'One-time refill for extra image try-ons and videos.' },
  { id: 'top_up_110_credits', type: 'top_up', name: 'Top-up', headline: '110 credits', amount: 39900, currency: 'INR', tokens: 110, credits: 110, billingFrequency: 'one_time', cadence: 'One-time', ratePerCredit: 3.63, appStoreProductId: STOREKIT_CREDIT_TOP_UP_PRODUCT_IDS_BY_PLAN_ID.top_up_110_credits, description: 'Better value for product batches and style exploration.' },
  { id: 'top_up_135_credits', type: 'top_up', name: 'Top-up', headline: '135 credits', amount: 49900, currency: 'INR', tokens: 135, credits: 135, billingFrequency: 'one_time', cadence: 'One-time', ratePerCredit: 3.7, appStoreProductId: STOREKIT_CREDIT_TOP_UP_PRODUCT_IDS_BY_PLAN_ID.top_up_135_credits, description: 'Better value for product batches and style exploration.' },
  { id: 'top_up_400_credits', type: 'top_up', name: 'Top-up', headline: '400 credits', amount: 99900, currency: 'INR', tokens: 400, credits: 400, billingFrequency: 'one_time', cadence: 'One-time', ratePerCredit: 2.5, appStoreProductId: STOREKIT_CREDIT_TOP_UP_PRODUCT_IDS_BY_PLAN_ID.top_up_400_credits, badge: 'Best value', description: 'Best value for bulk catalog work and repeated video trials.' }
];

const fallbackPaymentCatalog = {
  subscription: fallbackSubscriptionPlan,
  topUps: fallbackTopUpPlans,
  appStoreProductIds: {
    monthlySubscription: STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_ID,
    creditTopUps: STOREKIT_CREDIT_TOP_UP_PRODUCT_IDS_BY_PLAN_ID
  },
  creditCosts: { starterCredits: 8, image: 1, customTryOn: 1, video: 3 }
};

function normalizePaymentPlan(plan = {}, fallback = {}) {
  const amount = Number(plan.amount ?? fallback.amount) || 0;
  const credits = Number(plan.credits ?? plan.tokens ?? fallback.credits ?? fallback.tokens) || 0;
  const rate = Number(plan.ratePerCredit ?? fallback.ratePerCredit);
  return {
    ...fallback,
    ...plan,
    amount,
    tokens: credits,
    credits,
    currency: plan.currency || fallback.currency || 'INR',
    ratePerCredit: Number.isFinite(rate) && rate > 0 ? rate : Number((amount / 100 / Math.max(1, credits)).toFixed(2))
  };
}

function PaymentSummaryLine({ label, value, strong }) {
  return (
    <View style={styles.paymentSummaryLine}>
      <Text style={styles.paymentSummaryLabel}>{label}</Text>
      <Text style={[styles.paymentSummaryValue, strong && styles.paymentSummaryValueStrong]}>{value}</Text>
    </View>
  );
}

function MonthlyCreditCard({ plan, selected, active, onPress, style, showMandateTerms = true }) {
  const terms = subscriptionTerms(plan);
  return (
    <TouchableOpacity activeOpacity={0.88} style={[styles.creditMandateCard, style, selected && styles.creditMandateCardSelected]} onPress={onPress}>
      <View style={styles.creditSelectedRow}>
        {selected ? <Text style={styles.creditSelectedPill}>SELECTED</Text> : null}
        {active ? <Text style={styles.creditActivePill}>ACTIVE</Text> : null}
      </View>
      <Text style={styles.creditCardKicker}>MONTHLY CREDITS</Text>
      <Text style={styles.creditMandateTitle}>{plan.headline || `${plan.credits} credits every month`}</Text>
      {showMandateTerms && terms.valid ? <Text style={styles.creditMutedText}>{formatCreditRate(plan)}</Text> : null}
      <Text style={styles.creditCapsText}>{!showMandateTerms ? 'MONTHLY BILLING UNAVAILABLE' : terms.valid ? `${formatMoney(terms.setup / 100, plan.currency)} setup · ${formatMoney(terms.recurring / 100, plan.currency)}/${recurringPeriodLabel(terms.frequency)}` : 'Billing terms unavailable'}</Text>
      <Text style={styles.creditCardDescription}>{!showMandateTerms ? 'Google Play monthly subscriptions are unavailable in this build.' : terms.valid ? plan.summary || terms.cancellation : 'Confirm billing terms before subscribing.'}</Text>
    </TouchableOpacity>
  );
}

function AddMoreCard({ selected, onPress, style, plans = [] }) {
  const quantities = plans.map((plan) => Number(plan.credits)).filter((value) => Number.isSafeInteger(value) && value > 0);
  return (
    <TouchableOpacity activeOpacity={0.88} style={[styles.creditAddMoreCard, style, selected && styles.creditMandateCardSelected]} onPress={onPress}>
      <Text style={styles.creditCardKicker}>TOP-UP</Text>
      <Text style={styles.creditAddMoreTitle}>Add more</Text>
      <Text style={styles.creditMandateSub}>One-time packs</Text>
      <Text style={styles.creditCapsText}>NO SUBSCRIPTION CHANGE</Text>
      <Text style={styles.creditCardDescription}>{quantities.length ? `Choose from ${quantities.join(', ')} credit packs for image try-ons and videos.` : 'View available one-time credit packs.'}</Text>
    </TouchableOpacity>
  );
}

function TopUpCreditCard({ plan, selected, onPress, style, displayPrice, hideRate = false }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${plan.credits} credits, ${displayPrice || creditPackageDisplayPrice('web', plan)}, ${selected ? 'selected' : 'select package'}`} accessibilityState={{ selected }} activeOpacity={0.88} style={[styles.topUpCreditCard, styles.surfaceCard, style, selected && styles.creditMandateCardSelected]} onPress={onPress}>
      <SurfaceBackdrop />
      <View style={styles.creditPackageHeader}><Text style={styles.creditPackageQuantity}>{plan.credits} Credits</Text>{selected ? <Text style={styles.creditSelectedPill}>SELECTED</Text> : null}</View>
      <Text style={styles.topUpPrice}>{displayPrice || creditPackageDisplayPrice('web', plan)}</Text>
      {!hideRate && <Text style={styles.creditMutedText}>{formatCreditRate(plan)}</Text>}
      <Text style={styles.creditCardDescription}>{creditPackageDescription(plan)}</Text>
    </TouchableOpacity>
  );
}

function loadExpoIapModule() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  try {
    return require('expo-iap');
  } catch {
    return null;
  }
}

function useGooglePlayCredits({ enabled, user, setUser, onRequireAuth, productIds }) {
  const [state, setState] = useState({ products: {}, busy: false, message: '', error: '' });
  const iapRef = useRef(null);
  const processingRef = useRef(new Set());
  const purchaseActiveRef = useRef(false);
  const userRef = useLatestValue(user);
  const idsRef = useLatestValue(productIds);
  const enabledRef = useLatestValue(enabled);

  const verify = useCallback(async (purchase) => {
    if (!enabledRef.current || !userRef.current) return;
    if (purchase.purchaseState === 'pending') {
      purchaseActiveRef.current = false;
      setState((old) => ({ ...old, busy: false, message: 'Payment is pending in Google Play. Credits will appear after confirmation.' }));
      return;
    }
    const productId = String(purchase.productId || '');
    const token = String(purchase.purchaseToken || '');
    if (!idsRef.current.includes(productId) || !token) {
      purchaseActiveRef.current = false;
      setState((old) => ({ ...old, busy: false, error: 'Google Play returned an unrecognized purchase. Contact support.' }));
      return;
    }
    if (processingRef.current.has(token)) return;
    processingRef.current.add(token);
    setState((old) => ({ ...old, busy: true, message: 'Verifying purchase...', error: '' }));
    try {
      const result = await api('/payments/google-play/verify', {
        method: 'POST',
        body: JSON.stringify({ productId, purchaseToken: token })
      });
      if (result.user) setUser(result.user);
      setState((old) => ({
        ...old,
        busy: false,
        message: result.status === 'pending'
          ? 'Payment is pending in Google Play.'
          : result.status === 'review_required'
            ? 'This purchase needs support review. No additional credits were added.'
            : result.status === 'credited' && result.credited === true
              ? result.finalized === true
                ? 'Purchase verified. Credits added.'
                : 'Credits added. Google Play finalization is pending; retry when online.'
              : 'Purchase confirmation is unavailable. No new credit grant was confirmed. Reopen this screen or contact support.'
      }));
    } catch {
      setState((old) => ({ ...old, busy: false, error: 'Could not verify purchase. Reopen this screen when online to retry.' }));
    } finally {
      purchaseActiveRef.current = false;
      processingRef.current.delete(token);
    }
  }, [enabledRef, idsRef, setUser, userRef]);

  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') return undefined;
    const iap = loadExpoIapModule();
    iapRef.current = iap;
    if (!iap) {
      setState((old) => ({ ...old, error: 'Google Play Billing needs a compatible Android build.' }));
      return undefined;
    }
    let alive = true;
    let updated;
    let errors;
    try {
      updated = iap.purchaseUpdatedListener?.((purchase) => { if (alive) verify(purchase); });
      errors = iap.purchaseErrorListener?.((error) => {
      if (!alive) return;
      purchaseActiveRef.current = false;
      const cancelled = googlePlayPurchaseCancelled(error);
      setState((old) => ({ ...old, busy: false, message: cancelled ? 'Purchase cancelled.' : '', error: cancelled ? '' : 'Google Play purchase could not be completed.' }));
      });
    } catch {
      updated?.remove?.();
      iapRef.current = null;
      setState((old) => ({ ...old, error: 'Google Play Billing needs a compatible Android build.' }));
      return undefined;
    }
    initGooglePlayCatalog(iap, productIds)
      .then(async (products) => {
        if (alive) setState((old) => ({ ...old, products }));
        const unfinished = await iap.getAvailablePurchases();
        if (alive) for (const purchase of unfinished || []) await verify(purchase);
      })
      .catch(() => { if (alive) setState((old) => ({ ...old, error: 'Google Play products are unavailable. Try again later.' })); });
    return () => {
      alive = false;
      purchaseActiveRef.current = false;
      updated?.remove?.();
      errors?.remove?.();
      iap.endConnection?.().catch?.(() => {});
    };
  }, [enabled, productIds.join('|'), verify]);

  useEffect(() => {
    if (!enabled || !user || !iapRef.current) return;
    iapRef.current.getAvailablePurchases()
      .then(async (purchases) => { for (const purchase of purchases || []) await verify(purchase); })
      .catch(() => {});
  }, [enabled, user?.id, user?._id, verify]);

  useEffect(() => {
    if (!enabled) return undefined;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || !iapRef.current) return;
      iapRef.current.getAvailablePurchases()
        .then(async (purchases) => { for (const purchase of purchases || []) await verify(purchase); })
        .catch(() => {});
    });
    return () => subscription.remove();
  }, [enabled, verify]);

  const purchase = useCallback(async (productId) => {
    if (!user) return onRequireAuth?.('Log in to buy credits.');
    if (!enabled || !iapRef.current || !state.products[productId] || state.busy || !beginGooglePlayPurchase(purchaseActiveRef)) return;
    setState((old) => ({ ...old, busy: true, error: '', message: 'Opening Google Play...' }));
    try {
      const config = await api('/payments/google-play/config');
      if (!config.enabled || !config.obfuscatedAccountId) throw new Error('Billing is unavailable.');
      await iapRef.current.requestPurchase({ request: { google: { skus: [productId], obfuscatedAccountId: config.obfuscatedAccountId } }, type: 'in-app' });
    } catch (error) {
      purchaseActiveRef.current = false;
      const cancelled = googlePlayPurchaseCancelled(error);
      setState((old) => ({ ...old, busy: false, message: cancelled ? 'Purchase cancelled.' : '', error: cancelled ? '' : 'Google Play purchase could not be started.' }));
    }
  }, [enabled, onRequireAuth, state.busy, state.products, user]);

  return { ...state, purchase };
}

const STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_IDS = Object.freeze([STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_ID]);

function useLatestValue(value) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function storeKitProductPrice(product) {
  return product?.displayPrice || product?.localizedPriceIOS || product?.localizedPrice || '';
}

function storeKitProductTitle(product, fallback) {
  return product?.displayName || product?.displayNameIOS || product?.title || fallback;
}

function storeKitProductId(product = {}) {
  return String(product?.id || product?.productId || '').trim();
}

function findStoreKitProduct(items, productId) {
  const targetProductId = String(productId || '').trim();
  return (Array.isArray(items) ? items : []).find((item) => storeKitProductId(item) === targetProductId) || null;
}

function storeKitProductsById(items) {
  return (Array.isArray(items) ? items : []).reduce((indexed, item) => {
    const productId = storeKitProductId(item);
    if (productId) indexed[productId] = item;
    return indexed;
  }, {});
}

function applePurchaseTransactionId(purchase = {}) {
  return String(purchase.transactionId || purchase.id || '').trim();
}

function isStoreKitCancel(error) {
  return /cancel/i.test(String(error?.code || error?.message || ''));
}

function applePurchaseServerPayload(purchase = {}) {
  return {
    id: purchase.id || '',
    productId: purchase.productId || purchase.currentPlanId || '',
    transactionId: purchase.transactionId || purchase.id || '',
    transactionDate: purchase.transactionDate || null,
    purchaseToken: purchase.purchaseToken || '',
    transactionReceipt: purchase.transactionReceipt || '',
    appAccountToken: purchase.appAccountToken || '',
    environmentIOS: purchase.environmentIOS || purchase.environmentIos || '',
    expirationDateIOS: purchase.expirationDateIOS || purchase.expirationDateIos || null,
    originalTransactionIdentifierIOS: purchase.originalTransactionIdentifierIOS || purchase.originalTransactionIdentifierIos || '',
    webOrderLineItemIdIOS: purchase.webOrderLineItemIdIOS || '',
    revocationDateIOS: purchase.revocationDateIOS || null,
    revocationReasonIOS: purchase.revocationReasonIOS || '',
    reasonIOS: purchase.reasonIOS || purchase.transactionReasonIOS || '',
    store: purchase.store || 'app-store'
  };
}

function isLookmefyStoreKitPurchase(purchase = {}) {
  const productId = String(purchase.productId || purchase.currentPlanId || '').trim();
  return isLookmefyStoreKitProductId(productId);
}

function storeKitUserIdentity(user = {}) {
  return String(user?.id || user?._id || '').trim();
}

function useAppleStoreKitPayments({ enabled, user, setUser, onRequireAuth }) {
  const [state, setState] = useState({
    available: enabled,
    connected: false,
    loading: enabled,
    syncing: false,
    restoring: false,
    verifying: false,
    purchasePending: false,
    purchasingProductId: '',
    statusMessage: '',
    error: '',
    unavailableReason: '',
    subscriptionProduct: null,
    creditProducts: [],
    creditProductsById: {},
    activeSubscriptions: []
  });
  const iapRef = useRef(null);
  const processingRef = useRef(new Set());
  const userRef = useLatestValue(user);
  const onRequireAuthRef = useLatestValue(onRequireAuth);
  const userIdentity = storeKitUserIdentity(user);

  const updateState = useCallback((patch) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const updateUserFromStoreKit = useCallback((nextUser) => {
    if (!nextUser) return;
    userRef.current = nextUser;
    setUser(nextUser);
  }, [setUser, userRef]);

  const finishStoreKitTransaction = useCallback(async (purchase) => {
    const iap = iapRef.current;
    if (!iap?.finishTransaction) return;
    try {
      await iap.finishTransaction({
        purchase,
        isConsumable: isStoreKitConsumableProductId(purchase?.productId)
      });
    } catch (error) {
      updateState({ error: `Apple verified the purchase, but finishing it failed: ${error.message}` });
    }
  }, [updateState]);

  const refreshProducts = useCallback(async () => {
    if (!enabled) return;
    const iap = iapRef.current;
    if (!iap) {
      updateState({
        loading: false,
        available: false,
        unavailableReason: 'StoreKit is unavailable in this build.'
      });
      return;
    }

    updateState({ loading: true, error: '', unavailableReason: '' });
    try {
      const [subscriptionProducts, consumableProducts, activeSubscriptions] = await Promise.all([
        iap.fetchProducts({ skus: STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_IDS, type: 'subs' }),
        iap.fetchProducts({ skus: STOREKIT_CONSUMABLE_PRODUCT_IDS, type: 'in-app' }),
        iap.getActiveSubscriptions ? iap.getActiveSubscriptions(STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_IDS).catch(() => []) : []
      ]);
      const subscriptionProduct = findStoreKitProduct(subscriptionProducts, STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_ID);
      const creditProductsById = storeKitProductsById(consumableProducts);
      const creditProducts = STOREKIT_CONSUMABLE_PRODUCT_IDS.map((productId) => creditProductsById[productId]).filter(Boolean);
      updateState({
        loading: false,
        connected: true,
        subscriptionProduct,
        creditProducts,
        creditProductsById,
        activeSubscriptions: Array.isArray(activeSubscriptions) ? activeSubscriptions : [],
        unavailableReason: !subscriptionProduct && !creditProducts.length ? 'App Store products are not available for this Apple ID/build yet.' : ''
      });
    } catch (error) {
      updateState({
        loading: false,
        connected: false,
        error: error.message || 'Could not load App Store products.',
        unavailableReason: 'App Store products could not be loaded.'
      });
    }
  }, [enabled, updateState]);

  const syncCurrentEntitlements = useCallback(async ({ silent = false } = {}) => {
    const currentUser = userRef.current;
    if (!enabled || !currentUser) return;
    const iap = iapRef.current;
    if (!iap) return;

    updateState({
      syncing: !silent,
      error: '',
      ...(silent ? {} : { statusMessage: 'Syncing App Store status...' })
    });
    try {
      const availablePurchases = iap.getAvailablePurchases
        ? await iap.getAvailablePurchases({ onlyIncludeActiveItemsIOS: false, alsoPublishToEventListenerIOS: false })
        : [];
      const relevantPurchases = (Array.isArray(availablePurchases) ? availablePurchases : []).filter(isLookmefyStoreKitPurchase);
      if (relevantPurchases.length) {
        const restoreResult = await api('/payments/apple/restore', {
          method: 'POST',
          body: JSON.stringify({ purchases: relevantPurchases.map(applePurchaseServerPayload) })
        });
        if (restoreResult.user) updateUserFromStoreKit(restoreResult.user);
        const verifiedTransactionIds = new Set(
          (Array.isArray(restoreResult.transactions) ? restoreResult.transactions : [])
            .map((transaction) => String(transaction?.transactionId || '').trim())
            .filter(Boolean)
        );
        for (const purchase of relevantPurchases) {
          if (verifiedTransactionIds.has(applePurchaseTransactionId(purchase))) {
            await finishStoreKitTransaction(purchase);
          }
        }
      }

      const statusResult = await api('/payments/apple/status', { noCache: true });
      if (statusResult.user) updateUserFromStoreKit(statusResult.user);
      updateState({
        syncing: false,
        error: '',
        ...(silent ? {} : { statusMessage: 'App Store status is up to date.' })
      });
    } catch (error) {
      updateState({
        syncing: false,
        error: error.message || 'Could not sync App Store status.'
      });
    }
  }, [enabled, finishStoreKitTransaction, updateState, updateUserFromStoreKit, userRef]);

  const verifyPurchase = useCallback(async (purchase, source = 'purchase') => {
    if (!enabled || !isLookmefyStoreKitPurchase(purchase)) return false;
    const currentUser = userRef.current;
    if (!currentUser) {
      onRequireAuthRef.current?.('Log in with your mobile number before completing an App Store purchase.');
      updateState({ purchasePending: false, purchasingProductId: '', error: 'Log in before completing this App Store purchase.' });
      return false;
    }

    const key = String(purchase.transactionId || purchase.id || purchase.purchaseToken || purchase.productId || '');
    if (key && processingRef.current.has(key)) return false;
    if (key) processingRef.current.add(key);

    updateState({
      verifying: true,
      purchasePending: false,
      statusMessage: 'Verifying App Store purchase...',
      error: ''
    });

    try {
      const result = await api('/payments/apple/transactions', {
        method: 'POST',
        body: JSON.stringify({
          source,
          purchase: applePurchaseServerPayload(purchase)
        })
      });
      if (result.user) updateUserFromStoreKit(result.user);
      await finishStoreKitTransaction(purchase);
      updateState({
        verifying: false,
        purchasingProductId: '',
        statusMessage: result.grantedCredits
          ? `Apple purchase verified. ${result.grantedCredits} credits added.`
          : 'Apple purchase verified.',
        error: ''
      });
      return true;
    } catch (error) {
      updateState({
        verifying: false,
        purchasingProductId: '',
        error: error.message || 'Apple purchase verification failed.'
      });
      return false;
    } finally {
      if (key) processingRef.current.delete(key);
    }
  }, [enabled, finishStoreKitTransaction, onRequireAuthRef, updateState, updateUserFromStoreKit, userRef]);

  useEffect(() => {
    if (!enabled) return undefined;
    const iap = loadExpoIapModule();
    iapRef.current = iap;
    if (!iap) {
      updateState({
        available: false,
        loading: false,
        unavailableReason: 'StoreKit is unavailable in this build. Create a development or App Store build with expo-iap.'
      });
      return undefined;
    }

    let alive = true;
    let purchaseSubscription;
    let errorSubscription;
    try {
      purchaseSubscription = iap.purchaseUpdatedListener?.((purchase) => {
        if (alive) verifyPurchase(purchase, 'purchase');
      });
      errorSubscription = iap.purchaseErrorListener?.((error) => {
      if (!alive) return;
      updateState({
        purchasePending: false,
        purchasingProductId: '',
        statusMessage: isStoreKitCancel(error) ? 'Purchase cancelled.' : '',
        error: isStoreKitCancel(error) ? '' : error.message || 'Apple purchase failed.'
      });
      });
    } catch {
      purchaseSubscription?.remove?.();
      iapRef.current = null;
      updateState({ available: false, loading: false, unavailableReason: 'StoreKit is unavailable in this build.' });
      return undefined;
    }

    iap.initConnection()
      .then(() => {
        if (!alive) return;
        updateState({ connected: true });
        refreshProducts();
      })
      .catch((error) => {
        if (!alive) return;
        updateState({
          available: false,
          loading: false,
          connected: false,
          error: error.message || 'Could not connect to the App Store.',
          unavailableReason: 'Could not connect to the App Store.'
        });
      });

    return () => {
      alive = false;
      purchaseSubscription?.remove?.();
      errorSubscription?.remove?.();
      iap.endConnection?.().catch?.(() => {});
    };
  }, [enabled, refreshProducts, updateState, verifyPurchase]);

  useEffect(() => {
    if (enabled && state.connected && userIdentity) {
      syncCurrentEntitlements({ silent: true });
    }
  }, [enabled, state.connected, syncCurrentEntitlements, userIdentity]);

  const requestStoreKitPurchase = useCallback(async ({ productId, type }) => {
    if (!enabled) return;
    const currentUser = userRef.current;
    if (!currentUser) {
      onRequireAuthRef.current?.('Log in with your mobile number to buy credits.');
      return;
    }
    const iap = iapRef.current;
    if (!iap || !state.connected) {
      updateState({ error: 'App Store payments are not ready yet.' });
      return;
    }
    const product = productId === STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_ID ? state.subscriptionProduct : state.creditProductsById[productId];
    if (!product) {
      updateState({ error: 'This App Store product is unavailable for the current build or Apple ID.' });
      return;
    }
    const appAccountToken = storeKitAppAccountTokenForUser(currentUser);
    if (!appAccountToken) {
      updateState({ error: 'Could not link this App Store purchase to your Lookmefy account.' });
      return;
    }

    updateState({
      purchasePending: true,
      purchasingProductId: productId,
      statusMessage: 'Opening App Store purchase sheet...',
      error: ''
    });

    try {
      await iap.requestPurchase({
        request: {
          apple: {
            sku: productId,
            appAccountToken,
            quantity: isStoreKitConsumableProductId(productId) ? 1 : undefined,
            andDangerouslyFinishTransactionAutomatically: false
          }
        },
        type
      });
      updateState({ statusMessage: 'Waiting for App Store confirmation...' });
    } catch (error) {
      updateState({
        purchasePending: false,
        purchasingProductId: '',
        statusMessage: isStoreKitCancel(error) ? 'Purchase cancelled.' : '',
        error: isStoreKitCancel(error) ? '' : error.message || 'Could not start App Store purchase.'
      });
    }
  }, [enabled, onRequireAuthRef, state.connected, state.creditProductsById, state.subscriptionProduct, updateState, userRef]);

  const restorePurchases = useCallback(async () => {
    if (!enabled || !userRef.current) {
      onRequireAuthRef.current?.('Log in with your mobile number to restore App Store purchases.');
      return;
    }
    updateState({ restoring: true, statusMessage: 'Restoring App Store purchases...', error: '' });
    await syncCurrentEntitlements({ silent: false });
    updateState({ restoring: false });
  }, [enabled, onRequireAuthRef, syncCurrentEntitlements, updateState, userRef]);

  const manageSubscription = useCallback(async () => {
    const iap = iapRef.current;
    try {
      if (typeof iap?.deepLinkToSubscriptions === 'function') await iap.deepLinkToSubscriptions();
      else await Linking.openURL('https://apps.apple.com/account/subscriptions');
    } catch (error) {
      updateState({ error: error.message || 'Could not open App Store subscription settings.' });
    }
  }, [updateState]);

  return {
    ...state,
    purchaseMonthly: () => requestStoreKitPurchase({ productId: STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_ID, type: 'subs' }),
    purchaseCredits: (productId) => requestStoreKitPurchase({ productId, type: 'in-app' }),
    restorePurchases,
    syncCurrentEntitlements,
    refreshProducts,
    manageSubscription
  };
}

function AppleStoreKitCreditCard({ selected, active, product, title, kicker, headline, subhead, description, onPress, style }) {
  const price = storeKitProductPrice(product);
  return (
    <TouchableOpacity activeOpacity={0.88} style={[styles.creditMandateCard, styles.surfaceCard, style, selected && styles.creditMandateCardSelected]} onPress={onPress}>
      <SurfaceBackdrop />
      <View style={styles.creditSelectedRow}>
        {selected ? <Text style={styles.creditSelectedPill}>SELECTED</Text> : null}
        {active ? <Text style={styles.creditActivePill}>ACTIVE</Text> : null}
      </View>
      <Text style={styles.creditCardKicker}>{kicker}</Text>
      <Text style={styles.creditMandateTitle}>{headline}</Text>
      <Text style={styles.creditMandateSub}>{subhead}</Text>
      <Text style={styles.creditMutedText}>{price || 'Unavailable'}</Text>
      <Text style={styles.creditCapsText}>{storeKitProductTitle(product, title)}</Text>
      <Text style={styles.creditCardDescription}>{description}</Text>
    </TouchableOpacity>
  );
}

function AppleStoreKitTopUpCard({ plan, product, selected, onPress, style }) {
  const price = storeKitProductPrice(product);
  return (
    <TouchableOpacity activeOpacity={0.88} style={[styles.topUpCreditCard, styles.surfaceCard, style, selected && styles.creditMandateCardSelected]} onPress={onPress}>
      <SurfaceBackdrop />
      <View style={styles.creditPackageHeader}><Text style={styles.creditPackageQuantity}>{plan.credits} Credits</Text>{selected ? <Text style={styles.creditSelectedPill}>SELECTED</Text> : null}</View>
      <Text style={styles.topUpPrice}>{price || 'Unavailable'}</Text>
      <Text style={styles.creditCardDescription}>{creditPackageDescription(plan)}</Text>
    </TouchableOpacity>
  );
}

function AppleStoreKitActions({ mode, appleStoreKit, activeMonthly, selectedTopUp, advertisedProductIds, subscriptionProduct, plansError = false, plansLoading = false }) {
  const buyingSubscription = appleStoreKit.purchasingProductId === STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_ID;
  const buyingCredits = isStoreKitConsumableProductId(appleStoreKit.purchasingProductId);
  const busy = appleStoreKit.loading || appleStoreKit.verifying || appleStoreKit.purchasePending || appleStoreKit.syncing || appleStoreKit.restoring;
  const selectedTopUpProductId = advertisedStoreKitProductIdForTopUpPlan(selectedTopUp, advertisedProductIds);
  const selectedProduct = mode === 'top_up' ? appleStoreKit.creditProductsById[selectedTopUpProductId] : subscriptionProduct;
  const disabled = plansError || plansLoading || busy || !appleStoreKit.connected || !storeKitProductPrice(selectedProduct) || (mode === 'subscription' && activeMonthly);
  let label = mode === 'top_up' ? `BUY ${Number(selectedTopUp?.credits) || ''} CREDITS`.trim() : 'SUBSCRIBE WITH APPLE';
  if (plansLoading) label = 'LOADING PLANS';
  else if (appleStoreKit.loading) label = 'LOADING APP STORE';
  else if (appleStoreKit.restoring) label = 'RESTORING PURCHASES';
  else if (appleStoreKit.syncing) label = 'SYNCING STATUS';
  else if (buyingSubscription || buyingCredits || appleStoreKit.purchasePending) label = 'WAITING FOR APP STORE';
  else if (appleStoreKit.verifying) label = 'VERIFYING PURCHASE';
  else if (mode === 'subscription' && activeMonthly) label = 'MONTHLY ACTIVE';
  else if (plansError || !appleStoreKit.connected || !storeKitProductPrice(selectedProduct)) label = 'PURCHASES UNAVAILABLE';

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy }}
        style={[styles.secureCheckoutButton, disabled && styles.disabledButton]}
        activeOpacity={0.88}
        disabled={disabled}
        onPress={mode === 'top_up' ? () => appleStoreKit.purchaseCredits(selectedTopUpProductId) : appleStoreKit.purchaseMonthly}
      >
        <Text style={styles.secureCheckoutText}>{label}</Text>
      </TouchableOpacity>

      <View style={styles.appleStoreActionRow}>
        <TouchableOpacity style={styles.appleStoreActionButton} activeOpacity={0.82} disabled={busy} onPress={appleStoreKit.restorePurchases}>
          <Ionicons name="cloud-download-outline" size={16} color="#5e3335" />
          <Text style={styles.verifyPaymentText}>RESTORE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.appleStoreActionButton} activeOpacity={0.82} disabled={busy} onPress={() => appleStoreKit.syncCurrentEntitlements({ silent: false })}>
          <Ionicons name="refresh" size={16} color="#5e3335" />
          <Text style={styles.verifyPaymentText}>SYNC STATUS</Text>
        </TouchableOpacity>
      </View>

      {activeMonthly ? (
        <TouchableOpacity style={styles.verifyPaymentButton} activeOpacity={0.82} onPress={appleStoreKit.manageSubscription}>
          <Ionicons name="settings-outline" size={16} color="#5e3335" />
          <Text style={styles.verifyPaymentText}>MANAGE APP STORE SUBSCRIPTION</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

function TokensScreen({ user, setUser, token, onNavigate, onBack, onRequireAuth }) {
  const layout = useResponsiveLayout();
  const [balanceRefreshing, setBalanceRefreshing] = useState(false);
  const [balanceError, setBalanceError] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [catalog, setCatalog] = useState(fallbackPaymentCatalog);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansRefreshKey, setPlansRefreshKey] = useState(0);
  const [plansError, setPlansError] = useState(false);
  const [mode, setMode] = useState('subscription');
  const [selectedTopUpId, setSelectedTopUpId] = useState(fallbackTopUpPlans[0].id);
  const [pendingOrderId, setPendingOrderId] = useState('');
  const verifyingOrderRef = useRef('');
  const appStateRef = useRef(AppState.currentState);

  const subscriptionPlan = useMemo(() => normalizePaymentPlan(catalog.subscription, fallbackSubscriptionPlan), [catalog.subscription]);
  const topUpPlans = useMemo(() => {
    const plans = Array.isArray(catalog.topUps) && catalog.topUps.length ? catalog.topUps : fallbackTopUpPlans;
    return plans.map((item, index) => normalizePaymentPlan(item, fallbackTopUpPlans[index] || fallbackTopUpPlans[0]));
  }, [catalog.topUps]);
  const selectedTopUp = topUpPlans.find((item) => item.id === selectedTopUpId) || topUpPlans[0];
  const selectedPlan = mode === 'top_up' ? selectedTopUp : subscriptionPlan;
  const selectedAmount = (Number(selectedPlan.amount) || 0) / 100;
  const creditCosts = catalog.creditCosts || fallbackPaymentCatalog.creditCosts;
  const subscription = user?.subscription;
  const subscriptionStatus = String(subscription?.status || '').toLowerCase();
  const subscriptionPeriodActive = !subscription?.currentPeriodEnd || new Date(subscription.currentPeriodEnd) > new Date();
  const activeMonthly = ['active', 'billing_grace'].includes(subscriptionStatus) && subscriptionPeriodActive;
  const isAppleCheckout = Platform.OS === 'ios';
  const isAndroidCheckout = Platform.OS === 'android';
  const googlePlayEnabled = isAndroidCheckout && catalog.androidGooglePlay?.enabled === true;
  const googleProductIds = useMemo(() => (catalog.androidGooglePlay?.products || []).map((item) => item.productId), [catalog.androidGooglePlay]);
  const googlePlay = useGooglePlayCredits({ enabled: googlePlayEnabled, user, setUser, onRequireAuth, productIds: googleProductIds });
  const terms = subscriptionTerms(subscriptionPlan);
  const activeAppleMonthly = isAppleCheckout && subscription?.provider === 'apple' && activeMonthly;
  const appleStoreKit = useAppleStoreKitPayments({ enabled: isAppleCheckout, user, setUser, onRequireAuth });
  const advertisedAppleTopUpProductIds = catalog.appStoreProductIds?.creditTopUps || {};
  const appleSubscriptionProduct = catalog.appStoreProductIds?.monthlySubscription === STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_ID
    ? appleStoreKit.subscriptionProduct
    : null;
  const appleSelectedTopUpProductId = advertisedStoreKitProductIdForTopUpPlan(selectedTopUp, advertisedAppleTopUpProductIds);
  const appleSelectedProduct = mode === 'top_up' ? appleStoreKit.creditProductsById[appleSelectedTopUpProductId] : appleSubscriptionProduct;
  const appleSelectedPrice = storeKitProductPrice(appleSelectedProduct) || 'Unavailable';
  const appleSelectedProductId = mode === 'top_up' ? appleSelectedTopUpProductId : appleSubscriptionProduct ? STOREKIT_MONTHLY_SUBSCRIPTION_PRODUCT_ID : '';
  const selectedStoreProduct = isAppleCheckout ? appleSelectedProduct : googlePlay.products[selectedTopUp?.id];
  const purchaseAvailability = creditPurchaseAvailability({ platform: Platform.OS, enabled: googlePlayEnabled, connected: appleStoreKit.connected, product: selectedStoreProduct, busy: isAppleCheckout ? appleStoreKit.purchasePending || appleStoreKit.verifying : googlePlay.busy });
  const appleCatalogMessage = !plansLoading && !plansError && !appleStoreKit.loading && appleStoreKit.connected && !appleSelectedProduct
    ? 'This credit product is unavailable until the App Store and Lookmefy catalog agree.'
    : '';
  const visibleMessage = isAppleCheckout
    ? appleStoreKit.error || appleStoreKit.unavailableReason || appleCatalogMessage || appleStoreKit.statusMessage
    : isAndroidCheckout ? mode !== 'top_up' ? 'Monthly billing is unavailable on Android.' : googlePlay.error || googlePlay.message || (!purchaseAvailability.available ? purchaseAvailability.label : '') : message;
  const creditBalance = knownCreditBalance(user);
  const creditBalanceLabel = creditBalance === null ? 'Unavailable' : typeof creditBalance === 'number' ? creditBalance.toLocaleString('en-IN') : String(creditBalance);
  const creditHistory = useApiState('/tryons/credit-history?limit=20', token, Boolean(user), { events: [] });
  const creditEvents = Array.isArray(creditHistory.data?.events) ? creditHistory.data.events : [];
  const creditChoiceCardStyle = layout.isTablet ? styles.creditGridCardHalf : null;
  const topUpCreditCardStyle = layout.isTablet ? (layout.isLargeTablet ? styles.creditGridCardThird : styles.creditGridCardHalf) : null;
  const messageIsError = isAppleCheckout
    ? Boolean(appleStoreKit.error || appleStoreKit.unavailableReason || appleCatalogMessage)
    : isAndroidCheckout ? mode !== 'top_up' || Boolean(googlePlay.error || !googlePlayEnabled) : /failed|missing|not|error|could not|unavailable/i.test(message);

  const refreshBalance = useCallback(async () => {
    if (!user) return;
    setBalanceRefreshing(true);
    setBalanceError(false);
    try {
      const data = await api('/auth/me', { noCache: true });
      if (data?.user) setUser(data.user);
      else setBalanceError(true);
    } catch {
      setBalanceError(true);
    } finally {
      setBalanceRefreshing(false);
    }
  }, [setUser, user?.id]);

  useEffect(() => { refreshBalance(); }, [refreshBalance]);

  useEffect(() => {
    let alive = true;
    setPlansLoading(true);
    setPlansError(false);
    api('/payments/plans')
      .then((data) => {
        if (!alive) return;
        const topUps = Array.isArray(data?.topUps) && data.topUps.length
          ? data.topUps
          : Array.isArray(data?.plans)
            ? data.plans.filter((item) => item.type === 'top_up')
            : [];
        const subscriptionFromPlans = data?.subscription || (Array.isArray(data?.plans) ? data.plans.find((item) => item.type === 'subscription') : null);
        if (!paymentCatalogAvailable(subscriptionFromPlans, topUps)) {
          setPlansError(true);
          setMessage('Plans are unavailable. Please try again.');
          return;
        }
        setCatalog({
          subscription: subscriptionFromPlans || fallbackSubscriptionPlan,
          topUps: topUps.length ? topUps : fallbackTopUpPlans,
          androidGooglePlay: data?.androidGooglePlay || { enabled: false, products: [] },
          appStoreProductIds: data?.appStoreProductIds || {},
          creditCosts: data?.creditCosts || fallbackPaymentCatalog.creditCosts
        });
        if (topUps[0]?.id) setSelectedTopUpId(topUps[0].id);
        setMessage('');
      })
      .catch((error) => {
        if (alive) {
          setPlansError(true);
          setMessage('Plans are unavailable. Please try again.');
        }
      })
      .finally(() => {
        if (alive) setPlansLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [plansRefreshKey]);

  const verifyPaymentOrder = useCallback(async (merchantOrderId, silent = false) => {
    if (!user || !merchantOrderId || verifyingOrderRef.current === merchantOrderId) return;
    verifyingOrderRef.current = merchantOrderId;
    if (!silent) setMessage('Verifying payment with Razorpay...');
    try {
      const data = await api(`/payments/orders/${encodeURIComponent(merchantOrderId)}/status`, { noCache: true });
      if (data.user) setUser(data.user);
      const state = data.order?.status;
      const credits = Number(data.order?.tokens) || Number(selectedPlan.credits) || 0;
      if (state === 'completed') {
        setPendingOrderId('');
        setMessage(`${data.order?.purchaseType === 'top_up' ? 'Top-up confirmed' : 'Monthly plan confirmed'}. ${credits} credits have been added.`);
      } else if (state === 'failed') {
        setPendingOrderId('');
        setMessage('Payment was not completed. You can try again when ready.');
      } else {
        setPendingOrderId(merchantOrderId);
        setMessage('Payment is still pending. Return here again in a moment to refresh.');
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      verifyingOrderRef.current = '';
    }
  }, [selectedPlan.credits, setUser, user]);

  useEffect(() => {
    const handleUrl = ({ url }) => {
      const merchantOrderId = merchantOrderIdFromUrl(url);
      if (merchantOrderId) verifyPaymentOrder(merchantOrderId);
    };

    Linking.getInitialURL().then((url) => {
      const merchantOrderId = merchantOrderIdFromUrl(url);
      if (merchantOrderId) verifyPaymentOrder(merchantOrderId);
    }).catch(() => {});
    const subscriptionHandle = Linking.addEventListener('url', handleUrl);
    return () => subscriptionHandle.remove();
  }, [verifyPaymentOrder]);

  useEffect(() => {
    const subscriptionHandle = AppState.addEventListener('change', (nextState) => {
      const wasAway = /inactive|background/.test(appStateRef.current || '');
      appStateRef.current = nextState;
      if (nextState === 'active' && wasAway && pendingOrderId) {
        verifyPaymentOrder(pendingOrderId, true);
      }
    });
    return () => subscriptionHandle.remove();
  }, [pendingOrderId, verifyPaymentOrder]);

  const startCheckout = useCallback(async () => {
    if (!user) {
      onRequireAuth?.('Log in with your mobile number to buy credits.');
      return;
    }
    if (!selectedPlan?.id) return;

    setCheckoutLoading(true);
    setMessage(mode === 'top_up' ? 'Opening Razorpay checkout...' : 'Opening Razorpay monthly checkout...');
    try {
      const data = await api('/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planId: selectedPlan.id,
          platform: Platform.OS,
          redirectUrl: mobilePaymentReturnUrl()
        })
      });
      const paymentUrl = data.paymentUrl || data.redirectUrl || data.razorpay?.paymentUrl || data.razorpay?.checkoutUrl;
      const merchantOrderId = data.order?.merchantOrderId || data.razorpay?.notes?.merchantOrderId || '';
      const verifyPath = data.razorpay?.verifyPath || '/payments/razorpay/verify';
      if (merchantOrderId) setPendingOrderId(merchantOrderId);
      const paymentResult = data.paymentResult || data.razorpay?.paymentResult;
      if (paymentResult?.razorpay_payment_id && paymentResult?.razorpay_signature) {
        const verified = await api(verifyPath, {
          method: 'POST',
          body: JSON.stringify({
            merchantOrderId,
            razorpay_order_id: paymentResult.razorpay_order_id || data.razorpay?.orderId,
            razorpay_payment_id: paymentResult.razorpay_payment_id,
            razorpay_signature: paymentResult.razorpay_signature
          })
        });
        if (verified.user) setUser(verified.user);
        setPendingOrderId('');
        setMessage(verified.message || 'Payment verified. Credits credited.');
        return;
      }
      if (paymentUrl) {
        await Linking.openURL(paymentUrl);
        setMessage('Complete payment in Razorpay, then return to Lookmefy.');
      } else if (data.razorpay?.orderId) {
        setMessage('Razorpay order is ready. Complete the payment from the secure checkout, then verify here.');
      } else {
        setMessage('Razorpay did not return checkout details. Please try again.');
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCheckoutLoading(false);
    }
  }, [mode, onRequireAuth, selectedPlan?.id, setUser, user]);

  const cancelSubscription = useCallback(() => {
    if (!activeMonthly || cancelLoading) return;
    Alert.alert(
      'Cancel monthly billing?',
      'Your current credits stay available. Future monthly Razorpay billing will be cancelled.',
      [
        { text: 'Keep Plan', style: 'cancel' },
        {
          text: 'Cancel Billing',
          style: 'destructive',
          onPress: async () => {
            setCancelLoading(true);
            setMessage('Cancelling monthly mandate...');
            try {
              const data = await api('/payments/subscriptions/current/cancel', { method: 'POST', noCache: true });
              if (data.user) setUser(data.user);
              setMessage('Monthly billing has been cancelled.');
            } catch (error) {
              setMessage(error.message);
            } finally {
              setCancelLoading(false);
            }
          }
        }
      ]
    );
  }, [activeMonthly, cancelLoading, setUser]);

  return (
    <View style={styles.creditsScreen}>
      <AppHeader onNavigate={onNavigate} user={user} compact />
      <ScrollView style={styles.flex} contentContainerStyle={styles.creditsContent} {...screenScrollProps}>
      <PageBackRow onBack={onBack} />

      <View style={styles.creditsHero}>
        <View style={styles.creditsHeroCopy}>
          <Text style={styles.creditsEyebrow}>YOUR ACCOUNT</Text>
          <Text style={[styles.creditsHeroTitle, layout.windowWidth <= 340 && { fontSize: 37, lineHeight: 52 }]}>Your Credits</Text>
          {mode === 'top_up' ? (
            <TouchableOpacity activeOpacity={0.78} onPress={() => setMode('subscription')}>
              <Text style={styles.creditsBackLink}>VIEW MONTHLY PLAN</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.creditsHeroText}>
          {mode === 'top_up'
            ? 'Choose a one-time credit pack for more image try-ons and videos.'
            : 'Create new looks whenever inspiration strikes.'}
        </Text>
      </View>

      <View style={[styles.creditsBalanceCard, styles.surfaceCard]}>
        <SurfaceBackdrop />
        <View style={styles.creditsBalanceCopy}>
          <Text style={styles.creditsBalanceLabel}>AVAILABLE CREDITS</Text>
          <Text style={styles.creditsBalanceNumber} numberOfLines={1} adjustsFontSizeToFit={Platform.OS === 'ios'} minimumFontScale={0.7} accessibilityLabel={creditBalance === null ? 'Credit balance unavailable' : `${creditBalanceLabel} available credits`}>{creditBalanceLabel}</Text>
          <Text style={styles.creditsBalanceHelp}>{balanceRefreshing ? 'Checking your balance...' : balanceError ? 'Could not refresh balance. Last known value shown, if available.' : creditBalance === null ? 'Refresh your account to see your balance.' : `Image try-ons use ${creditCosts.image} credit${creditCosts.image === 1 ? '' : 's'}; videos use ${creditCosts.video} credits.`}</Text>
          {balanceError || creditBalance === null ? <TouchableOpacity accessibilityRole="button" disabled={balanceRefreshing} onPress={refreshBalance}><Text style={styles.creditsRetryText}>Retry balance</Text></TouchableOpacity> : null}
        </View>
      </View>

      {plansLoading || (isAppleCheckout && appleStoreKit.loading) ? <ActivityIndicator style={styles.creditsLoader} size="small" color="#9b5658" /> : null}
      {plansError ? <View style={styles.creditsStatePanel}><Text style={styles.creditsStateText}>Plans are unavailable. Please try again.</Text><TouchableOpacity accessibilityRole="button" onPress={() => setPlansRefreshKey((current) => current + 1)}><Text style={styles.creditsRetryText}>Retry plans</Text></TouchableOpacity></View> : null}

      <View style={styles.creditsSectionIntro}>
        <Text style={styles.creditsSectionHeading}>{mode === 'top_up' ? 'One-time credits' : 'Monthly plan'}</Text>
        <Text style={styles.creditsSectionDescription}>{mode === 'top_up' ? 'Select a pack to see its store price and availability.' : 'Review the current plan and its billing terms.'}</Text>
      </View>

      {!plansError && !plansLoading && (mode === 'top_up' ? (
        isAppleCheckout ? (
          <View style={[styles.topUpGrid, layout.isTablet && styles.creditResponsiveGrid]}>
            {topUpPlans.map((planItem) => {
              const productId = advertisedStoreKitProductIdForTopUpPlan(planItem, advertisedAppleTopUpProductIds);
              return (
                <AppleStoreKitTopUpCard
                  key={planItem.id}
                  plan={planItem}
                  product={appleStoreKit.creditProductsById[productId]}
                  selected={selectedPlan.id === planItem.id}
                  style={topUpCreditCardStyle}
                  onPress={() => setSelectedTopUpId(planItem.id)}
                />
              );
            })}
          </View>
        ) : (
          <View style={[styles.topUpGrid, layout.isTablet && styles.creditResponsiveGrid]}>
            {topUpPlans.map((planItem) => (
              <TopUpCreditCard
                key={planItem.id}
                plan={planItem}
                displayPrice={isAndroidCheckout ? creditPackageDisplayPrice('android', planItem, googlePlay.products[planItem.id]) : undefined}
                hideRate={isAndroidCheckout}
                selected={selectedPlan.id === planItem.id}
                style={topUpCreditCardStyle}
                onPress={() => setSelectedTopUpId(planItem.id)}
              />
            ))}
          </View>
        )
      ) : (
        <View style={[styles.creditChoiceGrid, layout.isTablet && styles.creditResponsiveGrid]}>
          {isAppleCheckout ? (
            <AppleStoreKitCreditCard
              product={appleSubscriptionProduct}
              selected={mode === 'subscription'}
              active={activeAppleMonthly}
              title="Lookmefy Premium Monthly"
              kicker="LOOKMEFY PREMIUM"
              headline={`${subscriptionPlan.credits} credits every month`}
              subhead="Auto-renewable monthly subscription"
              description="Renews through your Apple ID. Monthly credits are added once per verified Apple subscription period."
              style={creditChoiceCardStyle}
              onPress={() => setMode('subscription')}
            />
          ) : (
            <MonthlyCreditCard plan={subscriptionPlan} selected={mode === 'subscription'} active={activeMonthly} style={creditChoiceCardStyle} showMandateTerms={showMandateTermsForPlatform(Platform.OS)} onPress={() => setMode('subscription')} />
          )}
          <AddMoreCard selected={false} style={creditChoiceCardStyle} plans={topUpPlans} onPress={() => setMode('top_up')} />
        </View>
      ))}

      {!plansError && !plansLoading && mode === 'subscription' ? <View style={styles.creditsSubscriptionStatus}><Text style={styles.creditsBalanceLabel}>SUBSCRIPTION STATUS</Text><Text style={styles.creditsSubscriptionStatusText}>{creditSubscriptionStatus(subscription)}</Text></View> : null}

      <View style={styles.creditsDivider} />

      <Text style={styles.creditsSectionLabel}>Billing Provider</Text>
      <View style={styles.paymentMethodCard}>
        <View style={styles.paymentMethodLeft}>
          {isAppleCheckout ? (
            <View style={styles.appStoreMark}>
              <Ionicons name="logo-apple" size={19} color="#ffffff" />
            </View>
          ) : <View style={styles.appStoreMark}><Ionicons name="card-outline" size={19} color="#ffffff" /></View>}
          <View style={styles.paymentMethodCopy}>
            <Text style={styles.paymentMethodText}>{isAppleCheckout ? 'App Store' : isAndroidCheckout ? 'Google Play' : 'Razorpay'}</Text>
            <Text style={styles.paymentMethodSubText}>{isAppleCheckout ? 'Apple ID billing' : isAndroidCheckout ? 'Google Play Billing' : 'UPI, cards, and net banking'}</Text>
          </View>
        </View>
        <Text style={styles.paymentSelectedText}>{plansError || isAndroidCheckout && mode !== 'top_up' || !purchaseAvailability.available ? 'Unavailable' : 'Available'}</Text>
      </View>

      {!plansError && !plansLoading ? <View style={styles.orderSummaryCard}>
        <Text style={styles.orderSummaryTitle}>Order Summary</Text>
        <Text style={styles.orderSummaryKicker}>SELECTED PACK</Text>
        <View style={styles.orderSummaryDivider} />
        {isAppleCheckout ? (
          <>
            <PaymentSummaryLine label="Credit Package" value={mode === 'top_up' ? `${selectedTopUp.credits} credit top-up` : storeKitProductTitle(appleStoreKit.subscriptionProduct, 'Lookmefy Premium Monthly')} strong />
            <PaymentSummaryLine label="Credits" value={mode === 'top_up' ? `${selectedTopUp.credits} credits` : `${subscriptionPlan.credits} credits every month`} strong />
            <PaymentSummaryLine label="Apple Price" value={appleSelectedPrice} strong />
            <PaymentSummaryLine label="Billing" value={mode === 'top_up' ? 'One-time consumable' : 'Monthly auto-renewing'} strong />
            <PaymentSummaryLine label="Product ID" value={appleSelectedProductId || 'Unavailable'} strong />
          </>
        ) : (
          <>
            <PaymentSummaryLine label="Credit Package" value={mode === 'top_up' ? 'Top-up' : subscriptionPlan.name} strong />
            <PaymentSummaryLine label="Credits" value={mode === 'top_up' ? `${selectedPlan.credits} credits` : `${subscriptionPlan.credits} credits every month`} strong />
            {!isAndroidCheckout && <PaymentSummaryLine label="Rate" value={formatCreditRate(selectedPlan)} strong />}
            {mode === 'top_up' ? (
              <>
                <PaymentSummaryLine label="Billing" value="One-time" strong />
                {!isAndroidCheckout && <PaymentSummaryLine label="Processing Fee" value="Free" strong />}
              </>
            ) : isAndroidCheckout ? (
              <PaymentSummaryLine label="Billing" value="Monthly subscriptions are unavailable on Android." />
            ) : (
              <>
                <PaymentSummaryLine label="Setup charge" value={terms.valid ? formatMoney(terms.setup / 100, selectedPlan.currency) : terms.message} strong />
                {terms.valid && <PaymentSummaryLine label="Recurring charge" value={`${formatMoney(terms.recurring / 100, selectedPlan.currency)}/${recurringPeriodLabel(terms.frequency)}`} strong />}
                {terms.valid && <PaymentSummaryLine label="First renewal" value={terms.timing} />}
                {terms.valid && <PaymentSummaryLine label="Renewal" value={terms.renewal} />}
                {terms.valid && <PaymentSummaryLine label="Cancellation" value={terms.cancellation} />}
              </>
            )}
          </>
        )}
        <View style={styles.orderSummaryDivider} />
        <View style={styles.orderSummaryTotalRow}>
          <Text style={styles.totalAmountLabel}>{isAppleCheckout ? 'APP STORE PRICE' : isAndroidCheckout ? 'GOOGLE PLAY PRICE' : mode === 'top_up' ? 'TOTAL AMOUNT' : 'SETUP CHARGE TODAY'}</Text>
          <Text style={styles.totalAmountValue}>{isAppleCheckout ? appleSelectedPrice : isAndroidCheckout ? mode === 'top_up' ? creditPackageDisplayPrice('android', selectedTopUp, selectedStoreProduct) : 'Unavailable' : mode === 'top_up' ? formatMoney(selectedAmount, selectedPlan.currency) : terms.valid ? formatMoney(terms.setup / 100, selectedPlan.currency) : 'Unavailable'}</Text>
        </View>
      </View> : null}

      {!isAppleCheckout && !isAndroidCheckout && activeMonthly && mode === 'subscription' ? (
        <TouchableOpacity style={[styles.cancelMandateButton, cancelLoading && styles.disabledButton]} activeOpacity={0.82} disabled={cancelLoading} onPress={cancelSubscription}>
          <Text style={styles.cancelMandateText}>{cancelLoading ? 'CANCELLING...' : 'CANCEL MONTHLY BILLING'}</Text>
        </TouchableOpacity>
      ) : null}

      {visibleMessage ? <Text accessibilityLiveRegion="polite" style={[styles.creditsMessage, messageIsError ? styles.errorText : null]}>{visibleMessage}</Text> : null}

      {isAppleCheckout ? (
        <AppleStoreKitActions mode={mode} appleStoreKit={appleStoreKit} activeMonthly={activeAppleMonthly} selectedTopUp={selectedTopUp} advertisedProductIds={advertisedAppleTopUpProductIds} subscriptionProduct={appleSubscriptionProduct} plansError={plansError} plansLoading={plansLoading} />
      ) : isAndroidCheckout ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={googlePlay.busy ? 'Verifying purchase' : mode !== 'top_up' ? 'Monthly billing unavailable' : plansLoading ? 'Loading credit plans' : plansError || !purchaseAvailability.available ? 'Credit purchases unavailable' : 'Buy with Google Play'} accessibilityState={{ disabled: plansLoading || plansError || !purchaseAvailability.available || mode !== 'top_up', busy: googlePlay.busy }} style={[styles.secureCheckoutButton, (plansLoading || plansError || !purchaseAvailability.available || mode !== 'top_up') && styles.disabledButton]} activeOpacity={0.88} disabled={plansLoading || plansError || !purchaseAvailability.available || mode !== 'top_up'} onPress={() => googlePlay.purchase(selectedTopUp.id)}>
          <Text style={styles.secureCheckoutText}>{googlePlay.busy ? 'VERIFYING PURCHASE' : mode !== 'top_up' ? 'MONTHLY BILLING UNAVAILABLE' : plansLoading ? 'LOADING PLANS' : plansError || !purchaseAvailability.available ? 'PURCHASES UNAVAILABLE' : 'BUY WITH GOOGLE PLAY'}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.secureCheckoutButton, (plansLoading || plansError || checkoutLoading || (mode === 'subscription' && !terms.valid)) && styles.disabledButton]} activeOpacity={0.88} disabled={plansLoading || plansError || checkoutLoading || (mode === 'subscription' && !terms.valid)} onPress={startCheckout}>
          <Text style={styles.secureCheckoutText}>{plansLoading ? 'LOADING PLANS' : checkoutLoading ? 'OPENING RAZORPAY' : mode === 'top_up' ? 'SECURE CHECKOUT' : 'SET UP MONTHLY'}</Text>
        </TouchableOpacity>
      )}

      {!isAppleCheckout && !isAndroidCheckout && pendingOrderId ? (
        <TouchableOpacity style={styles.verifyPaymentButton} activeOpacity={0.82} onPress={() => verifyPaymentOrder(pendingOrderId)}>
          <Ionicons name="refresh" size={16} color="#5e3335" />
          <Text style={styles.verifyPaymentText}>VERIFY RAZORPAY PAYMENT</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.creditsHistorySection}>
        <Text style={styles.creditsHistoryHeading}>Credit History</Text>
        <Text style={styles.creditsSectionDescription}>Your recent verified credit activity.</Text>
        {creditHistory.loading ? <CreditHistorySkeleton /> : null}
        {!creditHistory.loading && creditHistory.error ? <><Text style={styles.creditsStateText}>Credit history is unavailable. Please try again.</Text><TouchableOpacity accessibilityRole="button" onPress={creditHistory.reload}><Text style={styles.creditsRetryText}>Retry history</Text></TouchableOpacity></> : null}
        {!creditHistory.loading && !creditHistory.error && !creditEvents.length ? <Text style={styles.creditsStateText}>No credit activity yet.</Text> : null}
        {!creditHistory.loading && !creditHistory.error ? creditEvents.map((event) => (
          <View key={event.id} style={styles.creditsHistoryRow} accessibilityLabel={`${event.action || 'Credit activity'}, ${creditHistoryAmountLabel(event)} credits, ${formatDate(event.createdAt)}`}>
            <View style={styles.creditsHistoryCopy}>
              <Text style={styles.creditsHistoryTitle}>{event.action || 'Credit activity'}</Text>
              <Text style={styles.creditsHistoryMeta}>{creditHistoryProductLabel(event)} · {formatDate(event.createdAt)}</Text>
            </View>
            <Text style={styles.creditsHistoryAmount}>{creditHistoryAmountLabel(event)}</Text>
          </View>
        )) : null}
      </View>

      <View style={styles.creditsFooterLinks}>
        <TouchableOpacity accessibilityRole="link" accessibilityLabel="Refund policy" style={styles.releaseLegalAction} activeOpacity={0.75} onPress={() => onNavigate('info', { page: 'returns' })}>
          <Text style={styles.creditsFooterLink}>REFUNDS</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="link" accessibilityLabel="Cancellation policy" style={styles.releaseLegalAction} activeOpacity={0.75} onPress={() => onNavigate('info', { page: 'cancellation' })}>
          <Text style={styles.creditsFooterLink}>CANCELLATION</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="link" accessibilityLabel="Help center" style={styles.releaseLegalAction} activeOpacity={0.75} onPress={() => onNavigate('info', { page: 'support' })}>
          <Text style={styles.creditsFooterLink}>HELP CENTER</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  );
}

function formatDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatFileSize(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return 'Saved';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

const wishlistFilterTabs = [
  { key: 'all', label: 'All Items' },
  { key: 'clothing', label: 'Clothing' },
  { key: 'footwear', label: 'Footwear' },
  { key: 'accessories', label: 'Accessories' }
];

const wishlistSortOptions = [
  { key: 'recent', label: 'Recently Added' },
  { key: 'oldest', label: 'Oldest Added' },
  { key: 'price-low', label: 'Price Low to High' },
  { key: 'price-high', label: 'Price High to Low' },
  { key: 'brand', label: 'Brand A-Z' }
];

function wishlistProductGroup(product = {}) {
  const category = [product.category, product.subcategory, product.type].join(' ').toLowerCase();
  const text = [
    product.category,
    product.subcategory,
    product.type,
    product.displayLabel,
    product.title,
    product.name
  ].join(' ').toLowerCase();
  if (/(?:footwear|shoe|sneaker|sandal|heel|loafer|boot|slipper|mule)/.test(category)) return 'footwear';
  if (/(?:accessor(?:y|ies)|jewel(?:ry|lery)|watch|eyewear|glass|bag|purse|belt|wallet|scarf|hat|cap)/.test(category)) return 'accessories';
  if (/(?:\bbottomwear\b|\bbottoms?\b|\bjeans?\b|\bdenim\b|\bpants?\b|\btrousers?\b|\bshorts?\b|\bskirts?\b|\bleggings?\b|\bpalazzos?\b)/.test(text)) return 'clothing';
  if (/(?:\btops?\b|\bshirts?\b|\bt-?shirts?\b|\bkurtas?\b|\bdresses?\b|\bsarees?\b|\bsuits?\b|\bjackets?\b|\bouterwear\b|\bactivewear\b|\bethnic\b|\bclothing\b)/.test(text)) return 'clothing';
  if (/(?:footwear|shoe|sneaker|sandal|heel|loafer|boot|slipper|toe|pump|flat|mule)/.test(text)) return 'footwear';
  if (/(?:\baccessor(?:y|ies)\b|\bjewel(?:ry|lery)?\b|\bearrings?\b|\bpiercings?\b|\bchains?\b|\bnecklaces?\b|\bbracelets?\b|\bwatches?\b|\beyewear\b|\bsunglasses?\b|\bglasses?\b|\bbags?\b|\bpurses?\b|\bbelts?\b|\bwallets?\b|\bscarves?\b|\bhats?\b|\bcaps?\b)/.test(text)) return 'accessories';
  return 'other';
}

function wishlistSavedTime(product = {}, index = 0, total = 0) {
  const candidate = product.wishlistAddedAt || product.savedAt || product.addedAt || product.createdAt || product.updatedAt;
  const time = candidate ? new Date(candidate).getTime() : NaN;
  return Number.isFinite(time) ? time : total - index;
}

function WishlistScreen({ onNavigate, onBack, token, wishlistProducts = [], wishlistReady, wishlistLoadError, wishlistMutatingId, onRetryWishlist, user, onRemoveFromWishlist }) {
  const layout = useResponsiveLayout();
  const { fontScale = 1 } = useWindowDimensions();
  const [activeFilter, setActiveFilter] = useState('all');
  const [wishlistViewMode, setWishlistViewMode] = useState('grid');
  const [requestedGridColumns, setRequestedGridColumns] = useState(2);
  const [wishlistSortKey, setWishlistSortKey] = useState('recent');
  const [wishlistSortOpen, setWishlistSortOpen] = useState(false);
  const wishlistGridColumns = wishlistGridColumnsForWidth(layout.windowWidth, requestedGridColumns);
  const forceReadableList = layout.windowWidth <= 340 && fontScale >= 1.2;
  const displayedViewMode = forceReadableList ? 'list' : wishlistViewMode;
  const recommended = useProducts({ sort: 'newest', limit: 6 }, token);
  const availableFilterTabs = useMemo(() => {
    const savedGroups = new Set(wishlistProducts.map(wishlistProductGroup));
    return wishlistFilterTabs.filter((tab) => tab.key === 'all' || savedGroups.has(tab.key));
  }, [wishlistProducts]);
  const visibleFilter = availableFilterTabs.some((tab) => tab.key === activeFilter) ? activeFilter : 'all';
  useEffect(() => { if (activeFilter !== visibleFilter) setActiveFilter(visibleFilter); }, [activeFilter, visibleFilter]);
  const activeFilterLabel = availableFilterTabs.find((tab) => tab.key === visibleFilter)?.label || 'All Items';
  const activeSortLabel = wishlistSortOptions.find((option) => option.key === wishlistSortKey)?.label || 'Recently Added';
  const wishlistSortHeading = visibleFilter === 'all' ? activeSortLabel : `${activeFilterLabel} • ${activeSortLabel}`;
  const displayedWishlistProducts = useMemo(() => {
    const decorated = wishlistProducts.map((product, index) => ({
      product,
      index,
      group: wishlistProductGroup(product),
      savedTime: wishlistSavedTime(product, index, wishlistProducts.length)
    }));
    return decorated
      .filter((item) => visibleFilter === 'all' || item.group === visibleFilter)
      .sort((a, b) => {
        if (wishlistSortKey === 'oldest') return a.savedTime - b.savedTime || a.index - b.index;
        if (wishlistSortKey === 'price-low' || wishlistSortKey === 'price-high') {
          const aPrice = wishlistPriceValue(a.product.price);
          const bPrice = wishlistPriceValue(b.product.price);
          if (aPrice === null) return bPrice === null ? a.index - b.index : 1;
          if (bPrice === null) return -1;
          return (wishlistSortKey === 'price-low' ? aPrice - bPrice : bPrice - aPrice) || a.index - b.index;
        }
        if (wishlistSortKey === 'brand') return String(a.product.displayLabel || a.product.brand || '').localeCompare(String(b.product.displayLabel || b.product.brand || '')) || a.index - b.index;
        return b.savedTime - a.savedTime || a.index - b.index;
      })
      .map((item) => item.product);
  }, [visibleFilter, wishlistProducts, wishlistSortKey]);
  const filteredEmpty = Boolean(wishlistProducts.length) && !displayedWishlistProducts.length;
  return (
    <>
      <View style={styles.wishlistScreen}>
        <AppHeader onNavigate={onNavigate} user={user} compact />
        <ScrollView style={styles.flex} contentContainerStyle={styles.wishlistContent} {...screenScrollProps}>
        <PageBackRow onBack={onBack} />

        <View style={styles.wishlistBody}>
          <Text style={styles.wishlistEyebrow}>YOUR SAVED EDIT</Text>
          <Text style={styles.wishlistTitle}>My Wishlist</Text>
          <Text style={styles.wishlistSubtitle}>Pieces you've saved, all in one place.</Text>
          {wishlistReady && !wishlistLoadError ? <Text style={styles.wishlistCount}>{wishlistProducts.length} saved {wishlistProducts.length === 1 ? 'piece' : 'pieces'}</Text> : null}
        {wishlistReady && !wishlistLoadError && wishlistProducts.length ? <><ScrollView {...horizontalScrollProps} contentContainerStyle={styles.wishlistTabs}>
          {availableFilterTabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              accessibilityRole="button"
              accessibilityState={{ selected: visibleFilter === tab.key }}
              activeOpacity={0.78}
              style={[styles.wishlistTab, { minWidth: wishlistFilterTabMinWidth(tab.label, fontScale) }]}
              onPress={() => setActiveFilter(tab.key)}
            >
              <Text style={[styles.wishlistTabText, visibleFilter === tab.key && styles.wishlistTabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.wishlistSortRow}>
          <Text style={styles.wishlistSortText}>Sort: <Text style={styles.wishlistSortStrong}>{wishlistSortHeading}</Text></Text>
          <View style={styles.wishlistViewToggle}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={forceReadableList ? 'Grid unavailable at this text size' : layout.windowWidth >= 600 ? `Change wishlist grid size, currently ${wishlistGridColumns} columns` : 'Show two-column wishlist grid'}
              accessibilityState={{ selected: displayedViewMode === 'grid', disabled: forceReadableList }}
              activeOpacity={0.78}
              disabled={forceReadableList}
              style={[styles.wishlistViewButton, displayedViewMode === 'grid' && styles.wishlistViewButtonActive]}
              onPress={() => {
                setWishlistViewMode('grid');
                if (layout.windowWidth >= 600) setRequestedGridColumns((current) => (current === 2 ? 3 : 2));
                setWishlistSortOpen(false);
              }}
            >
              <Ionicons name="grid-outline" size={17} color={displayedViewMode === 'grid' ? '#ffffff' : '#625C56'} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Organize wishlist"
              accessibilityState={{ expanded: wishlistSortOpen, selected: displayedViewMode === 'list' }}
              activeOpacity={0.78}
              style={[styles.wishlistViewButton, displayedViewMode === 'list' && styles.wishlistViewButtonActive]}
              onPress={() => {
                setWishlistViewMode('list');
                setWishlistSortOpen((current) => !current);
              }}
            >
              <Ionicons name="list-outline" size={19} color={displayedViewMode === 'list' ? '#ffffff' : '#625C56'} />
            </TouchableOpacity>
          </View>
        </View>

        {wishlistSortOpen ? (
          <View style={styles.wishlistSortMenu}>
            {wishlistSortOptions.map((option) => (
              <TouchableOpacity
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected: wishlistSortKey === option.key }}
                activeOpacity={0.8}
                style={[styles.wishlistSortOption, wishlistSortKey === option.key && styles.wishlistSortOptionActive]}
                onPress={() => {
                  setWishlistSortKey(option.key);
                  setWishlistSortOpen(false);
                }}
              >
                <Text style={[styles.wishlistSortOptionText, wishlistSortKey === option.key && styles.wishlistSortOptionTextActive]}>{option.label}</Text>
                {wishlistSortKey === option.key ? <Ionicons name="checkmark" size={16} color="#ffffff" /> : null}
              </TouchableOpacity>
            ))}
          </View>
        ) : null}</> : null}

        {!wishlistReady ? <View style={styles.wishlistStatusPanel}><ActivityIndicator color="#9B5658" /><Text style={styles.wishlistStatusText}>Loading your saved pieces...</Text></View> : wishlistLoadError ? (
          <View style={styles.wishlistStatusPanel}>
            <Text style={styles.wishlistEmptyTitle}>Couldn't load your wishlist.</Text>
            <Text style={styles.wishlistStatusText}>Your saved items are unchanged. Please try again.</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.wishlistEmptyAction} onPress={onRetryWishlist}><Text style={styles.wishlistEmptyActionText}>Retry</Text></TouchableOpacity>
          </View>
        ) : <View style={[styles.wishlistGrid, displayedViewMode === 'list' && styles.wishlistList]}>
          {displayedWishlistProducts.length ? displayedWishlistProducts.map((product) => (
            <WishlistProductCard key={product.id} product={product} removing={wishlistMutatingId === String(product.id)} viewMode={displayedViewMode} gridColumns={wishlistGridColumns} onPress={() => onNavigate('product', { id: product.id })} onRemove={() => onRemoveFromWishlist?.(product)} />
          )) : (
            <View style={styles.wishlistEmptyState}>
              <View style={styles.wishlistEmptyIcon}><Ionicons name="heart-outline" size={25} color="#625C56" /></View>
              <Text style={styles.wishlistEmptyTitle}>{filteredEmpty ? `No ${activeFilterLabel.toLowerCase()} saved yet.` : 'Your collection starts here.'}</Text>
              <Text style={styles.wishlistEmptyText}>{filteredEmpty ? 'Try another category to see your saved pieces.' : 'Save pieces you love and revisit them anytime.'}</Text>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Explore styles" style={styles.wishlistEmptyAction} onPress={() => onNavigate('shop')}>
                <Text style={styles.wishlistEmptyActionText}>Explore Styles</Text><Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}
        </View>}

        <View style={styles.wishlistProCard}>
          <Text style={styles.wishlistProBadge}>STYLE STUDIO</Text>
          <Text style={styles.wishlistProTitle}>See it your way.</Text>
          <Text style={styles.wishlistProText}>Explore available AI try-on options and credits.</Text>
          <TouchableOpacity style={styles.wishlistUpgradeButton} onPress={() => onNavigate('tokens')}>
            <Text style={styles.wishlistUpgradeText}>Explore Credits</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.wishlistSectionTitle}>You May Also Like</Text>
        <ScrollView {...horizontalScrollProps} contentContainerStyle={styles.wishlistRecommendedTrack}>
          {recommended.loading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <View key={`wishlist-recommended-skeleton-${index}`} style={styles.wishlistRecommendedCard}>
                <View style={styles.wishlistRecommendedImage}>
                  <SkeletonBlock style={styles.skeletonFill} />
                </View>
                <SkeletonBlock style={[styles.skeletonTextMedium, styles.wishlistRecommendedSkeletonLine]} />
                <SkeletonBlock style={[styles.skeletonTextSmall, styles.wishlistRecommendedSkeletonLine]} />
              </View>
            ))
          ) : recommended.error || !recommended.products.length ? (
            <StatusPanel error={recommended.error} empty={!recommended.products.length} text="No recommended products yet." />
          ) : recommended.products.slice(0, 4).map((product) => {
            const price = wishlistPriceValue(product.price);
            return (
            <TouchableOpacity key={product.id} style={styles.wishlistRecommendedCard} onPress={() => onNavigate('product', { id: product.id })}>
              <ProductImage product={product} style={styles.wishlistRecommendedImage} alt={product.title || product.name} />
              <Text style={styles.wishlistRecommendedBrand} numberOfLines={1}>{product.displayLabel || titleCase(product.category || 'Catalog')}</Text>
              <Text style={styles.wishlistRecommendedPrice}>{price !== null ? formatMoney(price, product.currency) : 'Price unavailable'}</Text>
            </TouchableOpacity>
            );
          })}
        </ScrollView>
        </View>
      </ScrollView>
      </View>

    </>
  );
}

function collectionProducts(collection, wishlistProducts = []) {
  const ids = new Set((collection?.productIds || []).map(String));
  return wishlistProducts.filter((product) => ids.has(String(product.id)));
}

function CollectionsScreen({ onNavigate, onBack, user, collections = [], wishlistProducts = [] }) {
  const [selectedCollectionId, setSelectedCollectionId] = useState(collections[0]?.id || '');

  useEffect(() => {
    if (!collections.length) {
      setSelectedCollectionId('');
      return;
    }
    if (!collections.some((collection) => collection.id === selectedCollectionId)) {
      setSelectedCollectionId(collections[0].id);
    }
  }, [collections, selectedCollectionId]);

  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId) || collections[0] || null;
  const selectedProducts = collectionProducts(selectedCollection, wishlistProducts);

  return (
    <View style={styles.collectionsScreen}>
      <AppHeader onNavigate={onNavigate} user={user} compact />
      <ScrollView style={styles.flex} contentContainerStyle={styles.collectionsContent} {...screenScrollProps}>
      <PageBackRow onBack={onBack} />

      <View style={styles.collectionsHero}>
        <Text style={styles.collectionsEyebrow}>Saved groups</Text>
        <Text style={styles.collectionsTitle}>My Collections</Text>
        <Text style={styles.collectionsText}>Your previously saved groups are here.</Text>
      </View>

      {collections.length ? (
        <ScrollView {...horizontalScrollProps} contentContainerStyle={styles.collectionCardsTrack}>
          {collections.map((collection) => {
            const products = collectionProducts(collection, wishlistProducts);
            const selected = collection.id === selectedCollection?.id;
            return (
              <TouchableOpacity key={collection.id} style={[styles.collectionSummaryCard, selected && styles.collectionSummaryCardActive]} activeOpacity={0.86} onPress={() => setSelectedCollectionId(collection.id)}>
                <View style={styles.collectionSummaryThumbs}>
                  {products.slice(0, 3).map((product) => (
                    <ProductImage key={product.id} product={product} style={styles.collectionSummaryThumb} resizeMode="cover" alt={product.title || product.name} />
                  ))}
                  {!products.length ? (
                    <View style={styles.collectionSummaryEmptyThumb}>
                      <Ionicons name="albums-outline" size={22} color="#9b5658" />
                    </View>
                  ) : null}
                </View>
                <Text style={styles.collectionSummaryTitle} numberOfLines={1}>{collection.name}</Text>
                <Text style={styles.collectionSummaryMeta}>{products.length} item{products.length === 1 ? '' : 's'}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.collectionsEmptyWrap}>
          <EmptyStateCard
            icon="albums-outline"
            title="No collections yet"
            text="Your saved pieces are available in My Wishlist."
            actionLabel="Open Wishlist"
            onAction={() => onNavigate('wishlist')}
          />
        </View>
      )}

      {selectedCollection ? (
        <View style={styles.collectionDetailBlock}>
          <View style={styles.collectionDetailHead}>
            <View>
              <Text style={styles.collectionDetailTitle}>{selectedCollection.name}</Text>
              <Text style={styles.collectionDetailMeta}>{selectedProducts.length} saved style{selectedProducts.length === 1 ? '' : 's'}</Text>
            </View>
          </View>

          <View style={styles.collectionProductGrid}>
            {selectedProducts.length ? selectedProducts.map((product) => (
              <WishlistProductCard key={product.id} product={product} onPress={() => onNavigate('product', { id: product.id })} />
            )) : (
              <EmptyStateCard compact icon="heart-outline" title="No saved items in this group" text="Items removed from your wishlist no longer appear here." />
            )}
          </View>
        </View>
      ) : null}
      </ScrollView>
    </View>
  );
}

function WishlistProductCard({ product, onPress, onRemove, removing = false, viewMode = 'grid', gridColumns = 2 }) {
  const price = wishlistPriceValue(product?.price);
  const listMode = viewMode === 'list';
  const compactGrid = !listMode && gridColumns === 3;
  const handleRemove = (event) => {
    event?.stopPropagation?.();
    onRemove?.();
  };
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${product?.title || product?.name || 'Saved product'}, ${price !== null ? formatMoney(price, product?.currency) : 'price unavailable'}`} style={[styles.wishlistProductCard, compactGrid && styles.wishlistProductCardCompact, listMode && styles.wishlistProductCardList]} activeOpacity={0.86} onPress={onPress}>
      <View style={[styles.wishlistProductImageWrap, listMode && styles.wishlistProductImageWrapList]}>
        <ProductImage product={product} style={styles.wishlistProductImage} resizeMode="contain" alt={product?.title || product?.name} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${product?.title || product?.name || 'product'} from wishlist`} accessibilityState={{ selected: true, busy: removing, disabled: removing }} disabled={removing} activeOpacity={0.84} style={styles.wishlistHeartButton} onPress={handleRemove}>
          {removing ? <ActivityIndicator size="small" color="#9B5658" /> : <Ionicons name="heart" size={21} color="#9B5658" />}
        </TouchableOpacity>
      </View>
      <View style={listMode && styles.wishlistProductCopyList}>
        <Text style={[styles.wishlistProductBrand, compactGrid && styles.wishlistProductBrandCompact, listMode && styles.wishlistProductBrandList]} numberOfLines={1}>{product?.displayLabel || titleCase(product?.category || 'Catalog')}</Text>
        <Text style={[styles.wishlistProductName, compactGrid && styles.wishlistProductNameCompact, listMode && styles.wishlistProductNameList]} numberOfLines={listMode ? 3 : 2}>{product?.title || product?.name}</Text>
        <Text style={[styles.wishlistProductPrice, compactGrid && styles.wishlistProductPriceCompact]}>{price !== null ? formatMoney(price, product?.currency) : 'Price unavailable'}</Text>
        <TouchableOpacity style={[styles.wishlistMoveButton, compactGrid && styles.wishlistMoveButtonCompact, listMode && styles.wishlistMoveButtonList]} onPress={onPress}>
          <Text style={styles.wishlistMoveText}>View Product</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const checkoutStates = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

function CheckoutField({ label, value, onChangeText, placeholder = '', keyboardType = 'default', maxLength, wide = false }) {
  return <View style={[styles.checkoutField, wide && styles.checkoutFieldWide]}>
    <Text style={styles.checkoutFieldLabel}>{label}</Text>
    <TextInput accessibilityLabel={label} style={styles.checkoutInput} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#9b938f" keyboardType={keyboardType} maxLength={maxLength} autoCorrect={false} />
  </View>;
}

function CheckoutScreen({ productId, user, onNavigate, onBack }) {
  const layout = useResponsiveLayout();
  const [productState, setProductState] = useState({ loading: true, product: null, error: '' });
  const [config, setConfig] = useState({ loading: true, enabled: false, error: '' });
  const [form, setForm] = useState({ fullName: user?.name || '', mobile: user?.phone || user?.mobile || '', houseStreet: '', area: '', landmark: '', city: '', state: '', pincode: '' });
  const [statesOpen, setStatesOpen] = useState(false);
  const [pinStatus, setPinStatus] = useState('');
  const [pinServiceable, setPinServiceable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState('');
  const [error, setError] = useState('');
  const [completedOrder, setCompletedOrder] = useState(null);
  const update = (field) => (value) => setForm((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    let active = true;
    Promise.allSettled([api(`/products/${encodeURIComponent(productId)}`), api('/storefront/config', { noCache: true })]).then(([productResult, configResult]) => {
      if (!active) return;
      setProductState(productResult.status === 'fulfilled'
        ? { loading: false, product: productResult.value?.product && !isMarketplaceProduct(productResult.value.product) ? normalizeProduct(productResult.value.product) : null, error: '' }
        : { loading: false, product: null, error: productResult.reason?.message || 'Could not load product.' });
      setConfig(configResult.status === 'fulfilled'
        ? { loading: false, enabled: configResult.value?.demoEcommerceMode === true, error: '' }
        : { loading: false, enabled: false, error: configResult.reason?.message || 'Could not check checkout availability.' });
    });
    return () => { active = false; };
  }, [productId]);

  useEffect(() => {
    const pincode = form.pincode;
    if (!/^\d{6}$/.test(pincode)) { setPinStatus(''); setPinServiceable(false); return undefined; }
    let active = true;
    setPinStatus('Checking delivery area…');
    setPinServiceable(false);
    api(`/orders/pincode/${pincode}`, { noCache: true }).then((pin) => {
      if (!active) return;
      setPinServiceable(Boolean(pin?.serviceable));
      setPinStatus(pin?.serviceable ? `Delivering to ${pin.city || pin.district || pin.state}.` : 'This pincode is not serviceable yet.');
      if (pin?.serviceable) setForm((current) => ({ ...current, city: current.city || pin.city || '', state: current.state || pin.state || '' }));
    }).catch((requestError) => { if (active) setPinStatus(requestError.message || 'Could not check pincode.'); });
    return () => { active = false; };
  }, [form.pincode]);

  const product = productState.product;
  const price = Number(product?.price);
  const canOrder = Boolean(config.enabled && product?.id && Number.isFinite(price) && price > 0);
  const confirmOrder = async () => {
    if (submitting || !canOrder) return;
    const required = ['fullName', 'mobile', 'houseStreet', 'city', 'state', 'pincode'];
    if (required.some((field) => !String(form[field] || '').trim())) { setError('Complete all required contact and address fields.'); return; }
    if (!/^\d{6}$/.test(form.pincode) || !pinServiceable) { setError('Enter a serviceable 6-digit pincode.'); return; }
    setSubmitting(true); setError('');
    try {
      let orderId = pendingOrderId;
      if (!orderId) {
        const created = await api('/orders', { method: 'POST', body: JSON.stringify({
          items: [{ productId: product.id, quantity: 1, variant: 'Standard' }],
          contact: { fullName: form.fullName.trim(), mobile: form.mobile.trim() },
          address: { houseStreet: form.houseStreet.trim(), area: form.area.trim(), landmark: form.landmark.trim(), city: form.city.trim(), state: form.state, pincode: form.pincode }
        }) });
        if (!created?.order?.id) throw new Error('The order could not be created. Please try again.');
        orderId = created.order.id;
        setPendingOrderId(orderId);
      }
      const payment = await api(`/orders/${encodeURIComponent(orderId)}/demo-success`, { method: 'POST' });
      const order = payment?.order;
      if (order?.paymentStatus !== 'paid') throw new Error('Order confirmation is pending. Check My Orders before trying again.');
      setCompletedOrder(order);
    } catch (requestError) { setError(requestError.message || 'Could not confirm order.'); }
    finally { setSubmitting(false); }
  };

  return <View style={styles.checkoutScreen}>
    <ProductTopBar onNavigate={onNavigate} user={user} onBack={onBack} showSearch={false} />
    <ScrollView style={styles.flex} contentContainerStyle={[styles.checkoutContent, { maxWidth: layout.isTablet ? 1120 : 560 }]} {...screenScrollProps} keyboardShouldPersistTaps="handled">
      <Text style={styles.checkoutKicker}>SECURE CHECKOUT</Text>
      <Text style={styles.checkoutTitle}>Checkout</Text>
      <Text style={styles.checkoutSubtext}>For order and delivery updates</Text>
      {productState.loading || config.loading ? <ActivityIndicator style={styles.checkoutLoader} color="#a75d5c" /> : null}
      {productState.error || config.error ? <Text style={styles.errorText}>{productState.error || config.error}</Text> : null}
      {product && !config.enabled && !config.loading ? <View style={styles.checkoutNotice}><Text style={styles.checkoutNoticeText}>Product checkout is not enabled right now. You can save this item and return when ordering is available.</Text></View> : null}
      <View style={[styles.checkoutColumns, layout.isTablet && styles.checkoutColumnsTablet]}>
      {product || completedOrder ? <View style={styles.checkoutFormColumn}>
      {product && !completedOrder ? <>
        <View style={styles.checkoutFieldGrid}>
          <CheckoutField label="Full name" value={form.fullName} onChangeText={update('fullName')} />
          <CheckoutField label="Mobile number" value={form.mobile} onChangeText={update('mobile')} keyboardType="phone-pad" />
        </View>
        <View style={styles.checkoutDivider} /><Text style={styles.checkoutSectionTitle}>Delivery address</Text><Text style={styles.checkoutSubtext}>Currently delivering within India</Text>
        <View style={styles.checkoutFieldGrid}>
          <CheckoutField label="House / flat and street" value={form.houseStreet} onChangeText={update('houseStreet')} wide />
          <CheckoutField label="Area / locality (optional)" value={form.area} onChangeText={update('area')} />
          <CheckoutField label="Landmark (optional)" value={form.landmark} onChangeText={update('landmark')} />
          <CheckoutField label="City" value={form.city} onChangeText={update('city')} />
          <View style={styles.checkoutField}><Text style={styles.checkoutFieldLabel}>State</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose state" style={styles.checkoutInput} onPress={() => setStatesOpen((current) => !current)}><Text style={styles.checkoutStateText}>{form.state || 'Choose state'}</Text><Ionicons name="chevron-down" size={16} color="#625955" /></TouchableOpacity></View>
          {statesOpen ? <ScrollView nestedScrollEnabled style={styles.checkoutStateList}>{checkoutStates.map((state) => <TouchableOpacity key={state} style={styles.checkoutStateOption} onPress={() => { update('state')(state); setStatesOpen(false); }}><Text>{state}</Text></TouchableOpacity>)}</ScrollView> : null}
          <CheckoutField label="Pincode" value={form.pincode} onChangeText={(value) => update('pincode')(value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter a 6-digit pincode" keyboardType="number-pad" maxLength={6} />
        </View>
        {pinStatus ? <Text style={[styles.checkoutPinStatus, !pinServiceable && styles.errorText]}>{pinStatus}</Text> : null}
        <View style={styles.checkoutDivider} /><Text style={styles.checkoutSectionTitle}>Payment</Text><Text style={styles.checkoutSubtext}>Demo checkout</Text>
        <View style={styles.checkoutPaymentOption}><Ionicons name="radio-button-on" size={19} color="#a75d5c" /><View><Text style={styles.checkoutPaymentTitle}>Confirm demo order</Text><Text style={styles.checkoutPaymentDescription}>No payment will be collected.</Text></View></View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: submitting || !canOrder }} style={[styles.checkoutConfirmButton, (submitting || !canOrder) && styles.disabledButton]} disabled={submitting || !canOrder} onPress={confirmOrder}><Text style={styles.checkoutConfirmText}>{submitting ? 'Confirming order…' : canOrder ? 'Confirm demo order' : 'Checkout unavailable'}</Text></TouchableOpacity>
      </> : null}
      {completedOrder ? <View style={styles.checkoutSuccess}><Ionicons name="checkmark-circle" size={32} color="#29855b" /><Text style={styles.checkoutSectionTitle}>Order confirmed</Text><Text style={styles.checkoutSubtext}>Demo order #{String(completedOrder.id).slice(-8)} has been saved.</Text><TouchableOpacity onPress={() => onNavigate('orders')}><Text style={styles.checkoutOrdersLink}>View My Orders →</Text></TouchableOpacity></View> : null}
      </View> : null}
      {product ? <View style={[styles.checkoutSummary, layout.isTablet && styles.checkoutSummaryTablet]}>
        <Text style={styles.checkoutSectionTitle}>Order summary</Text>
        <View style={styles.checkoutItemRow}><ProductImage product={product} style={styles.checkoutProductImage} resizeMode="contain" alt={product.title || product.name} /><View style={styles.checkoutItemCopy}><Text style={styles.checkoutItemName} numberOfLines={2}>{product.title || product.name}</Text><Text style={styles.checkoutItemMeta}>{verifiedProductBrand(product) || 'Lookmefy'} · Qty 1</Text></View><Text style={styles.checkoutItemPrice}>{formatMoney(price, product.currency)}</Text></View>
        <View style={styles.checkoutTotalRow}><Text>Subtotal</Text><Text>{formatMoney(price, product.currency)}</Text></View>
        <View style={styles.checkoutTotalRow}><Text>Shipping</Text><Text>Free</Text></View>
        <View style={[styles.checkoutTotalRow, styles.checkoutGrandTotal]}><Text>Total</Text><Text>{formatMoney(price, product.currency)}</Text></View>
      </View> : null}
      </View>
    </ScrollView>
  </View>;
}

function OrdersScreen({ onNavigate, onBack, token, user }) {
  const popular = useProducts({ limit: 4, sort: 'newest' }, token);
  const popularProducts = popular.products.slice(0, 4);
  const [orderState, setOrderState] = useState({ loading: true, orders: [], error: '' });
  useEffect(() => {
    let active = true;
    api('/orders', { noCache: true }).then((data) => {
      if (active) setOrderState({ loading: false, orders: data.orders || [], error: '' });
    }).catch((error) => {
      if (active) setOrderState({ loading: false, orders: [], error: error.message || 'Could not load orders.' });
    });
    return () => { active = false; };
  }, [token]);

  return (
    <View style={styles.ordersScreen}>
      <AppHeader onNavigate={onNavigate} user={user} compact />
      <ScrollView style={styles.flex} contentContainerStyle={styles.ordersContent} {...screenScrollProps}>
      <PageBackRow onBack={onBack} />
      <View style={styles.ordersBody}>
        <Text style={styles.wishlistTitle}>My Orders</Text>
        {orderState.loading ? <ActivityIndicator color="#9b5658" /> : orderState.error ? <Text style={styles.errorText}>{orderState.error}</Text> : orderState.orders.length ? <View style={styles.checkoutOrderList}>{orderState.orders.map((order) => <View key={order.id} style={styles.checkoutOrderCard}><Text style={styles.checkoutItemName}>Order #{String(order.id).slice(-8)}</Text><Text style={styles.checkoutItemMeta}>{order.items?.map((item) => item.name).join(', ')}</Text><Text style={styles.checkoutItemMeta}>{order.paymentMode === 'demo' ? 'Demo order' : 'Product order'} · {order.fulfillmentStatus || order.paymentStatus}</Text><Text style={styles.checkoutItemPrice}>{formatMoney(order.total, order.currency)}</Text></View>)}</View> : <EmptyStateCard
          icon="receipt-outline"
          title="No orders yet"
          text="Your confirmed orders will show up here."
          actionLabel="Start Shopping"
          onAction={() => onNavigate('shop')}
        />}

        <View style={styles.ordersPopularSection}>
          <Text style={styles.ordersPopularTitle}>Popular right now</Text>
          {popular.loading ? (
            <View style={styles.ordersPopularGrid}>
              {Array.from({ length: 4 }).map((_, index) => (
                <View key={`orders-popular-skeleton-${index}`} style={styles.ordersPopularCard}>
                  <SkeletonBlock style={styles.ordersPopularImage} />
                  <SkeletonBlock style={styles.ordersPopularSkeletonLine} />
                  <SkeletonBlock style={styles.ordersPopularSkeletonShort} />
                </View>
              ))}
            </View>
          ) : popularProducts.length ? (
            <View style={styles.ordersPopularGrid}>
              {popularProducts.map((product) => {
                const price = Number(product.price);
                return (
                  <TouchableOpacity key={product.id} style={styles.ordersPopularCard} activeOpacity={0.86} onPress={() => onNavigate('product', { id: product.id })}>
                    <ProductImage product={product} style={styles.ordersPopularImage} resizeMode="cover" alt={product.title || product.name} />
                    <Text style={styles.ordersPopularBrand} numberOfLines={1}>{product.displayLabel || titleCase(product.category || 'Catalog')}</Text>
                    <Text style={styles.ordersPopularName} numberOfLines={2}>{product.title || product.name}</Text>
                    <Text style={styles.ordersPopularPrice}>{Number.isFinite(price) ? formatMoney(price, product.currency) : 'Price unavailable'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <Text style={styles.ordersPopularEmpty}>{popular.error || 'Popular picks are unavailable right now.'}</Text>
          )}
        </View>
      </View>
      </ScrollView>
    </View>
  );
}

function GenerationHistoryPreview({ items = [], total = 0, loading, error, onNavigate, style }) {
  const previewItems = items.slice(0, 4);
  const savedCount = Math.max(Number(total) || 0, previewItems.length);

  return (
    <View style={[styles.generationPreviewCard, style]}>
      <View style={styles.generationPreviewHead}>
        <View style={styles.generationPreviewTitleBlock}>
          <Text style={styles.generationPreviewTitle}>Generation History</Text>
          <Text style={styles.generationPreviewSubtitle}>View all AI try-on images you've created.</Text>
        </View>
        <View style={styles.generationPreviewIcon}>
          <Ionicons name="sparkles" size={16} color="#2b2321" />
        </View>
      </View>

      <View style={styles.generationPreviewThumbRow}>
        {loading ? Array.from({ length: 3 }).map((_, index) => (
          <SkeletonBlock key={`history-preview-skeleton-${index}`} style={styles.generationPreviewThumb} />
        )) : null}
        {!loading && previewItems.length ? previewItems.map((item) => (
          <Pressable key={item.id} style={styles.generationPreviewThumb} onPress={() => onNavigate('generation-history')}>
            <ResilientImage
              source={item.imageUrl ? { uri: imageUrl(item.imageUrl) } : null}
              fallbackSource={item.sourceImageUrl ? { uri: imageUrl(item.sourceImageUrl) } : null}
              style={styles.generationPreviewImage}
              resizeMode="cover"
              fallbackIcon="sparkles-outline"
            />
          </Pressable>
        )) : null}
        {!loading && !previewItems.length ? (
          <View style={styles.generationPreviewEmpty}>
            <Ionicons name="images-outline" size={20} color="#9b8f89" />
            <Text style={styles.generationPreviewEmptyText}>{error || 'Your saved try-ons will appear here.'}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.generationPreviewDivider} />
      <View style={styles.generationPreviewFooter}>
        <Text style={styles.generationPreviewCount}>{savedCount} saved creation{savedCount === 1 ? '' : 's'}</Text>
        <TouchableOpacity style={styles.generationPreviewButton} activeOpacity={0.84} onPress={() => onNavigate('generation-history')}>
          <Text style={styles.generationPreviewButtonText}>View History</Text>
          <Ionicons name="arrow-forward" size={14} color="#2b2321" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function GenerationHistoryScreen({ user, setUser, setToken, token, onNavigate, onBack }) {
  const history = useApiState('/tryons/history?limit=60', token, Boolean(user), { items: [], total: 0 });
  const [lightbox, setLightbox] = useState(null);

  if (!user) return <AuthScreen mode="login" setUser={setUser} setToken={setToken} onNavigate={onNavigate} />;

  const items = history.data?.items || [];
  const total = Math.max(Number(history.data?.total) || 0, items.length);

  const renderHistoryItem = ({ item }) => {
    const imageSource = item.imageUrl ? { uri: imageUrl(item.imageUrl) } : null;
    return (
      <View style={styles.generationGridCard}>
        <Pressable style={styles.generationGridImageWrap} onPress={() => item.imageUrl && setLightbox(imageUrl(item.imageUrl))}>
          <ResilientImage
            source={imageSource}
            retryOnFailure
            fallbackText="Saved try-on image could not load"
            style={styles.generationGridImage}
            resizeMode="cover"
            alt={item.title || 'Generated try-on'}
            fallbackIcon="sparkles-outline"
          />
          <View style={styles.generationGridBadge}>
            <Text style={styles.generationGridBadgeText}>{item.label || 'AI Try-On'}</Text>
          </View>
        </Pressable>
        <View style={styles.generationGridCopy}>
          <Text style={styles.generationGridTitle} numberOfLines={2}>{item.title || 'Generated try-on'}</Text>
          <ReportContentAction content={reportContentReference(item, ({ product: 'product_tryon', custom: 'custom_tryon', external: 'external_tryon' })[item.type])} />
          <Text style={styles.generationGridMeta} numberOfLines={1}>{item.subtitle || formatDate(item.createdAt)}</Text>
          <View style={styles.generationGridFooter}>
            <Text style={styles.generationGridDate}>{formatDate(item.createdAt)}</Text>
            {item.productId ? (
              <TouchableOpacity style={styles.generationGridProductButton} onPress={() => onNavigate('product', { id: item.productId })}>
                <Ionicons name="open-outline" size={13} color="#2b2321" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.generationHistoryScreen}>
      <AppHeader onNavigate={onNavigate} user={user} compact />
      <PageBackRow onBack={onBack} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={renderHistoryItem}
        columnWrapperStyle={items.length > 1 ? styles.generationGridRow : undefined}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.generationHistoryContent}
        ListHeaderComponent={(
          <View style={styles.generationHistoryHeader}>
            <View>
              <Text style={styles.generationHistoryTitle}>Generation History</Text>
              <Text style={styles.generationHistorySubtitle}>Your AI Try-On creations, all in one place.</Text>
              <Text style={styles.generationHistoryTotal}>{total} saved creation{total === 1 ? '' : 's'}</Text>
            </View>
            <TouchableOpacity style={styles.generationHistoryRefresh} activeOpacity={0.84} onPress={history.reload}>
              <Ionicons name="refresh" size={18} color="#2b2321" />
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={history.loading && items.length ? (
          <Text style={styles.generationHistoryFootnote}>Refreshing history...</Text>
        ) : null}
        ListEmptyComponent={history.loading ? (
          <View style={styles.generationGridSkeleton}>
            {Array.from({ length: 4 }).map((_, index) => (
              <View key={`generation-history-skeleton-${index}`} style={styles.generationGridCard}>
                <SkeletonBlock style={styles.generationGridImage} />
                <SkeletonBlock style={styles.generationGridSkeletonLine} />
                <SkeletonBlock style={styles.generationGridSkeletonShort} />
              </View>
            ))}
          </View>
        ) : (
          <EmptyStateCard
            icon={history.error ? 'alert-circle-outline' : 'sparkles-outline'}
            title={history.error ? 'History unavailable' : 'No generations yet'}
            text={history.error || 'Generate a try-on from any product or AI Studio to save it here.'}
            actionLabel="Start Trying On"
            onAction={() => onNavigate('tryon')}
          />
        )}
      />
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </View>
  );
}

function ProfileScreen({ user, setUser, setToken, token, onNavigate, onBack, onLogout, registerTourTarget, tourFocusRequest, collections = [] }) {
  const { width } = useWindowDimensions();
  const isTabletLayout = width >= 700;
  const [photo, setPhoto] = useState(null);
  const profilePhotoPickerRef = useRef(false);
  const profilePhotoUploadRef = useRef(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState('');
  const [editMessage, setEditMessage] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSheetVisible, setPasswordSheetVisible] = useState(false);
  const [passwordStage, setPasswordStage] = useState('idle');
  const [passwordOtp, setPasswordOtp] = useState('');
  const [passwordResetToken, setPasswordResetToken] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileConfirmPassword, setProfileConfirmPassword] = useState('');
  const [showProfilePassword, setShowProfilePassword] = useState(false);
  const [showProfileConfirmPassword, setShowProfileConfirmPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [creditHistoryExpanded, setCreditHistoryExpanded] = useState(false);
  const [accountDeleting, setAccountDeleting] = useState(false);
  const deletionRequestRef = useRef(false);
  const [deleteSheetVisible, setDeleteSheetVisible] = useState(false);
  const [deleteStep, setDeleteStep] = useState('review');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deleteReceipt, setDeleteReceipt] = useState('');
  const [deleteRequestId, setDeleteRequestId] = useState('');
  const profileScrollRef = useRef(null);
  const profileAvatarTourTarget = useTourTarget('profile-avatar', registerTourTarget, { request: tourFocusRequest, scrollRef: profileScrollRef, scrollOffset: 94 });
  const creditHistory = useApiState('/tryons/credit-history?limit=20', token, Boolean(user), { events: [] });
  const generationHistory = useApiState('/tryons/history?limit=12', token, Boolean(user), { items: [], total: 0 });

  if (!user) return <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={onNavigate} />;

  const avatarUri = userAvatarUrl(user);
  const previewUri = photo?.uri || (avatarUri ? imageUrl(avatarUri) : '');
  const photoSource = previewUri ? { uri: previewUri } : null;
  const profilePhotoResizeMode = photo?.uri ? 'cover' : userAvatarResizeMode(user);
  const profilePhotoImageStyle = photo?.uri ? styles.profileFaceImage : avatarImageStyleForUser(user, 88);
  const profilePhotoImageBaseStyle = photo?.uri ? null : avatarImageBaseStyleForUser(user);
  const username = user.username || '';
  const displayName = user.name || username || 'Lookmefy member';
  const accountPhone = authPhoneValue(user.phone || '');
  const accountPhoneLabel = accountPhone.length === 10 ? `mobile ending ${accountPhone.slice(-4)}` : 'your saved mobile number';
  const remainingCredits = knownCreditBalance(user);
  const monthlyAllowance = Number(user.subscription?.tokensPerMonth) || 0;
  const creditTotal = typeof remainingCredits === 'number' && monthlyAllowance > 0 ? Math.max(monthlyAllowance, remainingCredits) : null;
  const creditProgress = `${creditTotal ? calculateCreditPercentage(remainingCredits, creditTotal) : 100}%`;
  const creditEvents = creditHistory.data?.events || [];
  const visibleCreditEvents = creditHistoryExpanded ? creditEvents : creditEvents.slice(0, profileCreditPreviewLimit);
  const hiddenCreditEvents = Math.max(0, creditEvents.length - visibleCreditEvents.length);
  const avatarPortraitUri = user.avatarPhotoUrl ? imageUrl(user.avatarPhotoUrl) : '';
  const bodyPortraitUri = user.bodyPhotoUrl ? imageUrl(user.bodyPhotoUrl) : '';
  const canDeleteAccount = deleteStep === 'confirm' && deleteConfirmation === 'DELETE' && !accountDeleting;
  const portraitSeen = new Set();
  const portraitCards = [
    photo?.uri ? { uri: photo.uri, label: 'New photo', resizeMode: 'cover' } : null,
    bodyPortraitUri ? {
      uri: bodyPortraitUri,
      label: isGeneratedFullBodySource(user.bodyPhotoSource) ? 'Full-body' : user.bodyPhotoStatus === 'generating' ? 'Preparing' : 'Saved',
      resizeMode: isGeneratedFullBodySource(user.bodyPhotoSource) ? 'contain' : 'cover'
    } : null,
    avatarPortraitUri ? { uri: avatarPortraitUri, label: 'Profile', resizeMode: 'cover' } : null
  ].filter((item) => {
    if (!item?.uri || portraitSeen.has(item.uri)) return false;
    portraitSeen.add(item.uri);
    return true;
  });
  const featuredPortrait = portraitCards[0] || null;
  const portraitPhotoCount = portraitCards.length;

  const profilePhotoBusy = loading || user.bodyPhotoStatus === 'generating';
  const photoFeedback = profilePhotoFeedback(user, message);
  const chooseProfilePhoto = async () => {
    if (profilePhotoPickerRef.current || profilePhotoUploadRef.current || profilePhotoBusy) return;
    profilePhotoPickerRef.current = true;
    try {
      const selected = await pickImage();
      if (!selected) return;
      setPhoto(selected);
      setMessage('');
      await updatePhoto(selected);
    } finally {
      profilePhotoPickerRef.current = false;
    }
  };

  const updatePhoto = async (selectedPhoto = photo) => {
    if (profilePhotoUploadRef.current || profilePhotoBusy) return;
    if (!selectedPhoto) {
      setMessage('Choose a new profile photo first.');
      return;
    }
    profilePhotoUploadRef.current = true;
    setLoading(true);
    setMessage('Uploading photo and preparing your AI try-on portrait...');
    try {
      const form = new FormData();
      form.append('bodyPhoto', filePart(selectedPhoto, 'body-photo.jpg'));
      form.append('profilePhotoMode', 'ai-full-body');
      const data = await api('/auth/body-photo', { method: 'POST', body: form, timeoutMs: 60000 });
      clearPrivateImageCache();
      if (data.user) setUser(data.user);
      setPhoto(null);
      setMessage(data.user?.bodyPhotoStatus === 'generating'
        ? 'Photo saved. Your AI try-on portrait is being generated.'
        : isGeneratedFullBodySource(data.user?.bodyPhotoSource)
          ? 'Profile photo updated. Your AI try-on portrait is ready.'
          : 'Photo saved. AI portrait generation has not started. Please try again later.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      profilePhotoUploadRef.current = false;
      setLoading(false);
    }
  };

  const openProfileEditor = () => {
    setEditName(displayName === 'Lookmefy member' ? '' : displayName);
    setEditGender(user.genderPreference || 'other');
    setEditMessage('');
    setMessage('');
    setEditVisible(true);
  };

  const saveProfileDetails = async () => {
    const nextName = editName.trim().replace(/\s+/g, ' ');
    if (nextName.length < 2) {
      setEditMessage('Enter your full name.');
      return;
    }
    if (!editGender) {
      setEditMessage('Choose your gender preference.');
      return;
    }
    setProfileSaving(true);
    setEditMessage('Saving profile...');
    try {
      const data = await api('/auth/profile', {
        method: 'PATCH',
        timeoutMs: 30000,
        body: JSON.stringify({
          name: nextName,
          genderPreference: editGender,
          requireBodyPhoto: false
        })
      });
      if (data.user) setUser(data.user);
      setEditVisible(false);
      setEditMessage('');
      setMessage('Profile updated.');
    } catch (error) {
      setEditMessage(error.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const resetPasswordSheet = () => {
    setPasswordStage('idle');
    setPasswordOtp('');
    setPasswordResetToken('');
    setProfilePassword('');
    setProfileConfirmPassword('');
    setShowProfilePassword(false);
    setShowProfileConfirmPassword(false);
    setPasswordMessage('');
  };

  const openPasswordSheet = () => {
    if (accountPhone.length !== 10) {
      setMessage('Add a valid mobile number before changing your password.');
      return;
    }
    resetPasswordSheet();
    setMessage('');
    setPasswordSheetVisible(true);
  };

  const closePasswordSheet = () => {
    if (passwordLoading) return;
    setPasswordSheetVisible(false);
    resetPasswordSheet();
  };

  const sendProfilePasswordOtp = async () => {
    if (accountPhone.length !== 10) {
      setPasswordMessage('Your account needs a valid 10 digit mobile number.');
      return;
    }
    setPasswordLoading(true);
    setPasswordMessage('Sending OTP...');
    try {
      const data = await api('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: accountPhone, purpose: 'password-reset' })
      });
      setPasswordOtp('');
      setPasswordResetToken('');
      setPasswordStage('otp');
      setPasswordMessage(data.message ? `${data.message}. Enter the code from SMS.` : 'OTP sent. Enter the code from SMS.');
    } catch (error) {
      setPasswordMessage(error.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const verifyProfilePasswordOtp = async () => {
    const cleanOtp = normalizeOtpInput(passwordOtp);
    if (!cleanOtp) {
      setPasswordMessage('Enter the OTP sent to your mobile.');
      return;
    }
    setPasswordLoading(true);
    setPasswordMessage('Verifying OTP...');
    try {
      const data = await api('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone: accountPhone, otp: cleanOtp, purpose: 'password-reset' })
      });
      setPasswordResetToken(data.resetToken || '');
      setPasswordOtp('');
      setProfilePassword('');
      setProfileConfirmPassword('');
      setPasswordStage('password');
      setPasswordMessage('');
    } catch (error) {
      setPasswordMessage(error.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const completeProfilePasswordReset = async () => {
    const passwordError = passwordValidationMessage(profilePassword);
    if (passwordError) {
      setPasswordMessage(passwordError);
      return;
    }
    if (profilePassword !== profileConfirmPassword) {
      setPasswordMessage('Passwords do not match.');
      return;
    }
    if (!passwordResetToken) {
      setPasswordMessage('Verify the OTP before setting a new password.');
      setPasswordStage('otp');
      return;
    }
    setPasswordLoading(true);
    setPasswordMessage('Saving password...');
    try {
      const data = await api('/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({
          resetToken: passwordResetToken,
          password: profilePassword,
          confirmPassword: profileConfirmPassword
        }),
        timeoutMs: 60000
      });
      await saveToken(data.token);
      setToken(data.token);
      if (data.user) setUser(data.user);
      setPasswordSheetVisible(false);
      resetPasswordSheet();
      setMessage('Password updated.');
    } catch (error) {
      setPasswordMessage(error.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const completeDeletionLocally = async () => {
    let localSignOutFailed = false;
    try { await clearToken(); } catch { localSignOutFailed = true; }
    setDeleteSheetVisible(false);
    setDeleteStep('review');
    setDeleteConfirmation('');
    setDeleteMessage('');
    setDeleteReceipt('');
    setDeleteRequestId('');
    setToken(null);
    setUser(null);
    setMessage('');
    Alert.alert('Account deletion confirmed', localSignOutFailed
      ? 'The server confirmed account deletion, but saved sign-in details could not be cleared on this device. Do not reuse this session; close the app and contact support if it returns.'
      : accountDeletionOutcome({ deleted: true }).message);
    onNavigate('home');
  };

  const checkDeletionStatus = async () => {
    if (!deleteReceipt || deletionRequestRef.current) return;
    deletionRequestRef.current = true;
    setAccountDeleting(true);
    setDeleteMessage('Checking the server for your deletion status…');
    try {
      const data = await api('/auth/me/deletion-status', { noCache: true, timeoutMs: 15000,
        headers: { 'Deletion-Receipt': deleteReceipt } });
      const outcome = accountDeletionOutcome(data);
      if (outcome.state === 'complete') await completeDeletionLocally();
      else setDeleteMessage(outcome.message);
    } catch {
      setDeleteMessage('Could not verify the deletion status. Contact support with your request ID.');
    } finally {
      deletionRequestRef.current = false;
      setAccountDeleting(false);
    }
  };

  const deleteAccount = async () => {
    if (deletionRequestRef.current) return;
    if (!canDeleteAccount) {
      setDeleteMessage('Type DELETE exactly to confirm your deletion request.');
      return;
    }
    deletionRequestRef.current = true;
    setAccountDeleting(true);
    setDeleteMessage('Requesting account deletion… Please keep this screen open.');
    let deleted = false;
    try {
      const data = await api('/auth/me', {
        method: 'DELETE',
        timeoutMs: 60000,
        body: JSON.stringify({ confirmation: 'DELETE' })
      });
      const outcome = accountDeletionOutcome(data);
      if (outcome.state === 'pending') {
        setDeleteReceipt(typeof data.deletionReceipt === 'string' ? data.deletionReceipt : '');
        setDeleteRequestId(typeof data.requestId === 'string' ? data.requestId : '');
        setDeleteStep('pending');
        setDeleteMessage(outcome.message);
        return;
      }
      if (outcome.state !== 'complete') throw new Error(outcome.message);
      deleted = true;
    } catch (error) {
      setDeleteMessage(error?.code === 'timeout' || /timed out|network|connection/i.test(error?.message || '')
        ? 'We could not confirm deletion because the connection was interrupted. Check your account status before trying again.'
        : error.message || 'We could not confirm account deletion. Please contact support.');
    } finally {
      deletionRequestRef.current = false;
      setAccountDeleting(false);
    }

    if (deleted) await completeDeletionLocally();
  };

  const confirmDeleteAccount = () => {
    if (deleteStep !== 'pending') {
      setDeleteStep('review');
      setDeleteConfirmation('');
      setDeleteMessage('');
    }
    setMessage('');
    setDeleteSheetVisible(true);
  };

  const closeDeleteSheet = () => {
    if (accountDeleting) return;
    setDeleteSheetVisible(false);
    if (deleteStep !== 'pending') {
      setDeleteStep('review');
      setDeleteConfirmation('');
      setDeleteMessage('');
    }
  };

  return (
    <View style={styles.profileScreen}>
      <AppHeader onNavigate={onNavigate} user={user} compact />
      <ScrollView ref={profileScrollRef} style={styles.flex} contentContainerStyle={[styles.profileContent, isTabletLayout && styles.profileContentTablet]} {...screenScrollProps}>
      <PageBackRow onBack={onBack} />
      <View style={[styles.profileLayout, isTabletLayout && styles.profileLayoutTablet]}>

      <View style={[styles.profileIntro, isTabletLayout && styles.profileIntroTablet]}>
        <Text style={styles.profilePageTitle}>Your Profile</Text>
        <Text style={styles.profilePageSubtitle}>Your personal style space.</Text>
      </View>
      <View style={[isTabletLayout && styles.profileTopGridTablet]}>
      <View style={[styles.profileHero, isTabletLayout && styles.profileHeroTablet, styles.surfaceCard]}>
        <SurfaceBackdrop />
        <TouchableOpacity ref={profileAvatarTourTarget.ref} onLayout={profileAvatarTourTarget.onLayout} style={[styles.profilePhotoWrap, isTabletLayout && styles.profilePhotoWrapTablet]} onPress={chooseProfilePhoto} disabled={profilePhotoBusy} accessibilityRole="button" accessibilityLabel="Choose profile photo" accessibilityHint="Selecting a photo automatically creates your AI try-on portrait" accessibilityState={{ disabled: profilePhotoBusy, busy: profilePhotoBusy }}>
          <View style={[styles.profilePhotoFrame, isTabletLayout && styles.profilePhotoFrameTablet]}>
            {photoSource ? <ResilientImage source={photoSource} style={styles.profilePhoto} imageStyle={profilePhotoImageStyle} imageBaseStyle={profilePhotoImageBaseStyle} resizeMode={profilePhotoResizeMode} fallbackIcon="person-outline" /> : (
              <InitialsAvatar user={user} style={[styles.profilePhoto, styles.profileAvatarFallback]} textStyle={styles.profileAvatarInitials} />
            )}
          </View>
          <View style={styles.profilePhotoAction}>
            <Ionicons name="create-outline" size={13} color="#ffffff" />
          </View>
        </TouchableOpacity>
        <View style={styles.profileIdentityCopy}>
          <Text style={[styles.profileName, isTabletLayout && styles.profileNameTablet]}>{displayName}</Text>
          {user.joinedAt ? <Text style={styles.profileBio}>Member since {formatDate(user.joinedAt)}</Text> : null}
          {profilePhotoBusy ? <Text accessibilityLiveRegion="polite" style={styles.profileBio}>{loading ? 'Uploading photo...' : 'Generating AI try-on portrait...'}</Text> : null}
          <TouchableOpacity style={styles.profileEditButton} onPress={openProfileEditor} accessibilityRole="button">
            <Text style={styles.profileEditText}>Edit Profile</Text>
            <Ionicons name="arrow-forward" size={14} color="#211F1D" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.profileCreditsCard, isTabletLayout && styles.profileCreditsCardTablet, styles.surfaceCard]}>
        <SurfaceBackdrop />
        <View style={styles.profileCreditsHead}>
          <Text style={styles.profileCreditsLabel}>Remaining Credits</Text>
          <Ionicons name="sparkles" size={23} color="#9b5658" />
        </View>
        <View style={styles.profileCreditsAmountRow}>
          <Text style={styles.profileCreditsAmount}>{remainingCredits === null ? 'Unavailable' : remainingCredits}</Text>
          <Text style={styles.profileCreditsTotal}>{remainingCredits === null || user.devMode ? '' : creditTotal ? ` / ${creditTotal}` : ' available'}</Text>
        </View>
        {!user.devMode && creditTotal ? (
          <View style={styles.profileCreditTrack}>
            <View style={[styles.profileCreditFill, { width: creditProgress }]} />
          </View>
        ) : null}
        <TouchableOpacity style={styles.profileBuyButton} onPress={() => onNavigate('tokens')}>
          <Text style={styles.profileBuyText}>Buy More Credits</Text>
        </TouchableOpacity>
        <View style={styles.profileCreditHistory}>
          <View style={styles.profileCreditHistoryHead}>
            <Text style={styles.profileCreditHistoryTitle}>Credit History</Text>
            {creditHistory.loading ? <SkeletonBlock style={styles.profileCreditHeadSkeleton} /> : null}
            {!creditHistory.loading && !creditHistory.error && creditEvents.length > profileCreditPreviewLimit ? (
              <TouchableOpacity style={styles.profileCreditHistoryAction} activeOpacity={0.78} onPress={() => setCreditHistoryExpanded((current) => !current)}>
                <Text style={styles.profileCreditHistoryActionText}>{creditHistoryExpanded ? 'Show less' : `View all ${creditEvents.length}`}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {creditHistory.error ? <Text style={[styles.profileCreditEmptyText, styles.errorText]}>{creditHistory.error}</Text> : null}
          {creditHistory.loading ? <CreditHistorySkeleton /> : null}
          {!creditHistory.loading && !creditHistory.error && visibleCreditEvents.length ? visibleCreditEvents.map((event) => (
            <View key={event.id} style={styles.profileCreditHistoryRow}>
              <View style={styles.profileCreditEventCopy}>
                <Text style={styles.profileCreditEventTitle} numberOfLines={2}>{event.action || 'Try-on'}</Text>
                <Text style={styles.profileCreditEventMeta}>{creditHistoryProductLabel(event)} · {formatDate(event.createdAt)}</Text>
              </View>
              <Text style={[styles.profileCreditCell, event.direction === 'credit' ? styles.profileCreditAddedText : styles.profileCreditTokenText]}>{creditHistoryAmountLabel(event)}</Text>
            </View>
          )) : null}
          {!creditHistory.loading && !creditHistory.error && !creditHistoryExpanded && hiddenCreditEvents ? (
            <Text style={styles.profileCreditEmptyText}>{hiddenCreditEvents} older item{hiddenCreditEvents === 1 ? '' : 's'} hidden.</Text>
          ) : null}
          {!creditHistory.loading && !creditHistory.error && !creditEvents.length ? <Text style={styles.profileCreditEmptyText}>No credit activity yet.</Text> : null}
        </View>
      </View>
      </View>

      <View style={[isTabletLayout && styles.profileMediaGridTablet]}>
      <GenerationHistoryPreview
        items={generationHistory.data?.items || []}
        total={generationHistory.data?.total || 0}
        loading={generationHistory.loading}
        error={generationHistory.error}
        onNavigate={onNavigate}
        style={isTabletLayout && styles.generationPreviewCardTablet}
      />

      <View style={[styles.profileSection, isTabletLayout && styles.profilePortraitSectionTablet]}>
        <View style={styles.profileSectionHead}>
          <Text style={styles.profileSectionTitle}>Try-On Portraits</Text>
          <Text style={styles.profilePhotoCount}>{portraitPhotoCount} Photo{portraitPhotoCount === 1 ? '' : 's'}</Text>
        </View>
        <View style={styles.profilePortraitPanel}>
          <Pressable style={[styles.profilePortraitFeatured, isTabletLayout && styles.profilePortraitFeaturedTablet]} onPress={() => featuredPortrait?.uri && setLightbox(featuredPortrait.uri)}>
            {featuredPortrait?.uri ? (
              <>
                <ResilientImage source={{ uri: featuredPortrait.uri }} style={styles.profilePortraitFeaturedImage} resizeMode={featuredPortrait.resizeMode} fallbackIcon="person-outline" />
                <View style={styles.profilePortraitBadge}>
                  <Text style={styles.profilePortraitBadgeText} numberOfLines={1}>{featuredPortrait.label}</Text>
                </View>
              </>
            ) : (
              <View style={styles.profilePortraitEmpty}>
                <Ionicons name="person-outline" size={24} color="#8d8682" />
                <Text style={styles.profilePortraitEmptyText}>No photo yet</Text>
              </View>
            )}
          </Pressable>
          <TouchableOpacity style={[styles.profileUploadPortraitLarge, isTabletLayout && styles.profileUploadPortraitTablet]} onPress={chooseProfilePhoto} disabled={profilePhotoBusy} accessibilityRole="button" accessibilityState={{ disabled: profilePhotoBusy, busy: profilePhotoBusy }}>
            <View style={styles.profileUploadPortraitIcon}>
              <Ionicons name="camera-outline" size={24} color="#7d7a79" />
            </View>
            <Text style={styles.profileUploadPortraitText}>{loading ? 'Uploading Photo...' : user.bodyPhotoStatus === 'generating' ? 'Generating AI Portrait...' : 'Upload New Photo'}</Text>
            <Text style={styles.profileUploadPortraitHelp}>Choose a clear photo to automatically create your AI try-on portrait.</Text>
          </TouchableOpacity>
        </View>
        {!portraitPhotoCount ? <Text style={styles.profileInlineMessage}>Upload a portrait to start trying on outfits.</Text> : null}
        {photo && !loading ? (
          <TouchableOpacity style={[styles.profileSavePhotoButton, profilePhotoBusy && styles.disabledButton]} disabled={profilePhotoBusy} onPress={() => updatePhoto()}>
            <Text style={styles.profileSavePhotoText}>Retry Photo Upload</Text>
          </TouchableOpacity>
        ) : null}
        {user.bodyPhotoStatus === 'generating' ? <Text style={styles.profileInlineMessage}>Full-body try-on profile is preparing in the background.</Text> : null}
        {user.bodyPhotoStatus === 'failed' ? <Text style={[styles.profileInlineMessage, styles.errorText]}>Full-body profile generation failed. Upload a clearer profile photo.</Text> : null}
        {photoFeedback ? <Text accessibilityLiveRegion="polite" style={[styles.profileInlineMessage, /updated|saved|saving|uploading/i.test(photoFeedback) ? null : styles.errorText]}>{photoFeedback}</Text> : null}
      </View>
      </View>

      <View style={[styles.profileQuickOptions, isTabletLayout && styles.profileQuickOptionsTablet]}>
        <TouchableOpacity style={[styles.profileQuickCard, isTabletLayout && styles.profileQuickCardTablet, styles.surfaceCard]} activeOpacity={0.86} onPress={() => onNavigate('orders')}>
          <SurfaceBackdrop />
          <View style={styles.profileQuickIcon}>
            <Ionicons name="receipt-outline" size={23} color="#9b5658" />
          </View>
          <View style={styles.profileQuickCopy}>
            <Text style={styles.profileQuickTitle}>My Orders</Text>
            <Text style={styles.profileQuickSub}>Track purchases</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#77716f" />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.profileQuickCard, isTabletLayout && styles.profileQuickCardTablet, styles.surfaceCard]} activeOpacity={0.86} onPress={() => onNavigate('wishlist')}>
          <SurfaceBackdrop />
          <View style={styles.profileQuickIcon}>
            <Ionicons name="heart-outline" size={23} color="#9b5658" />
          </View>
          <View style={styles.profileQuickCopy}>
            <Text style={styles.profileQuickTitle}>My Wishlist</Text>
            <Text style={styles.profileQuickSub}>Saved styles</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#77716f" />
        </TouchableOpacity>
        {collections.length ? <TouchableOpacity style={[styles.profileQuickCard, isTabletLayout && styles.profileQuickCardTablet, styles.surfaceCard]} activeOpacity={0.86} onPress={() => onNavigate('collections')}>
          <SurfaceBackdrop />
          <View style={styles.profileQuickIcon}>
            <Ionicons name="albums-outline" size={23} color="#9b5658" />
          </View>
          <View style={styles.profileQuickCopy}>
            <Text style={styles.profileQuickTitle}>My Collections</Text>
            <Text style={styles.profileQuickSub}>Saved style groups</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#77716f" />
        </TouchableOpacity> : null}
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>Credits & Subscription</Text>
        <TouchableOpacity style={[styles.profilePaymentCard, styles.surfaceCard]} onPress={() => onNavigate('tokens')}>
          <SurfaceBackdrop />
          <View style={styles.profilePaymentIcon}>
            <Ionicons name="diamond-outline" size={21} color="#211F1D" />
          </View>
          <View style={styles.profilePaymentCopy}>
            <Text style={styles.profilePaymentTitle}>Manage credits & plan</Text>
            <Text style={styles.profilePaymentSub}>{user.subscription?.status === 'active' ? 'Subscription active' : 'View credits and plans'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#55514f" />
        </TouchableOpacity>
      </View>

      <View style={[isTabletLayout && styles.profileSettingsGridTablet]}>
      <ProfileSettingsSection
        title="Account Settings"
        style={isTabletLayout && styles.profileSettingsSectionTablet}
        rows={[
          { label: 'Username', icon: 'at-outline', value: username ? `@${username}` : 'Not added' },
          { label: 'Gender Preference', icon: 'person-outline', value: user.genderPreference ? titleCase(user.genderPreference) : 'Not added' },
          { label: 'Mobile Number', icon: 'call-outline', value: user.phone || 'Not added' },
          { label: 'Change Password', icon: 'lock-closed-outline', value: 'OTP verification', onPress: openPasswordSheet }
        ]}
      />

      <ProfileSettingsSection
        title="Security & Legal"
        style={isTabletLayout && styles.profileSettingsSectionTablet}
        rows={[
          { label: 'Support Center', icon: 'help-circle-outline', onPress: () => onNavigate('info', { page: 'support' }) },
          { label: 'Return and Refund Policy', icon: 'return-down-back-outline', onPress: () => onNavigate('info', { page: 'returns' }) },
          { label: 'Cancellation Policy', icon: 'close-circle-outline', onPress: () => onNavigate('info', { page: 'cancellation' }) },
          { label: 'Account & Data Deletion', icon: 'document-text-outline', onPress: () => onNavigate('info', { page: 'deletion' }) },
          { label: 'Data & Privacy', icon: 'shield-checkmark-outline', onPress: () => onNavigate('info', { page: 'privacy' }) },
          { label: 'Reset AI photo permission', icon: 'refresh-circle-outline', onPress: async () => {
            await requireAiPhotoConsent.revoke();
            Alert.alert('AI photo permission reset', 'Lookmefy will ask again before the next AI photo request.');
          } },
          { label: 'Terms of Service', icon: 'reader-outline', onPress: () => onNavigate('info', { page: 'terms' }) },
          { label: 'Privacy Policy', icon: 'eye-outline', onPress: () => onNavigate('info', { page: 'privacy' }) }
        ]}
      />
      </View>

      <TouchableOpacity style={[styles.profileLogoutButton, isTabletLayout && styles.profileAccountActionTablet]} onPress={onLogout}>
        <Text style={styles.profileLogoutText}>Logout</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.profileDeleteButton, isTabletLayout && styles.profileAccountActionTablet, accountDeleting && styles.disabledButton]} disabled={accountDeleting} onPress={confirmDeleteAccount}>
        {accountDeleting ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.profileDeleteText}>Delete Account</Text>}
      </TouchableOpacity>
      </View>
      <Modal visible={deleteSheetVisible} transparent animationType="fade" onRequestClose={closeDeleteSheet}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.profileEditOverlay, isTabletLayout && styles.profileEditOverlayTablet]}>
          <Pressable accessible={false} importantForAccessibility="no" style={styles.profileEditBackdrop} onPress={closeDeleteSheet} />
          <View style={[styles.profileEditSheet, isTabletLayout && styles.profileEditSheetTablet, styles.profileDeleteSheet]}>
            <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
            <View style={styles.profileEditHandle} />
            <View style={styles.profileEditHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.profileDangerEyebrow}>Danger Zone</Text>
                <Text accessibilityRole="header" style={styles.profileEditSheetTitle}>{deleteStep === 'pending' ? 'Deletion pending' : 'Delete your account?'}</Text>
                <Text style={styles.profileEditSheetSub}>Request deletion of your account and associated data. We will only show completion after the server confirms it. Some records may be retained as explained in the deletion policy.</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close account deletion" style={[styles.profileEditClose, { minWidth: 44, minHeight: 44 }]} disabled={accountDeleting} onPress={closeDeleteSheet}>
                <DecorativeCloseIcon size={21} color="#2b2321" />
              </TouchableOpacity>
            </View>

            <View style={styles.profileDeleteList}>
              {['Profile information', 'Wardrobe items', 'Wishlist', 'AI Try-On generation history', 'Saved portrait', 'Remaining credits', 'Account preferences'].map((item) => (
                <View key={item} style={styles.profileDeleteListItem}>
                  <Ionicons name="remove-circle-outline" size={15} color="#9b3f3b" />
                  <Text style={styles.profileDeleteListText}>{item}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.profileDeleteWarning}>Any remaining credits will be permanently lost.</Text>
            <TouchableOpacity accessibilityRole="link" style={styles.releaseLegalAction} onPress={() => openLegalPolicy('deletion')}><Text style={styles.releaseReportText}>Read account-deletion information</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.releaseLegalAction} onPress={() => openSupportEmail('Account deletion status')}><Text style={styles.releaseReportText}>Contact support about deletion</Text></TouchableOpacity>

            {deleteStep === 'confirm' ? (
              <>
                <Text style={styles.profileEditLabel}>Type DELETE to confirm</Text>
                <TextInput
                  style={styles.profileEditInput}
                  value={deleteConfirmation}
                  onChangeText={setDeleteConfirmation}
                  accessibilityLabel="Type DELETE to confirm account deletion"
                  placeholder="DELETE"
                  placeholderTextColor="#9a918d"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!accountDeleting}
                  returnKeyType="done"
                />
              </>
            ) : null}

            {deleteMessage ? <Text accessibilityLiveRegion="polite" style={[styles.profileEditMessage, accountDeleting || deleteStep === 'pending' ? null : styles.errorText]}>{deleteMessage}</Text> : null}
            {deleteStep === 'pending' && deleteRequestId ? <Text selectable style={styles.profileEditMessage}>Request ID: {deleteRequestId}</Text> : null}
            {deleteStep === 'pending' && deleteReceipt ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Check account deletion status" accessibilityState={{ busy: accountDeleting }}
                style={styles.releaseLegalAction} disabled={accountDeleting} onPress={checkDeletionStatus}>
                <Text style={styles.releaseReportText}>Check deletion status</Text>
              </TouchableOpacity>
            ) : null}

            </ScrollView>
            <View style={styles.profileEditActions}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={deleteStep === 'pending' ? 'Close deletion' : 'Cancel deletion'} style={styles.profileEditCancelButton} activeOpacity={0.84} disabled={accountDeleting} onPress={closeDeleteSheet}>
                <Text style={styles.profileEditCancelText}>{deleteStep === 'pending' ? 'Close' : 'Cancel'}</Text>
              </TouchableOpacity>
              {deleteStep === 'review' ? (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Continue deletion confirmation" style={styles.profileEditSaveButton} activeOpacity={0.88} onPress={() => setDeleteStep('confirm')}>
                  <Text style={styles.profileEditSaveText}>Continue</Text>
                </TouchableOpacity>
              ) : deleteStep === 'pending' ? null : (
                <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: !canDeleteAccount, busy: accountDeleting }} accessibilityLabel="Confirm account deletion" style={[styles.profileDeleteFinalButton, !canDeleteAccount && styles.disabledButton]} activeOpacity={0.88} disabled={!canDeleteAccount} onPress={deleteAccount}>
                  {accountDeleting ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={[styles.profileEditSaveText, styles.profileDeleteFinalText]} numberOfLines={2}>Permanently Delete Account</Text>}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.profileEditOverlay, isTabletLayout && styles.profileEditOverlayTablet]}>
          <Pressable accessible={false} importantForAccessibility="no" style={styles.profileEditBackdrop} onPress={() => setEditVisible(false)} />
          <View style={[styles.profileEditSheet, isTabletLayout && styles.profileEditSheetTablet]}>
            <View style={styles.profileEditHandle} />
            <View style={styles.profileEditHead}>
              <View style={styles.profileEditHeadingCopy}>
                <Text style={styles.profileEditSheetTitle}>Edit Profile</Text>
                <Text style={styles.profileEditSheetSub}>Update the name and shopping preference shown in your account.</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close Edit Profile" style={[styles.profileEditClose, styles.profileEditDismissButton]} onPress={() => setEditVisible(false)}>
                <DecorativeCloseIcon size={21} color="#2b2321" />
              </TouchableOpacity>
            </View>

            <Text style={styles.profileEditLabel}>Name</Text>
            <TextInput
              style={styles.profileEditInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your name"
              placeholderTextColor="#9a918d"
              autoCapitalize="words"
              returnKeyType="done"
            />

            <Text style={styles.profileEditLabel}>Gender preference</Text>
            <View style={styles.profileGenderGrid}>
              {profileGenderOptions.map((option) => {
                const selected = editGender === option.value;
                return (
                  <TouchableOpacity key={option.value} style={[styles.profileGenderOption, selected && styles.profileGenderOptionActive]} activeOpacity={0.84} onPress={() => setEditGender(option.value)}>
                    <Ionicons name={option.icon} size={18} color={selected ? '#ffffff' : '#9b5658'} />
                    <Text style={[styles.profileGenderText, selected && styles.profileGenderTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {editMessage ? <Text style={[styles.profileEditMessage, /saving|updated|saved/i.test(editMessage) ? null : styles.errorText]}>{editMessage}</Text> : null}

            <View style={styles.profileEditActions}>
              <TouchableOpacity style={styles.profileEditCancelButton} activeOpacity={0.84} onPress={() => setEditVisible(false)}>
                <Text style={styles.profileEditCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.profileEditSaveButton, profileSaving && styles.disabledButton]} activeOpacity={0.88} disabled={profileSaving} onPress={saveProfileDetails}>
                {profileSaving ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.profileEditSaveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={passwordSheetVisible} transparent animationType="fade" onRequestClose={closePasswordSheet}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.profileEditOverlay, isTabletLayout && styles.profileEditOverlayTablet]}>
          <Pressable accessible={false} importantForAccessibility="no" style={styles.profileEditBackdrop} onPress={closePasswordSheet} />
          <View style={[styles.profileEditSheet, isTabletLayout && styles.profileEditSheetTablet]}>
            <View style={styles.profileEditHandle} />
            <View style={styles.profileEditHead}>
              <View>
                <Text style={styles.profileEditSheetTitle}>Change Password</Text>
                <Text style={styles.profileEditSheetSub}>
                  {passwordStage === 'password'
                    ? 'Set a new password for your Lookmefy account.'
                    : passwordStage === 'otp'
                      ? `Enter the OTP sent to ${accountPhoneLabel}.`
                      : `Send a reset OTP to ${accountPhoneLabel}.`}
                </Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close Change Password" style={styles.profileEditClose} disabled={passwordLoading} onPress={closePasswordSheet}>
                <DecorativeCloseIcon size={21} color="#2b2321" />
              </TouchableOpacity>
            </View>

            {passwordStage === 'idle' ? (
              <>
                <View style={styles.profilePasswordNotice}>
                  <Ionicons name="phone-portrait-outline" size={18} color="#9b5658" />
                  <Text style={styles.profilePasswordNoticeText}>We will verify this change with an OTP before saving a new password.</Text>
                </View>
                <TouchableOpacity style={[styles.profileEditSaveButton, styles.profilePasswordPrimaryButton, passwordLoading && styles.disabledButton]} disabled={passwordLoading} onPress={sendProfilePasswordOtp}>
                  {passwordLoading ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.profileEditSaveText}>Send OTP</Text>}
                </TouchableOpacity>
              </>
            ) : null}

            {passwordStage === 'otp' ? (
              <>
                <Text style={styles.profileEditLabel}>OTP</Text>
                <TextInput
                  style={styles.profileEditInput}
                  value={passwordOtp}
                  onChangeText={(value) => setPasswordOtp(normalizeOtpInput(value))}
                  placeholder="Enter OTP"
                  placeholderTextColor="#9a918d"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={8}
                />
                <View style={styles.profileEditActions}>
                  <TouchableOpacity style={styles.profileEditCancelButton} disabled={passwordLoading} onPress={sendProfilePasswordOtp}>
                    <Text style={styles.profileEditCancelText}>Resend</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.profileEditSaveButton, passwordLoading && styles.disabledButton]} disabled={passwordLoading} onPress={verifyProfilePasswordOtp}>
                    {passwordLoading ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.profileEditSaveText}>Verify</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            {passwordStage === 'password' ? (
              <>
                <Text style={styles.profileEditLabel}>New password</Text>
                <AuthPasswordField
                  value={profilePassword}
                  onChangeText={setProfilePassword}
                  placeholder="New password"
                  visible={showProfilePassword}
                  onToggle={() => setShowProfilePassword((current) => !current)}
                  fieldHeight={54}
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
                <Text style={styles.profileEditLabel}>Confirm password</Text>
                <AuthPasswordField
                  value={profileConfirmPassword}
                  onChangeText={setProfileConfirmPassword}
                  placeholder="Confirm password"
                  visible={showProfileConfirmPassword}
                  onToggle={() => setShowProfileConfirmPassword((current) => !current)}
                  fieldHeight={54}
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
                <View style={styles.profileEditActions}>
                  <TouchableOpacity style={styles.profileEditCancelButton} disabled={passwordLoading} onPress={() => setPasswordStage('otp')}>
                    <Text style={styles.profileEditCancelText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.profileEditSaveButton, passwordLoading && styles.disabledButton]} disabled={passwordLoading} onPress={completeProfilePasswordReset}>
                    {passwordLoading ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.profileEditSaveText}>Save Password</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            {passwordMessage ? <Text style={[styles.profileEditMessage, /sending|sent|verifying|saving|updated/i.test(passwordMessage) ? null : styles.errorText]}>{passwordMessage}</Text> : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
      </ScrollView>
    </View>
  );
}

function ProfileSettingsSection({ title, rows, style }) {
  return (
    <View style={[styles.profileSection, style]}>
      <Text style={styles.profileSectionTitle}>{title}</Text>
      <View style={styles.profileSettingsList}>
        {rows.map((row) => {
          const item = Array.isArray(row) ? { label: row[0], value: row[1], onPress: row[2] } : row;
          const actionable = typeof item.onPress === 'function';
          return (
            <TouchableOpacity key={item.label} style={styles.profileSettingsRow} activeOpacity={actionable ? 0.8 : 1} disabled={!actionable} onPress={item.onPress} accessibilityRole={actionable ? 'button' : 'text'}>
              {item.icon ? <View style={styles.profileSettingsIcon}><Ionicons name={item.icon} size={19} color="#625C56" /></View> : null}
              <View style={styles.profileSettingsCopy}>
                <Text style={styles.profileSettingsLabel}>{item.label}</Text>
                {item.value ? <Text style={styles.profileSettingsValue}>{item.value}</Text> : null}
              </View>
              {actionable ? <Ionicons name="chevron-forward" size={18} color="#625C56" /> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function HowItWorksScreen({ user, onNavigate }) {
  const steps = [
    [user ? 'Use your profile' : 'Create your profile', user ? 'Your account is ready, so you can move straight into browsing products.' : 'Upload one clear standing photo once, then keep using it for try-on previews.'],
    ['Choose a product', 'Open any product from the catalog and review the brand, price, image, colors, and details.'],
    ['Generate the try-on', 'Use tokens to preview how selected pieces look on your profile before leaving Lookmefy.'],
    ['Compare and shop', 'Shortlist the looks that work, then continue to the brand store when you are ready.']
  ];
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} {...screenScrollProps}>
      <View style={styles.toolHero}>
        <Text style={styles.kicker}>How Lookmefy Works</Text>
        <Text style={styles.screenTitle}>Four simple steps.</Text>
        <Text style={styles.description}>From profile photo to product preview, the whole flow is built around making online shopping feel less like guessing.</Text>
        <AppButton label={user ? 'Start Shopping' : 'Create Profile'} onPress={() => onNavigate(user ? 'shop' : 'signup')} />
      </View>
      {steps.map(([title, text], index) => (
        <View key={title} style={styles.stepCard}>
          <Text style={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={styles.stepTitle}>{title}</Text>
          <Text style={styles.muted}>{text}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function InfoScreen({ page, user, onNavigate, onBack }) {
  const policy = policyPages[page];
  const meta = policy ? [policy.kicker, policy.title, policy.lead, policy.image] : infoPages[page];
  if (!meta) return <NotFoundScreen user={user} onNavigate={onNavigate} />;

  if (policy) {
    const emailSubject = policy.emailSubject || 'Lookmefy support request';
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} {...screenScrollProps}>
        <PageBackRow onBack={onBack} />
        <View style={styles.pageHero}>
          <Image source={images[policy.image] || images.hero} style={styles.pageImage} />
          <View style={styles.pageCopy}>
            <Text style={styles.kicker}>{policy.kicker}</Text>
            <Text style={styles.screenTitle}>{policy.title}</Text>
            <Text style={styles.policyUpdated}>Last updated: {policy.updated}</Text>
            <Text style={styles.description}>{policy.lead}</Text>
            <AppButton label="Email Support" icon="mail-outline" onPress={() => openSupportEmail(emailSubject)} />
            {['privacy', 'terms', 'deletion'].includes(page) ? <AppButton label="Open published policy" variant="secondary" onPress={() => openLegalPolicy(page)} /> : null}
          </View>
        </View>

        <View style={styles.policyGrid}>
          {policy.sections.map((section) => (
            <View key={section.title} style={styles.policyCard}>
              <Text style={styles.policySectionTitle}>{section.title}</Text>
              {section.body.map((text, index) => (
                <PolicyText key={`${section.title}-${index}`} text={text} emailSubject={emailSubject} />
              ))}
            </View>
          ))}

          {policy.related?.length ? (
            <View style={styles.policyRelated}>
              <Text style={styles.policyRelatedTitle}>Related pages</Text>
              {policy.related.map(([label, targetPage]) => (
                <TouchableOpacity key={targetPage} style={styles.policyRelatedRow} activeOpacity={0.8} onPress={() => onNavigate('info', { page: targetPage })}>
                  <Text style={styles.policyRelatedText}>{label}</Text>
                  <Ionicons name="chevron-forward" size={19} color="#55514f" />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} {...screenScrollProps}>
      <PageBackRow onBack={onBack} />
      <View style={styles.pageHero}>
        <Image source={images[meta[3]] || images.hero} style={styles.pageImage} />
        <View style={styles.pageCopy}>
          <Text style={styles.kicker}>{meta[0]}</Text>
          <Text style={styles.screenTitle}>{meta[1]}</Text>
          <Text style={styles.description}>{meta[2]}</Text>
          <AppButton label={user ? 'Browse Products' : 'Create Profile'} onPress={() => onNavigate(user ? 'shop' : 'signup')} />
        </View>
      </View>
      <View style={styles.infoGrid}>
        <InfoCard title="AI try-on ready" text="Preview selected products on your profile." />
        <InfoCard title="Catalog shopping" text="Explore styles, categories, and new arrivals." />
        <InfoCard title="Token powered" text="Use tokens only when generating previews." />
        <InfoCard title="Privacy aware" text="Your full-body photo is part of your personal profile." />
      </View>
    </ScrollView>
  );
}

function PolicyText({ text, emailSubject }) {
  const value = String(text || '');
  if (!value.includes(supportEmail)) {
    return <Text style={styles.policyText}>{value}</Text>;
  }
  const parts = value.split(supportEmail);
  return (
    <Text style={styles.policyText}>
      {parts.map((part, index) => (
        <Text key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 ? (
            <Text accessibilityRole="link" style={styles.policyEmail} onPress={() => openSupportEmail(emailSubject)}>{supportEmail}</Text>
          ) : null}
        </Text>
      ))}
    </Text>
  );
}

function NotFoundScreen({ user, onNavigate }) {
  return (
    <ScrollView contentContainerStyle={styles.notFoundContent} {...screenScrollProps}>
      <View style={styles.notFoundMark}>
        <Text style={styles.notFoundCode}>404</Text>
        <View style={styles.notFoundIcon}>
          <Ionicons name="search-outline" size={28} color="#9b5658" />
        </View>
      </View>
      <Text style={styles.notFoundTitle}>Page not found</Text>
      <Text style={styles.notFoundText}>This link may have moved, expired, or never existed. Let’s get you back to shopping.</Text>
      <View style={styles.notFoundActions}>
        <AppButton label="Go Home" icon="home-outline" onPress={() => onNavigate('home')} style={styles.notFoundButton} />
        <AppButton label="Search" icon="search-outline" variant="secondary" onPress={() => onNavigate('search')} style={styles.notFoundButton} />
      </View>
      <TouchableOpacity style={styles.notFoundShopLink} activeOpacity={0.82} onPress={() => onNavigate(user ? 'shop' : 'home')}>
        <Text style={styles.notFoundShopText}>{user ? 'Browse latest products' : 'Continue browsing Lookmefy'}</Text>
        <Ionicons name="arrow-forward" size={17} color="#9b5658" />
      </TouchableOpacity>
    </ScrollView>
  );
}

function FeatureBand() {
  return (
    <View style={styles.featureBand}>
      {['AI Try-On', 'Top Brands', 'Secure & Private', 'Easy Returns'].map((item) => (
        <View key={item} style={styles.featureItem}>
          <Ionicons name="checkmark-circle-outline" size={21} color="#0f766e" />
          <Text style={styles.featureTitle}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function InfoCard({ title, text }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

function TryOnLoading({ text = 'Generating', large }) {
  return (
    <View pointerEvents="none" style={[styles.tryOnLoading, large && styles.tryOnLoadingLarge]}>
      <ActivityIndicator size="small" color="#ffffff" />
      <Text style={styles.tryOnLoadingText}>{text}</Text>
    </View>
  );
}

function WishlistDoneButton({ saved, onPress, compact }) {
  const handlePress = (event) => {
    event?.stopPropagation?.();
    onPress?.();
  };
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={saved ? 'Remove product from wishlist' : 'Add product to wishlist'}
      activeOpacity={0.84}
      style={[styles.wishlistDoneButton, compact && styles.wishlistDoneButtonCompact, saved && styles.wishlistDoneButtonSaved]}
      onPress={handlePress}
    >
      <Ionicons name={saved ? 'heart' : 'heart-outline'} size={compact ? 17 : 19} color={saved ? '#ffffff' : '#111111'} />
    </TouchableOpacity>
  );
}

function OnboardingTour({ visible, step, targetRects = {}, currentRouteName, onNext, onBack, onSkip, onDone }) {
  const { width, height } = useWindowDimensions();
  const [tourCardLayout, setTourCardLayout] = useState({ key: '', height: 0 });
  const total = onboardingTourSteps.length;
  const safeStep = Math.min(Math.max(step, 0), total - 1);
  const active = onboardingTourSteps[safeStep] || onboardingTourSteps[0];
  const intro = safeStep === 0;
  const last = safeStep === total - 1;
  const measuredTarget = !intro && active.targetKey ? targetRects[active.targetKey] : null;
  const measuredMatchesRoute = measuredTarget && (!active.route?.name || measuredTarget.route === active.route.name || measuredTarget.route === currentRouteName);
  const waitingForMeasuredTarget = !intro && active.targetKey && active.route?.name === currentRouteName && !measuredMatchesRoute;
  const rawTarget = !intro && measuredMatchesRoute
    ? measuredTarget
    : (!intro && !waitingForMeasuredTarget && typeof active.target === 'function' ? active.target({ width, height }) : null);
  const focusedTarget = rawTarget && typeof active.focusTarget === 'function'
    ? active.focusTarget(rawTarget, { width, height })
    : rawTarget;
  const modalSafeTop = Platform.OS === 'android' ? Math.max(12, NativeStatusBar.currentHeight || 0) : 12;
  const modalSafeBottom = Platform.OS === 'ios' ? 28 : 16;
  const measuredTargetOffsetY = Platform.OS === 'android' && measuredMatchesRoute
    ? appTopInset
    : 0;
  const target = focusedTarget ? {
    x: clamp(focusedTarget.x, 8, Math.max(8, width - 56)),
    y: clamp(focusedTarget.y + measuredTargetOffsetY, modalSafeTop, Math.max(modalSafeTop, height - modalSafeBottom - 48)),
    width: clamp(focusedTarget.width, 48, Math.max(48, width - 16)),
    height: clamp(focusedTarget.height, 48, Math.max(48, height - modalSafeTop - modalSafeBottom))
  } : null;
  if (target) {
    target.width = Math.min(target.width, width - target.x - 8);
    target.height = Math.min(target.height, height - modalSafeBottom - target.y);
    if (target.height > height * 0.36) {
      const nextHeight = Math.max(96, Math.min(target.height, height * 0.3));
      target.y += (target.height - nextHeight) / 2;
      target.height = nextHeight;
    }
  }
  const spotlightPadding = 5;
  const spotlight = target ? {
    x: Math.max(8, target.x - spotlightPadding),
    y: Math.max(modalSafeTop, target.y - spotlightPadding),
    width: Math.min(width - 16, target.width + spotlightPadding * 2),
    height: Math.min(height - modalSafeTop - modalSafeBottom, target.height + spotlightPadding * 2)
  } : null;
  if (spotlight) {
    spotlight.width = Math.min(spotlight.width, width - spotlight.x - 8);
    spotlight.height = Math.min(spotlight.height, height - modalSafeBottom - spotlight.y);
  }
  const shouldPlaceAbove = spotlight && (active.placement === 'above' || spotlight.y > height * 0.54);
  const measuredCardHeight = tourCardLayout.key === active.key ? tourCardLayout.height : 0;
  const cardHeight = Math.max(measuredCardHeight, intro ? 270 : 318);
  const cardGap = 12;
  const cardSafeTop = modalSafeTop + 8;
  const cardSafeBottom = modalSafeBottom + 8;
  const maxCardTop = Math.max(cardSafeTop, height - cardSafeBottom - cardHeight);
  const aboveTop = spotlight ? spotlight.y - cardHeight - cardGap : undefined;
  const belowTop = spotlight ? spotlight.y + spotlight.height + cardGap : undefined;
  const aboveFits = spotlight ? aboveTop >= cardSafeTop : false;
  const belowFits = spotlight ? belowTop + cardHeight <= height - cardSafeBottom : false;
  const aboveSpace = spotlight ? spotlight.y - cardSafeTop - cardGap : 0;
  const belowSpace = spotlight ? height - cardSafeBottom - (spotlight.y + spotlight.height) - cardGap : 0;
  const placeAbove = spotlight
    ? shouldPlaceAbove
      ? (aboveFits || !belowFits || aboveSpace >= belowSpace)
      : (!belowFits && (aboveFits || aboveSpace > belowSpace))
    : false;
  const preferredCardTop = spotlight ? (placeAbove ? aboveTop : belowTop) : undefined;
  const cardTop = spotlight
    ? clamp(preferredCardTop, cardSafeTop, maxCardTop)
    : undefined;
  const cardWidth = Math.min(360, width - 32);
  const anchoredCardStyle = spotlight ? [styles.tourCardAnchored, { top: cardTop, left: (width - cardWidth) / 2, width: cardWidth }] : null;
  const handleTourCardLayout = useCallback((event) => {
    const nextHeight = event.nativeEvent.layout.height;
    setTourCardLayout((current) => (
      current.key === active.key && Math.abs(current.height - nextHeight) < 1
        ? current
        : { key: active.key, height: nextHeight }
    ));
  }, [active.key]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
      <View style={styles.tourOverlay}>
        {spotlight ? (
          <>
            <View style={[styles.tourDimPiece, { left: 0, right: 0, top: 0, height: spotlight.y }]} />
            <View style={[styles.tourDimPiece, { left: 0, top: spotlight.y, width: spotlight.x, height: spotlight.height }]} />
            <View style={[styles.tourDimPiece, { left: spotlight.x + spotlight.width, right: 0, top: spotlight.y, height: spotlight.height }]} />
            <View style={[styles.tourDimPiece, { left: 0, right: 0, top: spotlight.y + spotlight.height, bottom: 0 }]} />
            <View style={[styles.tourSpotlightCorner, styles.tourSpotlightCornerTopLeft, { left: spotlight.x, top: spotlight.y }]} />
            <View style={[styles.tourSpotlightCorner, styles.tourSpotlightCornerTopRight, { left: spotlight.x + spotlight.width - 16, top: spotlight.y }]} />
            <View style={[styles.tourSpotlightCorner, styles.tourSpotlightCornerBottomLeft, { left: spotlight.x, top: spotlight.y + spotlight.height - 16 }]} />
            <View style={[styles.tourSpotlightCorner, styles.tourSpotlightCornerBottomRight, { left: spotlight.x + spotlight.width - 16, top: spotlight.y + spotlight.height - 16 }]} />
            <View pointerEvents="none" style={[styles.tourSpotlight, { left: spotlight.x, top: spotlight.y, width: spotlight.width, height: spotlight.height }]} />
          </>
        ) : <View style={styles.tourBackdrop} />}
        <View key={active.key} style={[styles.tourCard, intro && styles.tourIntroCard, anchoredCardStyle]} onLayout={handleTourCardLayout}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Skip onboarding tour" style={styles.tourCloseButton} activeOpacity={0.78} onPress={onSkip}>
            <DecorativeCloseIcon size={17} color="#5d5754" />
          </TouchableOpacity>
          <View style={styles.tourIcon}>
            <Ionicons name={active.icon} size={23} color="#9b5658" />
          </View>
          <Text style={styles.tourEyebrow}>{active.eyebrow}</Text>
          <Text style={styles.tourTitle}>{active.title}</Text>
          <Text style={styles.tourText}>{active.text}</Text>
          {!intro ? (
            <View style={styles.tourHintRow}>
              <Ionicons name="scan-outline" size={16} color="#9b5658" />
              <Text style={styles.tourHintText}>{waitingForMeasuredTarget ? 'Bringing this feature into view...' : "You'll find this feature in the highlighted area."}</Text>
            </View>
          ) : null}
          <View style={styles.tourDots}>
            {onboardingTourSteps.map((item, index) => (
              <View key={item.key} style={[styles.tourDot, index === safeStep && styles.tourDotActive]} />
            ))}
          </View>
          <View style={styles.tourActions}>
            {!intro ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous tour step" style={styles.tourSecondaryButton} activeOpacity={0.82} onPress={onBack}>
                <Text style={styles.tourSecondaryText}>Back</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={last ? 'Finish onboarding tour' : 'Next tour step'} style={[styles.tourPrimaryButton, intro && styles.tourPrimaryButtonFull]} activeOpacity={0.88} onPress={last ? onDone : onNext}>
              <Text style={styles.tourPrimaryText}>{active.primary || 'Next'}</Text>
              {!last ? <Ionicons name="arrow-forward" size={18} color="#ffffff" /> : null}
            </TouchableOpacity>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Skip onboarding tour" style={styles.tourSkipButton} activeOpacity={0.75} onPress={onSkip}>
            <Text style={styles.tourSkipText}>Skip this tour</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function AuthPromptModal({ visible, message, onContinue, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessible={false} style={styles.authPromptBackdrop} onPress={onClose}>
        <Pressable accessible={false} accessibilityViewIsModal style={styles.authPromptSheet} onPress={(event) => event.stopPropagation()}>
          <BrandLogo
            compact
            style={styles.authPromptBrand}
            symbolStyle={styles.authPromptBrandSymbol}
            textStyle={styles.authPromptBrandText}
            dividerStyle={styles.authPromptBrandDivider}
          />
          <View style={styles.authPromptIcon}>
            <Ionicons name="lock-closed-outline" size={21} color="#2b2321" />
          </View>
          <Text style={styles.authPromptTitle}>Sign in to continue</Text>
          <Text style={styles.authPromptText}>{message || 'Log in with your mobile number to continue.'}</Text>
          <View style={styles.authPromptChipRow}>
            <View style={styles.authPromptChip}>
              <Ionicons name="heart-outline" size={14} color="#2b2321" />
              <Text style={styles.authPromptChipText}>Wishlist</Text>
            </View>
            <View style={styles.authPromptChip}>
              <Ionicons name="sparkles-outline" size={14} color="#2b2321" />
              <Text style={styles.authPromptChipText}>Try-on</Text>
            </View>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Continue to login" style={styles.authPromptPrimary} activeOpacity={0.88} onPress={onContinue}>
            <Text style={styles.authPromptPrimaryText}>Continue</Text>
            <Ionicons name="arrow-forward" size={19} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dismiss sign-in prompt" style={styles.authPromptSecondary} activeOpacity={0.75} onPress={onClose}>
            <Text style={styles.authPromptSecondaryText}>Not now</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ImageLightbox({ uri, onClose }) {
  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessible={false} style={styles.lightbox} onPress={onClose}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close full-screen image" style={styles.closeButton} onPress={onClose}>
          <DecorativeCloseIcon size={24} color="#fff" />
        </TouchableOpacity>
        {uri ? <ResilientImage source={{ uri }} style={styles.lightboxImage} resizeMode="contain" fallbackText="Image unavailable. Close and try again." /> : null}
      </Pressable>
    </Modal>
  );
}

function RouteTransition({ direction, width, reduceMotion, children }) {
  const motion = routeTransitionSpec(direction, width, reduceMotion);
  const translateX = useRef(new Animated.Value(motion.offset)).current;
  const opacity = useRef(new Animated.Value(motion.opacity)).current;

  useEffect(() => {
    if (!motion.duration) return undefined;
    const animation = Animated.parallel([
      Animated.timing(translateX, { toValue: 0, duration: motion.duration, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: motion.duration, useNativeDriver: true })
    ]);
    animation.start();
    return () => animation.stop();
  }, [motion.duration, opacity, translateX]);

  return <Animated.View style={{ flex: 1, opacity, transform: [{ translateX }] }}>{children}</Animated.View>;
}

function LookmefyApp() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const responsiveLayout = useMemo(() => responsiveLayoutForWindow(width), [width]);
  const [fontsLoaded, fontLoadError] = useFonts(fontAssets);
  const [routeStack, setRouteStack] = useState([{ name: 'home', params: {} }]);
  const routeDirection = useRef('replace');
  const authBackHandlerRef = useRef(null);
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(Boolean(enabled));
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const previousGeneratedPhoto = useRef(null);
  useEffect(() => {
    if (!token) {
      clearPrivateImageCache();
      clearScreenSnapshots();
    }
  }, [token]);
  useEffect(() => {
    const stamp = user?.bodyPhotoGeneratedAt || '';
    if (previousGeneratedPhoto.current && stamp !== previousGeneratedPhoto.current) clearPrivateImageCache();
    previousGeneratedPhoto.current = stamp;
  }, [user?.bodyPhotoGeneratedAt]);
  const [ready, setReady] = useState(false);
  const [wishlistProducts, setWishlistProducts] = useState([]);
  const [wishlistReady, setWishlistReady] = useState(false);
  const [wishlistLoadError, setWishlistLoadError] = useState(false);
  const [wishlistRefreshKey, setWishlistRefreshKey] = useState(0);
  const [wishlistMutatingId, setWishlistMutatingId] = useState('');
  const wishlistProductsRef = useRef([]);
  const wishlistMutationRef = useRef(false);
  const wishlistUserRef = useRef(null);
  wishlistUserRef.current = user;
  const [collections, setCollections] = useState([]);
  const [collectionsReady, setCollectionsReady] = useState(false);
  const [authPrompt, setAuthPrompt] = useState(null);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [tourTargetRects, setTourTargetRects] = useState({});
  const [tourFocusRequest, setTourFocusRequest] = useState(null);
  const [aiStudioOwnerKey, setAiStudioOwnerKey] = useState('');
  const [aiStudioConversationId, setAiStudioConversationId] = useState('');
  const [aiStudioMessages, setAiStudioMessages] = useState([]);
  const [aiStudioActiveChatId, setAiStudioActiveChatId] = useState('');
  const [aiStudioChatHistory, setAiStudioChatHistory] = useState([]);
  const [aiStudioHistoryReady, setAiStudioHistoryReady] = useState(false);
  const [aiStudioTryOns, setAiStudioTryOns] = useState({});
  const [aiStudioTryOnErrors, setAiStudioTryOnErrors] = useState({});
  const scrollPositionsRef = useRef({});
  const wishlistIds = useMemo(() => {
    const ids = new Set();
    wishlistProducts.forEach((product) => {
      if (product?.id == null) return;
      ids.add(product.id);
      ids.add(String(product.id));
    });
    return ids;
  }, [wishlistProducts]);

  const currentRoute = normalizeRoute(routeStack[routeStack.length - 1]?.name, routeStack[routeStack.length - 1]?.params);
  const routeParamsKey = JSON.stringify(currentRoute.params || {});
  const currentRouteKey = `${currentRoute.name}:${routeParamsKey}`;
  const rememberCurrentScrollY = useCallback((y) => {
    scrollPositionsRef.current[currentRouteKey] = Math.max(0, Number(y) || 0);
  }, [currentRouteKey]);
  const registerTourTarget = useCallback((key, rect) => {
    if (!key || !rect) return;
    const nextRect = {
      x: Number(rect.x) || 0,
      y: Number(rect.y) || 0,
      width: Number(rect.width) || 0,
      height: Number(rect.height) || 0,
      route: currentRoute.name
    };
    if (nextRect.width <= 0 || nextRect.height <= 0) return;
    setTourTargetRects((current) => {
      const previous = current[key];
      if (
        previous &&
        previous.route === nextRect.route &&
        Math.abs(previous.x - nextRect.x) < 1 &&
        Math.abs(previous.y - nextRect.y) < 1 &&
        Math.abs(previous.width - nextRect.width) < 1 &&
        Math.abs(previous.height - nextRect.height) < 1
      ) {
        return current;
      }
      return { ...current, [key]: nextRect };
    });
  }, [currentRoute.name]);
  const navigate = useCallback((name, params = {}) => {
    Keyboard.dismiss();
    const next = normalizeRoute(name, params);
    routeDirection.current = 'forward';
    setRouteStack((current) => {
      const active = normalizeRoute(current[current.length - 1]?.name, current[current.length - 1]?.params);
      if (active.name === next.name && JSON.stringify(active.params || {}) === JSON.stringify(next.params || {})) return current;
      return [...current, next];
    });
  }, []);
  useEffect(() => {
    const openRouteFromUrl = (url) => {
      const nextRoute = mobileRouteFromUrl(url);
      if (nextRoute) navigate(nextRoute.name, nextRoute.params);
    };
    Linking.getInitialURL().then(openRouteFromUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => openRouteFromUrl(url));
    return () => subscription.remove();
  }, [navigate]);
  const replaceRoute = useCallback((name, params = {}) => {
    routeDirection.current = 'replace';
    setRouteStack([normalizeRoute(name, params)]);
  }, []);
  const exitAuthToHome = useCallback(() => replaceRoute('home'), [replaceRoute]);
  const registerAuthBackHandler = useCallback((handler) => { authBackHandlerRef.current = handler; }, []);
  const requestAuth = useCallback((message = 'Log in with your mobile number to continue.') => {
    setAuthPrompt({ message });
  }, []);
  const requireFreshLogin = useCallback(async (message = 'Your session expired. Please log in again.') => {
    await clearToken();
    setToken(null);
    setUser(null);
    setWishlistProducts([]);
    setWishlistReady(false);
    setCollections([]);
    setCollectionsReady(false);
    setOnboardingVisible(false);
    setAiStudioOwnerKey('');
    setAiStudioConversationId('');
    setAiStudioMessages([]);
    setAiStudioTryOns({});
    setAiStudioTryOnErrors({});
    requestAuth(message);
  }, [requestAuth]);
  const guardedNavigate = useCallback((name, params = {}) => {
    const protectedMessages = {
      closet: 'Log in with your mobile number to use your wardrobe.',
      tryon: 'Log in with your mobile number to use Try-On.',
      stylebot: 'Log in with your mobile number to use AI Studio.',
      profile: 'Log in with your mobile number to open your profile.',
      wishlist: 'Log in with your mobile number to view your wishlist.',
      orders: 'Log in with your mobile number to view your orders.'
    };
    if (!user && protectedMessages[name]) {
      requestAuth(protectedMessages[name]);
      return;
    }
    navigate(name, params);
  }, [navigate, requestAuth, user]);
  const goBack = useCallback(() => {
    Keyboard.dismiss();
    if (routeStack.length > 1) {
      routeDirection.current = 'back';
      setRouteStack((current) => {
        if (current.length <= 1) return current;
        return current.slice(0, -1);
      });
      return true;
    }
    const active = normalizeRoute(routeStack[0]?.name, routeStack[0]?.params);
    if (active.name !== 'home') {
      routeDirection.current = 'back';
      setRouteStack([normalizeRoute('home')]);
      return true;
    }
    return false;
  }, [routeStack]);
  const handleBack = useCallback(() => {
    if (authBackHandlerRef.current) {
      authBackHandlerRef.current();
      return true;
    }
    return goBack();
  }, [goBack]);
  useEffect(() => {
    let alive = true;
    if (!user) {
      wishlistProductsRef.current = [];
      setWishlistProducts([]);
      setWishlistReady(false);
      setWishlistLoadError(false);
      return undefined;
    }
    setWishlistReady(false);
    setWishlistLoadError(false);
    wishlistProductsRef.current = [];
    setWishlistProducts([]);
    AsyncStorage.getItem(wishlistStorageKey(user))
      .then((raw) => {
        if (!alive) return;
        const parsed = raw ? JSON.parse(raw) : [];
        const products = Array.isArray(parsed) ? parsed.map((item) => normalizeProduct(item)).filter((item) => item?.id) : [];
        wishlistProductsRef.current = products;
        setWishlistProducts(products);
        setWishlistReady(true);
      })
      .catch(() => {
        if (alive) {
          setWishlistLoadError(true);
          setWishlistReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [user?.id, user?.phone, user?.email, wishlistRefreshKey]);

  useEffect(() => {
    let alive = true;
    if (!user) {
      setCollections([]);
      setCollectionsReady(false);
      return undefined;
    }
    setCollectionsReady(false);
    AsyncStorage.getItem(collectionStorageKey(user))
      .then((raw) => {
        if (!alive) return;
        const parsed = raw ? JSON.parse(raw) : [];
        const nextCollections = Array.isArray(parsed)
          ? parsed
              .map((collection) => ({
                id: String(collection.id || `collection-${Date.now()}-${Math.random().toString(36).slice(2)}`),
                name: String(collection.name || '').trim(),
                productIds: [...new Set((collection.productIds || []).map(String).filter(Boolean))],
                createdAt: collection.createdAt || new Date().toISOString(),
                updatedAt: collection.updatedAt || collection.createdAt || new Date().toISOString()
              }))
              .filter((collection) => collection.name)
          : [];
        setCollections(nextCollections);
        setCollectionsReady(true);
      })
      .catch(() => {
        if (alive) setCollectionsReady(true);
      });
    return () => {
      alive = false;
    };
  }, [user?.id, user?.phone, user?.email]);

  useEffect(() => {
    if (!user || !collectionsReady) return;
    AsyncStorage.setItem(collectionStorageKey(user), JSON.stringify(collections.slice(0, 60))).catch(() => {});
  }, [collections, collectionsReady, user, user?.email, user?.id, user?.phone]);

  const commitWishlistChange = useCallback(async (product, removeOnly = false) => {
    if (!product?.id) return;
    if (!user) {
      requestAuth('Log in with your mobile number to save products to your wishlist.');
      return;
    }
    if (!wishlistReady || wishlistLoadError) {
      Alert.alert('Wishlist unavailable', 'Your saved items could not be loaded. Please try again.');
      return;
    }
    if (wishlistMutationRef.current) return;
    const ownerKey = wishlistStorageKey(user);
    const current = wishlistProductsRef.current;
    const alreadySaved = current.some((item) => String(item.id) === String(product.id));
    const next = removeOnly || alreadySaved
      ? removeWishlistProduct(current, product.id)
      : [{ ...normalizeProduct(product), wishlistAddedAt: new Date().toISOString() }, ...current].slice(0, 100);
    if (next.length === current.length && (removeOnly || alreadySaved)) return;
    wishlistMutationRef.current = true;
    setWishlistMutatingId(String(product.id));
    try {
      await persistWishlistProducts(AsyncStorage, ownerKey, next);
      if (wishlistUserRef.current && wishlistStorageKey(wishlistUserRef.current) === ownerKey) {
        wishlistProductsRef.current = next;
        setWishlistProducts(next);
      }
    } catch {
      if (wishlistUserRef.current && wishlistStorageKey(wishlistUserRef.current) === ownerKey) {
        Alert.alert('Could not update wishlist', 'Your saved items are unchanged. Please try again.');
      }
    } finally {
      wishlistMutationRef.current = false;
      setWishlistMutatingId('');
    }
  }, [requestAuth, user, wishlistReady, wishlistLoadError]);

  const addToWishlist = useCallback((product) => commitWishlistChange(product), [commitWishlistChange]);
  const removeFromWishlist = useCallback((product) => commitWishlistChange(product, true), [commitWishlistChange]);

  const refreshUser = useCallback(async (options = {}) => {
    const data = await api('/auth/me', { timeoutMs: options.timeoutMs || 5000, noCache: true });
    if (data?.user) {
      setUser(data.user);
      return data.user;
    }
    return null;
  }, []);

  useEffect(() => {
    let alive = true;
    getToken()
      .then(async (storedToken) => {
        if (!alive) return;
        setToken(storedToken);
        if (!storedToken) return;
        const data = await api('/auth/me', { timeoutMs: 3500, noCache: true });
        if (!alive) return;
        if (data?.user) setUser(data.user);
        setRouteStack((current) => (current.length === 1 && current[0]?.name === 'auth' ? [normalizeRoute('home')] : current));
      })
      .catch(async (error) => {
        if (!alive || !isAuthExpiredError(error)) return;
        await clearToken();
        if (!alive) return;
        setToken(null);
        setUser(null);
      })
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => handleBack());
    return () => subscription.remove();
  }, [handleBack]);

  useEffect(() => {
    if (user?.bodyPhotoStatus !== 'generating') return undefined;
    const timer = setInterval(() => {
      refreshUser()
        .catch(() => {});
    }, 7000);
    return () => clearInterval(timer);
  }, [refreshUser, user?.bodyPhotoStatus]);

  useEffect(() => {
    const nextOwnerKey = user ? String(user.id || user._id || user.phone || user.username || 'user') : '';
    if (!nextOwnerKey) {
      if (aiStudioOwnerKey) setAiStudioOwnerKey('');
      if (aiStudioConversationId) setAiStudioConversationId('');
      if (aiStudioMessages.length) setAiStudioMessages([]);
      if (aiStudioActiveChatId) setAiStudioActiveChatId('');
      if (aiStudioChatHistory.length) setAiStudioChatHistory([]);
      if (aiStudioHistoryReady) setAiStudioHistoryReady(false);
      if (Object.keys(aiStudioTryOns).length) setAiStudioTryOns({});
      if (Object.keys(aiStudioTryOnErrors).length) setAiStudioTryOnErrors({});
      return;
    }
    if (nextOwnerKey === aiStudioOwnerKey) return;
    setAiStudioOwnerKey(nextOwnerKey);
    setAiStudioConversationId('');
    setAiStudioActiveChatId(`chat-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setAiStudioMessages(initialAiStudioMessages(user));
    setAiStudioChatHistory([]);
    setAiStudioHistoryReady(false);
    setAiStudioTryOns({});
    setAiStudioTryOnErrors({});
  }, [aiStudioActiveChatId, aiStudioChatHistory.length, aiStudioConversationId, aiStudioHistoryReady, aiStudioMessages.length, aiStudioOwnerKey, aiStudioTryOnErrors, aiStudioTryOns, user?.id, user?._id, user?.phone, user?.username]);

  useEffect(() => {
    if (!user || !aiStudioOwnerKey) return undefined;
    let alive = true;
    AsyncStorage.getItem(aiStudioHistoryStorageKey(user))
      .then((raw) => {
        if (!alive) return;
        const parsed = raw ? JSON.parse(raw) : [];
        const nextHistory = (Array.isArray(parsed) ? parsed : [])
          .map(normalizeAiStudioChatRecord)
          .filter(Boolean)
          .slice(0, aiStudioHistoryLimit);
        setAiStudioChatHistory(nextHistory);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setAiStudioHistoryReady(true);
      });
    return () => {
      alive = false;
    };
  }, [aiStudioOwnerKey, user?.id, user?._id, user?.phone, user?.username]);

  useEffect(() => {
    if (!user || !aiStudioHistoryReady) return;
    AsyncStorage.setItem(aiStudioHistoryStorageKey(user), JSON.stringify(aiStudioChatHistory.slice(0, aiStudioHistoryLimit))).catch(() => {});
  }, [aiStudioChatHistory, aiStudioHistoryReady, user, user?.id, user?._id, user?.phone, user?.username]);

  useEffect(() => {
    if (!ready || !user) return undefined;
    let alive = true;
    const seenKey = onboardingSeenStorageKey(user);
    Promise.all([
      AsyncStorage.getItem(onboardingPendingStorageKey),
      AsyncStorage.getItem(seenKey)
    ])
      .then(([pending, seen]) => {
        if (!alive || !pending || seen) return;
        if (pending !== '1' && pending !== seenKey) return;
        setOnboardingStep(0);
        setOnboardingVisible(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, user?.id, user?._id, user?.phone, user?.username]);

  const performLogout = async () => {
    await clearToken();
    setToken(null);
    setUser(null);
    setOnboardingVisible(false);
    replaceRoute('home');
  };

  const logout = () => {
    Alert.alert('Log out?', 'You can sign in again anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: performLogout }
    ]);
  };

  const showOnboardingStep = useCallback((nextStep) => {
    const safeStep = Math.min(Math.max(nextStep, 0), onboardingTourSteps.length - 1);
    const step = onboardingTourSteps[safeStep];
    const targetRoute = step?.route;
    if (step?.targetKey) {
      setTourTargetRects((current) => {
        if (!current[step.targetKey]) return current;
        const next = { ...current };
        delete next[step.targetKey];
        return next;
      });
      setTourFocusRequest({ targetKey: step.targetKey, routeName: targetRoute?.name || currentRoute.name, nonce: Date.now() });
    }
    setOnboardingStep(safeStep);
    if (targetRoute) replaceRoute(targetRoute.name, targetRoute.params || {});
  }, [currentRoute.name, replaceRoute]);

  const completeOnboarding = useCallback(async () => {
    setOnboardingVisible(false);
    setOnboardingStep(0);
    try {
      if (!user) return;
      const seenKey = onboardingSeenStorageKey(user);
      // Persist completion first so a failed write still allows restart recovery.
      await AsyncStorage.setItem(seenKey, '1');
      const pending = await AsyncStorage.getItem(onboardingPendingStorageKey);
      if (pending === '1' || pending === seenKey) {
        await AsyncStorage.removeItem(onboardingPendingStorageKey);
      }
    } catch {
      // A storage failure should not trap the user in the tour.
    }
  }, [user]);

  const nextOnboardingStep = useCallback(() => {
    if (onboardingStep >= onboardingTourSteps.length - 1) {
      completeOnboarding();
      return;
    }
    showOnboardingStep(onboardingStep + 1);
  }, [completeOnboarding, onboardingStep, showOnboardingStep]);

  const previousOnboardingStep = useCallback(() => {
    showOnboardingStep(onboardingStep - 1);
  }, [onboardingStep, showOnboardingStep]);

  const screen = useMemo(() => {
    const routeParams = currentRoute.params || {};
    switch (currentRoute.name) {
      case 'auth':
        return user ? <HomeScreen onNavigate={guardedNavigate} user={user} token={token} onAddToWishlist={addToWishlist} wishlistIds={wishlistIds} registerTourTarget={registerTourTarget} tourFocusRequest={tourFocusRequest} initialScrollY={scrollPositionsRef.current[currentRouteKey] || 0} onScrollPositionChange={rememberCurrentScrollY} /> : <AuthEntryScreen onNavigate={navigate} />;
      case 'home':
        return <HomeScreen onNavigate={guardedNavigate} user={user} token={token} onAddToWishlist={addToWishlist} wishlistIds={wishlistIds} registerTourTarget={registerTourTarget} tourFocusRequest={tourFocusRequest} initialScrollY={scrollPositionsRef.current[currentRouteKey] || 0} onScrollPositionChange={rememberCurrentScrollY} />;
      case 'shop':
        return <ShopScreen initial={routeParams} user={user} setUser={setUser} token={token} onNavigate={guardedNavigate} onBack={routeStack.length > 1 ? goBack : null} onRequireAuth={requestAuth} onAuthExpired={requireFreshLogin} onAddToWishlist={addToWishlist} wishlistIds={wishlistIds} initialScrollY={scrollPositionsRef.current[currentRouteKey] || 0} onScrollPositionChange={rememberCurrentScrollY} />;
      case 'search':
        return <SearchScreen initial={routeParams} user={user} token={token} onNavigate={guardedNavigate} onBack={goBack} onAddToWishlist={addToWishlist} wishlistIds={wishlistIds} />;
      case 'tryon':
        return <CustomTryOnScreen initial={routeParams} user={user} setUser={setUser} setToken={setToken} token={token} onNavigate={guardedNavigate} onBack={routeStack.length > 1 ? goBack : null} refreshUser={refreshUser} />;
      case 'closet':
        return <ClosetScreen initial={routeParams} user={user} setUser={setUser} setToken={setToken} token={token} onNavigate={guardedNavigate} onBack={routeStack.length > 1 ? goBack : null} registerTourTarget={registerTourTarget} tourFocusRequest={tourFocusRequest} />;
      case 'custom':
        return <CustomTryOnScreen initial={routeParams} user={user} setUser={setUser} setToken={setToken} token={token} onNavigate={guardedNavigate} onBack={routeStack.length > 1 ? goBack : null} refreshUser={refreshUser} />;
      case 'stylebot':
        return <StyleBotScreen user={user} setUser={setUser} setToken={setToken} token={token} onNavigate={guardedNavigate} onBack={goBack} registerTourTarget={registerTourTarget} tourFocusRequest={tourFocusRequest} aiStudioConversationId={aiStudioConversationId} setAiStudioConversationId={setAiStudioConversationId} aiStudioMessages={aiStudioMessages} setAiStudioMessages={setAiStudioMessages} aiStudioActiveChatId={aiStudioActiveChatId} setAiStudioActiveChatId={setAiStudioActiveChatId} aiStudioChatHistory={aiStudioChatHistory} setAiStudioChatHistory={setAiStudioChatHistory} aiStudioTryOns={aiStudioTryOns} setAiStudioTryOns={setAiStudioTryOns} aiStudioTryOnErrors={aiStudioTryOnErrors} setAiStudioTryOnErrors={setAiStudioTryOnErrors} />;
      case 'tokens':
        return <TokensScreen user={user} setUser={setUser} token={token} onNavigate={guardedNavigate} onBack={routeStack.length > 1 ? goBack : null} onRequireAuth={requestAuth} />;
      case 'profile':
        return <ProfileScreen user={user} setUser={setUser} setToken={setToken} token={token} onNavigate={guardedNavigate} onBack={routeStack.length > 1 ? goBack : null} onLogout={logout} registerTourTarget={registerTourTarget} tourFocusRequest={tourFocusRequest} collections={collections} />;
      case 'generation-history':
        return user ? <GenerationHistoryScreen user={user} setUser={setUser} setToken={setToken} token={token} onNavigate={guardedNavigate} onBack={routeStack.length > 1 ? goBack : null} /> : <AuthScreen mode="login" setUser={setUser} setToken={setToken} onNavigate={navigate} onBack={goBack} onExit={exitAuthToHome} registerBackHandler={registerAuthBackHandler} />;
      case 'wishlist':
        return user ? <WishlistScreen onNavigate={guardedNavigate} onBack={routeStack.length > 1 ? goBack : null} token={token} wishlistProducts={wishlistProducts} wishlistReady={wishlistReady} wishlistLoadError={wishlistLoadError} wishlistMutatingId={wishlistMutatingId} onRetryWishlist={() => setWishlistRefreshKey((current) => current + 1)} user={user} onRemoveFromWishlist={removeFromWishlist} /> : <AuthScreen mode="login" setUser={setUser} setToken={setToken} onNavigate={navigate} onBack={goBack} onExit={exitAuthToHome} registerBackHandler={registerAuthBackHandler} />;
      case 'collections':
        return user ? <CollectionsScreen onNavigate={guardedNavigate} onBack={routeStack.length > 1 ? goBack : null} user={user} collections={collections} wishlistProducts={wishlistProducts} /> : <AuthScreen mode="login" setUser={setUser} setToken={setToken} onNavigate={navigate} onBack={goBack} onExit={exitAuthToHome} registerBackHandler={registerAuthBackHandler} />;
      case 'orders':
        return user ? <OrdersScreen onNavigate={guardedNavigate} onBack={routeStack.length > 1 ? goBack : null} token={token} user={user} /> : <AuthScreen mode="login" setUser={setUser} setToken={setToken} onNavigate={navigate} onBack={goBack} onExit={exitAuthToHome} registerBackHandler={registerAuthBackHandler} />;
      case 'product':
        return routeParams.id ? <ProductScreen id={routeParams.id} user={user} setUser={setUser} token={token} onNavigate={guardedNavigate} onBack={routeStack.length > 1 ? goBack : null} onRequireAuth={requestAuth} onAuthExpired={requireFreshLogin} onAddToWishlist={addToWishlist} wishlistIds={wishlistIds} /> : <ShopScreen initial={{}} user={user} setUser={setUser} token={token} onNavigate={guardedNavigate} onBack={routeStack.length > 1 ? goBack : null} onRequireAuth={requestAuth} onAuthExpired={requireFreshLogin} onAddToWishlist={addToWishlist} wishlistIds={wishlistIds} initialScrollY={scrollPositionsRef.current[currentRouteKey] || 0} onScrollPositionChange={rememberCurrentScrollY} />;
      case 'checkout':
        return user && routeParams.productId ? <CheckoutScreen productId={routeParams.productId} user={user} onNavigate={guardedNavigate} onBack={goBack} /> : <ShopScreen initial={{}} user={user} setUser={setUser} token={token} onNavigate={guardedNavigate} onBack={goBack} onRequireAuth={requestAuth} onAuthExpired={requireFreshLogin} onAddToWishlist={addToWishlist} wishlistIds={wishlistIds} />;
      case 'signup':
        return <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={navigate} onAuthenticated={() => replaceRoute('home')} onBack={goBack} onExit={exitAuthToHome} registerBackHandler={registerAuthBackHandler} />;
      case 'login':
        return <AuthScreen mode="login" setUser={setUser} setToken={setToken} onNavigate={navigate} onAuthenticated={() => replaceRoute('home')} onBack={goBack} onExit={exitAuthToHome} registerBackHandler={registerAuthBackHandler} />;
      case 'how':
        return <HowItWorksScreen user={user} onNavigate={navigate} />;
      case 'info':
        return <InfoScreen page={routeParams.page} user={user} onNavigate={navigate} onBack={routeStack.length > 1 ? goBack : null} />;
      default:
        return <InfoScreen page="missing" user={user} onNavigate={navigate} onBack={routeStack.length > 1 ? goBack : null} />;
    }
  }, [currentRoute.name, routeParamsKey, currentRouteKey, user, token, navigate, replaceRoute, guardedNavigate, requestAuth, requireFreshLogin, addToWishlist, removeFromWishlist, collections, wishlistIds, wishlistProducts, wishlistReady, wishlistLoadError, wishlistMutatingId, registerTourTarget, tourFocusRequest, aiStudioConversationId, aiStudioMessages, aiStudioActiveChatId, aiStudioChatHistory, aiStudioTryOns, aiStudioTryOnErrors, refreshUser, routeStack.length, goBack, exitAuthToHome, registerAuthBackHandler, rememberCurrentScrollY]);

  if (!ready || (!fontsLoaded && !fontLoadError)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.boot}>
          <ActivityIndicator size="small" color="#9b5658" />
          <Text style={styles.bootText}>Loading Lookmefy</Text>
        </View>
      </SafeAreaView>
    );
  }

  const authOnlyRoute = !user && ['auth', 'login', 'signup'].includes(currentRoute.name);
  const welcomeRoute = !user && currentRoute.name === 'auth';
  const signupRoute = !user && currentRoute.name === 'signup';
  const loginRoute = !user && currentRoute.name === 'login';
  const homeRoute = currentRoute.name === 'home';
  const shopRoute = currentRoute.name === 'shop';
  const searchRoute = currentRoute.name === 'search';
  const tryOnRoute = currentRoute.name === 'tryon' || currentRoute.name === 'custom';
  const closetRoute = currentRoute.name === 'closet';
  const closetAddRoute = closetRoute && currentRoute.params?.view === 'add';
  const productRoute = currentRoute.name === 'product';
  const checkoutRoute = currentRoute.name === 'checkout';
  const aiStudioRoute = currentRoute.name === 'stylebot';
  const tokensRoute = currentRoute.name === 'tokens';
  const profileRoute = currentRoute.name === 'profile';
  const generationHistoryRoute = currentRoute.name === 'generation-history';
  const wishlistRoute = currentRoute.name === 'wishlist';
  const collectionsRoute = currentRoute.name === 'collections';
  const ordersRoute = currentRoute.name === 'orders';
  const accountChildRoute = wishlistRoute || collectionsRoute || ordersRoute || generationHistoryRoute;
  const showBottomNav = !(authOnlyRoute || searchRoute || closetAddRoute || aiStudioRoute || tokensRoute || checkoutRoute);

  return (
    <ResponsiveLayoutContext.Provider value={responsiveLayout}>
    <PrivateMediaSessionContext.Provider key={String(user?.id || user?._id || 'guest')} value={user ? token || '' : ''}>
    <ContentReportingContext.Provider value={String(user?.id || user?._id || '')}>
    <InsetSafeAreaView edges={showBottomNav ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']} style={[styles.safe, welcomeRoute && styles.authEntrySafe, signupRoute && styles.signupSafe, loginRoute && styles.loginSafe, homeRoute && styles.homeSafe, shopRoute && styles.shopSafe, searchRoute && styles.shopSafe, closetRoute && styles.wardrobeSafe, productRoute && styles.productSafe, checkoutRoute && styles.productSafe, aiStudioRoute && styles.aiStudioSafe, tokensRoute && styles.creditsSafe, profileRoute && styles.profileSafe, accountChildRoute && styles.profileSafe, !welcomeRoute && styles.surfaceRoot]} onAccessibilityEscape={handleBack}>
      {!welcomeRoute ? <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <View style={styles.surfaceGlowTop} />
        <View style={styles.surfaceGlowBottom} />
      </View> : null}
      <StatusBar style={welcomeRoute ? 'light' : 'dark'} />
      {authOnlyRoute || homeRoute || shopRoute || searchRoute || closetRoute || productRoute || checkoutRoute || aiStudioRoute || tokensRoute || profileRoute || accountChildRoute ? null : <AppHeader onNavigate={guardedNavigate} user={user} compact showSearch={!tryOnRoute} />}
      <View style={[styles.content, styles.surfaceTransparent, responsiveLayout.contentFrameStyle]}>
        <RouteTransition key={currentRouteKey} direction={routeDirection.current} width={width} reduceMotion={reduceMotion}>
          <ScreenErrorBoundary routeName={currentRoute.name} onHome={() => navigate('home')}>
            {screen}
          </ScreenErrorBoundary>
        </RouteTransition>
      </View>
      {/* Preserve the tab labels across full-screen routes and keyboard transitions. */}
      <View
        pointerEvents={showBottomNav ? 'auto' : 'none'}
        accessibilityElementsHidden={!showBottomNav}
        importantForAccessibility={showBottomNav ? 'auto' : 'no-hide-descendants'}
        style={[styles.bottomNavFrame, { display: showBottomNav ? 'flex' : 'none', bottom: Platform.OS === 'ios' ? Math.max(insets.bottom - 10, 10) : Math.max(insets.bottom, 10) }]}
      >
        <View style={styles.bottomNavGlass}>
          <BlurView pointerEvents="none" intensity={38} tint="dark" blurReductionFactor={2.5} experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'} style={StyleSheet.absoluteFillObject} />
          <BottomNav route={currentRoute} onNavigate={guardedNavigate} />
        </View>
      </View>
      <AuthPromptModal
        visible={Boolean(authPrompt)}
        message={authPrompt?.message}
        onClose={() => setAuthPrompt(null)}
        onContinue={() => {
          setAuthPrompt(null);
          navigate('login');
        }}
      />
      <OnboardingTour
        visible={onboardingVisible && Boolean(user)}
        step={onboardingStep}
        targetRects={tourTargetRects}
        currentRouteName={currentRoute.name}
        onNext={nextOnboardingStep}
        onBack={previousOnboardingStep}
        onSkip={completeOnboarding}
        onDone={completeOnboarding}
      />
    </InsetSafeAreaView>
    </ContentReportingContext.Provider>
    </PrivateMediaSessionContext.Provider>
    </ResponsiveLayoutContext.Provider>
  );
}

export default function App() {
  return <SafeAreaProvider><LookmefyApp /></SafeAreaProvider>;
}

const styles = StyleSheet.create(nativeAppearanceStyles({
  checkoutScreen: { flex: 1, backgroundColor: '#f8f4ed' },
  checkoutContent: { width: '100%', alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 55, gap: 8 },
  checkoutColumns: { gap: 18 },
  checkoutColumnsTablet: { flexDirection: 'row', alignItems: 'flex-start', gap: 22 },
  checkoutFormColumn: { flex: 1, backgroundColor: '#fffdfb', borderWidth: 1, borderColor: '#e9e2dc', borderRadius: 16, padding: 20 },
  checkoutKicker: { color: '#9b5658', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  checkoutTitle: { color: '#211d1b', fontSize: 36, fontWeight: '700' },
  checkoutSubtext: { color: '#77706c', fontSize: 13, lineHeight: 19 },
  checkoutLoader: { marginVertical: 28 },
  checkoutNotice: { backgroundColor: '#fff9f5', borderWidth: 1, borderColor: '#e9d8ce', borderRadius: 13, padding: 16, marginTop: 10 },
  checkoutNoticeText: { color: '#574c47', lineHeight: 21 },
  checkoutSummary: { marginTop: 16, backgroundColor: '#fffdfb', borderColor: '#e9e2dc', borderWidth: 1, borderRadius: 16, padding: 17, gap: 13 },
  checkoutSummaryTablet: { width: 330, marginTop: 0 },
  checkoutSectionTitle: { color: '#241f1d', fontSize: 23, fontWeight: '700', marginTop: 8 },
  checkoutItemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  checkoutProductImage: { width: 66, height: 72, borderRadius: 10, backgroundColor: '#f7f2ed' },
  checkoutItemCopy: { flex: 1, gap: 4 },
  checkoutItemName: { color: '#2d2825', fontWeight: '700', fontSize: 13 },
  checkoutItemMeta: { color: '#817974', fontSize: 11 },
  checkoutItemPrice: { color: '#211d1b', fontWeight: '700', fontSize: 13 },
  checkoutTotalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#eee8e3', paddingTop: 10, color: '#4d4540' },
  checkoutGrandTotal: { fontWeight: '700' },
  checkoutFieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  checkoutField: { minWidth: 150, flexGrow: 1, flexBasis: '46%', gap: 6 },
  checkoutFieldWide: { flexBasis: '100%' },
  checkoutFieldLabel: { color: '#5c5551', fontSize: 11, fontWeight: '700' },
  checkoutInput: { minHeight: 46, borderWidth: 1, borderColor: '#e3dcd5', borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#fffdfb', color: '#26211e', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  checkoutStateText: { color: '#534b46' },
  checkoutStateList: { maxHeight: 190, flexBasis: '100%', backgroundColor: '#fffdfb', borderRadius: 8, borderWidth: 1, borderColor: '#e3dcd5' },
  checkoutStateOption: { padding: 13, borderBottomWidth: 1, borderBottomColor: '#f1ebe6' },
  checkoutPinStatus: { marginTop: 5, color: '#517a5e', fontSize: 12 },
  checkoutDivider: { height: 1, backgroundColor: '#eae1da', marginTop: 22, marginBottom: 10 },
  checkoutPaymentOption: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#e3dcd5', borderRadius: 10, backgroundColor: '#fffdfb', padding: 16, marginTop: 12 },
  checkoutPaymentTitle: { color: '#302a27', fontWeight: '700' },
  checkoutPaymentDescription: { color: '#7f746e', fontSize: 11, marginTop: 3 },
  checkoutConfirmButton: { backgroundColor: '#111111', borderRadius: 10, minHeight: 50, justifyContent: 'center', alignItems: 'center', marginTop: 14 },
  checkoutConfirmText: { color: '#ffffff', fontWeight: '700' },
  checkoutSuccess: { alignItems: 'center', gap: 8, borderRadius: 16, backgroundColor: '#eff8f0', padding: 20, marginTop: 14 },
  checkoutOrdersLink: { color: '#257651', fontWeight: '700', marginTop: 5 },
  checkoutOrderList: { gap: 10 },
  checkoutOrderCard: { backgroundColor: '#fffdfb', borderColor: '#e9e2dc', borderWidth: 1, borderRadius: 12, padding: 15, gap: 5 },
  releaseConsentOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(20,16,14,0.48)' },
  releaseConsentCard: { width: '100%', maxWidth: 520, maxHeight: '90%', borderRadius: 12, backgroundColor: '#fffdfb', overflow: 'hidden' },
  releaseConsentBody: { padding: 20, gap: 12 },
  releaseConsentTitle: { ...typography.h3, fontSize: 21, lineHeight: 28, color: '#2b2321' },
  releaseConsentCopy: { ...typography.body, fontSize: 14, lineHeight: 21, color: '#5f5853' },
  releaseConsentActions: { paddingHorizontal: 20, paddingBottom: 20, gap: 10 },
  releaseConsentButton: { minHeight: 48, paddingVertical: 12 },
  aiPhotoDisclosureLink: { color: '#9b5658', textDecorationLine: 'underline' },
  releaseReportAction: { minHeight: 44, paddingVertical: 10, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 7 },
  releaseReportText: { ...typography.caption, color: '#8c4d50', fontSize: 13, lineHeight: 19, flexShrink: 1 },
  releaseLegalAction: { minHeight: 44, justifyContent: 'center' },
  safe: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  surfaceRoot: {
    backgroundColor: '#f7f3eb'
  },
  surfaceTransparent: {
    backgroundColor: 'transparent'
  },
  surfaceGlowTop: {
    position: 'absolute',
    top: 110,
    right: -85,
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: 'rgba(207, 187, 150, 0.18)'
  },
  surfaceGlowBottom: {
    position: 'absolute',
    bottom: 115,
    left: -90,
    width: 290,
    height: 290,
    borderRadius: 145,
    backgroundColor: 'rgba(215, 195, 160, 0.2)'
  },
  surfaceBackdrop: {
    borderRadius: 18,
    overflow: 'hidden'
  },
  surfaceCard: {
    borderColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    shadowColor: '#6b5651',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }
  },
  authEntrySafe: {
    backgroundColor: '#111111'
  },
  signupSafe: {
    backgroundColor: '#fbf7f6'
  },
  loginSafe: {
    backgroundColor: '#fbf7f6'
  },
  homeSafe: {
    backgroundColor: '#fbf7f6'
  },
  shopSafe: {
    backgroundColor: '#fbf7f6'
  },
  wardrobeSafe: {
    backgroundColor: '#fbf7f6'
  },
  productSafe: {
    backgroundColor: '#fbf7f6'
  },
  aiStudioSafe: {
    backgroundColor: '#fbf7f6'
  },
  creditsSafe: {
    backgroundColor: '#fbf7f6'
  },
  profileSafe: {
    backgroundColor: '#fbf7f6'
  },
  flex: {
    flex: 1
  },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
    backgroundColor: '#fbf7f6'
  },
  bootText: {
    ...typography.caption,
    color: '#5d5754',
    fontSize: 13,
    lineHeight: 18
  },
  bootBrand: {
    ...typography.display,
    color: '#211c1a',
    lineHeight: 36
  },
  bootCard: {
    width: '100%',
    maxWidth: 260,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee3dc',
    backgroundColor: '#fffdfb',
    padding: 18,
    gap: 10,
    shadowColor: '#2a211d',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  content: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#fbf7f6'
  },
  pageBackRow: {
    width: '100%',
    paddingHorizontal: 12,
    paddingTop: 5,
    paddingBottom: 6,
    backgroundColor: 'rgba(255, 252, 250, 0.36)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 10
  },
  pageBackButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: '#fffdfb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3
  },
  pageBackButtonText: {
    ...typography.label,
    fontSize: 12,
    color: '#211f1d'
  },
  categorySearchDock: {
    flex: 1,
    minWidth: 0
  },
  categorySearchBox: {
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: '#fffdfb',
    paddingLeft: 10,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  categorySearchBoxFocused: {
    borderColor: '#b9ada5',
    backgroundColor: '#ffffff'
  },
  categorySearchInput: {
    ...typography.body,
    flex: 1,
    minHeight: 42,
    paddingVertical: 0,
    color: '#211f1d',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500'
  },
  categorySearchIconButton: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7f0ed'
  },
  categorySearchSubmit: {
    width: 38,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111'
  },
  categoryReferenceTrack: {
    paddingTop: 7,
    paddingRight: 12,
    gap: 8
  },
  categoryReferenceChip: {
    maxWidth: 190,
    minHeight: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#eadfda',
    backgroundColor: '#fffdfb',
    paddingLeft: 5,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  categoryReferenceImageFrame: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff5f3'
  },
  categoryReferenceImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    backgroundColor: '#f1eef4'
  },
  categoryReferenceCopy: {
    flex: 1,
    minWidth: 0
  },
  categoryReferenceText: {
    ...typography.caption,
    color: '#211c1a',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800'
  },
  categoryReferenceMeta: {
    ...typography.caption,
    marginTop: 1,
    color: '#8c8580',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700'
  },
  scrollContent: {
    paddingBottom: bottomNavigationHeight + screenBottomInset + 112,
    paddingHorizontal: 16
  },
  appHeader: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(255, 252, 250, 0.36)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.78)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  appHeaderCompact: {
    minHeight: 56,
    paddingTop: 6,
    paddingBottom: 6,
    zIndex: 10
  },
  appHeaderNarrow: {
    paddingHorizontal: 10
  },
  appHeaderAction: {
    width: 48,
    height: 48,
    flexShrink: 0,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  appHeaderCreditAction: {
    width: 'auto',
    minWidth: 48,
    height: 'auto',
    minHeight: 48,
    flexShrink: 0,
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    backgroundColor: '#fff3df',
    borderWidth: 1,
    borderColor: '#ead8bf'
  },
  appHeaderCreditText: {
    marginLeft: 1,
    color: '#171412',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0,
    flexShrink: 0
  },
  appHeaderSide: {
    width: 'auto',
    minHeight: 48,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2
  },
  appHeaderLeftSide: {
    justifyContent: 'flex-start'
  },
  appHeaderRightSide: {
    justifyContent: 'flex-end'
  },
  appHeaderRightSideNarrow: {
    gap: 0
  },
  appHeaderBrandWrap: {
    minWidth: 0,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1
  },
  appHeaderBrandWrapLeft: {
    alignItems: 'flex-start'
  },
  appHeaderBrandWrapNarrow: {
    flex: 0,
    width: 48
  },
  appHeaderNarrowLogo: {
    width: 30,
    height: 30
  },
  aiStudioHeaderBrandLogo: {
    maxWidth: 118,
    gap: 4
  },
  aiStudioHeaderBrandText: {
    fontSize: 18,
    lineHeight: 22
  },
  appHeaderBrand: {
    ...typography.h3,
    color: '#111111',
    fontSize: 20,
    lineHeight: 24
  },
  brandLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%'
  },
  brandLogoCompact: {
    gap: 6
  },
  brandLogoSymbol: {
    width: 42,
    height: 42
  },
  brandLogoSymbolCompact: {
    width: 27,
    height: 27
  },
  brandLogoSymbolLight: {
    tintColor: '#ffffff'
  },
  brandLogoDivider: {
    width: 1,
    height: 31,
    backgroundColor: '#cfc7c2'
  },
  brandLogoDividerCompact: {
    height: 22
  },
  brandLogoDividerLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.58)'
  },
  brandLogoText: {
    color: '#050505',
    fontFamily: fontFamilies.logo,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '400',
    letterSpacing: 0
  },
  brandLogoTextCompact: {
    fontSize: 23,
    lineHeight: 28
  },
  brandLogoTextLight: {
    color: '#ffffff'
  },
  appHeaderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e4ddd8'
  },
  appHeaderAvatarInitials: {
    fontSize: 12,
    lineHeight: 16
  },
  avatarFaceImage: {
    transform: [{ scale: 1.04 }]
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1
  },
  headerSub: {
    ...typography.caption,
    marginTop: 1,
    color: '#64748b',
    fontWeight: '700'
  },
  headerNotice: {
    ...typography.caption,
    marginTop: 2,
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '700'
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17
  },
  headerAvatarInitials: {
    fontSize: 12,
    lineHeight: 16
  },
  bottomNavFrame: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 40,
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: 'transparent'
  },
  bottomNavGlass: {
    width: '100%',
    maxWidth: 560,
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: '#100e0d',
    shadowOpacity: 0.23,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 11
  },
  bottomNav: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 66,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(21, 20, 22, 0.28)'
  },
  bottomNavCompact: {
    paddingHorizontal: 4
  },
  bottomNavTablet: {
    paddingHorizontal: 18
  },
  navItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 50
  },
  navIconWrap: {
    width: 38,
    height: 29,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent'
  },
  navIconWrapCenter: {
    width: 38,
    height: 29,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.17)'
  },
  navText: {
    ...typography.nav,
    fontSize: 10.5,
    lineHeight: 13,
    width: '100%',
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.78)',
    fontWeight: '600'
  },
  navTextActive: {
    color: '#ffffff',
    fontFamily: fontFamilies.bodyBold,
    fontWeight: '800'
  },
  navActiveUnderline: {
    width: 16,
    height: 2,
    borderRadius: 1,
    marginTop: 0,
    backgroundColor: 'transparent'
  },
  navActiveUnderlineVisible: {
    backgroundColor: '#eadbc0'
  },
  homeScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  homeScroll: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  homeContent: {
    paddingTop: 0,
    paddingBottom: bottomNavigationHeight + 16,
    backgroundColor: 'transparent'
  },
  homeContentTablet: {
    paddingBottom: bottomNavigationHeight + screenBottomInset + 12
  },
  homeStudioHero: {
    marginHorizontal: 20,
    marginTop: 12,
    height: 228,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#21170f',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    position: 'relative'
  },
  homeStudioHeroCompact: {
    marginHorizontal: 16,
    height: 220
  },
  homeStudioHeroImage: {
    position: 'absolute',
    left: -16,
    top: 0,
    width: '116%',
    height: '100%'
  },
  homeStudioHeroImageTablet: {
    left: 0,
    width: '100%'
  },
  homeStudioHeroTextScrim: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '67%',
    backgroundColor: 'rgba(17, 10, 7, 0.2)'
  },
  homeStudioHeroCopy: {
    width: '72%',
    height: '100%',
    justifyContent: 'center',
    paddingLeft: 18,
    paddingRight: 4,
    zIndex: 2
  },
  homeStudioHeroCopyCompact: {
    paddingLeft: 16
  },
  homeStudioHeroCopyTablet: {
    width: '50%',
    paddingLeft: 26
  },
  homeStudioKicker: {
    ...typography.label,
    color: '#fffaf5',
    fontSize: 9,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 1.8
  },
  homeStudioKickerTablet: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 2.2
  },
  homeStudioTitle: {
    fontFamily: fontFamilies.hero,
    marginTop: 7,
    color: '#fffaf5',
    fontSize: 29,
    lineHeight: 34,
    letterSpacing: 0
  },
  homeStudioTitleCompact: {
    fontSize: 26,
    lineHeight: 31
  },
  homeStudioTitleTablet: {
    fontSize: 43,
    lineHeight: 50
  },
  homeStudioText: {
    ...typography.body,
    marginTop: 9,
    maxWidth: 160,
    color: '#fffaf5',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '400'
  },
  homeStudioTextTablet: {
    marginTop: 13,
    maxWidth: 280,
    fontSize: 16,
    lineHeight: 23
  },
  homeStudioPrimaryButton: {
    marginTop: 14,
    width: 150,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#fffaf6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  homeStudioPrimaryButtonLargeText: {
    width: 174
  },
  homeStudioPrimaryButtonTablet: {
    marginTop: 20,
    width: 220,
    minHeight: 54
  },
  homeStudioPrimaryText: {
    flexShrink: 1,
    fontFamily: fontFamilies.bodyBold,
    color: '#15100d',
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
    letterSpacing: 0
  },
  homeStudioPrimaryTextTablet: {
    fontSize: 16,
    lineHeight: 22
  },
  homeStudioPanel: {
    marginTop: 22,
    paddingHorizontal: 20
  },
  homeStyleStudioPanel: {
    marginTop: 18
  },
  homeStudioSectionHead: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  homeStudioSectionCopy: {
    flex: 1,
    minWidth: 0
  },
  homeStudioSectionTitle: {
    fontFamily: fontFamilies.bodyBold,
    color: '#211f1d',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    letterSpacing: 0
  },
  homeStudioSectionSubtitle: {
    ...typography.caption,
    marginTop: 2,
    color: '#77716c',
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '500',
    letterSpacing: 0
  },
  homeStudioSeeAll: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  homeStudioSeeAllText: {
    ...typography.caption,
    color: '#111111',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0
  },
  homeStudioActionGrid: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10
  },
  homeStudioActionGridNarrow: {
    flexDirection: 'column'
  },
  homeStudioActionTile: {
    flex: 1,
    minHeight: 122,
    borderRadius: 12,
    borderWidth: 0,
    backgroundColor: '#f1ece6',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 13,
    paddingBottom: 12
  },
  homeStudioActionTileNarrow: {
    flex: 0,
    minHeight: 72,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  homeStudioActionTileLargeText: {
    flexDirection: 'column',
    alignItems: 'stretch'
  },
  homeStudioActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#faf8f5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  homeStudioActionIconNarrow: {
    flexShrink: 0
  },
  homeStudioActionIconLargeText: {
    alignSelf: 'flex-start',
    marginBottom: 8
  },
  homeStudioActionCopyNarrow: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12
  },
  homeStudioActionCopyLargeText: {
    flex: 0,
    marginLeft: 0
  },
  homeStudioActionTitle: {
    fontFamily: fontFamilies.bodyBold,
    marginTop: 8,
    minHeight: 32,
    color: '#211f1d',
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0
  },
  homeStudioActionTitleNarrow: {
    minHeight: 0,
    marginTop: 0,
    textAlign: 'left',
    fontSize: 13
  },
  homeStudioActionText: {
    ...typography.caption,
    marginTop: 4,
    color: '#625d58',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0
  },
  homeStudioActionTextNarrow: {
    marginTop: 2,
    textAlign: 'left'
  },
  homeStudioWardrobeBanner: {
    marginTop: 16,
    marginHorizontal: 20,
    minHeight: 126,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: '#f1ebe4',
    flexDirection: 'row'
  },
  homeStudioWardrobeBannerStacked: {
    flexDirection: 'column'
  },
  homeStudioWardrobeBannerCopy: {
    flexBasis: '62%',
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 13
  },
  homeStudioWardrobeBannerCopyStacked: {
    flexBasis: 'auto',
    flexGrow: 0,
    flexShrink: 0,
    paddingRight: 16
  },
  homeStudioBannerTitle: {
    fontFamily: fontFamilies.bodyBold,
    color: '#211f1d',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: 0
  },
  homeStudioBannerText: {
    ...typography.caption,
    marginTop: 5,
    color: '#77716c',
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '500',
    letterSpacing: 0
  },
  homeStudioBannerButton: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    marginTop: 8,
    minHeight: 34,
    borderRadius: 9,
    backgroundColor: '#050505',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 15,
    paddingVertical: 8
  },
  homeStudioBannerButtonText: {
    flexShrink: 1,
    fontFamily: fontFamilies.bodyBold,
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0
  },
  homeStudioBannerImage: {
    flex: 1,
    height: '100%',
    alignSelf: 'stretch',
    backgroundColor: '#eee5dc'
  },
  homeStudioBannerImageStacked: {
    flex: 0,
    width: '100%',
    height: 140
  },
  homeStudioSavedPreview: {
    flex: 1,
    minHeight: 126,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end'
  },
  homeStudioSavedPreviewStacked: {
    flex: 0,
    minHeight: 0,
    height: 104,
    paddingHorizontal: 16,
    paddingBottom: 14,
    justifyContent: 'flex-start'
  },
  homeStudioSavedImage: {
    width: 66,
    height: 88,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#faf8f5',
    backgroundColor: '#e8e1da'
  },
  homeStudioSavedImageOverlap: {
    marginLeft: -38
  },
  homeStudioSavedPreviewFallback: {
    flex: 1,
    minHeight: 124,
    alignItems: 'center',
    justifyContent: 'center'
  },
  homeStudioLookRow: {
    marginTop: 10,
    gap: 12,
    paddingRight: 4,
    paddingBottom: 2
  },
  homeStudioLookCard: {
    flexShrink: 0,
    minWidth: 134
  },
  homeStudioLookCardCompact: {
    minHeight: 134
  },
  homeStudioLookImageWrap: {
    aspectRatio: 0.78,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f6f2ed',
    position: 'relative'
  },
  homeStudioLookImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f6f2ed'
  },
  homeStudioLookTitle: {
    fontFamily: fontFamilies.bodySemiBold,
    marginTop: 7,
    color: '#211f1d',
    minHeight: 34,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    letterSpacing: 0
  },
  homeStudioLookMeta: {
    ...typography.caption,
    marginTop: 2,
    color: '#5d5752',
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0
  },
  homeEditorialHeader: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  homeEditorialBrand: {
    fontFamily: fontFamilies.logo,
    color: '#050505',
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '400',
    letterSpacing: 0
  },
  homeEditorialTagline: {
    ...typography.label,
    marginTop: 3,
    color: '#7d8189',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 4
  },
  homeBellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff'
  },
  homeTryOnHero: {
    minHeight: 540,
    marginTop: 0,
    marginHorizontal: 0,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 8,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#fffdf9',
    position: 'relative'
  },
  homeMissionIntro: {
    height: 178,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#fffdf9'
  },
  homeMissionStoryFrame: {
    ...StyleSheet.absoluteFillObject
  },
  homeMissionAmbient: {
    position: 'absolute',
    top: 6,
    right: -20,
    bottom: 0,
    width: '52%',
    backgroundColor: '#f5eee7',
    opacity: 0.28
  },
  homeMissionModelLayer: {
    position: 'absolute',
    top: 0,
    right: -10,
    bottom: -4,
    width: '61%',
    overflow: 'visible',
    zIndex: 1
  },
  homeMissionCopy: {
    position: 'absolute',
    left: 0,
    top: 8,
    width: '63%',
    zIndex: 4
  },
  homeMissionTitle: {
    fontFamily: fontFamilies.logo,
    color: '#000000',
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '400',
    letterSpacing: 0,
    paddingTop: 6,
    paddingLeft: 12,
    paddingBottom: 2,
    includeFontPadding: true
  },
  homeMissionSubtitle: {
    ...typography.body,
    marginTop: 1,
    marginLeft: 12,
    maxWidth: 190,
    color: '#24211f',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600'
  },
  homeMissionModel: {
    position: 'absolute'
  },
  homeMissionGrid: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 11
  },
  homeMissionTile: {
    width: '31.7%',
    height: 120,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e9e3de',
    position: 'relative'
  },
  homeMissionTileImage: {
    position: 'absolute',
    top: -4,
    left: 0,
    width: '100%',
    height: 142
  },
  homeMissionTileScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
    backgroundColor: 'rgba(0, 0, 0, 0.18)'
  },
  homeMissionTileLabel: {
    position: 'absolute',
    left: 9,
    right: 8,
    bottom: 8,
    fontFamily: fontFamilies.logo,
    color: '#ffffff',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '500',
    letterSpacing: 0,
    textShadowColor: 'rgba(0, 0, 0, 0.62)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 7
  },
  homeMissionGenerateButton: {
    marginTop: 20,
    height: 54,
    borderRadius: 9,
    backgroundColor: '#050505',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 11,
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 8
  },
  homeMissionGenerateText: {
    fontFamily: fontFamilies.bodySemiBold,
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    letterSpacing: 0
  },
  homeHeroLeftPane: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '47%',
    paddingTop: 15,
    paddingLeft: 14,
    paddingRight: 9,
    paddingBottom: 12,
    zIndex: 6
  },
  homeHeroKicker: {
    ...typography.label,
    color: '#6f737c',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '500',
    letterSpacing: 4
  },
  homeHeroEditorialTitle: {
    fontFamily: fontFamilies.logo,
    marginTop: 10,
    color: '#050505',
    fontSize: 24,
    lineHeight: 27,
    fontWeight: '400',
    letterSpacing: 0
  },
  homeHeroEditorialText: {
    ...typography.body,
    marginTop: 9,
    maxWidth: 162,
    color: '#707782',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500'
  },
  homePrimaryTryOnButton: {
    marginTop: 13,
    height: 35,
    width: 138,
    borderRadius: 7,
    backgroundColor: '#161719',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  homePrimaryTryOnText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700'
  },
  homeSecondaryWardrobeButton: {
    marginTop: 8,
    height: 35,
    width: 138,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#2b2b2b',
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10
  },
  homeSecondaryWardrobeText: {
    ...typography.button,
    color: '#111111',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700'
  },
  homeHeroRightPane: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '56%',
    overflow: 'hidden',
    backgroundColor: '#ddd8d2',
    zIndex: 1
  },
  homeHeroVisualLayer: {
    ...StyleSheet.absoluteFillObject
  },
  homeHeroLeftBase: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '49%',
    backgroundColor: '#f3f0ec',
    zIndex: 4
  },
  homeHeroLeftSlantFill: {
    position: 'absolute',
    top: -34,
    bottom: -34,
    left: '42.5%',
    width: 44,
    backgroundColor: '#f3f0ec',
    transform: [{ rotate: '8deg' }],
    zIndex: 5
  },
  homeHeroDivider: {
    position: 'absolute',
    top: -16,
    bottom: -16,
    left: '49.8%',
    width: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
    transform: [{ rotate: '8deg' }],
    zIndex: 5
  },
  homeHeroGarmentPanel: {
    position: 'absolute',
    left: 50,
    top: 156,
    width: 70,
    height: 76,
    borderRadius: 7,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.82)',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3
  },
  homeHeroGarment: {
    position: 'absolute',
    width: '88%',
    height: '88%'
  },
  homeHeroModel: {
    width: '150%',
    height: '100%',
    marginLeft: -70,
    backgroundColor: '#ddd8d2'
  },
  homeHeroRoundAction: {
    position: 'absolute',
    left: '50.5%',
    top: 105,
    width: 44,
    height: 44,
    marginLeft: -22,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 7,
    shadowColor: '#1e1a18',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  homeStylistPromptCard: {
    marginTop: 10,
    marginHorizontal: 18,
    height: 122,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f4e2dc',
    borderWidth: 1,
    borderColor: '#ecd3ca',
    flexDirection: 'row',
    alignItems: 'center'
  },
  homeStylistPromptHead: {
    marginTop: 28,
    paddingHorizontal: 18
  },
  homeStylistPromptCopy: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 18,
    paddingRight: 10,
    paddingVertical: 15,
    justifyContent: 'flex-start'
  },
  homeStylistPromptTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220
  },
  homeStylistPromptTitle: {
    fontFamily: fontFamilies.logo,
    color: '#171412',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0
  },
  homeStylistPromptText: {
    ...typography.smallBody,
    maxWidth: 168,
    marginTop: 0,
    color: '#342d2a',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600'
  },
  homeStylistPromptButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: '#050505',
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  homeStylistPromptButtonText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0
  },
  homeStylistPromptVisual: {
    position: 'relative',
    width: 118,
    height: 100,
    marginRight: 12
  },
  homeStylistPromptLookTile: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: '#fffaf5',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.82)',
    shadowColor: '#5b4038',
    shadowOpacity: 0.11,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  homeStylistPromptLookTileBack: {
    left: 5,
    top: 30,
    width: 54,
    height: 58,
    transform: [{ rotate: '-7deg' }]
  },
  homeStylistPromptLookTileFront: {
    right: 6,
    top: 20,
    width: 64,
    height: 72,
    transform: [{ rotate: '5deg' }]
  },
  homeStylistPromptLookTileAccent: {
    left: 48,
    bottom: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    transform: [{ rotate: '-3deg' }]
  },
  homeStylistPromptLookImage: {
    width: '100%',
    height: '100%'
  },
  homeAiRecommendationsHead: {
    marginTop: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14
  },
  homeAiGenerateLink: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  homeAiGenerateText: {
    ...typography.caption,
    color: '#9b5658',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600'
  },
  homeAiRecommendationTrack: {
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 14,
    paddingRight: 30
  },
  homeAiRecommendationCard: {
    width: 250,
    minHeight: 132,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#efe8e4',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    shadowColor: '#2f211c',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2
  },
  homeAiRecommendationImages: {
    height: 78,
    paddingHorizontal: 14,
    paddingTop: 14,
    flexDirection: 'row',
    gap: 13
  },
  homeAiRecommendationImage: {
    flex: 1,
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#f2eeeb'
  },
  homeAiRecommendationFooter: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  homeAiRecommendationTitle: {
    ...typography.smallBody,
    flex: 1,
    color: '#504c4a',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500'
  },
  homeTryOnStudioHead: {
    marginTop: 18,
    paddingHorizontal: 18
  },
  homeTryOnStudioCard: {
    marginTop: 10,
    marginHorizontal: 18,
    minHeight: 170,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#e6ded8',
    backgroundColor: '#fffdf9',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    shadowColor: '#301f17',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  homeTryOnStudioCopy: {
    width: 124,
    minHeight: 140,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 2
  },
  homeTryOnStudioTitle: {
    fontFamily: fontFamilies.logo,
    color: '#0b0b0b',
    fontSize: 23,
    lineHeight: 25,
    fontWeight: '400',
    letterSpacing: 0
  },
  homeTryOnStudioSubtitle: {
    ...typography.smallBody,
    marginTop: 5,
    color: '#504841',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '500'
  },
  homeTryOnStudioBody: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10
  },
  homeTryOnCompareFrame: {
    flex: 1,
    height: 146,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e6dfd8',
    position: 'relative'
  },
  homeTryOnSliderImage: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%'
  },
  homeTryOnSliderAfterClip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: 1
  },
  homeTryOnSliderDivider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    zIndex: 3,
    elevation: 3
  },
  homeTryOnComparePane: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#ddd5cc',
    position: 'relative'
  },
  homeTryOnCompareImageBefore: {
    position: 'absolute',
    left: -21,
    right: -21,
    top: -12,
    bottom: -26,
    width: '135%',
    height: '125%'
  },
  homeTryOnCompareImageAfter: {
    position: 'absolute',
    left: -20,
    right: -20,
    top: -15,
    bottom: -18,
    width: '138%',
    height: '125%'
  },
  homeTryOnCompareDivider: {
    width: 1,
    backgroundColor: '#ffffff'
  },
  homeTryOnCompareHandle: {
    position: 'absolute',
    top: '50%',
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e8e0db',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#111111',
    shadowOpacity: 0.12,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    zIndex: 4
  },
  homeTryOnCompareBadgeLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    elevation: 5
  },
  homeTryOnCompareBadge: {
    position: 'absolute',
    left: 7,
    bottom: 7,
    minWidth: 54,
    minHeight: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)'
  },
  homeTryOnCompareBadgeRight: {
    left: undefined,
    right: 7
  },
  homeTryOnCompareBadgeText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700'
  },
  homeTryOnStudioButton: {
    alignSelf: 'center',
    minWidth: 116,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#050505',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4
  },
  homeTryOnStudioButtonText: {
    fontFamily: fontFamilies.bodyBold,
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0
  },
  homeTryOnStudioButtonIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  homeSectionBlock: {
    marginTop: 26,
    paddingHorizontal: 17
  },
  homeEditorialSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  homeEditorialSectionTitle: {
    fontFamily: fontFamilies.logo,
    color: '#0b0b0b',
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '400',
    letterSpacing: 0
  },
  homeEditorialSeeAll: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  homeEditorialSeeAllText: {
    ...typography.body,
    color: '#5f5c58',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '500'
  },
  homeWardrobeTrack: {
    paddingTop: 12,
    paddingBottom: 8,
    paddingRight: 18,
    gap: 13
  },
  homeWardrobeTile: {
    width: 76,
    alignItems: 'center'
  },
  homeWardrobeImageWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
    borderWidth: 1,
    borderColor: '#e7ddd8',
    backgroundColor: '#fffdfb',
    shadowColor: '#2a211d',
    shadowOpacity: 0.11,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3
  },
  homeWardrobeImage: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
    backgroundColor: '#f4eee9'
  },
  homeWardrobeLabel: {
    ...typography.caption,
    width: '100%',
    marginTop: 7,
    color: '#111111',
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
    fontWeight: '800'
  },
  homeWardrobeCount: {
    ...typography.caption,
    width: '100%',
    marginTop: 3,
    color: '#4a4542',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3
  },
  homeTopBar: {
    height: 52,
    paddingHorizontal: 16,
    backgroundColor: '#fbf7f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  homeTopIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  homeBrand: {
    ...typography.h3,
    color: '#111111',
    fontSize: 19,
    lineHeight: 23
  },
  homeHero: {
    marginHorizontal: 16,
    height: 184,
    overflow: 'hidden',
    backgroundColor: '#d8c5b6'
  },
  homeHeroSlide: {
    height: '100%'
  },
  homeHeroImage: {
    width: '100%',
    height: '100%'
  },
  homeHeroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.22)'
  },
  homeHeroCopy: {
    position: 'absolute',
    left: 20,
    bottom: 20
  },
  homeHeroTitle: {
    ...typography.h2,
    color: '#ffffff',
    fontSize: 24,
    lineHeight: 29
  },
  homeHeroButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    minWidth: 132,
    minHeight: 44,
    borderRadius: 6,
    backgroundColor: '#1f1f1f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  homeHeroButtonText: {
    ...typography.label,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  homeHeroDots: {
    position: 'absolute',
    right: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },
  homeHeroDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.45)'
  },
  homeHeroDotActive: {
    width: 18,
    backgroundColor: '#ffffff'
  },
  homeSection: {
    marginTop: 26,
    paddingHorizontal: 18
  },
  homeFindStyleSection: {
    marginTop: 26,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: '#fffafa'
  },
  homeFindStyleTitle: {
    fontFamily: fontFamilies.logo,
    color: '#15110f',
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '400',
    letterSpacing: 0,
    textAlign: 'center'
  },
  homeSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  homeSectionTitle: {
    ...typography.h3,
    color: '#1f1b19',
    fontSize: 20,
    lineHeight: 26
  },
  homeViewAll: {
    ...typography.caption,
    color: '#1f1b19',
    fontSize: 10,
    fontWeight: '700',
    textDecorationLine: 'underline',
    letterSpacing: 0
  },
  homeCategoryTrack: {
    paddingTop: 16,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 22,
    gap: 14
  },
  homeCategoryTrackTablet: {
    gap: 18,
    paddingRight: 8
  },
  homeCategoryItem: {
    width: 78,
    alignItems: 'center'
  },
  homeCategoryItemTablet: {
    width: 76
  },
  homeCategoryImageFrame: {
    width: 74,
    height: 74,
    borderRadius: 37,
    padding: 3,
    borderWidth: 1,
    borderColor: '#e8ded9',
    backgroundColor: '#fffdfc',
    shadowColor: '#2a211d',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  homeCategoryImageFrameTablet: {
    width: 68,
    height: 68,
    borderRadius: 34
  },
  homeCategoryImageFrameActive: {
    borderColor: '#b66d70',
    backgroundColor: '#fff8f6',
    shadowColor: '#9b5658',
    shadowOpacity: 0.16
  },
  homeCategoryImage: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
    backgroundColor: '#f3eee9'
  },
  homeCategoryLabel: {
    ...typography.caption,
    width: '100%',
    marginTop: 9,
    color: '#1f1b19',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    textAlign: 'center'
  },
  homeCategoryCount: {
    ...typography.caption,
    width: '100%',
    marginTop: 4,
    color: '#3e3936',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.6
  },
  homeCategoryLabelActive: {
    color: '#9b5658'
  },
  homeCurationTitle: {
    ...typography.h2,
    marginTop: 28,
    marginBottom: 20,
    color: '#1f1b19',
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600'
  },
  homeCuratedGrid: {
    paddingHorizontal: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 24
  },
  homeCuratedGridTablet: {
    rowGap: 30
  },
  homeProductCard: {
    width: '46.5%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e9e1db',
    backgroundColor: '#fffdfb',
    padding: 8,
    shadowColor: '#2c211b',
    shadowOpacity: 0.055,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  homeProductCardRail: {
    width: 156,
    marginRight: 14
  },
  homeProductImageWrap: {
    aspectRatio: productImageAspectRatio,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: '#eee7e2',
    position: 'relative'
  },
  homeProductImage: {
    width: '100%',
    height: '100%'
  },
  homeNewBadge: {
    ...typography.caption,
    position: 'absolute',
    left: 8,
    top: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#8e343c',
    color: '#fff',
    fontSize: 8,
    fontWeight: '700'
  },
  homeDealBadge: {
    ...typography.caption,
    position: 'absolute',
    left: 8,
    top: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#f8d964',
    color: '#2a211d',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '700',
    letterSpacing: 0
  },
  homeProductEyebrow: {
    ...typography.caption,
    marginTop: 10,
    color: '#8c7167',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0
  },
  homeProductTitle: {
    ...typography.productTitle,
    marginTop: 4,
    minHeight: 36,
    color: '#211b18',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: 0
  },
  homeProductPriceRow: {
    marginTop: 7,
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5
  },
  homeProductPrice: {
    ...typography.price,
    color: '#211b18',
    fontSize: 13,
    fontWeight: '700'
  },
  homeProductComparePrice: {
    ...typography.caption,
    color: '#b6aaa3',
    fontSize: 10,
    lineHeight: 13,
    textDecorationLine: 'line-through',
    fontWeight: '600',
    letterSpacing: 0
  },
  homeProductActionRow: {
    marginTop: 11,
    minHeight: 86,
    gap: 6
  },
  homeProductTryOnButton: {
    width: '100%',
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#211b18',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  homeProductVideoButton: {
    width: '100%',
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d8d1cc',
    backgroundColor: '#fffdfb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5
  },
  homeProductTryOnText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0
  },
  homeProductVideoText: {
    ...typography.caption,
    color: '#111827',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0
  },
  homeProductHeartButton: {
    width: 34,
    height: 32,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#e4dbd5',
    backgroundColor: '#fffdfb',
    alignItems: 'center',
    justifyContent: 'center'
  },
  homeProductHeartButtonSaved: {
    borderColor: '#050505',
    backgroundColor: '#050505'
  },
  homeOfferSection: {
    marginTop: 26
  },
  homeOfferTrack: {
    paddingHorizontal: 18,
    paddingRight: 4,
    gap: 12
  },
  homeOfferTrackTablet: {
    gap: 16
  },
  homeOfferCard: {
    width: 278,
    height: 132,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eadfdb',
    backgroundColor: '#fffdfb',
    flexDirection: 'row',
    shadowColor: '#2a211d',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  homeOfferCardTablet: {
    width: 342,
    height: 150
  },
  homeOfferCopy: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 18,
    paddingLeft: 16,
    paddingRight: 10,
    justifyContent: 'center'
  },
  homeOfferKicker: {
    ...typography.label,
    color: '#b66d70',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0
  },
  homeOfferTitle: {
    ...typography.h3,
    marginTop: 7,
    color: '#211c1a',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: 0
  },
  homeOfferText: {
    ...typography.caption,
    marginTop: 5,
    color: '#8b817b',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500'
  },
  homeOfferCta: {
    ...typography.label,
    marginTop: 10,
    alignSelf: 'flex-start',
    color: '#2b2725',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
    letterSpacing: 0
  },
  homeOfferImageWrap: {
    width: 106,
    height: '100%',
    backgroundColor: '#f1ebe7'
  },
  homeOfferImage: {
    width: '100%',
    height: '100%'
  },
  homeCommerceSection: {
    marginTop: 38
  },
  homeCommerceHead: {
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start'
  },
  homeCommerceTitleWrap: {
    flex: 1,
    minWidth: 0
  },
  homeCommerceTitle: {
    fontFamily: fontFamilies.logo,
    color: '#211b18',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '400',
    letterSpacing: 0
  },
  homeCommerceSubtitle: {
    ...typography.label,
    marginTop: 4,
    color: '#8d7168',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1
  },
  homeCommerceTrack: {
    paddingTop: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16
  },
  homeJournalBand: {
    marginTop: 34,
    paddingTop: 26,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'rgba(255, 251, 248, 0.33)'
  },
  homeJournalHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14
  },
  homeJournalKicker: {
    ...typography.label,
    color: '#9b5658',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 0
  },
  homeJournalTitle: {
    ...typography.h2,
    color: '#1f1b19',
    lineHeight: 30
  },
  homeJournalIntro: {
    ...typography.smallBody,
    marginTop: 10,
    maxWidth: 310,
    color: '#706762',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500'
  },
  homeJournalIntroTablet: {
    maxWidth: 520
  },
  homeJournalGrid: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16
  },
  homeJournalGridRow: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 251, 248, 0.33)'
  },
  homeJournalGridRowTablet: {
    paddingHorizontal: 18
  },
  homeJournalFooter: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(255, 251, 248, 0.33)'
  },
  homeJournalCount: {
    ...typography.caption,
    color: '#706762',
    textAlign: 'center',
    paddingVertical: 12
  },
  homeJournalProductCard: {
    width: '47.6%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e8ddd7',
    backgroundColor: '#fffdfb',
    shadowColor: '#2c211b',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  homeJournalProductCardTablet: {
    width: '31.5%'
  },
  homeJournalImageFrame: {
    width: '100%',
    aspectRatio: productImageAspectRatio,
    overflow: 'hidden',
    backgroundColor: '#e7ded7',
    position: 'relative'
  },
  homeJournalImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e7ded7'
  },
  homeJournalProductBody: {
    minHeight: 190,
    paddingHorizontal: 11,
    paddingTop: 11,
    paddingBottom: 12
  },
  homeJournalProductLabel: {
    ...typography.caption,
    color: '#9b5658',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0
  },
  homeJournalProductTitle: {
    ...typography.productTitle,
    marginTop: 5,
    minHeight: 36,
    color: '#211c1a',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  homeJournalProductPrice: {
    ...typography.price,
    marginTop: 6,
    color: '#211c1a',
    fontSize: 13,
    fontWeight: '700'
  },
  homeJournalTryOnButton: {
    minHeight: 40,
    marginTop: 11,
    borderRadius: 10,
    backgroundColor: '#211b18',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  homeJournalTryOnText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0
  },
  homeJournalVideoButton: {
    minHeight: 40,
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d8d1cc',
    backgroundColor: '#fffdfb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  homeJournalVideoText: {
    ...typography.caption,
    color: '#111827',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0
  },
  shopScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  shopContent: {
    paddingBottom: screenBottomInset,
    backgroundColor: '#fbf7f6'
  },
  categoryScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  categoryTopBar: {
    minHeight: 66,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 22,
    paddingRight: 12,
    backgroundColor: 'rgba(255, 252, 250, 0.48)',
    borderBottomWidth: 1,
    borderBottomColor: '#dad9df',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  categoryTopTitle: {
    ...typography.h4,
    color: '#302b34',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700'
  },
  categoryTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11
  },
  categoryTopAction: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  categoryBrowser: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'transparent'
  },
  categoryRail: {
    width: 78,
    maxWidth: 78,
    flexBasis: 78,
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: 'rgba(246, 239, 234, 0.62)',
    borderRightWidth: 1,
    borderRightColor: '#e8e1da'
  },
  categoryRailContent: {
    paddingTop: 6,
    paddingBottom: bottomNavigationHeight + screenBottomInset + 132
  },
  categoryRailTablet: {
    backgroundColor: 'transparent',
    borderRightWidth: 0
  },
  categoryRailContentTablet: {
    paddingTop: 8,
    paddingBottom: bottomNavigationHeight + screenBottomInset + 16
  },
  categoryRailItem: {
    minHeight: 88,
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e1d9d2',
    position: 'relative'
  },
  categoryRailItemTablet: {
    minHeight: 94,
    marginHorizontal: 8,
    marginVertical: 4,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 0,
    borderRadius: 16,
    backgroundColor: 'transparent'
  },
  categoryRailItemActive: {
    backgroundColor: '#faf8f5'
  },
  categoryRailItemActiveTablet: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5dacf'
  },
  categoryRailAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
    backgroundColor: '#211f1d'
  },
  categoryRailImageFrame: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#faf7f3',
    borderWidth: 1,
    borderColor: '#eee3df'
  },
  categoryRailImageFrameTablet: {
    width: 52,
    height: 52,
    borderRadius: 26
  },
  categoryRailImageFrameActive: {
    backgroundColor: '#ffffff',
    borderColor: '#b9ada5'
  },
  categoryRailImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    backgroundColor: '#f6f1ef'
  },
  categoryRailLabel: {
    marginTop: 7,
    color: '#625c56',
    fontSize: 11.25,
    lineHeight: 15,
    fontFamily: fontFamilies.bodyMedium,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0
  },
  categoryRailLabelTablet: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center'
  },
  categoryRailLabelActive: {
    color: '#211f1d',
    fontFamily: fontFamilies.bodySemiBold,
    fontWeight: '600'
  },
  categoryMain: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  categoryMainContent: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: bottomNavigationHeight + screenBottomInset + 164
  },
  categoryMainContentTablet: {
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: bottomNavigationHeight + screenBottomInset + 24
  },
  categoryContinuousSectionTablet: {
    paddingBottom: 30
  },
  categoryFeatureBand: {
    marginHorizontal: 0,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.74)'
  },
  categoryFeatureBandTablet: {
    paddingTop: 20,
    paddingBottom: 20,
    borderRadius: 22
  },
  categoryKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6
  },
  categoryKicker: {
    color: '#77716c',
    fontSize: 10,
    lineHeight: 14,
    fontFamily: fontFamilies.bodySemiBold,
    fontWeight: '600',
    letterSpacing: 1.2
  },
  categoryKickerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e3d9d5'
  },
  categoryHeadline: {
    color: '#211f1d',
    fontFamily: fontFamilies.logo,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '400',
    letterSpacing: 0
  },
  categoryHeadlineTablet: {
    fontSize: 27,
    lineHeight: 34
  },
  categoryFeaturedGrid: {
    marginTop: 13,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    columnGap: 10,
    rowGap: 12
  },
  categoryFeaturedTile: {
    minHeight: 94,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-start'
  },
  categoryFeaturedTileTablet: {
    minHeight: 152
  },
  categoryFeaturedImageFrame: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#faf8f5',
    borderWidth: 1,
    borderColor: '#e4dcd5'
  },
  categoryFeaturedImageFrameTablet: {
    width: 116,
    height: 116,
    borderRadius: 24
  },
  categoryFeaturedImage: {
    width: '100%',
    height: '100%',
    borderRadius: 17,
    backgroundColor: '#f3eee8'
  },
  categoryFeaturedLabel: {
    width: '100%',
    marginTop: 7,
    color: '#393532',
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.bodySemiBold,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0
  },
  categoryFeaturedLabelTablet: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 19
  },
  categoryTileGrid: {
    marginTop: 17,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    columnGap: 10,
    rowGap: 18
  },
  categoryTileGridTablet: {
    rowGap: 18
  },
  categoryTile: {
    minHeight: 116,
    alignItems: 'center',
    paddingTop: 3
  },
  categoryTileTablet: {
    minHeight: 204,
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e9e0d7',
    backgroundColor: 'rgba(255, 255, 255, 0.42)'
  },
  categoryContentImageFrame: {
    width: 76,
    height: 76,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3eee8',
    borderWidth: 1,
    borderColor: '#e8e1da'
  },
  categoryContentImageFrameTablet: {
    width: 130,
    height: 130,
    borderRadius: 26
  },
  categoryContentImage: {
    width: '100%',
    height: '100%',
    borderRadius: 19,
    backgroundColor: '#f3eee8'
  },
  categoryTileLabel: {
    width: '100%',
    marginTop: 9,
    color: '#393532',
    fontSize: 12.5,
    lineHeight: 16,
    fontFamily: fontFamilies.bodyMedium,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0
  },
  categoryTileLabelTablet: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 20
  },
  categorySectionTitle: {
    color: '#211f1d',
    fontFamily: fontFamilies.logo,
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '400'
  },
  categorySectionHeader: {
    marginTop: 24,
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  categorySectionHeaderTablet: {
    marginTop: 28
  },
  categorySectionTitleTablet: {
    fontSize: 24,
    lineHeight: 31
  },
  categorySectionRule: {
    flex: 1,
    height: 1,
    backgroundColor: '#eadfdb'
  },
  shopTopBar: {
    height: 52,
    paddingHorizontal: 16,
    backgroundColor: '#fbf7f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  shopTopIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center'
  },
  shopBrand: {
    ...typography.h3,
    color: '#111111',
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '700'
  },
  shopHero: {
    height: 214,
    overflow: 'hidden',
    backgroundColor: '#d7cabe'
  },
  shopHeroImage: {
    width: '100%',
    height: '100%'
  },
  shopHeroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 249, 246, 0.18)'
  },
  shopHeroCopy: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 22,
    alignItems: 'center'
  },
  shopHeroTitle: {
    ...typography.display,
    color: '#070707',
    textAlign: 'center',
    lineHeight: 36,
    fontWeight: '700'
  },
  shopHeroText: {
    ...typography.caption,
    marginTop: 12,
    maxWidth: 236,
    color: 'rgba(25, 24, 23, 0.68)',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600'
  },
  shopHeroButton: {
    marginTop: 18,
    width: '100%',
    maxWidth: 308,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center'
  },
  shopHeroButtonText: {
    ...typography.label,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0
  },
  shopCategorySection: {
    marginTop: -1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: '#ffffff'
  },
  shopSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  shopSectionTitle: {
    ...typography.h3,
    color: '#191513',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '600'
  },
  shopSectionSub: {
    ...typography.caption,
    marginTop: 2,
    color: '#645f5c',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500'
  },
  shopViewAll: {
    ...typography.caption,
    color: '#4a4643',
    fontSize: 12,
    fontWeight: '700'
  },
  shopCategoryRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  shopCategoryItem: {
    width: 66,
    alignItems: 'center'
  },
  shopCategoryImageFrame: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 3,
    borderWidth: 1,
    borderColor: '#eee3dc',
    backgroundColor: '#fffdfb',
    shadowColor: '#2a211d',
    shadowOpacity: 0.1,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3
  },
  shopCategoryImageFrameActive: {
    borderColor: '#9b5658',
    backgroundColor: '#fff7f4',
    shadowColor: '#9b5658',
    shadowOpacity: 0.16
  },
  shopCategoryImage: {
    width: '100%',
    height: '100%',
    borderRadius: 27,
    backgroundColor: '#f3eee9'
  },
  shopCategoryLabel: {
    width: '100%',
    marginTop: 11,
    color: '#25201d',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center'
  },
  shopCategoryLabelActive: {
    color: '#9b5658'
  },
  shopArrivalsSection: {
    paddingHorizontal: 16,
    paddingTop: 34
  },
  shopArrivalsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  shopPager: {
    flexDirection: 'row',
    gap: 14
  },
  shopPagerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ece5e1',
    alignItems: 'center',
    justifyContent: 'center'
  },
  shopArrivalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 26
  },
  shopArrivalCard: {
    width: '47%'
  },
  shopArrivalImageWrap: {
    height: 106,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ece4df',
    position: 'relative'
  },
  shopArrivalImage: {
    width: '100%',
    height: '100%'
  },
  shopArrivalBrand: {
    marginTop: 10,
    color: '#55504d',
    fontSize: 9,
    fontWeight: '700'
  },
  shopArrivalName: {
    marginTop: 4,
    color: '#171412',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600'
  },
  shopArrivalPrice: {
    marginTop: 5,
    color: '#a5676b',
    fontSize: 12,
    fontWeight: '600'
  },
  shopSwatches: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8
  },
  shopSwatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(17, 17, 17, 0.05)'
  },
  shopDiscountCard: {
    marginTop: 34,
    marginHorizontal: 16,
    minHeight: 112,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#090909',
    flexDirection: 'row'
  },
  shopDiscountCopy: {
    width: '54%',
    paddingLeft: 23,
    paddingVertical: 21,
    justifyContent: 'center',
    zIndex: 1
  },
  shopDiscountImage: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '58%',
    height: '100%',
    opacity: 0.42
  },
  shopPromoEyebrow: {
    ...typography.label,
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0
  },
  shopDiscountTitle: {
    ...typography.h1,
    marginTop: 8,
    color: '#ffffff',
    lineHeight: 34,
    fontWeight: '700'
  },
  shopDiscountText: {
    ...typography.caption,
    marginTop: 4,
    color: '#8e8e8e',
    fontSize: 12,
    fontWeight: '600'
  },
  shopDiscountButton: {
    marginTop: 14,
    width: 112,
    minHeight: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  shopDiscountButtonText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700'
  },
  shopLookCard: {
    marginTop: 18,
    marginHorizontal: 16,
    height: 184,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e2d5cc'
  },
  shopLookImage: {
    width: '100%',
    height: '100%'
  },
  shopLookShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.18)'
  },
  shopLookCopy: {
    position: 'absolute',
    left: 28,
    bottom: 28
  },
  shopLookEyebrow: {
    ...typography.label,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0
  },
  shopLookTitle: {
    ...typography.display,
    marginTop: 4,
    color: '#ffffff',
    lineHeight: 36,
    fontWeight: '700'
  },
  shopLookAction: {
    ...typography.caption,
    marginTop: 18,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline'
  },
  shopExploreHead: {
    paddingHorizontal: 18,
    paddingTop: 30,
    paddingBottom: 22
  },
  shopValuesBand: {
    paddingHorizontal: 26,
    paddingTop: 104,
    paddingBottom: 52,
    backgroundColor: '#f0e9e9',
    gap: 58
  },
  shopValueItem: {
    alignItems: 'center'
  },
  shopValueTitle: {
    marginTop: 22,
    color: '#2e2b29',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0
  },
  shopValueText: {
    marginTop: 15,
    maxWidth: 286,
    color: '#5d5754',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600'
  },
  shopFloatingButton: {
    position: 'absolute',
    right: 18,
    bottom: 91,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wardrobeScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  wardrobeContent: {
    flexGrow: 1,
    paddingBottom: bottomNavigationHeight + screenBottomInset + 24,
    backgroundColor: 'transparent'
  },
  wardrobeContentTablet: {
    paddingBottom: bottomNavigationHeight + screenBottomInset + 24
  },
  wardrobeTopBar: {
    height: 86,
    paddingHorizontal: 28,
    backgroundColor: 'rgba(255, 252, 250, 0.38)',
    borderBottomWidth: 1,
    borderBottomColor: '#ece5e1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  wardrobeBrand: {
    ...typography.display,
    color: '#111111',
    fontSize: 30,
    lineHeight: 36
  },
  wardrobeTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18
  },
  wardrobeTopIcon: {
    width: 34,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center'
  },
  wardrobeAvatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#f1e8e2',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wardrobeAvatar: {
    width: '100%',
    height: '100%'
  },
  wardrobeHeroHead: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  wardrobeHeroHeadCompact: {
    gap: 9
  },
  wardrobeHeroHeadTablet: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    paddingHorizontal: 0,
    paddingTop: 26,
    paddingBottom: 20
  },
  wardrobeHeroCopy: {
    flex: 1,
    minWidth: 0
  },
  wardrobeTitle: {
    fontFamily: fontFamilies.logo,
    color: '#211f1d',
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '400',
    letterSpacing: -0.2
  },
  wardrobeTitleCompact: {
    fontSize: 25,
    lineHeight: 30
  },
  wardrobeTitleTablet: {
    fontSize: 35,
    lineHeight: 42
  },
  wardrobeSubtitle: {
    ...typography.smallBody,
    marginTop: 2,
    color: '#77716c',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '400'
  },
  wardrobeSubtitleCompact: {
    fontSize: 11,
    lineHeight: 15
  },
  wardrobeSubtitleTablet: {
    fontSize: 14,
    lineHeight: 20
  },
  wardrobeAddButton: {
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: '#111111',
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  wardrobeAddButtonCompact: {
    flexShrink: 0,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 10,
    gap: 4
  },
  wardrobeAddButtonTablet: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 18
  },
  wardrobeAddText: {
    ...typography.label,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  wardrobeAddTextCompact: {
    fontSize: 12
  },
  wardrobeCategoryTrack: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 16
  },
  wardrobeCategoryRail: {
    position: 'absolute',
    top: 18,
    bottom: 18,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    zIndex: 4
  },
  wardrobeCategoryRailCompact: {
    top: 12,
    bottom: 12
  },
  wardrobeCategoryRailTablet: {
    top: 34,
    bottom: 34
  },
  wardrobeCategoryRailLeft: {
    left: 5
  },
  wardrobeCategoryRailLeftPhone: {
    left: 10
  },
  wardrobeCategoryRailRight: {
    right: 5
  },
  wardrobeCategoryRailRightPhone: {
    right: 10
  },
  wardrobeCategoryButton: {
    width: 76,
    minHeight: 68,
    alignItems: 'center',
    justifyContent: 'center'
  },
  wardrobeCategoryButtonCompact: {
    width: 64,
    minHeight: 60
  },
  wardrobeCategoryButtonTablet: {
    width: 94,
    minHeight: 94
  },
  wardrobeCategoryIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#ded6cf',
    backgroundColor: '#fffdfb',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden'
  },
  wardrobeCategoryIconCompact: {
    width: 42,
    height: 42,
    borderRadius: 21
  },
  wardrobeCategoryIconTablet: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderColor: '#e2d9d1',
    backgroundColor: 'rgba(255, 253, 251, 0.94)'
  },
  wardrobeCategoryIconSelected: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#5b514b',
    backgroundColor: '#fffdfb'
  },
  wardrobeCategoryIconSelectedTablet: {
    width: 82,
    height: 82,
    borderRadius: 15
  },
  wardrobeCategorySelectedImage: {
    width: '100%',
    height: '100%'
  },
  wardrobeCategorySelectedBadge: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#211f1d',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wardrobeCategoryIconPressed: {
    backgroundColor: '#e4dad2',
    transform: [{ scale: 0.96 }]
  },
  wardrobeCategoryAssetIcon: {
    width: 23,
    height: 23
  },
  wardrobeCategoryAssetIconTablet: {
    width: 29,
    height: 29
  },
  wardrobeCategoryLabel: {
    ...typography.caption,
    fontFamily: fontFamilies.bodyRegular,
    marginTop: 5,
    minHeight: 14,
    maxWidth: 76,
    color: '#514b47',
    textAlign: 'center',
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '400'
  },
  wardrobeCategoryLabelCompact: {
    marginTop: 3,
    minHeight: 12,
    maxWidth: 62,
    fontSize: 9,
    lineHeight: 11
  },
  wardrobeCategoryLabelTablet: {
    maxWidth: 94,
    fontSize: 13,
    lineHeight: 17
  },
  wardrobeCategoryLabelSelected: {
    color: '#211f1d',
    fontFamily: fontFamilies.bodyBold,
    fontWeight: '800'
  },
  wardrobePreviewWrap: {
    marginHorizontal: 18,
    gap: 12,
    marginBottom: 0
  },
  wardrobePreviewWrapTablet: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    marginHorizontal: 0,
    gap: 12
  },
  wardrobePreviewStage: {
    position: 'relative',
    marginBottom: 0,
    paddingVertical: 0,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: '#f3eee8',
    overflow: 'hidden'
  },
  wardrobePreviewStageCompact: {
    paddingVertical: 0
  },
  wardrobePreviewStagePhone: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    overflow: 'visible'
  },
  wardrobePreviewStageTablet: {
    alignSelf: 'center',
    borderWidth: 0,
    backgroundColor: 'transparent',
    overflow: 'visible'
  },
  wardrobePreviewCard: {
    width: '100%',
    alignSelf: 'center',
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#f3eee8'
  },
  wardrobePreviewCardCompact: {
    width: '100%'
  },
  wardrobePreviewCardPhone: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2d9d1'
  },
  wardrobePreviewCardTablet: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2d9d1'
  },
  wardrobePreviewImage: {
    width: '100%',
    height: '100%'
  },
  wardrobePortraitEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 10
  },
  wardrobePortraitEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f7e9e8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wardrobePortraitEmptyTitle: {
    ...typography.h3,
    color: '#211f1d',
    textAlign: 'center'
  },
  wardrobePortraitEmptyCopy: {
    ...typography.body,
    color: '#756d67',
    textAlign: 'center',
    maxWidth: 250
  },
  wardrobePortraitEmptyAction: {
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: '#111111',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    marginTop: 8
  },
  wardrobePortraitEmptyActionText: {
    ...typography.label,
    color: '#ffffff',
    fontSize: 13
  },
  wardrobeTryButton: {
    alignSelf: 'center',
    minHeight: 48,
    minWidth: 148,
    borderRadius: 24,
    backgroundColor: '#111111',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24
  },
  wardrobeTryButtonCompact: {
    minHeight: 44,
    minWidth: 138,
    borderRadius: 22,
    paddingHorizontal: 20
  },
  wardrobeTryButtonTablet: {
    minWidth: 200,
    minHeight: 52,
    borderRadius: 26
  },
  wardrobeTryButtonDisabled: {
    borderWidth: 1,
    borderColor: '#d8d0ca',
    backgroundColor: '#e7e1dc'
  },
  wardrobeTryButtonDock: {
    marginTop: 0,
    zIndex: 5,
    alignItems: 'center'
  },
  wardrobeTryButtonDockCompact: {
    marginTop: 0
  },
  wardrobeTryButtonDockTablet: {
    marginTop: 2
  },
  wardrobeTryText: {
    ...typography.caption,
    fontFamily: fontFamilies.bodyRegular,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '400'
  },
  wardrobeTryTextDisabled: {
    color: '#77716c'
  },
  wardrobeTryHint: {
    ...typography.caption,
    marginTop: 7,
    color: '#77716c',
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
    textAlign: 'center'
  },
  wardrobeTryHintTablet: {
    fontSize: 12,
    lineHeight: 17
  },
  wardrobeResultCaption: {
    ...typography.caption,
    color: '#514b47',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 17
  },
  wardrobePickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  wardrobePickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 21, 18, 0.42)'
  },
  wardrobePickerSheet: {
    maxHeight: '82%',
    minHeight: 260,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#f8f3ec',
    overflow: 'hidden'
  },
  wardrobePickerSheetTablet: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '75%',
    alignSelf: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24
  },
  wardrobePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e7dfd7'
  },
  wardrobePickerHeaderCopy: {
    flex: 1,
    paddingRight: 12
  },
  wardrobePickerEyebrow: {
    ...typography.caption,
    color: '#976b5b',
    fontSize: 10,
    letterSpacing: 1.5
  },
  wardrobePickerTitle: {
    ...typography.h2,
    color: '#211f1d',
    fontSize: 22,
    lineHeight: 28
  },
  wardrobePickerClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffdfb'
  },
  wardrobePickerContent: {
    padding: 18,
    paddingBottom: 36
  },
  addStudioCategoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  addStudioCategoryChoice: {
    width: '48%',
    minHeight: 82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e0d7cf',
    borderRadius: 13,
    backgroundColor: '#fffdfb'
  },
  addStudioCategoryChoiceSelected: {
    borderColor: '#211f1d',
    backgroundColor: '#211f1d'
  },
  addStudioCategoryChoiceIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5eee8'
  },
  addStudioCategoryChoiceAsset: {
    width: 20,
    height: 20
  },
  addStudioCategoryChoiceCheck: {
    position: 'absolute',
    top: 8,
    right: 8
  },
  addStudioCategoryChoiceText: {
    ...typography.caption,
    color: '#211f1d',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center'
  },
  addStudioCategoryChoiceTextSelected: {
    color: '#fffdfb'
  },
  wardrobePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  wardrobePickerItem: {
    width: '48%',
    minHeight: 184,
    borderWidth: 1,
    borderColor: '#e7dfd7',
    borderRadius: 15,
    backgroundColor: '#fffdfb',
    overflow: 'hidden'
  },
  wardrobePickerItemTablet: {
    width: '31%'
  },
  wardrobePickerItemSelected: {
    borderColor: '#211f1d',
    borderWidth: 2
  },
  wardrobePickerItemImage: {
    width: '100%',
    height: 140,
    backgroundColor: '#f3eee8'
  },
  wardrobePickerItemName: {
    ...typography.caption,
    paddingHorizontal: 9,
    paddingTop: 7,
    color: '#211f1d',
    fontSize: 12,
    lineHeight: 16
  },
  wardrobePickerItemStatus: {
    ...typography.caption,
    paddingHorizontal: 9,
    paddingBottom: 7,
    color: '#0f766e',
    fontSize: 10
  },
  wardrobePickerEmpty: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  wardrobePickerEmptyTitle: {
    ...typography.h2,
    color: '#211f1d',
    fontSize: 18
  },
  wardrobePickerEmptyCopy: {
    ...typography.caption,
    color: '#655e59',
    textAlign: 'center',
    fontSize: 12
  },
  wardrobePickerAddButton: {
    marginTop: 8,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: '#111111'
  },
  wardrobePickerAddText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  wardrobeRecommendationsHead: {
    paddingHorizontal: 18,
    paddingTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14
  },
  wardrobeSectionTitle: {
    ...typography.h2,
    flex: 1,
    color: '#1b1715',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600'
  },
  wardrobeGenerateLink: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  wardrobeGenerateText: {
    ...typography.caption,
    color: '#9b5658',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500'
  },
  wardrobeRecommendationTrack: {
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 14,
    paddingRight: 28
  },
  wardrobeEmptyRecommendation: {
    width: 250,
    minHeight: 126,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e4d9d4',
    backgroundColor: '#fffaf7',
    justifyContent: 'center',
    gap: 8
  },
  wardrobeEmptyRecommendationTitle: {
    ...typography.productTitle,
    color: '#211c1a',
    fontSize: 14,
    fontWeight: '700'
  },
  wardrobeEmptyRecommendationText: {
    ...typography.caption,
    color: '#6e6662',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  wardrobeRecommendationCard: {
    width: 250,
    minHeight: 132,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f1ece9',
    backgroundColor: '#ffffff',
    overflow: 'hidden'
  },
  wardrobeRecommendationImages: {
    height: 78,
    paddingHorizontal: 14,
    paddingTop: 14,
    flexDirection: 'row',
    gap: 13
  },
  wardrobeRecommendationImage: {
    flex: 1,
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#f2eeeb'
  },
  wardrobeRecommendationFooter: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  wardrobeRecommendationTitle: {
    ...typography.smallBody,
    flex: 1,
    color: '#504c4a',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '400'
  },
  wardrobeModeTabs: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14
  },
  wardrobeModeTabsTablet: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 20
  },
  wardrobeTabletTabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e9e0d8',
    backgroundColor: 'rgba(255, 255, 255, 0.58)'
  },
  wardrobeTabletTab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12
  },
  wardrobeTabletTabActive: {
    backgroundColor: '#211e1c'
  },
  wardrobeTabletTabText: {
    ...typography.smallBody,
    color: '#5f5853',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600'
  },
  wardrobeTabletTabTextActive: {
    color: '#ffffff'
  },
  wardrobeTabletEmpty: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    marginBottom: 24,
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e9e0d8',
    backgroundColor: 'rgba(255, 255, 255, 0.72)'
  },
  wardrobeTabletEmptyImage: {
    width: '100%',
    aspectRatio: 2,
    backgroundColor: '#eee7dd'
  },
  wardrobeTabletEmptyBody: {
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 26,
    paddingBottom: 30,
    gap: 10
  },
  wardrobeTabletEmptyTitle: {
    ...typography.display,
    color: '#211e1c',
    fontSize: 30,
    lineHeight: 36,
    textAlign: 'center'
  },
  wardrobeTabletEmptyCopy: {
    ...typography.smallBody,
    maxWidth: 450,
    color: '#625b56',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center'
  },
  wardrobeTabletEmptyButton: {
    minHeight: 48,
    marginTop: 8,
    paddingHorizontal: 22,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#111111'
  },
  wardrobeTabletEmptyButtonText: {
    ...typography.smallBody,
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700'
  },
  addStudioScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  addStudioBackButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginHorizontal: 18,
    paddingRight: 12
  },
  addStudioBackButtonTablet: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    marginHorizontal: 0
  },
  addStudioBackText: {
    ...typography.smallBody,
    color: '#211f1d',
    fontSize: 15,
    fontWeight: '700'
  },
  addStudioContent: {
    paddingBottom: bottomNavigationHeight + screenBottomInset + 118,
    backgroundColor: '#fbf7f6'
  },
  addStudioContentTablet: {
    paddingHorizontal: 24,
    paddingBottom: bottomNavigationHeight + screenBottomInset + 32
  },
  addStudioHeroHead: {
    paddingTop: 2
  },
  addStudioHeaderTablet: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 14
  },
  addStudioMain: {},
  addStudioMainTablet: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 28
  },
  addStudioMediaColumn: {},
  addStudioMediaColumnTablet: {
    width: '40%'
  },
  addStudioDetailsColumn: {},
  addStudioDetailsColumnTablet: {
    flex: 1,
    minWidth: 0
  },
  addStudioTopBar: {
    height: 66,
    paddingHorizontal: 14,
    paddingTop: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e7dfdb',
    backgroundColor: '#fbf7f6',
    flexDirection: 'row',
    alignItems: 'center'
  },
  addStudioTopButton: {
    width: 34,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center'
  },
  addStudioBrandLogo: {
    flex: 1,
    justifyContent: 'center'
  },
  addStudioIntro: {
    paddingHorizontal: 20,
    paddingTop: 24
  },
  addStudioTitle: {
    ...typography.h1,
    color: '#171412',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '700'
  },
  addStudioSubtitle: {
    ...typography.smallBody,
    marginTop: 9,
    color: '#55514f',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500'
  },
  addStudioUploadBox: {
    marginTop: 26,
    marginHorizontal: 20,
    height: 318,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#b8b8b8',
    overflow: 'hidden',
    backgroundColor: '#fbf7f6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  addStudioUploadBoxTablet: {
    height: 320,
    marginTop: 0,
    marginHorizontal: 0
  },
  addStudioUploadImage: {
    width: '100%',
    height: '100%'
  },
  addStudioAnalyzeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 17, 17, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9
  },
  addStudioAnalyzeText: {
    ...typography.caption,
    color: '#ffffff',
    fontWeight: '700'
  },
  addStudioUploadCopy: {
    alignItems: 'center',
    paddingHorizontal: 34
  },
  addStudioUploadTitle: {
    marginTop: 11,
    color: '#171412',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700'
  },
  addStudioUploadText: {
    marginTop: 5,
    color: '#55514f',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500'
  },
  addStudioSavedSection: {
    marginHorizontal: 20,
    marginTop: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#eee5e1'
  },
  addStudioSavedSectionTablet: {
    marginHorizontal: 0,
    marginTop: 22
  },
  addStudioSavedHead: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  addStudioSavedTitle: {
    ...typography.label,
    color: '#6f3f45',
    fontSize: 12,
    lineHeight: 16,
    textTransform: 'uppercase'
  },
  addStudioSavedCount: {
    minWidth: 26,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3e4e6',
    color: '#9b5658',
    fontSize: 12,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '800'
  },
  addStudioSavedTrack: {
    paddingTop: 12,
    paddingRight: 16,
    gap: 10
  },
  addStudioSavedCard: {
    width: 116,
    minHeight: 158,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fffdfb',
    overflow: 'hidden'
  },
  addStudioSavedImage: {
    width: '100%',
    height: 104,
    backgroundColor: '#eee7e2'
  },
  addStudioSavedName: {
    ...typography.caption,
    marginTop: 8,
    paddingHorizontal: 8,
    color: '#211c1a',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800'
  },
  addStudioSavedMeta: {
    ...typography.caption,
    paddingHorizontal: 8,
    paddingBottom: 8,
    color: '#756c68',
    fontSize: 11,
    lineHeight: 14
  },
  addStudioSavedEmpty: {
    minHeight: 72,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#e2d7d2',
    backgroundColor: '#fffdfb',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12
  },
  addStudioSavedEmptyText: {
    ...typography.caption,
    marginTop: 6,
    color: '#756c68',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  itemDetectionCard: {
    marginHorizontal: 20,
    marginTop: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2d7d3',
    backgroundColor: '#fffdfb',
    padding: 14
  },
  itemDetectionCardCompact: {
    marginHorizontal: 0,
    marginTop: 12
  },
  itemDetectionCardError: {
    borderColor: '#efc7c7',
    backgroundColor: '#fff7f7'
  },
  itemDetectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11
  },
  itemDetectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f8efed',
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemDetectionIconError: {
    backgroundColor: '#fdecec'
  },
  itemDetectionCopy: {
    flex: 1,
    minWidth: 0
  },
  itemDetectionTitle: {
    ...typography.productTitle,
    color: '#211c1a',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700'
  },
  itemDetectionText: {
    ...typography.caption,
    marginTop: 3,
    color: '#706762',
    fontWeight: '500'
  },
  itemDetectionPills: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  itemDetectionPill: {
    minHeight: 26,
    borderRadius: 13,
    backgroundColor: '#f4eeee',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  itemDetectionPillText: {
    ...typography.caption,
    color: '#4f4a48',
    fontSize: 11,
    fontWeight: '700'
  },
  addStudioArchiveHead: {
    paddingHorizontal: 20,
    paddingTop: 26
  },
  addStudioArchiveHeadTablet: {
    paddingHorizontal: 0,
    paddingTop: 0
  },
  addStudioArchiveTitle: {
    ...typography.h2,
    color: '#171412',
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '600'
  },
  addStudioArchiveLine: {
    marginTop: 11,
    width: 48,
    height: 1,
    backgroundColor: '#9b5658'
  },
  addStudioSectionLabel: {
    ...typography.label,
    marginTop: 28,
    paddingHorizontal: 20,
    color: '#4f4a48',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0
  },
  addStudioSectionLabelTablet: {
    marginTop: 22,
    paddingHorizontal: 0
  },
  addStudioForm: {
    paddingHorizontal: 20,
    paddingTop: 22
  },
  addStudioFormTablet: {
    paddingHorizontal: 0,
    paddingTop: 18
  },
  addStudioFieldLabel: {
    marginBottom: 8,
    color: '#4f4a48',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  addStudioInput: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c9cdd2',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    color: '#171412',
    fontSize: 16,
    fontWeight: '400'
  },
  addStudioTwoCol: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 14
  },
  addStudioFieldHalf: {
    flex: 1
  },
  addStudioSelectInput: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c9cdd2',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  addStudioInputText: {
    color: '#171412',
    fontSize: 16,
    fontWeight: '400'
  },
  addStudioColorInput: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c9cdd2',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11
  },
  addStudioColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#050505'
  },
  addStudioColorTextInput: {
    flex: 1,
    minHeight: 44,
    color: '#171412',
    fontSize: 16,
    fontWeight: '400'
  },
  addStudioMessage: {
    marginHorizontal: 20,
    marginTop: 18
  },
  addStudioMessageTablet: {
    marginHorizontal: 0
  },
  addStudioFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 84,
    borderTopWidth: 1,
    borderTopColor: '#e1dad7',
    backgroundColor: '#fbf7f6',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    flexDirection: 'row',
    gap: 16
  },
  addStudioFooterTablet: {
    position: 'relative',
    marginTop: 24,
    paddingHorizontal: 0,
    paddingBottom: 8,
    backgroundColor: 'transparent'
  },
  addStudioDiscardButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#9b5658',
    backgroundColor: '#fbf7f6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  addStudioDiscardText: {
    color: '#9b5658',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0
  },
  addStudioSaveButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center'
  },
  addStudioSaveText: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 0
  },
  hero: {
    margin: 16,
    height: 240,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#efe3d2'
  },
  heroCompact: {
    height: 190
  },
  heroImage: {
    width: '100%',
    height: '100%',
    objectPosition: '70% center'
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.18)'
  },
  heroCopy: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 24
  },
  kicker: {
    color: '#0f766e',
    fontWeight: '700',
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 0
  },
  heroTitle: {
    marginTop: 8,
    color: '#fff',
    fontSize: 40,
    lineHeight: 43,
    fontWeight: '700',
    letterSpacing: 0
  },
  heroText: {
    marginTop: 10,
    color: '#ecfeff',
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 290
  },
  heroButton: {
    marginTop: 18,
    alignSelf: 'flex-start'
  },
  button: {
    minHeight: 46,
    borderRadius: 8,
    paddingHorizontal: 16,
    backgroundColor: '#111827',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db'
  },
  ghostButton: {
    backgroundColor: 'transparent'
  },
  disabledButton: {
    opacity: 0.55
  },
  buttonPressed: {
    opacity: 0.88
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14
  },
  secondaryButtonText: {
    color: '#111827'
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 10
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 22,
    color: '#111827',
    fontWeight: '700',
    letterSpacing: 0
  },
  viewAll: {
    color: '#0f766e',
    fontWeight: '700'
  },
  horizontalList: {
    gap: 12,
    paddingRight: 16
  },
  productGrid: {
    paddingHorizontal: 16,
    paddingBottom: bottomNavigationHeight + screenBottomInset + 56,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'stretch'
  },
  shopProductListContent: {
    paddingBottom: bottomNavigationHeight + screenBottomInset + 112
  },
  shopProductListHeader: {
    paddingHorizontal: 16
  },
  shopProductGridRow: {
    paddingHorizontal: 32,
    gap: 12,
    marginBottom: 12
  },
  shopProductLoadingMore: {
    marginVertical: 24
  },
  shopProductRetry: {
    alignItems: 'center',
    padding: 18
  },
  shopProductRetryText: {
    ...typography.caption,
    color: '#9b3f3b',
    fontSize: 13
  },
  productCard: {
    flexGrow: 1,
    flexBasis: '46.5%',
    maxWidth: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e8dfda'
  },
  productCardHomeFrame: {
    overflow: 'visible'
  },
  productCardPressed: {
    opacity: 0.94
  },
  productCardCarousel: {
    width: 148,
    flexGrow: 0,
    flexBasis: 148,
    maxWidth: 148
  },
  lockedCard: {
    opacity: 0.72
  },
  productImageWrap: {
    aspectRatio: productImageAspectRatio,
    backgroundColor: '#ffffff',
    position: 'relative'
  },
  productImage: {
    width: '100%',
    height: '100%'
  },
  productImageFrame: {
    overflow: 'hidden',
    backgroundColor: '#ffffff'
  },
  productImageSkeleton: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#eee7e2'
  },
  resilientImageFrame: {
    overflow: 'hidden',
    backgroundColor: '#f0ece8',
    position: 'relative'
  },
  resilientImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%'
  },
  avatarPositionedImage: {
    position: 'absolute'
  },
  resilientImageSkeleton: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#eee7e2'
  },
  resilientImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5
  },
  resilientImageFallbackText: {
    color: '#8b817b',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    textAlign: 'center'
  },
  productImageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0ece8',
    gap: 6
  },
  productImageFallbackText: {
    color: '#8b817b',
    fontSize: 11,
    fontWeight: '700'
  },
  wishlistDoneButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(33, 28, 26, 0.08)',
    backgroundColor: 'rgba(255, 253, 251, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1a1412',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
    zIndex: 8
  },
  wishlistDoneButtonCompact: {
    width: 32,
    height: 32,
    borderRadius: 16
  },
  wishlistDoneButtonSaved: {
    borderColor: '#111111',
    backgroundColor: '#111111'
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  badge: {
    position: 'absolute',
    left: 8,
    top: 8,
    backgroundColor: '#ccfbf1',
    color: '#115e59',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden'
  },
  productBody: {
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 4
  },
  productGridCardBody: {
    minHeight: 158,
    flexGrow: 1
  },
  productTitle: {
    fontSize: 12,
    lineHeight: 16,
    color: '#111827',
    fontWeight: '700'
  },
  productBrand: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700'
  },
  productSwatchPreviewRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  productSwatchPreview: {
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#e5ded8'
  },
  productSwatchMore: {
    color: '#817772',
    fontSize: 10,
    fontWeight: '700'
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  ratingText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700'
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6
  },
  price: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 12
  },
  discount: {
    color: '#0f766e',
    fontWeight: '700',
    fontSize: 11
  },
  wasPrice: {
    color: '#94a3b8',
    textDecorationLine: 'line-through',
    fontWeight: '700'
  },
  cardButton: {
    minHeight: 34,
    marginTop: 10
  },
  productGridCardButton: {
    marginTop: 'auto'
  },
  errorText: {
    color: '#b91c1c',
    fontWeight: '700'
  },
  muted: {
    color: '#64748b',
    lineHeight: 20
  },
  categoryGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
    rowGap: 10
  },
  categoryCell: {
    width: '50%',
    paddingHorizontal: 5
  },
  categoryCard: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  categoryImage: {
    height: 88,
    width: '100%'
  },
  categoryText: {
    padding: 8,
    fontWeight: '700',
    color: '#111827',
    fontSize: 12
  },
  featureBand: {
    margin: 16,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#ecfeff',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  featureItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  featureTitle: {
    fontWeight: '700',
    color: '#134e4a'
  },
  searchScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  searchTopBar: {
    minHeight: 64,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e3e1e7',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  searchCompactInputWrap: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9d7df',
    backgroundColor: '#ffffff',
    paddingLeft: 12,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  searchCompactInput: {
    ...typography.body,
    flex: 1,
    minHeight: 44,
    color: '#302b34',
    fontSize: 15
  },
  searchTopIconButton: {
    width: 32,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchContent: {
    paddingTop: 0,
    paddingBottom: screenBottomInset + 72,
    backgroundColor: '#ffffff'
  },
  searchUtilitySection: {
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 18,
    backgroundColor: '#ffffff'
  },
  searchUtilityTitle: {
    ...typography.h4,
    color: '#302b34',
    fontSize: 17
  },
  recentSearchList: {
    marginTop: 20,
    gap: 28
  },
  recentSearchRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  recentSearchText: {
    ...typography.body,
    color: '#302b34',
    fontSize: 16,
    lineHeight: 22
  },
  recentSearchEmpty: {
    ...typography.smallBody,
    marginTop: 18,
    color: '#8d8791',
    fontWeight: '500'
  },
  searchPopularBlock: {
    marginTop: 8,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 24,
    borderTopWidth: 8,
    borderTopColor: '#f4f3f5',
    backgroundColor: '#ffffff'
  },
  searchSuggestionGrid: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  searchSuggestionChip: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e6e4ea',
    backgroundColor: '#faf9fb',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchSuggestionText: {
    ...typography.smallBody,
    color: '#5c5864',
    fontWeight: '500'
  },
  searchPromoBanner: {
    height: 176,
    backgroundColor: '#f2f0f7',
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 26
  },
  searchPromoCopy: {
    width: '58%',
    zIndex: 2
  },
  searchPromoTitle: {
    ...typography.h3,
    color: '#706986',
    fontSize: 19,
    lineHeight: 25
  },
  searchPromoText: {
    ...typography.body,
    marginTop: 12,
    color: '#9a94a9',
    fontWeight: '700'
  },
  searchPromoImageCluster: {
    flex: 1,
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  searchPromoImage: {
    position: 'absolute'
  },
  searchPromoImageLarge: {
    right: -12,
    bottom: -18,
    width: 160,
    height: 160
  },
  searchPromoImageSmall: {
    right: 84,
    top: 26,
    width: 82,
    height: 82,
    opacity: 0.92
  },
  searchResultsHead: {
    paddingHorizontal: 18,
    marginTop: 22,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14
  },
  searchResultsTitle: {
    ...typography.h3,
    flex: 1,
    color: '#211c1a'
  },
  searchResultsMeta: {
    ...typography.caption,
    color: '#8d8682',
    paddingBottom: 2
  },
  searchEmptyCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eadfda',
    backgroundColor: '#fffdfb',
    paddingHorizontal: 18,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8
  },
  searchEmptyTitle: {
    ...typography.h4,
    color: '#211c1a',
    textAlign: 'center'
  },
  searchEmptyText: {
    ...typography.smallBody,
    color: '#706762',
    textAlign: 'center'
  },
  searchPanel: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fffdfb',
    gap: 8,
    shadowColor: '#2a211d',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ded6d0',
    backgroundColor: '#fffdfb',
    paddingLeft: 11,
    paddingRight: 5,
    gap: 8,
    shadowOpacity: 0
  },
  searchInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 0,
    color: '#1f1b19',
    fontSize: 13,
    fontWeight: '600'
  },
  searchButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#151824',
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 8
  },
  dropdownButton: {
    minWidth: 96,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2d8d2',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'flex-start',
    gap: 7
  },
  dropdownButtonActive: {
    borderColor: '#e2c9c5',
    backgroundColor: '#f6ece9'
  },
  dropdownCopy: {
    flexShrink: 1,
    minWidth: 0
  },
  dropdownLabel: {
    color: '#7b716a',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0
  },
  dropdownValue: {
    color: '#1f1b19',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(24, 20, 18, 0.36)',
    justifyContent: 'flex-end'
  },
  dropdownSheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: '#fffdfb',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: bottomNavigationHeight + 18
  },
  dropdownHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: '#e0d7d2',
    marginBottom: 14
  },
  dropdownTitle: {
    ...typography.h3,
    color: '#1f1b19',
    fontSize: 20,
    lineHeight: 25,
    marginBottom: 12
  },
  dropdownOptions: {
    maxHeight: 420
  },
  dropdownOption: {
    minHeight: 48,
    borderRadius: 7,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eee4df',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  dropdownOptionActive: {
    backgroundColor: '#f8eded',
    borderColor: '#b66d70'
  },
  dropdownOptionText: {
    ...typography.body,
    flex: 1,
    color: '#3e3936',
    fontWeight: '700'
  },
  dropdownOptionTextActive: {
    color: '#8c4d50'
  },
  chipRow: {
    gap: 8,
    paddingRight: 12
  },
  wrappedChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingRight: 0
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  compactChip: {
    paddingVertical: 7
  },
  wrappedChip: {
    marginBottom: 8
  },
  activeChip: {
    backgroundColor: '#f6ece9',
    borderColor: '#d7b8b5'
  },
  chipText: {
    color: '#334155',
    fontWeight: '700'
  },
  activeChipText: {
    color: '#8c4d50'
  },
  resultsHead: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between'
  },
  missionSuggestionPanel: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fffaf7',
    gap: 8
  },
  missionSuggestionKicker: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    color: '#9b5658',
    textTransform: 'uppercase',
    letterSpacing: 0
  },
  missionSuggestionText: {
    ...typography.smallBody,
    color: '#4b403b',
    lineHeight: 18
  },
  missionSuggestionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  missionSuggestionChip: {
    minHeight: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2d8d2',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  missionSuggestionChipActive: {
    borderColor: '#d7b8b5',
    backgroundColor: '#f6ece9'
  },
  missionSuggestionChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: '#4b403b'
  },
  missionSuggestionChipTextActive: {
    color: '#8c4d50'
  },
  screenTitle: {
    ...typography.display,
    color: '#111827',
    fontSize: 30,
    lineHeight: 34
  },
  statusPanel: {
    margin: 16,
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee3dc',
    backgroundColor: '#fffdfb',
    alignItems: 'center',
    gap: 9,
    shadowColor: '#2a211d',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2
  },
  loadingPanel: {
    alignItems: 'stretch'
  },
  skeletonIcon: {
    alignSelf: 'center',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#efe7e1'
  },
  skeletonLineWide: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#eee6e0'
  },
  skeletonLine: {
    width: '76%',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f2ebe6',
    alignSelf: 'center'
  },
  skeletonLineShort: {
    width: '52%',
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f2ebe6',
    alignSelf: 'center'
  },
  skeletonBlock: {
    borderRadius: 7,
    backgroundColor: '#eee7e2'
  },
  skeletonFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 0,
    backgroundColor: '#eee7e2'
  },
  skeletonProductCard: {
    borderColor: '#efe5df',
    backgroundColor: '#fffdfb'
  },
  skeletonTextLarge: {
    width: '86%',
    height: 13,
    borderRadius: 7,
    backgroundColor: '#eee6e0'
  },
  skeletonTextMedium: {
    width: '64%',
    height: 11,
    borderRadius: 6,
    backgroundColor: '#f2ebe6'
  },
  skeletonTextSmall: {
    width: '42%',
    height: 9,
    borderRadius: 5,
    backgroundColor: '#f4eee9'
  },
  homeSkeletonLine: {
    marginTop: 8
  },
  statusIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusIconEmpty: {
    backgroundColor: '#edf8f4'
  },
  statusIconError: {
    backgroundColor: '#fbefef'
  },
  statusTitle: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 16
  },
  statusText: {
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20
  },
  emptyStateCard: {
    width: '100%',
    flexBasis: '100%',
    alignSelf: 'stretch',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fffdfb',
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 9,
    shadowColor: '#2a211d',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  emptyStateCardCompact: {
    paddingVertical: 18
  },
  emptyStateIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff2f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4
  },
  emptyStateTitle: {
    ...typography.h3,
    color: '#211c1a',
    textAlign: 'center',
    fontSize: 19,
    lineHeight: 24
  },
  emptyStateText: {
    ...typography.smallBody,
    maxWidth: 280,
    color: '#6f6864',
    textAlign: 'center',
    fontWeight: '500'
  },
  emptyStateButton: {
    marginTop: 8,
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: '#050505',
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  emptyStateButtonText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 18
  },
  initialsAvatar: {
    overflow: 'hidden',
    backgroundColor: '#fff2f0',
    borderWidth: 1,
    borderColor: '#eaded9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  initialsAvatarText: {
    ...typography.label,
    color: '#9b5658',
    fontWeight: '700',
    textAlign: 'center'
  },
  aiPreviewNote: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fff5f3',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8
  },
  aiPreviewNoteText: {
    flex: 1,
    color: '#5d5754',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700'
  },
  lockedPanel: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#111827',
    gap: 10
  },
  lockedTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18
  },
  lockedActions: {
    flexDirection: 'row',
    gap: 10
  },
  productDetailScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  productDetailContent: {
    paddingBottom: bottomNavigationHeight + screenBottomInset + 72,
    backgroundColor: '#fbf7f6'
  },
  productTopBar: {
    height: 42,
    paddingHorizontal: 14,
    backgroundColor: '#fbf7f6',
    borderBottomWidth: 1,
    borderBottomColor: '#eee7e2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  productTopIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  productTopBrand: {
    ...typography.caption,
    color: '#111111',
    fontSize: 12,
    fontWeight: '700'
  },
  productHeroMedia: {
    marginHorizontal: 14,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f3eee8'
  },
  productHeroMediaTablet: {
    alignSelf: 'center'
  },
  productMediaTrack: {
    alignItems: 'stretch'
  },
  productMediaSlide: {
    height: '100%',
    backgroundColor: '#f3eee8',
    position: 'relative'
  },
  productHeroImage: {
    width: '100%',
    height: '100%'
  },
  productHeroVideo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3eee8'
  },
  videoSurface: {
    overflow: 'hidden',
    backgroundColor: '#f2f0ef'
  },
  videoSurfacePlayer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f2f0ef'
  },
  productMediaBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    color: '#171412',
    fontSize: 11,
    fontWeight: '700'
  },
  productMediaCount: {
    position: 'absolute',
    right: 56,
    top: 14,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(5, 5, 5, 0.72)',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  productFavoriteButton: {
    position: 'absolute',
    right: 13,
    top: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(232, 225, 218, 0.96)',
    backgroundColor: 'rgba(255, 253, 251, 0.94)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  productFavoriteButtonSaved: {
    backgroundColor: '#111111'
  },
  productSwipeHint: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    minHeight: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  productSwipeText: {
    color: '#171412',
    fontSize: 11,
    fontWeight: '700'
  },
  productSummary: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 22
  },
  productBrandLabel: {
    ...typography.caption,
    color: '#756c67',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase'
  },
  productNameText: {
    marginTop: 7,
    color: '#211f1d',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600'
  },
  productTitleDisclosure: {
    alignSelf: 'flex-start',
    minHeight: 32,
    marginTop: 2,
    marginLeft: -6,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  productTitleDisclosureText: {
    color: '#625a55',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textDecorationLine: 'underline'
  },
  productValueRow: {
    marginTop: 13,
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  productDetailPrice: {
    color: '#211f1d',
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700'
  },
  productRatingLine: {
    minHeight: 28,
    paddingHorizontal: 9,
    borderRadius: 14,
    backgroundColor: '#f3eee8',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  productRatingText: {
    color: '#514b47',
    fontSize: 12,
    fontWeight: '700'
  },
  productMetadataRow: {
    marginTop: 17,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#e8e1da',
    borderRadius: 12,
    backgroundColor: '#fffdfb',
    overflow: 'hidden'
  },
  productMetadataItem: {
    flex: 1,
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: 'center'
  },
  productCategoryMetaLabel: {
    color: '#8a817b',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: 0.7
  },
  productCategoryMetaValue: {
    marginTop: 3,
    color: '#312d2a',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  productActionRow: {
    marginTop: 17,
    gap: 9
  },
  productPrimaryAction: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#111111',
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9
  },
  productPrimaryActionText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    textAlign: 'center'
  },
  productSecondaryActionRow: {
    flexDirection: 'row',
    gap: 9
  },
  productSecondaryAction: {
    flex: 1.15,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dcd3cc',
    backgroundColor: '#fffdfb',
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  productSecondaryActionText: {
    color: '#211f1d',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  productVideoAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#f3eee8',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  productVideoActionWide: {
    flex: 1
  },
  productVideoActionText: {
    color: '#514b47',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700'
  },
  productCommerceUnavailable: {
    color: '#817872',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center'
  },
  productTryOnDisclosure: {
    color: '#817872',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 3
  },
  productStorySection: {
    paddingHorizontal: 18,
    paddingTop: 36
  },
  productStoryTitle: {
    ...typography.h3,
    color: '#3a2424',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '600'
  },
  productStoryText: {
    ...typography.smallBody,
    marginTop: 17,
    color: '#4f4a48',
    fontSize: 13,
    lineHeight: 23,
    fontWeight: '500'
  },
  productFacts: {
    marginTop: 22,
    borderTopWidth: 1,
    borderTopColor: '#e8e1da'
  },
  productFactRow: {
    minHeight: 46,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#e8e1da',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14
  },
  productFactLabel: {
    width: 82,
    color: '#817872',
    fontSize: 11,
    lineHeight: 17,
    fontWeight: '700'
  },
  productFactValue: {
    flex: 1,
    color: '#312d2a',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500'
  },
  completeLookSection: {
    paddingHorizontal: 18,
    paddingTop: 54
  },
  completeLookHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  completeLookTitle: {
    color: '#3a3532',
    fontSize: 12,
    fontWeight: '500'
  },
  completeLookAll: {
    color: '#9b5658',
    fontSize: 10,
    fontWeight: '700',
    textDecorationLine: 'underline'
  },
  completeLookGrid: {
    marginTop: 21,
    flexDirection: 'row',
    gap: 13
  },
  completeLookCard: {
    flex: 1
  },
  completeLookImageWrap: {
    position: 'relative'
  },
  completeLookImage: {
    width: '100%',
    height: 174,
    borderRadius: 6,
    backgroundColor: '#eee8e3'
  },
  completeLookBrand: {
    marginTop: 12,
    color: '#9b5658',
    fontSize: 9,
    fontWeight: '700'
  },
  completeLookName: {
    marginTop: 3,
    minHeight: 34,
    color: '#171412',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  completeLookPrice: {
    marginTop: 4,
    color: '#171412',
    fontSize: 11,
    fontWeight: '700'
  },
  productAtelierFooter: {
    marginTop: 150,
    paddingHorizontal: 26,
    paddingTop: 62,
    paddingBottom: 64,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: '#050505'
  },
  productAtelierTitle: {
    ...typography.h2,
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600'
  },
  productAtelierCopy: {
    ...typography.caption,
    marginTop: 20,
    color: '#a5a5a5',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 21,
    fontWeight: '500'
  },
  productEmailBox: {
    marginTop: 31,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1d1d1d',
    backgroundColor: '#0c0c0c',
    paddingLeft: 14,
    paddingRight: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  productEmailInput: {
    flex: 1,
    minHeight: 40,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600'
  },
  productSubmitButton: {
    minWidth: 75,
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  productSubmitText: {
    color: '#050505',
    fontSize: 12,
    fontWeight: '700'
  },
  productFooterDivider: {
    marginTop: 70,
    height: 1,
    backgroundColor: '#181818'
  },
  productFooterBrand: {
    ...typography.h3,
    marginTop: 37,
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '600'
  },
  productFooterCopy: {
    marginTop: 8,
    color: '#8b8b8b',
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0
  },
  productFooterLinks: {
    marginTop: 58,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  productFooterHead: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0
  },
  productFooterLink: {
    marginTop: 14,
    color: '#9b9b9b',
    fontSize: 11,
    fontWeight: '600'
  },
  aiStudioScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  aiStudioScroll: {
    flex: 1
  },
  aiStudioContent: {
    paddingTop: 18,
    paddingBottom: screenBottomInset + 104,
    paddingHorizontal: 20,
    backgroundColor: 'transparent'
  },
  aiStudioContentTablet: {
    paddingHorizontal: 32
  },
  aiStudioContentWelcome: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 24,
    paddingBottom: screenBottomInset + 100
  },
  aiStudioConversation: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center'
  },
  aiStudioWelcomePanel: {
    maxWidth: 900,
    minHeight: 480,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#e9dfd6',
    backgroundColor: '#fffdfb',
    paddingHorizontal: 42,
    paddingTop: 28,
    paddingBottom: 42,
    justifyContent: 'center',
    shadowColor: '#5e4a3c',
    shadowOpacity: 0.05,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2
  },
  aiStudioToolbarTablet: {
    minHeight: 44,
    marginBottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  aiStudioToolbarLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20
  },
  aiStudioMobileToolbar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  aiStudioBackButton: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e9dfd6',
    backgroundColor: '#fffdfb',
    paddingLeft: 10,
    paddingRight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2
  },
  aiStudioBackButtonText: {
    ...typography.caption,
    color: '#3b3531',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700'
  },
  aiStudioToolbarDockTablet: {
    maxWidth: 920,
    alignSelf: 'center',
    paddingTop: 10,
    paddingBottom: 8
  },
  aiStudioToolbarActiveTablet: {
    marginBottom: 0
  },
  aiStudioToolbarLabel: {
    ...typography.label,
    color: '#8f5d59',
    fontSize: 12,
    letterSpacing: 1.4
  },
  aiStudioHistoryButtonTablet: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e9dfd6',
    backgroundColor: '#faf6f1',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  aiStudioHistoryButtonText: {
    ...typography.caption,
    color: '#3b3531',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700'
  },
  aiStudioMenuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fffdfb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3d2924',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  aiHistoryModal: {
    flex: 1
  },
  aiHistoryBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(31, 24, 22, 0.28)'
  },
  aiHistoryDrawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#fbf7f6',
    borderRightWidth: 1,
    borderRightColor: '#eaded9',
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight || 24) + 14 : 54,
    paddingHorizontal: 14,
    paddingBottom: screenBottomInset + 20,
    shadowColor: '#1f1714',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 8, height: 0 },
    elevation: 16
  },
  aiHistoryHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  aiHistoryTitle: {
    ...typography.h4,
    color: '#211c1a',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800'
  },
  aiHistoryCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4ece8'
  },
  aiHistoryNewButton: {
    marginTop: 14,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#252221',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: '#1a1412',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  aiHistoryNewText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800'
  },
  aiHistorySectionLabel: {
    ...typography.label,
    marginTop: 22,
    color: '#9b5658',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  aiHistoryList: {
    marginTop: 8,
    flex: 1
  },
  aiHistoryListContent: {
    paddingBottom: 18,
    gap: 7
  },
  aiHistoryItem: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  aiHistoryItemActive: {
    borderColor: '#ead8d1',
    backgroundColor: '#fffdfb'
  },
  aiHistoryItemText: {
    ...typography.caption,
    flex: 1,
    minWidth: 0,
    color: '#4d4642',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700'
  },
  aiHistoryItemTextActive: {
    color: '#211c1a',
    fontWeight: '800'
  },
  aiHistoryEmpty: {
    ...typography.smallBody,
    paddingTop: 6,
    color: '#8d8682',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  aiStudioHero: {
    paddingTop: 8,
    paddingBottom: 4
  },
  aiStudioHeroCopy: {
    flex: 1,
    minWidth: 0
  },
  aiStudioHeroLabel: {
    ...typography.label,
    color: '#8f5d59',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 1.55
  },
  aiStudioHeroTitle: {
    fontFamily: fontFamilies.logo,
    marginTop: 7,
    color: '#211f1d',
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '400',
    letterSpacing: -0.35
  },
  aiStudioHeroText: {
    ...typography.smallBody,
    maxWidth: 330,
    marginTop: 8,
    color: '#625c56',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400'
  },
  aiStudioHeroTitleTablet: {
    marginTop: 10,
    fontSize: 43,
    lineHeight: 52
  },
  aiStudioHeroTextTablet: {
    maxWidth: 560,
    marginTop: 12,
    fontSize: 18,
    lineHeight: 27
  },
  aiHeroPanel: {
    minHeight: 92,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e7dfda',
    backgroundColor: '#fffdfb',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13
  },
  aiHeroIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f5ece9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  aiHeroCopy: {
    flex: 1,
    minWidth: 0
  },
  aiGreetingText: {
    ...typography.h4,
    marginTop: 5,
    color: '#252221',
    fontSize: 18,
    lineHeight: 24
  },
  aiIdeaPanel: {
    marginTop: 14
  },
  aiIdeaPanelLabel: {
    ...typography.caption,
    color: '#8d8682',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  aiIdeaRow: {
    paddingTop: 9,
    paddingBottom: 2,
    gap: 8,
    paddingRight: 18
  },
  aiIdeaChip: {
    height: 38,
    maxWidth: 166,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#e3d9d4',
    backgroundColor: '#fffdfb',
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  aiIdeaChipCompact: {
    maxWidth: 142,
    paddingHorizontal: 11
  },
  aiIdeaText: {
    ...typography.caption,
    flexShrink: 1,
    color: '#252221',
    fontSize: 13,
    fontWeight: '700'
  },
  aiEmptyState: {
    marginTop: 18,
    minHeight: 118,
    padding: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ebe3df',
    backgroundColor: '#f8f1ed',
    justifyContent: 'center'
  },
  aiEmptyTitle: {
    ...typography.h4,
    marginTop: 12,
    color: '#211c1a',
    fontSize: 17,
    fontWeight: '700'
  },
  aiEmptyText: {
    ...typography.smallBody,
    marginTop: 6,
    color: '#69615d',
    fontWeight: '500'
  },
  aiStarterPanel: {
    marginTop: 22
  },
  aiStarterTitle: {
    ...typography.label,
    color: '#211f1d',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0
  },
  aiStarterGrid: {
    paddingTop: 10,
    paddingBottom: 3,
    paddingRight: 20,
    gap: 8
  },
  aiStarterCard: {
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: '#f3eee8',
    paddingLeft: 16,
    paddingRight: 13,
    flexDirection: 'row',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  aiStarterCardTitle: {
    ...typography.caption,
    flexShrink: 0,
    color: '#211f1d',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600'
  },
  aiStarterArrow: {
    transform: [{ rotate: '45deg' }]
  },
  aiStarterGridTablet: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 18
  },
  aiStarterCardTablet: {
    flex: 1,
    minWidth: 0,
    minHeight: 176,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e9dfd6',
    backgroundColor: '#faf6f1',
    padding: 18
  },
  aiStarterIconTablet: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f4e9e5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  aiStarterCardTitleTablet: {
    ...typography.caption,
    marginTop: 17,
    color: '#211f1d',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700'
  },
  aiStarterCardTextTablet: {
    ...typography.smallBody,
    marginTop: 3,
    paddingRight: 15,
    color: '#625c56',
    fontSize: 14,
    lineHeight: 19
  },
  aiStarterArrowTablet: {
    position: 'absolute',
    right: 15,
    bottom: 16
  },
  aiChatThread: {
    paddingTop: 14,
    gap: 10
  },
  aiMessageBlock: {
    gap: 10
  },
  aiMessageBubble: {
    maxWidth: '91%',
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9
  },
  aiMessageBubbleAssistant: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fffdfb'
  },
  aiMessageBubbleIntro: {
    maxWidth: '100%',
    width: '100%',
    minHeight: 0,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 0,
    backgroundColor: 'transparent'
  },
  aiMessageBubbleUser: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 5,
    backgroundColor: '#252221',
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  aiMessageBubbleError: {
    maxWidth: '88%',
    borderColor: '#e2d8d1',
    backgroundColor: '#f3eee8',
    paddingHorizontal: 13,
    paddingVertical: 10
  },
  aiMessageText: {
    ...typography.body,
    flexShrink: 1,
    color: '#211f1d',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400'
  },
  aiMessageTextIntro: {
    maxWidth: 332,
    color: '#625c56',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400'
  },
  aiMessageTextIntroTablet: {
    maxWidth: 600,
    fontSize: 16,
    lineHeight: 24
  },
  aiMessageTextUser: {
    color: '#ffffff',
    fontWeight: '500'
  },
  aiMessageTextError: {
    color: '#4f4945',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500'
  },
  aiMessageErrorIcon: {
    marginTop: 1
  },
  aiRetryButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    marginTop: -3,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#ded3cb',
    backgroundColor: '#faf8f5',
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  aiRetryButtonText: {
    ...typography.caption,
    color: '#4f4945',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  aiSuggestionProductsTrack: {
    gap: 12,
    paddingRight: 16
  },
  aiStudioPreviewNote: {
    marginHorizontal: 0,
    marginTop: 12
  },
  aiFollowUpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  aiFollowUpChip: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#ded4cc',
    backgroundColor: '#f3eee8',
    paddingHorizontal: 15,
    alignItems: 'center',
    justifyContent: 'center'
  },
  aiFollowUpText: {
    ...typography.caption,
    color: '#4f4945',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  aiOutfitList: {
    gap: 10
  },
  aiOutfitCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ebe3df',
    backgroundColor: '#fffdfb',
    padding: 12,
    gap: 9
  },
  aiOutfitHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10
  },
  aiOutfitTitle: {
    ...typography.productTitle,
    flex: 1,
    minWidth: 0,
    color: '#211c1a',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800'
  },
  aiOutfitSource: {
    ...typography.caption,
    maxWidth: 110,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#eadbd6',
    backgroundColor: '#f8efed',
    color: '#9b5658',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800'
  },
  aiOutfitReason: {
    ...typography.caption,
    color: '#625c56',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400'
  },
  aiOutfitItems: {
    gap: 8,
    paddingRight: 8
  },
  aiOutfitItem: {
    width: 94,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee4df',
    backgroundColor: '#ffffff',
    overflow: 'hidden'
  },
  aiOutfitItemImage: {
    width: '100%',
    height: 84,
    backgroundColor: '#eee8e3'
  },
  aiOutfitItemFallback: {
    height: 84,
    backgroundColor: '#f5ece9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  aiOutfitItemName: {
    ...typography.caption,
    minHeight: 32,
    paddingHorizontal: 8,
    paddingTop: 7,
    color: '#211c1a',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800'
  },
  aiOutfitItemMeta: {
    ...typography.caption,
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 8,
    color: '#817873',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700'
  },
  conciergeSuggestionTrack: {
    paddingTop: 18,
    gap: 12,
    paddingRight: 16
  },
  conciergeSuggestionCard: {
    width: 184,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ebe3df'
  },
  conciergeSuggestionImageWrap: {
    height: 190,
    backgroundColor: '#eee8e3'
  },
  conciergeSuggestionImage: {
    width: '100%',
    height: '100%'
  },
  conciergeSparkButton: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  conciergeSuggestionBody: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12
  },
  conciergeSuggestionBrand: {
    ...typography.caption,
    color: '#55514f',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700'
  },
  conciergeSourceBadge: {
    ...typography.caption,
    alignSelf: 'flex-start',
    marginBottom: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#eadbd6',
    backgroundColor: '#f8efed',
    color: '#9b5658',
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800'
  },
  conciergeSuggestionName: {
    ...typography.productTitle,
    marginTop: 5,
    minHeight: 40,
    color: '#171412',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0
  },
  conciergeSuggestionPrice: {
    ...typography.price,
    marginTop: 5,
    color: '#171412',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700'
  },
  conciergeShopButton: {
    marginTop: 9,
    alignSelf: 'flex-start',
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#050505',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  conciergeShopText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  conciergeExternalLink: {
    marginTop: 8
  },
  conciergeExternalLinkText: {
    ...typography.caption,
    color: '#9b5658',
    fontSize: 11,
    fontWeight: '700',
    textDecorationLine: 'underline'
  },
  aiThreadPanel: {
    marginTop: 18,
    gap: 12
  },
  aiUserBubble: {
    alignSelf: 'flex-end',
    maxWidth: '86%',
    borderRadius: 16,
    borderBottomRightRadius: 5,
    backgroundColor: '#252221',
    paddingHorizontal: 14,
    paddingVertical: 11
  },
  aiUserBubbleText: {
    ...typography.body,
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600'
  },
  aiAssistantRow: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    minHeight: 40,
    borderRadius: 16,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: '#e7dfda',
    backgroundColor: '#fffdfb',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  aiStatusText: {
    ...typography.caption,
    color: '#6f6864',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  aiRunPreviewGrid: {
    paddingTop: 16,
    flexDirection: 'row',
    gap: 10
  },
  aiRunPreviewCard: {
    width: 104,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#ebe3df'
  },
  aiRunPreviewImage: {
    width: '100%',
    height: 116,
    backgroundColor: '#eee8e3'
  },
  aiRunPreviewName: {
    ...typography.caption,
    paddingHorizontal: 8,
    paddingVertical: 7,
    color: '#34302d',
    fontSize: 11,
    fontWeight: '700'
  },
  aiComposer: {
    position: 'absolute',
    zIndex: 45,
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: '#fffdfb',
    padding: 5,
    shadowColor: '#1a1412',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },
  aiComposerTablet: {
    borderRadius: 19,
    padding: 7
  },
  aiComposerFocused: {
    borderColor: '#77716c',
    shadowOpacity: 0.12
  },
  aiComposerInput: {
    ...typography.body,
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#faf8f5',
    paddingHorizontal: 15,
    color: '#211f1d',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400'
  },
  aiComposerInputTablet: {
    minHeight: 52,
    fontSize: 16,
    lineHeight: 23
  },
  aiSendButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#1a1716',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1a1412',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  aiSendButtonTablet: {
    width: 52,
    height: 52,
    borderRadius: 13
  },
  aiSendButtonDisabled: {
    backgroundColor: '#e1dbd6',
    shadowOpacity: 0,
    elevation: 0
  },
  detailMedia: {
    margin: 16,
    height: 460,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb'
  },
  detailMediaTrack: {
    alignItems: 'stretch'
  },
  detailSlide: {
    height: '100%',
    position: 'relative',
    backgroundColor: '#fff'
  },
  detailImage: {
    width: '100%',
    height: '100%'
  },
  detailVideo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000'
  },
  detailImageBadge: {
    ...typography.caption,
    position: 'absolute',
    left: 12,
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    color: '#111827',
    fontSize: 12,
    fontWeight: '700'
  },
  detailImageCount: {
    ...typography.caption,
    position: 'absolute',
    right: 12,
    top: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(17, 24, 39, 0.82)',
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  detailSwipeHint: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  detailSwipeText: {
    ...typography.caption,
    color: '#111827',
    fontWeight: '700'
  },
  detailBody: {
    paddingHorizontal: 16,
    gap: 10
  },
  detailTitle: {
    ...typography.display,
    lineHeight: 36,
    fontWeight: '700',
    color: '#111827'
  },
  detailPrice: {
    ...typography.price,
    fontSize: 24,
    color: '#111827'
  },
  description: {
    ...typography.body,
    color: '#475569',
    lineHeight: 22
  },
  factGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  factItem: {
    width: '48%',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  factLabel: {
    ...typography.caption,
    color: '#64748b',
    fontWeight: '700'
  },
  factValue: {
    ...typography.body,
    color: '#111827',
    fontWeight: '700',
    marginTop: 4
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  tag: {
    ...typography.caption,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    color: '#334155',
    fontWeight: '700'
  },
  detailActions: {
    gap: 10
  },
  authEntryScroll: {
    flex: 1,
    backgroundColor: '#faf8f5'
  },
  authEntryContent: {
    flexGrow: 1,
    backgroundColor: '#faf8f5'
  },
  authEntryHero: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#d9d3cc'
  },
  authEntryBackground: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%'
  },
  authEntryImageWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20, 17, 15, 0.28)'
  },
  authEntryHeroTop: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  authEntryLogoMark: {
    justifyContent: 'center'
  },
  authEntryLogoSymbol: {
    width: 34,
    height: 34
  },
  authEntryLogoDivider: {
    height: 28
  },
  authEntryLogoText: {
    fontSize: 24,
    lineHeight: 30
  },
  authEntrySignInTop: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.62)',
    backgroundColor: 'rgba(17, 17, 17, 0.24)',
    paddingHorizontal: 17,
    alignItems: 'center',
    justifyContent: 'center'
  },
  authEntrySignInTopText: {
    ...typography.label,
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  authEntryHeroCaption: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    maxWidth: 330
  },
  authEntryEyebrow: {
    ...typography.label,
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 2
  },
  authEntryHeroTitle: {
    marginTop: 8,
    color: '#ffffff',
    fontFamily: fontFamilies.logo,
    fontWeight: '400',
    letterSpacing: -0.3
  },
  authEntryHeroText: {
    ...typography.smallBody,
    maxWidth: 290,
    marginTop: 9,
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400'
  },
  authEntryMain: {
    paddingTop: 20,
    paddingBottom: 0
  },
  authEntryMainCompact: {
    paddingTop: 16
  },
  authEntryIntro: {
    maxWidth: 350
  },
  authEntryIntroTitle: {
    color: '#211f1d',
    fontFamily: fontFamilies.logo,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '400'
  },
  authEntryIntroText: {
    ...typography.smallBody,
    marginTop: 4,
    color: '#625c56',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400'
  },
  authEntryFeatureList: {
    marginTop: 16,
    gap: 8
  },
  authEntryFeature: {
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#f3eee8',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 11
  },
  authEntryFeatureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#faf8f5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  authEntryFeatureCopy: {
    flex: 1,
    minWidth: 0
  },
  authEntryFeatureTitle: {
    ...typography.label,
    color: '#211f1d',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600'
  },
  authEntryFeatureText: {
    ...typography.caption,
    marginTop: 1,
    color: '#625c56',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400'
  },
  authEntryCta: {
    minHeight: 52,
    marginTop: 18,
    borderRadius: 12,
    backgroundColor: '#111111',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 20
  },
  authEntryCtaText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600'
  },
  authEntryExplore: {
    alignSelf: 'center',
    minHeight: 44,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center'
  },
  authEntryExploreText: {
    ...typography.smallBody,
    color: '#625c56',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  signupScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  signupContent: {
    flexGrow: 1,
    paddingTop: 54,
    paddingBottom: 34
  },
  signupBrandLogo: {
    flex: 1
  },
  signupTitle: {
    ...typography.h1,
    marginTop: 50,
    color: '#050505',
    fontSize: 52,
    lineHeight: 60
  },
  signupSubtitle: {
    ...typography.body,
    marginTop: 22,
    color: '#4b4b4d',
    fontSize: 23,
    lineHeight: 31,
    fontWeight: '400',
    letterSpacing: 0
  },
  signupFieldStack: {
    marginTop: 55,
    gap: 27
  },
  signupInputWrap: {
    minHeight: 77,
    borderRadius: 15,
    borderWidth: 1.3,
    borderColor: '#c8cacc',
    backgroundColor: '#fbf7f6',
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 17
  },
  signupInput: {
    ...typography.body,
    flex: 1,
    minHeight: 52,
    color: '#111111',
    fontSize: 20
  },
  signupInlineIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  signupSuggestionRow: {
    marginTop: -14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  signupSuggestionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d7d8da',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#ffffff'
  },
  signupSuggestionText: {
    ...typography.caption,
    color: '#555b66',
    fontWeight: '700'
  },
  signupSectionLabel: {
    ...typography.label,
    marginTop: 37,
    color: '#4b4b4d',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: 0
  },
  signupGenderRow: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 11
  },
  signupGenderButton: {
    flex: 1,
    minHeight: 67,
    borderRadius: 15,
    borderWidth: 1.3,
    borderColor: '#c8cacc',
    backgroundColor: '#fbf7f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  signupGenderButtonActive: {
    backgroundColor: '#111111',
    borderColor: '#111111'
  },
  signupGenderText: {
    ...typography.body,
    color: '#111111',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '400',
    letterSpacing: 0
  },
  signupGenderTextActive: {
    color: '#ffffff'
  },
  signupPhotoRow: {
    marginTop: 38,
    flexDirection: 'row',
    gap: 17
  },
  signupPhotoButton: {
    flex: 1,
    minHeight: 68,
    borderRadius: 15,
    borderWidth: 1.3,
    borderColor: '#c8cacc',
    backgroundColor: '#fbf7f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 10
  },
  signupPhotoButtonText: {
    ...typography.button,
    color: '#19191b',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: 0
  },
  signupModeRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 17
  },
  signupModeButton: {
    flex: 1,
    minHeight: 72,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#d9dadd',
    backgroundColor: '#fbf7f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12
  },
  signupModeButtonActive: {
    borderColor: '#111111'
  },
  signupModeText: {
    ...typography.smallBody,
    color: '#4c4d50',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0
  },
  signupModeTextActive: {
    color: '#111111'
  },
  signupTermsRow: {
    marginTop: 41,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16
  },
  signupCheckbox: {
    marginTop: 1,
    width: 27,
    height: 27,
    borderRadius: 4,
    borderWidth: 1.3,
    borderColor: '#c8cacc',
    alignItems: 'center',
    justifyContent: 'center'
  },
  signupCheckboxActive: {
    backgroundColor: '#111111',
    borderColor: '#111111'
  },
  signupTermsText: {
    ...typography.smallBody,
    flex: 1,
    color: '#3c3d40',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0
  },
  signupTermsLink: {
    color: '#050505',
    textDecorationLine: 'underline'
  },
  signupSubmit: {
    marginTop: 40,
    minHeight: 76,
    borderRadius: 15,
    backgroundColor: '#050606',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 22
  },
  signupSubmitDisabled: {
    opacity: 0.62
  },
  signupSubmitText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    letterSpacing: 0
  },
  signupMessage: {
    marginTop: 14,
    textAlign: 'center'
  },
  signupSwitch: {
    marginTop: 25,
    alignItems: 'center'
  },
  signupSwitchText: {
    ...typography.smallBody,
    color: '#4c4d50',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '400'
  },
  signupSwitchLink: {
    color: '#050505'
  },
  loginScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  loginContent: {
    flexGrow: 1,
    backgroundColor: '#fbf7f6'
  },
  loginHero: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#1f1f1f'
  },
  loginHeroImage: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.06 }]
  },
  loginHeroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.42)'
  },
  loginHeroCopy: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingTop: 18,
    paddingBottom: 28
  },
  loginHeroTitle: {
    ...typography.display,
    color: '#ffffff',
    fontWeight: '700'
  },
  loginHeroText: {
    ...typography.h2,
    marginTop: 64,
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 24,
    lineHeight: 36,
    fontWeight: '400',
    letterSpacing: 0
  },
  loginPanel: {
    paddingTop: 60,
    paddingBottom: 38,
    backgroundColor: 'rgba(255, 252, 250, 0.36)'
  },
  loginTitle: {
    ...typography.h1,
    color: '#111111',
    fontWeight: '700'
  },
  loginSubtitle: {
    ...typography.body,
    marginTop: 22,
    color: '#4b4b4d',
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '400',
    letterSpacing: 0
  },
  loginTabWrap: {
    marginTop: 76,
    height: 48,
    position: 'relative',
    justifyContent: 'flex-start'
  },
  loginTabText: {
    ...typography.h4,
    marginLeft: 58,
    color: '#111111',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: 0
  },
  loginTabLine: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: '34%',
    height: 3,
    backgroundColor: '#111111'
  },
  loginTabFaintLine: {
    position: 'absolute',
    left: '34%',
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: '#e4e1e0'
  },
  loginFieldStack: {
    marginTop: 62,
    gap: 32
  },
  loginInputWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dedfde',
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  loginInput: {
    ...typography.body,
    flex: 1,
    minHeight: 46,
    color: '#111111',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '400'
  },
  loginOptionsRow: {
    marginTop: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16
  },
  loginRemember: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  loginCheckbox: {
    width: 27,
    height: 27,
    borderRadius: 4,
    borderWidth: 1.3,
    borderColor: '#c8cacc',
    alignItems: 'center',
    justifyContent: 'center'
  },
  loginOptionText: {
    ...typography.smallBody,
    color: '#4b4b4d',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '400'
  },
  loginForgotText: {
    ...typography.smallBody,
    color: '#7a3a31',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700'
  },
  loginTermsText: {
    ...typography.smallBody,
    marginTop: 30,
    color: '#96999c',
    fontSize: 16,
    lineHeight: 25,
    fontWeight: '400',
    textAlign: 'center'
  },
  loginTermsLink: {
    color: '#8c8f92',
    textDecorationLine: 'underline'
  },
  loginTermsUnderline: {
    alignSelf: 'center',
    marginTop: 0,
    width: '64%',
    height: 1,
    backgroundColor: '#b8b8b8'
  },
  loginSubmit: {
    marginTop: 28,
    minHeight: 60,
    borderRadius: 13,
    backgroundColor: '#050606',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 22
  },
  loginSubmitText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    letterSpacing: 0
  },
  loginSwitch: {
    marginTop: 27,
    alignItems: 'center'
  },
  loginSwitchText: {
    ...typography.smallBody,
    color: '#4c4d50',
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '400'
  },
  loginSwitchLink: {
    color: '#050505'
  },
  phoneAuthContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingBottom: 44,
    backgroundColor: '#fbf7f6'
  },
  phoneAuthContentTablet: {
    justifyContent: 'center',
    backgroundColor: '#f7f3eb'
  },
  phoneAuthLayout: {
    width: '100%',
    alignItems: 'center'
  },
  phoneAuthLayoutTablet: {
    maxWidth: 1060,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 26
  },
  phoneAuthFormColumn: {
    width: '100%',
    alignItems: 'center'
  },
  phoneAuthFormColumnTablet: {
    flex: 1,
    minWidth: 0
  },
  phoneAuthStoryColumn: {
    width: '100%',
    alignItems: 'center'
  },
  phoneAuthStoryColumnTablet: {
    flex: 0.92,
    minWidth: 0
  },
  phoneAuthCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fffdfb',
    paddingHorizontal: 26,
    paddingVertical: 28,
    shadowColor: '#2a211d',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  phoneAuthCardTablet: {
    borderRadius: 18,
    paddingHorizontal: 32,
    paddingVertical: 36
  },
  phoneAuthIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff5f3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20
  },
  phoneAuthSubtitle: {
    ...typography.body,
    marginTop: 12,
    color: '#5d5754',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600'
  },
  phoneAuthFieldStack: {
    marginTop: 30,
    gap: 12
  },
  passwordVisibilityButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7f2f0'
  },
  signupDetailsCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: '#faf8f5',
    paddingHorizontal: 24,
    paddingVertical: 26,
    shadowColor: '#2a211d',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  signupDetailsCardTablet: {
    maxWidth: 640
  },
  signupDetailsEyebrow: {
    ...typography.label,
    color: '#77716c',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.8
  },
  signupDetailsTitle: {
    marginTop: 7,
    color: '#211f1d',
    fontFamily: fontFamilies.logo,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '400',
    letterSpacing: -0.25
  },
  signupDetailsFieldStack: {
    marginTop: 24,
    gap: 16
  },
  signupDetailsLabel: {
    ...typography.label,
    color: '#5d5754',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  signupDetailsGenderRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8
  },
  signupDetailsGenderButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: '#f3eee8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8
  },
  signupDetailsGenderButtonActive: {
    borderColor: '#211f1d',
    backgroundColor: '#211f1d'
  },
  signupDetailsGenderText: {
    ...typography.caption,
    color: '#5d5754',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  signupDetailsGenderTextActive: {
    color: '#ffffff'
  },
  signupDetailsUploadBox: {
    height: 224,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cfc3ba',
    overflow: 'hidden',
    backgroundColor: '#f3eee8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  signupDetailsUploadImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3eee8'
  },
  signupDetailsUploadOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    minHeight: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(17, 17, 17, 0.76)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  signupDetailsUploadOverlayText: {
    ...typography.caption,
    color: '#ffffff',
    fontWeight: '700'
  },
  signupDetailsUploadCopy: {
    alignItems: 'center',
    paddingHorizontal: 28
  },
  signupDetailsUploadIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#faf8f5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  signupDetailsUploadTitle: {
    ...typography.productTitle,
    marginTop: 12,
    color: '#211f1d',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center'
  },
  signupDetailsUploadText: {
    ...typography.smallBody,
    marginTop: 6,
    maxWidth: 270,
    color: '#625c56',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400'
  },
  signupDetailsUploadMeta: {
    ...typography.caption,
    marginTop: 9,
    color: '#77716c',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600'
  },
  signupDetailsLegalText: {
    ...typography.caption,
    marginTop: 14,
    color: '#8d8682',
    textAlign: 'center',
    fontWeight: '500'
  },
  signupDetailsLegalLink: {
    color: '#9b5658',
    fontWeight: '700',
    textDecorationLine: 'underline'
  },
  phoneAuthOtpBlock: {
    gap: 7
  },
  phoneAuthEditorial: {
    width: '100%',
    maxWidth: 520,
    marginTop: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fffdfb',
    padding: 10,
    shadowColor: '#2a211d',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  phoneAuthEditorialTablet: {
    borderRadius: 18,
    padding: 14
  },
  phoneAuthEditorialImageFrame: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e8ded9'
  },
  phoneAuthEditorialImage: {
    width: '100%',
    height: '100%'
  },
  phoneAuthEditorialShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 17, 17, 0.14)'
  },
  phoneAuthEditorialBadge: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10
  },
  phoneAuthEditorialBadgeText: {
    ...typography.caption,
    color: '#111111',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  phoneAuthEditorialTitle: {
    ...typography.productTitle,
    marginTop: 12,
    color: '#2b2321',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800'
  },
  phoneAuthPerkRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8
  },
  phoneAuthPerk: {
    flex: 1,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee3dc',
    backgroundColor: '#fbf7f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 6
  },
  phoneAuthPerkText: {
    ...typography.caption,
    color: '#2b2321',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800'
  },
  phoneAuthTextButton: {
    marginTop: 14,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2d7d2',
    backgroundColor: '#fbf7f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16
  },
  phoneAuthTextButtonLabel: {
    ...typography.caption,
    color: '#2b2321',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800'
  },
  phoneAuthMessage: {
    color: '#5d5754'
  },
  authModeSwitch: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexWrap: 'wrap'
  },
  authModeSwitchText: {
    ...typography.caption,
    color: '#6d625e',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  authModeSwitchLink: {
    ...typography.caption,
    color: '#2b2321',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    textDecorationLine: 'underline'
  },
  phoneAuthBrowseButton: {
    width: '100%',
    maxWidth: 520,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44
  },
  phoneAuthBrowseText: {
    ...typography.caption,
    color: '#5d5754',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700'
  },
  authCard: {
    margin: 16,
    padding: 18,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 12
  },
  authTitle: {
    ...typography.h1,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: 0
  },
  input: {
    ...typography.body,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    color: '#111827',
    backgroundColor: '#fff',
    fontWeight: '500'
  },
  formGroup: {
    gap: 8
  },
  formLabel: {
    ...typography.label,
    color: '#334155',
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  noteInput: {
    marginHorizontal: 16,
    minHeight: 90,
    paddingTop: 12,
    textAlignVertical: 'top'
  },
  uploadBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#0f766e',
    padding: 12,
    backgroundColor: '#f0fdfa',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  uploadPreview: {
    width: 58,
    height: 72,
    borderRadius: 8
  },
  uploadCopy: {
    flex: 1
  },
  uploadTitle: {
    ...typography.body,
    color: '#134e4a',
    fontWeight: '700'
  },
  photoGuide: {
    marginTop: 8,
    gap: 4
  },
  photoGuideTitle: {
    ...typography.caption,
    color: '#0f766e',
    fontWeight: '700'
  },
  photoGuideText: {
    ...typography.caption,
    color: '#475569',
    lineHeight: 17,
    fontWeight: '700'
  },
  formMessage: {
    ...typography.smallBody,
    color: '#475569',
    fontWeight: '700'
  },
  switchText: {
    ...typography.smallBody,
    color: '#0f766e',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4
  },
  toolHero: {
    margin: 16,
    padding: 18,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10
  },
  customTryOnScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  customTryOnScroll: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  customTryOnContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: bottomNavigationHeight + screenBottomInset + 96
  },
  customTryOnContentCompact: {
    paddingTop: 8
  },
  customTryOnContentTablet: {
    width: '100%',
    maxWidth: 960,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: bottomNavigationHeight + screenBottomInset + 24
  },
  customHeroPanel: {
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 2,
    gap: 7
  },
  customHeroPanelCompact: {
    paddingTop: 0,
    gap: 5
  },
  customHeroPanelTablet: {
    gap: 10,
    paddingBottom: 8
  },
  customHeroEyebrow: {
    ...typography.label,
    color: '#8c5557',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 2
  },
  customHeroTitle: {
    fontFamily: fontFamilies.logo,
    color: '#211f1d',
    fontSize: 31,
    lineHeight: 37,
    fontWeight: '400',
    letterSpacing: -0.25
  },
  customHeroTitleCompact: {
    fontSize: 27,
    lineHeight: 32
  },
  customHeroTitleTablet: {
    fontSize: 36,
    lineHeight: 44
  },
  customHeroDescription: {
    ...typography.smallBody,
    color: '#5f5955',
    fontSize: 14,
    lineHeight: 20
  },
  customHeroDescriptionCompact: {
    fontSize: 13,
    lineHeight: 18
  },
  customHeroDescriptionTablet: {
    fontSize: 16,
    lineHeight: 23
  },
  customHeroMetaRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  customTokenPill: {
    minHeight: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: '#f3eee8',
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  customTokenText: {
    ...typography.caption,
    color: '#5d5754',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800'
  },
  customUploadRow: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 10
  },
  customUploadRowCompact: {
    marginTop: 10,
    gap: 10
  },
  customUploadRowTablet: {
    maxWidth: 920,
    gap: 18
  },
  customProfileCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
    overflow: 'hidden'
  },
  customProfileImage: {
    width: '100%',
    height: '100%'
  },
  customProfileEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#f3eee8'
  },
  customProfileEmptyText: {
    ...typography.caption,
    marginTop: 8,
    color: '#625c57',
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700'
  },
  customProfileCaption: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 9,
    backgroundColor: 'rgba(250, 248, 245, 0.94)',
    paddingHorizontal: 8,
    paddingVertical: 7
  },
  customProfileLabel: {
    ...typography.caption,
    color: '#2b2321',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800'
  },
  customProfileSub: {
    ...typography.caption,
    marginTop: 2,
    color: '#625c57',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  customCardBadge: {
    position: 'absolute',
    left: 9,
    top: 9,
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(250, 248, 245, 0.92)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  customCardBadgeText: {
    ...typography.caption,
    color: '#5f5853',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: 0.8
  },
  customGarmentDrop: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cfc2b9',
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  customGarmentDropReady: {
    borderStyle: 'solid',
    borderColor: '#e8e1da'
  },
  customGarmentCopy: {
    alignItems: 'center',
    paddingHorizontal: 12
  },
  customGarmentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#faf8f5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  customGarmentTitle: {
    ...typography.productTitle,
    marginTop: 11,
    color: '#2b2321',
    textAlign: 'center',
    fontWeight: '800'
  },
  customGarmentHelp: {
    ...typography.caption,
    marginTop: 6,
    color: '#625c57',
    textAlign: 'center',
    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: '600'
  },
  customGarmentImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3eee8'
  },
  customResultCard: {
    marginTop: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
    overflow: 'hidden'
  },
  customResultHead: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  customResultCopy: {
    flex: 1,
    minWidth: 0
  },
  customResultTitle: {
    ...typography.productTitle,
    color: '#211f1d',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800'
  },
  customResultSub: {
    ...typography.caption,
    marginTop: 2,
    color: '#625c57',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600'
  },
  customResultOpen: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f5efec',
    alignItems: 'center',
    justifyContent: 'center'
  },
  customResultFrame: {
    backgroundColor: '#f3eee8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  customResultImage: {
    width: '100%',
    backgroundColor: '#f3eee8'
  },
  customResultState: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20
  },
  customResultStateOverlay: {
    backgroundColor: 'rgba(250, 248, 245, 0.82)'
  },
  customResultIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#faf8f5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  customResultPlaceholder: {
    ...typography.caption,
    color: '#5f5955',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  customActionMessage: {
    ...typography.caption,
    width: '100%',
    marginBottom: 8,
    color: '#5f5955',
    textAlign: 'center'
  },
  customAiPreviewNote: {
    marginHorizontal: 0
  },
  tryOnPair: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 12
  },
  previewBox: {
    flex: 1,
    height: 260,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewBoxWide: {
    margin: 16,
    minHeight: 360,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  previewImage: {
    width: '100%',
    height: '100%'
  },
  resultImage: {
    width: '100%',
    height: 420
  },
  previewPlaceholder: {
    color: '#64748b',
    fontWeight: '700',
    textAlign: 'center'
  },
  customGenerateButton: {
    marginTop: 0,
    width: '100%',
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#111111'
  },
  customGenerateButtonTablet: {
    maxWidth: 500,
    minHeight: 58,
    alignSelf: 'center'
  },
  customActionInlineTablet: {
    width: '100%',
    marginTop: 20,
    alignItems: 'center'
  },
  customActionDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: 'rgba(250, 248, 245, 0.97)'
  },
  debugText: {
    marginHorizontal: 16,
    marginBottom: 10,
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700'
  },
  chatPanel: {
    marginHorizontal: 16,
    gap: 12
  },
  chatBubbleAssistant: {
    alignSelf: 'flex-start',
    maxWidth: '96%',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    maxWidth: '86%',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#111827',
    marginBottom: 8
  },
  chatText: {
    color: '#334155',
    lineHeight: 20,
    fontWeight: '700'
  },
  chatUserText: {
    color: '#fff',
    fontWeight: '700'
  },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 80,
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    flexDirection: 'row',
    gap: 8
  },
  composerInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    fontWeight: '700'
  },
  composerButton: {
    width: 48,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center'
  },
  styleResult: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 8
  },
  styleImages: {
    flexDirection: 'row',
    gap: 8
  },
  styleImageBox: {
    flex: 1,
    height: 190,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center'
  },
  styleImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8
  },
  styleModelBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#ecfdf5',
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '700'
  },
  creditsScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  creditsContent: {
    paddingBottom: 34
  },
  creditsHero: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 18,
    gap: 8
  },
  creditsHeroCopy: {
    gap: 10
  },
  creditsEyebrow: {
    ...typography.label,
    color: '#9B5658',
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase'
  },
  creditsHeroTitle: {
    fontFamily: fontFamilies.logo,
    color: '#211F1D',
    fontSize: 43,
    lineHeight: 51
  },
  creditsBackLink: {
    ...typography.label,
    color: '#9b5658',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  creditsHeroText: {
    ...typography.body,
    color: '#625C56',
    fontSize: 14,
    lineHeight: 26
  },
  creditsBalanceCard: {
    marginTop: 6,
    marginHorizontal: 24,
    minHeight: 148,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#F3EEE8',
    paddingHorizontal: 20,
    paddingVertical: 20
  },
  creditsBalanceIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fffdfc',
    alignItems: 'center',
    justifyContent: 'center'
  },
  creditsBalanceCopy: {
    minWidth: 0
  },
  creditsBalanceLabel: {
    ...typography.label,
    color: '#625C56',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.2,
    textTransform: 'uppercase'
  },
  creditsBalanceHelp: {
    ...typography.caption,
    marginTop: 8,
    color: '#625C56',
    fontSize: 12,
    lineHeight: 24
  },
  creditsBalanceNumber: {
    ...typography.display,
    color: '#211F1D',
    fontSize: 46,
    lineHeight: 55,
    marginTop: 8
  },
  creditsStatePanel: {
    marginHorizontal: 24,
    marginTop: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#FFFFFF',
    gap: 8
  },
  creditsStateText: {
    ...typography.body,
    color: '#625C56',
    fontSize: 13,
    lineHeight: 20
  },
  creditsRetryText: {
    ...typography.label,
    color: '#211F1D',
    fontSize: 13,
    textDecorationLine: 'underline'
  },
  creditsSectionIntro: {
    paddingHorizontal: 24,
    paddingTop: 27,
    gap: 5
  },
  creditsSectionHeading: {
    fontFamily: fontFamilies.logo,
    color: '#211F1D',
    fontSize: 29,
    lineHeight: 36
  },
  creditsSectionDescription: {
    ...typography.body,
    color: '#625C56',
    fontSize: 13,
    lineHeight: 24
  },
  creditsSubscriptionStatus: {
    marginHorizontal: 24,
    marginTop: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    gap: 5
  },
  creditsSubscriptionStatusText: {
    ...typography.body,
    color: '#211F1D',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600'
  },
  creditsLoader: {
    marginTop: 8
  },
  creditChoiceGrid: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 14
  },
  creditResponsiveGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch'
  },
  creditGridCardHalf: {
    width: '48.8%'
  },
  creditGridCardThird: {
    width: '31.8%'
  },
  creditMandateCard: {
    minHeight: 216,
    paddingHorizontal: 20,
    paddingVertical: 22,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#FFFFFF',
    overflow: 'visible',
    gap: 10
  },
  creditMandateCardSelected: {
    borderColor: '#211F1D',
    borderWidth: 1.3
  },
  creditSelectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 22
  },
  creditSelectedPill: {
    ...typography.caption,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#1f1d1c',
    color: '#ffffff',
    fontSize: 9,
    lineHeight: 17,
    fontWeight: '700'
  },
  creditActivePill: {
    ...typography.caption,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#e8f6ef',
    color: '#0f766e',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700'
  },
  creditCardKicker: {
    ...typography.label,
    color: '#b26a6d',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  creditMandateTitle: {
    ...typography.display,
    color: '#211F1D',
    fontSize: 31,
    lineHeight: 46
  },
  creditMandateSub: {
    ...typography.body,
    color: '#242020',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700'
  },
  creditMutedText: {
    ...typography.caption,
    color: '#9d9693',
    fontSize: 12,
    lineHeight: 17
  },
  creditCapsText: {
    ...typography.label,
    color: '#8f8582',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  creditCardDescription: {
    ...typography.smallBody,
    marginTop: 6,
    color: '#5e5956',
    fontSize: 13,
    lineHeight: 24
  },
  creditAddMoreCard: {
    minHeight: 176,
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#FFFFFF',
    gap: 10
  },
  creditAddMoreTitle: {
    ...typography.display,
    color: '#1c1919',
    fontSize: 38,
    lineHeight: 53
  },
  topUpGrid: {
    paddingHorizontal: 24,
    paddingTop: 20,
    gap: 14
  },
  topUpCreditCard: {
    minHeight: 132,
    paddingHorizontal: 18,
    paddingVertical: 17,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#FFFFFF',
    gap: 5,
    overflow: 'visible'
  },
  creditPackageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8
  },
  creditPackageQuantity: {
    ...typography.body,
    color: '#211F1D',
    fontSize: 21,
    lineHeight: 28,
    fontWeight: '700'
  },
  topUpBestValue: {
    ...typography.caption,
    position: 'absolute',
    top: 0,
    right: 16,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#a45d5f',
    color: '#ffffff',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700'
  },
  topUpPrice: {
    ...typography.body,
    color: '#211F1D',
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '700'
  },
  creditsDivider: {
    marginHorizontal: 24,
    marginTop: 34,
    height: 1,
    backgroundColor: '#e1d8d5'
  },
  creditsSectionLabel: {
    ...typography.h2,
    marginTop: 34,
    paddingHorizontal: 24,
    color: '#1c1919',
    fontSize: 30,
    lineHeight: 37
  },
  creditTierStack: {
    marginTop: 24,
    paddingHorizontal: 24,
    gap: 14
  },
  creditTierCard: {
    minHeight: 168,
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c9c9c9',
    backgroundColor: '#fffdfc'
  },
  creditTierCardSelected: {
    borderColor: '#111111',
    borderWidth: 1.3
  },
  creditTierBadge: {
    ...typography.caption,
    position: 'absolute',
    top: -11,
    left: 23,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#060606',
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700'
  },
  creditTierTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14
  },
  creditTierName: {
    ...typography.productTitle,
    fontSize: 14,
    color: '#1b1717'
  },
  creditTierPrice: {
    ...typography.price,
    color: '#111111',
    fontSize: 16,
    fontWeight: '500'
  },
  creditAmountRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  creditAmount: {
    ...typography.display,
    fontSize: 29,
    lineHeight: 34,
    color: '#9b5658'
  },
  creditAmountLabel: {
    ...typography.label,
    paddingBottom: 3,
    color: '#9b5658',
    fontSize: 15,
    letterSpacing: 0,
    fontWeight: '600'
  },
  creditTierDescription: {
    marginTop: 24,
    color: '#4d4a4a',
    fontSize: 13,
    lineHeight: 18
  },
  paymentMethodCard: {
    marginTop: 18,
    marginHorizontal: 24,
    minHeight: 64,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#FFFFFF',
    alignItems: 'stretch',
    gap: 10
  },
  paymentMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0
  },
  paymentMethodCopy: {
    flex: 1,
    minWidth: 0
  },
  phonePeMark: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#6739b7',
    alignItems: 'center',
    justifyContent: 'center'
  },
  phonePeMarkText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800'
  },
  appStoreMark: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1f1d1c',
    alignItems: 'center',
    justifyContent: 'center'
  },
  paymentMethodText: {
    ...typography.body,
    color: '#242020',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700'
  },
  paymentMethodSubText: {
    ...typography.caption,
    marginTop: 2,
    color: '#7d7572',
    fontSize: 12,
    lineHeight: 16
  },
  paymentSelectedText: {
    ...typography.caption,
    color: '#a45d5f',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    alignSelf: 'stretch'
  },
  addPaymentCard: {
    marginTop: 10,
    marginHorizontal: 36,
    height: 54,
    paddingHorizontal: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#c9c2c0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11
  },
  addPaymentText: {
    color: '#55514f',
    fontSize: 15
  },
  orderSummaryCard: {
    marginTop: 34,
    marginHorizontal: 24,
    paddingHorizontal: 22,
    paddingVertical: 26,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#FFFFFF',
    gap: 0
  },
  orderSummaryTitle: {
    ...typography.h2,
    marginBottom: 6,
    fontSize: 30,
    lineHeight: 36,
    color: '#1d1919'
  },
  orderSummaryKicker: {
    ...typography.label,
    marginBottom: 16,
    color: '#b26a6d',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  paymentSummaryLine: {
    minHeight: 54,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#eee5e2',
    gap: 4
  },
  paymentSummaryLabel: {
    ...typography.body,
    color: '#8b8582',
    fontSize: 14,
    lineHeight: 20,
    flexShrink: 1
  },
  paymentSummaryValue: {
    ...typography.body,
    color: '#2e2927',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'left'
  },
  paymentSummaryValueStrong: {
    fontWeight: '700'
  },
  orderSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16
  },
  orderSummaryText: {
    ...typography.body,
    color: '#474343',
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1
  },
  orderSummaryDivider: {
    height: 1,
    backgroundColor: '#e5dcda'
  },
  orderSummaryTotalRow: {
    marginTop: 20,
    gap: 7
  },
  totalAmountLabel: {
    ...typography.label,
    color: '#111111',
    fontSize: 15,
    letterSpacing: 0,
    fontWeight: '500',
    flexShrink: 1
  },
  totalAmountValue: {
    ...typography.h3,
    color: '#111111',
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '700',
    flexShrink: 1
  },
  cancelMandateButton: {
    marginTop: 16,
    marginHorizontal: 24,
    height: 45,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d7c7c4',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffdfc'
  },
  cancelMandateText: {
    ...typography.label,
    color: '#9b5658',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0
  },
  creditsMessage: {
    ...typography.caption,
    marginTop: 16,
    marginHorizontal: 24,
    color: '#55514f',
    fontSize: 13,
    lineHeight: 18
  },
  secureCheckoutButton: {
    marginTop: 28,
    marginHorizontal: 24,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52
  },
  secureCheckoutText: {
    color: '#ffffff',
    fontSize: 15,
    letterSpacing: 0,
    fontWeight: '600'
  },
  verifyPaymentButton: {
    marginTop: 12,
    marginHorizontal: 24,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d9c8c5',
    backgroundColor: '#fffdfc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  verifyPaymentText: {
    ...typography.label,
    color: '#5e3335',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0
  },
  appleStoreActionRow: {
    marginTop: 12,
    marginHorizontal: 24,
    flexDirection: 'row',
    gap: 10
  },
  appleStoreActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d8c7c2',
    backgroundColor: '#fffdfc',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8
  },
  creditsHistorySection: {
    marginTop: 36,
    marginHorizontal: 24,
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#FFFFFF',
    gap: 9
  },
  creditsHistoryHeading: {
    fontFamily: fontFamilies.logo,
    color: '#211F1D',
    fontSize: 28,
    lineHeight: 35
  },
  creditsHistoryRow: {
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: '#E8E1DA',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  creditsHistoryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  creditsHistoryTitle: {
    ...typography.body,
    color: '#211F1D',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600'
  },
  creditsHistoryMeta: {
    ...typography.caption,
    color: '#625C56',
    fontSize: 12,
    lineHeight: 18
  },
  creditsHistoryAmount: {
    ...typography.body,
    color: '#211F1D',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700'
  },
  creditsFooterLinks: {
    marginTop: 16,
    paddingHorizontal: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10
  },
  creditsFooterLink: {
    color: '#9b9391',
    fontSize: 9,
    fontWeight: '600'
  },
  balanceCard: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center'
  },
  balanceNumber: {
    color: '#fff',
    fontSize: 44,
    fontWeight: '700'
  },
  balanceLabel: {
    color: '#ccfbf1',
    fontWeight: '700'
  },
  tokenPack: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  subscriptionPack: {
    flexDirection: 'column'
  },
  planHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  activePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#dcfce7',
    color: '#166534',
    fontSize: 12,
    fontWeight: '700'
  },
  tokenName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827'
  },
  tokenRight: {
    alignItems: 'flex-end'
  },
  tokenAmount: {
    color: '#0f766e',
    fontWeight: '700'
  },
  generationPreviewCard: {
    marginHorizontal: 18,
    marginTop: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5dcd9',
    backgroundColor: '#fffdfc',
    shadowColor: '#2a211d',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 2
  },
  generationPreviewCardTablet: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: 0,
    marginTop: 0,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 22,
    borderRadius: 14
  },
  generationPreviewHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14
  },
  generationPreviewTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  generationPreviewTitle: {
    ...typography.h3,
    color: '#2b2321',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '700'
  },
  generationPreviewSubtitle: {
    ...typography.caption,
    marginTop: 4,
    color: '#7c7470',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  generationPreviewIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f5efec',
    alignItems: 'center',
    justifyContent: 'center'
  },
  generationPreviewThumbRow: {
    minHeight: 82,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  generationPreviewThumb: {
    width: 58,
    height: 76,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#efe8e4'
  },
  generationPreviewImage: {
    width: '100%',
    height: '100%'
  },
  generationPreviewEmpty: {
    flex: 1,
    minHeight: 76,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#e2d8d2',
    backgroundColor: '#fbf7f6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14
  },
  generationPreviewEmptyText: {
    ...typography.caption,
    color: '#7c7470',
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700'
  },
  generationPreviewDivider: {
    marginTop: 14,
    height: 1,
    backgroundColor: '#efe4df'
  },
  generationPreviewFooter: {
    minHeight: 42,
    paddingTop: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  generationPreviewCount: {
    ...typography.caption,
    flex: 1,
    minWidth: 0,
    color: '#9b928d',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700'
  },
  generationPreviewButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ded3ce',
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fffdfc'
  },
  generationPreviewButtonText: {
    ...typography.caption,
    color: '#2b2321',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700'
  },
  generationHistoryScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  generationHistoryContent: {
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: bottomNavigationHeight + screenBottomInset
  },
  generationHistoryHeader: {
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14
  },
  generationHistoryTitle: {
    ...typography.display,
    color: '#2b2321',
    fontSize: 32,
    lineHeight: 38
  },
  generationHistorySubtitle: {
    ...typography.caption,
    marginTop: 5,
    color: '#7c7470',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  generationHistoryTotal: {
    ...typography.caption,
    marginTop: 8,
    color: '#9b928d',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700'
  },
  generationHistoryRefresh: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fffdfc',
    alignItems: 'center',
    justifyContent: 'center'
  },
  generationGridRow: {
    gap: 14
  },
  generationGridCard: {
    flex: 1,
    flexBasis: '48%',
    maxWidth: '48%',
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9dfda',
    overflow: 'hidden',
    backgroundColor: '#fffdfc'
  },
  generationGridImageWrap: {
    position: 'relative',
    backgroundColor: '#efe8e4'
  },
  generationGridImage: {
    width: '100%',
    aspectRatio: 0.76
  },
  generationGridBadge: {
    position: 'absolute',
    left: 9,
    top: 9,
    maxWidth: '82%',
    minHeight: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 253, 252, 0.92)',
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center'
  },
  generationGridBadgeText: {
    ...typography.caption,
    color: '#9b5658',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  generationGridCopy: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 11
  },
  generationGridTitle: {
    ...typography.productTitle,
    color: '#2b2321',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800'
  },
  generationGridMeta: {
    ...typography.caption,
    marginTop: 5,
    color: '#7c7470',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700'
  },
  generationGridFooter: {
    marginTop: 9,
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  generationGridDate: {
    ...typography.caption,
    flex: 1,
    color: '#9b928d',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700'
  },
  generationGridProductButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#eaded9',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fbf7f6'
  },
  generationGridSkeleton: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14
  },
  generationGridSkeletonLine: {
    width: '78%',
    height: 10,
    borderRadius: 5,
    marginTop: 10,
    marginHorizontal: 10
  },
  generationGridSkeletonShort: {
    width: '48%',
    height: 9,
    borderRadius: 5,
    marginTop: 8,
    marginHorizontal: 10,
    marginBottom: 12
  },
  generationHistoryFootnote: {
    ...typography.caption,
    marginTop: 4,
    color: '#7c7470',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700'
  },
  profileScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  profileContent: {
    paddingBottom: bottomNavigationHeight + screenBottomInset + 24
  },
  profileContentTablet: {
    paddingHorizontal: 24,
    paddingBottom: bottomNavigationHeight + screenBottomInset + 64
  },
  profileLayout: {
    width: '100%'
  },
  profileLayoutTablet: {
    maxWidth: 1180,
    alignSelf: 'center'
  },
  profileIntro: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22
  },
  profileIntroTablet: {
    paddingHorizontal: 18,
    paddingTop: 28,
    paddingBottom: 20
  },
  profileTopGridTablet: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 18,
    paddingHorizontal: 18
  },
  profileMediaGridTablet: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 18,
    paddingHorizontal: 18,
    marginTop: 20
  },
  profilePageTitle: {
    fontFamily: fontFamilies.logo,
    fontSize: 32,
    lineHeight: 42,
    color: '#211F1D'
  },
  profilePageSubtitle: {
    ...typography.smallBody,
    marginTop: 2,
    color: '#625C56'
  },
  profileTopBar: {
    height: 58,
    paddingHorizontal: 34,
    borderBottomWidth: 1,
    borderBottomColor: '#ebe3e1',
    backgroundColor: '#fbf7f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  profileTopIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileTopBrand: {
    ...typography.h2,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 25,
    color: '#111111'
  },
  profileHero: {
    marginHorizontal: 18,
    paddingVertical: 22,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    borderRadius: 12,
    backgroundColor: '#fffdfb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18
  },
  profileHeroTablet: {
    flex: 1,
    minWidth: 0,
    minHeight: 250,
    marginHorizontal: 0,
    paddingHorizontal: 24,
    paddingVertical: 28
  },
  profilePhotoWrap: {
    width: 88,
    height: 88,
    position: 'relative'
  },
  profilePhotoWrapTablet: {
    width: 112,
    height: 112
  },
  profilePhotoFrame: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
    backgroundColor: '#F3EEE8',
    borderWidth: 2,
    borderColor: '#E8E1DA'
  },
  profilePhotoFrameTablet: {
    width: 112,
    height: 112,
    borderRadius: 56
  },
  profilePhoto: {
    width: '100%',
    height: '100%'
  },
  profileFaceImage: {
    transform: [{ scale: 1.04 }]
  },
  profileAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileAvatarInitials: {
    fontSize: 24,
    lineHeight: 30
  },
  profilePhotoAction: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#050505',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileIdentityCopy: {
    flex: 1
  },
  profileName: {
    ...typography.h3,
    color: '#211F1D',
    lineHeight: 30
  },
  profileNameTablet: {
    fontSize: 26,
    lineHeight: 34
  },
  profileRole: {
    ...typography.caption,
    marginTop: 7,
    color: '#9b5658',
    fontSize: 12,
    letterSpacing: 0,
    fontWeight: '700'
  },
  profileBio: {
    ...typography.caption,
    marginTop: 5,
    color: '#625C56',
    fontSize: 12,
    lineHeight: 22
  },
  profileEditButton: {
    marginTop: 13,
    minHeight: 44,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  profileEditText: {
    ...typography.caption,
    color: '#211F1D',
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline'
  },
  profileEditOverlay: {
    flex: 1,
    justifyContent: 'flex-end'
  },
  profileEditOverlayTablet: {
    justifyContent: 'center'
  },
  profileEditBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20, 16, 14, 0.42)'
  },
  profileEditSheet: {
    marginHorizontal: 10,
    marginBottom: Math.max(screenBottomInset, 12),
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fffdfb',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -8 },
    elevation: 8
  },
  profileEditSheetTablet: {
    width: '88%',
    maxWidth: 560,
    alignSelf: 'center',
    marginBottom: 0,
    borderRadius: 18
  },
  profileDeleteSheet: {
    maxHeight: '90%',
    borderColor: '#edd1ce',
    backgroundColor: '#fffafa'
  },
  profileEditHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ded3ce',
    marginBottom: 14
  },
  profileEditHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16
  },
  profileEditHeadingCopy: {
    flex: 1,
    minWidth: 0
  },
  profileEditDismissButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    flexShrink: 0
  },
  profileEditSheetTitle: {
    ...typography.h3,
    color: '#2b2321',
    fontSize: 19,
    lineHeight: 25
  },
  profileEditSheetSub: {
    ...typography.caption,
    marginTop: 5,
    maxWidth: 270,
    color: '#6f6864',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500'
  },
  profileDangerEyebrow: {
    ...typography.caption,
    marginBottom: 5,
    color: '#9b3f3b',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  profileEditClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5efec',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileEditLabel: {
    ...typography.caption,
    marginTop: 17,
    marginBottom: 8,
    color: '#5d5754',
    fontSize: 12,
    fontWeight: '700'
  },
  profileEditInput: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ded3ce',
    backgroundColor: '#fbf7f6',
    paddingHorizontal: 13,
    color: '#211c1a',
    fontSize: 15,
    fontWeight: '700'
  },
  profileGenderGrid: {
    flexDirection: 'row',
    gap: 8
  },
  profileGenderOption: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ded3ce',
    backgroundColor: '#fbf7f6',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8
  },
  profileGenderOptionActive: {
    borderColor: '#050505',
    backgroundColor: '#050505'
  },
  profileGenderText: {
    ...typography.caption,
    color: '#5d5754',
    fontSize: 12,
    fontWeight: '700'
  },
  profileGenderTextActive: {
    color: '#ffffff'
  },
  profileEditMessage: {
    ...typography.caption,
    marginTop: 12,
    color: '#5d5754',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  profileEditActions: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 10
  },
  profileDeleteList: {
    marginTop: 17,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f0dedb',
    backgroundColor: '#fffdfb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8
  },
  profileDeleteListItem: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  profileDeleteListText: {
    ...typography.caption,
    flex: 1,
    color: '#4e4742',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  profileDeleteWarning: {
    ...typography.caption,
    marginTop: 12,
    color: '#9b3f3b',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800'
  },
  profileDeleteFinalButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: '#9b3f3b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  profileDeleteFinalText: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16
  },
  profilePasswordNotice: {
    marginTop: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fbf7f6',
    paddingHorizontal: 13,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9
  },
  profilePasswordNoticeText: {
    ...typography.caption,
    flex: 1,
    color: '#5d5754',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  profilePasswordPrimaryButton: {
    flex: 0,
    marginTop: 18,
    width: '100%'
  },
  profileEditCancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ded3ce',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileEditCancelText: {
    ...typography.caption,
    color: '#5d5754',
    fontSize: 13,
    fontWeight: '700'
  },
  profileEditSaveButton: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileEditSaveText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  profileCreditsCard: {
    marginHorizontal: 18,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#F3EEE8'
  },
  profileCreditsCardTablet: {
    flex: 1,
    minWidth: 0,
    minHeight: 250,
    marginHorizontal: 0,
    marginTop: 0,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 22
  },
  profileCreditsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  profileCreditsLabel: {
    ...typography.caption,
    color: '#747071',
    fontSize: 12,
    fontWeight: '700'
  },
  profileCreditsAmountRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  profileCreditsAmount: {
    ...typography.h3,
    color: '#2b2321',
    fontSize: 22,
    lineHeight: 28
  },
  profileCreditsTotal: {
    ...typography.caption,
    paddingBottom: 3,
    color: '#5d5754',
    fontSize: 12,
    fontWeight: '700'
  },
  profileCreditTrack: {
    marginTop: 16,
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#e9e3e1'
  },
  profileCreditFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#9b5658'
  },
  profileBuyButton: {
    marginTop: 22,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#9b5658',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileBuyText: {
    ...typography.caption,
    color: '#9b5658',
    fontSize: 14,
    letterSpacing: 0,
    fontWeight: '700'
  },
  profileCreditHistory: {
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eaded9'
  },
  profileCreditHistoryHead: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  profileCreditHeadSkeleton: {
    width: 54,
    height: 12,
    borderRadius: 6
  },
  profileCreditHistoryTitle: {
    ...typography.productTitle,
    color: '#2b2321',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700'
  },
  profileCreditHistoryAction: {
    minHeight: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fffdfb',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileCreditHistoryActionText: {
    ...typography.caption,
    color: '#9b5658',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800'
  },
  profileCreditHistoryHeaderRow: {
    marginTop: 12,
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#efe4df'
  },
  profileCreditHistoryRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3e9e5'
  },
  profileCreditEventCopy: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8
  },
  profileCreditEventTitle: {
    ...typography.smallBody,
    color: '#211F1D',
    fontWeight: '700',
    lineHeight: 24
  },
  profileCreditEventMeta: {
    ...typography.caption,
    color: '#625C56',
    marginTop: 2,
    lineHeight: 21
  },
  profileCreditColumnLabel: {
    ...typography.caption,
    color: '#8a817d',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  profileCreditCell: {
    ...typography.caption,
    color: '#5d5754',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    paddingRight: 6
  },
  profileCreditActionColumn: {
    flex: 1.05
  },
  profileCreditProductColumn: {
    flex: 1.25
  },
  profileCreditDateColumn: {
    width: 72
  },
  profileCreditTokenColumn: {
    width: 48,
    textAlign: 'right'
  },
  profileCreditTokenText: {
    color: '#9b5658',
    fontWeight: '700'
  },
  profileCreditAddedText: {
    color: '#0f766e',
    fontWeight: '700'
  },
  profileCreditSkeletonCell: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#efe6e1'
  },
  profileCreditEmptyText: {
    ...typography.caption,
    marginTop: 12,
    color: '#77716f',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700'
  },
  profileSection: {
    marginTop: 36,
    paddingHorizontal: 18
  },
  profilePortraitSectionTablet: {
    flex: 1,
    minWidth: 0,
    marginTop: 0,
    paddingHorizontal: 0
  },
  profileSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  profileSectionTitle: {
    fontFamily: fontFamilies.logo,
    color: '#211F1D',
    fontSize: 25,
    lineHeight: 34
  },
  profilePhotoCount: {
    ...typography.caption,
    color: '#5d5754',
    fontSize: 12,
    fontWeight: '700'
  },
  profilePortraitPanel: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 12
  },
  profilePortraitFeatured: {
    width: 122,
    height: 172,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#eee8e3'
  },
  profilePortraitFeaturedTablet: {
    width: 142,
    height: 200
  },
  profilePortraitFeaturedImage: {
    width: '100%',
    height: '100%'
  },
  profilePortraitBadge: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 253, 251, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  profilePortraitBadgeText: {
    ...typography.caption,
    color: '#2b2321',
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  profilePortraitEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#f2ece9'
  },
  profilePortraitEmptyText: {
    ...typography.caption,
    marginTop: 8,
    color: '#77716f',
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700'
  },
  profileUploadPortraitLarge: {
    flex: 1,
    minWidth: 0,
    height: 172,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#c6c4c2',
    backgroundColor: '#fffdfb',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16
  },
  profileUploadPortraitTablet: {
    height: 200,
    borderRadius: 12
  },
  profileUploadPortraitIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f5efec',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileUploadPortraitText: {
    ...typography.caption,
    color: '#77716f',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800'
  },
  profileUploadPortraitHelp: {
    ...typography.caption,
    color: '#8d8682',
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600'
  },
  profileSavePhotoButton: {
    marginTop: 14,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileSavePhotoText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  profileInlineMessage: {
    ...typography.caption,
    marginTop: 12,
    color: '#5d5754',
    fontSize: 12,
    lineHeight: 18
  },
  profileQuickOptions: {
    marginTop: 34,
    marginHorizontal: 18,
    gap: 12
  },
  profileQuickOptionsTablet: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 14
  },
  profileQuickCard: {
    minHeight: 68,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#fffdfc',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  profileQuickCardTablet: {
    flex: 1,
    minWidth: 0,
    minHeight: 88,
    paddingHorizontal: 16
  },
  profileSettingsGridTablet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 18,
    paddingHorizontal: 18,
    marginTop: 36
  },
  profileSettingsSectionTablet: {
    flex: 1,
    minWidth: 0,
    marginTop: 0,
    paddingHorizontal: 0
  },
  profileQuickIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F3EEE8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileQuickCopy: {
    flex: 1
  },
  profileQuickTitle: {
    ...typography.productTitle,
    color: '#2b2321',
    fontSize: 15,
    fontWeight: '700'
  },
  profileQuickSub: {
    ...typography.caption,
    marginTop: 4,
    color: '#77716f',
    fontSize: 12,
    fontWeight: '600'
  },
  profilePaymentCard: {
    marginTop: 16,
    minHeight: 74,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#fffdfb',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18
  },
  profileVisaBadge: {
    width: 45,
    height: 27,
    borderRadius: 4,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profilePaymentIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F3EEE8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileVisaText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700'
  },
  profilePaymentCopy: {
    flex: 1
  },
  profilePaymentTitle: {
    ...typography.productTitle,
    color: '#2b2321',
    fontSize: 15,
    fontWeight: '700'
  },
  profilePaymentSub: {
    ...typography.caption,
    marginTop: 4,
    color: '#5d5754',
    fontSize: 12,
    fontWeight: '600'
  },
  profileSettingsList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8E1DA'
  },
  profileSettingsRow: {
    minHeight: 68,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E1DA',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  profileSettingsIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3EEE8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13
  },
  profileSettingsCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
    paddingVertical: 10
  },
  profileSettingsLabel: {
    ...typography.smallBody,
    color: '#5d5754',
    fontSize: 14,
    fontWeight: '700'
  },
  profileSettingsValue: {
    ...typography.smallBody,
    marginTop: 4,
    color: '#211F1D',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 22
  },
  profileLogoutButton: {
    marginTop: 58,
    marginHorizontal: 35,
    height: 47,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#efc8ca',
    backgroundColor: '#fff0f0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileLogoutText: {
    ...typography.caption,
    color: '#c85664',
    fontSize: 13,
    letterSpacing: 0,
    fontWeight: '700'
  },
  profileDeleteButton: {
    marginTop: 12,
    marginHorizontal: 35,
    height: 47,
    borderRadius: 8,
    backgroundColor: '#b91c1c',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileAccountActionTablet: {
    width: '100%',
    maxWidth: 460,
    minHeight: 52,
    marginHorizontal: 0,
    alignSelf: 'center'
  },
  profileDeleteText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 13,
    letterSpacing: 0,
    fontWeight: '700'
  },
  collectionsScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  collectionsContent: {
    paddingBottom: bottomNavigationHeight + screenBottomInset + 28
  },
  collectionsHero: {
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 18
  },
  collectionsEyebrow: {
    ...typography.label,
    color: '#9b5658',
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0,
    textTransform: 'uppercase'
  },
  collectionsTitle: {
    ...typography.display,
    marginTop: 8,
    color: '#171414',
    fontSize: 42,
    lineHeight: 47
  },
  collectionsText: {
    ...typography.smallBody,
    marginTop: 10,
    color: '#6f6967',
    fontSize: 14,
    lineHeight: 20
  },
  collectionCardsTrack: {
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 12
  },
  collectionSummaryCard: {
    width: 156,
    minHeight: 172,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5dcd9',
    backgroundColor: '#fffdfc',
    padding: 12
  },
  collectionSummaryCardActive: {
    borderColor: '#9b5658',
    backgroundColor: '#fff5f3'
  },
  collectionSummaryThumbs: {
    height: 92,
    flexDirection: 'row',
    alignItems: 'center'
  },
  collectionSummaryThumb: {
    width: 58,
    height: 82,
    marginRight: -18,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fffdfc',
    backgroundColor: '#eee8e3'
  },
  collectionSummaryEmptyThumb: {
    width: 72,
    height: 82,
    borderRadius: 8,
    backgroundColor: '#f4eeee',
    alignItems: 'center',
    justifyContent: 'center'
  },
  collectionSummaryTitle: {
    ...typography.productTitle,
    marginTop: 10,
    color: '#2b2321',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700'
  },
  collectionSummaryMeta: {
    ...typography.caption,
    marginTop: 3,
    color: '#77716f',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700'
  },
  collectionsEmptyWrap: {
    paddingHorizontal: 24,
    paddingTop: 8
  },
  collectionDetailBlock: {
    marginTop: 28,
    paddingHorizontal: 24
  },
  collectionDetailHead: {
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14
  },
  collectionDetailTitle: {
    ...typography.h2,
    color: '#2b2321',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700'
  },
  collectionDetailMeta: {
    ...typography.caption,
    marginTop: 3,
    color: '#77716f',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  collectionAddMoreButton: {
    minHeight: 34,
    borderRadius: 17,
    backgroundColor: '#eee9e7',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  collectionAddMoreText: {
    ...typography.caption,
    color: '#111111',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800'
  },
  collectionProductGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 24
  },
  collectionSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(23, 20, 19, 0.36)'
  },
  collectionSheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: '#fbf7f6',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: screenBottomInset + 18
  },
  collectionSheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d9cfcb',
    marginBottom: 16
  },
  collectionSheetHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14
  },
  collectionSheetTitle: {
    ...typography.h2,
    color: '#2b2321',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700'
  },
  collectionSheetSub: {
    ...typography.caption,
    marginTop: 4,
    color: '#77716f',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600'
  },
  collectionSheetClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f0e9e6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  collectionNameInput: {
    ...typography.body,
    marginTop: 18,
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5dcd9',
    backgroundColor: '#fffdfc',
    paddingHorizontal: 14,
    color: '#1f1b1a',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700'
  },
  collectionPickerHead: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  collectionPickerTitle: {
    ...typography.caption,
    color: '#2b2321',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  collectionPickerCount: {
    ...typography.caption,
    color: '#9b5658',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  collectionPickerList: {
    maxHeight: 320
  },
  collectionPickerContent: {
    gap: 9,
    paddingBottom: 6
  },
  collectionPickerItem: {
    minHeight: 78,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5dcd9',
    backgroundColor: '#fffdfc',
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  collectionPickerItemSelected: {
    borderColor: '#9b5658',
    backgroundColor: '#fff5f3'
  },
  collectionPickerImage: {
    width: 54,
    height: 64,
    borderRadius: 7,
    backgroundColor: '#eee8e3'
  },
  collectionPickerCopy: {
    flex: 1,
    minWidth: 0
  },
  collectionPickerBrand: {
    ...typography.caption,
    color: '#77716f',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800'
  },
  collectionPickerName: {
    ...typography.smallBody,
    marginTop: 3,
    color: '#1e1a19',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600'
  },
  collectionPickerCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9cfcb',
    alignItems: 'center',
    justifyContent: 'center'
  },
  collectionPickerCheckSelected: {
    backgroundColor: '#111111',
    borderColor: '#111111'
  },
  collectionCreateSubmit: {
    marginTop: 16,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center'
  },
  collectionCreateSubmitText: {
    ...typography.button,
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '800'
  },
  wishlistScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  wishlistContent: {
    paddingBottom: screenBottomInset
  },
  wishlistTopBar: {
    height: 58,
    paddingHorizontal: 34,
    borderBottomWidth: 1,
    borderBottomColor: '#ebe3e1',
    backgroundColor: '#fbf7f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  wishlistTopIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  wishlistBrand: {
    ...typography.h3,
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 22,
    color: '#2b2321'
  },
  wishlistTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  wishlistBody: {
    paddingHorizontal: 18,
    paddingTop: 20
  },
  wishlistEyebrow: {
    ...typography.label,
    color: '#9B5658',
    fontSize: 10,
    letterSpacing: 1.4,
    marginBottom: 7
  },
  wishlistTitle: {
    fontFamily: fontFamilies.logo,
    color: '#211F1D',
    fontSize: 32,
    lineHeight: 42
  },
  wishlistSubtitle: {
    ...typography.body,
    color: '#625C56',
    lineHeight: 26,
    marginTop: 3
  },
  wishlistCount: {
    ...typography.caption,
    color: '#625C56',
    marginTop: 9
  },
  wishlistActionRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  wishlistCreateButton: {
    minHeight: 31,
    borderRadius: 16,
    backgroundColor: '#050505',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  wishlistCreateText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  wishlistShareButton: {
    minHeight: 31,
    borderRadius: 16,
    backgroundColor: '#eee9e7',
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7
  },
  wishlistShareText: {
    ...typography.caption,
    color: '#111111',
    fontSize: 12,
    fontWeight: '700'
  },
  wishlistTabs: {
    paddingTop: 25,
    gap: 22
  },
  wishlistTab: {
    minHeight: 22,
    flexShrink: 0,
    justifyContent: 'center'
  },
  wishlistTabText: {
    ...typography.smallBody,
    color: '#4b4644',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 0,
    letterSpacing: 0
  },
  wishlistTabTextActive: {
    color: '#111111'
  },
  wishlistSortRow: {
    marginTop: 18,
    paddingBottom: 19,
    borderTopWidth: 1,
    borderTopColor: '#eee7e4',
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  wishlistSortText: {
    ...typography.caption,
    color: '#625C56',
    fontSize: 12,
    flex: 1,
    minWidth: 0,
    paddingRight: 8
  },
  wishlistSortStrong: {
    color: '#3f3937'
  },
  wishlistViewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  wishlistViewButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent'
  },
  wishlistViewButtonActive: {
    backgroundColor: '#111111'
  },
  wishlistSortMenu: {
    marginTop: -15,
    marginBottom: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eadfda',
    backgroundColor: '#fffdfc',
    padding: 6,
    gap: 5,
    shadowColor: '#2a211d',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4
  },
  wishlistSortOption: {
    minHeight: 38,
    borderRadius: 7,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  wishlistSortOptionActive: {
    backgroundColor: '#111111'
  },
  wishlistSortOptionText: {
    ...typography.caption,
    color: '#4b4644',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  wishlistSortOptionTextActive: {
    color: '#ffffff'
  },
  wishlistGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 24
  },
  wishlistList: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
    rowGap: 14
  },
  wishlistProductCard: {
    width: '48%',
    minWidth: 0
  },
  wishlistProductCardCompact: {
    width: '31%'
  },
  wishlistProductCardList: {
    width: '100%',
    minHeight: 136,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee7e4',
    backgroundColor: '#fffdfc',
    padding: 10,
    flexDirection: 'row',
    gap: 13
  },
  wishlistProductImageWrap: {
    width: '100%',
    aspectRatio: productImageAspectRatio,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F3EEE8'
  },
  wishlistProductImageWrapList: {
    width: 92,
    height: 122,
    aspectRatio: undefined,
    flexShrink: 0
  },
  wishlistProductImage: {
    width: '100%',
    height: '100%'
  },
  wishlistHeartButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wishlistProductCopyList: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2
  },
  wishlistProductBrand: {
    ...typography.caption,
    marginTop: 12,
    color: '#625C56',
    fontSize: 12,
    letterSpacing: 0,
    fontWeight: '700'
  },
  wishlistProductBrandList: {
    marginTop: 0
  },
  wishlistProductBrandCompact: {
    fontSize: 10,
    lineHeight: 13
  },
  wishlistProductName: {
    ...typography.smallBody,
    marginTop: 4,
    minHeight: 40,
    color: '#211F1D',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500'
  },
  wishlistProductNameCompact: {
    minHeight: 34,
    fontSize: 11,
    lineHeight: 14
  },
  wishlistProductNameList: {
    minHeight: 0,
    lineHeight: 22
  },
  wishlistProductPrice: {
    ...typography.price,
    marginTop: 4,
    color: '#211F1D',
    fontSize: 15,
    fontWeight: '700'
  },
  wishlistProductPriceCompact: {
    fontSize: 12,
    lineHeight: 15
  },
  wishlistSizeRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  wishlistSizeChip: {
    ...typography.caption,
    minWidth: 24,
    height: 22,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d9d2ce',
    color: '#4b4644',
    textAlign: 'center',
    paddingTop: 4,
    fontSize: 10,
    fontWeight: '700'
  },
  wishlistSizeChipActive: {
    backgroundColor: '#050505',
    borderColor: '#050505',
    color: '#ffffff'
  },
  wishlistMoveButton: {
    marginTop: 12,
    minHeight: 44,
    borderRadius: 7,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wishlistMoveButtonCompact: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 6
  },
  wishlistMoveButtonList: {
    alignSelf: 'flex-start',
    minWidth: 118,
    paddingHorizontal: 16
  },
  wishlistMoveText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  wishlistEmptyState: {
    width: '100%',
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#FFFDFC',
    alignItems: 'center'
  },
  wishlistStatusPanel: {
    minHeight: 180,
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#FFFDFC',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wishlistStatusText: {
    ...typography.body,
    marginTop: 12,
    color: '#625C56',
    textAlign: 'center'
  },
  wishlistEmptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#F3EEE8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wishlistEmptyTitle: {
    fontFamily: fontFamilies.logo,
    fontSize: 26,
    lineHeight: 34,
    marginTop: 19,
    color: '#211F1D',
    textAlign: 'center'
  },
  wishlistEmptyText: {
    ...typography.body,
    marginTop: 8,
    color: '#625C56',
    textAlign: 'center'
  },
  wishlistEmptyAction: {
    minHeight: 48,
    marginTop: 23,
    paddingHorizontal: 19,
    borderRadius: 8,
    backgroundColor: '#111111',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  wishlistEmptyActionText: {
    ...typography.button,
    color: '#FFFFFF',
    fontSize: 14
  },
  wishlistProCard: {
    marginTop: 38,
    paddingHorizontal: 20,
    paddingVertical: 21,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E1DA',
    backgroundColor: '#F3EEE8'
  },
  wishlistProBadge: {
    ...typography.caption,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#FFFDFC',
    color: '#625C56',
    fontSize: 9,
    letterSpacing: 0,
    fontWeight: '700'
  },
  wishlistProTitle: {
    fontFamily: fontFamilies.logo,
    marginTop: 13,
    color: '#211F1D',
    fontSize: 24,
    lineHeight: 32
  },
  wishlistProText: {
    ...typography.smallBody,
    marginTop: 12,
    maxWidth: 270,
    color: '#625C56',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500'
  },
  wishlistUpgradeButton: {
    marginTop: 20,
    alignSelf: 'flex-start',
    height: 38,
    borderRadius: 19,
    backgroundColor: '#111111',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  wishlistUpgradeText: {
    ...typography.caption,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  wishlistSectionTitle: {
    ...typography.h2,
    marginTop: 66,
    color: '#2b2321',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600'
  },
  wishlistRecommendedTrack: {
    paddingTop: 25,
    gap: 16,
    paddingRight: 34
  },
  wishlistRecommendedCard: {
    width: 150
  },
  wishlistRecommendedImage: {
    width: '100%',
    aspectRatio: productImageAspectRatio,
    borderRadius: 8,
    backgroundColor: '#eee8e3'
  },
  wishlistRecommendedSkeletonLine: {
    marginTop: 10
  },
  wishlistRecommendedBrand: {
    marginTop: 12,
    color: '#4b4644',
    fontSize: 11,
    letterSpacing: 0,
    fontWeight: '700'
  },
  wishlistRecommendedPrice: {
    marginTop: 3,
    color: '#050505',
    fontSize: 14,
    fontWeight: '700'
  },
  ordersScreen: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  ordersContent: {
    paddingBottom: screenBottomInset
  },
  ordersBody: {
    paddingHorizontal: 35,
    paddingTop: 32,
    gap: 16
  },
  ordersEmptyCard: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5dcd9',
    backgroundColor: '#fffdfc',
    paddingHorizontal: 22,
    paddingVertical: 26,
    alignItems: 'center',
    shadowColor: '#2a211d',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  ordersEmptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f8eeee',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  ordersEmptyTitle: {
    ...typography.h3,
    color: '#211c1a',
    textAlign: 'center'
  },
  ordersEmptyText: {
    ...typography.body,
    marginTop: 8,
    color: '#6f6864',
    textAlign: 'center'
  },
  ordersStartButton: {
    marginTop: 20,
    minHeight: 42,
    borderRadius: 21,
    backgroundColor: '#050505',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ordersStartText: {
    ...typography.button,
    color: '#ffffff'
  },
  ordersPopularSection: {
    marginTop: 30
  },
  ordersPopularTitle: {
    ...typography.h3,
    color: '#211c1a',
    marginBottom: 16
  },
  ordersPopularGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 22
  },
  ordersPopularCard: {
    width: '47%'
  },
  ordersPopularImage: {
    width: '100%',
    aspectRatio: productImageAspectRatio,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: '#eee8e3'
  },
  ordersPopularBrand: {
    ...typography.caption,
    marginTop: 10,
    color: '#8d8682',
    fontWeight: '700'
  },
  ordersPopularName: {
    ...typography.smallBody,
    marginTop: 4,
    color: '#211c1a',
    fontWeight: '600'
  },
  ordersPopularPrice: {
    ...typography.price,
    marginTop: 6,
    color: '#111111',
    fontSize: 15,
    lineHeight: 20
  },
  ordersPopularSkeletonLine: {
    marginTop: 10,
    width: '86%',
    height: 12,
    borderRadius: 6
  },
  ordersPopularSkeletonShort: {
    marginTop: 8,
    width: '54%',
    height: 12,
    borderRadius: 6
  },
  ordersPopularEmpty: {
    ...typography.caption,
    color: '#77716f'
  },
  orderCard: {
    minHeight: 86,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5dcd9',
    backgroundColor: '#fffdfc',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  orderIconBox: {
    width: 45,
    height: 45,
    borderRadius: 8,
    backgroundColor: '#f4eeee',
    alignItems: 'center',
    justifyContent: 'center'
  },
  orderCopy: {
    flex: 1
  },
  orderName: {
    color: '#2b2321',
    fontSize: 15,
    fontWeight: '700'
  },
  orderMeta: {
    marginTop: 5,
    color: '#77716f',
    fontSize: 12,
    fontWeight: '600'
  },
  orderPrice: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '700'
  },
  fullBodyPreviewCard: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 12
  },
  fullBodyPreviewTitle: {
    marginTop: 4,
    color: '#111827',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: 0
  },
  previewIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center'
  },
  fullBodyPreviewFrame: {
    height: 360,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f5efe7',
    borderWidth: 1,
    borderColor: '#e7d7c6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  fullBodyPreviewImage: {
    width: '100%',
    height: '100%'
  },
  profileActions: {
    margin: 16,
    gap: 10
  },
  profileDetailsInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  statPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#ecfdf5',
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '700'
  },
  latestOutfitCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  latestOutfitImage: {
    width: '100%',
    height: 320
  },
  latestOutfitCopy: {
    padding: 14,
    gap: 5
  },
  latestOutfitTitle: {
    color: '#111827',
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '700'
  },
  closetPanel: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10
  },
  closetEmptyWrap: {
    marginHorizontal: 16,
    marginBottom: 14
  },
  panelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  wardrobeHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  wardrobeHeaderActions: {
    alignItems: 'flex-end',
    gap: 8,
    flexShrink: 0
  },
  smallOutlineButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  smallOutlineText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '700'
  },
  stylistBoard: {
    gap: 12
  },
  wardrobeRail: {
    gap: 10,
    paddingRight: 12
  },
  wardrobeRailItem: {
    width: 112,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    gap: 6
  },
  wardrobeRailItemActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5'
  },
  wardrobeRailItemSelected: {
    borderColor: '#14b8a6'
  },
  railThumb: {
    width: 58,
    height: 58,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center'
  },
  railThumbImage: {
    width: '100%',
    height: '100%'
  },
  railThumbText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700'
  },
  railLabel: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700'
  },
  railMeta: {
    maxWidth: 92,
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center'
  },
  stylistPreviewFrame: {
    height: 360,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  stylistPreviewImage: {
    width: '100%',
    height: '100%'
  },
  previewGenerating: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  previewGeneratingText: {
    color: '#fff',
    fontWeight: '700'
  },
  lookbookRail: {
    gap: 8
  },
  lookbookCard: {
    width: 112,
    height: 140,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center'
  },
  lookbookImage: {
    width: '100%',
    height: '100%'
  },
  lookbookEmpty: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700'
  },
  lookbookThumbs: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    flexDirection: 'row',
    gap: 4
  },
  lookbookThumb: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#fff'
  },
  emptyActionBox: {
    minHeight: 92,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  emptyActionText: {
    color: '#0f766e',
    fontWeight: '700'
  },
  stylistConsoleActions: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  actionMetric: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '700'
  },
  actionMetricLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700'
  },
  generateMiniButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center'
  },
  generateMiniText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700'
  },
  actionCardList: {
    gap: 10
  },
  closetActionCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderTopWidth: 4,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    gap: 9
  },
  closetActionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  actionStep: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#0f5132',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 32
  },
  actionMeta: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  actionPreview: {
    height: 116,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionPreviewImage: {
    flex: 1,
    height: '100%'
  },
  actionLink: {
    fontWeight: '700'
  },
  occasionChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff'
  },
  occasionChipText: {
    color: '#0f5132',
    fontSize: 12,
    fontWeight: '700'
  },
  twoColumnInputs: {
    flexDirection: 'row',
    gap: 8
  },
  halfInput: {
    flex: 1,
    marginBottom: 0
  },
  comboSlotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  comboSlot: {
    width: '48%',
    minHeight: 72,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    justifyContent: 'center'
  },
  comboSlotActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5'
  },
  comboSlotLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  comboSlotValue: {
    marginTop: 5,
    color: '#111827',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700'
  },
  slotOptions: {
    gap: 10
  },
  slotOptionCard: {
    width: 118,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  slotOptionActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5'
  },
  slotOptionImage: {
    width: '100%',
    height: 112,
    backgroundColor: '#e5e7eb'
  },
  slotOptionName: {
    padding: 8,
    minHeight: 48,
    color: '#111827',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  selectedComboStrip: {
    gap: 8
  },
  selectedChipCard: {
    minHeight: 56,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  selectedChipImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#e5e7eb'
  },
  selectedChipName: {
    flex: 1,
    color: '#111827',
    fontSize: 12,
    fontWeight: '700'
  },
  selectedChipAction: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '700'
  },
  comboSuggestionList: {
    gap: 8
  },
  comboSuggestionCard: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  comboSuggestionActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5'
  },
  comboNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#0f5132',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 32
  },
  comboThumbs: {
    width: 72,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3
  },
  comboThumb: {
    width: 33,
    height: 33,
    borderRadius: 6,
    backgroundColor: '#e5e7eb'
  },
  comboSuggestionCopy: {
    flex: 1
  },
  suggestionRow: {
    gap: 10,
    paddingRight: 12
  },
  suggestionCard: {
    width: 220,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 5
  },
  suggestionTitle: {
    color: '#111827',
    fontWeight: '700'
  },
  suggestionCopy: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  chatTranscript: {
    maxHeight: 220,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 8
  },
  chatBubble: {
    maxWidth: '88%',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#111827',
    borderColor: '#111827'
  },
  chatBubbleText: {
    color: '#334155',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  chatBubbleUserText: {
    color: '#fff'
  },
  closetGrid: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14
  },
  closetItemCard: {
    width: '47.5%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  closetItemSelected: {
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5'
  },
  closetItemImage: {
    width: '100%',
    aspectRatio: productImageAspectRatio,
    backgroundColor: '#f0ece8'
  },
  closetItemBody: {
    padding: 10,
    gap: 5
  },
  closetItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8
  },
  selectText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700'
  },
  selectTextActive: {
    color: '#0f766e'
  },
  wardrobeGenerateFooter: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 6
  },
  wardrobeGenerateHint: {
    marginBottom: 10,
    color: '#9b5658',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: 'center'
  },
  wardrobeGenerateLookButton: {
    minHeight: 54,
    borderRadius: 27,
    backgroundColor: '#111111',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3
  },
  wardrobeGenerateLookText: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    letterSpacing: 0
  },
  wardrobeGenerateLookCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#a84f59',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 12,
    fontWeight: '900'
  },
  wardrobeGeneratedResult: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    marginTop: 18,
    marginBottom: 20,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e8dfd8',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    gap: 8
  },
  wardrobeGeneratedTitle: {
    ...typography.h2,
    color: '#211e1c',
    fontSize: 22,
    lineHeight: 28
  },
  wardrobeGeneratedCopy: {
    ...typography.smallBody,
    color: '#625b56',
    fontSize: 13,
    lineHeight: 19
  },
  wardrobeGeneratedImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f2eeea'
  },
  closetMessage: {
    marginHorizontal: 16,
    marginTop: 10
  },
  looksList: {
    marginBottom: 12
  },
  infoGrid: {
    paddingHorizontal: 16,
    gap: 10
  },
  infoCard: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  infoTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4
  },
  policyGrid: {
    paddingHorizontal: 16,
    gap: 10
  },
  policyCard: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  policyUpdated: {
    ...typography.caption,
    color: '#8f4f52',
    fontSize: 12,
    fontWeight: '700'
  },
  policySectionTitle: {
    ...typography.h4,
    marginBottom: 8,
    color: '#111827',
    fontSize: 17,
    lineHeight: 23
  },
  policyText: {
    ...typography.smallBody,
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 6
  },
  policyEmail: {
    color: '#8f4f52',
    fontWeight: '700',
    textDecorationLine: 'underline'
  },
  policyRelated: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  policyRelatedTitle: {
    ...typography.label,
    color: '#8f4f52',
    textTransform: 'uppercase',
    marginBottom: 8
  },
  policyRelatedRow: {
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: '#f1ece9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  policyRelatedText: {
    ...typography.smallBody,
    flex: 1,
    color: '#2b2321',
    fontSize: 14,
    fontWeight: '700'
  },
  stepCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  stepNumber: {
    color: '#0f766e',
    fontSize: 26,
    fontWeight: '700'
  },
  stepTitle: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 19,
    marginTop: 4,
    marginBottom: 6
  },
  pageHero: {
    margin: 16,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  pageImage: {
    width: '100%',
    height: 250
  },
  pageCopy: {
    padding: 16,
    gap: 10
  },
  notFoundContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 92,
    paddingBottom: screenBottomInset + 100,
    backgroundColor: '#fbf7f6',
    alignItems: 'center'
  },
  notFoundMark: {
    width: '100%',
    minHeight: 162,
    alignItems: 'center',
    justifyContent: 'center'
  },
  notFoundCode: {
    ...typography.display,
    color: '#eadfdb',
    fontSize: 94,
    lineHeight: 104
  },
  notFoundIcon: {
    position: 'absolute',
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    borderColor: '#e4d6d1',
    backgroundColor: '#fffdfb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2a211d',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  notFoundTitle: {
    ...typography.h1,
    marginTop: 10,
    color: '#211c1a',
    textAlign: 'center'
  },
  notFoundText: {
    ...typography.body,
    marginTop: 10,
    maxWidth: 320,
    color: '#706762',
    textAlign: 'center',
    fontWeight: '500'
  },
  notFoundActions: {
    width: '100%',
    marginTop: 28,
    gap: 12
  },
  notFoundButton: {
    width: '100%'
  },
  notFoundShopLink: {
    marginTop: 22,
    minHeight: 42,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  notFoundShopText: {
    ...typography.button,
    color: '#9b5658',
    fontSize: 14
  },
  tryOnLoading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 22
  },
  tryOnLoadingLarge: {
    position: 'absolute'
  },
  tryOnLoadingPill: {
    minHeight: 34,
    maxWidth: '84%',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: 'rgba(255, 253, 251, 0.94)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#2a211d',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3
  },
  tryOnLoadingPillLarge: {
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 15
  },
  tryOnLoadingText: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center'
  },
  tryOnProgressMark: {
    flexDirection: 'row',
    gap: 6
  },
  tryOnProgressDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#ffffff'
  },
  tryOnProgressDotMuted: {
    opacity: 0.48
  },
  tryOnProgressTrack: {
    width: '58%',
    maxWidth: 120,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.28)'
  },
  tryOnProgressFill: {
    width: '62%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#ffffff'
  },
  tourOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24
  },
  tourBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24, 21, 19, 0.58)'
  },
  tourDimPiece: {
    position: 'absolute',
    backgroundColor: 'rgba(17, 17, 17, 0.62)'
  },
  tourSpotlightCorner: {
    position: 'absolute',
    width: 16,
    height: 16,
    backgroundColor: 'rgba(17, 17, 17, 0.62)'
  },
  tourSpotlightCornerTopLeft: {
    borderBottomRightRadius: 16
  },
  tourSpotlightCornerTopRight: {
    borderBottomLeftRadius: 16
  },
  tourSpotlightCornerBottomLeft: {
    borderTopRightRadius: 16
  },
  tourSpotlightCornerBottomRight: {
    borderTopLeftRadius: 16
  },
  tourSpotlight: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(250, 248, 245, 0.92)'
  },
  tourCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: '#faf8f5',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    shadowColor: '#111111',
    shadowOpacity: 0.18,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8
  },
  tourCardAnchored: {
    position: 'absolute',
    alignSelf: 'center'
  },
  tourIntroCard: {
    alignItems: 'center'
  },
  tourCloseButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e8e1da',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#faf8f5'
  },
  tourIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3eee8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10
  },
  tourEyebrow: {
    ...typography.label,
    color: '#77716c',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.5
  },
  tourTitle: {
    marginTop: 7,
    color: '#211f1d',
    fontFamily: fontFamilies.logo,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '400',
    textAlign: 'center',
    letterSpacing: -0.2
  },
  tourText: {
    ...typography.smallBody,
    marginTop: 8,
    color: '#625c56',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '400'
  },
  tourHintRow: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e8e1da',
    backgroundColor: '#f3eee8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  tourHintText: {
    ...typography.caption,
    flex: 1,
    color: '#625c56',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500'
  },
  tourDots: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  tourDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ddd5ce'
  },
  tourDotActive: {
    width: 20,
    backgroundColor: '#625c56'
  },
  tourActions: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10
  },
  tourPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#111111',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14
  },
  tourPrimaryButtonFull: {
    flex: 0,
    alignSelf: 'stretch'
  },
  tourPrimaryText: {
    ...typography.button,
    color: '#ffffff'
  },
  tourSecondaryButton: {
    minWidth: 96,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d8d0c9',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#faf8f5',
    paddingHorizontal: 14
  },
  tourSecondaryText: {
    ...typography.button,
    color: '#625c56'
  },
  tourSkipButton: {
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44
  },
  tourSkipText: {
    ...typography.caption,
    color: '#77716c',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  authPromptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 17, 17, 0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  authPromptSheet: {
    width: '100%',
    maxWidth: 372,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eaded9',
    backgroundColor: '#fffdfb',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 17,
    alignItems: 'center',
    shadowColor: '#111111',
    shadowOpacity: 0.22,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 10
  },
  authPromptBrand: {
    alignSelf: 'flex-start',
    marginBottom: 16
  },
  authPromptBrandSymbol: {
    width: 26,
    height: 26
  },
  authPromptBrandDivider: {
    height: 22,
    backgroundColor: '#d4cbc5'
  },
  authPromptBrandText: {
    fontSize: 22,
    lineHeight: 27
  },
  authPromptIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#fff5f3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 13
  },
  authPromptTitle: {
    color: '#2b2321',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800'
  },
  authPromptText: {
    marginTop: 7,
    color: '#5d5754',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    paddingHorizontal: 5
  },
  authPromptChipRow: {
    marginTop: 15,
    flexDirection: 'row',
    gap: 8
  },
  authPromptChip: {
    minHeight: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee3dc',
    backgroundColor: '#fbf7f6',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10
  },
  authPromptChipText: {
    ...typography.caption,
    color: '#2b2321',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  authPromptPrimary: {
    marginTop: 18,
    minHeight: 50,
    alignSelf: 'stretch',
    borderRadius: 8,
    backgroundColor: '#050606',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  authPromptPrimaryText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800'
  },
  authPromptSecondary: {
    marginTop: 9,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  authPromptSecondaryText: {
    color: '#5d5754',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800'
  },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  lightboxImage: {
    width: '94%',
    height: '84%'
  },
  closeButton: {
    position: 'absolute',
    top: 54,
    right: 18,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center'
  },
}, Platform.OS, Platform.Version));
