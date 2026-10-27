<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray($request): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'avatar' => $this->avatar ? url('/api/v1/users/'.$this->id.'/avatar') : null,
            'email' => $this->when($request->user()?->id === $this->id || $request->routeIs('auth.register', 'auth.login'), $this->email),
            'role' => $this->whenPivotLoaded('conversation_participants', fn () => $this->pivot->role)];
    }
}
