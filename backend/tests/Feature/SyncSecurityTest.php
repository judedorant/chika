<?php

namespace Tests\Feature;

use App\Events\ChatChanged;
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

class SyncSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Event::fake([ChatChanged::class]);
        Queue::fake();
    }

    public function test_uuid_cannot_be_reused_across_groups_or_after_deletion(): void
    {
        [$a, $b] = User::factory()->count(2)->create();
        $chat = app(ChatService::class);
        $first = $chat->create($a, ['type' => 'group', 'name' => 'First', 'participant_ids' => [$b->id]]);
        $second = $chat->create($a, ['type' => 'group', 'name' => 'Second', 'participant_ids' => [$b->id]]);
        Sanctum::actingAs($a);
        $payload = ['client_message_id' => (string) Str::uuid(), 'body' => 'Original'];
        $id = $this->postJson('/api/v1/conversations/'.$first->id.'/messages', $payload)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/conversations/'.$second->id.'/messages', $payload)->assertConflict();
        $this->deleteJson('/api/v1/messages/'.$id)->assertNoContent();
        $this->postJson('/api/v1/conversations/'.$first->id.'/messages', $payload)->assertOk()->assertJsonPath('data.id', $id)->assertJsonPath('data.body', null);
        $this->assertDatabaseCount('messages', 1);
    }

    public function test_removal_and_deletion_revoke_attachment_access(): void
    {
        Storage::fake('local');
        [$a, $b] = User::factory()->count(2)->create();
        $c = app(ChatService::class)->create($a, ['type' => 'group', 'name' => 'Photos', 'participant_ids' => [$b->id]]);
        Sanctum::actingAs($a);
        $result = $this->postJson('/api/v1/conversations/'.$c->id.'/messages', ['client_message_id' => (string) Str::uuid(), 'image' => UploadedFile::fake()->image('photo.png')])->assertCreated();
        $attachment = $result->json('data.attachments.0.id');
        $message = $result->json('data.id');
        Sanctum::actingAs($b);
        $this->get('/api/v1/attachments/'.$attachment)->assertOk();
        Sanctum::actingAs($a);
        $this->deleteJson('/api/v1/conversations/'.$c->id.'/participants/'.$b->id)->assertNoContent();
        Sanctum::actingAs($b);
        $this->getJson('/api/v1/attachments/'.$attachment)->assertForbidden();
        Sanctum::actingAs($a);
        $this->deleteJson('/api/v1/messages/'.$message)->assertNoContent();
        $this->getJson('/api/v1/attachments/'.$attachment)->assertNotFound();
    }

    public function test_group_join_starts_unread_pointer_at_latest_message(): void
    {
        [$a, $b, $new] = User::factory()->count(3)->create();
        $chat = app(ChatService::class);
        $c = $chat->create($a, ['type' => 'group', 'name' => 'Team', 'participant_ids' => [$b->id]]);
        $chat->send($a, $c, ['client_message_id' => (string) Str::uuid(), 'body' => 'Before join']);
        Sanctum::actingAs($a);
        $this->postJson('/api/v1/conversations/'.$c->id.'/participants', ['user_id' => $new->id])->assertNoContent();
        Sanctum::actingAs($new);
        $this->getJson('/api/v1/conversations')->assertJsonPath('data.0.unread_count', 0);
        $this->getJson('/api/v1/conversations/'.$c->id.'/messages')->assertJsonCount(1, 'data');
        $chat->send($a, $c, ['client_message_id' => (string) Str::uuid(), 'body' => 'After join']);
        $this->getJson('/api/v1/conversations')->assertJsonPath('data.0.unread_count', 1);
    }

    public function test_presence_expires_and_search_does_not_leak_email(): void
    {
        // Carbon time travel cannot advance a real Redis server's clock.
        config(['cache.default' => 'array']);
        [$a, $b] = User::factory()->count(2)->create(['name' => 'Searchable']);
        app(ChatService::class)->create($a, ['type' => 'private', 'participant_ids' => [$b->id]]);
        Sanctum::actingAs($b);
        $this->postJson('/api/v1/me/heartbeat')->assertNoContent();
        Sanctum::actingAs($a);
        $this->getJson('/api/v1/users/'.$b->id.'/presence')->assertJsonPath('online', true);
        $this->travel(76)->seconds();
        $this->getJson('/api/v1/users/'.$b->id.'/presence')->assertJsonPath('online', false);
        $this->getJson('/api/v1/users?q=Search')->assertOk()->assertJsonMissingPath('data.0.email');
        $this->postJson('/api/v1/users/'.$b->id.'/block')->assertNoContent();
        $this->getJson('/api/v1/users?q=Search')->assertJsonCount(0, 'data');
    }
}
