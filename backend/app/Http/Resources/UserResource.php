<?php
namespace App\Http\Resources;
use Illuminate\Http\Resources\Json\JsonResource;
class UserResource extends JsonResource
{
    public function toArray($request): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'avatar' => $this->avatar,
            'email' => $this->when($request->user()?->id === $this->id, $this->email),
            'role' => $this->whenPivotLoaded('conversation_participants', fn () => $this->pivot->role)];
    }
}
