# Setup

Use Node 24, npm, Docker Engine with Compose v2, and Git. Native backend setup requires PHP 8.5, Composer 2, GD, mbstring, PDO MySQL/SQLite, fileinfo, XML, and pcntl, plus MySQL 8 and Redis 7. The checked-in lockfile was verified with PHP 8.5.

## Local Docker backend

1. Copy root `.env.example` to `.env`. Generate separate strong random local values for `RCHAT_DB_PASSWORD` and `RCHAT_DB_ROOT_PASSWORD`.
2. Copy `backend/.env.example` to `backend/.env`. Set `DB_PASSWORD` to the same value as `RCHAT_DB_PASSWORD`. Keep the public development identifier `REVERB_APP_KEY=rchat-local` and generate a private `REVERB_APP_SECRET` (for example, 64 random hexadecimal characters). Reverb public identifiers must contain only letters, numbers, underscores, and hyphens; colons break private-channel authentication. Startup rejects invalid public identifiers and missing/short private secrets. The Laravel application key is generated below.
3. Set `APP_URL` to the API address reachable by your Android device: `http://10.0.2.2:8000` for the standard emulator. For a physical device use HTTPS through a reachable development endpoint, or an appropriate local development setup. This URL is used for private image resources.
4. Build and initialize from the repository root:

```sh
docker compose build
docker compose up -d mysql redis
docker compose run --rm api composer install
docker compose run --rm api php artisan key:generate
docker compose run --rm api php artisan migrate
docker compose up -d api worker reverb
curl http://localhost:8000/api/v1/health
```

Compose binds API and sockets to loopback on the host. Use an emulator, `adb reverse`, or an explicit TLS development ingress for a physical device; do not expose MySQL or Redis publicly. Compose overrides DB/Redis/Reverb hostnames internally. Its PHP runtime is a development server, not a production web server.

Behind an intercepting proxy, keep TLS verification enabled. Supply your environment's CA as a BuildKit secret when building: `docker build --secret id=proxy_ca,src=/path/to/combined-ca.pem -t rchat-php:dev backend`. Composer network operations in containers may also need a read-only combined CA mount with `COMPOSER_CAFILE` pointing to it. The session-specific CA is not committed or baked into the image.

Register your own accounts through the app. Optional local sample users (jude/alex/sam at `rchat.test`) and a group can be created using `docker compose run --rm -e DEMO_PASSWORD api php artisan db:seed` after exporting a local-only `DEMO_PASSWORD` with at least 12 characters. Seeders refuse production. Never use sample credentials in deployment.

## Native backend alternative

```sh
cd backend
composer install
cp .env.example .env
php artisan key:generate
# Configure the local MySQL database/user, Redis, and Reverb credentials in .env.
php artisan migrate
php artisan serve --host=0.0.0.0
# Separate terminals:
php artisan queue:work redis --tries=3 --timeout=90
php artisan reverb:start --host=0.0.0.0 --port=8080
php artisan schedule:work
```

The production scheduler runs `php artisan schedule:run` every minute. Compose does not launch a scheduler; run it separately if you need pruning in local long-lived environments.

## Android application

```sh
cd mobile
cp .env.example .env
npm ci
npm test
npx expo install --check
npm run typecheck
npm run lint
npm start
```

Set `EXPO_PUBLIC_REVERB_APP_KEY` to the backend's public Reverb app key. For the emulator use API `http://10.0.2.2:8000/api/v1`, socket host `10.0.2.2`, port `8080`, and scheme `http`. Add the public socket hostname to backend `REVERB_ALLOWED_ORIGINS` (the example includes the emulator host); React Native sends an Origin derived from its socket URL. API and Reverb public URLs may differ from backend container-internal hostnames. Restart Metro and Reverb after changing their settings.

Only public configuration belongs in `EXPO_PUBLIC_*`; never place the Reverb secret, Expo access token, database credentials, or signing keys there. Release builds must use HTTPS and WSS. HTTP emulator URLs are for local development builds. Dark mode follows system appearance.

The security updates use a scoped Expo CLI Zod override and a minimal CommonJS compatibility patch for query-string's patched ESM decoder. `npm ci` runs `patch-package` automatically; keep install scripts enabled and commit the patch alongside the lockfile. Node 24 is required for the verified toolchain. `npm test` checks the actual Expo CLI schemas, Router query serialization/decoding, and malformed-input behavior; it does not replace Android device tests. See `docs/qa.md` for versions and results.

Use a development build for full native functionality, especially notifications. Expo Go cannot verify Android remote push delivery. For EAS:

```sh
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform android --profile development
# Install the resulting development client, then:
npx expo start --dev-client
# Internal APK:
npx eas-cli@latest build --platform android --profile preview
# Play Store AAB:
npx eas-cli@latest build --platform android --profile production
```

EAS init must associate this checkout with your own project (`extra.eas.projectId` in app config). Configure Android FCM v1 credentials in EAS and the appropriate Firebase app configuration through private build settings. Add any `google-services.json` through a protected build file/secret and reference it in app configuration; this repository does not include one. Enable Expo enhanced push security and configure `EXPO_ACCESS_TOKEN` on the server if required. On a physical device, use Settings → Enable push notifications after login. Signing and store submission require your Expo/Google accounts and credentials and have not been performed here.

## Checks

```sh
# SQLite, fast isolated API suite:
docker compose run --rm -e DB_CONNECTION=sqlite -e DB_DATABASE=:memory: api php artisan test
# MySQL test run: create an EMPTY dedicated rchat_test database first.
# Tests migrate and destroy tables; never point this at production or shared data.
docker compose run --rm -e DB_CONNECTION=mysql -e DB_DATABASE=rchat_test api php artisan test
docker compose run --rm api vendor/bin/pint --test
docker compose run --rm api composer audit
cd mobile
npm run typecheck
npm run lint
npx expo-doctor
npm run export:android
npm test
npm audit
```

The MySQL test user must have privileges on the isolated test database. `.env` files, private credentials, dependencies, generated native directories, and export bundles are gitignored. Commit `composer.lock` and `package-lock.json` for reproducible installs.

Run `node --env-file=backend/.env scripts/smoke.mjs` from the repository root against the disposable local stack for real HTTP, Redis, worker, and Reverb verification. Install mobile dependencies first. The script waits for API readiness, creates local accounts/messages, and revokes sessions afterward. It checks private/group message events, membership removal, receipts, typing, presence, attachment permissions, blocking, and retries. GitHub Actions now runs this in a separate disposable Docker job with generated temporary credentials.

Compose preserves outbound proxy settings and routes only the named Docker services directly within their own network. Its Redis retry reservation defaults to 120 seconds, longer than the worker's 90-second timeout, to avoid reclaiming an in-flight job prematurely.

## Deployment preparation

Provision MySQL/Redis/private shared storage; deploy backend code with `composer install --no-dev --optimize-autoloader`, inject secrets, set `APP_ENV=production`, `APP_DEBUG=false`, configure HTTPS APP_URL and WSS Reverb settings, then run migrations through the deployment process. Run `php artisan config:cache`, `route:cache`, and `view:cache`. Supervise workers, Reverb, and scheduler; restart workers/Reverb after deployments. Configure explicit allowed browser origins and ingress proxy trust. Use backend-accessible Reverb routing separately from the public mobile socket host if your deployment needs it. See architecture boundaries and the QA checklist before release.

## Phase 9 release preparation

Use the repository-root `ANDROID_BUILD_GUIDE.md`, `BACKEND_DEPLOYMENT_GUIDE.md`, `FIREBASE_SETUP_GUIDE.md`, `PRODUCTION_CHECKLIST.md`, and `ANDROID_QA_REPORT.md` for the current release configuration. Dynamic Expo config reads `EAS_PROJECT_ID` and `GOOGLE_SERVICES_JSON`; release profiles require explicit HTTPS/WSS values. Production templates are prepared under `deploy/` and have not been installed on a production host.
