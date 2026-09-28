# CareerMatch

A complete self-hosted opportunity discovery and application tracking application. Browse real source-linked jobs without an account; create a private profile to get explainable recommendations, save opportunities, and manage your application journey.

## Features

- Registration, sign-in, logout, password changes and one-time recovery codes.
- Persistent SQLite users, sessions, profiles, bookmarks, applications and catalog.
- Public feeds: Arbeitnow and Remotive, fetched server-side no more than every six hours.
- Public search by keyword, location, type, format and source, with pagination.
- Content-based recommendations using corpus-aware TF-IDF cosine similarity plus skills, interests and preferences. Academic criteria are enforced only when stated; missing requirements say **check source**.
- Saved shortlist and a tracker with Planned, Applied, Interview, Offer, Rejected and Withdrawn stages, private notes and account-data export.
- Administrator dashboard with source health, explicit sync, and create/edit/archive controls for source-linked hackathons, fellowships, internships and jobs.
- Responsive interface, keyboard-operable controls, safe plain-text source descriptions, and empty/error/loading states.
- HTTP-only sessions, CSRF validation, asynchronous scrypt password hashing, rate limiting, prepared SQL, role checks, input validation and security headers.
- Docker packaging, health endpoint, database backup command and automated integration tests.

There are **no fictional production listings** and no required paid APIs. `data/opportunities.json` is an empty retired catalog retained for compatibility with the original repository layout. Production always reads SQLite. Test fixtures are explicitly synthetic and are never imported into the application.

## Start locally

Install **Node.js 24.x** (the app uses `node:sqlite`; this API is still experimental in Node 24). No npm dependencies need installing.

```bash
git clone https://github.com/sooryaprakashrnp-wq/-CareerMatch.git
cd -CareerMatch
cp .env.example .env
npm start
```

On Windows, copy `.env.example` to `.env` using File Explorer or `Copy-Item .env.example .env` in PowerShell. Open **http://localhost:3000**. The first feed import runs in the background; allow up to 45 seconds, then refresh. Feed failure is displayed honestly and does not inject sample listings.

For development, `npm run dev` watches source changes. Persistent data is in `storage/careermatch.db`, which is ignored by Git.

## Administrator setup

1. Set `ADMIN_EMAILS=your-address@example.com` in `.env`. Multiple addresses can be comma separated.
2. Run `npm run create-admin` in a terminal. Enter the same address, a name, and a password when prompted; password input is hidden.
3. Save the recovery code privately and restart the app after changing `.env`.
4. Sign in, open **Manage catalog**, and add opportunities using a verified HTTPS source URL.

Reserved administrator emails cannot be claimed through public registration. The provisioning command never overwrites an existing account. Do not set an arbitrary existing user as an administrator without verifying ownership.

## Account recovery and privacy

Registration and recovery display a high-entropy recovery code once. Keep it private. A reset invalidates old sessions and rotates the recovery code. Email is an account identifier; email ownership is **not verified**. There is no email service, password-reset email, OAuth or automatic job-application submission. Never claim otherwise when presenting the project.

Profiles and application notes are private to the signed-in account. They are not sent to feed providers. Users can export their account data. The deployment owner handles deletion requests. Administrators do not receive a UI for reading other users' private profiles or notes.

## Data sources and rules

- [Arbeitnow Job Board API](https://www.arbeitnow.com/blog/job-board-api): free, keyless, primarily European opportunities. One published API page is fetched per sync; this is not an exhaustive global catalog.
- [Remotive public API](https://github.com/remotive-com/remote-jobs-api): jobs retain Remotive attribution and original links, are available without signing up, and are delayed by 24 hours. CareerMatch respects the recommended maximum of four requests per day through a persistent six-hour cooldown, including failures. Do not syndicate the feed onward to other job boards.
- Curated opportunities are entered by an administrator with a source URL. There is no automated hackathon feed; real hackathons must be sourced and reviewed before adding them.

Remote does **not** imply worldwide eligibility. Country requirements stay visible. The app does not infer visa eligibility. Imported skills are inferred from listing text and can include contextual or preferred mentions. Listings not seen for 14 days are deactivated after a successful source sync; curated deadlines expire after their calendar date. A source can close a listing between refreshes: verify at the original URL before applying.

Failed imports preserve the previous catalog and store a visible error. There is no uncontrolled scraping, arbitrary-URL fetching, or invented live data.

## Recommendations

Each request builds TF-IDF vectors over the current catalog and compares the user's skills, interests and goal text with descriptions. The score combines:

| Signal | Weight |
|---|---:|
| TF-IDF cosine text relevance | 35% |
| Exact normalized skill overlap | 30% |
| Domain interests | 15% |
| Opportunity type | 8% |
| Work format | 7% |
| Location text match | 5% |

Known academic mismatches sort below other opportunities. Unknown requirements are explicitly labeled. This is a deterministic **content-based recommender**, not an LLM, embedding model, collaborative filtering system or hiring-probability model. Scores cannot establish employer eligibility.

Run `npm run evaluate` for a three-query synthetic regression check. Its numbers do not represent real-user performance. Before claiming resume metrics, collect consented relevance judgments, use a held-out evaluation set, and compare against a keyword baseline.

## Operations and deployment

```bash
npm test                 # Unit and end-to-end API tests
npm run evaluate         # Small, explicitly labeled ranking regression
npm run sync             # Import sources (respects persistent cooldown)
npm run backup           # Consistent SQLite backup into backups/
```

Build and run with a persistent Docker volume behind an HTTPS reverse proxy:

```bash
docker build -t careermatch .
docker run -d --name careermatch -p 127.0.0.1:3000:3000 \
  -v careermatch-data:/app/storage \
  -e APP_ORIGIN=https://your-actual-domain.example \
  -e ADMIN_EMAILS=your-address@example.com careermatch
```

Replace the example domain with the actual HTTPS origin. Production rejects an HTTP `APP_ORIGIN`, uses Secure cookies, and requires the browser Origin to match. Provision the administrator with `docker exec -it careermatch node manage.js admin`. Terminate TLS at your hosting platform or reverse proxy. Persist **all of `/app/storage`**, not only the `.db` file (SQLite uses WAL companion files).

For a Node host: start with `npm start`, pin Node 24, set `NODE_ENV=production`, `APP_ORIGIN`, `ADMIN_EMAILS`, and `DATABASE_PATH` on a persistent volume. Health check: `GET /api/health`. This is a **single-instance deployment**: do not run multiple replicas against the same SQLite file. A serverless ephemeral filesystem is unsuitable. Use managed PostgreSQL and shared rate limits before horizontal scaling.

Back up the database regularly and restrict backup access. To restore, stop the app, preserve the current database for recovery, replace it with the backup and remove obsolete WAL/SHM files before restarting. Never replace a live database. Port changes require a matching local `APP_ORIGIN`.

## API map

| Endpoint | Access | Purpose |
|---|---|---|
| `GET /api/health` | Public | Health |
| `GET /api/opportunities` | Public | Filtered, paginated opportunities |
| `POST /api/auth/register`, `/login`, `/recover` | Public, rate limited | Account access |
| `GET /api/auth/me` | Public | Current user and CSRF token |
| `POST /api/auth/logout`, `/password` | Session | Session and password management |
| `PUT /api/profile` | Session + CSRF | Update preferences |
| `GET /api/dashboard`, `/api/export` | Session | Private progress/export |
| `PUT/DELETE /api/saved/:id` | Session + CSRF | Shortlist |
| `PUT/DELETE /api/applications/:id` | Session + CSRF | Tracker |
| `GET /api/admin/status` | Admin | Source status and catalog |
| `POST /api/admin/sync` | Admin + CSRF | Import sources |
| `POST /api/admin/opportunities` | Admin + CSRF | Add curated opportunity |
| `PUT /api/admin/opportunities/:id` | Admin + CSRF | Edit/archive curated opportunity |

Mutation requests use `Content-Type: application/json`. Signed-in mutations also send `X-CSRF-Token` from `/api/auth/me`. Session cookies should never be copied into frontend storage.

## Validation and limits

Tests cover signup/login/recovery, session invalidation, admin-address reservation, CSRF and cross-origin rejection, profile validation, cross-user privacy, bookmarks, tracker updates, catalog administration, provider cooldown/failure, database restart persistence, expiry and ranking. Run tests before committing.

This repository contains the complete self-hosted application and operations setup; it is not automatically deployed by committing it. Public hosting, a persistent disk, TLS and administrator provisioning are deployment-owner responsibilities. It has not undergone an independent security audit or a high-traffic load test. Real feed coverage is global/Europe-weighted, not a guarantee of India-specific internships.
