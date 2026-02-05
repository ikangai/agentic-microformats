const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Load product data
const products = require('./data/products.json');

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: 'agentic-microformats-demo',
  resave: false,
  saveUninitialized: true
}));

// Cart helper middleware
app.use((req, res, next) => {
  if (!req.session.cart) {
    req.session.cart = [];
  }
  if (!req.session.orders) {
    req.session.orders = [];
  }

  // Enrich cart items with product data for templates
  res.locals.cart = req.session.cart.map(item => {
    const product = products.find(p => p.id === item.product_id);
    return {
      ...item,
      name: product ? product.name : 'Unknown product',
      price: product ? product.price : 0
    };
  });
  res.locals.cartCount = req.session.cart.reduce((sum, item) => sum + item.quantity, 0);
  res.locals.cartTotal = res.locals.cart.reduce(
    (sum, item) => sum + item.price * item.quantity, 0
  ).toFixed(2);

  next();
});

// ──────────────────────────────────────────────
// Page routes
// ──────────────────────────────────────────────

// Catalog
app.get('/', (req, res) => {
  res.render('catalog', {
    products,
    title: 'Product Catalog',
    pageType: 'product-catalog'
  });
});

// Product detail
app.get('/product/:id', (req, res) => {
  const product = products.find(p => p.id === req.params.id);
  if (!product) {
    return res.status(404).send('Product not found');
  }
  res.render('product', {
    product,
    title: product.name,
    pageType: 'product-detail'
  });
});

// Cart
app.get('/cart', (req, res) => {
  res.render('cart', {
    title: 'Shopping Cart',
    pageType: 'shopping-cart'
  });
});

// Checkout
app.get('/checkout', (req, res) => {
  if (req.session.cart.length === 0) {
    return res.redirect('/cart');
  }
  res.render('checkout', {
    title: 'Checkout',
    pageType: 'checkout'
  });
});

// Order confirmation
app.get('/confirmation/:orderId', (req, res) => {
  const order = req.session.orders.find(o => o.id === req.params.orderId);
  if (!order) {
    return res.status(404).send('Order not found');
  }
  res.render('confirmation', {
    order,
    title: 'Order Confirmed',
    pageType: 'order-confirmation'
  });
});

// ──────────────────────────────────────────────
// API endpoints
// ──────────────────────────────────────────────

// Add to cart
app.post('/api/cart/add', (req, res) => {
  const { product_id, quantity } = req.body;
  const qty = parseInt(quantity, 10);

  // Validate product exists
  const product = products.find(p => p.id === product_id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }

  // Validate quantity
  if (isNaN(qty) || qty < 1 || qty > 10) {
    return res.status(400).json({ success: false, message: 'Quantity must be between 1 and 10' });
  }

  // Check if item already in cart
  const existingItem = req.session.cart.find(item => item.product_id === product_id);
  if (existingItem) {
    existingItem.quantity = Math.min(existingItem.quantity + qty, 10);
  } else {
    req.session.cart.push({
      id: crypto.randomUUID(),
      product_id,
      quantity: qty
    });
  }

  const cartCount = req.session.cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = req.session.cart.reduce((sum, item) => {
    const p = products.find(pr => pr.id === item.product_id);
    return sum + (p ? p.price * item.quantity : 0);
  }, 0);

  const cartItem = req.session.cart.find(item => item.product_id === product_id);
  res.json({
    success: true,
    message: `Added ${product.name} to cart`,
    cartItemId: cartItem.id,
    cartCount,
    cartTotal
  });
});

// Update cart item
app.patch('/api/cart/:id', (req, res) => {
  const { quantity } = req.body;
  const qty = parseInt(quantity, 10);

  // Find item in cart
  const item = req.session.cart.find(i => i.id === req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, message: 'Cart item not found' });
  }

  // Validate quantity
  if (isNaN(qty) || qty < 1 || qty > 10) {
    return res.status(400).json({ success: false, message: 'Quantity must be between 1 and 10' });
  }

  item.quantity = qty;

  res.json({ success: true, message: 'Cart updated' });
});

// Remove cart item
app.delete('/api/cart/:id', (req, res) => {
  const index = req.session.cart.findIndex(i => i.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Cart item not found' });
  }

  req.session.cart.splice(index, 1);

  res.json({ success: true, message: 'Item removed from cart' });
});

// Checkout
app.post('/api/checkout', (req, res) => {
  // Validate cart is not empty
  if (!req.session.cart || req.session.cart.length === 0) {
    return res.status(400).json({ success: false, message: 'Cart is empty' });
  }

  const { shipping, payment } = req.body;

  // Validate shipping info
  if (!shipping || !shipping.name || !shipping.address || !shipping.city || !shipping.postal_code || !shipping.country) {
    return res.status(400).json({ success: false, message: 'Missing required shipping information' });
  }

  // Validate payment info
  if (!payment || !payment.card_number || !payment.expiry || !payment.cvv) {
    return res.status(400).json({ success: false, message: 'Missing required payment information' });
  }

  // Calculate total
  const total = req.session.cart.reduce((sum, item) => {
    const product = products.find(p => p.id === item.product_id);
    return sum + (product ? product.price * item.quantity : 0);
  }, 0);

  // Create order
  const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();
  const order = {
    id: orderId,
    items: req.session.cart.map(item => {
      const product = products.find(p => p.id === item.product_id);
      return {
        id: item.id,
        product_id: item.product_id,
        name: product ? product.name : 'Unknown product',
        price: product ? product.price : 0,
        quantity: item.quantity
      };
    }),
    total: total.toFixed(2),
    currency: 'EUR',
    shipping: {
      name: shipping.name,
      address: shipping.address,
      city: shipping.city,
      postal_code: shipping.postal_code,
      country: shipping.country
    },
    payment: {
      last_four: String(payment.card_number).slice(-4)
    },
    status: 'confirmed',
    created_at: new Date().toISOString()
  };

  // Store order and clear cart
  req.session.orders.push(order);
  req.session.cart = [];

  res.json({
    success: true,
    orderId,
    redirect: `/confirmation/${orderId}`
  });
});

// ──────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`AgentShop demo running at http://localhost:${PORT}`);
});
