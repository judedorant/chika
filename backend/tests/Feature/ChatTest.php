<?php

namespace Tests\Feature;

use App\Events\ChatChanged;
use App\Jobs\SendMessagePush;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Services\ChatService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChatTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake([ChatChanged::class]);
        Queue::fake();
    }

    private function pair(): array
    {
        [$a, $b] = User::factory()->count(2)->create();
        $c = app(ChatService::class)->create($a, ['type' => 'private', 'participant_ids' => [$b->id]]);

        return [$a, $b, $c];
    }

    private function send(User $user, Conversation $conversation, array $extra = [])
    {
        Sanctum::actingAs($user);

        return $this->postJson('/api/v1/conversations/'.$conversation->id.'/messages', array_merge(['body' => 'Hello', 'client_message_id' => (string) Str::uuid()], $extra));
    }

    public function test_registration_login_and_token_revocation(): void
    {
        $payload = ['name' => 'Jude', 'email' => 'JUDE@example.test', 'password' => 'StrongPassword123', 'password_confirmation' => 'StrongPassword123', 'device_name' => 'Android'];
        $token = $this->postJson('/api/v1/auth/register', $payload)->assertCreated()->assertJsonMissingPath('user.password')->json('token');
        $this->postJson('/api/v1/auth/login', ['email' => 'jude@example.test', 'password' => 'wrong', 'device_name' => 'Android'])->assertUnprocessable();
        $this->postJson('/api/v1/auth/login', array_merge($payload, ['email' => 'jude@example.test']))->assertOk()->assertJsonStructure(['token', 'user']);
        $this->withToken($token)->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->assertDatabaseCount('personal_access_tokens', 1);
    }

    public function test_unauthenticated_requests_are_rejected(): void
    {
        $this->getJson('/api/v1/conversations')->assertUnauthorized();
    }

    public function test_private_conversation_creation_is_canonical(): void
    {
        [$a, $b, $c] = $this->pair();
        $again = app(ChatService::class)->create($b, ['type' => 'private', 'participant_ids' => [$a->id]]);
        $this->assertSame($c->id, $again->id);
        $this->assertDatabaseCount('conversations', 1);
    }

    public function test_private_messages_are_persisted_and_retry_safe(): void
    {
        [$a, $b, $c] = $this->pair();
        $uuid = (string) Str::uuid();
        $first = $this->send($a, $c, ['client_message_id' => $uuid])->assertCreated()->json('data.id');
        $this->send($a, $c, ['client_message_id' => $uuid])->assertOk()->assertJsonPath('data.id', $first);
        $this->send($a, $c, ['client_message_id' => $uuid, 'body' => 'Changed'])->assertConflict();
        $this->assertDatabaseCount('messages', 1);
        $this->assertDatabaseCount('message_receipts', 1);
        Queue::assertPushed(SendMessagePush::class, 1);
    }

    public function test_nonparticipants_cannot_read_send_or_download(): void
    {
        [$a, $b, $c] = $this->pair();
        Storage::fake('local');
        $this->send($a, $c, ['image' => UploadedFile::fake()->image('photo.png')])->assertCreated();
        $outsider = User::factory()->create();
        Sanctum::actingAs($outsider);
        $this->getJson('/api/v1/conversations/'.$c->id.'/messages')->assertForbidden();
        $this->send($outsider, $c)->assertForbidden();
        $this->getJson('/api/v1/attachments/1')->assertForbidden();
        Sanctum::actingAs($b);
        $this->get('/api/v1/attachments/1')->assertOk();
    }

    public function test_only_sender_can_edit_delete_and_reply_stays_in_conversation(): void
    {
        [$a, $b, $c] = $this->pair();
        $id = $this->send($a, $c)->json('data.id');
        Sanctum::actingAs($b);
        $this->patchJson('/api/v1/messages/'.$id, ['body' => 'hack'])->assertForbidden();
        $this->deleteJson('/api/v1/messages/'.$id)->assertForbidden();
        $this->send($b, $c, ['reply_to_message_id' => $id])->assertCreated();
        $other = app(ChatService::class)->create($a, ['type' => 'group', 'name' => 'Other', 'participant_ids' => [$b->id]]);
        $this->send($a, $other, ['reply_to_message_id' => $id])->assertUnprocessable();
        Sanctum::actingAs($a);
        $this->patchJson('/api/v1/messages/'.$id, ['body' => 'edited'])->assertOk()->assertJsonPath('data.body', 'edited');
        $this->deleteJson('/api/v1/messages/'.$id)->assertNoContent();
        $this->getJson('/api/v1/conversations/'.$c->id.'/messages')->assertOk()->assertJsonPath('data.1.body', null);
        $this->assertSoftDeleted('messages', ['id' => $id]);
    }

    public function test_read_and_delivery_receipts_are_monotonic_and_unread_counts_match(): void
    {
        [$a, $b, $c] = $this->pair();
        $first = $this->send($a, $c)->json('data.id');
        $second = $this->send($a, $c)->json('data.id');
        Sanctum::actingAs($b);
        $this->getJson('/api/v1/conversations')->assertJsonPath('data.0.unread_count', 2);
        $this->postJson('/api/v1/messages/'.$second.'/read')->assertOk();
        $this->postJson('/api/v1/messages/'.$first.'/delivered')->assertOk();
        $this->postJson('/api/v1/messages/'.$first.'/read')->assertOk();
        $this->assertDatabaseHas('conversation_participants', ['user_id' => $b->id, 'last_read_message_id' => $second]);
        $this->getJson('/api/v1/conversations')->assertJsonPath('data.0.unread_count', 0);
        $this->assertNotNull(Message::find($first)->receipts()->first()->read_at);
        Sanctum::actingAs($a);
        $this->postJson('/api/v1/messages/'.$first.'/read')->assertUnprocessable();
    }

    public function test_group_management_requires_owner_and_removal_revokes_access(): void
    {
        [$a, $b] = User::factory()->count(2)->create();
        $c = app(ChatService::class)->create($a, ['type' => 'group', 'name' => 'Team', 'participant_ids' => [$b->id]]);
        $this->send($b, $c)->assertCreated();
        Sanctum::actingAs($b);
        $this->patchJson('/api/v1/conversations/'.$c->id, ['name' => 'hack'])->assertForbidden();
        Sanctum::actingAs($a);
        $this->postJson('/api/v1/conversations/'.$c->id.'/participants', ['user_id' => $a->id])->assertNoContent();
        $this->assertDatabaseHas('conversation_participants', ['conversation_id' => $c->id, 'user_id' => $a->id, 'role' => 'owner']);
        $this->deleteJson('/api/v1/conversations/'.$c->id.'/participants/'.$a->id)->assertUnprocessable();
        $this->deleteJson('/api/v1/conversations/'.$c->id.'/participants/'.$b->id)->assertNoContent();
        $this->send($b, $c)->assertForbidden();
        $this->getJson('/api/v1/conversations/'.$c->id.'/messages')->assertForbidden();
    }

    public function test_blocking_prevents_private_messages_and_typing(): void
    {
        [$a, $b, $c] = $this->pair();
        Sanctum::actingAs($b);
        $this->postJson('/api/v1/users/'.$a->id.'/block')->assertNoContent();
        $this->send($a, $c)->assertForbidden();
        $this->postJson('/api/v1/conversations/'.$c->id.'/typing')->assertForbidden();
        $this->getJson('/api/v1/users/'.$b->id.'/presence')->assertForbidden();
    }

    public function test_channel_authorization_is_user_scoped(): void
    {
        config(['broadcasting.default' => 'reverb', 'broadcasting.connections.reverb.key' => 'test-key', 'broadcasting.connections.reverb.secret' => 'test-secret', 'broadcasting.connections.reverb.app_id' => 'test']);
        require base_path('routes/channels.php');
        [$a, $b] = User::factory()->count(2)->create();
        Sanctum::actingAs($a);
        $this->postJson('/api/v1/broadcasting/auth', ['socket_id' => '1.2', 'channel_name' => 'private-users.'.$a->id])->assertOk();
        $this->postJson('/api/v1/broadcasting/auth', ['socket_id' => '1.2', 'channel_name' => 'private-users.'.$b->id])->assertForbidden();
    }

    public function test_image_validation_rejects_executable_uploads(): void
    {
        [$a, $b, $c] = $this->pair();
        $this->send($a, $c, ['image' => UploadedFile::fake()->create('malware.php', 1, 'text/plain')])->assertUnprocessable();
    }

    public function test_message_history_uses_cursor_pagination(): void
    {
        [$a, $b, $c] = $this->pair();
        for ($i = 0; $i < 32; $i++) {
            app(ChatService::class)->send($a, $c, ['client_message_id' => (string) Str::uuid(), 'body' => 'Message '.$i]);
        }
        Sanctum::actingAs($b);
        $page = $this->getJson('/api/v1/conversations/'.$c->id.'/messages')->assertOk()->assertJsonCount(30, 'data');
        $this->getJson($page->json('links.next'))->assertOk()->assertJsonCount(2, 'data');
    }
}
