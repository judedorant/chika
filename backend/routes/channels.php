<?php

use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('users.{id}', fn (User $user, int $id) => $user->id === $id);
// Conversation data is delivered through user channels. Membership is always
// rechecked by REST; a removed member cannot keep reading a stale subscription.
