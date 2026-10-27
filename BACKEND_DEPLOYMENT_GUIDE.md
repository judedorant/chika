# RChat backend deployment guide

**No production deployment has occurred.** These are reviewed templates and operator steps, to execute only after target infrastructure, credentials, backups, and explicit deployment approval are available. The current Compose stack remains local development/CI infrastructure.

## Audit and architecture

The existing backend is Laravel 13 with a lockfile verified on PHP 8.5, MySQL 8, Sanctum bearer tokens, Redis cache/queues/presence/typing, and Reverb. Authorization, Form Requests, resources, transactions, migrations, private uploads, push jobs, and tests already exist and are retained.

Production layout in the supplied examples:

- `/srv/rchat/releases/<commit>/backend`: immutable release source and installed production dependencies.
- `/srv/rchat/current`: symlink to the active repository release.
- `/srv/rchat/shared/backend.env`: private production environment, outside Git and the public web root.
- `/srv/rchat/shared/storage`: persistent Laravel storage shared by API and workers across releases.
- Nginx TLS ingress; a dedicated PHP-FPM pool; Supervisor queue/Reverb processes; one cron scheduler.

Install PHP 8.5 CLI/FPM with mbstring, XML, fileinfo, GD, PDO MySQL, pcntl, and the extensions required by `composer check-platform-reqs --no-dev`. SQLite is used for fast tests only. Provision MySQL/Redis privately, with credentials and backups. Restrict public inbound traffic to 80/443; do not expose 3306, 6379, 8080, or the FPM socket.

## Environment and storage

Copy `deploy/backend.env.example` into a protected file outside this checkout. Replace all example domains and fill secrets through your secret-management process. Generate `APP_KEY` once, then preserve it across deployments. Supply a random Reverb secret of at least 32 characters and the Expo access token if enhanced push security is enabled. Set `APP_ENV=production` and `APP_DEBUG=false`.

- `APP_URL=https://api.<your-domain>` controls generated private resource URLs and trusted production hosts.
- Mobile uses `https://api.<your-domain>/api/v1` and `wss://ws.<your-domain>:443`.
- On the example single host, backend workers publish to `http://127.0.0.1:8080`; public clients use the separate WSS Nginx endpoint. Internal HTTP is acceptable only on the protected same-host loopback. Use private TLS routing if publishers and Reverb are on different machines.
- `REVERB_ALLOWED_ORIGINS` must list actual public socket/browser hostnames; React Native derives Origin from the socket URL. Do not use `*`.
- With direct Nginx/FPM TLS termination, leave `TRUSTED_PROXIES` empty. For an ingress load balancer, list only its exact IPs/CIDRs. Wildcards and whole-Internet ranges are rejected. Never trust forwarded headers from arbitrary clients.

Run application/readiness commands as the `rchat` service user, not root, so writability checks reflect actual runtime access. Create that service user, writable runtime/cache directories, `/var/log/rchat`, and appropriate FPM socket permissions. Link each release's `backend/.env` and `backend/storage` to the protected shared paths; keep `bootstrap/cache` release-specific and writable by the app. Do not grant broad 0777 permissions. The code explicitly uses the private **local** storage disk for attachments/avatars: a shared persistent filesystem is required if API/worker nodes are separated. Merely changing `FILESYSTEM_DISK=s3` does not migrate this implementation to S3.

Never run `storage:link` for private chat media. Nginx denies `/storage/`; files are streamed through membership-authorized API endpoints. Back up the database and private files consistently and test restoration. Establish deletion/orphan retention policies before release.

## Web, TLS, workers, scheduler

- `deploy/nginx/rchat.conf`: example API HTTPS and Reverb WSS virtual hosts. Only `/app/` is proxied publicly; the signed Reverb `/apps/` publishing API stays internal. Upload limits accommodate the API's 5 MiB image limit plus multipart overhead.
- `deploy/php-fpm/rchat.conf`: dedicated pool and upload/memory settings. Adapt PHP paths and `www-data` group for the host distribution.
- `deploy/supervisor/rchat.conf`: two Redis workers and a loopback Reverb process, running as `rchat` with bounded log rotation and graceful shutdown.
- `deploy/cron/rchat`: Laravel scheduler on exactly one host. Install it root-owned with mode 0644 and verify the command/user paths.

Provision real DNS and trusted certificates first. Use DNS validation or a temporary HTTP-only ACME setup if certificates do not yet exist; the supplied TLS server blocks require certificate files before Nginx can start. Test `nginx -t` and `php-fpm8.5 -t` on the target host before reload. Syntax tests here used temporary self-signed fixtures in disposable containers; they do not verify public certificates or live HTTPS/WSS.

Set the Supervisor service's OS file-descriptor limit (and, where used, `[supervisord] minfds`) for the expected Reverb connection count. Tune workers/FPM against measured memory and traffic. Worker timeout is 90 seconds; Redis reservation is 120 seconds. Keep reservation greater than timeout. Avoid concurrent deployments or schedulers.

## Deployment sequence — approval required before execution

1. Approve the target/commit and maintenance plan; capture and verify a recoverable database/private-storage backup.
2. Stage a new release, link its protected environment/storage, and install locked production dependencies:

```sh
composer install --no-dev --prefer-dist --no-interaction --optimize-autoloader
composer check-platform-reqs --no-dev
php artisan rchat:production-check --connections
php artisan migrate --pretend
```

3. Review the migration plan for compatibility and locking. After approval, run `php artisan migrate --force`; never use `migrate:fresh` or demo seeders in production. Migrations are not assumed safely reversible when data exists.
4. Prepare release caches with `php artisan config:cache`, `route:cache`, and `view:cache`; switch the active release atomically.
5. Reload FPM/Nginx appropriately, then gracefully restart queue/Reverb processes so they load the new code/configuration. On first installation, have the operator review and load the Supervisor definitions. Ensure one scheduler is active.
6. Verify `/up` and `/api/v1/health`, authenticated API flows, real WSS subscriptions/delivery, file permissions, and push on approved test accounts. Liveness endpoints do not prove DB/Redis readiness; the CLI production check can probe those connections without writing application data or printing credentials.
7. Observe errors/queue lag and retain the prior release and backup until the verification window closes.

The readiness command is a gate, not a deploy command. It fails for local/default configuration and does not verify public TLS, FCM, backups, monitoring, Android builds, or deployment approval.

## Monitoring and rollback

Monitor API latency/5xx, MySQL locks/connections, Redis memory/eviction, queue delay/failed jobs, Reverb disconnects, disk growth, TLS expiry, and Expo ticket/receipt errors. Redact tokens, request credentials, and message content from logs. Alert on failed push receipts; accepted provider tickets do not prove device delivery.

Push jobs use a per-message overlap lock and Redis markers for accepted tickets; retries skip known accepted recipients. Redis eviction, a lost HTTP response after provider acceptance, or an upstream duplicate can still cause duplicates. Maintain Redis durability and monitor ambiguous failures; there is no exactly-once transport guarantee or durable transactional outbox.

For rollback, restore the previous release pointer and gracefully reload processes if the schema is compatible. Do not automatically roll back migrations or restore a database over newly written messages. Use the approved incident/restore plan for incompatible schema or data changes.

Immediate disconnection of already-authorized sockets after token revocation, transactional-outbox recovery, load/concurrency limits, backup restoration, retention, and real-device verification remain release gates described in `PRODUCTION_CHECKLIST.md` and `docs/architecture.md`.
