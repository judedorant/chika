<?php

namespace App\Http\Controllers;

use App\Http\Resources\UserResource;
use App\Models\BlockedUser;
use App\Models\Conversation;
use App\Models\User;
use App\Models\UserDevice;
use App\Services\ChatService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $data = $request->validate(['q' => ['required', 'string', 'min:2', 'max:100']]);

        return UserResource::collection(User::whereKeyNot($request->user()->id)->where('name', 'like', str_replace(['%', '_'], ['\\%', '\\_'], $data['q']).'%')
            ->whereDoesntHave('blockedBy', fn ($q) => $q->where('users.id', $request->user()->id))
            ->whereDoesntHave('blockedUsers', fn ($q) => $q->where('users.id', $request->user()->id))->orderBy('id')->paginate(25));
    }

    public function show(Request $request, User $user)
    {
        $this->shared($request, $user);

        return new UserResource($user);
    }

    public function blocks(Request $request)
    {
        return UserResource::collection($request->user()->blockedUsers()->paginate(25));
    }

    public function block(Request $request, User $user)
    {
        abort_if($user->id === $request->user()->id, 422);
        DB::transaction(function () use ($request, $user) {
            User::whereIn('id', [$request->user()->id, $user->id])->orderBy('id')->lockForUpdate()->get();
            BlockedUser::firstOrCreate(['blocker_id' => $request->user()->id, 'blocked_id' => $user->id]);
        });

        return response()->noContent();
    }

    public function unblock(Request $request, User $user)
    {
        $request->user()->blockedUsers()->detach($user->id);

        return response()->noContent();
    }

    public function heartbeat(Request $request)
    {
        Cache::put('presence:'.$request->user()->id, true, 75);

        return response()->noContent();
    }

    public function presence(Request $request, User $user)
    {
        $this->shared($request, $user);

        return ['online' => Cache::has('presence:'.$user->id)];
    }

    private function shared(Request $request, User $user): void
    {
        abort_if(BlockedUser::between($request->user()->id, $user->id), 403);
        abort_unless($user->id === $request->user()->id || Conversation::whereHas('participants', fn ($q) => $q->where('users.id', $request->user()->id))->whereHas('participants', fn ($q) => $q->where('users.id', $user->id))->exists(), 403);
    }

    public function typing(Request $request, Conversation $conversation, ChatService $chat)
    {
        Gate::authorize('view', $conversation);
        if ($conversation->type === 'private') {
            foreach ($conversation->participants()->pluck('users.id') as $id) {
                abort_if(BlockedUser::between($request->user()->id, $id), 403);
            }
        }
        $key = 'typing:'.$conversation->id.':'.$request->user()->id;
        if (Cache::add($key, true, 3)) {
            $chat->notify($conversation, 'typing', ['user_id' => $request->user()->id, 'name' => $request->user()->name]);
        }

        return response()->noContent();
    }

    public function device(Request $request)
    {
        $data = $request->validate(['push_token' => ['required', 'string', 'max:255', 'regex:/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/'], 'platform' => ['required', 'in:android,ios']]);
        // A physical installation may change accounts; token ownership follows login.
        UserDevice::updateOrCreate(['push_token' => $data['push_token']], ['user_id' => $request->user()->id, 'platform' => $data['platform'], 'personal_access_token_id' => $request->user()->currentAccessToken()->getKey()]);

        return response()->noContent();
    }

    public function forgetDevice(Request $request)
    {
        $data = $request->validate(['push_token' => ['required', 'string']]);
        $request->user()->devices()->where('push_token', $data['push_token'])->delete();

        return response()->noContent();
    }

    public function avatar(Request $request, User $user)
    {
        $this->shared($request, $user);
        abort_unless($user->avatar && Storage::disk('local')->exists($user->avatar), 404);

        return Storage::disk('local')->response($user->avatar, null, ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }
}
