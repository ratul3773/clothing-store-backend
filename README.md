# Clothing Store Backend

Backend API for a single-vendor men's clothing ecommerce store in
Bangladesh. The initial catalogue focuses on shirts and pants, with room
to add more categories later.

## Project status

**Current stage:** Backend foundation and development environment setup.

Database, authentication, payment, SMS, and courier integrations are
planned features unless explicitly implemented in the codebase.

## Technology stack

-   Node.js
-   TypeScript
-   Express
-   `tsx` for development
-   PostgreSQL (planned)
-   Prisma (planned)

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
```

Never commit `.env` or real secrets.

### 4. Run the development server

``` bash
npm run dev
```

### 5. Check the code

``` bash
npm run typecheck
npm run build
```

## Available scripts

  Script                Purpose
  --------------------- -----------------------------------------------
  `npm run dev`         Run the server in watch mode using `tsx`
  `npm run typecheck`   Check TypeScript types without emitting files
  `npm run build`       Compile TypeScript into `dist/`
  `npm start`           Run the compiled server from `dist/server.js`

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

-   Registration collects a phone number.
-   Planned login methods: phone OTP, email/password, and Google login.
-   Guest checkout is supported.
-   Guest orders may be linked to a later account only after securely
    verifying ownership.

### Products and inventory

-   Initial catalogue: men's shirts and pants.
-   Products may have size and color variants.
-   Regular prices, offer prices, and stock management.
-   The backend validates prices and variants.

### Cart and checkout

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

  `DATABASE_URL`          Database setup          PostgreSQL connection
                                                  string for Prisma

  `FRONTEND_URL`          CORS setup              Allowed frontend origin

  Payment, SMS, OAuth,    Integration setup       Add only when those
  and storage secrets                             services are configured
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
-   [ ] Implement authentication and authorization
-   [ ] Implement products, categories, variants, and inventory
-   [ ] Implement cart and checkout
-   [ ] Implement order confirmation and cancellation
-   [ ] Integrate SSLCommerz and Cash on Delivery
-   [ ] Integrate courier assignment
-   [ ] Implement coupons, combos, and flash sales
-   [ ] Add reviews, notifications, and admin workflows
-   [ ] Add automated tests, logging, rate limiting, and deployment
    configuration

## License

Choose and add a license before publishing the repository.
