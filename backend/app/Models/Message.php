<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
class Message extends Model
{
    use SoftDeletes;
    protected $guarded = ['id'];
    protected $hidden = ['payload_hash'];
    protected function casts(): array { return ['edited_at' => 'datetime']; }
    public function conversation() { return $this->belongsTo(Conversation::class); }
    public function sender() { return $this->belongsTo(User::class, 'sender_id'); }
    public function attachments() { return $this->hasMany(MessageAttachment::class); }
    public function receipts() { return $this->hasMany(MessageReceipt::class); }
    public function replyTo() { return $this->belongsTo(Message::class, 'reply_to_message_id')->withTrashed(); }
}
