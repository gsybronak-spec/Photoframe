# ZenFrame 🧘

**Yoga photo frames & wellness campaigns.** Find a hand-crafted yoga frame,
drop in your photo, personalize it, and share your calm — all in under a
minute.

## Features

1. **Browse** the gallery — 16 original SVG frames across six occasions
   (Morning Flow, Yoga Day, Meditation, Sunset Flow, Breathwork, Mindfulness)
   with live search (relevance-ranked) and URL-synced occasion filters.
2. **Personalize** — upload a photo (EXIF-oriented, downscaled locally) or
   capture live, drag & zoom it into the frame, add an intention caption.
3. **Save & share** — download a crisp 1000×1250 PNG, use the native share
   sheet, or **save to your account**: the composite is stored on the server
   and appears in your private studio dashboard.

## Architecture

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack) |
| Styling | Tailwind CSS v4 + custom glassmorphism system |
| Database | **SQLite via Node's built-in `node:sqlite`** — zero extra deps, file at `data/zenframe.db` |
| Auth | Opaque session tokens (SHA-256 hashed at rest) in an HttpOnly cookie + scrypt password hashing |
| File storage | Uploaded composites on disk under `data/uploads/<userId>/`, served only through an authorization-checked route |
| Motion / Icons | framer-motion · lucide-react |
| Fonts | Fraunces (display) + Plus Jakarta Sans (body) via `next/font` |
| Frames | Pure SVG builders in `src/lib/frames.ts` (backdrop → photo → overlay) |

### Data model (`src/server/db.ts`)

`users` · `profiles` · `sessions` · `verification_tokens` ·
`creations` (id, user_id, frame_id, caption, storage_path, mime_type, bytes,
created_at, updated_at) · `saved_frames` · `activity`

### API surface

| Route | Purpose |
|---|---|
| `POST /api/auth/signup` | Create account + session, send verification email |
| `POST /api/auth/login` / `logout` / `GET me` | Session lifecycle |
| `GET /api/auth/verify-email?token=` | Consume verification link (redirects to dashboard) |
| `POST /api/auth/verify-email` | Resend verification |
| `POST /api/auth/forgot-password` / `reset-password` | Single-use, hashed, 1-hour reset tokens |
| `POST /api/creations` | Persist a rendered composite (magic-byte + size validated) |
| `DELETE /api/creations/[id]` | Owner-or-admin only |
| `GET /api/creations/[id]/image` | Serves the stored composite to its owner |
| `POST /api/frames/[slug]/favorite` | Bookmark toggle |
| `GET /api/admin/overview` | Role-gated platform stats |

Every mutating endpoint enforces same-origin and per-IP rate limits.

## Environment

Copy `.env.local` from `.env.example` and fill in the values.

Every secret lives in the server environment and is never bundled into the
client. The only variable exposed to the browser is
`NEXT_PUBLIC_SITE_URL`, which is required for canonical/Open Graph URLs.

### Required (all environments)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical base URL of the deployed site, for metadata, sitemap, and OG links (e.g. `https://zenframe.app`). Used only in server-rendered metadata and static pages; it is prefixed `NEXT_PUBLIC_` so it is safe to ship to the client. |

### Email delivery

ZenFrame tries providers in this order and stops at the first one that is
configured:

1. **Resend** — set `RESEND_API_KEY`. Recommended for production.
2. **SMTP** — set `SMTP_HOST` and `SMTP_PORT`. Useful if you already have a
   mail provider (Mailgun SMTP, SendGrid SMTP, your own Postfix, etc.).
3. **Development console** — if neither is configured, emails are logged to
   `data/.mail` (visible in the terminal) instead of being sent.

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key. Set to enable Resend delivery. |
| `SMTP_HOST` | SMTP server hostname. Required with `SMTP_PORT` to enable SMTP fallback. |
| `SMTP_PORT` | SMTP port (465 = implicit TLS, 587 = STARTTLS). |
| `SMTP_USER` | SMTP username (optional; if omitted, sends unauthenticated). |
| `SMTP_PASS` | SMTP password (optional). |
| `SMTP_SECURE` | `true`/`false`. Overrides the port-based default for the TLS mode. |
| `MAIL_FROM` | Sender address shown in the `From` header, e.g. `ZenFrame <hello@zenframe.app>`. Defaults to `ZenFrame <hello@zenframe.app>`. |

### Development mail mode

When neither Resend nor SMTP is configured, the app writes every outgoing email
to `data/.mail` as plain text. Each message includes the recipient, subject,
plain-text body, and the verification/reset links verbatim. This is intentionally
the default in development so you can complete signup and password-reset flows
locally without any provider.

**Never enable this in production.** The dev mail log is allowed only when
`NODE_ENV !== "production"` OR `ALLOW_DEV_MAIL_LOG=1`. `ALLOW_DEV_MAIL_LOG` is
used by the automated test suite so it can read verification links from the log.
In production the server refuses to send or log email unless a real provider is
configured.

### Database

| Variable | Purpose |
|---|---|
| `ZENFRAME_DATA_DIR` | Directory that holds `zenframe.db` and `uploads/`. Defaults to `data/` next to the project root. Set this in production to a persistent volume mount. |

### Rate limiting

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL. When set together with the token, the rate limiter switches from the in-memory driver to Redis. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token. |

If neither is set, the in-memory limiter is used (good for local development
and single-instance hosts that can't run Redis). The in-memory driver is
**not** suitable for multi-instance production deployments — use Redis there.

### Storage

| Variable | Purpose |
|---|---|
| `STORAGE_DRIVER` | Storage backend. `local` (default) writes to the filesystem under `ZENFRAME_DATA_DIR/uploads`. Other values are reserved for future providers (S3/R2) and fail loudly if set without an implementation. |

### Analytics

| Variable | Purpose |
|---|---|
| `ANALYTICS_PROVIDER` | `none` (default, no-op) or `http` to enable a generic HTTP event endpoint. |
| `ANALYTICS_ENDPOINT` | URL to POST events to when `ANALYTICS_PROVIDER=http`. |
| `ANALYTICS_TOKEN` | Optional bearer token sent with each analytics event. |

Analytics is off by default. When enabled it tracks only product events
(signup, login, frame view, editor use, save, share, delete) and never stores
raw IP addresses, passwords, tokens, or full request bodies.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000  (creates data/zenframe.db on first request)
npm run build    # production build + typecheck
npm start        # serve the production build
npm run lint     # eslint
npm run test:api # full auth + security + regression suite (starts its own throwaway server)
npm run db:check # database integrity + migration + portability report
npm run db:backup # backup data/zenframe.db to data/backups/
npm run db:admin  # promote a user to admin by email
```

No configuration is required locally. See `.env.example` for every variable.

### Emails in development

When neither Resend nor SMTP is configured, every outgoing email is appended to
`data/.mail` as plain text (recipient, subject, plain-text body, and the
verification/reset links verbatim). Open that file to grab links during local
development. This mode is **disabled in production** unless `ALLOW_DEV_MAIL_LOG=1`
is set explicitly — and even then only outside `NODE_ENV=production`.

To send real email, set `RESEND_API_KEY` (preferred) or `SMTP_HOST` + `SMTP_PORT`
and the app picks the first configured provider automatically.

### Database migrations

The database migrates itself on first request. Migrations live in
`src/server/db.ts` as an ordered `MIGRATIONS` array, each with a version, name,
and idempotent SQL body. The current schema version and the timestamp each
migration was applied are tracked in `schema_migrations`, so the upgrade is
equivalent to `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — safe to run
repeatedly, and never destructive.

Key points:
- Migrations are numbered and sorted; order is deterministic.
- A migration that adds a column uses `ADD COLUMN IF NOT EXISTS`.
- A migration that renames existing rows normalizes in place (idempotent
  `UPDATE ... WHERE ... IS NOT NULL`).
- Schema checks (`npm run db:check`) report applied migrations and flag rows
  that violate the current safety rules (unsafe keys, missing thumbnails for
  public creations, etc.).

### Database backup & restore

```bash
npm run db:backup        # VACUUM INTO data/backups/zenframe-<timestamp>.db (safe on a live WAL db)
ZENFRAME_DATA_DIR=/mnt/data node scripts/db-backup.mjs  # custom data dir
npm run db:backup -- --keep 7 --dir /mnt/backups        # retention + destination
```

The backup is a consistent snapshot taken with SQLite's own `VACUUM INTO`, so
it is safe to run while the app is writing (unlike a raw `cp` of a live WAL
database). It covers the **database only**.

**Uploads are a separate backup target.** User images live in
`$ZENFRAME_DATA_DIR/uploads/` and are not part of `db:backup` — snapshot that
directory with your volume provider or `rsync`/`restic` on the same schedule.
The health check (`db:check`) cross-references database rows against files on
disk, so a forgotten upload snapshot shows up as missing-file problems.

**Restore procedure**

1. Stop the app (single instance — no other writers).
2. Replace `$ZENFRAME_DATA_DIR/zenframe.db` with the backup file.
3. Restore the matching `uploads/` snapshot (must be from the same point in
   time, otherwise `db:check` will report missing/orphaned files).
4. Start the app. Migrations re-run automatically and are idempotent; a backup
   from an older schema version upgrades itself on boot.
5. Run `npm run db:check` and confirm it exits 0.

### Health check

```bash
npm run db:check        # exits 0 on a healthy DB, 1 on problems
ZENFRAME_DATA_DIR=/mnt/data node scripts/db-check.mjs
```

The check reports: current migrations, table presence, required columns, row
counts, path traversal or isolation violations (`storage_path`/`thumb_path` that
escape the uploads root or contain `..`), and broken references (public creations
whose full image file is missing). It is suitable for a cron health monitor or a
pre-deploy gate.

### First admin

Promote a user with the script (out-of-band; the app never exposes a self-
signup admin path):

```bash
npm run db:admin -- you@studio.com
# or
node scripts/make-admin.mjs you@studio.com
```

### App icons

```bash
npm run make-icons     # regenerate icon-192/512.png, apple-icon.png, favicon.svg
```

Icons are generated from the brand SVG with `sharp` (already a Next.js
dependency). The manifest references `public/icon-192.png`, `public/icon-512.png`
and `public/icon.svg`; Next serves `src/app/apple-icon.png` at
`/apple-icon.png` for the `apple-touch-icon` link. Re-run any time the brand
art changes.

### Public-surface audit

```bash
npm start &            # or npm run dev
npm run test:manifest  # validates manifest.json, icons, robots.txt, sitemap.xml
```

`npm run test:manifest` (alias of `scripts/audit-cleanup.mjs`) checks that the
web manifest is valid JSON, that every icon it references actually resolves and
matches its declared type, that `/apple-icon.png` is a real PNG, and that the
robots/sitemap endpoints respond. It also prints informational dead-code
signals (empty dirs, `zz_*` / `*.bak` files) — nothing is removed automatically.

## Structure

```
src/
  app/
    page.tsx                 # landing
    frames/page.tsx          # gallery (live search + URL-synced filters)
    frames/[slug]/           # frame detail + editor (+ /og share image)
    dashboard/               # private studio: creations, saved frames, activity
    creations/[id]/          # creation detail (owner-gated)
    admin/                   # role-gated platform overview
    login · signup · forgot-password · reset-password · verify-email
    settings/                # profile, security, sessions, account deletion
    s/[slug]/                # public share page (+ /opengraph-image)
    api/…                    # auth, creations, frames, admin, profile, analytics
    sitemap.ts · robots.ts · not-found.tsx · error.tsx · global-error.tsx
  components/                # Navbar, Footer, Orbs, Reveal, FrameCard,
                             # FrameEditor, AuthProvider, DeleteCreationButton,
                             # CreationsPager, ShareControls, VerificationBanner,
                             # ViewTracker, GalleryGrid, admin panels
  server/                    # db, sessions, passwords, storage, mailer,
                             # ratelimit, validation, activity, analytics,
                             # entitlements, frame-catalog, email/*
  lib/frames.ts              # 16 frames + SVG composite engine
  lib/plans.ts               # plan configuration + entitlements
  lib/image-client.ts        # safe client-side image handling
  lib/analytics-client.ts    # client-side event tracking (no secrets)
  types/node-sqlite.d.ts     # node:sqlite ambient declaration
scripts/
  smoke.mjs                 # full regression + security suite
  db-backup.mjs · db-check.mjs · make-admin.mjs · make-icons.mjs
```

## Adding a frame

Append one object to `FRAMES` in `src/lib/frames.ts` — pick a `style`
(gradient/accent/ink/motif) and an `art` motif (`lotus`, `sun`, `om`,
`chakra`, `candle`, `incense`, `waves`, `moon`), optionally `description` and
`tags`. The gallery card, detail page, editor, OG image, sitemap entry and
metadata all derive from it — no page logic to duplicate.

## Storage architecture

Every stored file is owned by a `StorageDriver`. Today that's the `local`
driver, which:
- writes to `ZENFRAME_DATA_DIR/uploads/`, **outside** the Next.js public folder;
- uses a `put-then-rename` write so crashes never leave half-written images;
- validates every key with `isSafeKey` (rejects `..`, `//`, absolute paths,
  and anything over 220 chars);
- double-checks the resolved path is still inside the uploads root.

Files are reachable **only** through authorization-checked routes:

| Route | Who can read |
|---|---|
| `/api/creations/[id]/image` | Owner or admin only (private, ETag + long SWR) |
| `/api/public/creations/[slug]/image` | Anyone, but only while the creation is still `public` with that exact slug (public, 1h cache) |
| `/api/profile/avatar` | Owner only |

Thumbnails live alongside the full composite (`thumb.jpg`) and are regenerated
on save. Dashboard grids request `variant=thumb` so they never pull the
full-size composite. Swapping to S3/R2 later means implementing `StorageDriver`
and setting `STORAGE_DRIVER` — no route or page changes.

## Rate limiting behavior

Sensitive endpoints are rate-limited per-IP with a sliding window:

| Endpoint | Rate |
|---|---|
| signup | 10 / 10 min |
| login | 10 / 5 min |
| forgot-password | 5 / hour |
| verify-email (resend) | 3 / hour |
| reset-password | 5 / hour |
| creation share (publish/unpublish) | 30 / hour |
| session revocation (all) | 5 / 10 min |
| account deletion | 3 / hour |
| admin frame/content patch | 60-120 / 10 min |

Rate-limited responses are `429` with a `Retry-After` header. The limiter is
**in-memory by default** (single-instance, local dev) and switches to a
Redis-compatible driver when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
are both set (multi-instance production). When Redis config is incomplete it
falls back to in-memory and logs a warning rather than silently failing open.

## Testing

```bash
npm run build        # production build + typecheck + route generation
npm run lint         # eslint (zero errors expected)
npx tsc --noEmit     # strict TypeScript check
npm run test:api     # full regression + security suite
npm run db:check     # database integrity + portability report
```

`npm run test:api` starts its own throwaway server against a temporary database
so it can't hit your dev data. It covers: signup/login/logout, verification,
password reset, session persistence, protected routes, admin authorization,
 creation save/delete, image authorization, IDOR, CSRF, rate limits, public
sharing + revocation, account deletion, analytics, and error-message hygiene.

## Production deployment

### Deployment architecture (read this first)

ZenFrame supports two production topologies:

**A. Single instance + persistent volume (SQLite mode — the default)**

> **ONE application instance + ONE persistent storage volume.**

Everything in the codebase assumes this: SQLite is a single-writer database on
that volume, the in-memory rate limiter is per-process, and in-process caches
are per-process. **Do not claim or attempt multi-instance deployments** without
the PostgreSQL path below. Adding Redis does not change this: Redis only
coordinates the *rate limiter* across instances — it does **not** make SQLite
multi-instance safe, and it does not synchronize any other in-process state.

**B. Vercel + managed services (Firebase mode — the target for zenframe.in)**

On Vercel the function filesystem is ephemeral, so neither SQLite nor local
uploads are viable. Production there runs entirely on managed services:

| Concern | Local dev | Vercel production |
| --- | --- | --- |
| Identity | password mode (scrypt + app sessions) | **Firebase Authentication** (email/password) |
| Database | SQLite (`ZENFRAME_DATA_DIR/zenframe.db`) | **Postgres (Neon)** via `DATABASE_URL` + `db/schema-postgres.sql` |
| Image storage | local driver (`data/uploads`) | **Vercel Blob** (`STORAGE_DRIVER=blob`, private objects) |
| Email | dev mail log / Resend | **Firebase Auth** verification + reset emails |
| Rate limiting | in-memory | **Upstash Redis** (`RATE_LIMIT_DRIVER=redis`) |

In Firebase mode the browser signs in with the Firebase client SDK and POSTs
the resulting ID token to `POST /api/auth/firebase-session`. The server
verifies that token with the Firebase **Admin SDK** (revocation-aware), maps
the verified `firebase_uid` → application user record, and issues the same
HttpOnly app-session cookie as before — so every existing `requireUser` /
`requireAdmin` authorization path keeps working unchanged. Identity is
**never** taken from a client-supplied UID, passwords are never stored in the
application database, and auth state never lives in localStorage.

> **Adapter status (honest):** the Firebase auth bridge, the Vercel Blob
> driver, and the Postgres schema (`db/schema-postgres.sql`, applied with
> `psql "$DATABASE_URL" -f db/schema-postgres.sql`) are implemented and
> type-checked, and the session/authorization flow is exercised by the API
> suite in password mode. The Postgres runtime adapter and the Firebase path
> itself are **not yet exercised end-to-end against live services** — that
> requires real Firebase/Neon/Vercel credentials (see "Firebase setup" and
> "Vercel setup" below).

### Startup configuration validation

The server validates its own configuration once at boot
(`src/instrumentation.ts` → `src/server/config-check.ts`). In production it
prints a loud, itemized warning for each problem it detects:

- no email provider configured (reset/verification mail will fail)
- `ALLOW_DEV_MAIL_LOG=1` set in production (security risk)
- `ZENFRAME_DATA_DIR` unset (ephemeral default → data loss on redeploy) or not writable
- `NEXT_PUBLIC_SITE_URL` missing or not `https://` (Secure cookies won't work)
- unknown `STORAGE_DRIVER` or `EMAIL_PROVIDER` values
- `RATE_LIMIT_DRIVER=redis` without the Upstash credentials

A warning never crashes the server — but an operator should treat any
`[zenframe:config]` output at boot as a launch blocker until resolved.

### Requirements

- Node.js 22+ (for `node:sqlite`).
- A persistent filesystem for `ZENFRAME_DATA_DIR` (SQLite file + uploads + backups).
- `NEXT_PUBLIC_SITE_URL` set to the live **HTTPS** domain.
- A real email provider configured (`RESEND_API_KEY` or `SMTP_*`), because
  production refuses to send email otherwise.
- Optionally `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — only
  relevant if you run more than one instance (rate limiting only).

### HTTPS / HSTS

The app terminates TLS at your reverse proxy (nginx, Caddy, Cloudflare, the
host's load balancer). Two things to know:

1. **Session cookies are `Secure` in production** (`NODE_ENV=production`). They
   are simply never sent over plain HTTP, so the site must be served over
   HTTPS or sign-in will silently fail. The startup validator checks this.
2. **Recommended HSTS header** at the proxy, once you are sure HTTPS works:

   ```
   Strict-Transport-Security: max-age=15552000; includeSubDomains
   ```

   (6 months, covers subdomains; add `; preload` only after testing.) The app
   itself does not set HSTS — that belongs at the TLS-terminating layer.

### Deploy steps (generic)

```bash
npm ci
npm run build
# set NODE_ENV=production, NEXT_PUBLIC_SITE_URL (https://…), RESEND_API_KEY (or SMTP_*),
# MAIL_FROM, and ZENFRAME_DATA_DIR on a persistent volume
npm start
# then read the boot log: any [zenframe:config] warning is a launch blocker
npm run db:admin -- you@studio.com   # promote the first admin after they sign up
```

On hosts without a persistent filesystem (serverless/ephemeral), SQLite is not
safe as the primary store — use the Vercel topology (Firebase + Postgres schema
+ Blob) described above instead.

### Vercel setup (zenframe.in)

The canonical production domain is **https://zenframe.in** — it is the default
fallback for `metadataBase`, canonical URLs, sitemap, robots, OG images and
share links even when `NEXT_PUBLIC_SITE_URL` is unset.

1. **Push to GitHub** — `gsybronak-spec/Photoframe`, branch `main`. Vercel
   imports the repo directly; no extra CI is needed (Vercel runs `npm run
   build` itself).
2. **Import the project in Vercel** (dashboard → Add New → Project), selecting
   the `Photoframe` repository, framework preset **Next.js**, root directory
   `zenframe` if the repo contains it at the top level (else leave empty).
3. **Create the persistent services** and note their credentials:
   - Vercel Blob store (Storage tab → Create database → Blob) — injects
     `BLOB_READ_WRITE_TOKEN` automatically.
   - Neon Postgres (or Vercel Postgres) — provides `DATABASE_URL`.
   - Upstash Redis (Marketplace) — provides `UPSTASH_REDIS_REST_URL`/`_TOKEN`.
4. **Set environment variables** (Project → Settings → Environment Variables,
   Production + Preview): see `.env.example` for the complete annotated list —
   `NEXT_PUBLIC_SITE_URL=https://zenframe.in`, the `NEXT_PUBLIC_FIREBASE_*`
   web config, `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` /
   `FIREBASE_PRIVATE_KEY`, `STORAGE_DRIVER=blob`, `RATE_LIMIT_DRIVER=redis`,
   `DATABASE_URL`, `ALLOW_DEV_MAIL_LOG` **unset**.
5. **Deploy**, then check the boot log for `[zenframe:config]` warnings — each
   one is a launch blocker.
6. **Apply the Postgres schema** before the first request that writes data:
   `psql "$DATABASE_URL" -f db/schema-postgres.sql`.
7. **Connect the domain** (Project → Settings → Domains → add
   `zenframe.in` + `www`), then add the DNS records Vercel displays at your
   registrar. Do not mark this done until Vercel shows the domain as
   "Valid Configuration" with a valid certificate.

### Firebase setup (exact manual steps)

Firebase email templates and authorized domains are **Console-side** settings
that cannot be configured from code — until they are done, Firebase emails
either go out with default branding or fail:

1. Create the project at console.firebase.google.com; add a **Web app** and
   copy its config into the `NEXT_PUBLIC_FIREBASE_*` variables.
2. **Authentication → Sign-in method → enable Email/Password.**
3. **Authentication → Settings → Authorized domains → add `zenframe.in`** (and
   your `*.vercel.app` preview domain for testing). Without this, sign-in and
   email action links are rejected for the production domain.
4. **Templates** (Authentication → Templates): edit the *Email verification*,
   *Password reset*, and *Email address change* templates — set the action URL
   / landing to `https://zenframe.in` (verification lands back on
   `/verify-email`, reset on `/reset-password`) and align sender name/branding
   with ZenFrame. Action-handler hosting on the custom domain is configured in
   the same screen; verify a real email round-trip before launch.
5. **Service account** (Project settings → Service accounts → Generate new
   private key) → set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
   `FIREBASE_PRIVATE_KEY` in Vercel. The key never reaches the client bundle;
   only `NEXT_PUBLIC_*` web config does.
6. First admin: after the account exists, run
   `npm run db:admin -- you@zenframe.in` against the production database
   (or set the `role` column directly in Postgres). Admin authorization is
   server-side on every mutation; users can never self-promote.

## Security notes

- Authentication is cookie-based and HttpOnly. There is **no** auth state in
  localStorage.
- Passwords are hashed with scrypt (N=2^15, r=8, p=1) and compared with
  timing-safe equality.
- Session tokens are random, stored only as SHA-256 hashes, and have a 30-day
  TTL with server-side expiry checks.
- Verification and password-reset tokens are single-use and time-limited
  (24h / 1 hour). Used or expired tokens are rejected.
- Forgotten-password and signup endpoints return the same generic message
  regardless of whether the email exists (no account enumeration).
- Mutations require the same origin (or same-site with `Sec-Fetch-Site` checks)
  — CSRF is defended at the cookie/Origin layer.
- Every creation, image, and profile mutation is owner- or admin-authorized.
  There is no IDOR path to another user's data.
- Public share links are unguessable (128-bit), scoped to one creation, and
  stop working the instant they are revoked.
- File uploads validate magic bytes and MIME type, reject oversized payloads,
  and store only under the uploads root.
- Vercel Blob objects are always written `access: "private"`; bytes are served
  only through authorization-checked routes.
- In Firebase mode passwords never touch the application database at all; the
  service-account key lives only in server environment variables.
- Secrets (`RESEND_API_KEY`, `SMTP_PASS`, Redis token, analytics token) are
  read only from the server environment and never shipped to the client.
