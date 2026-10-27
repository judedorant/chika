<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class MessageReceipt extends Model
{
    public $timestamps = false;
    protected $guarded = ['id'];
    protected function casts(): array { return ['delivered_at' => 'datetime', 'read_at' => 'datetime']; }
    public function message() { return $this->belongsTo(Message::class); }
    public function user() { return $this->belongsTo(User::class); }
}
