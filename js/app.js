/* EMGOVI shared frontend logic */

const CART_KEY = 'emgovi_cart';

function formatNaira(amount) {
  return '₦' + Number(amount).toLocaleString('en-NG');
}

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

function addToCart(item) {
  const cart = getCart();
  const existing = cart.find((c) => c.variant_id === item.variant_id);
  if (existing) {
    existing.quantity += item.quantity;
  } else {
    cart.push(item);
  }
  saveCart(cart);
}

function updateCartQty(variantId, quantity) {
  let cart = getCart();
  if (quantity <= 0) {
    cart = cart.filter((c) => c.variant_id !== variantId);
  } else {
    const item = cart.find((c) => c.variant_id === variantId);
    if (item) item.quantity = quantity;
  }
  saveCart(cart);
  return cart;
}

function removeFromCart(variantId) {
  const cart = getCart().filter((c) => c.variant_id !== variantId);
  saveCart(cart);
  return cart;
}

function cartCount() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function cartTotal() {
  return getCart().reduce((sum, item) => sum + item.price * item.quantity, 0);
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartBadge();
}

function updateCartBadge() {
  const badge = document.querySelector('.cart-badge');
  if (!badge) return;
  const count = cartCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
}

async function fetchJSON(url, options = {}) {
  const { headers: customHeaders, ...restOptions } = options;
  const res = await fetch(url, {
    credentials: 'include',
    ...restOptions,
    headers: { 'Content-Type': 'application/json', ...(customHeaders || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong. Please try again.');
  }
  return data;
}

async function getCurrentUser() {
  try {
    const data = await fetchJSON('/api/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

function stockBadge(stockQty) {
  if (stockQty <= 0) return '<span class="badge badge-out-of-stock">Out of stock</span>';
  if (stockQty <= 5) return `<span class="badge badge-low-stock">Only ${stockQty} left</span>`;
  return '<span class="badge badge-in-stock">In stock</span>';
}

function getAdminPin() {
  return sessionStorage.getItem('emgovi_admin_pin') || '';
}

function setAdminPin(pin) {
  sessionStorage.setItem('emgovi_admin_pin', pin);
}

document.addEventListener('DOMContentLoaded', updateCartBadge);
