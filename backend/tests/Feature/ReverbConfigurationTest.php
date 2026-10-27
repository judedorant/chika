<?php

namespace Tests\Feature;

use App\Providers\AppServiceProvider;
use Tests\TestCase;

class ReverbConfigurationTest extends TestCase
{
    public function test_colon_in_public_reverb_key_is_rejected_before_signing(): void
    {
        config(['broadcasting.default' => 'reverb', 'broadcasting.connections.reverb.key' => 'invalid:key']);
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('colons break private-channel signatures');
        (new AppServiceProvider($this->app))->boot();
    }

    public function test_public_development_key_is_valid(): void
    {
        config(['broadcasting.default' => 'reverb', 'broadcasting.connections.reverb.key' => 'rchat-local_1', 'broadcasting.connections.reverb.secret' => str_repeat('a', 64)]);
        (new AppServiceProvider($this->app))->boot();
        $this->getJson('/api/v1/health')->assertOk();
    }

    public function test_missing_reverb_secret_is_rejected(): void
    {
        config(['broadcasting.default' => 'reverb', 'broadcasting.connections.reverb.key' => 'rchat-local', 'broadcasting.connections.reverb.secret' => '']);
        $this->expectException(\LogicException::class);
        $this->expectExceptionMessage('REVERB_APP_SECRET must be configured');
        (new AppServiceProvider($this->app))->boot();
    }
}
