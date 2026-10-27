<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class UserDevice extends Model
{
    protected $guarded = ['id'];
    protected $hidden = ['push_token'];
    public function user() { return $this->belongsTo(User::class); }
}
