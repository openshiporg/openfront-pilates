# Openfront Pilates

Openfront Pilates is a self-hostable platform for reformer and pilates studios. Clients book a class and pick their machine on a room map, buy intro offers, class packs and memberships, and book privates, duets and trios. Staff run the schedule, rosters by machine, waitlists, late-cancel and no-show fees, desk sales, retention lists and instructor pay from one dashboard.

One business per deployment, with as many locations as it has. Each location has rooms; each room has numbered spots with an apparatus (reformer, tower, chair, Cadillac, barrel, mat).

## Getting started

Prerequisites: Node.js 20.9 or later, a PostgreSQL database, npm.

```bash
git clone https://github.com/openshiporg/openfront-pilates.git
cd openfront-pilates
npm install
cp env.example .env   # set DATABASE_URL and fresh secrets
npm run dev           # builds Keystone, applies migrations, starts Next.js
```

Visit `/dashboard/init` to create the first administrator, then run onboarding from the dashboard. It creates the studio, locations, rooms and machines, class types, schedule, prices and policies.

Card payments use Stripe (Checkout for one-off sales, Subscriptions for memberships, a saved card for fees). Add the keys under Payment providers. Until a key is set, the front desk records card-terminal, cash and bank-transfer payments, so booking and paying always works.

## Commands

- `npm run dev`: build Keystone, apply migrations, start Next.js.
- `npm run build` / `npm start`: production build and server.
- `npm run migrate:gen`: generate and apply a development migration.
- `npm run migrate`: apply checked-in migrations.
- `npm run typecheck`, `npm run lint`, `npm run test:offline`.

Stripe webhooks arrive at `/api/payment-webhooks/pp_stripe`.

## License

MIT
