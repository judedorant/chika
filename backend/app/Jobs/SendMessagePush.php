<?php

namespace App\Jobs;

use App\Models\Message;
use App\Models\UserDevice;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
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

    public function handle(): void
    {
        $message = Message::with('conversation.participants')->find($this->messageId);
        if (! $message) {
            return;
        }
        $ids = $message->conversation->participants->pluck('id')->reject(fn ($id) => $id === $message->sender_id);
        $devices = UserDevice::whereHas('accessToken', fn ($q) => $q->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now())))->whereIn('user_id', $ids)->whereHas('user', fn ($q) => $q->whereHas('receipts', fn ($q) => $q->where('message_id', $message->id)->whereNull('read_at')))->get();
        foreach ($devices->chunk(100) as $chunk) {
            $http = Http::timeout(15)->acceptJson();
            if ($token = config('services.expo.access_token')) {
                $http = $http->withToken($token);
            }
            $response = $http->post('https://exp.host/--/api/v2/push/send', $chunk->map(fn ($device) => [
                'to' => $device->push_token, 'title' => 'RChat', 'body' => 'You have a new message.',
                'sound' => 'default', 'channelId' => 'messages', 'data' => ['conversation_id' => $message->conversation_id],
            ])->values()->all())->throw();
            $tickets = $response->json('data', []);
            foreach ($chunk->values() as $index => $device) {
                $ticket = $tickets[$index] ?? [];
                if (($ticket['details']['error'] ?? '') === 'DeviceNotRegistered') {
                    $device->delete();
                }
                if (($ticket['status'] ?? '') === 'ok' && isset($ticket['id'])) {
                    CheckPushReceipt::dispatch($ticket['id'], $device->id)->delay(now()->addMinutes(15));
                }
                if (($ticket['details']['error'] ?? '') === 'MessageRateExceeded') {
                    throw new \RuntimeException('Push provider rate limited delivery.');
                }
            }
        }
    }
}
