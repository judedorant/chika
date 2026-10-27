<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class AuthRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $register = $this->routeIs('auth.register');

        return [
            'name' => [$register ? 'required' : 'sometimes', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:254', ...($register ? ['unique:users,email'] : [])],
            'password' => $register ? ['required', 'confirmed', Password::min(12)->mixedCase()->numbers()] : ['required', 'string', 'max:255'],
            'device_name' => ['required', 'string', 'max:100'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->email)) {
            $this->merge(['email' => strtolower(trim($this->email))]);
        }
    }
}
