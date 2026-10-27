<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Encryption\Encrypter;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class ProductionCheck extends Command
{
    protected $signature = 'rchat:production-check {--connections : Also test configured MySQL and Redis connectivity}';

    protected $description = 'Read-only production readiness checks; does not migrate, deploy, or print credentials';

    public function handle(): int
    {
        $url = (string) config('app.url');
        $root = realpath(config('filesystems.disks.local.root'));
        $public = realpath(public_path());
        $key = (string) config('broadcasting.connections.reverb.key');
        $secret = (string) config('broadcasting.connections.reverb.secret');
        $origins = config('reverb.apps.apps.0.allowed_origins', []);
        $host = (string) parse_url($url, PHP_URL_HOST);
        $applicationKey = (string) config('app.key');
        $applicationKey = str_starts_with($applicationKey, 'base64:') ? (base64_decode(substr($applicationKey, 7), true) ?: '') : $applicationKey;
        $checks = [
            'Production environment' => config('app.env') === 'production',
            'Debug disabled' => config('app.debug') === false,
            'Application encryption key configured' => Encrypter::supported($applicationKey, config('app.cipher')),
            'HTTPS API URL with DNS hostname' => parse_url($url, PHP_URL_SCHEME) === 'https' && str_contains($host, '.') && ! filter_var($host, FILTER_VALIDATE_IP) && ! preg_match('/(^|\.)(localhost|local|test|invalid|example|example\.com|example\.org|example\.net)$/i', $host),
            'MySQL selected' => config('database.default') === 'mysql',
            'Redis cache and queues selected' => config('cache.default') === 'redis' && config('queue.default') === 'redis',
            'Reverb configured with signing credentials' => config('broadcasting.default') === 'reverb' && (bool) preg_match('/\A[A-Za-z0-9_-]+\z/', $key) && strlen($secret) >= 32,
            'Reverb origins explicitly restricted' => count($origins) > 0 && ! collect($origins)->contains(fn ($origin) => str_contains($origin, '*')),
            'Reverb server and broadcaster credentials match' => config('reverb.apps.apps.0.key') === $key && config('reverb.apps.apps.0.secret') === $secret,
            'Queue reservation exceeds worker timeout' => (int) config('queue.connections.redis.retry_after') > (int) config('deployment.worker_timeout'),
            'Private uploads outside public root' => $root && $public && ! str_starts_with($root.'/', $public.'/'),
            'Runtime storage writable' => is_writable(storage_path()) && is_writable(storage_path('app/private')) && is_writable(base_path('bootstrap/cache')),
            'Explicit trusted proxies' => ! collect(config('deployment.trusted_proxies', []))->contains(fn ($proxy) => str_contains($proxy, '*') || str_ends_with($proxy, '/0') || ! filter_var(explode('/', $proxy)[0], FILTER_VALIDATE_IP)),
        ];
        foreach ($checks as $label => $ok) {
            $this->line(($ok ? 'PASS ' : 'FAIL ').$label);
        }
        if ($this->option('connections')) {
            foreach (['MySQL' => fn () => DB::connection('mysql')->select('SELECT 1'), 'Redis' => fn () => Cache::store('redis')->getStore()->connection()->ping()] as $label => $probe) {
                try {
                    $probe();
                    $this->line('PASS '.$label.' connection');
                } catch (\Throwable) {
                    $checks[$label] = false;
                    $this->error('FAIL '.$label.' connection (inspect server logs without exposing credentials)');
                }
            }
        }
        $this->warn('This does not verify public TLS/WSS, FCM delivery, backups, Android builds, or approval to deploy.');

        return in_array(false, array_map('boolval', $checks), true) ? self::FAILURE : self::SUCCESS;
    }
}
