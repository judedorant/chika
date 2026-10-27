<?php

namespace App\Services;

use App\Events\ChatChanged;
use App\Jobs\SendMessagePush;
use App\Models\BlockedUser;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\MessageAttachment;
use App\Models\MessageReceipt;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ChatService
{
    public function notify(Conversation $conversation, string $kind, array $data = []): void
    {
        ChatChanged::dispatch($conversation->participants()->pluck('users.id')->all(), $conversation->id, $kind, $data);
    }

    public function create(User $user, array $data): Conversation
    {
        $ids = array_merge([$user->id], $data['participant_ids']);
        sort($ids, SORT_NUMERIC);

        return DB::transaction(function () use ($user, $data, $ids) {
            // Consistent user lock order serializes private chat creation and blocking.
            User::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
            foreach ($data['participant_ids'] as $id) {
                abort_if(BlockedUser::between($user->id, $id), 403, 'This user cannot be contacted.');
            }
            $key = $data['type'] === 'private' ? implode(':', $ids) : null;
            if ($key && ($existing = Conversation::where('private_key', $key)->first())) {
                return $existing;
            }
            $conversation = Conversation::create(['type' => $data['type'], 'name' => $data['type'] === 'group' ? $data['name'] : null, 'created_by' => $user->id, 'private_key' => $key]);
            foreach ($ids as $id) {
                $conversation->participants()->attach($id, ['role' => $id === $user->id ? 'owner' : 'member', 'joined_at' => now()]);
            }
            $this->notify($conversation, 'conversation');

            return $conversation;
        }, 3);
    }

    public function send(User $user, Conversation $conversation, array $data, ?UploadedFile $image = null): Message
    {
        $hash = hash('sha256', json_encode([$conversation->id, $data['body'] ?? null, isset($data['reply_to_message_id']) ? (int) $data['reply_to_message_id'] : null, $image ? hash_file('sha256', $image->getRealPath()) : null]));
        $storedPath = null;
        try {
            return DB::transaction(function () use ($user, $conversation, $data, $image, $hash, &$storedPath) {
                // All conversation writes acquire this lock before checking membership.
                $conversation = Conversation::whereKey($conversation->id)->lockForUpdate()->firstOrFail();
                Gate::forUser($user)->authorize('view', $conversation);
                if ($conversation->type === 'private') {
                    $ids = $conversation->participants()->pluck('users.id')->all();
                    User::whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get();
                    foreach ($ids as $id) {
                        abort_if(BlockedUser::between($user->id, $id), 403, 'This user cannot be contacted.');
                    }
                } else {
                    // The idempotency key is sender-scoped, including across groups.
                    User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                }
                $existing = Message::withTrashed()->where('sender_id', $user->id)->where('client_message_id', $data['client_message_id'])->first();
                if ($existing) {
                    abort_unless(hash_equals($existing->payload_hash, $hash), 409, 'Client message ID was already used for another payload.');

                    return $existing;
                }
                if (! empty($data['reply_to_message_id'])) {
                    $reply = Message::whereKey($data['reply_to_message_id'])->where('conversation_id', $conversation->id)->first();
                    if (! $reply) {
                        throw ValidationException::withMessages(['reply_to_message_id' => ['Reply must reference a visible message in this conversation.']]);
                    }
                }
                $message = $conversation->messages()->create([
                    'sender_id' => $user->id, 'client_message_id' => $data['client_message_id'], 'payload_hash' => $hash,
                    'body' => $data['body'] ?? null, 'message_type' => $image ? 'image' : 'text', 'reply_to_message_id' => $data['reply_to_message_id'] ?? null,
                ]);
                if ($image) {
                    $storedPath = $image->store('attachments/'.$conversation->id, 'local');
                    $message->attachments()->create(['file_path' => $storedPath, 'mime_type' => $image->getMimeType(), 'file_size' => $image->getSize()]);
                }
                foreach ($conversation->participants()->where('users.id', '!=', $user->id)->pluck('users.id') as $id) {
                    $message->receipts()->create(['user_id' => $id]);
                }
                $conversation->touch();
                $this->notify($conversation, 'message', ['message_id' => $message->id]);
                SendMessagePush::dispatch($message->id)->afterCommit();

                return $message;
            });
        } catch (\Throwable $e) {
            if ($storedPath && ! MessageAttachment::where('file_path', $storedPath)->exists()) {
                Storage::disk('local')->delete($storedPath);
            }
            throw $e;
        }
    }

    public function receipt(User $user, Message $message, bool $read): MessageReceipt
    {
        return DB::transaction(function () use ($user, $message, $read) {
            $conversation = Conversation::whereKey($message->conversation_id)->lockForUpdate()->firstOrFail();
            Gate::forUser($user)->authorize('view', $conversation);
            abort_if($message->sender_id === $user->id, 422, 'Senders do not acknowledge their own messages.');
            $receipt = MessageReceipt::where('message_id', $message->id)->where('user_id', $user->id)->firstOrFail();
            $receipt->delivered_at ??= now();
            if ($read) {
                $receipt->read_at ??= now();
                // Reading a message means all preceding messages have been seen.
                $prior = Message::withTrashed()->where('conversation_id', $conversation->id)->where('id', '<=', $message->id)->select('id');
                MessageReceipt::where('user_id', $user->id)->whereIn('message_id', $prior)->whereNull('read_at')->update(['read_at' => now(), 'delivered_at' => DB::raw('COALESCE(delivered_at, CURRENT_TIMESTAMP)')]);
                $member = ConversationParticipant::where('conversation_id', $conversation->id)->where('user_id', $user->id)->firstOrFail();
                $member->last_read_message_id = max($member->last_read_message_id ?? 0, $message->id);
                $member->save();
            }
            $receipt->save();
            $this->notify($conversation, 'receipt', ['message_id' => $message->id]);

            return $receipt;
        });
    }
}
