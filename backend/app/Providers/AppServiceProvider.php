<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        if (config('broadcasting.default') === 'reverb' && ! preg_match('/\A[A-Za-z0-9_-]+\z/', (string) config('broadcasting.connections.reverb.key'))) {
            throw new \LogicException('REVERB_APP_KEY is a public identifier and must contain only letters, numbers, underscores, or hyphens; colons break private-channel signatures.');
        }
        if (config('broadcasting.default') === 'reverb' && strlen((string) config('broadcasting.connections.reverb.secret')) < 32) {
            throw new \LogicException('REVERB_APP_SECRET must be configured with at least 32 random characters.');
        }

        RateLimiter::for('auth', fn (Request $r) => Limit::perMinute(10)->by($r->ip()));
        RateLimiter::for('api', fn (Request $r) => Limit::perMinute(300)->by($r->user()?->id ?? $r->ip()));
        RateLimiter::for('messages', fn (Request $r) => Limit::perMinute(60)->by($r->user()->id));
        RateLimiter::for('typing', fn (Request $r) => Limit::perMinute(30)->by($r->user()->id));
    }
}
