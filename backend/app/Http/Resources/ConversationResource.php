<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class ConversationResource extends JsonResource
{
    public function toArray($request): array
    {
        return ['id' => $this->id, 'type' => $this->type, 'name' => $this->name, 'created_by' => $this->created_by,
            'participants' => UserResource::collection($this->whenLoaded('participants')),
            'latest_message' => new MessageResource($this->whenLoaded('latestMessage')),
            'unread_count' => (int) ($this->unread_count ?? 0), 'updated_at' => $this->updated_at?->toISOString()];
    }
}
