<?php
namespace App\Policies;
use App\Models\{Conversation, User};
class ConversationPolicy
{
    public function view(User $user, Conversation $conversation): bool
    { return $conversation->participants()->where('users.id', $user->id)->exists(); }
    public function update(User $user, Conversation $conversation): bool
    { return $conversation->type === 'group' && $conversation->memberships()->where('user_id', $user->id)->whereIn('role', ['owner', 'admin'])->exists(); }
}
