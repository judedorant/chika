<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class MessageAttachment extends Model
{
    public $timestamps = false;
    protected $guarded = ['id'];
    protected $hidden = ['file_path'];
    public function message() { return $this->belongsTo(Message::class); }
}
