<?php
namespace App\Http\Resources;
use Illuminate\Http\Resources\Json\JsonResource;
class MessageResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id, 'conversation_id' => $this->conversation_id, 'sender_id' => $this->sender_id,
            'client_message_id' => $this->client_message_id, 'body' => $this->trashed() ? null : $this->body,
            'message_type' => $this->message_type, 'reply_to_message_id' => $this->reply_to_message_id,
            'created_at' => $this->created_at?->toISOString(), 'updated_at' => $this->updated_at?->toISOString(),
            'edited_at' => $this->edited_at?->toISOString(), 'deleted_at' => $this->deleted_at?->toISOString(),
            'sender' => new UserResource($this->whenLoaded('sender')),
            'attachments' => $this->trashed() ? [] : $this->whenLoaded('attachments', fn () => $this->attachments->map(fn ($a) => [
                'id' => $a->id, 'mime_type' => $a->mime_type, 'file_size' => $a->file_size,
                'url' => url('/api/v1/attachments/'.$a->id),
            ])),
            'receipts' => $this->whenLoaded('receipts', fn () => $this->receipts->map(fn ($r) => [
                'user_id' => $r->user_id, 'delivered_at' => $r->delivered_at?->toISOString(), 'read_at' => $r->read_at?->toISOString(),
            ])),
        ];
    }
}
