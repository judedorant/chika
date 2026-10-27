<?php

namespace Tests\Feature;

use App\Events\ChatChanged;
use App\Jobs\SendMessagePush;
use App\Models\User;
use App\Services\ChatService;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

class TransactionTest extends TestCase
{
    use DatabaseMigrations;

    public function test_message_events_and_jobs_wait_for_commit(): void
    {
        Event::fake([ChatChanged::class]);
        Queue::fake();
        [$a, $b] = User::factory()->count(2)->create();
        $c = app(ChatService::class)->create($a, ['type' => 'private', 'participant_ids' => [$b->id]]);
        Event::fake([ChatChanged::class]);
        DB::beginTransaction();
        app(ChatService::class)->send($a, $c, ['body' => 'Atomic', 'client_message_id' => (string) Str::uuid()]);
        Event::assertNotDispatched(ChatChanged::class);
        Queue::assertPushed(SendMessagePush::class, fn ($job) => $job->afterCommit === true);
        DB::commit();
        Event::assertDispatched(ChatChanged::class);
        // Queue::fake records afterCommit jobs without invoking a broker.
        Queue::assertPushed(SendMessagePush::class);
    }

    public function test_rolled_back_messages_are_not_broadcast(): void
    {
        Event::fake([ChatChanged::class]);
        Queue::fake();
        [$a, $b] = User::factory()->count(2)->create();
        $c = app(ChatService::class)->create($a, ['type' => 'private', 'participant_ids' => [$b->id]]);
        Event::fake([ChatChanged::class]);
        DB::beginTransaction();
        app(ChatService::class)->send($a, $c, ['body' => 'Rollback', 'client_message_id' => (string) Str::uuid()]);
        DB::rollBack();
        Event::assertNotDispatched(ChatChanged::class);
        $this->assertDatabaseCount('messages', 0);
    }
}
