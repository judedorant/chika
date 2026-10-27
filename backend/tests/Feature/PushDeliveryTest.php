<?php

namespace Tests\Feature;

use App\Events\ChatChanged;
use App\Jobs\SendMessagePush;
use App\Models\User;
use App\Services\ChatService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

class PushDeliveryTest extends TestCase
{
    use RefreshDatabase;

    public function test_accepted_push_tickets_are_not_sent_again_on_retry(): void
    {
        config(['cache.default' => 'array']);
        Event::fake([ChatChanged::class]);
        Queue::fake();
        [$sender, $recipient] = User::factory()->count(2)->create();
        $chat = app(ChatService::class);
        $conversation = $chat->create($sender, ['type' => 'private', 'participant_ids' => [$recipient->id]]);
        $message = $chat->send($sender, $conversation, ['body' => 'Private text', 'client_message_id' => (string) Str::uuid()]);
        $token = $recipient->createToken('Push test');
        foreach (['first', 'second'] as $name) {
            $recipient->devices()->create(['push_token' => 'ExpoPushToken['.$name.']', 'platform' => 'android', 'personal_access_token_id' => $token->accessToken->id]);
        }
        Http::fakeSequence()->push(['data' => [
            ['status' => 'error', 'details' => ['error' => 'InvalidCredentials']],
            ['status' => 'ok', 'id' => 'ticket-accepted'],
        ]])->push(['data' => [['status' => 'ok', 'id' => 'ticket-retry']]]);
        $job = new SendMessagePush($message->id);
        try {
            $job->handle();
            $this->fail('An unaccepted device must fail for retry rather than silently succeed.');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('retained for retry', $error->getMessage());
        }
        $job->handle();
        $job->handle();
        Http::assertSentCount(2);
        $requests = Http::recorded();
        $this->assertCount(1, $requests[1][0]->data());
        $payload = $requests[1][0]->data()[0];
        $this->assertSame('ExpoPushToken[first]', $payload['to']);
        $this->assertSame($recipient->id, $payload['data']['recipient_user_id']);
        $this->assertSame($message->id, $payload['data']['message_id']);
        $this->assertStringNotContainsString('Private text', $requests[1][0]->body());
    }
}
