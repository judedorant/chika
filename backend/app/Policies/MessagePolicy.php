<?php
namespace App\Policies;
use App\Models\{Message, User};
class MessagePolicy
{
    public function view(User $user, Message $message): bool
    { return $user->can('view', $message->conversation); }
    public function update(User $user, Message $message): bool
    { return !$message->trashed() && $message->sender_id === $user->id && $this->view($user, $message); }
    public function delete(User $user, Message $message): bool
    { return $message->sender_id === $user->id && $this->view($user, $message); }
}
