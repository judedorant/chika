<?php

namespace App\Events;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

class ChatChanged implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public array $recipients, public int $conversation_id, public string $kind, public array $data = []) {}

    public function broadcastOn(): array
    {
        return array_map(fn ($id) => new PrivateChannel('users.'.$id), $this->recipients);
    }

    public function broadcastAs(): string
    {
        return 'chat.changed';
    }

    public function broadcastWith(): array
    {
        return ['conversation_id' => $this->conversation_id, 'kind' => $this->kind, 'data' => $this->data];
    }
}
