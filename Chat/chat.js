function addChat(room, sender, message, bot = false) {
  const chatMessage = {
    sender_id: sender.user_id,
    sender_name: sender.name,
    sender_avatar: sender.avatar || null,
    bot,
    message
  };
  room.chat.push(chatMessage);
  return chatMessage;
}

module.exports = addChat;
