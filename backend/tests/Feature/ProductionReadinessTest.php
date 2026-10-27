<?php

namespace Tests\Feature;

use Tests\TestCase;

class ProductionReadinessTest extends TestCase
{
    private function validConfig(): void
    {
        config([
            'app.env' => 'production', 'app.debug' => false, 'app.url' => 'https://api.rchat.app', 'app.key' => str_repeat('a', 32),
            'database.default' => 'mysql', 'cache.default' => 'redis', 'queue.default' => 'redis', 'broadcasting.default' => 'reverb',
            'broadcasting.connections.reverb.key' => 'test-public', 'broadcasting.connections.reverb.secret' => str_repeat('a', 64),
            'reverb.apps.apps.0.key' => 'test-public', 'reverb.apps.apps.0.secret' => str_repeat('a', 64), 'reverb.apps.apps.0.allowed_origins' => ['ws.rchat.app'],
            'queue.connections.redis.retry_after' => 120, 'deployment.worker_timeout' => 90,
        ]);
    }

    public function test_configuration_check_passes_without_contacting_production_services(): void
    {
        $this->validConfig();
        $this->artisan('rchat:production-check')->expectsOutput('PASS HTTPS API URL with DNS hostname')->assertExitCode(0);
    }

    public function test_debug_http_and_unrestricted_origins_block_readiness(): void
    {
        $this->validConfig();
        config(['app.debug' => true, 'app.url' => 'http://10.0.2.2:8000', 'reverb.apps.apps.0.allowed_origins' => ['*']]);
        $this->artisan('rchat:production-check')->expectsOutput('FAIL Debug disabled')->expectsOutput('FAIL HTTPS API URL with DNS hostname')->expectsOutput('FAIL Reverb origins explicitly restricted')->assertExitCode(1);
    }
}
