<?php

namespace Tests\Feature;

use App\Events\ChatChanged;
use App\Jobs\SendMessagePush;
use App\Models\User;
use App\Services\ChatService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class AccountSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_password_change_revokes_all_tokens_and_push_devices(): void
    {
        $user = User::factory()->create(['password' => 'StrongPassword123']);
        $token = $user->createToken('Android');
        $user->createToken('Other device');
        $this->withToken($token->plainTextToken)->postJson('/api/v1/me/devices', ['push_token' => 'ExpoPushToken[test]', 'platform' => 'android'])->assertNoContent();
        $this->withToken($token->plainTextToken)->putJson('/api/v1/me/password', ['current_password' => 'wrong', 'password' => 'OtherPassword123', 'password_confirmation' => 'OtherPassword123'])->assertUnprocessable();
        $this->putJson('/api/v1/me/password', ['current_password' => 'StrongPassword123', 'password' => 'OtherPassword123', 'password_confirmation' => 'OtherPassword123'])->assertNoContent();
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseCount('user_devices', 0);
    }

    public function test_logout_only_revokes_the_current_device(): void
    {
        $user = User::factory()->create();
        $a = $user->createToken('A');
        $b = $user->createToken('B');
        $user->devices()->create(['push_token' => 'ExpoPushToken[a]', 'platform' => 'android', 'personal_access_token_id' => $a->accessToken->id]);
        $user->devices()->create(['push_token' => 'ExpoPushToken[b]', 'platform' => 'android', 'personal_access_token_id' => $b->accessToken->id]);
        $this->withToken($a->plainTextToken)->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->assertDatabaseCount('user_devices', 1);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $b->accessToken->id]);
    }

    public function test_avatar_files_are_not_publicly_accessible(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();
        $outsider = User::factory()->create();
        $token = $user->createToken('Android')->plainTextToken;
        $this->withToken($token)->postJson('/api/v1/me/avatar', ['avatar' => UploadedFile::fake()->image('avatar.png')])->assertOk()->assertJsonPath('data.avatar', url('/api/v1/users/'.$user->id.'/avatar'));
        $this->get('/api/v1/users/'.$user->id.'/avatar')->assertOk();
        // Clear the per-request guard cache before switching token identity in this test.
        app('auth')->forgetGuards();
        $this->withToken($outsider->createToken('Other')->plainTextToken)->getJson('/api/v1/users/'.$user->id.'/avatar')->assertForbidden();
    }

    public function test_push_job_sends_real_provider_payload_and_removes_invalid_devices(): void
    {
        Queue::fake();
        Event::fake([ChatChanged::class]);
        [$a, $b] = User::factory()->count(2)->create();
        $c = app(ChatService::class)->create($a, ['type' => 'private', 'participant_ids' => [$b->id]]);
        $message = app(ChatService::class)->send($a, $c, ['body' => 'Secret content', 'client_message_id' => (string) Str::uuid()]);
        $token = $b->createToken('Android');
        $b->devices()->create(['push_token' => 'ExpoPushToken[test]', 'platform' => 'android', 'personal_access_token_id' => $token->accessToken->id]);
        Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'error', 'details' => ['error' => 'DeviceNotRegistered']]]])]);
        (new SendMessagePush($message->id))->handle();
        Http::assertSent(fn ($request) => $request[0]['body'] === 'You have a new message.' && ! str_contains($request->body(), 'Secret content'));
        $this->assertDatabaseCount('user_devices', 0);
    }
}
