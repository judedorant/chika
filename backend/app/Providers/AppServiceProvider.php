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
        RateLimiter::for('auth', fn (Request $r) => Limit::perMinute(10)->by($r->ip()));
        RateLimiter::for('api', fn (Request $r) => Limit::perMinute(300)->by($r->user()?->id ?? $r->ip()));
        RateLimiter::for('messages', fn (Request $r) => Limit::perMinute(60)->by($r->user()->id));
        RateLimiter::for('typing', fn (Request $r) => Limit::perMinute(30)->by($r->user()->id));
    }
}
