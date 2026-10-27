<?php
use Illuminate\Support\Facades\Route;
Route::prefix('v1')->group(function () {
    Route::get('health', fn () => ['service' => 'RChat', 'status' => 'ok', 'api_version' => 'v1']);
});
