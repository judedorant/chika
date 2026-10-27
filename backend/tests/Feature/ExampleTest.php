<?php

namespace Tests\Feature;

use Tests\TestCase;

class ExampleTest extends TestCase
{
    public function test_versioned_health_endpoint_is_available_without_authentication(): void
    {
        $this->getJson('/api/v1/health')->assertOk()->assertJson(['service' => 'RChat', 'status' => 'ok', 'api_version' => 'v1']);
    }
}
