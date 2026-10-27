<?php

namespace App\Http\Controllers;

use App\Http\Requests\AuthRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(AuthRequest $request)
    {
        return DB::transaction(function () use ($request) {
            $user = User::create($request->safe()->only(['name', 'email', 'password']));

            return response()->json(['user' => new UserResource($user), 'token' => $user->createToken($request->device_name, ['*'], now()->addDays(30))->plainTextToken], 201);
        });
    }

    public function login(AuthRequest $request)
    {
        $user = User::where('email', $request->email)->first();
        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages(['email' => ['The provided credentials are incorrect.']]);
        }

        return ['user' => new UserResource($user), 'token' => $user->createToken($request->device_name, ['*'], now()->addDays(30))->plainTextToken];
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->noContent();
    }

    public function revoke(Request $request)
    {
        $request->user()->tokens()->delete();

        return response()->noContent();
    }

    public function show(Request $request)
    {
        return new UserResource($request->user());
    }

    public function update(Request $request)
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100']]);
        $request->user()->update($data);

        return new UserResource($request->user());
    }

    public function password(Request $request)
    {
        $data = $request->validate(['current_password' => ['required', 'current_password:sanctum'], 'password' => ['required', 'confirmed', Password::min(12)->mixedCase()->numbers()]]);
        DB::transaction(function () use ($request, $data) {
            $request->user()->update(['password' => $data['password']]);
            $request->user()->tokens()->delete();
        });

        return response()->noContent();
    }

    public function avatar(Request $request)
    {
        $request->validate(['avatar' => ['required', 'file', 'image', 'mimes:jpeg,png,webp', 'max:2048', 'dimensions:max_width=2048,max_height=2048']]);
        $user = $request->user();
        $old = $user->avatar;
        $path = $request->file('avatar')->store('avatars/'.$user->id, 'local');
        try {
            $user->update(['avatar' => $path]);
        } catch (\Throwable $e) {
            Storage::disk('local')->delete($path);
            throw $e;
        }
        if ($old) {
            Storage::disk('local')->delete($old);
        }

        return new UserResource($user);
    }
}
