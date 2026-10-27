# RChat

Android messaging with a Laravel 13 API, MySQL 8, Sanctum, Redis queues, Reverb, and an Expo 55 / React Native TypeScript client.

The implementation preserves the repository's existing `feature/rchat-foundation` commits. The mobile client uses real authenticated endpoints; sample data is optional and restricted to local/testing environments.

Features include private and group chats, cursor-paginated history, optimistic sending and retries, edits, deletion, replies, receipts, typing, presence, blocking, private images, profile management, and Expo push registration.

- [Setup and Android builds](docs/setup.md)
- [Architecture and operational boundaries](docs/architecture.md)
- [Database](docs/database.md)
- [API](docs/api.md)
- [Verification results and release checklist](docs/qa.md)

```text
backend/   Laravel API, migrations, policies, jobs, PHPUnit tests
mobile/    Expo Router app, components, services, Zustand stores, types
docs/      Setup, architecture, API, database, QA
```

Start with `docs/setup.md`. Use HTTPS/WSS and production process supervision before deployment. No Android binary or production deployment is implied by source or JavaScript bundle validation.
