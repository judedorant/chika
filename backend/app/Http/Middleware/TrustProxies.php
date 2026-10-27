<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;

class TrustProxies extends \Illuminate\Http\Middleware\TrustProxies
{
    protected $headers = Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_HOST | Request::HEADER_X_FORWARDED_PORT | Request::HEADER_X_FORWARDED_PROTO;

    protected function setTrustedProxyIpAddresses(Request $request)
    {
        $proxies = config('deployment.trusted_proxies', []);
        foreach ($proxies as $proxy) {
            if (str_contains($proxy, '*') || str_ends_with($proxy, '/0') || ! filter_var(explode('/', $proxy)[0], FILTER_VALIDATE_IP)) {
                throw new \LogicException('TRUSTED_PROXIES must list explicit ingress IPs or CIDRs.');
            }
        }
        $this->setTrustedProxyIpAddressesToSpecificIps($request, $proxies);
    }
}
