# RChat on Windows: Docker Desktop and Android emulator

This runs the Laravel API, MySQL 8, Redis 7, queue worker, and Reverb in Linux containers. Metro runs on Windows; the Android Studio emulator runs the mobile app. This is a local development setup, not a production deployment.

## Prerequisites

- Windows with virtualization enabled and WSL 2 installed. In administrator PowerShell, run `wsl --install` if needed, then reboot and run `wsl --update`.
- Docker Desktop: select **Use the WSL 2 based engine**, use Linux containers, and wait for the engine to start.
- Git for Windows and **Node.js 24 LTS** (includes npm). Reopen PowerShell after installing them.
- Android Studio with Android SDK, Platform-Tools, and Android Emulator. In Device Manager, create and start a Pixel virtual device with a compatible Android system image. Use a Google Play image if later testing Google services.
- Current Docker Compose v2 supporting `docker compose up --wait`.

Use Windows PowerShell or PowerShell 7 for the commands below. Keep this checkout on the Windows filesystem (for example `$HOME\source\chika`) and run Metro using Windows Node, rather than mixing Windows and WSL Node installations. Docker Desktop itself uses WSL 2. Ensure adequate disk space for images and emulator system images.

## Get the application

For a new checkout:

```powershell
git clone --branch feature/windows-docker-setup https://github.com/judedorant/chika.git
cd chika
```

For an existing checkout, first inspect `git status`. Save your work before switching branches; do not use `reset --hard` or discard changes. Fetch and switch to the setup branch only when your working tree permits it.

```powershell
git fetch origin
git switch feature/windows-docker-setup
```

## First run

From the repository root:

```powershell
node --version
git --version
docker version
docker compose version
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```

The execution-policy override applies only to this process; inspect the script before running it. On managed laptops, obey your organization’s policy instead of overriding it. PowerShell 7 users can run `pwsh -NoProfile -File .\scripts\setup-windows.ps1`.

Setup checks the tools, creates ignored local environment files, generates independent random database passwords, a Laravel encryption key, and a private Reverb secret without displaying them. Existing nonempty secrets remain unchanged. The encryption key is generated in Laravel’s supported 32-byte base64 format, so a rerun does not invalidate encrypted data or tokens.

It builds the existing PHP/Composer image, waits for MySQL/Redis, gracefully stops existing API/worker/Reverb containers while updating, installs Composer dependencies, creates missing Laravel writable directories, clears local framework caches, runs incremental migrations, starts the API/worker/Reverb, checks API health, and runs `npm ci` for the mobile app. It stops on command failure. No database resets or volume deletions occur. Migration execution is intentional and applies pending application schema changes; back up valuable local data first.

Use `-SkipMobileInstall` when mobile dependencies are already installed. `npm ci` reinstalls dependencies from the committed lockfile and runs the required compatibility patch; do not disable install scripts.

The helper rejects non-local backend environments, custom incompatible endpoints, database password mismatches, invalid keys, and mismatched public Reverb keys before writing configuration. Review its error and edit **local ignored files** deliberately; never replace existing environment files wholesale. The Compose database/user are `rchat`. If an existing MySQL volume has a different password, restore the matching original configuration or change the database user password through an authenticated administrator session. Editing `.env` does not change an initialized MySQL volume’s credentials.

For corporate TLS interception, provide the approved CA; never disable TLS verification. See [docs/setup.md](docs/setup.md) for BuildKit secret and Composer CA options. The default script assumes ordinary Docker Desktop networking without an intercepting proxy.

## Start the Android app

Start the emulator in Android Studio first. The setup configures:

| Setting | Value |
| --- | --- |
| Mobile API | `http://10.0.2.2:8000/api/v1` |
| Backend APP_URL, including attachment links | `http://10.0.2.2:8000` |
| Mobile Reverb | host `10.0.2.2`, port `8080`, scheme `http` |
| Public socket key | Must match backend `REVERB_APP_KEY` |
| Docker-internal connections | `mysql`, `redis`, and `reverb` |

`10.0.2.2` is the standard Android Studio emulator’s route to the Windows host. It is not the hostname containers use. API and Reverb ports remain bound to host loopback; MySQL and Redis have no published host ports. Private uploads persist in the bind-mounted `backend/storage/app/private` directory. MySQL and Redis persist in named Docker volumes. Do not create a public storage symlink for protected files.

In a separate PowerShell window:

```powershell
cd mobile
npx expo start --go --localhost
```

Press **a** to open Android. If necessary, add `%LOCALAPPDATA%\Android\Sdk\platform-tools` to your Windows user PATH, reopen PowerShell, and run `adb devices` to confirm the emulator is listed. Expo CLI also needs the correct Android SDK location; Android Studio shows it in SDK Manager. If the emulator cannot reach Metro, use `adb reverse tcp:8081 tcp:8081`, then reopen the app. Restrict any firewall exception to private networks; do not expose database ports.

This project uses **Expo SDK 55**. Install the matching Android Expo Go version from https://expo.dev/go if the current Play Store version no longer supports it. Expo Go can be used for compatible basic login/chat/image/API/WebSocket testing, but that workflow has not been verified on your laptop. It cannot validate Android remote push notifications or the app’s final native permissions/configuration.

For a native development client, follow [ANDROID_BUILD_GUIDE.md](ANDROID_BUILD_GUIDE.md) and [FIREBASE_SETUP_GUIDE.md](FIREBASE_SETUP_GUIDE.md). Use `npx expo start --dev-client --localhost` after installing that client. Local Android compilation requires the matching JDK/SDK toolchain; no native project should be hand-edited. No paid EAS build is started by this setup. Use a supported physical Android device for the project’s full remote push verification. Never claim emulator/Expo Go testing proves FCM delivery.

HTTP/cleartext access is allowed only by development configuration. Existing release checks require explicit HTTPS/WSS endpoints; this setup does not weaken them. Do not put secrets in `EXPO_PUBLIC_*` values.

## Subsequent starts and stops

Start Docker Desktop, then from the repository root:

```powershell
docker compose up -d --wait
docker compose ps
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health
```

Start the emulator and Metro separately as above. After pulling changes, rerun setup to install locked dependencies and apply pending migrations. Restart Metro after mobile environment changes. Recreate containers after backend environment changes:

```powershell
docker compose up -d --force-recreate api worker reverb
```

Safe stop/restart commands preserve data:

```powershell
docker compose stop
docker compose start
docker compose restart api worker reverb
```

`docker compose down` removes containers/network but preserves named volumes and bind-mounted uploads. **Do not add `--volumes` / `-v`: that deletes MySQL and Redis data.** Do not use `migrate:fresh`, delete `backend/storage`, or prune volumes unless you explicitly intend to destroy disposable local data and have a backup. No deletion command is needed for normal setup.

## Optional sample accounts

Prefer registering your own local accounts through the app. To seed local-only users, choose a new local password of at least 12 characters. This prompt hides typing and does not add the password to command history:

```powershell
$demoSecret = Read-Host 'Local demo password (12+ characters)' -AsSecureString
$demoCredential = New-Object System.Management.Automation.PSCredential('local-demo', $demoSecret)
try {
    $env:DEMO_PASSWORD = $demoCredential.GetNetworkCredential().Password
    docker compose run --rm -e DEMO_PASSWORD api php artisan db:seed
    if ($LASTEXITCODE -ne 0) { throw 'Seeding failed' }
} finally {
    Remove-Item Env:DEMO_PASSWORD -ErrorAction SilentlyContinue
    $demoCredential = $null
    $demoSecret = $null
}
```

Accounts: `jude@rchat.test`, `alex@rchat.test`, `sam@rchat.test`. Seeding does not replace existing users’ passwords and refuses production. The password is briefly passed as a local container environment variable, visible to local Docker administrators; never use a real account password.

## Verification

Fast isolated backend tests use in-memory SQLite, not your development MySQL tables:

```powershell
docker compose run --rm -e DB_CONNECTION=sqlite -e DB_DATABASE=:memory: api php artisan test
docker compose run --rm api vendor/bin/pint --test
node --test scripts/tests/prepare-local.test.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\tests\setup-windows.tests.ps1
cd mobile
npm test
npm run typecheck
npm run lint
```

The PowerShell test mocks external commands; it verifies orchestration, argument preservation, and failure handling, not Docker Desktop itself. Do not run destructive MySQL tests against the development database. An optional MySQL test run needs a separately provisioned empty `rchat_test` database and explicit credentials as described in [docs/setup.md](docs/setup.md).

From the repository root, the existing live smoke test exercises the actual local API, MySQL, Redis, worker, and Reverb:

```powershell
node --env-file=backend/.env scripts/smoke.mjs
```

It creates disposable test accounts, conversations, and attachments in the local development database and revokes their sessions afterward. It does not erase the created data. Run it only against a disposable local stack. It verifies registration/login/logout, authenticated channels, private/group messages, retry safety, receipts, presence/typing, reconnect/history synchronization, and attachment access permissions. It does not send real Firebase notifications or drive the Android UI.

## Troubleshooting

```powershell
docker compose ps
docker compose logs --tail 100 api worker reverb
docker compose logs --tail 100 mysql redis
docker compose run --rm api php artisan migrate:status
adb devices
```

- **Docker connection error:** start Docker Desktop; verify Linux containers and WSL 2. If WSL/virtualization fails, resolve the reported Windows requirement first.
- **Port already allocated:** inspect the process using port 8000/8080. Stop the conflicting application deliberately; do not silently change one endpoint without changing backend/mobile configuration together.
- **API healthy but login fails:** the health endpoint only reports HTTP readiness. Check migrations, MySQL/Redis health, and Laravel logs. Database credentials must match the existing volume.
- **Chat history loads but live updates fail:** check Reverb health, allowed origins (`10.0.2.2`), matching public key, and worker logs. Public keys cannot contain colons. Never copy the private Reverb secret into mobile config.
- **Images fail:** backend `APP_URL` must be emulator-reachable; attachment requests require authentication. Do not make private files public to bypass authorization.
- **Unwritable storage:** inspect Docker Desktop file sharing/access permissions. The setup only creates missing directories and checks writability; it does not apply unsafe recursive `chmod 777`.
- **Expo opens the wrong client:** use explicit `--go` or `--dev-client`; installed `expo-dev-client` can otherwise change the CLI’s default target.
- **No notifications in Expo Go:** expected; finish native Firebase/EAS configuration and device QA separately.
- **Worker retries:** existing queue reservation is 120 seconds, longer than the 90-second worker timeout. Worker shutdown grace is 120 seconds. Inspect failed jobs; do not repeatedly restart to hide a configuration problem.

The Docker Compose runtime remains a development server. Production deployment and Android APK/AAB builds remain separate, credential-dependent work requiring their own verification.

## Verification recorded for this change

Executed in the managed Linux environment:

- Existing PHP Docker image build succeeded using a trusted CA BuildKit mount (cached layers); required GD, PDO MySQL/SQLite, pcntl, mbstring, and fileinfo extensions were present.
- Compose validation and startup succeeded. MySQL, Redis, API, and Reverb reported healthy; the worker ran and processed real broadcast jobs.
- Backend tests: **32 passed / 141 assertions** with in-memory SQLite, and **32 passed / 141 assertions** with the isolated MySQL 8 `rchat_test` database.
- Live local HTTP/Reverb smoke: **40 checks passed**. This also exercised real Redis presence/typing, queued broadcasts, history synchronization, and private attachment access.
- Mobile tests: **8 passed**; TypeScript and lint passed. The first attempt under restricted process sandboxing failed a subprocess-based compatibility test; rerunning with normal process access passed all eight.
- Local configuration helper: **5 tests passed**, including exact preservation on rerun and rejection without writes for conflicting/custom configuration.
- PowerShell **7.4** container: syntax and mocked command argument/failure/directory-restoration checks passed. External commands were mocked; this was not a real Windows Docker Desktop installation.
- Laravel Pint passed all **66** PHP files.

The added `windows-setup` GitHub Actions job runs the helper tests and mocked orchestration under Windows PowerShell. See the pull request checks for its result. Windows Docker Desktop end-to-end setup, emulator UI, actual native builds, and Firebase delivery have **not** been verified here. No production deployment, APK/AAB build, store publication, or EAS build was performed. No new external credentials are needed for the basic local stack; native push/build verification still requires the existing Firebase/Expo setup described in the release guides.
