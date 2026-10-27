<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class MessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('view', $this->route('conversation'));
    }

    public function rules(): array
    {
        return [
            'client_message_id' => ['required', 'uuid'],
            'body' => ['nullable', 'string', 'max:5000', 'required_without:image'],
            'reply_to_message_id' => ['nullable', 'integer', 'exists:messages,id'],
            'image' => ['nullable', 'file', 'image', 'mimes:jpeg,png,webp', 'max:5120', 'dimensions:max_width=4096,max_height=4096'],
        ];
    }
}
