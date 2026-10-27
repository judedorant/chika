<?php

namespace App\Jobs;

use App\Models\UserDevice;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;

class CheckPushReceipt implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public string $ticketId, public int $deviceId) {}

    public function backoff(): array
    {
        return [60, 300];
    }

    public function handle(): void
    {
        $http = Http::timeout(15)->acceptJson();
        if ($token = config('services.expo.access_token')) {
            $http = $http->withToken($token);
        }
        $response = $http->post('https://exp.host/--/api/v2/push/getReceipts', ['ids' => [$this->ticketId]])->throw();
        $receipt = $response->json('data')[$this->ticketId] ?? null;
        if (! $receipt) {
            $this->release(300);

            return;
        }
        if (($receipt['details']['error'] ?? '') === 'DeviceNotRegistered') {
            UserDevice::whereKey($this->deviceId)->delete();
        }
    }
}
