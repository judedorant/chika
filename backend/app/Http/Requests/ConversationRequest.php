<?php
namespace App\Http\Requests;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
class ConversationRequest extends FormRequest
{
    public function authorize(): bool { return true; }
    public function rules(): array
    {
        return [
            'type' => ['required', Rule::in(['private', 'group'])],
            'name' => ['required_if:type,group', 'nullable', 'string', 'max:100'],
            'participant_ids' => ['required', 'array', 'min:1', $this->type === 'private' ? 'max:1' : 'max:49'],
            'participant_ids.*' => ['required', 'integer', 'distinct', 'exists:users,id', Rule::notIn([$this->user()->id])],
        ];
    }
}
