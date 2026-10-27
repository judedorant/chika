<?php

namespace App\Jobs;

use App\Models\Message;
use App\Models\UserDevice;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

class SendMessagePush implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public int $messageId) {}

    public function backoff(): array
    {
        return [10, 60, 180];
    }

    public function middleware(): array
    {
        return [(new WithoutOverlapping('message-push:'.$this->messageId))->releaseAfter(10)->expireAfter(120)];
    }

    private function deliveryKey(UserDevice $device): string
    {
        return 'push-ticket:'.$this->messageId.':'.$device->id.':'.hash('sha256', $device->push_token);
    }

    public function handle(): void
    {
        $message = Message::with('conversation.participants')->find($this->messageId);
        if (! $message || $message->created_at->lt(now()->subDay())) {
            return;
        }
        $ids = $message->conversation->participants->pluck('id')->reject(fn ($id) => $id === $message->sender_id);
        $devices = UserDevice::whereHas('accessToken', fn ($q) => $q->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now())))->whereIn('user_id', $ids)->whereHas('user', fn ($q) => $q->whereHas('receipts', fn ($q) => $q->where('message_id', $message->id)->whereNull('read_at')))->get();
        foreach ($devices->chunk(100) as $chunk) {
            $chunk = $chunk->reject(fn ($device) => Cache::has($this->deliveryKey($device)))->values();
            if ($chunk->isEmpty()) {
                continue;
            }
            $http = Http::timeout(15)->acceptJson();
            if ($token = config('services.expo.access_token')) {
                $http = $http->withToken($token);
            }
            $response = $http->post('https://exp.host/--/api/v2/push/send', $chunk->map(fn ($device) => [
                'to' => $device->push_token, 'title' => 'RChat', 'body' => 'You have a new message.',
                'sound' => 'default', 'channelId' => 'messages', 'ttl' => 3600,
                'data' => ['conversation_id' => $message->conversation_id, 'message_id' => $message->id, 'recipient_user_id' => $device->user_id],
            ])->values()->all())->throw();
            $tickets = $response->json('data', []);
            $retry = false;
            foreach ($chunk->values() as $index => $device) {
                $ticket = $tickets[$index] ?? [];
                if (($ticket['details']['error'] ?? '') === 'DeviceNotRegistered') {
                    $device->delete();
                }
                if (($ticket['status'] ?? '') === 'ok' && isset($ticket['id'])) {
                    Cache::put($this->deliveryKey($device), $ticket['id'], now()->addDays(7));
                    CheckPushReceipt::dispatch($ticket['id'], $device->id)->delay(now()->addMinutes(15));
                }
                if (! (($ticket['status'] ?? '') === 'ok' && ! empty($ticket['id'])) && ($ticket['details']['error'] ?? '') !== 'DeviceNotRegistered') {
                    $retry = true;
                }
            }
            if ($retry) {
                throw new \RuntimeException('Push provider did not accept every notification; accepted tickets are retained for retry deduplication.');
            }
        }
    }
}
