import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Component, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
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
import { api, clearToken, filePart, formatMoney, getToken, imageUrl, saveToken } from './src/api';
import { categories, images, infoPages } from './src/assets';
import { calculateCreditPercentage, normalizeProduct, normalizeProducts, resolveImageUrl } from './src/products';

const genders = ['men', 'women', 'unisex'];
const sortOptions = [
  ['', 'Relevant'],
  ['newest', 'Newest'],
  ['price-asc', 'Price low'],
  ['price-desc', 'Price high']
];
const appTopInset = Platform.OS === 'android' ? Math.max(76, NativeStatusBar.currentHeight || 0) : 0;
const bottomNavigationHeight = Platform.OS === 'ios' ? 86 : 78;
const screenBottomInset = 40;
const screenScrollProps = {
  showsVerticalScrollIndicator: false,
  keyboardShouldPersistTaps: 'handled',
  ...(Platform.OS === 'android'
    ? { overScrollMode: 'never' }
    : {
        alwaysBounceVertical: false,
        bounces: false,
        scrollIndicatorInsets: { bottom: screenBottomInset }
      })
};
const homeCategorySnapInterval = 70;
const validRoutes = new Set(['auth', 'home', 'shop', 'tryon', 'closet', 'custom', 'stylebot', 'tokens', 'profile', 'product', 'wishlist', 'orders', 'signup', 'login', 'how', 'info']);

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

function friendlyFirstName(user) {
  const name = String(user?.name || '').split(' ')?.[0] || '';
  const suspicious = /^(?:red|blue|green|black|white|test|user|admin)$/i.test(name.trim());
  return name && !suspicious ? titleCase(name) : '';
}

function dateInputValue(value = new Date()) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function productImageSource(product, tryOn) {
  const url = resolveImageUrl(tryOn?.imageUrl || product?.imageUrl || product?.imageUrls?.[0]);
  return url ? { uri: url } : null;
}

function productImageResizeMode(tryOn) {
  return tryOn?.imageUrl ? 'contain' : 'cover';
}

const ProductImage = memo(function ProductImage({ product, tryOn, style, resizeMode, alt, fallbackIcon = 'image-outline' }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const tryOnUrl = resolveImageUrl(tryOn?.imageUrl);
  const imageUrls = useMemo(() => (
    tryOnUrl ? [tryOnUrl] : (product?.imageUrls?.length ? product.imageUrls : [product?.imageUrl]).filter(Boolean)
  ), [tryOnUrl, product?.imageUrl, product?.imageUrls]);
  const imageSignature = imageUrls.join('|');
  const source = useMemo(() => (imageUrls[imageIndex] ? { uri: imageUrls[imageIndex] } : null), [imageUrls, imageIndex]);

  useEffect(() => {
    setImageIndex(0);
    setLoaded(false);
  }, [product?.id, tryOnUrl, imageSignature]);

  if (!source) {
    return (
      <View style={[style, styles.productImageFallback]} accessibilityLabel={alt || product?.title || product?.name || 'Product image unavailable'}>
        <Ionicons name={fallbackIcon} size={26} color="#9b8f89" />
        <Text style={styles.productImageFallbackText}>No image</Text>
      </View>
    );
  }

  return (
    <View style={[style, styles.productImageFrame]}>
      {!loaded ? <View style={styles.productImageSkeleton} /> : null}
      <Image
        accessibilityLabel={alt || product?.title || product?.name || 'Product image'}
        source={source}
        style={[StyleSheet.absoluteFillObject, styles.productImage]}
        resizeMode={resizeMode || productImageResizeMode(tryOn)}
        fadeDuration={160}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (imageIndex < imageUrls.length - 1) setImageIndex((current) => current + 1);
          else setLoaded(true);
        }}
      />
    </View>
  );
});

function useProducts(params, token) {
  const query = useMemo(() => {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, value);
    });
    return search.toString();
  }, [JSON.stringify(params || {})]);
  const [state, setState] = useState({
    products: [],
    total: 0,
    facets: { brands: [], categories: [], categoryCounts: [] },
    loading: true,
    error: ''
  });

  const load = useCallback(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    api(`/products${query ? `?${query}` : ''}`)
      .then((data) => {
        if (!alive) return;
        setState({
          products: normalizeProducts(data.products || []),
          total: data.total || 0,
          facets: data.facets || { brands: [], categories: [], categoryCounts: [] },
          loading: false,
          error: ''
        });
      })
      .catch((error) => {
        if (!alive) return;
        setState({ products: [], total: 0, facets: { brands: [], categories: [], categoryCounts: [] }, loading: false, error: error.message });
      });
    return () => {
      alive = false;
    };
  }, [query, token]);

  useEffect(load, [load]);
  return { ...state, reload: load };
}

function useApiState(path, token, enabled = true, emptyData = {}) {
  const [state, setState] = useState({ data: emptyData, loading: Boolean(enabled), error: '' });

  const load = useCallback(() => {
    if (!enabled || !path) {
      setState({ data: emptyData, loading: false, error: '' });
      return undefined;
    }
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: '' }));
    api(path)
      .then((data) => {
        if (alive) setState({ data: data || emptyData, loading: false, error: '' });
      })
      .catch((error) => {
        if (alive) setState({ data: emptyData, loading: false, error: error.message });
      });
    return () => {
      alive = false;
    };
  }, [path, token, enabled]);

  useEffect(load, [load]);
  return { ...state, reload: load };
}

function tryOnModelLabel(value) {
  if (String(value || '').includes('fitroom')) return 'FitRoom';
  if (value === 'vto-unrestricted') return 'VTO model';
  if (value === 'wan-v2.6-image-to-image') return 'WAN 2.6 image';
  if (value === 'wan-v2.2-image-to-image') return 'WAN 2.2 image';
  if (String(value || '').includes('wan')) return 'WAN image';
  return 'GPT image';
}

function useTryOns(user, products, token) {
  const productIds = useMemo(
    () => [...new Set((products || []).map((product) => product?.id).filter(Boolean))].slice(0, 96).join(','),
    [products]
  );
  const [tryOns, setTryOns] = useState({});

  useEffect(() => {
    if (!user || !productIds) {
      setTryOns({});
      return undefined;
    }
    let alive = true;
    api(`/tryons?productIds=${encodeURIComponent(productIds)}`)
      .then((data) => {
        if (!alive) return;
        const saved = Object.fromEntries((data.tryOns || []).map((tryOn) => [tryOn.productId, tryOn]));
        setTryOns(saved);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user?.id, user?.bodyPhotoUrl, productIds, token]);

  return [tryOns, setTryOns];
}

async function pickImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Photo access needed', 'Allow photo access to upload images for FitLook try-ons.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9
  });
  if (result.canceled) return null;
  return result.assets?.[0] || null;
}

async function takePhoto() {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Camera access needed', 'Allow camera access to take a FitLook profile photo.');
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.9
  });
  if (result.canceled) return null;
  return result.assets?.[0] || null;
}

function AppButton({ label, icon, variant = 'primary', disabled, onPress, style }) {
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
      <Text style={[styles.buttonText, variant !== 'primary' && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

function Header({ user, canGoBack, onBack, onNavigate, onLogout }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {canGoBack ? (
          <TouchableOpacity style={styles.iconButton} onPress={onBack}>
            <Ionicons name="chevron-back" size={22} color="#111827" />
          </TouchableOpacity>
        ) : null}
        <View>
          <Pressable onPress={() => onNavigate('home')}>
            <Text style={styles.brand}>FitLook</Text>
          </Pressable>
          <Text style={styles.headerSub}>{user?.devMode ? 'Dev Mode active' : user ? `${user.tokens} tokens ready` : 'AI fitting room'}</Text>
          {user?.bodyPhotoStatus === 'generating' ? <Text style={styles.headerNotice}>Profile preparing</Text> : null}
        </View>
      </View>
      <View style={styles.headerActions}>
        {user ? (
          <TouchableOpacity style={styles.iconButton} onPress={() => onNavigate('profile')}>
            {user.bodyPhotoUrl ? <Image source={{ uri: imageUrl(user.bodyPhotoUrl) }} style={styles.headerAvatar} /> : <Ionicons name="person-outline" size={20} color="#111827" />}
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

function AppHeader({ onNavigate, title = 'FitLook', leftIcon = 'menu-outline', leftRoute = 'profile', rightIcon = 'bag-handle-outline', rightRoute = 'tokens', user, showAvatar = false, hideLeft = false, brandAlign = 'center', compact = false }) {
  const openLeft = () => leftRoute && onNavigate(leftRoute);
  const openRight = () => rightRoute && onNavigate(rightRoute);
  const showWishlistAction = rightIcon === 'bag-handle-outline' && !showAvatar;
  const brandLeft = brandAlign === 'left';
  return (
    <View style={[styles.appHeader, compact && styles.appHeaderCompact]}>
      {!brandLeft ? (
        <View style={[styles.appHeaderSide, styles.appHeaderLeftSide]}>
          {hideLeft ? null : (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open left action" style={styles.appHeaderAction} onPress={openLeft}>
              <Ionicons name={leftIcon} size={22} color="#171412" />
            </TouchableOpacity>
          )}
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Go to feed" onPress={() => onNavigate('home')} style={[styles.appHeaderBrandWrap, brandLeft && styles.appHeaderBrandWrapLeft]}>
        <Text style={styles.appHeaderBrand} numberOfLines={1}>{title}</Text>
      </Pressable>
      <View style={[styles.appHeaderSide, styles.appHeaderRightSide]}>
        {showWishlistAction ? (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open wishlist" style={styles.appHeaderAction} onPress={() => onNavigate('wishlist')}>
            <Ionicons name="heart-outline" size={21} color="#171412" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Open bag" style={styles.appHeaderAction} onPress={openRight}>
          {showAvatar && user?.bodyPhotoUrl ? <Image source={{ uri: imageUrl(user.bodyPhotoUrl) }} style={styles.appHeaderAvatar} /> : <Ionicons name={rightIcon} size={20} color="#171412" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function BottomNav({ route = { name: 'home' }, onNavigate = () => {} }) {
  const routeName = route?.name || 'home';
  const activeRoute = routeName === 'product' || routeName === 'wishlist' ? 'shop' : routeName === 'orders' ? 'profile' : routeName;
  const items = [
    ['home', 'home-outline', 'Home'],
    ['shop', 'grid-outline', 'Category'],
    ['closet', 'shirt-outline', 'Wardrobe'],
    ['tryon', 'sparkles-outline', 'AI Studio'],
    ['profile', 'person-outline', 'Profile']
  ];
  return (
    <View style={styles.bottomNav}>
      {items.map(([name, icon, label]) => {
        const active = activeRoute === name;
        return (
          <TouchableOpacity key={name} activeOpacity={0.82} accessibilityRole="tab" accessibilityState={{ selected: active }} style={[styles.navItem, active && styles.navItemCenterActive]} onPress={() => onNavigate(name)}>
            <View style={[styles.navIconWrap, active && styles.navIconWrapCenter]}>
              <Ionicons name={icon} size={active ? 20 : 21} color={active ? '#8f4f52' : '#8d8682'} />
            </View>
            <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
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
      <View style={[styles.statusPanel, styles.loadingPanel]}>
        <View style={styles.skeletonIcon} />
        <View style={styles.skeletonLineWide} />
        <View style={styles.skeletonLine} />
        <Text style={styles.statusText}>{text || 'Loading...'}</Text>
      </View>
    );
  }
  if (error || empty) {
    return (
      <View style={styles.statusPanel}>
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

const ProductCard = memo(function ProductCard({ product, tryOn, loading, videoLoading, error, videoError, locked, onPress, onTryOn, onTryOnVideo, onAddToWishlist, isWishlisted, variant = 'grid' }) {
  const price = Number(product?.price);
  const hasPrice = Number.isFinite(price);
  const hasDiscount = hasPrice && product?.compareAtPrice && product.compareAtPrice > product.price;
  const discount = hasDiscount ? `${Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}% off` : '';
  const videoUri = imageUrl(tryOn?.videoUrl);
  const hasTryOnImage = Boolean(tryOn?.imageUrl);
  const useHomeImageFrame = variant === 'homeFrame';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={product?.title || product?.name || 'Open product'}
      style={({ pressed }) => [styles.productCard, useHomeImageFrame && styles.productCardHomeFrame, variant === 'carousel' && styles.productCardCarousel, pressed && !locked && styles.productCardPressed, locked && styles.lockedCard]}
      onPress={locked ? undefined : onPress}
    >
      <View style={[styles.productImageWrap, useHomeImageFrame && styles.homeProductImageWrap]}>
        {videoUri ? (
          <TryOnVideoPlayer uri={videoUri} style={styles.productImage} nativeControls={false} />
        ) : (
          <ProductImage product={product} tryOn={tryOn} style={styles.productImage} alt={product?.title || product?.name} />
        )}
        {locked ? <View style={styles.lockOverlay}><Ionicons name="lock-closed" size={22} color="#fff" /></View> : null}
        {hasTryOnImage ? <Text style={styles.badge}>{videoUri ? 'Video Try-On' : 'AI Try-On'}</Text> : product?.isNew ? <Text style={styles.badge}>New</Text> : product?.badge ? <Text style={styles.badge}>{product.badge}</Text> : null}
        {onAddToWishlist && !locked ? <WishlistDoneButton saved={isWishlisted} compact={variant === 'carousel'} onPress={() => onAddToWishlist(product)} /> : null}
        {loading || videoLoading ? <TryOnLoading text={videoLoading ? 'Video' : 'Generating'} /> : null}
      </View>
      <View style={styles.productBody}>
        <Text style={styles.productTitle} numberOfLines={2}>{product?.title || product?.name || 'Untitled product'}</Text>
        <Text style={styles.productBrand} numberOfLines={1}>{product?.displayLabel || titleCase(product?.category || 'Catalog')}</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={13} color="#f59e0b" />
          <Text style={styles.ratingText}>{Number(product?.rating || 0).toFixed(1)} {product?.ratingCount ? `(${product.ratingCount})` : ''}</Text>
        </View>
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
            style={styles.cardButton}
          />
        ) : null}
        {hasTryOnImage && onTryOnVideo ? (
          <AppButton
            label={videoLoading ? 'Video...' : videoUri ? 'New Video' : 'Video Try-On'}
            icon="videocam-outline"
            variant="secondary"
            disabled={loading || videoLoading}
            onPress={onTryOnVideo}
            style={styles.cardButton}
          />
        ) : null}
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
      <StatusPanel loading={state.loading} error={state.error} empty={!state.loading && !products.length} text="Loading products..." />
      <FlatList
        horizontal
        data={products}
        keyExtractor={keyExtractor}
        showsHorizontalScrollIndicator={false}
        directionalLockEnabled
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={3}
        removeClippedSubviews={Platform.OS === 'android'}
        updateCellsBatchingPeriod={40}
        contentContainerStyle={styles.horizontalList}
        renderItem={renderProduct}
      />
    </View>
  );
}

const homeCategoryItems = [
  ['TOPS', 'category-tops-updated.jpg', 'tops'],
  ['BOTTOMS', 'category-bottoms-updated.jpg', 'bottoms'],
  ['T-SHIRTS', 'category-tshirts-updated.jpg', 't-shirts'],
  ['SHOES', 'category-shoes-updated.jpg', 'shoes'],
  ['EYEWEAR', 'category-eyewear-updated.jpg', 'eyewear']
];

const shopCategoryItems = [
  ['Tops', 'category-tops-updated.jpg', 'tops'],
  ['Bottoms', 'category-bottoms-updated.jpg', 'bottoms'],
  ['Shirts', 'category-1.jpg', 'shirts'],
  ['Shoes', 'category-shoes-updated.jpg', 'shoes'],
  ['Eyewear', 'category-eyewear-updated.jpg', 'eyewear']
];
const shopProductGridLimit = 50;

function ShopTopBar({ onNavigate }) {
  return <AppHeader onNavigate={onNavigate} />;
}

function CurationProductCard({ product, onPress, onAddToWishlist, isWishlisted, user }) {
  const price = Number(product.price);
  return (
    <TouchableOpacity style={styles.homeProductCard} onPress={onPress}>
      <View style={styles.homeProductImageWrap}>
        <ProductImage product={product} style={styles.homeProductImage} alt={product.title || product.name} />
        {product.isNew ? <Text style={styles.homeNewBadge}>NEW</Text> : null}
        {onAddToWishlist ? <WishlistDoneButton saved={isWishlisted} compact onPress={() => onAddToWishlist(product)} /> : null}
        {user ? (
          <View style={styles.homeTryBadge}>
            <Ionicons name="sparkles" size={12} color="#111111" />
          </View>
        ) : null}
      </View>
      <Text style={styles.homeProductEyebrow} numberOfLines={1}>{product.displayLabel || titleCase(product.category || 'Catalog')}</Text>
      <Text style={styles.homeProductTitle} numberOfLines={2}>{product.title || product.name}</Text>
      <Text style={styles.homeProductPrice}>{Number.isFinite(price) ? formatMoney(price, product.currency) : 'Price unavailable'}</Text>
    </TouchableOpacity>
  );
}

function ProductTopBar({ onNavigate }) {
  return <AppHeader onNavigate={onNavigate} leftIcon="search-outline" leftRoute="shop" />;
}

function ProductActionButton({ label, icon, active, disabled, onPress }) {
  return (
    <TouchableOpacity style={[styles.productActionButton, active && styles.productActionButtonActive, disabled && styles.disabledButton]} activeOpacity={0.85} disabled={disabled} onPress={onPress}>
      <Ionicons name={icon} size={15} color={active ? '#ffffff' : '#4f4a48'} />
      <Text style={[styles.productActionText, active && styles.productActionTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CompleteLookCard({ product, fallback, onPress, onAddToWishlist, isWishlisted }) {
  const source = product ? productImageSource(product) : images[fallback.image];
  const price = Number(product?.price);
  return (
    <TouchableOpacity style={styles.completeLookCard} activeOpacity={0.86} onPress={onPress}>
      <View style={styles.completeLookImageWrap}>
        {product ? <ProductImage product={product} style={styles.completeLookImage} alt={product.title || product.name} /> : <Image source={source} style={styles.completeLookImage} resizeMode="cover" />}
        {product && onAddToWishlist ? <WishlistDoneButton saved={isWishlisted} compact onPress={() => onAddToWishlist(product)} /> : null}
      </View>
      <Text style={styles.completeLookBrand} numberOfLines={1}>{product?.displayLabel || fallback?.brand}</Text>
      <Text style={styles.completeLookName} numberOfLines={2}>{product?.title || product?.name || fallback?.name}</Text>
      <Text style={styles.completeLookPrice}>{product ? (Number.isFinite(price) ? formatMoney(price, product.currency) : 'Price unavailable') : fallback?.price}</Text>
    </TouchableOpacity>
  );
}

function ConciergeSuggestionCard({ product, fallback, featured, onShop, onTryOn }) {
  const source = product ? productImageSource(product) : images[fallback.image];
  const price = Number(product?.price);
  return (
    <TouchableOpacity style={styles.conciergeSuggestionCard} activeOpacity={0.88} onPress={onTryOn || onShop}>
      <View style={styles.conciergeSuggestionImageWrap}>
        {product ? <ProductImage product={product} style={styles.conciergeSuggestionImage} alt={product.title || product.name} /> : <Image source={source} style={styles.conciergeSuggestionImage} resizeMode="cover" />}
        {featured ? (
          <TouchableOpacity style={styles.conciergeSparkButton} onPress={onTryOn || onShop}>
            <Ionicons name="sparkles" size={24} color="#050505" />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.conciergeSuggestionBody}>
        <Text style={styles.conciergeSuggestionBrand} numberOfLines={1}>{product?.displayLabel || fallback?.brand}</Text>
        <Text style={styles.conciergeSuggestionName} numberOfLines={2}>{product?.title || product?.name || fallback?.name}</Text>
        <Text style={styles.conciergeSuggestionPrice}>{product ? (Number.isFinite(price) ? formatMoney(price, product.currency) : 'Price unavailable') : fallback?.price}</Text>
        <TouchableOpacity style={styles.conciergeShopButton} onPress={onShop}>
          <Text style={styles.conciergeShopText}>Shop Suggestion</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function HomeScreen({ onNavigate, user, token, onAddToWishlist, wishlistIds }) {
  const [atelierEmail, setAtelierEmail] = useState('');
  const curated = useProducts({ limit: 16 }, token);
  const shopLooks = useProducts({ category: 'dresses', gender: 'women', sort: 'newest', limit: 8 }, token);
  const polishedCategories = new Set(['dresses', 'tops', 'bottoms', 'outerwear', 'jackets', 'shirts', 'pants', 'jeans', 'shoes', 'accessories']);
  const curatedProducts = curated.products.filter((product) => polishedCategories.has(product.category)).slice(0, 4);
  const shopLookProducts = shopLooks.products.filter((product) => product.category === 'dresses' && (product.imageUrl || product.imageUrls?.length));
  const lookLabels = ['Dinner Ready', 'Soft Floral', 'Denim Day', 'Party Edit', 'Vacation', 'Weekend'];

  return (
    <View style={styles.homeScreen}>
      <AppHeader onNavigate={onNavigate} rightRoute="shop" hideLeft brandAlign="left" compact />
      <ScrollView style={styles.homeScroll} contentContainerStyle={styles.homeContent} {...screenScrollProps}>
      <View style={styles.homeHero}>
        <Image source={images.homeAtelierHero} style={styles.homeHeroImage} resizeMode="cover" />
        <View style={styles.homeHeroShade} />
        <View style={styles.homeHeroCopy}>
          <Text style={styles.homeHeroTitle}>SUMMER ESSENTIALS</Text>
          <TouchableOpacity style={styles.homeHeroButton} onPress={() => onNavigate('shop')}>
            <Text style={styles.homeHeroButtonText}>SHOP NOW</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.homeSection}>
        <View style={styles.homeSectionHead}>
          <Text style={styles.homeSectionTitle}>Categories</Text>
          <TouchableOpacity onPress={() => onNavigate('shop')}>
            <Text style={styles.homeViewAll}>VIEW ALL</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.homeCategoryTrack}
          decelerationRate="fast"
          snapToInterval={homeCategorySnapInterval}
          snapToAlignment="start"
        >
          {homeCategoryItems.map(([label, image]) => (
            <View key={label} style={styles.homeCategoryItem}>
              <View style={styles.homeCategoryImageFrame}>
                <Image source={images[image]} style={styles.homeCategoryImage} resizeMode="contain" />
              </View>
              <Text style={styles.homeCategoryLabel} numberOfLines={1}>{label}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <Text style={styles.homeCurationTitle}>The Curation</Text>
      <View style={styles.homeCuratedGrid}>
        {curated.loading || curated.error || !curatedProducts.length ? (
          <StatusPanel loading={curated.loading} error={curated.error} empty={!curated.loading && !curatedProducts.length} text="No curated products found yet." />
        ) : curatedProducts.map((product) => {
          return (
            <CurationProductCard
              key={product.id}
              product={product}
              onPress={() => onNavigate('product', { id: product.id })}
              onAddToWishlist={onAddToWishlist}
              isWishlisted={wishlistIds?.has(product.id)}
              user={user}
            />
          );
        })}
      </View>

      <View style={styles.homeSaleCard}>
        <Text style={styles.homeSaleText}>UP TO 50%{'\n'}OFF</Text>
        <Text style={styles.homeSaleSub}>SEASONAL ARCHIVE SALE</Text>
      </View>

      <View style={styles.homeShippingCard}>
        <View>
          <Text style={styles.homeShippingTitle}>FREE SHIPPING</Text>
          <Text style={styles.homeShippingText}>On orders over $250</Text>
        </View>
        <Ionicons name="cube-outline" size={28} color="#111111" />
      </View>

      <View style={styles.homeJournalBand}>
        <View style={styles.homeJournalHead}>
          <View>
            <Text style={styles.homeJournalKicker}>DRESS EDIT</Text>
            <Text style={styles.homeJournalTitle}>Shop by Look</Text>
          </View>
          <TouchableOpacity style={styles.homeJournalLink} activeOpacity={0.82} onPress={() => onNavigate('shop', { category: 'dresses', gender: 'women' })}>
            <Text style={styles.homeJournalLinkText}>View all</Text>
            <Ionicons name="arrow-forward" size={14} color="#9b5658" />
          </TouchableOpacity>
        </View>
        <Text style={styles.homeJournalIntro}>Real dress picks from the live catalog, selected for quick outfit discovery.</Text>
        {shopLooks.loading || shopLooks.error || !shopLookProducts.length ? (
          <StatusPanel loading={shopLooks.loading} error={shopLooks.error} empty={!shopLooks.loading && !shopLookProducts.length} text="No dress looks found yet." />
        ) : (
          <View style={styles.homeJournalGrid}>
            {shopLookProducts.slice(0, 6).map((product, index) => {
              const price = Number(product.price);
              return (
                <TouchableOpacity key={product.id} style={styles.homeJournalProductCard} activeOpacity={0.86} onPress={() => onNavigate('product', { id: product.id })}>
                  <View style={styles.homeJournalImageFrame}>
                    <ProductImage product={product} style={styles.homeJournalImage} resizeMode="cover" alt={product.title || product.name} />
                    {onAddToWishlist ? <WishlistDoneButton saved={wishlistIds?.has(product.id)} compact onPress={() => onAddToWishlist(product)} /> : null}
                    <View style={styles.homeJournalOverlay}>
                      <Text style={styles.homeJournalLookLabel} numberOfLines={1}>{lookLabels[index % lookLabels.length]}</Text>
                    </View>
                  </View>
                  <View style={styles.homeJournalProductBody}>
                    <Text style={styles.homeJournalProductLabel} numberOfLines={1}>{product.displayLabel || 'Dress'}</Text>
                    <Text style={styles.homeJournalProductTitle} numberOfLines={2}>{product.title || product.name}</Text>
                    <Text style={styles.homeJournalProductPrice}>{Number.isFinite(price) ? formatMoney(price, product.currency) : 'Price unavailable'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.homeAtelier}>
        <View style={styles.homeDivider} />
        <Text style={styles.homeAtelierTitle}>Join the Atelier</Text>
        <Text style={styles.homeAtelierText}>Receive early access to seasonal curations{'\n'}and exclusive AI styling insights.</Text>
        <TextInput
          style={styles.homeEmailInput}
          value={atelierEmail}
          onChangeText={setAtelierEmail}
          placeholder="Your Email Address"
          placeholderTextColor="#8c8c8c"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TouchableOpacity style={styles.homeSubscribeButton}>
          <Text style={styles.homeSubscribeText}>SUBSCRIBE</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.homeFooterLinks}>
        <View>
          <Text style={styles.homeFooterHead}>INFO</Text>
          <Text style={styles.homeFooterLink}>About FitLook</Text>
          <Text style={styles.homeFooterLink}>Journal</Text>
          <Text style={styles.homeFooterLink}>Careers</Text>
        </View>
        <View>
          <Text style={styles.homeFooterHead}>HELP</Text>
          <Text style={styles.homeFooterLink}>Shipping</Text>
          <Text style={styles.homeFooterLink}>Returns</Text>
          <Text style={styles.homeFooterLink}>Contact</Text>
        </View>
      </View>

      <View style={styles.homeFooterBottom}>
        <Text style={styles.homeFooterBrand}>FitLook</Text>
        <Text style={styles.homeCopyright}>© 2027 Altair Digital</Text>
      </View>
      </ScrollView>
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {content}
    </ScrollView>
  );
}

function FilterDropdown({ label, selected, options, onSelect }) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => (Array.isArray(option) ? option[0] : option) === selected) || options[0];
  const selectedLabel = Array.isArray(selectedOption) ? selectedOption[1] : titleCase(selectedOption);
  const hasValue = Boolean(selected);

  return (
    <>
      <TouchableOpacity accessibilityRole="button" activeOpacity={0.82} style={[styles.dropdownButton, hasValue && styles.dropdownButtonActive]} onPress={() => setOpen(true)}>
        <View style={styles.dropdownCopy}>
          <Text style={styles.dropdownLabel}>{label}</Text>
          <Text style={styles.dropdownValue} numberOfLines={1}>{selectedLabel}</Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={hasValue ? '#8c4d50' : '#6f6863'} />
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
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });

  return (
    <VideoView
      player={player}
      style={style || styles.detailVideo}
      nativeControls={nativeControls}
      contentFit="contain"
      allowsFullscreen
      allowsPictureInPicture
    />
  );
}

function ShopScreen({ initial = {}, tryOnMode, user, setUser, token, onNavigate, onAddToWishlist, wishlistIds }) {
  if (tryOnMode) {
    return <StyleBotScreen user={user} setUser={setUser} token={token} onNavigate={onNavigate} />;
  }

  const [draft, setDraft] = useState(initial.q || '');
  const [filters, setFilters] = useState({
    q: initial.q || '',
    category: initial.category || '',
    brand: '',
    gender: initial.gender || '',
    sort: initial.sort || '',
    newArrival: initial.newArrival || ''
  });
  const [tryOnLoading, setTryOnLoading] = useState({});
  const [tryOnVideoLoading, setTryOnVideoLoading] = useState({});
  const [tryOnErrors, setTryOnErrors] = useState({});
  const [tryOnVideoErrors, setTryOnVideoErrors] = useState({});
  const autoKey = useRef('');
  const state = useProducts({ ...filters, limit: shopProductGridLimit }, token);
  const arrivalsState = useProducts({ sort: 'newest', limit: shopProductGridLimit }, token);
  const [tryOns, setTryOns] = useTryOns(user, state.products, token);

  useEffect(() => {
    setDraft(initial.q || '');
    setFilters({
      q: initial.q || '',
      category: initial.category || '',
      brand: initial.brand || '',
      gender: initial.gender || '',
      sort: initial.sort || '',
      newArrival: initial.newArrival || ''
    });
    autoKey.current = '';
  }, [JSON.stringify(initial || {}), tryOnMode]);

  const searchSignature = useMemo(() => JSON.stringify({
    q: filters.q,
    category: filters.category,
    brand: filters.brand,
    gender: filters.gender,
    sort: filters.sort,
    newArrival: filters.newArrival
  }), [filters.q, filters.category, filters.brand, filters.gender, filters.sort, filters.newArrival]);
  const hasSearchIntent = Boolean(filters.q || filters.category || filters.brand || filters.gender || filters.newArrival);
  const allowTryOnTrial = Boolean(user) && (tryOnMode || hasSearchIntent);
  const trialProducts = state.products.slice(0, 4);
  const visibleProducts = state.products;

  const runSearch = () => {
    setFilters((current) => ({ ...current, q: draft.trim() }));
  };

  const generateTryOn = useCallback(async (product) => {
    if (!user || !product?.id || tryOnLoading[product.id]) return;
    const existing = tryOns[product.id];
    setTryOnLoading((current) => ({ ...current, [product.id]: true }));
    setTryOnErrors((current) => ({ ...current, [product.id]: '' }));
    try {
      const data = await api(`/tryons/${product.id}`, {
        method: 'POST',
        body: existing?.imageUrl ? JSON.stringify({ force: true }) : undefined
      });
      setTryOns((current) => ({ ...current, [product.id]: data.tryOn }));
      if (data.user) setUser(data.user);
    } catch (error) {
      setTryOnErrors((current) => ({ ...current, [product.id]: error.message }));
    } finally {
      setTryOnLoading((current) => ({ ...current, [product.id]: false }));
    }
  }, [user, tryOnLoading, tryOns]);

  const generateTryOnVideo = useCallback(async (product) => {
    const existing = tryOns[product?.id];
    if (!user || !product?.id || tryOnVideoLoading[product.id] || !existing?.imageUrl) return;
    setTryOnVideoLoading((current) => ({ ...current, [product.id]: true }));
    setTryOnVideoErrors((current) => ({ ...current, [product.id]: '' }));
    try {
      const data = await api(`/tryons/${product.id}/video`, {
        method: 'POST',
        body: existing.videoUrl ? JSON.stringify({ force: true }) : undefined,
        timeoutMs: 180000
      });
      setTryOns((current) => ({ ...current, [product.id]: data.tryOn }));
      if (data.user) setUser(data.user);
    } catch (error) {
      setTryOnVideoErrors((current) => ({ ...current, [product.id]: error.message }));
    } finally {
      setTryOnVideoLoading((current) => ({ ...current, [product.id]: false }));
    }
  }, [user, tryOnVideoLoading, tryOns]);

  useEffect(() => {
    if (!user || tryOnMode || !hasSearchIntent || state.loading || trialProducts.length === 0) return;
    const runKey = `${searchSignature}:${trialProducts.map((product) => product.id).join(',')}`;
    if (autoKey.current === runKey) return;
    autoKey.current = runKey;
    trialProducts.filter((product) => !tryOns[product.id]).forEach((product) => generateTryOn(product));
  }, [user?.id, tryOnMode, hasSearchIntent, state.loading, searchSignature, trialProducts.map((product) => product.id).join(','), Object.keys(tryOns).join(',')]);

  const showStorefront = !tryOnMode && !hasSearchIntent && !filters.sort;
  const storefrontProducts = arrivalsState.products.slice(0, shopProductGridLimit);

  if (showStorefront) {
    return (
      <ScrollView style={styles.shopScreen} contentContainerStyle={styles.shopContent} {...screenScrollProps}>
        <ShopTopBar onNavigate={onNavigate} />

        <View style={styles.shopHero}>
          <Image source={images.shopHeroConfidence} style={styles.shopHeroImage} resizeMode="cover" />
          <View style={styles.shopHeroShade} />
          <View style={styles.shopHeroCopy}>
            <Text style={styles.shopHeroTitle}>CONFIDENCE</Text>
            <Text style={styles.shopHeroText}>Trendy pieces. Timeless style. FitLook has everything you need to look and feel your best.</Text>
            <TouchableOpacity style={styles.shopHeroButton} onPress={() => onNavigate('shop', { newArrival: true })}>
              <Text style={styles.shopHeroButtonText}>SHOP NEW IN</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.shopCategorySection}>
          <View style={styles.shopSectionHead}>
            <Text style={styles.shopSectionTitle}>Shop by Category</Text>
            <TouchableOpacity onPress={() => onNavigate('shop', { sort: 'newest' })}>
              <Text style={styles.shopViewAll}>View all -></Text>
            </TouchableOpacity>
          </View>
          <View style={styles.shopCategoryRow}>
            {shopCategoryItems.map(([label, image]) => (
              <View key={label} style={styles.shopCategoryItem}>
                <View style={styles.shopCategoryImageFrame}>
                  <Image source={images[image]} style={styles.shopCategoryImage} resizeMode="contain" />
                </View>
                <Text style={styles.shopCategoryLabel} numberOfLines={1}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.homeCurationTitle}>The Curation</Text>
        <View style={styles.homeCuratedGrid}>
          {arrivalsState.loading || arrivalsState.error || !storefrontProducts.length ? (
            <StatusPanel loading={arrivalsState.loading} error={arrivalsState.error} empty={!arrivalsState.loading && !storefrontProducts.length} text="No curated products found yet." />
          ) : storefrontProducts.map((product) => {
            return (
              <CurationProductCard
                key={product.id}
                product={product}
                onPress={() => onNavigate('product', { id: product.id })}
                onAddToWishlist={onAddToWishlist}
                isWishlisted={wishlistIds?.has(product.id)}
                user={user}
              />
            );
          })}
        </View>

        <TouchableOpacity style={styles.shopFloatingButton} onPress={() => onNavigate('tryon')}>
          <Ionicons name="sparkles" size={22} color="#ffffff" />
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={!tryOnMode && styles.shopScreen} contentContainerStyle={styles.scrollContent} {...screenScrollProps}>
      {!tryOnMode ? <ShopTopBar onNavigate={onNavigate} /> : <Hero compact onNavigate={onNavigate} />}
      <View style={styles.searchPanel}>
        <View style={styles.searchRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Search products, brands, categories"
            placeholderTextColor="#94a3b8"
            returnKeyType="search"
            onSubmitEditing={runSearch}
            style={styles.searchInput}
          />
          <TouchableOpacity style={styles.searchButton} onPress={runSearch}>
            <Ionicons name="search" size={20} color="#fff" />
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
          <Text style={styles.screenTitle}>{tryOnMode ? 'AI Try-On' : filters.q || filters.category || 'All Products'}</Text>
          <Text style={styles.muted}>{state.loading ? 'Searching...' : `${state.total} products`}</Text>
        </View>
      </View>

      <StatusPanel loading={state.loading} error={state.error} empty={!state.loading && !state.products.length} text="Try a different search or browse another category." />
      <View style={styles.productGrid}>
        {visibleProducts.map((product, index) => (
          <ProductCard
            key={product.id}
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
            onTryOn={allowTryOnTrial && index < 4 ? () => generateTryOn(product) : undefined}
            onTryOnVideo={allowTryOnTrial && tryOns[product.id]?.imageUrl ? () => generateTryOnVideo(product) : undefined}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function ProductScreen({ id, user, setUser, token, onNavigate, onAddToWishlist, wishlistIds }) {
  const { width } = useWindowDimensions();
  const [state, setState] = useState({ product: null, loading: true, error: '' });
  const [tryOn, setTryOn] = useState(null);
  const [tryOnLoading, setTryOnLoading] = useState(false);
  const [tryOnVideoLoading, setTryOnVideoLoading] = useState(false);
  const [tryOnError, setTryOnError] = useState('');
  const [tryOnVideoError, setTryOnVideoError] = useState('');
  const [selectedSize, setSelectedSize] = useState('Medium');
  const [lightbox, setLightbox] = useState(null);
  const related = useProducts({ category: state.product?.category || '', limit: 5 }, token);
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
    if (!user || !id) {
      setTryOn(null);
      return undefined;
    }
    let alive = true;
    api(`/tryons?productIds=${encodeURIComponent(id)}`)
      .then((data) => alive && setTryOn(data.tryOns?.[0] || null))
      .catch(() => alive && setTryOn(null));
    return () => {
      alive = false;
    };
  }, [id, user?.id, user?.bodyPhotoUrl, token]);

  const generate = async () => {
    if (!user) {
      onNavigate('signup');
      return;
    }
    if (tryOnLoading || !state.product?.id) return;
    setTryOnLoading(true);
    setTryOnError('');
    try {
      const data = await api(`/tryons/${state.product.id}`, {
        method: 'POST',
        body: tryOn?.imageUrl ? JSON.stringify({ force: true }) : undefined
      });
      setTryOn(data.tryOn);
      if (data.user) setUser(data.user);
    } catch (error) {
      setTryOnError(error.message);
    } finally {
      setTryOnLoading(false);
    }
  };

  const generateVideo = async () => {
    if (!user) {
      onNavigate('signup');
      return;
    }
    if (tryOnVideoLoading || !tryOn?.imageUrl || !state.product?.id) return;
    setTryOnVideoLoading(true);
    setTryOnVideoError('');
    try {
      const data = await api(`/tryons/${state.product.id}/video`, {
        method: 'POST',
        body: tryOn?.videoUrl ? JSON.stringify({ force: true }) : undefined,
        timeoutMs: 180000
      });
      setTryOn(data.tryOn);
      if (data.user) setUser(data.user);
    } catch (error) {
      setTryOnVideoError(error.message);
    } finally {
      setTryOnVideoLoading(false);
    }
  };

  if (state.loading || state.error || !state.product) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} {...screenScrollProps}>
        <StatusPanel loading={state.loading} error={state.error} empty={!state.loading && !state.product} text="This item may have been removed from the catalog." />
      </ScrollView>
    );
  }

  const product = state.product;
  const originalUri = imageUrl(product.imageUrl);
  const tryOnUri = imageUrl(tryOn?.imageUrl);
  const tryOnVideoUri = imageUrl(tryOn?.videoUrl);
  const mediaWidth = Math.max(1, Math.round(width - 28));
  const mediaItems = [
    tryOnVideoUri ? { key: 'video', label: 'Video Try-On', type: 'video', uri: tryOnVideoUri } : null,
    tryOnUri ? { key: 'tryon', label: 'AI Try-On', source: { uri: tryOnUri }, uri: tryOnUri } : null,
    { key: 'original', label: 'Original Product', source: originalUri ? { uri: originalUri } : null, uri: originalUri, product }
  ].filter(Boolean);
  const detailTags = [
    titleCase(product.category || ''),
    product.fit || '',
    titleCase(product.gender || '')
  ].filter(Boolean).slice(0, 3);
  const colorLabel = product.colors?.[0]?.name ? product.colors[0].name.toString().toUpperCase() : '';
  const sizeOptions = product.sizes?.length ? product.sizes : [];
  const detailRows = ['PRODUCT DETAILS', 'FIT & CARE', 'SHIPPING & RETURNS'];
  const mediaHeight = Math.min(520, Math.max(360, Math.round((width - 28) * 1.31)));

  return (
    <ScrollView style={styles.productDetailScreen} contentContainerStyle={styles.productDetailContent} {...screenScrollProps}>
      <ProductTopBar onNavigate={onNavigate} />
      <View style={styles.productBreadcrumb}>
        <TouchableOpacity onPress={() => onNavigate('home')}><Text style={styles.productCrumbText}>Home</Text></TouchableOpacity>
        <Text style={styles.productCrumbText}>Collections</Text>
        <Text style={styles.productCrumbCurrent} numberOfLines={1}>{product.name}</Text>
      </View>

      <View style={[styles.productHeroMedia, { height: mediaHeight }]}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productMediaTrack}>
          {mediaItems.map((item, index) => (
            <Pressable key={item.key} style={[styles.productMediaSlide, { width: mediaWidth }]} onPress={() => item.type !== 'video' && item.uri && setLightbox(item.uri)}>
              {item.type === 'video' ? (
                <TryOnVideoPlayer uri={item.uri} style={styles.productHeroVideo} nativeControls />
              ) : item.source ? (
                <Image source={item.source} style={styles.productHeroImage} resizeMode="contain" />
              ) : (
                <ProductImage product={item.product} style={styles.productHeroImage} resizeMode="contain" alt={product.title} />
              )}
              <Text style={styles.productMediaBadge}>{item.label}</Text>
              {mediaItems.length > 1 ? <Text style={styles.productMediaCount}>{index + 1}/{mediaItems.length}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.productFavoriteButton}>
          <Ionicons name="heart-outline" size={24} color="#5d5754" />
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
        <View style={styles.productSummaryTop}>
          <View style={styles.productSummaryTitleBlock}>
            <Text style={styles.productBrandLabel}>{product.displayLabel || titleCase(product.category || 'Catalog')}</Text>
            <Text style={styles.productNameText}>{product.title || product.name}</Text>
          </View>
          <View style={styles.productPriceBlock}>
            <Text style={styles.productDetailPrice}>{Number.isFinite(Number(product.price)) ? formatMoney(Number(product.price), product.currency) : 'Price unavailable'}</Text>
            {product.rating ? (
              <View style={styles.productRatingLine}>
                <Ionicons name="star" size={12} color="#9b5658" />
                <Text style={styles.productRatingText}>{Number(product.rating).toFixed(1)} {product.ratingCount ? `(${product.ratingCount})` : ''}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.productTagRow}>
          {detailTags.map((tag) => <Text key={tag} style={styles.productSoftTag}>{tag}</Text>)}
        </View>

        {colorLabel ? (
          <>
            <Text style={styles.productOptionLabel}>COLOR: <Text style={styles.productOptionValue}>{colorLabel}</Text></Text>
            <View style={styles.productSwatchRow}>
              {product.colors.slice(0, 6).map((color, index) => <View key={color.name} style={[styles.productColorSwatch, index === 0 && styles.productColorSwatchActive, { backgroundColor: color.value }]} />)}
            </View>
          </>
        ) : null}

        {sizeOptions.length ? (
          <>
            <View style={styles.productSizeHead}>
              <Text style={styles.productOptionLabel}>SELECT SIZE</Text>
              <TouchableOpacity><Text style={styles.productSizeGuide}>Size Guide</Text></TouchableOpacity>
            </View>
            <View style={styles.productSizeRow}>
              {sizeOptions.map((size) => (
                <TouchableOpacity key={size} style={[styles.productSizeButton, selectedSize === size && styles.productSizeButtonActive]} onPress={() => setSelectedSize(size)}>
                  <Text style={[styles.productSizeText, selectedSize === size && styles.productSizeTextActive]}>{size}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.productActionRow}>
          <ProductActionButton label="Shop" icon="bag-handle-outline" active onPress={() => product.affiliateLink ? Linking.openURL(product.affiliateLink) : onNavigate('shop')} />
          <ProductActionButton
            label={tryOnLoading ? 'Trying...' : 'Try On'}
            icon="sparkles-outline"
            disabled={tryOnLoading}
            onPress={generate}
          />
          <ProductActionButton
            label={tryOnVideoLoading ? 'Video...' : 'Video'}
            icon="play-circle-outline"
            disabled={tryOnLoading || tryOnVideoLoading || !tryOn?.imageUrl}
            onPress={generateVideo}
          />
        </View>
        {tryOnError ? <Text style={styles.errorText}>{tryOnError}</Text> : null}
        {tryOnVideoError ? <Text style={styles.errorText}>{tryOnVideoError}</Text> : null}
      </View>

      <View style={styles.productBenefitsBand}>
        <View style={styles.productBenefitItem}>
          <Ionicons name="pricetag-outline" size={22} color="#9b5658" />
          <Text style={styles.productBenefitTitle}>CATEGORY</Text>
          <Text style={styles.productBenefitText}>{titleCase(product.category || 'Catalog')}</Text>
        </View>
        <View style={styles.productBenefitItem}>
          <Ionicons name="sparkles-outline" size={22} color="#9b5658" />
          <Text style={styles.productBenefitTitle}>TRY-ON MODEL</Text>
          <Text style={styles.productBenefitText}>{tryOnModelLabel(product.tryOnModel)}</Text>
        </View>
      </View>

      <View style={styles.productAccordion}>
        {detailRows.map((row) => (
          <TouchableOpacity key={row} style={styles.productAccordionRow}>
            <Text style={styles.productAccordionText}>{row}</Text>
            <Ionicons name="add" size={17} color="#4f4a48" />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.productStorySection}>
        <Text style={styles.productStoryTitle}>Product Notes</Text>
        <Text style={styles.productStoryText}>
          {product.description || 'No additional product description is available yet.'}
        </Text>
        <ProductImage product={product} style={styles.productStoryImage} resizeMode="cover" alt={product.title} />
      </View>

      <View style={styles.completeLookSection}>
        <View style={styles.completeLookHead}>
          <Text style={styles.completeLookTitle}>Complete the Look</Text>
          <TouchableOpacity onPress={() => onNavigate('shop', { category: product.category })}>
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
          }) : <StatusPanel empty text="No related products found yet." />}
        </View>
      </View>

      <View style={styles.productAtelierFooter}>
        <Text style={styles.productAtelierTitle}>Join the Atelier</Text>
        <Text style={styles.productAtelierCopy}>Receive curated collection previews and editorial insights directly to your inbox.</Text>
        <View style={styles.productEmailBox}>
          <TextInput style={styles.productEmailInput} placeholder="email@example.com" placeholderTextColor="#6d6d6d" autoCapitalize="none" keyboardType="email-address" />
          <TouchableOpacity style={styles.productSubmitButton}>
            <Text style={styles.productSubmitText}>Submit</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.productFooterDivider} />
        <Text style={styles.productFooterBrand}>FITLOOK</Text>
        <Text style={styles.productFooterCopy}>© 2024 DESIGNED IN MILAN</Text>
        <View style={styles.productFooterLinks}>
          <View>
            <Text style={styles.productFooterHead}>THE HOUSE</Text>
            <Text style={styles.productFooterLink}>Philosophy</Text>
            <Text style={styles.productFooterLink}>Sustainability</Text>
            <Text style={styles.productFooterLink}>Stores</Text>
          </View>
          <View>
            <Text style={styles.productFooterHead}>SUPPORT</Text>
            <Text style={styles.productFooterLink}>Care Guide</Text>
            <Text style={styles.productFooterLink}>Concierge</Text>
            <Text style={styles.productFooterLink}>Shipping</Text>
          </View>
        </View>
      </View>
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </ScrollView>
  );
}

function AuthScreen({ mode, setUser, setToken, onNavigate }) {
  const isSignup = mode === 'signup';
  const { width, height } = useWindowDimensions();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [usernameSuggestions, setUsernameSuggestions] = useState([]);
  const [genderPreference, setGenderPreference] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [profilePhotoMode, setProfilePhotoMode] = useState('ai-full-body');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const authScreenPadding = clamp(width * 0.075, 24, 40);
  const signupTitleSize = clamp(width * 0.145, 44, 60);
  const signupSubtitleSize = clamp(width * 0.055, 18, 23);
  const signupInputHeight = clamp(height * 0.072, 62, 77);
  const signupInputFontSize = clamp(width * 0.054, 18, 22);
  const signupButtonTextSize = clamp(width * 0.048, 16, 20);
  const loginHeroHeight = clamp(height * 0.38, 300, 540);
  const loginHeroTitleSize = clamp(width * 0.112, 36, 54);
  const loginHeroTextSize = clamp(width * 0.049, 17, 24);
  const loginTitleSize = clamp(width * 0.086, 30, 43);
  const loginInputHeight = clamp(height * 0.064, 60, 76);
  const loginPanelTop = clamp(height * 0.043, 34, 60);
  const loginTabTop = clamp(height * 0.052, 40, 76);
  const loginFieldTop = clamp(height * 0.043, 34, 62);
  const loginFieldGap = clamp(height * 0.024, 22, 32);

  useEffect(() => {
    if (!isSignup) return undefined;
    const cleanName = name.trim();
    if (!cleanName) {
      setUsernameSuggestions([]);
      if (!usernameTouched) setUsername('');
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(() => {
      api(`/auth/username-suggestions?name=${encodeURIComponent(cleanName)}`)
        .then((data) => {
          if (!alive) return;
          const suggestions = data.suggestions || [];
          setUsernameSuggestions(suggestions);
          if (!usernameTouched && suggestions[0]) setUsername(suggestions[0]);
        })
        .catch(() => {
          if (alive) setUsernameSuggestions([]);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [isSignup, name, usernameTouched]);

  const submit = async () => {
    if (!email || !password || (isSignup && (!name || !username || !genderPreference || !photo))) {
      setMessage(isSignup ? 'Name, username, gender preference, email, password, and profile photo are required.' : 'Email/username and password are required.');
      return;
    }
    if (isSignup && !termsAccepted) {
      setMessage('Please agree to the Terms & Conditions and Privacy Policy.');
      return;
    }
    setLoading(true);
    setMessage('Working...');
    try {
      const body = isSignup ? new FormData() : JSON.stringify({ email, password });
      if (isSignup) {
        body.append('name', name);
        body.append('username', username);
        body.append('genderPreference', genderPreference);
        body.append('email', email);
        body.append('password', password);
        body.append('profilePhotoMode', profilePhotoMode);
        body.append('bodyPhoto', filePart(photo, 'body-photo.jpg'));
      }
      const data = await api(isSignup ? '/auth/signup' : '/auth/login', { method: 'POST', body, timeoutMs: isSignup ? 60000 : 12000 });
      await saveToken(data.token);
      setToken(data.token);
      setUser(data.user);
      onNavigate('home');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (isSignup) {
    const inputFields = [
      {
        key: 'name',
        icon: 'person-outline',
        placeholder: 'Full Name',
        value: name,
        onChangeText: setName,
        autoCapitalize: 'words'
      },
      {
        key: 'username',
        icon: 'person-circle-outline',
        placeholder: 'Choose a Username',
        value: username,
        onChangeText: (value) => {
          setUsernameTouched(true);
          setUsername(value.toLowerCase().replace(/[^a-z0-9_]/g, ''));
        },
        autoCapitalize: 'none'
      },
      {
        key: 'email',
        icon: 'mail-outline',
        placeholder: 'Email Address',
        value: email,
        onChangeText: setEmail,
        autoCapitalize: 'none',
        keyboardType: 'email-address'
      }
    ];

    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.signupScreen}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.signupContent, { paddingHorizontal: authScreenPadding, paddingTop: clamp(height * 0.045, 28, 54) }]}
          {...screenScrollProps}
        >
          <Text style={styles.signupBrand}>FitLook</Text>
          <Text style={[styles.signupTitle, { fontSize: signupTitleSize, lineHeight: signupTitleSize * 1.2 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.86}>
            Create Your{'\n'}Account
          </Text>
          <Text style={[styles.signupSubtitle, { fontSize: signupSubtitleSize, lineHeight: signupSubtitleSize * 1.35 }]}>Join FitLook and elevate your fashion game</Text>

          <View style={styles.signupFieldStack}>
            {inputFields.map((field) => (
              <View key={field.key} style={[styles.signupInputWrap, { minHeight: signupInputHeight }]}>
                <Ionicons name={field.icon} size={25} color="#7a7d80" />
                <TextInput
                  style={[styles.signupInput, { fontSize: signupInputFontSize }]}
                  value={field.value}
                  onChangeText={field.onChangeText}
                  placeholder={field.placeholder}
                  placeholderTextColor="#6f7687"
                  autoCapitalize={field.autoCapitalize}
                  keyboardType={field.keyboardType || 'default'}
                />
              </View>
            ))}
            {usernameSuggestions.length ? (
              <View style={styles.signupSuggestionRow}>
                {usernameSuggestions.slice(0, 3).map((item) => (
                  <TouchableOpacity key={item} style={styles.signupSuggestionChip} onPress={() => { setUsernameTouched(true); setUsername(item); }}>
                    <Text style={styles.signupSuggestionText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <View style={[styles.signupInputWrap, { minHeight: signupInputHeight }]}>
              <Ionicons name="lock-closed-outline" size={25} color="#7a7d80" />
              <TextInput
                style={[styles.signupInput, { fontSize: signupInputFontSize }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Create Password"
                placeholderTextColor="#6f7687"
                secureTextEntry={!passwordVisible}
              />
              <TouchableOpacity style={styles.signupInlineIcon} onPress={() => setPasswordVisible((current) => !current)}>
                <Ionicons name={passwordVisible ? 'eye-outline' : 'eye-off-outline'} size={26} color="#7a7d80" />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.signupSectionLabel}>GENDER PREFERENCE</Text>
          <View style={styles.signupGenderRow}>
            {[
              ['female', 'Woman'],
              ['male', 'Man'],
              ['other', 'Non-binary']
            ].map(([value, label]) => {
              const active = genderPreference === value;
              return (
                <TouchableOpacity key={value} style={[styles.signupGenderButton, active && styles.signupGenderButtonActive]} onPress={() => setGenderPreference(value)}>
                  <Text style={[styles.signupGenderText, { fontSize: signupButtonTextSize }, active && styles.signupGenderTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.signupPhotoRow}>
            <TouchableOpacity style={styles.signupPhotoButton} onPress={async () => setPhoto(await pickImage())}>
              <Ionicons name={photo ? 'checkmark-circle-outline' : 'share-outline'} size={25} color="#111111" />
              <Text style={[styles.signupPhotoButtonText, { fontSize: signupButtonTextSize }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                {photo ? 'Photo Selected' : 'Upload a Photo'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.signupPhotoButton} onPress={async () => setPhoto(await takePhoto())}>
              <Ionicons name="camera-outline" size={25} color="#111111" />
              <Text style={[styles.signupPhotoButtonText, { fontSize: signupButtonTextSize }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                Take a Photo
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.signupModeRow}>
            {[
              ['ai-full-body', 'Create Full Body AI\nProfile'],
              ['exact', 'Use Current Photo']
            ].map(([value, label]) => {
              const active = profilePhotoMode === value;
              return (
                <TouchableOpacity key={value} style={[styles.signupModeButton, active && styles.signupModeButtonActive]} onPress={() => setProfilePhotoMode(value)}>
                  <Text style={[styles.signupModeText, active && styles.signupModeTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.signupTermsRow} activeOpacity={0.75} onPress={() => setTermsAccepted((current) => !current)}>
            <View style={[styles.signupCheckbox, termsAccepted && styles.signupCheckboxActive]}>
              {termsAccepted ? <Ionicons name="checkmark" size={17} color="#ffffff" /> : null}
            </View>
            <Text style={styles.signupTermsText}>
              I agree to the <Text style={styles.signupTermsLink}>Terms & Conditions</Text> and <Text style={styles.signupTermsLink}>Privacy{'\n'}Policy</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.signupSubmit, loading && styles.signupSubmitDisabled]} activeOpacity={0.88} disabled={loading} onPress={submit}>
            <Text style={styles.signupSubmitText}>{loading ? 'Working...' : 'Sign Up'}</Text>
            <Ionicons name="arrow-forward" size={20} color="#ffffff" />
          </TouchableOpacity>

          {message ? <Text style={[styles.formMessage, styles.signupMessage, message === 'Working...' ? null : styles.errorText]}>{message}</Text> : null}

          <TouchableOpacity style={styles.signupSwitch} onPress={() => onNavigate('login')}>
            <Text style={styles.signupSwitchText}>Already have an account? <Text style={styles.signupSwitchLink}>Login</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.loginScreen}>
      <ScrollView contentContainerStyle={styles.loginContent} {...screenScrollProps}>
        <View style={[styles.loginHero, { height: loginHeroHeight }]}>
          <Image source={images.hero} style={styles.loginHeroImage} resizeMode="cover" />
          <View style={styles.loginHeroOverlay} />
          <View style={[styles.loginHeroCopy, { paddingHorizontal: authScreenPadding }]}>
            <Text style={[styles.loginHeroTitle, { fontSize: loginHeroTitleSize, lineHeight: loginHeroTitleSize * 1.2 }]} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.82}>
              FITLOOK{'\n'}AI FASHION{'\n'}TRY-ON{'\n'}EXPERIENCE
            </Text>
            <Text style={[styles.loginHeroText, { marginTop: clamp(height * 0.045, 28, 64), fontSize: loginHeroTextSize, lineHeight: loginHeroTextSize * 1.5 }]}>
              See it on you before you buy it.{'\n'}Experience the future of personal{'\n'}styling.
            </Text>
          </View>
        </View>

        <View style={[styles.loginPanel, { paddingHorizontal: authScreenPadding, paddingTop: loginPanelTop }]}>
          <Text style={[styles.loginTitle, { fontSize: loginTitleSize, lineHeight: loginTitleSize * 1.18 }]}>Welcome Back</Text>
          <Text style={[styles.loginSubtitle, { fontSize: clamp(width * 0.045, 17, 21), lineHeight: clamp(width * 0.06, 23, 28) }]}>Login to continue your fashion journey</Text>

          <View style={[styles.loginTabWrap, { marginTop: loginTabTop }]}>
            <Text style={styles.loginTabText}>Email</Text>
            <View style={styles.loginTabLine} />
            <View style={styles.loginTabFaintLine} />
          </View>

          <View style={[styles.loginFieldStack, { marginTop: loginFieldTop, gap: loginFieldGap }]}>
            <View style={[styles.loginInputWrap, { minHeight: loginInputHeight }]}>
              <Ionicons name="mail-outline" size={25} color="#555a5d" />
              <TextInput
                style={styles.loginInput}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                placeholderTextColor="#6f7687"
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={[styles.loginInputWrap, { minHeight: loginInputHeight }]}>
              <Ionicons name="lock-closed-outline" size={25} color="#555a5d" />
              <TextInput
                style={styles.loginInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                placeholderTextColor="#6f7687"
                secureTextEntry={!passwordVisible}
              />
              <TouchableOpacity style={styles.signupInlineIcon} onPress={() => setPasswordVisible((current) => !current)}>
                <Ionicons name={passwordVisible ? 'eye-outline' : 'eye-off-outline'} size={26} color="#555a5d" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.loginOptionsRow}>
            <TouchableOpacity style={styles.loginRemember} activeOpacity={0.75} onPress={() => setRememberMe((current) => !current)}>
              <View style={[styles.loginCheckbox, rememberMe && styles.signupCheckboxActive]}>
                {rememberMe ? <Ionicons name="checkmark" size={16} color="#ffffff" /> : null}
              </View>
              <Text style={styles.loginOptionText}>Remember me</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.75}>
              <Text style={styles.loginForgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.loginTermsText}>
            By continuing, you agree to our <Text style={styles.loginTermsLink}>Terms & Conditions</Text>{'\n'}and Privacy Policy
          </Text>
          <View style={styles.loginTermsUnderline} />

          <TouchableOpacity style={[styles.loginSubmit, loading && styles.signupSubmitDisabled]} activeOpacity={0.88} disabled={loading} onPress={submit}>
            <Text style={styles.loginSubmitText}>{loading ? 'Working...' : 'Login'}</Text>
            <Ionicons name="arrow-forward" size={22} color="#ffffff" />
          </TouchableOpacity>

          {message ? <Text style={[styles.formMessage, styles.signupMessage, message === 'Working...' ? null : styles.errorText]}>{message}</Text> : null}

          <TouchableOpacity style={styles.loginSwitch} onPress={() => onNavigate('signup')}>
            <Text style={styles.loginSwitchText}>New to FitLook? <Text style={styles.loginSwitchLink}>Sign up</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const authEntryFeatures = ['Virtual AI Try-On', 'Smart Digital Closet', 'Personal AI Stylist'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function AuthEntryScreen({ onNavigate }) {
  const { width, height } = useWindowDimensions();
  const compact = height < 720 || width < 360;
  const framePaddingX = clamp(width * 0.068, 18, 32);
  const framePaddingTop = clamp(height * 0.025, 12, 28);
  const framePaddingBottom = clamp(height * 0.022, 12, 24);
  const logoSize = clamp(width * 0.168, 50, 70);
  const taglineSize = clamp(width * 0.05, 15, 21);
  const taglineSpace = clamp(width * 0.01, 2.4, 4);
  const featureHeight = clamp(height * 0.104, 70, 92);
  const featureGap = clamp(height * 0.027, 14, 28);
  const featurePaddingX = clamp(width * 0.08, 18, 33);
  const featureIconSize = clamp(width * 0.072, 24, 30);
  const featureTextSize = clamp(width * 0.056, 18, 22);
  const ctaHeight = clamp(height * 0.085, 62, 78);
  const ctaFontSize = clamp(width * 0.052, 17, 20);
  const exploreFontSize = clamp(width * 0.055, 18, 22);
  const exploreLetterSpacing = clamp(width * 0.012, 3, 5);
  const indicatorWidth = clamp(width * 0.16, 48, 66);
  const backgroundScale = width < 360 ? 1.1 : 1.05;

  return (
    <ScrollView
      style={styles.authEntryScroll}
      contentContainerStyle={[
        styles.authEntryContent,
        {
          paddingHorizontal: framePaddingX,
          paddingTop: framePaddingTop,
          paddingBottom: framePaddingBottom
        }
      ]}
      showsVerticalScrollIndicator={false}
      {...screenScrollProps}
    >
      <Image source={images.hero} style={[styles.authEntryBackground, { transform: [{ scale: backgroundScale }] }]} resizeMode="cover" />
      <View style={styles.authEntryImageWash} />
      <View style={styles.authEntryShadow} />

      <View style={[styles.authEntryMain, compact && styles.authEntryMainCompact]}>
        <View style={styles.authEntryBrand}>
          <Text style={[styles.authEntryLogo, { fontSize: logoSize, lineHeight: logoSize * 1.08 }]}>FitLook</Text>
          <Text style={[styles.authEntryTagline, { fontSize: taglineSize, lineHeight: taglineSize * 1.48, letterSpacing: taglineSpace }]}>AI-POWERED FASHION</Text>
          <Text style={[styles.authEntryTagline, { fontSize: taglineSize, lineHeight: taglineSize * 1.48, letterSpacing: taglineSpace }]}>EXPERIENCE</Text>
        </View>

        <View style={[styles.authEntryFeatureList, { gap: featureGap }]}>
          {authEntryFeatures.map((feature) => (
            <View key={feature} style={[styles.authEntryFeature, { minHeight: featureHeight, paddingHorizontal: featurePaddingX, gap: clamp(width * 0.065, 16, 32) }]}>
              <View style={[styles.authEntryCheck, { width: featureIconSize, height: featureIconSize, borderRadius: featureIconSize / 2 }]}>
                <Ionicons name="checkmark" size={featureIconSize * 0.68} color="#6f3e36" />
              </View>
              <Text style={[styles.authEntryFeatureText, { fontSize: featureTextSize, lineHeight: featureTextSize * 1.25 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.84}>
                {feature}
              </Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={[styles.authEntryCta, { minHeight: ctaHeight, borderRadius: ctaHeight / 2 }]} activeOpacity={0.88} onPress={() => onNavigate('signup')}>
          <Text style={[styles.authEntryCtaText, { fontSize: ctaFontSize }]}>GET STARTED</Text>
          <Ionicons name="arrow-forward" size={ctaFontSize + 1} color="#151515" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.authEntryExplore} activeOpacity={0.75} onPress={() => onNavigate('home')}>
          <Text style={[styles.authEntryExploreText, { fontSize: exploreFontSize, lineHeight: exploreFontSize * 1.28, letterSpacing: exploreLetterSpacing }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
            EXPLORE FITLOOK
          </Text>
        </TouchableOpacity>

        <View style={[styles.authEntryHomeIndicator, { width: indicatorWidth }]} />
      </View>
    </ScrollView>
  );
}

const closetCategories = ['tops', 'bottoms', 'dresses', 'suits', 'outerwear', 'shoes', 'accessories', 'activewear', 'ethnic', 'other'];
const closetOccasions = ['today casual', 'office meeting', 'date night', 'party', 'wedding function', 'college day', 'travel', 'rainy weather'];
const closetSceneOptions = {
  backdrop: ['neutral studio', 'office lobby', 'cafe', 'outdoor street', 'wedding venue'],
  pose: ['front facing', 'relaxed standing', 'walking pose', 'three-quarter angle'],
  lighting: ['natural light', 'studio softbox', 'evening warm', 'bright daylight']
};
const closetComboSlots = [
  { key: 'topwear', label: 'Topwear', helper: 'Shirts, tops, kurtas', short: 'To', categories: ['tops', 'outerwear', 'ethnic'] },
  { key: 'bottomwear', label: 'Bottomwear', helper: 'Pants, denim, skirts', short: 'Bo', categories: ['bottoms'] },
  { key: 'goggles', label: 'Goggles', helper: 'Glasses and shades', short: 'Go', categories: ['accessories'], keywords: ['goggle', 'goggles', 'glass', 'glasses', 'sunglass', 'eyewear'] },
  { key: 'cap', label: 'Cap', helper: 'Caps and hats', short: 'Ca', categories: ['accessories'], keywords: ['cap', 'hat'] },
  { key: 'footwear', label: 'Footwear', helper: 'Shoes, boots, sandals', short: 'Fo', categories: ['shoes'] }
];
const wardrobeCategoryTabs = [
  { key: 'tops', label: 'Tops', icon: 'shirt-outline', slot: 'topwear' },
  { key: 'bottoms', label: 'Bottoms', icon: 'accessibility-outline', slot: 'bottomwear' },
  { key: 'outerwear', label: 'Outerwear', icon: 'body-outline', slot: 'topwear' },
  { key: 'shoes', label: 'Shoes', icon: 'walk-outline', slot: 'footwear' },
  { key: 'accessories', label: 'Accessori', icon: 'sparkles-outline', slot: 'goggles' }
];
const wardrobeFallbackRecommendations = [
  { title: 'Urban Sophisticate', images: ['trending-2.jpg', 'category-3.jpg', 'category-6.jpg'] },
  { title: 'Neutral Casual', images: ['arrival-1.jpg', 'arrival-2.jpg', 'category-8.jpg'] },
  { title: 'Soft Gallery Fit', images: ['arrival-4.jpg', 'category-4.jpg', 'category-6.jpg'] }
];

function WardrobeTopBar({ user, onNavigate }) {
  return <AppHeader onNavigate={onNavigate} user={user} leftIcon="bag-handle-outline" leftRoute="tokens" rightRoute="profile" rightIcon="person-outline" showAvatar />;
}

function WardrobeRecommendationCard({ suggestion, fallback, onPress }) {
  const suggestionItems = suggestion?.items || [];
  const title = suggestion?.title || fallback.title;
  const thumbnails = suggestionItems.length
    ? suggestionItems.slice(0, 3).map((item) => ({ key: item.id, source: item.imageUrl ? { uri: imageUrl(item.imageUrl) } : images.hero }))
    : fallback.images.map((image) => ({ key: image, source: images[image] }));

  return (
    <TouchableOpacity style={styles.wardrobeRecommendationCard} activeOpacity={0.86} onPress={onPress}>
      <View style={styles.wardrobeRecommendationImages}>
        {thumbnails.map((thumb) => <Image key={thumb.key} source={thumb.source} style={styles.wardrobeRecommendationImage} resizeMode="cover" />)}
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

function ClosetScreen({ user, setUser, setToken, token, onNavigate, initial = {} }) {
  const emptyCloset = { items: [], outfits: [], suggestions: [], stats: {} };
  const closet = useApiState('/closet', token, Boolean(user), emptyCloset);
  const [closetView, setClosetView] = useState(initial.view === 'add' ? 'add' : 'stylist');
  const [selectedIds, setSelectedIds] = useState([]);
  const [comboSlots, setComboSlots] = useState({});
  const [activeSlot, setActiveSlot] = useState('topwear');
  const [filter, setFilter] = useState('all');
  const [itemPhoto, setItemPhoto] = useState(null);
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState(initial.view === 'add' ? 'dresses' : 'tops');
  const [itemColor, setItemColor] = useState('');
  const [itemFabric, setItemFabric] = useState('');
  const [itemPattern, setItemPattern] = useState('');
  const [itemSeason, setItemSeason] = useState(initial.view === 'add' ? 'summer' : 'all-season');
  const [itemFormality, setItemFormality] = useState('any');
  const [itemOccasions, setItemOccasions] = useState('');
  const [itemTags, setItemTags] = useState('');
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
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    if (initial.view === 'add') setClosetView('add');
    else setClosetView((current) => current === 'add' ? 'stylist' : current);
  }, [initial.view]);

  if (!user) return <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={onNavigate} />;

  const isAddStudio = initial.view === 'add' || closetView === 'add';

  const items = closet.data.items || [];
  const outfits = closet.data.outfits || [];
  const suggestions = suggestionOverrides || closet.data.suggestions || [];
  const latestOutfit = outfits[0];
  const selectedItems = selectedIds.map((id) => items.find((item) => item.id === id)).filter(Boolean);
  const filteredItems = items.filter((item) => filter === 'all' || item.category === filter);
  const selectedKey = selectedIds.slice().sort().join(':');
  const mainPreview = latestOutfit?.imageUrl || user.bodyPhotoUrl || null;
  const comboPreviewItems = (selectedItems.length ? selectedItems : items.filter((item) => ['tops', 'bottoms', 'suits', 'outerwear', 'shoes'].includes(item.category))).slice(0, 4);
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
  const activeWardrobeCategory = wardrobeCategoryTabs.find((tab) => tab.key === filter) || wardrobeCategoryTabs.find((tab) => tab.slot === activeSlot) || wardrobeCategoryTabs[0];
  const wardrobePreviewSource = mainPreview
    ? { uri: imageUrl(mainPreview) }
    : comboPreviewItems[0]?.imageUrl
      ? { uri: imageUrl(comboPreviewItems[0].imageUrl) }
      : images['arrival-4.jpg'];
  const comboSlotSelectedIds = [...new Set(Object.values(comboSlots).filter(Boolean))];
  const tryThisLookIds = selectedIds.length
    ? selectedIds
    : comboSlotSelectedIds.length
      ? comboSlotSelectedIds
      : comboPreviewItems.map((item) => item.id).filter(Boolean);
  const wardrobeScore = Math.min(96, 78 + Math.min(items.length, 4) * 2 + Math.min(selectedIds.length, 3));
  const recommendationSource = suggestions.slice(0, 3);

  const toggleItem = (id) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id].slice(-5));
  };

  const selectedIdsFromSlots = (slots) => [...new Set(Object.values(slots).filter(Boolean))];

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
    if (!itemPhoto) {
      setMessage('Upload a closet item photo first.');
      return;
    }
    setBusy('add');
    setMessage('Saving closet item...');
    try {
      const form = new FormData();
      form.append('item', filePart(itemPhoto, 'closet-item.jpg'));
      form.append('name', itemName || itemPhoto.fileName || 'Closet item');
      form.append('category', itemCategory);
      form.append('color', itemColor);
      form.append('fabric', itemFabric);
      form.append('pattern', itemPattern);
      form.append('season', itemSeason);
      form.append('formality', itemFormality);
      form.append('occasions', itemOccasions);
      form.append('tags', itemTags);
      await api('/closet/items', { method: 'POST', body: form });
      setSuggestionOverrides(null);
      setItemPhoto(null);
      setItemName('');
      setItemColor('');
      setItemFabric('');
      setItemPattern('');
      setItemSeason('all-season');
      setItemFormality('any');
      setItemOccasions('');
      setItemTags('');
      setMessage('Closet item added.');
      closet.reload();
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
    setBusy('generate');
    setMessage('Generating your closet look with FitRoom...');
    try {
      const data = await api('/closet/outfits/generate', {
        method: 'POST',
        body: JSON.stringify({
          itemIds: ids,
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
      if (data.user) setUser(data.user);
      setSuggestionOverrides(null);
      setMessage('Closet look is ready.');
      setSelectedIds(ids);
      closet.reload();
      if (data.outfit?.imageUrl) setLightbox(imageUrl(data.outfit.imageUrl));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  };

  const askForSuggestions = async (nextOccasion = occasion) => {
    setOccasion(nextOccasion);
    setBusy('suggest');
    setMessage('Finding the best combos from your closet...');
    try {
      const data = await api('/closet/suggest', {
        method: 'POST',
        body: JSON.stringify({ occasion: nextOccasion, weather, mood })
      });
      setSuggestionOverrides(data.suggestions || []);
      setMessage('Suggestions ready.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  };

  const askStylist = async () => {
    const prompt = stylistText.trim();
    if (!prompt) return;
    setBusy('chat');
    setMessage('Asking closet stylist...');
    setChat((current) => [...current, { role: 'user', text: prompt }]);
    try {
      const data = await api('/closet/chat', { method: 'POST', body: JSON.stringify({ message: prompt }) });
      const reply = data.reply || 'Stylist suggestions are ready.';
      setChat((current) => [...current, { role: 'assistant', text: reply }]);
      setMessage(reply);
      if (data.suggestions?.[0]) setSelectedIds(data.suggestions[0].itemIds || []);
      if (data.suggestions) setSuggestionOverrides(data.suggestions);
      setStylistText('');
    } catch (error) {
      setChat((current) => [...current, { role: 'assistant', text: error.message }]);
      setMessage(error.message);
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

  const discardAddDraft = () => {
    setItemPhoto(null);
    setItemName('');
    setItemColor('');
    setItemFabric('');
    setItemPattern('');
    setItemSeason('all-season');
    setItemFormality('any');
    setItemOccasions('');
    setItemTags('');
    setMessage('');
    onNavigate('closet');
  };

  const cycleItemCategory = () => {
    const order = ['dresses', 'tops', 'bottoms', 'outerwear', 'shoes', 'accessories'];
    const currentIndex = order.indexOf(itemCategory);
    setItemCategory(order[(currentIndex + 1) % order.length]);
  };

  if (isAddStudio) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.addStudioScreen}>
        <ScrollView contentContainerStyle={styles.addStudioContent} {...screenScrollProps}>
          <View style={styles.addStudioTopBar}>
            <TouchableOpacity style={styles.addStudioTopButton} onPress={discardAddDraft}>
              <Ionicons name="close" size={24} color="#171412" />
            </TouchableOpacity>
            <Text style={styles.addStudioBrand}>FitLook</Text>
            <TouchableOpacity style={styles.addStudioTopButton} onPress={() => onNavigate('closet')}>
              <Ionicons name="cube-outline" size={22} color="#171412" />
            </TouchableOpacity>
          </View>

          <View style={styles.addStudioIntro}>
            <Text style={styles.addStudioTitle}>Curate Your Studio</Text>
            <Text style={styles.addStudioSubtitle}>Build your Atelier Digital. High-fidelity archives enable precise AI styling and virtual try-on sessions.</Text>
          </View>

          <TouchableOpacity style={styles.addStudioUploadBox} activeOpacity={0.84} onPress={async () => setItemPhoto(await pickImage())}>
            {itemPhoto?.uri ? (
              <Image source={{ uri: itemPhoto.uri }} style={styles.addStudioUploadImage} resizeMode="cover" />
            ) : (
              <View style={styles.addStudioUploadCopy}>
                <Ionicons name="camera-outline" size={32} color="#57514f" />
                <Text style={styles.addStudioUploadTitle}>Upload Clothing Photo</Text>
                <Text style={styles.addStudioUploadText}>High resolution, neutral background preferred</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.addStudioThumbRow}>
            <TouchableOpacity style={styles.addStudioAddThumb} onPress={async () => setItemPhoto(await pickImage())}>
              <Ionicons name="add" size={24} color="#171412" />
            </TouchableOpacity>
            {itemPhoto?.uri ? [({ uri: itemPhoto.uri })].map((source, index) => (
              <View key={index} style={styles.addStudioThumbWrap}>
                <Image source={source} style={styles.addStudioThumbImage} resizeMode="cover" />
                <TouchableOpacity style={styles.addStudioThumbClose} onPress={() => setItemPhoto(null)}>
                  <Ionicons name="close" size={12} color="#6c625e" />
                </TouchableOpacity>
              </View>
            )) : null}
          </View>

          <View style={styles.addStudioArchiveHead}>
            <Text style={styles.addStudioArchiveTitle}>Archive Entry: {titleCase(itemCategory || 'Dress').replace(/s$/, '')}</Text>
            <View style={styles.addStudioArchiveLine} />
          </View>

          <Text style={styles.addStudioSectionLabel}>ITEM SPECIFICATIONS</Text>
          <View style={styles.addStudioForm}>
            <Text style={styles.addStudioFieldLabel}>Dress Name</Text>
            <TextInput style={styles.addStudioInput} value={itemName} onChangeText={setItemName} placeholder="L'Artiste Evening Gown" placeholderTextColor="#2b2a29" />

            <View style={styles.addStudioTwoCol}>
              <View style={styles.addStudioFieldHalf}>
                <Text style={styles.addStudioFieldLabel}>Type</Text>
                <TouchableOpacity style={styles.addStudioSelectInput} onPress={cycleItemCategory}>
                  <Text style={styles.addStudioInputText}>{itemCategory === 'dresses' ? 'Evening' : titleCase(itemCategory || 'dresses')}</Text>
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

            <View style={styles.addStudioTwoCol}>
              <View style={styles.addStudioFieldHalf}>
                <Text style={styles.addStudioFieldLabel}>Fabric</Text>
                <TextInput style={styles.addStudioInput} value={itemFabric} onChangeText={setItemFabric} placeholder="Heavy Crepe Silk" placeholderTextColor="#2b2a29" />
              </View>
              <View style={styles.addStudioFieldHalf}>
                <Text style={styles.addStudioFieldLabel}>Pattern</Text>
                <TextInput style={styles.addStudioInput} value={itemPattern} onChangeText={setItemPattern} placeholder="Solid" placeholderTextColor="#2b2a29" />
              </View>
            </View>

            <Text style={styles.addStudioFieldLabel}>Season</Text>
            <View style={styles.addStudioSegmented}>
              {[
                ['summer', 'S/S'],
                ['winter', 'A/W'],
                ['resort', 'Resort'],
                ['all-season', 'All']
              ].map(([value, label]) => {
                const active = itemSeason === value;
                return (
                  <TouchableOpacity key={value} style={[styles.addStudioSegment, active && styles.addStudioSegmentActive]} onPress={() => setItemSeason(value)}>
                    <Text style={[styles.addStudioSegmentText, active && styles.addStudioSegmentTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.addStudioTwoCol}>
              <View style={styles.addStudioFieldHalf}>
                <Text style={styles.addStudioFieldLabel}>Vibe</Text>
                <TextInput style={styles.addStudioInput} value={itemFormality === 'any' ? '' : itemFormality} onChangeText={setItemFormality} placeholder="E.g. Brutalist" placeholderTextColor="#9ca3af" />
              </View>
              <View style={styles.addStudioFieldHalf}>
                <Text style={styles.addStudioFieldLabel}>Occasion</Text>
                <TextInput style={styles.addStudioInput} value={itemOccasions} onChangeText={setItemOccasions} placeholder="Gala" placeholderTextColor="#2b2a29" />
              </View>
            </View>

            <Text style={styles.addStudioFieldLabel}>Metadata Tags</Text>
            <View style={styles.addStudioTagInput}>
              <TextInput style={styles.addStudioTagTextInput} value={itemTags} onChangeText={setItemTags} placeholder="Add tags..." placeholderTextColor="#8d939f" />
              <TouchableOpacity style={styles.addStudioTagAdd}>
                <Ionicons name="add" size={17} color="#4f4a48" />
              </TouchableOpacity>
            </View>
            <View style={styles.addStudioTagRow}>
              {['#minimalism', '#architectural'].map((tag) => (
                <View key={tag} style={styles.addStudioTagPill}>
                  <Text style={styles.addStudioTagPillText}>{tag}</Text>
                  <Ionicons name="close" size={12} color="#6f6864" />
                </View>
              ))}
            </View>
          </View>

          {message ? <Text style={[styles.formMessage, styles.addStudioMessage, /failed|missing|error|upload/i.test(message) ? styles.errorText : null]}>{message}</Text> : null}
        </ScrollView>

        <View style={styles.addStudioFooter}>
          <TouchableOpacity style={styles.addStudioDiscardButton} onPress={discardAddDraft}>
            <Text style={styles.addStudioDiscardText}>DISCARD DRAFT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.addStudioSaveButton, busy === 'add' && styles.disabledButton]} disabled={busy === 'add'} onPress={addItem}>
            <Text style={styles.addStudioSaveText}>{busy === 'add' ? 'SAVING...' : 'SAVE CLOTHING\nITEM'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wardrobeScreen}>
      <ScrollView contentContainerStyle={styles.wardrobeContent} {...screenScrollProps}>
        <WardrobeTopBar user={user} onNavigate={onNavigate} />

        <View style={styles.wardrobeHeroHead}>
          <View>
            <Text style={styles.wardrobeTitle}>My Wardrobe</Text>
            <Text style={styles.wardrobeSubtitle}>Curated Collection</Text>
          </View>
          <TouchableOpacity style={styles.wardrobeAddButton} activeOpacity={0.85} onPress={() => onNavigate('closet', { view: 'add' })}>
            <Ionicons name="add" size={22} color="#ffffff" />
            <Text style={styles.wardrobeAddText}>Add Item</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wardrobeCategoryTrack}>
          {wardrobeCategoryTabs.map((tab) => {
            const active = activeWardrobeCategory.key === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={styles.wardrobeCategoryButton}
                activeOpacity={0.82}
                onPress={() => {
                  setActiveSlot(tab.slot);
                  setFilter(tab.key);
                }}
              >
                <View style={[styles.wardrobeCategoryIcon, active && styles.wardrobeCategoryIconActive]}>
                  <Ionicons name={tab.icon} size={28} color="#444444" />
                </View>
                <Text style={[styles.wardrobeCategoryLabel, active && styles.wardrobeCategoryLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {closetView === 'stylist' ? (
          <>
            <Pressable style={styles.wardrobePreviewCard} onPress={() => mainPreview && setLightbox(imageUrl(mainPreview))}>
              <Image source={wardrobePreviewSource} style={styles.wardrobePreviewImage} resizeMode="cover" />
              <View style={styles.wardrobeSideTools}>
                {['person-outline', 'happy-outline', 'body-outline'].map((icon) => (
                  <TouchableOpacity key={icon} style={styles.wardrobeSideTool}>
                    <Ionicons name={icon} size={24} color="#505050" />
                  </TouchableOpacity>
                ))}
              </View>
              {busy === 'generate' ? <View style={styles.previewGenerating}><ActivityIndicator color="#fff" /><Text style={styles.previewGeneratingText}>Generating look</Text></View> : null}
              <TouchableOpacity
                style={[styles.wardrobeTryButton, (!tryThisLookIds.length || busy === 'generate') && styles.disabledButton]}
                disabled={!tryThisLookIds.length || busy === 'generate'}
                onPress={() => generateOutfit(tryThisLookIds, { title: 'My wardrobe look' })}
              >
                <Text style={styles.wardrobeTryText}>{busy === 'generate' ? 'Generating...' : 'Try This Look'}</Text>
              </TouchableOpacity>
            </Pressable>

            <View style={styles.wardrobeScoreBlock}>
              <View style={styles.wardrobeScoreCircle}>
                <Text style={styles.wardrobeScoreNumber}>{wardrobeScore}</Text>
                <Text style={styles.wardrobeScoreLabel}>SCORE</Text>
              </View>
              <Text style={styles.wardrobeScoreText}>Great Choice!</Text>
            </View>

            <View style={styles.wardrobeRecommendationsHead}>
              <Text style={styles.wardrobeSectionTitle}>AI Recommendations</Text>
              <TouchableOpacity style={styles.wardrobeGenerateLink} onPress={() => askForSuggestions('today casual')} disabled={busy === 'suggest'}>
                <Ionicons name="refresh-outline" size={22} color="#9b5658" />
                <Text style={styles.wardrobeGenerateText}>{busy === 'suggest' ? 'Generating' : 'Generate Look'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wardrobeRecommendationTrack}>
              {recommendationSource.length ? recommendationSource.map((suggestion, index) => {
                const fallback = wardrobeFallbackRecommendations[index % wardrobeFallbackRecommendations.length];
                return (
                  <WardrobeRecommendationCard
                    key={suggestion?.key || suggestion?.title || fallback.title}
                    suggestion={suggestion}
                    fallback={fallback}
                    onPress={() => suggestion ? applySuggestion(suggestion) : askForSuggestions('today casual')}
                  />
                );
              }) : (
                <TouchableOpacity style={styles.wardrobeEmptyRecommendation} onPress={() => askForSuggestions('today casual')} disabled={busy === 'suggest'}>
                  <Ionicons name="sparkles-outline" size={22} color="#9b5658" />
                  <Text style={styles.wardrobeEmptyRecommendationTitle}>{busy === 'suggest' ? 'Generating suggestions...' : 'No AI recommendations yet'}</Text>
                  <Text style={styles.wardrobeEmptyRecommendationText}>Generate ideas from your uploaded closet.</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </>
        ) : (
          <View style={styles.wardrobeModeTabs}>
            <FilterChips
              selected={closetView}
              options={[['stylist', 'Preview'], ['combo', 'Combo'], ['add', 'Add'], ['wardrobe', 'Wardrobe'], ['looks', 'Looks']]}
              onSelect={setClosetView}
              compact
            />
          </View>
        )}

        {closetView === 'add' ? <View style={styles.closetPanel}>
          <Text style={styles.sectionTitle}>Add Clothing</Text>
          <TouchableOpacity style={styles.uploadBox} onPress={async () => setItemPhoto(await pickImage())}>
            {itemPhoto?.uri ? <Image source={{ uri: itemPhoto.uri }} style={styles.uploadPreview} /> : <Ionicons name="cloud-upload-outline" size={30} color="#0f766e" />}
            <View style={styles.uploadCopy}>
              <Text style={styles.uploadTitle}>{itemPhoto ? 'Closet photo selected' : 'Upload clothing photo'}</Text>
              <Text style={styles.photoGuideText}>Use one clear item per photo for best combo selection.</Text>
            </View>
          </TouchableOpacity>
          <TextInput style={styles.input} value={itemName} onChangeText={setItemName} placeholder="Item name" placeholderTextColor="#94a3b8" />
          <FilterChips selected={itemCategory} options={closetCategories.map((item) => [item, titleCase(item)])} onSelect={setItemCategory} compact />
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
          <AppButton label={busy === 'add' ? 'Saving...' : 'Add To Closet'} icon="add-circle-outline" disabled={busy === 'add'} onPress={addItem} />
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
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionRow}>
                    {options.map((item) => {
                      const active = comboSlots[slot.key] === item.id;
                      return (
                        <TouchableOpacity key={item.id} style={[styles.slotOptionCard, active && styles.slotOptionActive]} onPress={() => setSlotItem(slot.key, item.id)}>
                          <Image source={item.imageUrl ? { uri: imageUrl(item.imageUrl) } : images.hero} style={styles.slotOptionImage} resizeMode="cover" />
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
                  <Image source={item.imageUrl ? { uri: imageUrl(item.imageUrl) } : images.hero} style={styles.selectedChipImage} />
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
                    {(combo.items || []).slice(0, 4).map((item) => <Image key={item.id} source={{ uri: imageUrl(item.imageUrl) }} style={styles.comboThumb} />)}
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
              <Text style={styles.sectionTitle}>Closet Stylist</Text>
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
            <TextInput style={styles.searchInput} value={stylistText} onChangeText={setStylistText} placeholder="Ask for office, date, rain, wedding..." placeholderTextColor="#94a3b8" />
            <TouchableOpacity style={[styles.searchButton, busy === 'chat' && styles.disabledButton]} disabled={busy === 'chat'} onPress={askStylist}>
              <Ionicons name="sparkles-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          {suggestions.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionRow}>
              {suggestions.map((suggestion) => (
                <TouchableOpacity key={suggestion.key || suggestion.title} style={styles.suggestionCard} onPress={() => applySuggestion(suggestion)}>
                  <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                  <Text style={styles.suggestionCopy} numberOfLines={2}>{suggestion.reason}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}
        </View> : null}

        {closetView !== 'stylist' ? <StatusPanel loading={closet.loading} error={closet.error} empty={!closet.loading && !items.length} text="Add clothes to start building closet looks." /> : null}
        {closetView === 'wardrobe' ? <View style={styles.closetPanel}>
          <View style={styles.panelHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Your Closet</Text>
              <Text style={styles.muted}>Browse, save favorites, remove old items, or send selected pieces to combo.</Text>
            </View>
            {selectedIds.length ? <TouchableOpacity style={styles.smallOutlineButton} onPress={() => setClosetView('combo')}><Text style={styles.smallOutlineText}>Build ({selectedIds.length})</Text></TouchableOpacity> : null}
          </View>
          <FilterChips selected={filter} options={[['all', 'All'], ...closetCategories.map((item) => [item, titleCase(item)])]} onSelect={setFilter} compact />
        </View> : null}
        {closetView === 'wardrobe' || closetView === 'combo' ? <View style={styles.closetGrid}>
          {(closetView === 'wardrobe' ? filteredItems : items).map((item) => {
            const selected = selectedIds.includes(item.id);
            return (
              <Pressable key={item.id} style={[styles.closetItemCard, selected && styles.closetItemSelected]} onPress={() => toggleItem(item.id)}>
                <Image source={item.imageUrl ? { uri: imageUrl(item.imageUrl) } : images.hero} style={styles.closetItemImage} resizeMode="cover" />
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
          {closetView === 'wardrobe' && !filteredItems.length ? <StatusPanel empty text="No clothes match this filter yet." /> : null}
        </View> : null}
        {closetView === 'looks' ? (
          <View style={styles.looksList}>
            {outfits.map((outfit) => (
              <Pressable key={outfit.id} style={styles.latestOutfitCard} onPress={() => outfit.imageUrl && setLightbox(imageUrl(outfit.imageUrl))}>
                <Image source={outfit.imageUrl ? { uri: imageUrl(outfit.imageUrl) } : images.hero} style={styles.latestOutfitImage} resizeMode="cover" />
                <View style={styles.latestOutfitCopy}>
                  <Text style={styles.latestOutfitTitle}>{outfit.title || 'Generated outfit'}</Text>
                  <Text style={styles.muted}>{outfit.items?.map((item) => item.name).join(' + ') || outfit.occasion || 'Saved closet look'}</Text>
                </View>
              </Pressable>
            ))}
            {!outfits.length ? <StatusPanel empty text="Generated closet looks will appear here." /> : null}
          </View>
        ) : null}
        {message ? <Text style={[styles.formMessage, styles.closetMessage, /failed|missing|error|not enough|upload|select/i.test(message) ? styles.errorText : null]}>{message}</Text> : null}
      </ScrollView>
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </KeyboardAvoidingView>
  );
}

function CustomTryOnScreen({ user, setUser, setToken, onNavigate }) {
  const [garment, setGarment] = useState(null);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  if (!user) return <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={onNavigate} />;

  const submit = async () => {
    if (!garment) {
      setMessage('Upload a clothing photo first.');
      return;
    }
    setLoading(true);
    setMessage('Generating custom try-on...');
    setResult(null);
    try {
      const form = new FormData();
      form.append('garment', filePart(garment, 'garment.jpg'));
      const data = await api('/tryons/custom', { method: 'POST', body: form });
      setResult(data.tryOn);
      if (data.user) setUser(data.user);
      setMessage('Custom try-on ready.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} {...screenScrollProps}>
      <View style={styles.toolHero}>
        <Text style={styles.kicker}>Custom Try-On</Text>
        <Text style={styles.screenTitle}>Try on any clothing photo.</Text>
        <Text style={styles.description}>Upload a garment image and FitLook will generate it on your saved profile photo with FitRoom. Each generated image costs 1 token.</Text>
      </View>
      <View style={styles.tryOnPair}>
        <TouchableOpacity style={styles.previewBox} onPress={async () => setGarment(await pickImage())}>
          {garment?.uri ? <Image source={{ uri: garment.uri }} style={styles.previewImage} /> : <Text style={styles.previewPlaceholder}>Upload garment</Text>}
        </TouchableOpacity>
        <Pressable style={styles.previewBox} onPress={() => result?.imageUrl && setLightbox(imageUrl(result.imageUrl))}>
          {loading ? <TryOnLoading text="Generating" large /> : result?.imageUrl ? <Image source={{ uri: imageUrl(result.imageUrl) }} style={styles.previewImage} /> : <Text style={styles.previewPlaceholder}>Generated try-on</Text>}
        </Pressable>
      </View>
      <View style={styles.customModelPanel}>
        <Text style={styles.customModelTitle}>What are you trying on?</Text>
        <View style={styles.customModelOptions}>
          {[
            ['fitroom/tryon-v2', 'FitRoom try-on', 'Product and custom clothing transfer']
          ].map(([value, label, help]) => {
            const selected = value === 'fitroom/tryon-v2';
            return (
              <Pressable
                key={value}
                style={[styles.customModelOption, selected && styles.customModelOptionActive]}
              >
                <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? '#0f766e' : '#64748b'} />
                <View style={styles.customModelText}>
                  <Text style={[styles.customModelLabel, selected && styles.customModelLabelActive]}>{label}</Text>
                  <Text style={styles.customModelHelp}>{help}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <AppButton
        label={loading ? 'Generating...' : 'Generate Custom Try-On'}
        icon="sparkles-outline"
        disabled={loading}
        onPress={submit}
        style={styles.customGenerateButton}
      />
      {message ? <Text style={[styles.formMessage, result?.imageUrl ? null : styles.errorText]}>{message}</Text> : null}
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </ScrollView>
  );
}

function VtoTrialScreen({ user, setUser, setToken, onNavigate }) {
  const [person, setPerson] = useState(null);
  const [garment, setGarment] = useState(null);
  const [note, setNote] = useState('');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  if (!user) return <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={onNavigate} />;

  const submit = async () => {
    if (!person || !garment) {
      setMessage('Upload both a person image and a garment image first.');
      return;
    }
    setLoading(true);
    setResult(null);
    setMessage('Running unrestricted FAL virtual try-on trial...');
    try {
      const form = new FormData();
      form.append('person', filePart(person, 'person.jpg'));
      form.append('garment', filePart(garment, 'garment.jpg'));
      form.append('note', note);
      const data = await api('/tryons/vto-trial', { method: 'POST', body: form });
      setResult(data.trial);
      if (data.user) setUser(data.user);
      setMessage(`Trial ready using ${data.trial?.payloadVariant || 'model payload'}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} {...screenScrollProps}>
      <View style={styles.toolHero}>
        <Text style={styles.kicker}>FAL Trial</Text>
        <Text style={styles.screenTitle}>Pose-lock test for virtual try-on.</Text>
        <Text style={styles.description}>Test fal-ai/image-apps-v2/virtual-try-on with a strict prompt. This does not charge tokens or save to the normal product try-on cache.</Text>
      </View>
      <View style={styles.tryOnPair}>
        <TouchableOpacity style={styles.previewBox} onPress={async () => setPerson(await pickImage())}>
          {person?.uri ? <Image source={{ uri: person.uri }} style={styles.previewImage} /> : <Text style={styles.previewPlaceholder}>Upload person</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.previewBox} onPress={async () => setGarment(await pickImage())}>
          {garment?.uri ? <Image source={{ uri: garment.uri }} style={styles.previewImage} /> : <Text style={styles.previewPlaceholder}>Upload garment</Text>}
        </TouchableOpacity>
      </View>
      <TextInput style={[styles.input, styles.noteInput]} value={note} onChangeText={setNote} placeholder="Optional tester note" placeholderTextColor="#94a3b8" multiline />
      <View style={styles.previewBoxWide}>
        {loading ? <TryOnLoading text="FAL VTO trial is running" large /> : result?.imageUrl ? <Pressable onPress={() => setLightbox(imageUrl(result.imageUrl))}><Image source={{ uri: imageUrl(result.imageUrl) }} style={styles.resultImage} /></Pressable> : <Text style={styles.previewPlaceholder}>Generated result</Text>}
      </View>
      {result ? <Text style={styles.debugText}>{result.model} | payload: {result.payloadVariant} | aspect: {result.aspectRatio}</Text> : null}
      <AppButton label={loading ? 'Running Trial...' : 'Run FAL VTO Trial'} icon="flask-outline" disabled={loading} onPress={submit} />
      {message ? <Text style={[styles.formMessage, result?.imageUrl ? null : styles.errorText]}>{message}</Text> : null}
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </ScrollView>
  );
}

function StyleBotScreen({ user, setUser, setToken, token, onNavigate }) {
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const ideas = [
    { label: 'Office dinner', prompt: 'style me for an office dinner' },
    { label: 'Black blazer', prompt: 'black blazer Zara with matching trousers' },
    { label: 'Wedding guest', prompt: 'modern wedding guest outfit' },
    { label: 'Silver heels', prompt: 'silver heels Mango outfit ideas' }
  ];

  if (!user) return <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={onNavigate} />;

  const updateRun = (id, updater) => {
    setRuns((current) => current.map((run) => (run.id === id ? { ...run, ...updater(run) } : run)));
  };

  const submit = async () => {
    const prompt = query.trim();
    if (!prompt || busy) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setQuery('');
    setBusy(true);
    setRuns((current) => [...current, { id, query: prompt, products: [], tryOns: {}, generating: {}, loading: true, errors: {}, searchError: '' }]);

    try {
      const data = await api('/products/amazon-search', {
        method: 'POST',
        body: JSON.stringify({ query: prompt, limit: 2 })
      });
      const products = normalizeProducts(data.products || []);
      updateRun(id, () => ({ products, loading: false, generating: Object.fromEntries(products.map((product) => [product.id, true])) }));
      await Promise.allSettled(products.map(async (product) => {
        try {
          const generated = await api('/tryons/external', {
            method: 'POST',
            body: JSON.stringify({ product: product.raw || product })
          });
          updateRun(id, (run) => ({ tryOns: { ...run.tryOns, [product.id]: generated.tryOn }, errors: { ...run.errors, [product.id]: '' } }));
          if (generated.user) setUser(generated.user);
        } catch (error) {
          updateRun(id, (run) => ({ errors: { ...run.errors, [product.id]: error.message } }));
        } finally {
          updateRun(id, (run) => ({ generating: { ...run.generating, [product.id]: false } }));
        }
      }));
    } catch (error) {
      updateRun(id, () => ({ loading: false, searchError: error.message }));
    } finally {
      setBusy(false);
    }
  };

  const latestRun = runs[runs.length - 1];
  const conciergeCards = (latestRun?.products || []).slice(0, 3);
  const firstName = friendlyFirstName(user);
  const compact = width < 370;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.aiStudioScreen}>
      <ProductTopBar onNavigate={onNavigate} />
      <ScrollView contentContainerStyle={styles.aiStudioContent} {...screenScrollProps}>
        <View style={styles.aiHeroPanel}>
          <View style={styles.aiHeroIcon}>
            <Ionicons name="sparkles-outline" size={21} color="#9b5658" />
          </View>
          <View style={styles.aiHeroCopy}>
            <Text style={styles.aiStudioEyebrow}>FITLOOK CONCIERGE</Text>
            <Text style={styles.aiGreetingText}>Good evening{firstName ? `, ${firstName}` : ''}. What are we dressing for?</Text>
          </View>
        </View>

        <View style={styles.aiIdeaPanel}>
          <Text style={styles.aiIdeaPanelLabel}>Start with</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aiIdeaRow}>
            {ideas.map((idea) => (
              <TouchableOpacity key={idea.prompt} style={[styles.aiIdeaChip, compact && styles.aiIdeaChipCompact]} activeOpacity={0.82} onPress={() => setQuery(idea.prompt)}>
                <Ionicons name="sparkles-outline" size={14} color="#9b5658" />
                <Text style={styles.aiIdeaText} numberOfLines={1}>{idea.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {latestRun?.query ? (
          <View style={styles.aiThreadPanel}>
            <View style={styles.aiUserBubble}>
              <Text style={styles.aiUserBubbleText}>{latestRun.query}</Text>
            </View>
            {latestRun?.loading ? (
              <View style={styles.aiAssistantRow}>
                <ActivityIndicator size="small" color="#9b5658" />
                <Text style={styles.aiStatusText}>Finding pieces...</Text>
              </View>
            ) : null}
            {latestRun?.searchError ? <Text style={[styles.aiStatusText, styles.errorText]}>{latestRun.searchError}</Text> : null}
            {latestRun && !latestRun.loading && !latestRun.searchError ? (
              <View style={styles.aiAssistantRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color="#2f6d61" />
                <Text style={styles.aiStatusText}>{latestRun.products.length ? `${latestRun.products.length} looks ready` : 'No matching products found'}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.aiEmptyState}>
            <Ionicons name="chatbubble-ellipses-outline" size={24} color="#9b5658" />
            <Text style={styles.aiEmptyTitle}>Your stylist is ready</Text>
            <Text style={styles.aiEmptyText}>Ask for an item, outfit mood, brand, color, or occasion.</Text>
          </View>
        )}

        {conciergeCards.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.conciergeSuggestionTrack}>
            {conciergeCards.map((product, index) => (
              <ConciergeSuggestionCard
                key={product.id}
                product={product}
                featured={index === 0}
                onShop={() => product.affiliateLink ? Linking.openURL(product.affiliateLink) : onNavigate('product', { id: product.id })}
                onTryOn={() => onNavigate('product', { id: product.id })}
              />
            ))}
          </ScrollView>
        ) : null}

        {latestRun?.products?.length ? (
          <View style={styles.aiRunPreviewGrid}>
            {latestRun.products.map((product) => (
              <Pressable key={product.id} style={styles.aiRunPreviewCard} onPress={() => latestRun.tryOns[product.id]?.imageUrl ? setLightbox(imageUrl(latestRun.tryOns[product.id].imageUrl)) : onNavigate('product', { id: product.id })}>
                {latestRun.generating[product.id] ? <TryOnLoading text="Generating" /> : latestRun.tryOns[product.id]?.imageUrl ? <Image source={{ uri: imageUrl(latestRun.tryOns[product.id].imageUrl) }} style={styles.aiRunPreviewImage} resizeMode="cover" /> : <ProductImage product={product} style={styles.aiRunPreviewImage} resizeMode="cover" alt={product.title || product.name} />}
                <Text style={styles.aiRunPreviewName} numberOfLines={1}>{product.title || product.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.aiComposer}>
        <TouchableOpacity style={styles.aiImageButton} onPress={() => onNavigate('custom')}>
          <Ionicons name="image-outline" size={22} color="#55514f" />
        </TouchableOpacity>
        <TextInput style={styles.aiComposerInput} value={query} onChangeText={setQuery} placeholder="Message stylist" placeholderTextColor="#8d8682" returnKeyType="send" onSubmitEditing={submit} />
        <TouchableOpacity style={[styles.aiSendButton, (!query.trim() || busy) && styles.disabledButton]} disabled={!query.trim() || busy} onPress={submit}>
          <Ionicons name={busy ? 'hourglass-outline' : 'send'} size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </KeyboardAvoidingView>
  );
}

function TokensScreen({ user, setUser, onNavigate }) {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedTierId, setSelectedTierId] = useState('atelier');
  const creditTiers = [
    {
      id: 'essentials',
      name: 'Essentials',
      price: 25,
      credits: 500,
      description: 'Ideal for seasonal wardrobe refreshes and basic fit analysis.'
    },
    {
      id: 'atelier',
      name: 'Atelier',
      price: 60,
      credits: 1500,
      description: 'Comprehensive styling for power users and fashion enthusiasts.',
      badge: 'MOST SELECTED'
    },
    {
      id: 'master',
      name: 'Master',
      price: 180,
      credits: 5000,
      description: 'The ultimate tier for unlimited virtual try-ons and high-fidelity rendering.'
    }
  ];
  const selectedTier = creditTiers.find((tier) => tier.id === selectedTierId) || creditTiers[1];
  const estimatedTax = selectedTier.price * 0.08;
  const totalAmount = selectedTier.price + estimatedTax;

  const startCheckout = async () => {
    if (!user) {
      onNavigate('signup');
      return;
    }
    setCheckoutLoading(true);
    setMessage('Opening PhonePe checkout...');
    try {
      const data = await api('/payments/phonepe/subscription', { method: 'POST' });
      if (data.redirectUrl) {
        await Linking.openURL(data.redirectUrl);
        setMessage('Complete payment in PhonePe, then return to FitLook.');
      } else {
        setMessage('Checkout link was not returned.');
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <ScrollView style={styles.creditsScreen} contentContainerStyle={styles.creditsContent} {...screenScrollProps}>
      <View style={styles.creditsTopBar}>
        <TouchableOpacity style={styles.creditsTopIcon} onPress={() => onNavigate('home')}>
          <Ionicons name="menu-outline" size={22} color="#111111" />
        </TouchableOpacity>
        <Text style={styles.creditsBrand}>FitLook</Text>
        <View style={styles.creditsHeaderActions}>
          <TouchableOpacity style={styles.creditsTopIcon} onPress={() => onNavigate('shop')}>
            <Ionicons name="bag-handle-outline" size={20} color="#111111" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.creditsTopIcon} onPress={() => onNavigate('profile')}>
            <Ionicons name="person-outline" size={20} color="#111111" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.creditsIntro}>
        <Text style={styles.creditsIntroTitle}>Atmospheric Intelligence Credits</Text>
        <Text style={styles.creditsIntroText}>Elevate your digital wardrobe with AI-powered fit predictions, virtual material simulations, and bespoke stylistic rendering.</Text>
      </View>

      <Text style={styles.creditsSectionLabel}>SELECT A CREDIT TIER</Text>
      <View style={styles.creditTierStack}>
        {creditTiers.map((tier) => {
          const selected = selectedTier.id === tier.id;
          return (
            <TouchableOpacity key={tier.id} activeOpacity={0.88} style={[styles.creditTierCard, selected && styles.creditTierCardSelected]} onPress={() => setSelectedTierId(tier.id)}>
              {tier.badge ? <Text style={styles.creditTierBadge}>{tier.badge}</Text> : null}
              <View style={styles.creditTierTop}>
                <Text style={styles.creditTierName}>{tier.name}</Text>
                <Text style={styles.creditTierPrice}>${tier.price}</Text>
              </View>
              <View style={styles.creditAmountRow}>
                <Text style={styles.creditAmount}>{tier.credits}</Text>
                <Text style={styles.creditAmountLabel}> CREDITS</Text>
              </View>
              <Text style={styles.creditTierDescription}>{tier.description}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.creditsSectionLabel}>PAYMENT METHOD</Text>
      <View style={styles.paymentMethodCard}>
        <View style={styles.paymentMethodLeft}>
          <Ionicons name="card-outline" size={22} color="#111111" />
          <Text style={styles.paymentMethodText}>PhonePe checkout</Text>
        </View>
        <Ionicons name="radio-button-on" size={22} color="#111111" />
      </View>
      <TouchableOpacity style={styles.addPaymentCard} activeOpacity={0.84}>
        <Ionicons name="add-circle-outline" size={21} color="#55514f" />
        <Text style={styles.addPaymentText}>Add New Payment Method</Text>
      </TouchableOpacity>

      <View style={styles.orderSummaryCard}>
        <Text style={styles.orderSummaryTitle}>Order Summary</Text>
        <View style={styles.orderSummaryRow}>
          <Text style={styles.orderSummaryText}>{selectedTier.name} Package ({selectedTier.credits.toLocaleString()} Credits)</Text>
          <Text style={styles.orderSummaryText}>${selectedTier.price.toFixed(2)}</Text>
        </View>
        <View style={styles.orderSummaryRow}>
          <Text style={styles.orderSummaryText}>Estimated Tax (8%)</Text>
          <Text style={styles.orderSummaryText}>${estimatedTax.toFixed(2)}</Text>
        </View>
        <View style={styles.orderSummaryDivider} />
        <View style={styles.orderSummaryRow}>
          <Text style={styles.totalAmountLabel}>TOTAL AMOUNT</Text>
          <Text style={styles.totalAmountValue}>${totalAmount.toFixed(2)}</Text>
        </View>
      </View>

      {message ? <Text style={[styles.creditsMessage, /failed|missing|not|error|Could not/i.test(message) ? styles.errorText : null]}>{message}</Text> : null}

      <TouchableOpacity style={[styles.secureCheckoutButton, checkoutLoading && styles.disabledButton]} activeOpacity={0.88} disabled={checkoutLoading} onPress={startCheckout}>
        <Text style={styles.secureCheckoutText}>{checkoutLoading ? 'OPENING CHECKOUT' : 'SECURE CHECKOUT'}</Text>
      </TouchableOpacity>

      <View style={styles.creditsFooterLinks}>
        <Text style={styles.creditsFooterLink}>TERMS OF SALE</Text>
        <Text style={styles.creditsFooterLink}>PRIVACY POLICY</Text>
        <Text style={styles.creditsFooterLink}>HELP CENTER</Text>
      </View>
    </ScrollView>
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

function WishlistScreen({ onNavigate, token, wishlistProducts = [] }) {
  const recommended = useProducts({ sort: 'newest', limit: 6 }, token);
  return (
    <ScrollView style={styles.wishlistScreen} contentContainerStyle={styles.wishlistContent} {...screenScrollProps}>
      <View style={styles.wishlistTopBar}>
        <TouchableOpacity style={styles.wishlistTopIcon} onPress={() => onNavigate('profile')}>
          <Ionicons name="menu-outline" size={19} color="#55514f" />
        </TouchableOpacity>
        <Text style={styles.wishlistBrand}>FitLook</Text>
        <View style={styles.wishlistTopActions}>
          <TouchableOpacity style={styles.wishlistTopIcon} onPress={() => onNavigate('shop')}>
            <Ionicons name="search-outline" size={19} color="#55514f" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.wishlistTopIcon} onPress={() => onNavigate('tokens')}>
            <Ionicons name="bag-handle-outline" size={18} color="#55514f" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.wishlistBody}>
        <Text style={styles.wishlistTitle}>My Wishlist <Text style={styles.wishlistCount}>({wishlistProducts.length})</Text></Text>
        <View style={styles.wishlistActionRow}>
          <TouchableOpacity style={styles.wishlistCreateButton}>
            <Ionicons name="add" size={18} color="#ffffff" />
            <Text style={styles.wishlistCreateText}>Create Collection</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.wishlistShareButton}>
            <Ionicons name="share-social-outline" size={16} color="#111111" />
            <Text style={styles.wishlistShareText}>Share</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wishlistTabs}>
          {['All Items', 'Clothing', 'Footwear', 'Accessories'].map((tab, index) => (
            <TouchableOpacity key={tab} style={styles.wishlistTab}>
              <Text style={[styles.wishlistTabText, index === 0 && styles.wishlistTabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.wishlistSortRow}>
          <Text style={styles.wishlistSortText}>Sort: <Text style={styles.wishlistSortStrong}>Recently Added</Text></Text>
          <View style={styles.wishlistViewToggle}>
            <Ionicons name="grid-outline" size={17} color="#3f3937" />
            <Ionicons name="list-outline" size={19} color="#3f3937" />
          </View>
        </View>

        <View style={styles.wishlistGrid}>
          {wishlistProducts.length ? wishlistProducts.map((product) => (
            <WishlistProductCard key={product.id} product={product} onPress={() => onNavigate('product', { id: product.id })} />
          )) : <StatusPanel empty text="Your wishlist is empty." />}
        </View>

        <View style={styles.wishlistProCard}>
          <Text style={styles.wishlistProBadge}>PRO FEATURE</Text>
          <Text style={styles.wishlistProTitle}>Unlock Smart Wardrobe AI</Text>
          <Text style={styles.wishlistProText}>Get virtual try-on access for all wishlist items and personalized fit recommendations.</Text>
          <TouchableOpacity style={styles.wishlistUpgradeButton} onPress={() => onNavigate('tokens')}>
            <Text style={styles.wishlistUpgradeText}>Upgrade Now</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.wishlistSectionTitle}>You May Also Like</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wishlistRecommendedTrack}>
          {recommended.loading || recommended.error || !recommended.products.length ? (
            <StatusPanel loading={recommended.loading} error={recommended.error} empty={!recommended.loading && !recommended.products.length} text="No recommended products yet." />
          ) : recommended.products.slice(0, 4).map((product) => {
            const price = Number(product.price);
            return (
            <TouchableOpacity key={product.id} style={styles.wishlistRecommendedCard} onPress={() => onNavigate('product', { id: product.id })}>
              <ProductImage product={product} style={styles.wishlistRecommendedImage} alt={product.title || product.name} />
              <Text style={styles.wishlistRecommendedBrand} numberOfLines={1}>{product.displayLabel || titleCase(product.category || 'Catalog')}</Text>
              <Text style={styles.wishlistRecommendedPrice}>{Number.isFinite(price) ? formatMoney(price, product.currency) : 'Price unavailable'}</Text>
            </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

function WishlistProductCard({ product, onPress }) {
  const price = Number(product?.price);
  return (
    <TouchableOpacity style={styles.wishlistProductCard} activeOpacity={0.86} onPress={onPress}>
      <View style={styles.wishlistProductImageWrap}>
        <ProductImage product={product} style={styles.wishlistProductImage} resizeMode="cover" alt={product?.title || product?.name} />
        <TouchableOpacity style={styles.wishlistHeartButton}>
          <Ionicons name="heart" size={22} color="#9b5658" />
        </TouchableOpacity>
      </View>
      <Text style={styles.wishlistProductBrand} numberOfLines={1}>{product?.displayLabel || titleCase(product?.category || 'Catalog')}</Text>
      <Text style={styles.wishlistProductName} numberOfLines={2}>{product?.title || product?.name}</Text>
      <Text style={styles.wishlistProductPrice}>{Number.isFinite(price) ? formatMoney(price, product?.currency) : 'Price unavailable'}</Text>
      <TouchableOpacity style={styles.wishlistMoveButton} onPress={onPress}>
        <Text style={styles.wishlistMoveText}>View Product</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function OrdersScreen({ onNavigate }) {
  return (
    <ScrollView style={styles.ordersScreen} contentContainerStyle={styles.ordersContent} {...screenScrollProps}>
      <View style={styles.wishlistTopBar}>
        <TouchableOpacity style={styles.wishlistTopIcon} onPress={() => onNavigate('profile')}>
          <Ionicons name="chevron-back" size={24} color="#111111" />
        </TouchableOpacity>
        <Text style={styles.wishlistBrand}>FitLook</Text>
        <TouchableOpacity style={styles.wishlistTopIcon} onPress={() => onNavigate('tokens')}>
          <Ionicons name="bag-handle-outline" size={18} color="#55514f" />
        </TouchableOpacity>
      </View>
      <View style={styles.ordersBody}>
        <Text style={styles.wishlistTitle}>My Orders</Text>
        <StatusPanel empty text="No orders found yet." />
      </View>
    </ScrollView>
  );
}

function ProfileScreen({ user, setUser, setToken, onNavigate, onLogout }) {
  const [photo, setPhoto] = useState(null);
  const [profilePhotoMode, setProfilePhotoMode] = useState('ai-full-body');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  if (!user) return <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={onNavigate} />;

  const previewUri = photo?.uri || (user.bodyPhotoUrl ? imageUrl(user.bodyPhotoUrl) : '');
  const photoSource = previewUri ? { uri: previewUri } : null;
  const username = user.username || (user.email ? user.email.split('@')[0] : '');
  const displayName = user.name || username || 'FitLook member';
  const remainingCredits = Math.max(0, Number(user.tokens) || 0);
  const monthlyAllowance = Number(user.subscription?.tokensPerMonth) || 0;
  const creditTotal = monthlyAllowance > 0 ? Math.max(monthlyAllowance, remainingCredits) : null;
  const creditProgress = `${creditTotal ? calculateCreditPercentage(remainingCredits, creditTotal) : 100}%`;
  const portraitItems = [
    photo?.uri ? { uri: photo.uri } : null,
    user.bodyPhotoUrl ? { uri: imageUrl(user.bodyPhotoUrl) } : null
  ].filter(Boolean);

  const updatePhoto = async () => {
    if (!photo) {
      setMessage('Choose a new profile photo first.');
      return;
    }
    setLoading(true);
    setMessage('Uploading profile photo...');
    try {
      const form = new FormData();
      form.append('bodyPhoto', filePart(photo, 'body-photo.jpg'));
      form.append('profilePhotoMode', profilePhotoMode);
      const data = await api('/auth/body-photo', { method: 'POST', body: form });
      if (data.user) setUser(data.user);
      setPhoto(null);
      setMessage(data.user?.bodyPhotoStatus === 'generating' ? 'Photo saved. Full-body try-on profile is preparing in the background.' : 'Profile photo updated.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.profileScreen} contentContainerStyle={styles.profileContent} {...screenScrollProps}>
      <AppHeader onNavigate={onNavigate} leftRoute="home" rightRoute="tokens" />

      <View style={styles.profileHero}>
        <TouchableOpacity style={styles.profilePhotoWrap} onPress={async () => setPhoto(await pickImage())}>
          {photoSource ? <Image source={photoSource} style={styles.profilePhoto} /> : (
            <View style={[styles.profilePhoto, styles.profileAvatarFallback]}>
              <Ionicons name="person-outline" size={42} color="#9b5658" />
            </View>
          )}
          <View style={styles.profilePhotoAction}>
            <Ionicons name="create-outline" size={13} color="#ffffff" />
          </View>
        </TouchableOpacity>
        <Text style={styles.profileName}>{displayName}</Text>
        <Text style={styles.profileRole}>{titleCase(user.genderPreference || 'FitLook profile')}</Text>
        <Text style={styles.profileBio}>{user.joinedAt ? `Member since ${formatDate(user.joinedAt)}.` : 'Your saved profile powers product previews and wardrobe try-ons.'}</Text>
        <TouchableOpacity style={styles.profileEditButton} onPress={async () => setPhoto(await pickImage())}>
          <Text style={styles.profileEditText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profileCreditsCard}>
        <View style={styles.profileCreditsHead}>
          <Text style={styles.profileCreditsLabel}>Remaining Credits</Text>
          <Ionicons name="sparkles" size={23} color="#9b5658" />
        </View>
        <View style={styles.profileCreditsAmountRow}>
          <Text style={styles.profileCreditsAmount}>{user.devMode ? 'Unlimited' : remainingCredits}</Text>
          <Text style={styles.profileCreditsTotal}>{user.devMode ? '' : creditTotal ? ` / ${creditTotal}` : ' available'}</Text>
        </View>
        {!user.devMode ? (
          <View style={styles.profileCreditTrack}>
            <View style={[styles.profileCreditFill, { width: creditProgress }]} />
          </View>
        ) : null}
        <TouchableOpacity style={styles.profileBuyButton} onPress={() => onNavigate('tokens')}>
          <Text style={styles.profileBuyText}>Buy More Credits</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profileSection}>
        <View style={styles.profileSectionHead}>
          <Text style={styles.profileSectionTitle}>Try-On Portraits</Text>
          <Text style={styles.profilePhotoCount}>{portraitItems.length} Photo{portraitItems.length === 1 ? '' : 's'}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profilePortraitTrack}>
          <TouchableOpacity style={styles.profileUploadPortrait} onPress={async () => setPhoto(await pickImage())}>
            <Ionicons name="camera-outline" size={24} color="#7d7a79" />
            <Text style={styles.profileUploadPortraitText}>Upload New Photo</Text>
          </TouchableOpacity>
          {portraitItems.slice(0, 3).map((source, index) => (
            <Pressable key={index} style={styles.profilePortraitCard} onPress={() => source.uri && setLightbox(source.uri)}>
              <Image source={source} style={styles.profilePortraitImage} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>
        {!portraitItems.length ? <Text style={styles.profileInlineMessage}>Upload a portrait to start trying on outfits.</Text> : null}
        {photo ? (
          <TouchableOpacity style={[styles.profileSavePhotoButton, loading && styles.disabledButton]} disabled={loading} onPress={updatePhoto}>
            <Text style={styles.profileSavePhotoText}>{loading ? 'Saving Photo...' : 'Save New Portrait'}</Text>
          </TouchableOpacity>
        ) : null}
        {user.bodyPhotoStatus === 'generating' ? <Text style={styles.profileInlineMessage}>Full-body try-on profile is preparing in the background.</Text> : null}
        {user.bodyPhotoStatus === 'failed' ? <Text style={[styles.profileInlineMessage, styles.errorText]}>Full-body profile generation failed. Upload a clearer profile photo.</Text> : null}
        {message ? <Text style={[styles.profileInlineMessage, message.includes('updated') || message.includes('saved') ? null : styles.errorText]}>{message}</Text> : null}
      </View>

      <View style={styles.profileQuickOptions}>
        <TouchableOpacity style={styles.profileQuickCard} activeOpacity={0.86} onPress={() => onNavigate('orders')}>
          <View style={styles.profileQuickIcon}>
            <Ionicons name="receipt-outline" size={23} color="#9b5658" />
          </View>
          <View style={styles.profileQuickCopy}>
            <Text style={styles.profileQuickTitle}>My Orders</Text>
            <Text style={styles.profileQuickSub}>Track purchases</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#77716f" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.profileQuickCard} activeOpacity={0.86} onPress={() => onNavigate('wishlist')}>
          <View style={styles.profileQuickIcon}>
            <Ionicons name="heart-outline" size={23} color="#9b5658" />
          </View>
          <View style={styles.profileQuickCopy}>
            <Text style={styles.profileQuickTitle}>My Wishlist</Text>
            <Text style={styles.profileQuickSub}>Saved styles</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#77716f" />
        </TouchableOpacity>
      </View>

      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>Payment Methods</Text>
        <TouchableOpacity style={styles.profilePaymentCard} onPress={() => onNavigate('tokens')}>
          <View style={styles.profileVisaBadge}>
            <Text style={styles.profileVisaText}>PAY</Text>
          </View>
          <View style={styles.profilePaymentCopy}>
            <Text style={styles.profilePaymentTitle}>PhonePe checkout</Text>
            <Text style={styles.profilePaymentSub}>{user.subscription?.status === 'active' ? 'Subscription active' : 'Add credits when needed'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#55514f" />
        </TouchableOpacity>
      </View>

      <ProfileSettingsSection
        title="Account Settings"
        rows={[
          ['Username', username ? `@${username}` : 'Not added'],
          ['Email Address', user.email || 'Not added'],
          ['Change Password', '']
        ]}
      />

      <ProfileSettingsSection
        title="Security & Legal"
        rows={[
          ['Security Center', ''],
          ['Two-Factor Authentication', ''],
          ['Data & Privacy', ''],
          ['Terms of Service', ''],
          ['Privacy Policy', '']
        ]}
      />

      <TouchableOpacity style={styles.profileLogoutButton} onPress={onLogout}>
        <Text style={styles.profileLogoutText}>Logout</Text>
      </TouchableOpacity>
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </ScrollView>
  );
}

function ProfileSettingsSection({ title, rows }) {
  return (
    <View style={styles.profileSection}>
      <Text style={styles.profileSectionTitle}>{title}</Text>
      <View style={styles.profileSettingsList}>
        {rows.map(([label, value]) => (
          <TouchableOpacity key={label} style={styles.profileSettingsRow} activeOpacity={0.8}>
            <View style={styles.profileSettingsCopy}>
              <Text style={styles.profileSettingsLabel}>{label}</Text>
              {value ? <Text style={styles.profileSettingsValue}>{value}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={21} color="#55514f" />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function HowItWorksScreen({ user, onNavigate }) {
  const steps = [
    [user ? 'Use your profile' : 'Create your profile', user ? 'Your account is ready, so you can move straight into browsing products.' : 'Upload one clear standing photo once, then keep using it for try-on previews.'],
    ['Choose a product', 'Open any product from the catalog and review the brand, price, image, colors, and details.'],
    ['Generate the try-on', 'Use tokens to preview how selected pieces look on your profile before leaving FitLook.'],
    ['Compare and shop', 'Shortlist the looks that work, then continue to the brand store when you are ready.']
  ];
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} {...screenScrollProps}>
      <View style={styles.toolHero}>
        <Text style={styles.kicker}>How FitLook Works</Text>
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

function InfoScreen({ page, user, onNavigate }) {
  const meta = infoPages[page] || ['Not Found', 'This page is not available yet.', 'Use the navigation to continue shopping with FitLook.', 'hero'];
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} {...screenScrollProps}>
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
    <View style={[styles.tryOnLoading, large && styles.tryOnLoadingLarge]}>
      <View style={styles.tryOnProgressMark}>
        <View style={styles.tryOnProgressDot} />
        <View style={[styles.tryOnProgressDot, styles.tryOnProgressDotMuted]} />
        <View style={styles.tryOnProgressDot} />
      </View>
      <Text style={styles.tryOnLoadingText}>{text}</Text>
      <View style={styles.tryOnProgressTrack}>
        <View style={styles.tryOnProgressFill} />
      </View>
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
      <Ionicons name={saved ? 'heart' : 'heart-outline'} size={compact ? 17 : 19} color={saved ? '#ffffff' : '#9b5658'} />
    </TouchableOpacity>
  );
}

function ImageLightbox({ uri, onClose }) {
  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.lightbox} onPress={onClose}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        {uri ? <Image source={{ uri }} style={styles.lightboxImage} resizeMode="contain" /> : null}
      </Pressable>
    </Modal>
  );
}

export default function App() {
  const [routeStack, setRouteStack] = useState([{ name: 'auth', params: {} }]);
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false);
  const [wishlistProducts, setWishlistProducts] = useState([]);
  const wishlistIds = useMemo(() => new Set(wishlistProducts.map((product) => product.id)), [wishlistProducts]);

  const currentRoute = normalizeRoute(routeStack[routeStack.length - 1]?.name, routeStack[routeStack.length - 1]?.params);
  const routeParamsKey = JSON.stringify(currentRoute.params || {});
  const navigate = useCallback((name, params = {}) => {
    const next = normalizeRoute(name, params);
    setRouteStack((current) => {
      const active = normalizeRoute(current[current.length - 1]?.name, current[current.length - 1]?.params);
      if (active.name === next.name && JSON.stringify(active.params || {}) === JSON.stringify(next.params || {})) return current;
      return [...current, next];
    });
  }, []);
  const replaceRoute = useCallback((name, params = {}) => {
    setRouteStack([normalizeRoute(name, params)]);
  }, []);
  const goBack = useCallback(() => {
    if (routeStack.length <= 1) return false;
    setRouteStack((current) => {
      if (current.length <= 1) return current;
      return current.slice(0, -1);
    });
    return true;
  }, [routeStack.length]);
  const addToWishlist = useCallback((product) => {
    if (!product?.id) return;
    setWishlistProducts((current) => {
      if (current.some((item) => item.id === product.id)) return current.filter((item) => item.id !== product.id);
      return [product, ...current];
    });
  }, []);

  useEffect(() => {
    let alive = true;
    getToken()
      .then(async (storedToken) => {
        if (!alive) return;
        setToken(storedToken);
        if (!storedToken) return;
        const data = await api('/auth/me', { timeoutMs: 3500 });
        if (!alive) return;
        setUser(data.user);
        setRouteStack((current) => (current.length === 1 && current[0]?.name === 'auth' ? [normalizeRoute('home')] : current));
      })
      .catch(() => {})
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => goBack());
    return () => subscription.remove();
  }, [goBack]);

  useEffect(() => {
    if (user?.bodyPhotoStatus !== 'generating') return undefined;
    const timer = setInterval(() => {
      api('/auth/me')
        .then((data) => {
          if (data.user) setUser(data.user);
        })
        .catch(() => {});
    }, 7000);
    return () => clearInterval(timer);
  }, [user?.bodyPhotoStatus]);

  const performLogout = async () => {
    await clearToken();
    setToken(null);
    setUser(null);
    replaceRoute('auth');
  };

  const logout = () => {
    Alert.alert('Log out?', 'You can sign in again anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: performLogout }
    ]);
  };

  const screen = useMemo(() => {
    const routeParams = currentRoute.params || {};
    switch (currentRoute.name) {
      case 'auth':
        return user ? <HomeScreen onNavigate={navigate} user={user} token={token} onAddToWishlist={addToWishlist} wishlistIds={wishlistIds} /> : <AuthEntryScreen onNavigate={navigate} />;
      case 'home':
        return <HomeScreen onNavigate={navigate} user={user} token={token} onAddToWishlist={addToWishlist} wishlistIds={wishlistIds} />;
      case 'shop':
        return <ShopScreen initial={routeParams} user={user} setUser={setUser} token={token} onNavigate={navigate} onAddToWishlist={addToWishlist} wishlistIds={wishlistIds} />;
      case 'tryon':
        return user ? <StyleBotScreen user={user} setUser={setUser} setToken={setToken} token={token} onNavigate={navigate} /> : <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={navigate} />;
      case 'closet':
        return <ClosetScreen initial={routeParams} user={user} setUser={setUser} setToken={setToken} token={token} onNavigate={navigate} />;
      case 'custom':
        return <CustomTryOnScreen user={user} setUser={setUser} setToken={setToken} onNavigate={navigate} />;
      case 'stylebot':
        return <StyleBotScreen user={user} setUser={setUser} setToken={setToken} token={token} onNavigate={navigate} />;
      case 'tokens':
        return <TokensScreen user={user} setUser={setUser} onNavigate={navigate} />;
      case 'profile':
        return <ProfileScreen user={user} setUser={setUser} setToken={setToken} onNavigate={navigate} onLogout={logout} />;
      case 'wishlist':
        return <WishlistScreen onNavigate={navigate} token={token} wishlistProducts={wishlistProducts} />;
      case 'orders':
        return <OrdersScreen onNavigate={navigate} />;
      case 'product':
        return routeParams.id ? <ProductScreen id={routeParams.id} user={user} setUser={setUser} token={token} onNavigate={navigate} onAddToWishlist={addToWishlist} wishlistIds={wishlistIds} /> : <ShopScreen initial={{}} user={user} setUser={setUser} token={token} onNavigate={navigate} onAddToWishlist={addToWishlist} wishlistIds={wishlistIds} />;
      case 'signup':
        return <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={navigate} />;
      case 'login':
        return <AuthScreen mode="login" setUser={setUser} setToken={setToken} onNavigate={navigate} />;
      case 'how':
        return <HowItWorksScreen user={user} onNavigate={navigate} />;
      case 'info':
        return <InfoScreen page={routeParams.page} user={user} onNavigate={navigate} />;
      default:
        return <InfoScreen page="missing" user={user} onNavigate={navigate} />;
    }
  }, [currentRoute.name, routeParamsKey, user, token, navigate, addToWishlist, wishlistIds, wishlistProducts]);

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.boot}>
          <Text style={styles.bootBrand}>FitLook</Text>
          <View style={styles.bootCard}>
            <View style={styles.skeletonLineWide} />
            <View style={styles.skeletonLine} />
            <View style={styles.skeletonLineShort} />
          </View>
          <Text style={styles.muted}>Opening your fitting room...</Text>
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
  const closetRoute = currentRoute.name === 'closet';
  const closetAddRoute = closetRoute && currentRoute.params?.view === 'add';
  const productRoute = currentRoute.name === 'product';
  const aiStudioRoute = currentRoute.name === 'tryon';
  const tokensRoute = currentRoute.name === 'tokens';
  const profileRoute = currentRoute.name === 'profile';
  const wishlistRoute = currentRoute.name === 'wishlist';
  const ordersRoute = currentRoute.name === 'orders';
  const accountChildRoute = wishlistRoute || ordersRoute;

  return (
    <SafeAreaView style={[styles.safe, welcomeRoute && styles.authEntrySafe, signupRoute && styles.signupSafe, loginRoute && styles.loginSafe, homeRoute && styles.homeSafe, shopRoute && styles.shopSafe, closetRoute && styles.wardrobeSafe, productRoute && styles.productSafe, aiStudioRoute && styles.aiStudioSafe, tokensRoute && styles.creditsSafe, profileRoute && styles.profileSafe, accountChildRoute && styles.profileSafe]}>
      <StatusBar style={welcomeRoute || loginRoute ? 'light' : 'dark'} />
      {authOnlyRoute || homeRoute || shopRoute || closetRoute || productRoute || aiStudioRoute || tokensRoute || profileRoute || accountChildRoute ? null : <Header user={user} canGoBack={routeStack.length > 1} onBack={goBack} onNavigate={navigate} onLogout={logout} />}
      <View style={styles.content}>
        <ScreenErrorBoundary routeName={currentRoute.name} onHome={() => navigate('home')}>
          {screen}
        </ScreenErrorBoundary>
      </View>
      {authOnlyRoute || closetAddRoute || tokensRoute ? null : <View style={styles.bottomNavFrame}><BottomNav route={currentRoute} onNavigate={navigate} /></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  authEntrySafe: {
    backgroundColor: '#111111'
  },
  signupSafe: {
    backgroundColor: '#fbf7f6'
  },
  loginSafe: {
    backgroundColor: '#111111'
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
    gap: 14,
    paddingHorizontal: 28,
    backgroundColor: '#fbf7f6'
  },
  bootBrand: {
    color: '#211c1a',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
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
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#fbf7f6'
  },
  scrollContent: {
    paddingBottom: Platform.OS === 'android' ? 118 : 132,
    paddingHorizontal: 16
  },
  appHeader: {
    minHeight: Platform.OS === 'android' ? appTopInset + 62 : 64,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? appTopInset + 12 : 10,
    paddingBottom: 10,
    backgroundColor: '#fbf7f6',
    borderBottomWidth: 1,
    borderBottomColor: '#ece5e1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  appHeaderCompact: {
    minHeight: Platform.OS === 'android' ? (NativeStatusBar.currentHeight || 24) + 44 : 54,
    paddingTop: Platform.OS === 'android' ? Math.max(8, (NativeStatusBar.currentHeight || 24) - 10) : 6,
    paddingBottom: 4,
    zIndex: 10
  },
  appHeaderAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  appHeaderSide: {
    width: 92,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center'
  },
  appHeaderLeftSide: {
    justifyContent: 'flex-start'
  },
  appHeaderRightSide: {
    justifyContent: 'flex-end'
  },
  appHeaderBrandWrap: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1
  },
  appHeaderBrandWrapLeft: {
    alignItems: 'flex-start'
  },
  appHeaderBrand: {
    color: '#111111',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  appHeaderAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? 38 : 12,
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
  brand: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0
  },
  headerSub: {
    marginTop: 1,
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700'
  },
  headerNotice: {
    marginTop: 2,
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '900'
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
  bottomNavFrame: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#fbf7f6',
    borderTopWidth: 1,
    borderTopColor: 'rgba(236, 229, 225, 0.72)',
    shadowColor: '#1f1714',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -8 },
    elevation: 10
  },
  bottomNav: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 22 : 12,
    paddingHorizontal: 10,
    backgroundColor: '#fffdfb'
  },
  navItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 56
  },
  navItemCenterActive: {
    marginTop: 0
  },
  navIconWrap: {
    width: 44,
    height: 34,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent'
  },
  navIconWrapCenter: {
    width: 48,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ebd9d5',
    backgroundColor: '#fff5f3'
  },
  navText: {
    fontSize: 10,
    lineHeight: 12,
    color: '#8d8682',
    fontWeight: '600'
  },
  navTextActive: {
    color: '#9b5658',
    fontWeight: '900'
  },
  homeScreen: {
    flex: 1,
    backgroundColor: '#fbf7f6'
  },
  homeScroll: {
    flex: 1,
    backgroundColor: '#fbf7f6'
  },
  homeContent: {
    paddingBottom: screenBottomInset,
    backgroundColor: '#fbf7f6'
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
    color: '#111111',
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  homeHero: {
    marginHorizontal: 16,
    height: 184,
    overflow: 'hidden',
    backgroundColor: '#d8c5b6'
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
    color: '#ffffff',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
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
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1
  },
  homeSection: {
    marginTop: 26,
    paddingHorizontal: 18
  },
  homeSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  homeSectionTitle: {
    color: '#1f1b19',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  homeViewAll: {
    color: '#1f1b19',
    fontSize: 10,
    fontWeight: '800',
    textDecorationLine: 'underline',
    letterSpacing: 0.8
  },
  homeCategoryTrack: {
    paddingTop: 20,
    gap: 10,
    paddingRight: 2
  },
  homeCategoryItem: {
    width: 60,
    alignItems: 'center'
  },
  homeCategoryImageFrame: {
    width: 58,
    height: 58,
    borderRadius: 29,
    padding: 2,
    borderWidth: 1,
    borderColor: '#eee3dc',
    backgroundColor: '#fffdfb',
    shadowColor: '#2a211d',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3
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
    borderRadius: 27,
    backgroundColor: '#f3eee9'
  },
  homeCategoryLabel: {
    width: '100%',
    marginTop: 11,
    color: '#25201d',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center'
  },
  homeCategoryLabelActive: {
    color: '#9b5658'
  },
  homeCurationTitle: {
    marginTop: 28,
    marginBottom: 20,
    color: '#1f1b19',
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '400',
    fontStyle: 'italic',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  homeCuratedGrid: {
    paddingHorizontal: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 24
  },
  homeProductCard: {
    width: '47%'
  },
  homeProductImageWrap: {
    aspectRatio: 0.9,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: '#eee7e2',
    position: 'relative'
  },
  homeProductImage: {
    width: '100%',
    height: '100%'
  },
  homeNewBadge: {
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
    fontWeight: '900'
  },
  homeTryBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  homeProductEyebrow: {
    marginTop: 9,
    color: '#a39b96',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  homeProductTitle: {
    marginTop: 3,
    color: '#171717',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '500',
    letterSpacing: 0
  },
  homeProductPrice: {
    marginTop: 3,
    color: '#171717',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0
  },
  homeSaleCard: {
    marginTop: 32,
    marginHorizontal: 18,
    minHeight: 112,
    borderRadius: 8,
    backgroundColor: '#202020',
    alignItems: 'center',
    justifyContent: 'center'
  },
  homeSaleText: {
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  homeSaleSub: {
    marginTop: 12,
    color: '#d6d2cf',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2
  },
  homeShippingCard: {
    marginTop: 18,
    marginHorizontal: 18,
    minHeight: 86,
    borderRadius: 8,
    backgroundColor: '#f4eded',
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  homeShippingTitle: {
    color: '#1f1b19',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  homeShippingText: {
    marginTop: 4,
    color: '#55514f',
    fontSize: 12,
    fontWeight: '500'
  },
  homeJournalBand: {
    marginTop: 34,
    paddingTop: 26,
    paddingHorizontal: 16,
    paddingBottom: 48,
    backgroundColor: '#f6efeb'
  },
  homeJournalHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14
  },
  homeJournalKicker: {
    color: '#9b5658',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 1.2
  },
  homeJournalTitle: {
    color: '#1f1b19',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  homeJournalLink: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#dfd2cd',
    backgroundColor: '#fffaf7',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  homeJournalLinkText: {
    color: '#9b5658',
    fontSize: 11,
    fontWeight: '900'
  },
  homeJournalIntro: {
    marginTop: 10,
    maxWidth: 310,
    color: '#706762',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500'
  },
  homeJournalGrid: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16
  },
  homeJournalProductCard: {
    width: '47.6%',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eadfdb',
    backgroundColor: '#fffdfb'
  },
  homeJournalImageFrame: {
    width: '100%',
    aspectRatio: 0.84,
    overflow: 'hidden',
    backgroundColor: '#e7ded7',
    position: 'relative'
  },
  homeJournalImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e7ded7'
  },
  homeJournalOverlay: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    minHeight: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 253, 251, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  homeJournalLookLabel: {
    color: '#5b514d',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4
  },
  homeJournalProductBody: {
    minHeight: 88,
    paddingHorizontal: 10,
    paddingTop: 9,
    paddingBottom: 11
  },
  homeJournalProductLabel: {
    color: '#9b5658',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  homeJournalProductTitle: {
    marginTop: 3,
    color: '#211c1a',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700'
  },
  homeJournalProductPrice: {
    marginTop: 4,
    color: '#211c1a',
    fontSize: 11,
    fontWeight: '900'
  },
  homeAtelier: {
    paddingHorizontal: 18,
    paddingTop: 44,
    paddingBottom: 48,
    alignItems: 'center',
    backgroundColor: '#fbf7f6'
  },
  homeDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#ece5e1',
    marginBottom: 34
  },
  homeAtelierTitle: {
    color: '#1f1b19',
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' })
  },
  homeAtelierText: {
    marginTop: 21,
    color: '#5c5754',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 21,
    fontWeight: '500'
  },
  homeEmailInput: {
    marginTop: 24,
    width: '100%',
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#ded7d3',
    backgroundColor: '#fbf7f6',
    color: '#111111',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '500'
  },
  homeSubscribeButton: {
    marginTop: 16,
    width: '100%',
    minHeight: 48,
    borderRadius: 7,
    backgroundColor: '#050606',
    alignItems: 'center',
    justifyContent: 'center'
  },
  homeSubscribeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4
  },
  homeFooterLinks: {
    paddingHorizontal: 24,
    paddingBottom: 55,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fbf7f6'
  },
  homeFooterHead: {
    color: '#111111',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1
  },
  homeFooterLink: {
    marginTop: 12,
    color: '#4b4846',
    fontSize: 12,
    fontWeight: '500'
  },
  homeFooterBottom: {
    marginHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 38,
    borderTopWidth: 1,
    borderTopColor: '#ece5e1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  homeFooterBrand: {
    color: '#1f1b19',
    fontSize: 16,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' })
  },
  homeCopyright: {
    color: '#b4aba6',
    fontSize: 10,
    fontWeight: '600'
  },
  shopScreen: {
    flex: 1,
    backgroundColor: '#fbf7f6'
  },
  shopContent: {
    paddingBottom: screenBottomInset,
    backgroundColor: '#fbf7f6'
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
    color: '#111111',
    fontSize: 19,
    lineHeight: 23,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
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
    color: '#070707',
    textAlign: 'center',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  shopHeroText: {
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
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1
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
    color: '#191513',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  shopSectionSub: {
    marginTop: 2,
    color: '#645f5c',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500'
  },
  shopViewAll: {
    color: '#4a4643',
    fontSize: 12,
    fontWeight: '800'
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
    fontWeight: '900',
    letterSpacing: 0.6,
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
    fontWeight: '800'
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
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2
  },
  shopDiscountTitle: {
    marginTop: 8,
    color: '#ffffff',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  shopDiscountText: {
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
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800'
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
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1
  },
  shopLookTitle: {
    marginTop: 4,
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  shopLookAction: {
    marginTop: 18,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
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
    fontWeight: '900',
    letterSpacing: 1.4
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
    bottom: Platform.OS === 'ios' ? 91 : 82,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wardrobeScreen: {
    flex: 1,
    backgroundColor: '#fbf7f6'
  },
  wardrobeContent: {
    paddingBottom: screenBottomInset,
    backgroundColor: '#fbf7f6'
  },
  wardrobeTopBar: {
    height: 86,
    paddingHorizontal: 28,
    backgroundColor: '#fbf7f6',
    borderBottomWidth: 1,
    borderBottomColor: '#ece5e1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  wardrobeBrand: {
    color: '#111111',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
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
    paddingTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18
  },
  wardrobeTitle: {
    color: '#1b1715',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  wardrobeSubtitle: {
    marginTop: 4,
    color: '#514f4e',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400'
  },
  wardrobeAddButton: {
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: '#050505',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9
  },
  wardrobeAddText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  wardrobeCategoryTrack: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 16
  },
  wardrobeCategoryButton: {
    width: 64,
    alignItems: 'center'
  },
  wardrobeCategoryIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#ebe6e3',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wardrobeCategoryIconActive: {
    borderWidth: 3,
    borderColor: '#9b5658'
  },
  wardrobeCategoryLabel: {
    marginTop: 8,
    color: '#444140',
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500'
  },
  wardrobeCategoryLabelActive: {
    color: '#111111',
    fontWeight: '900'
  },
  wardrobePreviewCard: {
    marginHorizontal: 18,
    aspectRatio: 0.92,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#edf1f2',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  wardrobePreviewImage: {
    width: '100%',
    height: '100%'
  },
  wardrobeSideTools: {
    position: 'absolute',
    right: 14,
    top: '35%',
    gap: 10
  },
  wardrobeSideTool: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wardrobeTryButton: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 18,
    minHeight: 40,
    minWidth: 148,
    borderRadius: 20,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  wardrobeTryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  wardrobeScoreBlock: {
    paddingTop: 28,
    alignItems: 'center'
  },
  wardrobeScoreCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3,
    borderColor: '#9b5658',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fbf7f6'
  },
  wardrobeScoreNumber: {
    color: '#171210',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  wardrobeScoreLabel: {
    marginTop: 1,
    color: '#56504d',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 2.3
  },
  wardrobeScoreText: {
    marginTop: 14,
    color: '#9b5658',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900'
  },
  wardrobeRecommendationsHead: {
    paddingHorizontal: 18,
    paddingTop: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14
  },
  wardrobeSectionTitle: {
    flex: 1,
    color: '#1b1715',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  wardrobeGenerateLink: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  wardrobeGenerateText: {
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
    color: '#211c1a',
    fontSize: 14,
    fontWeight: '900'
  },
  wardrobeEmptyRecommendationText: {
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
  addStudioScreen: {
    flex: 1,
    backgroundColor: '#fbf7f6'
  },
  addStudioContent: {
    paddingBottom: 132,
    backgroundColor: '#fbf7f6'
  },
  addStudioTopBar: {
    height: 62,
    paddingHorizontal: 14,
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
  addStudioBrand: {
    flex: 1,
    color: '#171412',
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  addStudioIntro: {
    paddingHorizontal: 20,
    paddingTop: 35
  },
  addStudioTitle: {
    color: '#171412',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  addStudioSubtitle: {
    marginTop: 9,
    color: '#55514f',
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500'
  },
  addStudioUploadBox: {
    marginTop: 44,
    marginHorizontal: 20,
    height: 424,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#b8b8b8',
    overflow: 'hidden',
    backgroundColor: '#fbf7f6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  addStudioUploadImage: {
    width: '100%',
    height: '100%'
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
    fontWeight: '900'
  },
  addStudioUploadText: {
    marginTop: 5,
    color: '#55514f',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500'
  },
  addStudioThumbRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
    flexDirection: 'row',
    gap: 12
  },
  addStudioAddThumb: {
    width: 80,
    height: 96,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    backgroundColor: '#e6e3e1',
    alignItems: 'center',
    justifyContent: 'center'
  },
  addStudioThumbWrap: {
    width: 80,
    height: 96,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    overflow: 'hidden',
    backgroundColor: '#ece7e3'
  },
  addStudioThumbImage: {
    width: '100%',
    height: '100%'
  },
  addStudioThumbClose: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  addStudioArchiveHead: {
    paddingHorizontal: 20,
    paddingTop: 52
  },
  addStudioArchiveTitle: {
    color: '#171412',
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  addStudioArchiveLine: {
    marginTop: 11,
    width: 48,
    height: 1,
    backgroundColor: '#9b5658'
  },
  addStudioSectionLabel: {
    marginTop: 38,
    paddingHorizontal: 20,
    color: '#4f4a48',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 3
  },
  addStudioForm: {
    paddingHorizontal: 20,
    paddingTop: 22
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
  addStudioSegmented: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: '#e9e3e3',
    padding: 4,
    flexDirection: 'row'
  },
  addStudioSegment: {
    flex: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  addStudioSegmentActive: {
    backgroundColor: '#1f1f1f'
  },
  addStudioSegmentText: {
    color: '#171412',
    fontSize: 12,
    fontWeight: '800'
  },
  addStudioSegmentTextActive: {
    color: '#ffffff'
  },
  addStudioTagInput: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c9cdd2',
    backgroundColor: '#ffffff',
    paddingLeft: 16,
    paddingRight: 7,
    flexDirection: 'row',
    alignItems: 'center'
  },
  addStudioTagTextInput: {
    flex: 1,
    minHeight: 44,
    color: '#171412',
    fontSize: 16,
    fontWeight: '400'
  },
  addStudioTagAdd: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#eee8e8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  addStudioTagRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8
  },
  addStudioTagPill: {
    minHeight: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d4cecb',
    backgroundColor: '#eee8e8',
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  addStudioTagPillText: {
    color: '#4f4a48',
    fontSize: 12,
    fontWeight: '500'
  },
  addStudioMessage: {
    marginHorizontal: 20,
    marginTop: 18
  },
  addStudioFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 96,
    borderTopWidth: 1,
    borderTopColor: '#e1dad7',
    backgroundColor: '#fbf7f6',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    flexDirection: 'row',
    gap: 16
  },
  addStudioDiscardButton: {
    flex: 1,
    minHeight: 56,
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
    letterSpacing: 1.2
  },
  addStudioSaveButton: {
    flex: 1,
    minHeight: 56,
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
    letterSpacing: 0.8
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
    fontWeight: '900',
    textTransform: 'uppercase',
    fontSize: 12,
    letterSpacing: 0
  },
  heroTitle: {
    marginTop: 8,
    color: '#fff',
    fontSize: 40,
    lineHeight: 43,
    fontWeight: '900',
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
    fontWeight: '900',
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
    fontWeight: '900',
    letterSpacing: 0
  },
  viewAll: {
    color: '#0f766e',
    fontWeight: '900'
  },
  horizontalList: {
    gap: 12,
    paddingRight: 16
  },
  productGrid: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'stretch'
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
    aspectRatio: 0.9,
    backgroundColor: '#e5e7eb',
    position: 'relative'
  },
  productImage: {
    width: '100%',
    height: '100%'
  },
  productImageFrame: {
    overflow: 'hidden',
    backgroundColor: '#f0ece8'
  },
  productImageSkeleton: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#eee7e2'
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
    borderColor: '#9b5658',
    backgroundColor: '#9b5658'
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
    fontWeight: '900',
    overflow: 'hidden'
  },
  productBody: {
    padding: 10,
    gap: 4
  },
  productTitle: {
    fontSize: 12,
    lineHeight: 16,
    color: '#111827',
    fontWeight: '900'
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
    fontWeight: '800'
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
    fontWeight: '900',
    fontSize: 12
  },
  discount: {
    color: '#0f766e',
    fontWeight: '900',
    fontSize: 11
  },
  wasPrice: {
    color: '#94a3b8',
    textDecorationLine: 'line-through',
    fontWeight: '700'
  },
  cardButton: {
    minHeight: 34,
    marginTop: 4
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
    fontWeight: '900',
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
    fontWeight: '900',
    color: '#134e4a'
  },
  searchPanel: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fffdfb',
    borderWidth: 1,
    borderColor: '#eadfda',
    shadowColor: '#2a211d',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
    gap: 9
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ded6d0',
    backgroundColor: '#fbf8f6',
    overflow: 'hidden'
  },
  searchInput: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    color: '#1f1b19',
    fontSize: 13,
    fontWeight: '800'
  },
  searchButton: {
    width: 52,
    alignSelf: 'stretch',
    backgroundColor: '#1e2230',
    alignItems: 'center',
    justifyContent: 'center'
  },
  filterRail: {
    flexDirection: 'row',
    gap: 7
  },
  dropdownButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#e2d8d2',
    backgroundColor: '#ffffff',
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5
  },
  dropdownButtonActive: {
    borderColor: '#c89c99',
    backgroundColor: '#fff8f6'
  },
  dropdownCopy: {
    flex: 1,
    minWidth: 0
  },
  dropdownLabel: {
    color: '#7b716a',
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7
  },
  dropdownValue: {
    marginTop: 2,
    color: '#1f1b19',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
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
    color: '#1f1b19',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
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
    flex: 1,
    color: '#3e3936',
    fontWeight: '800'
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
    backgroundColor: '#111827',
    borderColor: '#111827'
  },
  chipText: {
    color: '#334155',
    fontWeight: '800'
  },
  activeChipText: {
    color: '#fff'
  },
  resultsHead: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between'
  },
  screenTitle: {
    color: '#111827',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: 0
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
    fontWeight: '900',
    fontSize: 16
  },
  statusText: {
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20
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
    fontWeight: '900',
    fontSize: 18
  },
  lockedActions: {
    flexDirection: 'row',
    gap: 10
  },
  productDetailScreen: {
    flex: 1,
    backgroundColor: '#fbf7f6'
  },
  productDetailContent: {
    paddingBottom: screenBottomInset,
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
    color: '#111111',
    fontSize: 12,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  productBreadcrumb: {
    height: 34,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  productCrumbText: {
    color: '#57514d',
    fontSize: 10,
    fontWeight: '700'
  },
  productCrumbCurrent: {
    flex: 1,
    color: '#171412',
    fontSize: 10,
    fontWeight: '900'
  },
  productHeroMedia: {
    marginHorizontal: 14,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: '#050505'
  },
  productMediaTrack: {
    alignItems: 'stretch'
  },
  productMediaSlide: {
    height: '100%',
    backgroundColor: '#f2f0ef',
    position: 'relative'
  },
  productHeroImage: {
    width: '100%',
    height: '100%'
  },
  productHeroVideo: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000'
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
    fontWeight: '900'
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
    fontWeight: '900'
  },
  productFavoriteButton: {
    position: 'absolute',
    right: 13,
    top: 14,
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    alignItems: 'center',
    justifyContent: 'center'
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
    fontWeight: '800'
  },
  productSummary: {
    paddingHorizontal: 14,
    paddingTop: 19,
    paddingBottom: 24
  },
  productSummaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14
  },
  productSummaryTitleBlock: {
    flex: 1
  },
  productBrandLabel: {
    color: '#9b5658',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  productNameText: {
    marginTop: 4,
    color: '#171412',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600'
  },
  productPriceBlock: {
    alignItems: 'flex-end'
  },
  productDetailPrice: {
    color: '#171412',
    fontSize: 12,
    fontWeight: '900'
  },
  productRatingLine: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  productRatingText: {
    color: '#5b5551',
    fontSize: 11,
    fontWeight: '700'
  },
  productTagRow: {
    marginTop: 13,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9
  },
  productSoftTag: {
    minHeight: 22,
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: '#eee9e7',
    color: '#7a716d',
    paddingHorizontal: 12,
    paddingTop: 5,
    fontSize: 10,
    fontWeight: '800'
  },
  productOptionLabel: {
    marginTop: 25,
    color: '#423d3a',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6
  },
  productOptionValue: {
    color: '#5c5754',
    fontWeight: '800'
  },
  productSwatchRow: {
    marginTop: 13,
    flexDirection: 'row',
    gap: 14
  },
  productColorSwatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: '#d9d2ce'
  },
  productColorSwatchActive: {
    borderWidth: 2,
    borderColor: '#050505'
  },
  productSizeHead: {
    marginTop: 21,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  productSizeGuide: {
    color: '#9b5658',
    fontSize: 11,
    fontWeight: '800',
    textDecorationLine: 'underline'
  },
  productSizeRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10
  },
  productSizeButton: {
    flex: 1,
    minHeight: 45,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eadfdb',
    backgroundColor: '#fbf7f6',
    alignItems: 'center',
    justifyContent: 'center'
  },
  productSizeButtonActive: {
    borderWidth: 2,
    borderColor: '#171412',
    backgroundColor: '#ffffff'
  },
  productSizeText: {
    color: '#4f4a48',
    fontSize: 12,
    fontWeight: '800'
  },
  productSizeTextActive: {
    color: '#171412'
  },
  productActionRow: {
    marginTop: 24,
    flexDirection: 'row',
    gap: 8
  },
  productActionButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d4c8c4',
    backgroundColor: '#fbf7f6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  productActionButtonActive: {
    backgroundColor: '#050505',
    borderColor: '#050505'
  },
  productActionText: {
    color: '#4f4a48',
    fontSize: 12,
    fontWeight: '900'
  },
  productActionTextActive: {
    color: '#ffffff'
  },
  productBenefitsBand: {
    minHeight: 112,
    paddingHorizontal: 14,
    backgroundColor: '#f4eeee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around'
  },
  productBenefitItem: {
    flex: 1,
    alignItems: 'center'
  },
  productBenefitTitle: {
    marginTop: 8,
    color: '#3a3532',
    fontSize: 10,
    fontWeight: '900'
  },
  productBenefitText: {
    marginTop: 2,
    color: '#5f5854',
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600'
  },
  productAccordion: {
    paddingHorizontal: 14,
    paddingTop: 29
  },
  productAccordionRow: {
    minHeight: 42,
    borderBottomWidth: 1,
    borderBottomColor: '#e6dfdb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  productAccordionText: {
    color: '#3a3532',
    fontSize: 12,
    fontWeight: '900'
  },
  productStorySection: {
    paddingHorizontal: 14,
    paddingTop: 61
  },
  productStoryTitle: {
    color: '#3a2424',
    fontSize: 21,
    lineHeight: 27,
    fontStyle: 'italic',
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  productStoryText: {
    marginTop: 17,
    color: '#4f4a48',
    fontSize: 13,
    lineHeight: 23,
    fontWeight: '500'
  },
  productStoryImage: {
    marginTop: 46,
    width: '100%',
    height: 388,
    borderRadius: 7,
    backgroundColor: '#eee8e3'
  },
  completeLookSection: {
    paddingHorizontal: 14,
    paddingTop: 120
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
    fontWeight: '900',
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
    fontWeight: '900'
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
    fontWeight: '900'
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
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  productAtelierCopy: {
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
    fontWeight: '900'
  },
  productFooterDivider: {
    marginTop: 70,
    height: 1,
    backgroundColor: '#181818'
  },
  productFooterBrand: {
    marginTop: 37,
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 2.5
  },
  productFooterCopy: {
    marginTop: 8,
    color: '#8b8b8b',
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.9
  },
  productFooterLinks: {
    marginTop: 58,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  productFooterHead: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9
  },
  productFooterLink: {
    marginTop: 14,
    color: '#9b9b9b',
    fontSize: 11,
    fontWeight: '600'
  },
  aiStudioScreen: {
    flex: 1,
    backgroundColor: '#fbf7f6'
  },
  aiStudioContent: {
    paddingTop: 18,
    paddingBottom: screenBottomInset + 86,
    paddingHorizontal: 16,
    backgroundColor: '#fbf7f6'
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
  aiStudioEyebrow: {
    color: '#776f6a',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 1.7
  },
  aiGreetingText: {
    marginTop: 5,
    color: '#252221',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: 0
  },
  aiIdeaPanel: {
    marginTop: 14
  },
  aiIdeaPanelLabel: {
    color: '#8d8682',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
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
    flexShrink: 1,
    color: '#252221',
    fontSize: 13,
    fontWeight: '800'
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
    marginTop: 12,
    color: '#211c1a',
    fontSize: 17,
    fontWeight: '900'
  },
  aiEmptyText: {
    marginTop: 6,
    color: '#69615d',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500'
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
    color: '#55514f',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800'
  },
  conciergeSuggestionName: {
    marginTop: 5,
    minHeight: 34,
    color: '#171412',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    letterSpacing: 0
  },
  conciergeSuggestionPrice: {
    marginTop: 5,
    color: '#171412',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900'
  },
  conciergeShopButton: {
    marginTop: 9,
    alignSelf: 'flex-start',
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: '#050505',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  conciergeShopText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900'
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
    paddingHorizontal: 8,
    paddingVertical: 7,
    color: '#34302d',
    fontSize: 11,
    fontWeight: '800'
  },
  aiComposer: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: Platform.OS === 'ios' ? 14 : 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e8ddd8',
    backgroundColor: '#fffdfb',
    padding: 8,
    shadowColor: '#1a1412',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  aiImageButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#e2dad6',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  aiComposerInput: {
    flex: 1,
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: '#f8f4f2',
    paddingHorizontal: 14,
    color: '#171412',
    fontSize: 15,
    fontWeight: '400'
  },
  aiSendButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#9b5658',
    alignItems: 'center',
    justifyContent: 'center'
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
    fontWeight: '900'
  },
  detailImageCount: {
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
    fontWeight: '900'
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
    color: '#111827',
    fontSize: 12,
    fontWeight: '900'
  },
  detailBody: {
    paddingHorizontal: 16,
    gap: 10
  },
  detailTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0
  },
  detailPrice: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827'
  },
  description: {
    color: '#475569',
    lineHeight: 22,
    fontSize: 15
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
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800'
  },
  factValue: {
    color: '#111827',
    fontWeight: '900',
    marginTop: 4
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    color: '#334155',
    fontWeight: '800'
  },
  detailActions: {
    gap: 10
  },
  authEntryScroll: {
    flex: 1,
    backgroundColor: '#111111'
  },
  authEntryContent: {
    flexGrow: 1,
    justifyContent: 'center'
  },
  authEntryBackground: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%'
  },
  authEntryImageWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 17, 17, 0.18)'
  },
  authEntryShadow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.38)'
  },
  authEntryMain: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'stretch',
    paddingTop: 8,
    paddingBottom: 22
  },
  authEntryMainCompact: {
    paddingTop: 2,
    paddingBottom: 12
  },
  authEntryBrand: {
    alignItems: 'center'
  },
  authEntryLogo: {
    color: '#fff',
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  authEntryTagline: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontWeight: '300',
    textAlign: 'center'
  },
  authEntryFeatureList: {},
  authEntryFeature: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(25, 25, 25, 0.34)',
    flexDirection: 'row',
    alignItems: 'center'
  },
  authEntryCheck: {
    backgroundColor: '#ffb5b5',
    alignItems: 'center',
    justifyContent: 'center'
  },
  authEntryFeatureText: {
    flex: 1,
    color: '#fff',
    fontWeight: '400',
    letterSpacing: 0
  },
  authEntryCta: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24
  },
  authEntryCtaText: {
    color: '#151515',
    fontWeight: '400',
    letterSpacing: 0
  },
  authEntryExplore: {
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 2
  },
  authEntryExploreText: {
    color: 'rgba(255, 255, 255, 0.76)',
    fontWeight: '300'
  },
  authEntryHomeIndicator: {
    alignSelf: 'center',
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.28)'
  },
  signupScreen: {
    flex: 1,
    backgroundColor: '#fbf7f6'
  },
  signupContent: {
    flexGrow: 1,
    paddingTop: Platform.OS === 'android' ? 34 : 54,
    paddingBottom: 34
  },
  signupBrand: {
    color: '#050505',
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  signupTitle: {
    marginTop: 50,
    color: '#050505',
    fontSize: 60,
    lineHeight: 72,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  signupSubtitle: {
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
    flex: 1,
    minHeight: 52,
    color: '#111111',
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 0
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
    color: '#555b66',
    fontWeight: '700'
  },
  signupSectionLabel: {
    marginTop: 37,
    color: '#4b4b4d',
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: 1.2
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
    color: '#19191b',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
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
    color: '#ffffff',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
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
    backgroundColor: '#fbf7f6'
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
    color: '#ffffff',
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  loginHeroText: {
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
    backgroundColor: '#fbf7f6'
  },
  loginTitle: {
    color: '#111111',
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    letterSpacing: 0
  },
  loginSubtitle: {
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
    marginLeft: 58,
    color: '#111111',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
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
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#dedfde',
    backgroundColor: '#ffffff',
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20
  },
  loginInput: {
    flex: 1,
    minHeight: 50,
    color: '#111111',
    fontSize: 21,
    fontWeight: '400',
    letterSpacing: 0
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
    color: '#4b4b4d',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '400'
  },
  loginForgotText: {
    color: '#7a3a31',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700'
  },
  loginTermsText: {
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
    marginTop: 34,
    minHeight: 66,
    borderRadius: 14,
    backgroundColor: '#050606',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 22
  },
  loginSubmitText: {
    color: '#ffffff',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
    letterSpacing: 0
  },
  loginSwitch: {
    marginTop: 27,
    alignItems: 'center'
  },
  loginSwitchText: {
    color: '#4c4d50',
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '400'
  },
  loginSwitchLink: {
    color: '#050505'
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
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0
  },
  input: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    color: '#111827',
    backgroundColor: '#fff',
    fontWeight: '700'
  },
  formGroup: {
    gap: 8
  },
  formLabel: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '900',
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
    color: '#134e4a',
    fontWeight: '900'
  },
  photoGuide: {
    marginTop: 8,
    gap: 4
  },
  photoGuideTitle: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '900'
  },
  photoGuideText: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700'
  },
  formMessage: {
    color: '#475569',
    fontWeight: '700'
  },
  switchText: {
    color: '#0f766e',
    fontWeight: '900',
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
    fontWeight: '900',
    textAlign: 'center'
  },
  customModelPanel: {
    marginTop: 14,
    marginHorizontal: 16,
    gap: 10
  },
  customModelTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900'
  },
  customModelOptions: {
    gap: 8
  },
  customModelOption: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff'
  },
  customModelOptionActive: {
    borderColor: '#0f766e',
    backgroundColor: '#ecfdf5'
  },
  customModelText: {
    flex: 1
  },
  customModelLabel: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '900'
  },
  customModelLabelActive: {
    color: '#0f766e'
  },
  customModelHelp: {
    marginTop: 2,
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700'
  },
  customGenerateButton: {
    marginTop: 16
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
    fontWeight: '800'
  },
  composer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'ios' ? 80 : 106,
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
    fontWeight: '900'
  },
  creditsScreen: {
    flex: 1,
    backgroundColor: '#fbf7f6'
  },
  creditsContent: {
    paddingBottom: 26
  },
  creditsTopBar: {
    height: 66,
    paddingHorizontal: 36,
    borderBottomWidth: 1,
    borderBottomColor: '#ebe3e1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fbf7f6'
  },
  creditsTopIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center'
  },
  creditsBrand: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 25,
    color: '#111111'
  },
  creditsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15
  },
  creditsIntro: {
    paddingHorizontal: 36,
    paddingTop: 25,
    gap: 14
  },
  creditsIntroTitle: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 14,
    color: '#201c1c'
  },
  creditsIntroText: {
    color: '#747071',
    fontSize: 16,
    lineHeight: 25
  },
  creditsSectionLabel: {
    marginTop: 46,
    paddingHorizontal: 36,
    color: '#1c1919',
    fontSize: 15,
    letterSpacing: 4,
    fontWeight: '600'
  },
  creditTierStack: {
    marginTop: 24,
    paddingHorizontal: 36,
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
    fontWeight: '800'
  },
  creditTierTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14
  },
  creditTierName: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 14,
    color: '#1b1717'
  },
  creditTierPrice: {
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
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 29,
    lineHeight: 34,
    color: '#9b5658'
  },
  creditAmountLabel: {
    paddingBottom: 3,
    color: '#9b5658',
    fontSize: 15,
    letterSpacing: 2,
    fontWeight: '600'
  },
  creditTierDescription: {
    marginTop: 24,
    color: '#4d4a4a',
    fontSize: 13,
    lineHeight: 18
  },
  paymentMethodCard: {
    marginTop: 24,
    marginHorizontal: 36,
    height: 54,
    paddingHorizontal: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c9c9c9',
    backgroundColor: '#fffdfc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  paymentMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  paymentMethodText: {
    color: '#242020',
    fontSize: 15
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
    marginTop: 44,
    marginHorizontal: 36,
    paddingHorizontal: 22,
    paddingVertical: 25,
    borderRadius: 8,
    backgroundColor: '#fffdfc',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
    gap: 18
  },
  orderSummaryTitle: {
    marginBottom: 10,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 14,
    color: '#1d1919'
  },
  orderSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16
  },
  orderSummaryText: {
    color: '#474343',
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1
  },
  orderSummaryDivider: {
    height: 1,
    backgroundColor: '#d7d0ce'
  },
  totalAmountLabel: {
    color: '#111111',
    fontSize: 15,
    letterSpacing: 3,
    fontWeight: '500'
  },
  totalAmountValue: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    color: '#111111',
    fontSize: 21,
    fontWeight: '700'
  },
  creditsMessage: {
    marginTop: 16,
    marginHorizontal: 36,
    color: '#55514f',
    fontSize: 13,
    lineHeight: 18
  },
  secureCheckoutButton: {
    marginTop: 52,
    marginHorizontal: 36,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5
  },
  secureCheckoutText: {
    color: '#ffffff',
    fontSize: 15,
    letterSpacing: 4,
    fontWeight: '600'
  },
  creditsFooterLinks: {
    marginTop: 16,
    paddingHorizontal: 42,
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
    fontWeight: '900'
  },
  balanceLabel: {
    color: '#ccfbf1',
    fontWeight: '900'
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
    fontWeight: '900'
  },
  tokenName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827'
  },
  tokenRight: {
    alignItems: 'flex-end'
  },
  tokenAmount: {
    color: '#0f766e',
    fontWeight: '900'
  },
  profileScreen: {
    flex: 1,
    backgroundColor: '#fbf7f6'
  },
  profileContent: {
    paddingBottom: screenBottomInset
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
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 25,
    color: '#111111'
  },
  profileHero: {
    paddingTop: 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    minHeight: 268
  },
  profilePhotoWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: 'hidden',
    backgroundColor: '#efe7e4',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.09,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3
  },
  profilePhoto: {
    width: '100%',
    height: '100%'
  },
  profileAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  profilePhotoAction: {
    position: 'absolute',
    right: -1,
    bottom: 1,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: '#050505',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileCopy: {
    flex: 1
  },
  profileName: {
    marginTop: 18,
    color: '#2b2321',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    letterSpacing: 0,
    textAlign: 'center'
  },
  profileRole: {
    marginTop: 7,
    color: '#9b5658',
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: '800'
  },
  profileBio: {
    marginTop: 12,
    maxWidth: 320,
    color: '#5d5754',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500'
  },
  profileEditButton: {
    marginTop: 16,
    minWidth: 132,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileEditText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900'
  },
  profileCreditsCard: {
    marginHorizontal: 18,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5dcd9',
    backgroundColor: '#fbf7f6',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 1
  },
  profileCreditsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  profileCreditsLabel: {
    color: '#747071',
    fontSize: 12,
    fontWeight: '800'
  },
  profileCreditsAmountRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  profileCreditsAmount: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    color: '#2b2321',
    fontSize: 22,
    lineHeight: 28
  },
  profileCreditsTotal: {
    paddingBottom: 3,
    color: '#5d5754',
    fontSize: 12,
    fontWeight: '800'
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
    color: '#9b5658',
    fontSize: 14,
    letterSpacing: 1,
    fontWeight: '900'
  },
  profileSection: {
    marginTop: 36,
    paddingHorizontal: 18
  },
  profileSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  profileSectionTitle: {
    color: '#2b2321',
    fontSize: 22,
    lineHeight: 28,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontWeight: '400'
  },
  profilePhotoCount: {
    color: '#5d5754',
    fontSize: 12,
    fontWeight: '800'
  },
  profilePortraitTrack: {
    paddingTop: 18,
    gap: 12,
    paddingRight: 24
  },
  profileUploadPortrait: {
    width: 96,
    height: 124,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#c6c4c2',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  profileUploadPortraitText: {
    color: '#77716f',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700'
  },
  profilePortraitCard: {
    width: 96,
    height: 124,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#eee8e3'
  },
  profilePortraitImage: {
    width: '100%',
    height: '100%'
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
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900'
  },
  profileInlineMessage: {
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
  profileQuickCard: {
    minHeight: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5dcd9',
    backgroundColor: '#fffdfc',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  profileQuickIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f4eeee',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileQuickCopy: {
    flex: 1
  },
  profileQuickTitle: {
    color: '#2b2321',
    fontSize: 15,
    fontWeight: '800'
  },
  profileQuickSub: {
    marginTop: 4,
    color: '#77716f',
    fontSize: 12,
    fontWeight: '600'
  },
  profilePaymentCard: {
    marginTop: 24,
    minHeight: 82,
    borderRadius: 8,
    backgroundColor: '#f0eaea',
    paddingHorizontal: 22,
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
  profileVisaText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900'
  },
  profilePaymentCopy: {
    flex: 1
  },
  profilePaymentTitle: {
    color: '#2b2321',
    fontSize: 15,
    fontWeight: '700'
  },
  profilePaymentSub: {
    marginTop: 4,
    color: '#5d5754',
    fontSize: 12,
    fontWeight: '600'
  },
  profileSettingsList: {
    marginTop: 24
  },
  profileSettingsRow: {
    minHeight: 77,
    borderBottomWidth: 1,
    borderBottomColor: '#e9e1de',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  profileSettingsCopy: {
    flex: 1,
    paddingRight: 20
  },
  profileSettingsLabel: {
    color: '#5d5754',
    fontSize: 14,
    fontWeight: '700'
  },
  profileSettingsValue: {
    marginTop: 4,
    color: '#3f3937',
    fontSize: 14,
    fontWeight: '800'
  },
  profileLogoutButton: {
    marginTop: 78,
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
    color: '#c85664',
    fontSize: 13,
    letterSpacing: 0.5,
    fontWeight: '900'
  },
  wishlistScreen: {
    flex: 1,
    backgroundColor: '#fbf7f6'
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
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 22,
    color: '#2b2321'
  },
  wishlistTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  wishlistBody: {
    paddingHorizontal: 35,
    paddingTop: 31
  },
  wishlistTitle: {
    color: '#2b2321',
    fontSize: 26,
    lineHeight: 32,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontWeight: '400'
  },
  wishlistCount: {
    color: '#77716f',
    fontSize: 15
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
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
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
    color: '#111111',
    fontSize: 12,
    fontWeight: '700'
  },
  wishlistTabs: {
    paddingTop: 42,
    gap: 28
  },
  wishlistTab: {
    minHeight: 22,
    justifyContent: 'center'
  },
  wishlistTabText: {
    color: '#4b4644',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  wishlistTabTextActive: {
    color: '#111111'
  },
  wishlistSortRow: {
    marginTop: 27,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#eee7e4',
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  wishlistSortText: {
    color: '#77716f',
    fontSize: 12,
    fontWeight: '700'
  },
  wishlistSortStrong: {
    color: '#3f3937'
  },
  wishlistViewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  wishlistGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 30
  },
  wishlistProductCard: {
    width: '47%'
  },
  wishlistProductImageWrap: {
    width: '100%',
    aspectRatio: 0.76,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#eee8e3'
  },
  wishlistProductImage: {
    width: '100%',
    height: '100%'
  },
  wishlistHeartButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wishlistProductBrand: {
    marginTop: 12,
    color: '#4b4644',
    fontSize: 12,
    letterSpacing: 0.8,
    fontWeight: '700'
  },
  wishlistProductName: {
    marginTop: 4,
    minHeight: 35,
    color: '#1e1a19',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '500'
  },
  wishlistProductPrice: {
    marginTop: 4,
    color: '#050505',
    fontSize: 15,
    fontWeight: '900'
  },
  wishlistSizeRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  wishlistSizeChip: {
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
    height: 31,
    borderRadius: 7,
    backgroundColor: '#050505',
    alignItems: 'center',
    justifyContent: 'center'
  },
  wishlistMoveText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  wishlistProCard: {
    marginTop: 60,
    paddingHorizontal: 23,
    paddingTop: 25,
    paddingBottom: 22,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ff9d9d',
    backgroundColor: '#ffe1e1'
  },
  wishlistProBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#9b5658',
    color: '#ffffff',
    fontSize: 9,
    letterSpacing: 1.1,
    fontWeight: '900'
  },
  wishlistProTitle: {
    marginTop: 20,
    color: '#9b5658',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '400'
  },
  wishlistProText: {
    marginTop: 12,
    maxWidth: 270,
    color: '#9b5658',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500'
  },
  wishlistUpgradeButton: {
    marginTop: 20,
    alignSelf: 'flex-start',
    height: 38,
    borderRadius: 19,
    backgroundColor: '#9b5658',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center'
  },
  wishlistUpgradeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900'
  },
  wishlistSectionTitle: {
    marginTop: 66,
    color: '#2b2321',
    fontSize: 22,
    lineHeight: 28,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontWeight: '400'
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
    height: 151,
    borderRadius: 8,
    backgroundColor: '#eee8e3'
  },
  wishlistRecommendedBrand: {
    marginTop: 12,
    color: '#4b4644',
    fontSize: 11,
    letterSpacing: 0.7,
    fontWeight: '700'
  },
  wishlistRecommendedPrice: {
    marginTop: 3,
    color: '#050505',
    fontSize: 14,
    fontWeight: '900'
  },
  ordersScreen: {
    flex: 1,
    backgroundColor: '#fbf7f6'
  },
  ordersContent: {
    paddingBottom: screenBottomInset
  },
  ordersBody: {
    paddingHorizontal: 35,
    paddingTop: 32,
    gap: 16
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
    fontWeight: '800'
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
    fontWeight: '900'
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
    fontWeight: '900',
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
    fontWeight: '900'
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
    fontWeight: '900'
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
  panelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
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
    fontWeight: '900'
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
    fontWeight: '900'
  },
  railLabel: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '900'
  },
  railMeta: {
    maxWidth: 92,
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
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
    fontWeight: '900'
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
    fontWeight: '900'
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
    fontWeight: '900'
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
    fontWeight: '900'
  },
  actionMetricLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800'
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
    fontWeight: '900'
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
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 32
  },
  actionMeta: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '900',
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
    fontWeight: '900'
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
    fontWeight: '900'
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
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  comboSlotValue: {
    marginTop: 5,
    color: '#111827',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900'
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
    fontWeight: '900'
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
    fontWeight: '900'
  },
  selectedChipAction: {
    color: '#0f766e',
    fontSize: 11,
    fontWeight: '900'
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
    fontWeight: '900',
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
    fontWeight: '900'
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
    gap: 12
  },
  closetItemCard: {
    width: 174,
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
    height: 174,
    backgroundColor: '#e5e7eb'
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
    fontWeight: '900'
  },
  selectTextActive: {
    color: '#0f766e'
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
    fontWeight: '900',
    marginBottom: 4
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
    fontWeight: '900'
  },
  stepTitle: {
    color: '#111827',
    fontWeight: '900',
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
  tryOnLoadingText: {
    color: '#fff',
    fontWeight: '900',
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
});
