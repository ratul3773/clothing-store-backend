# Clothing Store Backend

Backend API for a single-vendor men's clothing ecommerce store in
Bangladesh. The initial catalogue focuses on shirts and pants, with room
to add more categories later.

## Project status

**Current stage:** Authentication plus admin catalogue, variant inventory,
product offers, image uploads, public product/category APIs, database-backed guest/customer carts,
and COD orders with manual admin creation and stock/history tracking.

## Technology stack

-   Node.js
-   TypeScript
-   Express
-   `tsx` for development
-   PostgreSQL with Prisma ORM 7
-   Better Auth with email OTP verification
-   Nodemailer SMTP delivery for verification email
-   Zod request validation
-   Local disk storage in development and Bunny CDN in production

## Getting started

### Prerequisites

Install a current Node.js LTS release and npm.

### 1. Clone the repository

``` bash
git clone <your-repository-url>
cd clothing-store-backend
```

### 2. Install dependencies

``` bash
npm install
```

### 3. Configure environment variables

Create `.env` based on `.env.example`.

``` env
NODE_ENV=development
PORT=5000
DATABASE_URL="your_postgresql_connection_string"
BETTER_AUTH_SECRET="a-long-random-secret"
BETTER_AUTH_URL="http://localhost:5000"
FRONTEND_URL="http://localhost:3000"
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="your_smtp_username"
SMTP_PASS="your_smtp_password"
SMTP_FROM="Clothing Store <no-reply@example.com>"

STORAGE_DRIVER=local
UPLOAD_DIR=uploads
UPLOAD_PUBLIC_BASE_URL="http://localhost:5000/uploads"
MAX_IMAGE_SIZE_MB=5
MAX_IMAGES_PER_PRODUCT=8

# Required when STORAGE_DRIVER=bunny, and automatically in production.
BUNNY_CDN_ACCESS_KEY=""
BUNNY_CDN_STORAGE_ZONE=""
BUNNY_CDN_PULL_URL=""
BUNNY_STORAGE_ENDPOINT="https://storage.bunnycdn.com"
```

Never commit `.env` or real secrets.
`SMTP_FROM` is the sender address; the older `EMAIL_FROM` name is also accepted.
Configure a real SMTP provider before accepting registrations. Email
verification remains mandatory if SMTP is unavailable; signup will fail
instead of reporting that an email was sent.
For PostgreSQL URLs that currently use `sslmode=require`, use
`sslmode=verify-full` to keep the current strict certificate and hostname
verification behavior explicit and avoid the `pg-connection-string` warning.
If the URL already has query parameters, append it with `&` instead of `?`.

Development uploads are written under `UPLOAD_DIR` and served from `/uploads`.
Production startup rejects local storage: set `STORAGE_DRIVER=bunny` and provide
all three Bunny values. Bunny keys are secrets and must never be committed.

### 4. Create the first admin

Register normally, then promote the account with:

``` bash
ADMIN_EMAIL="admin@example.com" \
ADMIN_PASSWORD="a-strong-password" \
npm run admin:bootstrap
```

On PowerShell, set `$env:ADMIN_EMAIL`, `$env:ADMIN_PASSWORD`, and optionally
`$env:ADMIN_NAME` / `$env:ADMIN_PHONE` in the current shell before running the
command. The script creates or updates a verified admin credential account.

### 5. Run the development server

``` bash
npm run dev
```

### 6. Check the code

``` bash
npm run typecheck
npm test
npm run build
```

Unit tests do not touch the database. To run the catalogue database flow test
against `DATABASE_URL`, set `RUN_DB_TESTS=true`; it creates and removes its own
test records.

## COD orders

### COD order setup and API

Generate the client with `npx prisma generate --config prisma7.config.ts`. Apply the
reviewed `prisma/migrations/20261107000000_orders/migration.sql` to the existing
catalog/cart database before starting this version. The migration is transactional
and rejects existing invalid stock balances. It has not been applied to the application database.
The repository ignores older migrations; restore/baseline that history before using
`prisma migrate deploy` on a new environment. This order migration alone does not bootstrap the database.

Admin manual-order customer selection uses `GET /api/v1/admin/orders/customer-search?q=...`.
It requires an admin session and a 2–100 character query, and returns at most 20 active
customer IDs with name, email, and phone. It does not load addresses or order history.

All paths below start with `/api/v1`. Customer routes require a verified customer
session; admin routes require a verified admin session. Guest checkout uses the existing
`cart_token` cookie. Send the configured trusted `Origin` on mutations.

- `GET /orders/delivery-policy`: public delivery rates `{ inside, outside, freeAbove }`, with no database query.
- `POST /orders`: `{ lines: [{ id, type: "VARIANT" | "COMBO" }], version,
  destination: { address } | { addressId }, note?, expected: { subtotal, discount, deliveryFee, total } }`.
  Calculate the displayed totals from selected cart items and delivery policy. Placement validates
  stock, visibility, prices and totals again; there is no preview endpoint.
  Send a fresh `Idempotency-Key` header (16–128 URL-safe characters)
  for each intended order; reuse the same key/body to retry a lost response.
- `GET /orders` and `GET /orders/:id`: the signed-in customer's orders and receipt/history.
  `POST /orders/:id/cancel` accepts `{ version, reason? }` while pending only.
- Guests receive `guestToken` with the creation receipt. Use `Authorization: Bearer <guestToken>`
  for `GET /orders/:id/guest` and `POST /orders/:id/guest/cancel`; cancellation takes
  `{ version, reason? }`. Tokens must stay out of URLs and client logs. Save the returned token;
  idempotent recovery requires the original guest cart cookie to remain valid.
- `POST /admin/orders` uses explicit lines:
  `{ type: "VARIANT", variantId, quantity }` or
  `{ type: "COMBO", comboId, quantity, selections: [{ comboItemId, variantId }] }`.
  Include the same destination, optional `customerId`, `note`, `discount`, `deliveryOverride`,
  and `adjustmentReason`. Source defaults to `ADMIN_MANUAL`; alternatives are `PHONE`,
  `WHATSAPP`, `FACEBOOK`, and `INSTAGRAM`. Status defaults to `CONFIRMED`; pending is also allowed.
  Creation requires expected totals and an idempotency key. Adjustments require a reason.
  The UI summary uses the selected catalog items and delivery policy.
- `GET /admin/orders` and `GET /admin/orders/:id`: summary list and full audit detail.
  Lists support `page`, `limit` (maximum 100), `status`, `source`, `q`, and ISO `from`/`to`.
- `PATCH /admin/orders/:id/status`: `{ version, status, reason? }`. Cancellation and
  delivery failure require a reason. Allowed paths are pending → confirmed → shipped → delivered,
  pending → cancelled, and shipped → delivery failed. Cancellation after confirmation is rejected.
- `POST /admin/orders/:id/return-receipt`: `{ version, reason,
  components: [{ id, sellable, damaged }] }`. Every component must be accounted for exactly once
  after failed delivery. Only sellable quantities return to available stock.

Address fields: `recipientName`, Bangladesh `recipientPhone`, `district`, `area`,
`addressLine`, optional `postalCode`, and `zone` (`INSIDE_DHAKA` or `OUTSIDE_DHAKA`).
Saved addresses require an explicitly owned/linked active customer. Manual unlinked orders
are admin-managed; matching a phone or email does not grant account access.

Prices use integer taka. Delivery defaults to 70/130 taka, free at subtotal ≥ 2000,
configured through `ORDER_DELIVERY_INSIDE`, `ORDER_DELIVERY_OUTSIDE`, and
`ORDER_FREE_DELIVERY_ABOVE`. Manual discounts apply after calculating the free delivery threshold.
Only COD is accepted; delivery records collection of the full total. Placement reserves stock,
shipment deducts stock, and pending cancellation releases it. Pending orders expire after
24 hours; cleanup runs at startup and every minute while the backend is running.
Customer `ordersCount`/first/last timestamps count placements; `lifetimeValue` counts delivered totals.
Keep `BETTER_AUTH_SECRET` stable for guest token recovery on idempotent retries.
Deploy `20261108000000_order_images` after the order migration. New receipts use
snapshotted image URLs for products and combo components, without live catalog queries.
Older orders have null images and use placeholders; no historical images are invented.

Orders now store a required JSONB `addressSnapshot`; order lines and physical components
store their own required JSONB `productSnapshot`. The order module declares explicit
interfaces and Zod schemas for these values. Charged unit prices live only in parent-line
snapshots; stock identities, quantities, return counts and order totals remain columns.
Responses retain their existing flat fields, including images, and lists expose only
recipient name/phone. Snapshot JSON is validated when reading and writing. Placement
continues to validate stock, visibility and expected totals without a preview API.

Deploy `20261108010000_order_snapshots` after `20261108000000_order_images` during a
short backend maintenance window: stop old backend instances, apply migrations,
regenerate Prisma and start the updated backend. The transaction copies existing stored
columns, checks required values and coverage, then removes replaced columns. It never
rebuilds historical data from current catalog or saved-address records. Take a database
backup before rollout; restoring the old backend requires restoring compatible columns.

Run `npm run test:order`. Set `RUN_ORDER_DB_TESTS=true` to run real PostgreSQL tests;
optionally provide `ORDER_TEST_DATABASE_URL`. They create and remove only a random
`order_test_*` schema and test the actual order migration. No application records are used.
The isolated order suite also covers populated snapshot backfills and rollback on invalid
historical values. Ordinary tests do not apply migrations to the application database.

## Available scripts

  Script                  Purpose
  ----------------------- -------------------------------------------------
  `npm run dev`           Run the server in watch mode using `tsx`
  `npm run typecheck`     Check TypeScript types without emitting files
  `npm test`              Run unit tests (and skipped DB tests by default)
  `npm run admin:bootstrap` Create or promote the admin account
  `npm run build`         Compile TypeScript into `dist/`
  `npm start`             Run the compiled server from `dist/server.js`

Make sure the scripts in `package.json` match these commands.

## API health check

If the health endpoint is implemented, visit:

`http://localhost:5000/api/v1/health`

Example response:

``` json
{
  "success": true,
  "message": "API is running",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

The timestamp is illustrative, not a live value.

## Proposed project structure

``` text
src/
├── app.ts
├── server.ts
├── app-error.ts
├── config/
│   └── env.ts
├── middlewares/
├── modules/
│   ├── auth/
│   ├── users/
│   ├── products/
│   ├── categories/
│   ├── cart/
│   ├── wishlist/
│   ├── orders/
│   ├── payments/
│   ├── coupons/
│   ├── flash-sale/
│   ├── reviews/
│   └── delivery/
├── routes/
└── utils/
```

This is a proposed structure. Add files as each feature is implemented
rather than creating empty files for every planned feature.

## Main business features

### Customer accounts and authentication

-   Registration requires a name, email, password (at least 12
    characters), and Bangladesh phone number. Phone numbers are normalized
    to `+880...`; phone OTP is not used.
-   Email verification uses Better Auth's email OTP plugin. Codes expire
    after five minutes, are hashed in Better Auth's verification storage,
    rotate on resend, and are rate limited. An unverified account cannot
    sign in or receive a session.
-   Sign in uses email and password; sessions are persisted by Better Auth
    and stored in HttpOnly cookies.
-   Guest checkout is supported.
-   Guest orders may be linked to a later account only after securely
    verifying ownership.

The backend mounts Better Auth under `/api/auth`. The browser can use the
official Better Auth client with `baseURL` set to `${API_URL}/api/auth` and
credentials enabled, or call these Better Auth endpoints directly:

- `POST /api/auth/sign-up/email` with `{ name, email, password, phone }`.
  The backend also accepts Better Auth's `phoneNumber` field; either
  property accepts English or Bangla digits and is normalized before storage.
- `POST /api/auth/email-otp/verify-email` with `{ email, otp }`
- `POST /api/auth/email-otp/send-verification-otp` with
  `{ email, type: "email-verification" }`
- `POST /api/auth/sign-in/email` with `{ email, password }`
- `POST /api/auth/sign-out`
- `GET /api/auth/get-session`

For a cross-origin frontend, send requests with credentials enabled and use
the configured `FRONTEND_URL`; production cookies require HTTPS.

### Products and inventory

-   Products use one regular price for all variants; amounts are integer
    taka. An active offer supplies the effective selling price.
-   Products move `DRAFT -> ACTIVE -> DRAFT` or `ARCHIVED`; archive is the
    normal removal path. Only unused drafts can be hard deleted.
-   Admins supply the product code only; URL slugs are generated from the
    product or category name and variant SKUs from the product code, colour,
    and size. All are made unique automatically.
-   Colours and sizes form variants with unique SKUs and case-insensitive
    uniqueness. Stock is tracked as `onHand`, `reserved`, and available.
-   Every stock adjustment writes an immutable movement row in the same
    transaction. Stock cannot fall below zero or the reserved quantity.
-   Product offers cannot overlap, must be lower than the regular price, and
    are deactivated rather than deleted.
-   Images are uploaded to the server. JPEG, PNG, WebP, and AVIF are accepted,
    with configurable count and size limits.
-   Public responses only expose active, published products in active category
    trees. Internal stock and storage keys are never returned publicly.

Catalogue endpoints:

- `GET /api/v1/products` and `GET /api/v1/products/:slug`
- `GET /api/v1/categories` and `GET /api/v1/categories/:slug`
- `GET|POST|PATCH|DELETE /api/v1/admin/categories`
- `GET|POST|PATCH|DELETE /api/v1/admin/products`
- `POST /api/v1/admin/products/:id/publish|unpublish|archive|restore`
- `POST|PATCH|DELETE /api/v1/admin/products/:id/colors[/:colorId]`
- `POST|PATCH|DELETE /api/v1/admin/products/:id/variants[/:variantId]`
- `POST /api/v1/admin/products/:id/variants/:variantId/stock`
- `GET /api/v1/admin/products/:id/variants/:variantId/movements`
- `POST|PATCH|DELETE /api/v1/admin/products/:id/offers[/:offerId]`
- `POST /api/v1/admin/products/:id/images`
- `PATCH|DELETE /api/v1/admin/products/:id/images/:imageId`
- `PATCH /api/v1/admin/products/:id/images/reorder`

Admin routes require a verified admin session, a trusted origin for unsafe
methods, and send credentials/cookies.

### Cart and checkout

-   Guests and authenticated customers use the same database-backed cart API.
    There is no localStorage cart and no fixed line/five-unit business limit;
    additions and increases are bounded by available variant stock.
-   Guests use an HttpOnly cookie; only its hash is stored. Guest carts expire
    after 24 hours without a successful mutation and merge transactionally on login.
-   Product prices are shared across sizes/colours and all amounts are in taka.
-   Cart reads return current product-level prices and stock warnings; cart
    operations never reserve inventory or guarantee checkout prices.
-   Checkout selection stays frontend-local. Checkout/order creation is not yet
    implemented; the selected-item integration requirements are documented in
    [the cart API guide](docs/cart.md).
-   Guest and registered-customer checkout.
-   Different delivery charges for inside and outside Dhaka.
-   Configurable free-delivery threshold.
-   Server-side validation for coupons, combo offers, and flash sales.

### Orders

-   New orders begin in a pending-confirmation state.
-   The store owner confirms orders.
-   Customers can cancel before confirmation, according to business
    rules.
-   Order items should store product, variant, and price snapshots.
-   Define stock reservation and overselling rules before enabling
    production checkout.

### Payments and delivery

-   Planned payment methods: Cash on Delivery and SSLCommerz.
-   Planned courier options: Steadfast and Pathao.
-   Verify payment callbacks on the server and handle duplicate events
    safely.
-   Initial courier tracking uses the courier's own tracking website.

### Marketing and customer engagement

-   Customer-specific coupons
-   Combo offers
-   Scheduled flash-sale campaigns
-   Wishlist and product reviews
-   Website and transactional notifications

## API conventions

The planned versioned API prefix is `/api/v1`.

-   Validate incoming request data at the API boundary.
-   Keep controllers focused on HTTP handling; put business rules in
    services.
-   Use consistent success and error response shapes.
-   Add centralized error-handling middleware.
-   Never trust prices, discounts, roles, payment status, or stock
    values from the client.
-   Protect private endpoints with authentication and authorization.
-   Use transactions and idempotency where duplicate requests could
    affect orders, payments, or inventory.

These are guidelines, not a claim that every control is already
implemented.

## Environment variables

  -----------------------------------------------------------------------
  Variable                When needed             Description
  ----------------------- ----------------------- -----------------------
  `NODE_ENV`              Now                     Environment such as
                                                  `development` or
                                                  `production`

  `PORT`                  Now                     HTTP server port

  `DATABASE_URL`          Required                PostgreSQL connection
                                                  string for Prisma

  `BETTER_AUTH_SECRET`    Required                Better Auth signing and
                                                  OTP hashing secret
  `BETTER_AUTH_URL`       Required                Public backend origin
  `FRONTEND_URL`          Required                Allowed frontend origin
  `SMTP_HOST`             Required                SMTP server hostname
  `SMTP_PORT`             Required                SMTP server port
  `SMTP_SECURE`           Required                Whether SMTP uses TLS
  `SMTP_USER`             Required                SMTP username
  `SMTP_PASS`             Required                SMTP password
  `SMTP_FROM`             Required                Transactional sender
  `STORAGE_DRIVER`        Optional                `local` or `bunny`;
                                                  production requires
                                                  `bunny`
  `UPLOAD_DIR`            Local storage           Local upload directory
  `UPLOAD_PUBLIC_BASE_URL` Local storage          Public `/uploads` base URL
  `MAX_IMAGE_SIZE_MB`     Optional                Per-image size limit
  `MAX_IMAGES_PER_PRODUCT` Optional               Per-product image count
  `BUNNY_CDN_ACCESS_KEY`  Bunny storage           Bunny storage API key
  `BUNNY_CDN_STORAGE_ZONE` Bunny storage          Bunny storage zone name
  `BUNNY_CDN_PULL_URL`    Bunny storage           Bunny CDN public pull URL
  `BUNNY_STORAGE_ENDPOINT` Optional               Bunny storage API origin
  `ADMIN_NAME`            Bootstrap only          First admin display name
  `ADMIN_EMAIL`           Bootstrap only          First admin email
  `ADMIN_PASSWORD`        Bootstrap only          Admin password; 12+ chars
  `ADMIN_PHONE`           Bootstrap only          Optional BD phone number

  Payment, SMS, OAuth,    Integration setup       Add only when those
  and other secrets                               services are configured
  -----------------------------------------------------------------------

Never commit credentials, tokens, private keys, or production
environment files.

## Development guidelines

1.  Organize code by business feature.
2.  Reuse shared middleware, schemas, utilities, and business services.
3.  Avoid duplicating business rules across controllers.
4.  Keep secrets in environment variables.
5.  Add validation and tests as features are introduced.
6.  Run type checking and builds before merging changes.
7.  Document changes to business rules, environment variables, and API
    contracts.

## Roadmap

-   [ ] Establish Express and TypeScript foundation
-   [ ] Validate environment configuration
-   [ ] Set up PostgreSQL and Prisma
-   [ ] Design and migrate the initial database schema
-   [ ] Add centralized error handling and request validation
-   [x] Implement email/password authentication and email OTP verification
-   [x] Implement products, categories, variants, and inventory
-   [x] Add catalogue image uploads with local/Bunny storage
-   [x] Add product offers and stock movement history
-   [ ] Implement admin product/category dashboard workflows
-   [x] Implement guest/customer cart CRUD and login merging
-   [ ] Implement selected-item guest/customer checkout
-   [ ] Implement order confirmation and cancellation
-   [ ] Integrate SSLCommerz and Cash on Delivery
-   [ ] Integrate courier assignment
-   [ ] Implement coupons, combos, and flash sales
-   [ ] Add reviews, notifications, and admin workflows
-   [ ] Add automated tests, logging, rate limiting, and deployment
    configuration

## License

Choose and add a license before publishing the repository.
