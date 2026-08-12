# DJ Song Store — Setup Guide

## 1) Requirements
- Node.js 20+ recommended
- Razorpay account
- A hosting/server with HTTPS for production
- Your MP3 files

## 2) Install
```bash
npm install
```

Copy `.env.example` to `.env` and fill:
- RAZORPAY_KEY_ID
- RAZORPAY_KEY_SECRET
- ADMIN_PASSWORD
- TOKEN_SECRET (long random value)
- BASE_URL (your live website URL)

## 3) Add your MP3
Put the MP3 inside `songs/`.
The filename must match the `file` value in `data/products.json`, or add it from Admin.

Example:
songs/bhole-ho-gaye-tanatan.mp3

## 4) Run
```bash
npm start
```
Open http://localhost:3000

Admin:
http://localhost:3000/admin.html

## 5) Production
Use HTTPS and a server that can run Node.js (Render/Railway/VPS/etc.).
Set BASE_URL to the live HTTPS URL.

## 6) Razorpay
The site creates a Razorpay order on the server, opens Standard Checkout, verifies the returned payment signature on the server, and then issues a time-limited download token. Razorpay recommends server-side verification and webhooks for reliable payment-state handling.

For production, configure a Razorpay webhook endpoint:
POST https://YOUR-DOMAIN.com/api/webhook/razorpay
and verify `X-Razorpay-Signature` with your webhook secret before using webhook events as a source of truth.

## Important
The QR displayed on each song page opens that song's page. The actual payment is made through Razorpay Checkout, where UPI/card/netbanking options can be used. A static personal UPI QR should not be used as proof of payment for automatic delivery because the server cannot safely know that the correct amount was paid.

## Customization
- Store name/tagline: `.env`
- Products: Admin panel or `data/products.json`
- Design: `public/assets/style.css`
- Demo product: replace it with your real song.

## Security
- Never put `RAZORPAY_KEY_SECRET` in browser JavaScript.
- Use a strong ADMIN_PASSWORD and TOKEN_SECRET.
- Keep the `songs` directory outside any public/static directory.
- Keep HTTPS enabled in production.
