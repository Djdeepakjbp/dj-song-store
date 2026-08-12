require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const PRODUCTS_FILE = path.join(DATA, "products.json");
const ORDERS_FILE = path.join(DATA, "orders.json");

if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || ""
});

app.set("trust proxy", 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(ROOT, "public")));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60 });
app.use("/api/", apiLimiter);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function products() { return readJson(PRODUCTS_FILE, []); }
function orders() { return readJson(ORDERS_FILE, []); }

function cleanProduct(p) {
  return {
    id: p.id, title: p.title, artist: p.artist || "", description: p.description || "",
    price: Number(p.price), cover: p.cover || "/assets/cover-placeholder.svg",
    preview: p.preview || "", active: p.active !== false
  };
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.TOKEN_SECRET || "dev-secret")
    .update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verifyToken(token) {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", process.env.TOKEN_SECRET || "dev-secret")
      .update(body).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

function admin(req, res, next) {
  const password = req.headers["x-admin-password"];
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/api/config", (req, res) => {
  res.json({
    storeName: process.env.STORE_NAME || "DJ Song Store",
    tagline: process.env.STORE_TAGLINE || "Digital Music Store",
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || ""
  });
});

app.get("/api/products", (req, res) => {
  res.json(products().filter(p => p.active !== false).map(cleanProduct));
});

app.get("/api/products/:id", (req, res) => {
  const p = products().find(x => x.id === req.params.id && x.active !== false);
  if (!p) return res.status(404).json({ error: "Song not found" });
  res.json(cleanProduct(p));
});

app.get("/api/products/:id/qr", async (req, res) => {
  const p = products().find(x => x.id === req.params.id && x.active !== false);
  if (!p) return res.status(404).end();
  const base = process.env.BASE_URL || `http://localhost:${PORT}`;
  const dataUrl = await QRCode.toDataURL(`${base}/song.html?id=${encodeURIComponent(p.id)}`, {
    width: 500, margin: 2, errorCorrectionLevel: "M"
  });
  res.json({ dataUrl });
});

app.post("/api/create-order", async (req, res) => {
  try {
    const p = products().find(x => x.id === req.body.productId && x.active !== false);
    if (!p) return res.status(404).json({ error: "Song not found" });
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ error: "Razorpay keys are not configured. Add them to .env." });
    }

    const amount = Math.round(Number(p.price) * 100);
    const order = await razorpay.orders.create({
      amount, currency: "INR", receipt: `song_${p.id}_${Date.now()}`,
      notes: { product_id: p.id }
    });

    const list = orders();
    list.push({
      orderId: order.id, productId: p.id, amount, status: "created",
      createdAt: new Date().toISOString()
    });
    writeJson(ORDERS_FILE, list);

    res.json({
      orderId: order.id, amount, currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID, product: cleanProduct(p)
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create payment order." });
  }
});

app.post("/api/verify-payment", (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment details." });
    }

    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: "Payment verification failed." });
    }

    const list = orders();
    const order = list.find(x => x.orderId === razorpay_order_id);
    if (!order) return res.status(404).json({ error: "Order not found." });

    order.status = "paid";
    order.paymentId = razorpay_payment_id;
    order.paidAt = new Date().toISOString();
    writeJson(ORDERS_FILE, list);

    // Token expires in 24 hours. It is bound to the purchased product/order.
    const token = signToken({
      orderId: order.orderId,
      productId: order.productId,
      paymentId: razorpay_payment_id,
      exp: Date.now() + 24 * 60 * 60 * 1000
    });

    const base = process.env.BASE_URL || `http://localhost:${PORT}`;
    res.json({
      success: true,
      downloadUrl: `${base}/api/download/${encodeURIComponent(token)}`
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Verification failed." });
  }
});

app.get("/api/download/:token", (req, res) => {
  const data = verifyToken(req.params.token);
  if (!data) return res.status(403).send("This download link is invalid or expired.");

  const p = products().find(x => x.id === data.productId && x.active !== false);
  if (!p) return res.status(404).send("Song not found.");

  const file = path.basename(p.file || "");
  const filePath = path.join(ROOT, "songs", file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Song file is not uploaded yet. Please contact the seller.");
  }

  res.download(filePath, file);
});

// ----- Admin API -----
app.get("/api/admin/products", admin, (req, res) => res.json(products()));

app.post("/api/admin/products", admin, (req, res) => {
  const { id, title, artist, description, price, cover, preview, file, active } = req.body;
  if (!id || !title || !file || !Number(price)) return res.status(400).json({ error: "id, title, file and price are required." });
  const list = products();
  if (list.some(x => x.id === id)) return res.status(409).json({ error: "Product ID already exists." });
  const p = { id, title, artist: artist || "", description: description || "", price: Number(price),
    cover: cover || "/assets/cover-placeholder.svg", preview: preview || "", file: path.basename(file), active: active !== false };
  list.push(p); writeJson(PRODUCTS_FILE, list); res.json(p);
});

app.put("/api/admin/products/:id", admin, (req, res) => {
  const list = products();
  const i = list.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "Product not found." });
  list[i] = { ...list[i], ...req.body, price: Number(req.body.price ?? list[i].price), file: path.basename(req.body.file ?? list[i].file) };
  writeJson(PRODUCTS_FILE, list); res.json(list[i]);
});

app.delete("/api/admin/products/:id", admin, (req, res) => {
  const list = products().filter(x => x.id !== req.params.id);
  writeJson(PRODUCTS_FILE, list); res.json({ success: true });
});

app.get("/api/admin/orders", admin, (req, res) => {
  res.json(orders().sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))));
});

app.post("/api/webhook/razorpay", (req, res) => {
  // For production, configure this URL in Razorpay Dashboard and verify
  // X-Razorpay-Signature using RAZORPAY_WEBHOOK_SECRET before trusting events.
  // Client-side signature verification above is used for instant fulfilment.
  res.json({ received: true });
});

app.get("*splat", (req, res) => res.sendFile(path.join(ROOT, "public", "index.html")));

app.listen(PORT, () => console.log(`DJ Song Store running on http://localhost:${PORT}`));
