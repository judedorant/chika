<?php

namespace Database\Seeders;

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new \RuntimeException('Demo seeding is restricted to local/testing environments.');
        }
        $password = env('DEMO_PASSWORD');
        if (! $password || strlen($password) < 12) {
            throw new \RuntimeException('Set DEMO_PASSWORD to a local-only password of at least 12 characters.');
        }
        $users = collect(['Jude', 'Alex', 'Sam'])->map(fn ($name) => User::firstOrCreate(['email' => strtolower($name).'@rchat.test'], ['name' => $name, 'password' => $password]));
        if (Conversation::exists()) {
            return;
        }
        $conversation = Conversation::create(['type' => 'group', 'name' => 'RChat local team', 'created_by' => $users[0]->id]);
        foreach ($users as $index => $user) {
            $conversation->participants()->attach($user->id, ['role' => $index === 0 ? 'owner' : 'member', 'joined_at' => now()]);
        }
        foreach ($users as $user) {
            $message = $conversation->messages()->create(['sender_id' => $user->id, 'client_message_id' => Str::uuid(), 'payload_hash' => hash('sha256', Str::random()), 'body' => 'Hello from '.$user->name.' — this message is stored in the local database.', 'message_type' => 'text']);
            foreach ($users->where('id', '!=', $user->id) as $recipient) {
                $message->receipts()->create(['user_id' => $recipient->id]);
            }
        }
    }
}
