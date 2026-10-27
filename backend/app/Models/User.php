<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = ['name', 'email', 'password', 'avatar'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return ['password' => 'hashed', 'email_verified_at' => 'datetime'];
    }

    public function conversations()
    {
        return $this->belongsToMany(Conversation::class, 'conversation_participants')->withPivot(['role', 'last_read_message_id', 'joined_at']);
    }

    public function messages()
    {
        return $this->hasMany(Message::class, 'sender_id');
    }

    public function devices()
    {
        return $this->hasMany(UserDevice::class);
    }

    public function blockedUsers()
    {
        return $this->belongsToMany(User::class, 'blocked_users', 'blocker_id', 'blocked_id');
    }

    public function blockedBy()
    {
        return $this->belongsToMany(User::class, 'blocked_users', 'blocked_id', 'blocker_id');
    }

    public function receipts()
    {
        return $this->hasMany(MessageReceipt::class);
    }
}
