<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->enum('type', ['private', 'group']);
            $table->string('name')->nullable();
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
            // Canonical sorted user pair prevents concurrent duplicate private chats.
            $table->string('private_key', 64)->nullable()->unique();
            $table->timestamps();
        });
        Schema::create('conversation_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('role', ['owner', 'admin', 'member'])->default('member');
            $table->unsignedBigInteger('last_read_message_id')->nullable();
            $table->timestamp('joined_at')->useCurrent();
            $table->unique(['conversation_id', 'user_id']);
            $table->index(['user_id', 'conversation_id']);
        });
        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_id')->constrained('users')->restrictOnDelete();
            $table->uuid('client_message_id');
            $table->char('payload_hash', 64);
            $table->text('body')->nullable();
            $table->enum('message_type', ['text', 'image'])->default('text');
            $table->foreignId('reply_to_message_id')->nullable()->constrained('messages')->nullOnDelete();
            $table->timestamp('edited_at')->nullable();
            $table->softDeletes();
            $table->timestamps();
            $table->unique(['sender_id', 'client_message_id']);
            $table->index(['conversation_id', 'id']);
        });
        Schema::table('conversation_participants', function (Blueprint $table) {
            $table->foreign('last_read_message_id')->references('id')->on('messages')->nullOnDelete();
        });
        Schema::create('message_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained()->cascadeOnDelete();
            $table->string('file_path');
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('file_size');
        });
        Schema::create('message_receipts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('message_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->unique(['message_id', 'user_id']);
            $table->index(['user_id', 'read_at']);
        });
        Schema::create('user_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('push_token')->unique();
            $table->enum('platform', ['android', 'ios']);
            $table->timestamps();
        });
        Schema::create('blocked_users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('blocker_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('blocked_id')->constrained('users')->cascadeOnDelete();
            $table->unique(['blocker_id', 'blocked_id']);
        });
        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->text('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('personal_access_tokens');
        Schema::dropIfExists('blocked_users');
        Schema::dropIfExists('user_devices');
        Schema::dropIfExists('message_receipts');
        Schema::dropIfExists('message_attachments');
        Schema::table('conversation_participants', fn (Blueprint $table) => $table->dropForeign(['last_read_message_id']));
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversation_participants');
        Schema::dropIfExists('conversations');
    }
};
