<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withBroadcasting(__DIR__.'/../routes/channels.php', ['prefix' => 'api/v1', 'middleware' => ['api', 'auth:sanctum', 'throttle:api']])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->replace(TrustProxies::class, App\Http\Middleware\TrustProxies::class);
        // Resolve configuration at request time, after Laravel bootstraps it.
        $middleware->trustHosts(at: function () {
            if (config('app.env') !== 'production') {
                return [];
            }
            $host = parse_url(config('app.url'), PHP_URL_HOST);

            return $host ? ['^'.preg_quote($host, '/').'$'] : [];
        }, subdomains: false);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
