<?php

return [
    // Explicit ingress IPs/CIDRs only. Never trust arbitrary forwarded headers.
    'trusted_proxies' => array_values(array_filter(array_map('trim', explode(',', env('TRUSTED_PROXIES', ''))))),
    'worker_timeout' => 90,
];
