<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Laravel\Sanctum\PersonalAccessToken;

class UserDevice extends Model
{
    protected $guarded = ['id'];

    protected $hidden = ['push_token', 'personal_access_token_id'];

    public function accessToken()
    {
        return $this->belongsTo(PersonalAccessToken::class, 'personal_access_token_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
