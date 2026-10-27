<?php

namespace App\Http\Controllers;

use App\Http\Requests\MessageRequest;
use App\Http\Resources\MessageResource;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\MessageAttachment;
use App\Services\ChatService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

class MessageController extends Controller
{
    public function index(Request $request, Conversation $conversation)
    {
        Gate::authorize('view', $conversation);
        $request->validate(['cursor' => ['nullable', 'string', 'max:1000']]);

        return MessageResource::collection($conversation->messages()->withTrashed()->with(['sender', 'attachments', 'receipts'])->orderByDesc('id')->cursorPaginate(30));
    }

    public function store(MessageRequest $request, Conversation $conversation, ChatService $chat)
    {
        $message = $chat->send($request->user(), $conversation, $request->validated(), $request->file('image'));

        return (new MessageResource($message->load(['sender', 'attachments', 'receipts'])))->response()->setStatusCode($message->wasRecentlyCreated ? 201 : 200);
    }

    public function update(Request $request, Message $message, ChatService $chat)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);
        DB::transaction(function () use ($message, $data, $chat) {
            $conversation = Conversation::whereKey($message->conversation_id)->lockForUpdate()->firstOrFail();
            $message = Message::whereKey($message->id)->firstOrFail();
            Gate::authorize('update', $message);
            $message->update(['body' => $data['body'], 'edited_at' => now()]);
            $chat->notify($conversation, 'message', ['message_id' => $message->id]);
        });

        return new MessageResource($message->fresh()->load(['sender', 'attachments', 'receipts']));
    }

    public function destroy(Message $message, ChatService $chat)
    {
        DB::transaction(function () use ($message, $chat) {
            $conversation = Conversation::whereKey($message->conversation_id)->lockForUpdate()->firstOrFail();
            Gate::authorize('delete', $message);
            $message->update(['body' => null]);
            $message->delete();
            $chat->notify($conversation, 'message', ['message_id' => $message->id]);
        });

        return response()->noContent();
    }

    public function read(Request $request, Message $message, ChatService $chat)
    {
        return $chat->receipt($request->user(), $message, true);
    }

    public function delivered(Request $request, Message $message, ChatService $chat)
    {
        return $chat->receipt($request->user(), $message, false);
    }

    public function attachment(MessageAttachment $attachment)
    {
        $message = $attachment->message;
        abort_unless($message, 404);
        Gate::authorize('view', $message);
        abort_unless(Storage::disk('local')->exists($attachment->file_path), 404);

        return Storage::disk('local')->response($attachment->file_path, null, ['Content-Type' => $attachment->mime_type, 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }
}
