# EMGOVI setup

## 1. Upload to GitHub

Upload every file and folder here into your repo, keeping the same structure.
The `api/` and `lib/` folders must stay exactly where they are, not moved to
root-level files, or the routes will not work on Vercel.

## 2. Create the database

In your Turso database, run everything in `schema.sql` once. You can paste it
into the Turso web shell or run it with the Turso CLI.

## 3. Environment variables (set these in Vercel, under Project Settings > Environment Variables)

- `TURSO_DATABASE_URL` — your Turso database URL
- `TURSO_AUTH_TOKEN` — your Turso auth token
- `PAYSTACK_SECRET_KEY` — from your Paystack dashboard (starts with `sk_`)
- `ADMIN_PIN` — any PIN you choose, used to unlock admin.html

Note: only the secret key is needed server-side. There is no public key needed
in this setup since checkout redirects to Paystack's hosted payment page
rather than using an inline popup.

## 4. Deploy

Deploy the repo to Vercel as usual. Once live:

- Visit `/admin.html`, enter your admin PIN, and add your first product with
  at least one variant (color, storage, price, stock).
- Visit `/` to see it appear on the storefront.

## How things work

- **Accounts**: customers sign up with email and password on `account.html`.
  Passwords are hashed before storage, never stored as plain text.
- **Cart**: stored in the browser (localStorage) until checkout.
- **Checkout**: requires login. On submit, the server recalculates the total
  from the database (never trusts prices sent from the browser), starts a
  Paystack transaction, and redirects the customer to Paystack's payment page.
- **After payment**: Paystack redirects back to `checkout.html?reference=...`,
  which asks the server to verify the payment directly with Paystack before
  creating the order and reducing stock. This means a customer can't fake a
  successful payment by editing the browser.
- **Images**: paste a hosted image link into the product form in admin. The
  storefront displays it at whatever aspect ratio it naturally has, so any
  image size works without cropping.
- **Order status**: Paid → Processing → Out for Delivery → Delivered, updated
  from the admin Orders tab.

## Adding more categories later

Right now the shop only has "Phones." To add a new category (e.g. "Laptops"),
just type it into the Category field when adding a product in admin — no code
changes needed. Add a nav link for it in the header of each HTML file when
you're ready to feature it.
