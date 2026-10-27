<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ConversationController;
use App\Http\Controllers\MessageController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('health', fn () => ['service' => 'RChat', 'status' => 'ok', 'api_version' => 'v1']);
    Route::middleware('throttle:auth')->group(function () {
        Route::post('auth/register', [AuthController::class, 'register'])->name('auth.register');
        Route::post('auth/login', [AuthController::class, 'login'])->name('auth.login');
    });
    Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::delete('auth/tokens', [AuthController::class, 'revoke']);
        Route::get('me', [AuthController::class, 'show']);
        Route::post('me/avatar', [AuthController::class, 'avatar']);
        Route::patch('me', [AuthController::class, 'update']);
        Route::put('me/password', [AuthController::class, 'password']);
        Route::post('me/heartbeat', [UserController::class, 'heartbeat']);
        Route::post('me/devices', [UserController::class, 'device']);
        Route::delete('me/devices', [UserController::class, 'forgetDevice']);
        Route::get('me/blocks', [UserController::class, 'blocks']);
        Route::get('users', [UserController::class, 'index']);
        Route::get('users/{user}/avatar', [UserController::class, 'avatar']);
        Route::get('users/{user}', [UserController::class, 'show']);
        Route::get('users/{user}/presence', [UserController::class, 'presence']);
        Route::post('users/{user}/block', [UserController::class, 'block']);
        Route::delete('users/{user}/block', [UserController::class, 'unblock']);
        Route::get('conversations', [ConversationController::class, 'index']);
        Route::post('conversations', [ConversationController::class, 'store']);
        Route::get('conversations/{conversation}', [ConversationController::class, 'show']);
        Route::patch('conversations/{conversation}', [ConversationController::class, 'update']);
        Route::post('conversations/{conversation}/participants', [ConversationController::class, 'add']);
        Route::delete('conversations/{conversation}/participants/{user}', [ConversationController::class, 'remove']);
        Route::post('conversations/{conversation}/typing', [UserController::class, 'typing'])->middleware('throttle:typing');
        Route::get('conversations/{conversation}/messages', [MessageController::class, 'index']);
        Route::post('conversations/{conversation}/messages', [MessageController::class, 'store'])->middleware('throttle:messages');
        Route::patch('messages/{message}', [MessageController::class, 'update']);
        Route::delete('messages/{message}', [MessageController::class, 'destroy']);
        Route::post('messages/{message}/delivered', [MessageController::class, 'delivered']);
        Route::post('messages/{message}/read', [MessageController::class, 'read']);
        Route::get('attachments/{attachment}', [MessageController::class, 'attachment']);
    });
});
