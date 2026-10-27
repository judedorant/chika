<?php

namespace Tests\Feature;

use App\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Tests\TestCase;

class ProxyTrustTest extends TestCase
{
    public function test_untrusted_clients_cannot_spoof_https(): void
    {
        config(['deployment.trusted_proxies' => []]);
        $request = Request::create('http://api.rchat.app', 'GET', [], [], [], ['REMOTE_ADDR' => '203.0.113.5', 'HTTP_X_FORWARDED_PROTO' => 'https']);
        (new TrustProxies)->handle($request, function ($request) {
            $this->assertFalse($request->isSecure());
        });
    }

    public function test_configured_ingress_can_forward_https(): void
    {
        config(['deployment.trusted_proxies' => ['203.0.113.5']]);
        $request = Request::create('http://api.rchat.app', 'GET', [], [], [], ['REMOTE_ADDR' => '203.0.113.5', 'HTTP_X_FORWARDED_PROTO' => 'https']);
        (new TrustProxies)->handle($request, function ($request) {
            $this->assertTrue($request->isSecure());
        });
    }

    public function test_wildcard_proxy_trust_is_rejected(): void
    {
        config(['deployment.trusted_proxies' => ['*']]);
        $this->expectException(\LogicException::class);
        (new TrustProxies)->handle(Request::create('http://api.rchat.app'), fn () => null);
    }
}
