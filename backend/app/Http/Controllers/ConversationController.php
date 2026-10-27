<?php

namespace App\Http\Controllers;

use App\Events\ChatChanged;
use App\Http\Requests\ConversationRequest;
use App\Http\Resources\ConversationResource;
use App\Models\BlockedUser;
use App\Models\Conversation;
use App\Models\User;
use App\Services\ChatService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class ConversationController extends Controller
{
    public function index(Request $request)
    {
        $uid = $request->user()->id;
        $query = Conversation::whereHas('participants', fn ($q) => $q->where('users.id', $uid))
            ->with(['participants', 'latestMessage.sender', 'latestMessage.attachments'])
            ->select('conversations.*')->selectRaw('(SELECT COUNT(*) FROM messages m WHERE m.conversation_id = conversations.id AND m.sender_id != ? AND m.deleted_at IS NULL AND m.id > COALESCE((SELECT cp.last_read_message_id FROM conversation_participants cp WHERE cp.conversation_id = conversations.id AND cp.user_id = ?), 0)) AS unread_count', [$uid, $uid]);

        return ConversationResource::collection($query->orderByDesc('updated_at')->orderByDesc('id')->paginate(25));
    }

    public function store(ConversationRequest $request, ChatService $chat)
    {
        return new ConversationResource($chat->create($request->user(), $request->validated())->load('participants'));
    }

    public function show(Conversation $conversation)
    {
        Gate::authorize('view', $conversation);

        return new ConversationResource($conversation->load('participants'));
    }

    public function update(Request $request, Conversation $conversation, ChatService $chat)
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100']]);
        DB::transaction(function () use ($conversation, $data, $chat) {
            $conversation = Conversation::whereKey($conversation->id)->lockForUpdate()->firstOrFail();
            Gate::authorize('update', $conversation);
            $conversation->update($data);
            $chat->notify($conversation, 'conversation');
        });

        return new ConversationResource($conversation->fresh()->load('participants'));
    }

    public function add(Request $request, Conversation $conversation, ChatService $chat)
    {
        $data = $request->validate(['user_id' => ['required', 'integer', 'exists:users,id']]);
        DB::transaction(function () use ($request, $conversation, $data, $chat) {
            $conversation = Conversation::whereKey($conversation->id)->lockForUpdate()->firstOrFail();
            Gate::authorize('update', $conversation);
            abort_if($conversation->participants()->count() >= 50, 422, 'Group limit is 50 members.');
            abort_if(BlockedUser::between($request->user()->id, $data['user_id']), 403);
            if (! $conversation->participants()->where('users.id', $data['user_id'])->exists()) {
                $conversation->participants()->attach($data['user_id'], ['role' => 'member', 'joined_at' => now(), 'last_read_message_id' => $conversation->messages()->withTrashed()->max('id')]);
            }
            $chat->notify($conversation, 'conversation');
        });

        return response()->noContent();
    }

    public function remove(Request $request, Conversation $conversation, User $user, ChatService $chat)
    {
        DB::transaction(function () use ($conversation, $user, $chat) {
            $conversation = Conversation::whereKey($conversation->id)->lockForUpdate()->firstOrFail();
            Gate::authorize('update', $conversation);
            abort_if($user->id === $conversation->created_by, 422, 'The owner cannot be removed.');
            $conversation->participants()->detach($user->id);
            ChatChanged::dispatch([$user->id], $conversation->id, 'removed');
            $chat->notify($conversation, 'conversation');
        });

        return response()->noContent();
    }
}
