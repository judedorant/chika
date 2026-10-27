<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_devices', fn (Blueprint $table) => $table->foreignId('personal_access_token_id')->nullable()->constrained()->cascadeOnDelete());
    }

    public function down(): void
    {
        Schema::table('user_devices', function (Blueprint $table) {
            $table->dropForeign(['personal_access_token_id']);
            $table->dropColumn('personal_access_token_id');
        });
    }
};
