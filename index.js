// Thay thế hàm deleteCommandMessage hiện tại bằng phiên bản sau
async function deleteCommandMessage(message) {
  if (message.guild) {
    try {
      // Kiểm tra quyền của bot chính xác hơn
      const botMember = message.guild.members.cache.get(client.user.id);
      if (botMember && botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await message.delete();
        return true;
      } else {
        console.log('Bot không có quyền xóa tin nhắn');
        return false;
      }
    } catch (error) {
      console.error('Không thể xóa tin nhắn lệnh:', error);
      return false;
    }
  }
  return false;
}

// Thay đổi phần xử lý các lệnh để đảm bảo đợi xóa tin nhắn trước khi tiếp tục
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(' ');
  const command = args.shift().toLowerCase();

  if (command === 'hello') {
    try {
      // Xóa lệnh trước khi trả lời
      await deleteCommandMessage(message);
      await message.channel.send('lô cc!');
      return;
    } catch (error) {
      console.error('Lỗi khi xử lý lệnh hello:', error);
    }
  }

  // === LỆNH THONGBAO ===
  if (command === 'thongbao') {
    try {
      // Đảm bảo lệnh xóa tin nhắn hoàn thành trước khi tiếp tục
      const deleted = await deleteCommandMessage(message);
      
      // Kiểm tra quyền admin
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này! Cần có vai trò Admin.');
      }

      // Tiếp tục phần còn lại như trong code gốc...
      const points = parseInt(args[args.length - 1]);
      const deadline = args.slice(args.length - 3, args.length - 1).join(' ');
      const contentEndIndex = args.findLastIndex(arg => arg.match(/^<@!?(\d+)>$/)) + 1;
      const receiverTags = args.slice(contentEndIndex - args.slice(0, args.length - 3).filter(arg => arg.match(/^<@!?(\d+)>$/)).length, contentEndIndex);
      const receiverIds = receiverTags.map(tag => tag.match(/^<@!?(\d+)>$/)[1]);
      const contentWithTitle = args.slice(0, contentEndIndex - receiverTags.length).join(' ');

      // Phần code tiếp theo giữ nguyên...
    } catch (error) {
      console.error('Lỗi khi xử lý lệnh thongbao:', error);
    }
  }

  // Cập nhật tương tự cho các lệnh khác như baocao, duyet, tuchoi, resetnv
  // Mỗi lệnh nên được đặt trong try-catch và đảm bảo deleteCommandMessage được đợi hoàn thành

  // === LỆNH DIEM ===
  if (command === 'diem') {
    try {
      // Xóa lệnh trước khi trả lời
      await deleteCommandMessage(message);
      const userId = message.author.id;
      const userPoints = points[userId] || 0;
      await message.channel.send(`<@${userId}>, bạn hiện có ${userPoints} điểm.`);
    } catch (error) {
      console.error('Lỗi khi xử lý lệnh diem:', error);
    }
  }

  // === LỆNH HELP ===
  if (command === 'help') {
    try {
      // Xóa lệnh trước khi trả lời
      await deleteCommandMessage(message);
      const helpMessage = `
**Hướng dẫn sử dụng bot:**
\`!hello\` - Kiểm tra bot có hoạt động không
\`!thongbao NV12: Nội dung nhiệm vụ. @người_nhận1 @người_nhận2 YYYY-MM-DD HH:MM điểm\` - Tạo thông báo nhiệm vụ (chỉ dành cho Admin)
\`!baocao ID_nhiệm_vụ nội_dung_báo_cáo\` - Gửi báo cáo hoàn thành nhiệm vụ
\`!duyet ID_báo_cáo\` - Duyệt báo cáo (chỉ dành cho Admin)
\`!tuchoi ID_báo_cáo\` - Từ chối báo cáo (chỉ dành cho Admin)
\`!diem\` - Xem số điểm hiện có của bạn
\`!resetnv\` - Reset danh sách nhiệm vụ (chỉ dành cho Admin)
\`!resetnv from 10\` - Reset danh sách nhiệm vụ từ ID 10 trở đi (chỉ dành cho Admin)
`;
      await message.channel.send(helpMessage);
    } catch (error) {
      console.error('Lỗi khi xử lý lệnh help:', error);
    }
  }
});
