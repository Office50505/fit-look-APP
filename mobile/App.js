import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  useWindowDimensions,
  View
} from 'react-native';
import { api, clearToken, filePart, formatMoney, getToken, imageUrl, saveToken } from './src/api';
import { categories, images, infoPages } from './src/assets';

const genders = ['men', 'women', 'unisex'];
const sortOptions = [
  ['', 'Relevant'],
  ['newest', 'Newest'],
  ['price-asc', 'Price low'],
  ['price-desc', 'Price high']
];
const validRoutes = new Set(['auth', 'home', 'shop', 'tryon', 'custom', 'vto', 'stylebot', 'tokens', 'profile', 'product', 'signup', 'login', 'how', 'info']);

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
        <ScrollView contentContainerStyle={styles.scrollContent}>
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

function productImageSource(product, tryOn) {
  const url = imageUrl(tryOn?.imageUrl || product?.imageUrl);
  return url ? { uri: url } : images.hero;
}

function productImageResizeMode(tryOn) {
  return tryOn?.imageUrl ? 'contain' : 'cover';
}

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
          products: data.products || [],
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

function tryOnModelLabel(value) {
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

function AppButton({ label, icon, variant = 'primary', disabled, onPress, style }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, variant === 'secondary' && styles.secondaryButton, variant === 'ghost' && styles.ghostButton, disabled && styles.disabledButton, style]}
    >
      {icon ? <Ionicons name={icon} size={17} color={variant === 'primary' ? '#fff' : '#111827'} /> : null}
      <Text style={[styles.buttonText, variant !== 'primary' && styles.secondaryButtonText]}>{label}</Text>
    </TouchableOpacity>
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

function BottomNav({ route = { name: 'home' }, onNavigate = () => {} }) {
  const activeRoute = route?.name || 'home';
  const items = [
    ['home', 'home-outline', 'Home'],
    ['shop', 'search-outline', 'Shop'],
    ['tryon', 'shirt-outline', 'Try-On'],
    ['stylebot', 'chatbubble-ellipses-outline', 'Bot'],
    ['custom', 'image-outline', 'Custom'],
    ['profile', 'person-outline', 'Profile']
  ];
  return (
    <View style={styles.bottomNav}>
      {items.map(([name, icon, label]) => {
        const active = activeRoute === name;
        return (
          <TouchableOpacity key={name} style={styles.navItem} onPress={() => onNavigate(name)}>
            <Ionicons name={icon} size={21} color={active ? '#0f766e' : '#6b7280'} />
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
      <View style={styles.statusPanel}>
        <ActivityIndicator color="#0f766e" />
        <Text style={styles.statusText}>{text || 'Loading...'}</Text>
      </View>
    );
  }
  if (error || empty) {
    return (
      <View style={styles.statusPanel}>
        <Text style={styles.statusTitle}>{error ? 'Something needs attention' : 'No products yet'}</Text>
        <Text style={styles.statusText}>{error || text || 'Products will appear here as soon as the catalog is available.'}</Text>
      </View>
    );
  }
  return null;
}

function ProductCard({ product, tryOn, loading, error, locked, onPress, onTryOn }) {
  const hasDiscount = product?.compareAtPrice && product.compareAtPrice > product.price;
  const discount = hasDiscount ? `${Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)}% off` : '';
  return (
    <Pressable style={[styles.productCard, locked && styles.lockedCard]} onPress={locked ? undefined : onPress}>
      <View style={styles.productImageWrap}>
        <Image source={productImageSource(product, tryOn)} style={styles.productImage} resizeMode={productImageResizeMode(tryOn)} />
        {locked ? <View style={styles.lockOverlay}><Ionicons name="lock-closed" size={22} color="#fff" /></View> : null}
        {tryOn?.imageUrl ? <Text style={styles.badge}>AI Try-On</Text> : product?.badge ? <Text style={styles.badge}>{product.badge}</Text> : null}
        {loading ? <TryOnLoading text="Generating" /> : null}
      </View>
      <View style={styles.productBody}>
        <Text style={styles.productTitle} numberOfLines={2}>{product?.name || 'Product'}</Text>
        <Text style={styles.productBrand} numberOfLines={1}>{product?.brand || 'Brand'}</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={13} color="#f59e0b" />
          <Text style={styles.ratingText}>{Number(product?.rating || 0).toFixed(1)} {product?.ratingCount ? `(${product.ratingCount})` : ''}</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatMoney(product?.price || 0, product?.currency)}</Text>
          {discount ? <Text style={styles.discount}>{discount}</Text> : null}
        </View>
        {onTryOn ? (
          <AppButton
            label={tryOn?.imageUrl ? 'Try-On Ready' : loading ? 'Generating...' : 'Try On'}
            icon="sparkles-outline"
            disabled={loading || Boolean(tryOn?.imageUrl)}
            onPress={onTryOn}
            style={styles.cardButton}
          />
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </Pressable>
  );
}

function ProductRow({ title, state, onNavigate, user, token }) {
  const products = (state.products || []).slice(0, 6);
  const [tryOns] = useTryOns(user, products, token);
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
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalList}
        renderItem={({ item }) => (
          <ProductCard product={item} tryOn={tryOns[item.id]} onPress={() => onNavigate('product', { id: item.id })} />
        )}
      />
    </View>
  );
}

function HomeScreen({ onNavigate, user, token }) {
  const trending = useProducts({ limit: 6 }, token);
  const arrivals = useProducts({ newArrival: 'true', sort: 'newest', limit: 6 }, token);
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Hero onNavigate={onNavigate} />
      <ProductRow title="Trending Now" state={trending} onNavigate={onNavigate} user={user} token={token} />
      <ProductRow title="New Arrivals" state={arrivals} onNavigate={onNavigate} user={user} token={token} />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Shop by Category</Text>
        <View style={styles.categoryGrid}>
          {categories.map(([label, image, category]) => (
            <View key={label} style={styles.categoryCell}>
              <Pressable style={styles.categoryCard} onPress={() => onNavigate('shop', { category })}>
              <Image source={images[image]} style={styles.categoryImage} />
              <Text style={styles.categoryText}>{label}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>
      <FeatureBand />
    </ScrollView>
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

  return (
    <>
      <TouchableOpacity accessibilityRole="button" style={styles.dropdownButton} onPress={() => setOpen(true)}>
        <View style={styles.dropdownCopy}>
          <Text style={styles.dropdownLabel}>{label}</Text>
          <Text style={styles.dropdownValue} numberOfLines={1}>{selectedLabel}</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color="#334155" />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.dropdownBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.dropdownSheet} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.dropdownTitle}>{label}</Text>
            <ScrollView style={styles.dropdownOptions}>
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

function ShopScreen({ initial = {}, tryOnMode, user, setUser, token, onNavigate }) {
  const [draft, setDraft] = useState(initial.q || '');
  const [filters, setFilters] = useState({
    q: initial.q || '',
    category: initial.category || '',
    brand: '',
    gender: initial.gender || '',
    sort: initial.sort || '',
    newArrival: initial.newArrival || ''
  });
  const [continueWithoutTryOn, setContinueWithoutTryOn] = useState(false);
  const [tryOnLoading, setTryOnLoading] = useState({});
  const [tryOnErrors, setTryOnErrors] = useState({});
  const autoKey = useRef('');
  const state = useProducts({ ...filters, limit: 60 }, token);
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
    setContinueWithoutTryOn(false);
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
  const allowTryOnTrial = Boolean(user) && !continueWithoutTryOn && (tryOnMode || hasSearchIntent);
  const trialProducts = state.products.slice(0, 4);
  const visibleProducts = allowTryOnTrial ? trialProducts : state.products;
  const lockedProducts = allowTryOnTrial ? state.products.slice(4, 12) : [];

  const runSearch = () => {
    setContinueWithoutTryOn(false);
    setFilters((current) => ({ ...current, q: draft.trim() }));
  };

  const generateTryOn = useCallback(async (product) => {
    if (!user || !product?.id || tryOnLoading[product.id] || tryOns[product.id]) return;
    setTryOnLoading((current) => ({ ...current, [product.id]: true }));
    setTryOnErrors((current) => ({ ...current, [product.id]: '' }));
    try {
      const data = await api(`/tryons/${product.id}`, { method: 'POST' });
      setTryOns((current) => ({ ...current, [product.id]: data.tryOn }));
      if (data.user) setUser(data.user);
    } catch (error) {
      setTryOnErrors((current) => ({ ...current, [product.id]: error.message }));
    } finally {
      setTryOnLoading((current) => ({ ...current, [product.id]: false }));
    }
  }, [user, tryOnLoading, tryOns]);

  useEffect(() => {
    if (!user || tryOnMode || !hasSearchIntent || continueWithoutTryOn || state.loading || trialProducts.length === 0) return;
    const runKey = `${searchSignature}:${trialProducts.map((product) => product.id).join(',')}`;
    if (autoKey.current === runKey) return;
    autoKey.current = runKey;
    trialProducts.filter((product) => !tryOns[product.id]).forEach((product) => generateTryOn(product));
  }, [user?.id, tryOnMode, hasSearchIntent, continueWithoutTryOn, state.loading, searchSignature, trialProducts.map((product) => product.id).join(','), Object.keys(tryOns).join(',')]);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Hero compact onNavigate={onNavigate} />
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
        <FilterDropdown label="Category" selected={filters.category} options={[['', 'All'], ...categories.map(([label, , value]) => [value, label])]} onSelect={(category) => {
          setContinueWithoutTryOn(false);
          setFilters((current) => ({ ...current, category }));
        }} />
        <FilterDropdown label="Gender" selected={filters.gender} options={[['', 'All genders'], ...genders.map((gender) => [gender, titleCase(gender)])]} onSelect={(gender) => {
          setContinueWithoutTryOn(false);
          setFilters((current) => ({ ...current, gender }));
        }} />
        <FilterDropdown label="Sort" selected={filters.sort} options={sortOptions} onSelect={(sort) => {
          setContinueWithoutTryOn(false);
          setFilters((current) => ({ ...current, sort }));
        }} />
      </View>

      <View style={styles.resultsHead}>
        <View>
          <Text style={styles.screenTitle}>{tryOnMode ? 'AI Try-On' : filters.q || filters.category || 'All Products'}</Text>
          <Text style={styles.muted}>{state.loading ? 'Searching...' : `${state.total} products`}</Text>
        </View>
        {allowTryOnTrial ? (
          <TouchableOpacity onPress={() => setContinueWithoutTryOn(true)}>
            <Text style={styles.viewAll}>Browse regular</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <StatusPanel loading={state.loading} error={state.error} empty={!state.loading && !state.products.length} text="Try a different search or browse another category." />
      <View style={styles.productGrid}>
        {visibleProducts.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            tryOn={tryOns[product.id]}
            loading={Boolean(tryOnLoading[product.id])}
            error={tryOnErrors[product.id]}
            onPress={() => onNavigate('product', { id: product.id })}
            onTryOn={allowTryOnTrial && index < 4 ? () => generateTryOn(product) : undefined}
          />
        ))}
      </View>
      {lockedProducts.length ? (
        <View style={styles.lockedPanel}>
          <Text style={styles.lockedTitle}>More AI try-ons are token gated</Text>
          <Text style={styles.muted}>Use the first row for trial previews, buy more tokens, or continue browsing regular product photos.</Text>
          <View style={styles.lockedActions}>
            <AppButton label="Buy Tokens" icon="sparkles-outline" onPress={() => onNavigate('tokens')} />
            <AppButton label="Continue" variant="secondary" onPress={() => setContinueWithoutTryOn(true)} />
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function ProductScreen({ id, user, setUser, token, onNavigate }) {
  const { width } = useWindowDimensions();
  const [state, setState] = useState({ product: null, loading: true, error: '' });
  const [tryOn, setTryOn] = useState(null);
  const [tryOnLoading, setTryOnLoading] = useState(false);
  const [tryOnError, setTryOnError] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const related = useProducts({ category: state.product?.category || '', limit: 5 }, token);
  const relatedProducts = related.products.filter((item) => item.id !== id).slice(0, 4);
  const [relatedTryOns] = useTryOns(user, relatedProducts, token);

  useEffect(() => {
    let alive = true;
    setState({ product: null, loading: true, error: '' });
    api(`/products/${encodeURIComponent(id)}`)
      .then((data) => alive && setState({ product: data.product || null, loading: false, error: '' }))
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
    if (tryOnLoading || tryOn?.imageUrl) return;
    setTryOnLoading(true);
    setTryOnError('');
    try {
      const data = await api(`/tryons/${state.product.id}`, { method: 'POST' });
      setTryOn(data.tryOn);
      if (data.user) setUser(data.user);
    } catch (error) {
      setTryOnError(error.message);
    } finally {
      setTryOnLoading(false);
    }
  };

  if (state.loading || state.error || !state.product) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StatusPanel loading={state.loading} error={state.error} empty={!state.loading && !state.product} text="This item may have been removed from the catalog." />
      </ScrollView>
    );
  }

  const product = state.product;
  const tags = (product.tags || []).filter(Boolean).slice(0, 10);
  const mediaWidth = Math.max(1, Math.round(width - 32));
  const mediaHeight = Math.min(640, Math.max(500, Math.round(mediaWidth * 1.42)));
  const originalUri = imageUrl(product.imageUrl);
  const tryOnUri = imageUrl(tryOn?.imageUrl);
  const mediaItems = [
    tryOnUri ? { key: 'tryon', label: 'AI Try-On', source: { uri: tryOnUri }, uri: tryOnUri } : null,
    { key: 'original', label: 'Original Product', source: originalUri ? { uri: originalUri } : images.hero, uri: originalUri }
  ].filter(Boolean);
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={[styles.detailMedia, { height: mediaHeight }]}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.detailMediaTrack}
        >
          {mediaItems.map((item, index) => (
            <Pressable key={item.key} style={[styles.detailSlide, { width: mediaWidth }]} onPress={() => item.uri && setLightbox(item.uri)}>
              <Image source={item.source} style={styles.detailImage} resizeMode="contain" />
              <Text style={styles.detailImageBadge}>{item.label}</Text>
              {mediaItems.length > 1 ? <Text style={styles.detailImageCount}>{index + 1}/{mediaItems.length}</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
        {mediaItems.length > 1 ? (
          <View style={styles.detailSwipeHint}>
            <Ionicons name="swap-horizontal-outline" size={16} color="#111827" />
            <Text style={styles.detailSwipeText}>Slide to compare</Text>
          </View>
        ) : null}
        {tryOnLoading ? <TryOnLoading text="Generating try-on" large /> : null}
      </View>
      <View style={styles.detailBody}>
        <Text style={styles.kicker}>{product.brand}</Text>
        <Text style={styles.detailTitle}>{product.name}</Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={15} color="#f59e0b" />
          <Text style={styles.ratingText}>{Number(product.rating || 0).toFixed(1)} {product.ratingCount ? `(${product.ratingCount} reviews)` : ''}</Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.detailPrice}>{formatMoney(product.price || 0, product.currency)}</Text>
          {product.compareAtPrice ? <Text style={styles.wasPrice}>{formatMoney(product.compareAtPrice, product.currency)}</Text> : null}
        </View>
        <Text style={styles.description}>{product.description || 'No product description has been added yet.'}</Text>
        <View style={styles.factGrid}>
          {[
            ['Brand', product.brand],
            ['Category', product.category],
            ['For', product.gender],
            ['Model', product.tryOnModel]
          ].filter(([, value]) => value).map(([label, value]) => (
            <View key={label} style={styles.factItem}>
              <Text style={styles.factLabel}>{label}</Text>
              <Text style={styles.factValue}>{String(value)}</Text>
            </View>
          ))}
        </View>
        {tags.length ? (
          <View style={styles.tagWrap}>
            {tags.map((tag) => <Text key={tag} style={styles.tag}>{tag}</Text>)}
          </View>
        ) : null}
        <View style={styles.detailActions}>
          {product.affiliateLink ? <AppButton label="Shop Brand" icon="open-outline" onPress={() => Linking.openURL(product.affiliateLink)} /> : null}
          <AppButton
            label={tryOn?.imageUrl ? 'Try-On Ready' : tryOnLoading ? 'Generating...' : user ? 'Generate AI Try-On' : 'Create Profile'}
            icon="sparkles-outline"
            variant={product.affiliateLink ? 'secondary' : 'primary'}
            disabled={tryOnLoading || Boolean(tryOn?.imageUrl)}
            onPress={generate}
          />
        </View>
        {tryOnError ? <Text style={styles.errorText}>{tryOnError}</Text> : null}
      </View>
      {relatedProducts.length ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>More in {product.category}</Text>
            <TouchableOpacity onPress={() => onNavigate('shop', { category: product.category })}>
              <Text style={styles.viewAll}>View all</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            horizontal
            data={relatedProducts}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
            renderItem={({ item }) => <ProductCard product={item} tryOn={relatedTryOns[item.id]} onPress={() => onNavigate('product', { id: item.id })} />}
          />
        </View>
      ) : null}
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </ScrollView>
  );
}

function AuthScreen({ mode, setUser, setToken, onNavigate }) {
  const isSignup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [photo, setPhoto] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password || (isSignup && (!name || !photo))) {
      setMessage(isSignup ? 'Name, email, password, and body photo are required.' : 'Email and password are required.');
      return;
    }
    setLoading(true);
    setMessage('Working...');
    try {
      const body = isSignup ? new FormData() : JSON.stringify({ email, password });
      if (isSignup) {
        body.append('name', name);
        body.append('email', email);
        body.append('password', password);
        body.append('bodyPhoto', filePart(photo, 'body-photo.jpg'));
      }
      const data = await api(isSignup ? '/auth/signup' : '/auth/login', { method: 'POST', body });
      await saveToken(data.token);
      setToken(data.token);
      setUser(data.user);
      onNavigate('shop');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.authCard}>
          <Text style={styles.kicker}>{isSignup ? 'Create Profile' : 'Welcome Back'}</Text>
          <Text style={styles.authTitle}>{isSignup ? 'Build your AI fitting room.' : 'Log in to your fitting room.'}</Text>
          <Text style={styles.description}>{isSignup ? 'Upload one clear standing photo so FitLook can generate realistic outfit previews.' : 'Continue browsing, unlock saved looks, and generate AI previews.'}</Text>
          {isSignup ? <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor="#94a3b8" /> : null}
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email address" autoCapitalize="none" keyboardType="email-address" placeholderTextColor="#94a3b8" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry placeholderTextColor="#94a3b8" />
          {isSignup ? (
            <TouchableOpacity style={styles.uploadBox} onPress={async () => setPhoto(await pickImage())}>
              {photo?.uri ? <Image source={{ uri: photo.uri }} style={styles.uploadPreview} /> : <Ionicons name="cloud-upload-outline" size={30} color="#0f766e" />}
              <View style={styles.uploadCopy}>
                <Text style={styles.uploadTitle}>{photo ? 'Body photo selected' : 'Upload a clear standing photo'}</Text>
                <View style={styles.photoGuide}>
                  <Text style={styles.photoGuideTitle}>Best photo for AI try-on</Text>
                  <Text style={styles.photoGuideText}>Use a single-person, full-body photo from head to shoes.</Text>
                  <Text style={styles.photoGuideText}>Stand facing the camera with your face clearly visible.</Text>
                  <Text style={styles.photoGuideText}>Choose bright lighting and a simple background.</Text>
                  <Text style={styles.photoGuideText}>Avoid mirror selfies, heavy filters, group photos, cropped bodies, or covered faces.</Text>
                </View>
              </View>
            </TouchableOpacity>
          ) : null}
          <AppButton label={loading ? 'Working...' : isSignup ? 'Create Account' : 'Log In'} icon="person-outline" disabled={loading} onPress={submit} />
          {message ? <Text style={[styles.formMessage, message === 'Working...' ? null : styles.errorText]}>{message}</Text> : null}
          <TouchableOpacity onPress={() => onNavigate(isSignup ? 'login' : 'signup')}>
            <Text style={styles.switchText}>{isSignup ? 'Already have an account? Log in' : 'New to FitLook? Create an account'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AuthEntryScreen({ onNavigate }) {
  return (
    <ScrollView contentContainerStyle={[styles.scrollContent, styles.authEntryContent]}>
      <View style={styles.authEntryHero}>
        <Image source={images.hero} style={styles.authEntryImage} resizeMode="cover" />
        <View style={styles.authEntryOverlay} />
        <View style={styles.authEntryBrand}>
          <Text style={styles.authEntryLogo}>FitLook</Text>
          <Text style={styles.authEntryTagline}>AI fitting room</Text>
        </View>
      </View>
      <View style={styles.authEntryPanel}>
        <Text style={styles.kicker}>Start Here</Text>
        <Text style={styles.authEntryTitle}>Log in or create your FitLook account.</Text>
        <Text style={styles.description}>
          Save your profile photo, unlock AI try-ons, and preview outfits before you shop.
        </Text>
        <View style={styles.authEntryActions}>
          <AppButton label="Sign Up" icon="person-add-outline" onPress={() => onNavigate('signup')} />
          <AppButton label="Log In" icon="log-in-outline" variant="secondary" onPress={() => onNavigate('login')} />
        </View>
      </View>
    </ScrollView>
  );
}

function CustomTryOnScreen({ user, setUser, setToken, onNavigate }) {
  const [garment, setGarment] = useState(null);
  const [tryOnModel] = useState('wan-v2.6-image-to-image');
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
      form.append('tryOnModel', tryOnModel);
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
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.toolHero}>
        <Text style={styles.kicker}>Custom Try-On</Text>
        <Text style={styles.screenTitle}>Try on any clothing photo.</Text>
        <Text style={styles.description}>Upload a garment image and FitLook will generate it on your saved profile photo. Each generated image costs 1 token.</Text>
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
            ['wan-v2.6-image-to-image', 'WAN 2.6 image', 'Two-image garment transfer']
          ].map(([value, label, help]) => {
            const selected = tryOnModel === value;
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
    <ScrollView contentContainerStyle={styles.scrollContent}>
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

function StyleBotScreen({ user, setUser, setToken, onNavigate }) {
  const [query, setQuery] = useState('');
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const ideas = ['linen shirts under 1500', 'black party dress', 'gold sunglasses', 'oversized denim jacket'];

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
      const products = data.products || [];
      updateRun(id, () => ({ products, loading: false, generating: Object.fromEntries(products.map((product) => [product.id, true])) }));
      await Promise.allSettled(products.map(async (product) => {
        try {
          const generated = await api('/tryons/external', {
            method: 'POST',
            body: JSON.stringify({ product })
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

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.toolHero}>
          <Text style={styles.kicker}>Style Bot</Text>
          <Text style={styles.screenTitle}>Tell FitLook what to find.</Text>
          <Text style={styles.description}>The bot searches public Amazon pages, pulls the top two product details, and auto-generates try-ons. Each new try-on costs 1 token.</Text>
          <FilterChips selected="" options={ideas.map((idea) => [idea, idea])} onSelect={setQuery} compact />
        </View>
        <View style={styles.chatPanel}>
          <View style={styles.chatBubbleAssistant}><Text style={styles.chatText}>Tell me the item, vibe, color, budget, or occasion. I will find two options and generate the try-on here.</Text></View>
          {runs.map((run) => (
            <View key={run.id}>
              <View style={styles.chatBubbleUser}><Text style={styles.chatUserText}>{run.query}</Text></View>
              <View style={styles.chatBubbleAssistant}>
                {run.loading ? <StatusPanel loading text="Searching Amazon public pages..." /> : null}
                {run.searchError ? <Text style={styles.errorText}>{run.searchError}</Text> : null}
                {!run.loading && !run.searchError ? <Text style={styles.muted}>Found {run.products.length} products. Try-ons generate automatically.</Text> : null}
                {run.products.map((product) => (
                  <View key={product.id} style={styles.styleResult}>
                    <View style={styles.styleImages}>
                      <View style={styles.styleImageBox}>
                        <Image source={product.imageUrl ? { uri: imageUrl(product.imageUrl) } : images.hero} style={styles.styleImage} resizeMode="contain" />
                      </View>
                      <Pressable style={styles.styleImageBox} onPress={() => run.tryOns[product.id]?.imageUrl && setLightbox(imageUrl(run.tryOns[product.id].imageUrl))}>
                        {run.generating[product.id] ? <TryOnLoading text="Generating" /> : run.tryOns[product.id]?.imageUrl ? <Image key={imageUrl(run.tryOns[product.id].imageUrl)} source={{ uri: imageUrl(run.tryOns[product.id].imageUrl) }} style={styles.styleImage} resizeMode="contain" /> : <Text style={styles.previewPlaceholder}>On you</Text>}
                      </Pressable>
                    </View>
                    <Text style={styles.productTitle}>{product.name}</Text>
                    <Text style={styles.productBrand}>{product.brand} | {product.category}</Text>
                    <Text style={styles.styleModelBadge}>{tryOnModelLabel(product.tryOnModel)}</Text>
                    <Text style={styles.price}>{formatMoney(product.price, product.currency)}</Text>
                    {run.errors[product.id] ? <Text style={styles.errorText}>{run.errors[product.id]}</Text> : null}
                    {product.affiliateLink ? <AppButton label="Shop" variant="secondary" icon="open-outline" onPress={() => Linking.openURL(product.affiliateLink)} /> : null}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.composer}>
        <TextInput style={styles.composerInput} value={query} onChangeText={setQuery} placeholder="Describe an item or look" placeholderTextColor="#94a3b8" />
        <TouchableOpacity style={[styles.composerButton, (!query.trim() || busy) && styles.disabledButton]} disabled={!query.trim() || busy} onPress={submit}>
          <Ionicons name={busy ? 'hourglass-outline' : 'send'} size={19} color="#fff" />
        </TouchableOpacity>
      </View>
      <ImageLightbox uri={lightbox} onClose={() => setLightbox(null)} />
    </KeyboardAvoidingView>
  );
}

function TokensScreen({ user }) {
  const packs = [
    ['Starter', 10, '$4.99', 'For quick outfit checks.'],
    ['Everyday', 30, '$11.99', 'Best for regular browsing.'],
    ['Studio', 80, '$24.99', 'For heavy try-on sessions.']
  ];
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.toolHero}>
        <Text style={styles.kicker}>FitLook Tokens</Text>
        <Text style={styles.screenTitle}>One token, one AI try-on.</Text>
        <Text style={styles.description}>Tokens are used only when FitLook generates a new AI try-on image. Cached try-ons for the same product do not charge again.</Text>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceNumber}>{user?.devMode ? '∞' : user ? user.tokens : 4}</Text>
          <Text style={styles.balanceLabel}>{user?.devMode ? 'dev mode active' : user ? 'tokens available' : 'free tokens on signup'}</Text>
        </View>
      </View>
      {packs.map(([name, amount, price, copy]) => (
        <View key={name} style={styles.tokenPack}>
          <View>
            <Text style={styles.tokenName}>{name}</Text>
            <Text style={styles.muted}>{copy}</Text>
          </View>
          <View style={styles.tokenRight}>
            <Text style={styles.tokenAmount}>{amount} tokens</Text>
            <Text style={styles.price}>{price}</Text>
          </View>
        </View>
      ))}
      <View style={styles.infoGrid}>
        <InfoCard title="What costs tokens?" text={user?.devMode ? 'Dev Mode bypasses token charging for testing.' : 'Generating a product try-on or custom clothing try-on costs 1 token.'} />
        <InfoCard title="What is free?" text="Browsing, search, product pages, and viewing previously generated try-ons are free." />
        <InfoCard title="Why cache matters" text="If a try-on already exists for the same user and product, FitLook reuses it without charging another token." />
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

function ProfileScreen({ user, setUser, setToken, onNavigate }) {
  const [photo, setPhoto] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  if (!user) return <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={onNavigate} />;

  const photoSource = photo?.uri
    ? { uri: photo.uri }
    : user.bodyPhotoUrl
      ? { uri: imageUrl(user.bodyPhotoUrl) }
      : images.hero;

  const updatePhoto = async () => {
    if (!photo) {
      setMessage('Choose a new full-body photo first.');
      return;
    }
    setLoading(true);
    setMessage('Updating profile photo...');
    try {
      const form = new FormData();
      form.append('bodyPhoto', filePart(photo, 'body-photo.jpg'));
      const data = await api('/auth/me', { method: 'PUT', body: form });
      if (data.user) setUser(data.user);
      setPhoto(null);
      setMessage('Profile photo updated. New AI try-ons will use this image.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.profileHero}>
        <TouchableOpacity style={styles.profilePhotoWrap} onPress={async () => setPhoto(await pickImage())}>
          <Image source={photoSource} style={styles.profilePhoto} />
          <View style={styles.profilePhotoAction}>
            <Ionicons name="camera-outline" size={18} color="#fff" />
          </View>
        </TouchableOpacity>
        <View style={styles.profileCopy}>
          <Text style={styles.kicker}>Profile</Text>
          <Text style={styles.profileName}>{user.name || 'FitLook member'}</Text>
          <Text style={styles.profileEmail}>{user.email}</Text>
        </View>
      </View>

      <View style={styles.profileDetails}>
        {[
          ['Tokens', user.devMode ? 'Dev mode' : `${user.tokens ?? 0}`],
          ['Photo', formatFileSize(user.bodyPhotoSize)],
          ['Joined', formatDate(user.createdAt)],
          ['Updated', formatDate(user.updatedAt)]
        ].map(([label, value]) => (
          <View key={label} style={styles.profileStat}>
            <Text style={styles.profileStatLabel}>{label}</Text>
            <Text style={styles.profileStatValue}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.profileActions}>
        <TouchableOpacity style={styles.uploadBox} onPress={async () => setPhoto(await pickImage())}>
          <Ionicons name={photo ? 'checkmark-circle-outline' : 'cloud-upload-outline'} size={30} color="#0f766e" />
          <View style={styles.uploadCopy}>
            <Text style={styles.uploadTitle}>{photo ? 'New photo selected' : 'Change try-on photo'}</Text>
            <Text style={styles.photoGuideText}>Use a clear single-person, full-body image with your face visible.</Text>
          </View>
        </TouchableOpacity>
        <AppButton label={loading ? 'Saving...' : 'Save Profile Photo'} icon="save-outline" disabled={loading || !photo} onPress={updatePhoto} />
        <AppButton label="Browse Products" icon="search-outline" variant="secondary" onPress={() => onNavigate('shop')} />
        {message ? <Text style={[styles.formMessage, message.includes('updated') || message.includes('Updating') ? null : styles.errorText]}>{message}</Text> : null}
      </View>
    </ScrollView>
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
    <ScrollView contentContainerStyle={styles.scrollContent}>
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
    <ScrollView contentContainerStyle={styles.scrollContent}>
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
      <ActivityIndicator color="#fff" />
      <Text style={styles.tryOnLoadingText}>{text}</Text>
    </View>
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

  useEffect(() => {
    let alive = true;
    api('/auth/me')
      .then(async (data) => {
        if (!alive) return;
        setUser(data.user);
        setToken(await getToken());
        setRouteStack((current) => (current.length === 1 && current[0]?.name === 'auth' ? [normalizeRoute('shop')] : current));
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
        return user ? <ShopScreen initial={{}} user={user} setUser={setUser} token={token} onNavigate={navigate} /> : <AuthEntryScreen onNavigate={navigate} />;
      case 'home':
        return <HomeScreen onNavigate={navigate} user={user} token={token} />;
      case 'shop':
        return <ShopScreen initial={routeParams} user={user} setUser={setUser} token={token} onNavigate={navigate} />;
      case 'tryon':
        return user ? <ShopScreen tryOnMode initial={routeParams} user={user} setUser={setUser} token={token} onNavigate={navigate} /> : <AuthScreen mode="signup" setUser={setUser} setToken={setToken} onNavigate={navigate} />;
      case 'custom':
        return <CustomTryOnScreen user={user} setUser={setUser} setToken={setToken} onNavigate={navigate} />;
      case 'vto':
        return <VtoTrialScreen user={user} setUser={setUser} setToken={setToken} onNavigate={navigate} />;
      case 'stylebot':
        return <StyleBotScreen user={user} setUser={setUser} setToken={setToken} onNavigate={navigate} />;
      case 'tokens':
        return <TokensScreen user={user} />;
      case 'profile':
        return <ProfileScreen user={user} setUser={setUser} setToken={setToken} onNavigate={navigate} />;
      case 'product':
        return routeParams.id ? <ProductScreen id={routeParams.id} user={user} setUser={setUser} token={token} onNavigate={navigate} /> : <ShopScreen initial={{}} user={user} setUser={setUser} token={token} onNavigate={navigate} />;
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
  }, [currentRoute.name, routeParamsKey, user, token, navigate]);

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.boot}>
          <ActivityIndicator color="#0f766e" />
          <Text style={styles.muted}>Opening FitLook...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const authOnlyRoute = !user && ['auth', 'login', 'signup'].includes(currentRoute.name);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      {authOnlyRoute ? null : <Header user={user} canGoBack={routeStack.length > 1} onBack={goBack} onNavigate={navigate} onLogout={logout} />}
      <View style={styles.content}>
        <ScreenErrorBoundary routeName={currentRoute.name} onHome={() => navigate('home')}>
          {screen}
        </ScreenErrorBoundary>
      </View>
      {authOnlyRoute ? null : <BottomNav route={currentRoute} onNavigate={navigate} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8fafc'
  },
  flex: {
    flex: 1
  },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12
  },
  content: {
    flex: 1
  },
  scrollContent: {
    paddingBottom: Platform.OS === 'android' ? 104 : 112
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
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 22 : 8,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb'
  },
  navItem: {
    minWidth: 50,
    alignItems: 'center',
    gap: 3
  },
  navText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '700'
  },
  navTextActive: {
    color: '#0f766e'
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
    gap: 12
  },
  productCard: {
    width: 174,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  lockedCard: {
    opacity: 0.72
  },
  productImageWrap: {
    height: 208,
    backgroundColor: '#e5e7eb',
    position: 'relative'
  },
  productImage: {
    width: '100%',
    height: '100%'
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
    padding: 11,
    gap: 5
  },
  productTitle: {
    fontSize: 14,
    lineHeight: 18,
    color: '#111827',
    fontWeight: '900'
  },
  productBrand: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700'
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  ratingText: {
    color: '#475569',
    fontSize: 12,
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
    fontSize: 14
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
    minHeight: 38,
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
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 12,
    color: '#111827',
    fontWeight: '700'
  },
  searchButton: {
    width: 48,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center'
  },
  dropdownButton: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  dropdownCopy: {
    flex: 1
  },
  dropdownLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  dropdownValue: {
    marginTop: 3,
    color: '#111827',
    fontSize: 15,
    fontWeight: '900'
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'flex-end'
  },
  dropdownSheet: {
    maxHeight: '72%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    backgroundColor: '#fff',
    padding: 16
  },
  dropdownTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 10
  },
  dropdownOptions: {
    maxHeight: 420
  },
  dropdownOption: {
    minHeight: 48,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10
  },
  dropdownOptionActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#0f766e'
  },
  dropdownOptionText: {
    flex: 1,
    color: '#334155',
    fontWeight: '900'
  },
  dropdownOptionTextActive: {
    color: '#0f766e'
  },
  chipRow: {
    gap: 8,
    paddingRight: 12
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
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
    gap: 8
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
  authEntryContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 28
  },
  authEntryHero: {
    margin: 16,
    height: 350,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb'
  },
  authEntryImage: {
    width: '100%',
    height: '100%'
  },
  authEntryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.28)'
  },
  authEntryBrand: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20
  },
  authEntryLogo: {
    color: '#fff',
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '900',
    letterSpacing: 0
  },
  authEntryTagline: {
    marginTop: 4,
    color: '#ecfeff',
    fontSize: 15,
    fontWeight: '800'
  },
  authEntryPanel: {
    marginHorizontal: 16,
    padding: 18,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 12
  },
  authEntryTitle: {
    color: '#111827',
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: 0
  },
  authEntryActions: {
    gap: 10
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
  profileHero: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16
  },
  profilePhotoWrap: {
    width: 118,
    height: 150,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e5e7eb'
  },
  profilePhoto: {
    width: '100%',
    height: '100%'
  },
  profilePhotoAction: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(17, 24, 39, 0.82)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileCopy: {
    flex: 1
  },
  profileName: {
    marginTop: 6,
    color: '#111827',
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '900',
    letterSpacing: 0
  },
  profileEmail: {
    marginTop: 6,
    color: '#64748b',
    fontWeight: '800'
  },
  profileDetails: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  profileStat: {
    width: '48%',
    padding: 13,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb'
  },
  profileStatLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  profileStatValue: {
    marginTop: 5,
    color: '#111827',
    fontSize: 17,
    fontWeight: '900'
  },
  profileActions: {
    margin: 16,
    gap: 10
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
    backgroundColor: 'rgba(17, 24, 39, 0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  tryOnLoadingLarge: {
    position: 'absolute'
  },
  tryOnLoadingText: {
    color: '#fff',
    fontWeight: '900'
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
