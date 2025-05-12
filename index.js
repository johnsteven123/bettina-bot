const { Client, IntentsBitField, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const express = require('express');
const app = express();
require('dotenv').config();

// Thêm config cho ID kênh
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID || '1360306086338625749';
const REPORT_CHANNEL_ID = process.env.REPORT_CHANNEL_ID || '1360306086338625749';

// Tên của các role có quyền quản trị
const ADMIN_ROLE_NAME = process.env.ADMIN_ROLE_NAME || '【Chủ tịch】';
// Tên các role có quyền sử dụng lệnh báo cáo và nhận nhiệm vụ
const ALLOWED_ROLE_NAMES = ['┠Phó chủ tịch┤', '┠Ban điều hành ┤'];

// ===== Khởi tạo client trước khi sử dụng =====
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

// ===== Khởi tạo Express server =====
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(3000, () => {
  console.log('Web server running on port 3000');
});

// ===== Khởi tạo dữ liệu =====
let announcements = [];
let reports = [];
let points = {};

// ===== Khởi tạo các file nếu chưa tồn tại =====
if (!fs.existsSync('announcements.json')) fs.writeFileSync('announcements.json', '[]');
if (!fs.existsSync('reports.json')) fs.writeFileSync('reports.json', '[]');
if (!fs.existsSync('points.json')) fs.writeFileSync('points.json', '{}');

// ===== Load dữ liệu từ file =====
try {
  const announcementsData = fs.readFileSync('announcements.json', 'utf-8');
  const reportsData = fs.readFileSync('reports.json', 'utf-8');
  const pointsData = fs.readFileSync('points.json', 'utf-8');

  if (announcementsData) announcements.push(...JSON.parse(announcementsData));
  if (reportsData) reports = JSON.parse(reportsData);
  if (pointsData) points = JSON.parse(pointsData);
  
  console.log('Loaded data successfully');
} catch (error) {
  console.error('Error loading data:', error);
}

// ===== Event khi bot sẵn sàng =====
client.on('ready', () => {
  console.log(`Bot đã sẵn sàng với tên ${client.user.tag}`);
  
  checkChannels();
  
  console.log('Running initial deadline check...');
  checkDeadlines();
});

// ===== CÁC HÀM TIỆN ÍCH =====

// Hàm kiểm tra các kênh có tồn tại không
function checkChannels() {
  client.guilds.cache.forEach(guild => {
    const announceChannel = guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
    const reportChannel = guild.channels.cache.get(REPORT_CHANNEL_ID);
    
    if (!announceChannel) {
      console.warn(`⚠️ Không tìm thấy kênh thông báo với ID ${ANNOUNCEMENT_CHANNEL_ID} trong server ${guild.name}`);
    } else {
      const botMember = guild.members.cache.get(client.user.id);
      if (!botMember.permissionsIn(announceChannel).has(PermissionFlagsBits.SendMessages)) {
        console.warn(`⚠️ Bot không có quyền gửi tin nhắn trong kênh thông báo ${ANNOUNCEMENT_CHANNEL_ID}`);
      }
    }
    
    if (!reportChannel) {
      console.warn(`⚠️ Không tìm thấy kênh báo cáo với ID ${REPORT_CHANNEL_ID} trong server ${guild.name}`);
    } else {
      const botMember = guild.members.cache.get(client.user.id);
      if (!botMember.permissionsIn(reportChannel).has(PermissionFlagsBits.SendMessages)) {
        console.warn(`⚠️ Bot không có quyền gửi tin nhắn trong kênh báo cáo ${REPORT_CHANNEL_ID}`);
      }
    }
  });
}

// Hàm kiểm tra người dùng có vai trò admin không
function hasAdminRole(member) {
  return member.roles.cache.some(role => 
    role.name === ADMIN_ROLE_NAME || 
    role.permissions.has(PermissionFlagsBits.Administrator)
  );
}

// Hàm kiểm tra người dùng có vai trò được phép không
function hasAllowedRole(member) {
  return member.roles.cache.some(role => 
    ALLOWED_ROLE_NAMES.includes(role.name) || 
    role.name === ADMIN_ROLE_NAME || 
    role.permissions.has(PermissionFlagsBits.Administrator)
  );
}

// Hàm gửi tin nhắn riêng tư hoặc tin nhắn tạm thời
async function sendPrivateOrTempMessage(user, channel, content) {
  try {
    await user.send(content);
  } catch (dmError) {
    try {
      const tempMsg = await channel.send(`${content} (Tin nhắn này sẽ tự xóa sau 5 giây)`);
      setTimeout(() => tempMsg.delete().catch(() => {}), 5000);
    } catch (channelError) {
      console.error('Không thể gửi tin nhắn vào kênh:', channelError);
    }
  }
}

// Hàm xóa tin nhắn lệnh nếu có quyền
async function deleteCommandMessage(message) {
  if (message.guild) {
    try {
      const botMember = message.guild.members.cache.get(client.user.id);
      if (botMember && botMember.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await message.delete();
        return true;
      } else {
        console.log('Bot không có quyền xóa tin nhắn trong kênh này');
        return false;
      }
    } catch (error) {
      console.error('Không thể xóa tin nhắn lệnh:', error);
      return false;
    }
  }
  return false;
}

// ===== XỬ LÝ TIN NHẮN =====
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(' ');
  const command = args.shift().toLowerCase();

  try {
    // ===== LỆNH HELLO =====
    if (command === 'hello') {
      await deleteCommandMessage(message);
      await message.channel.send('lô cc!');
      return;
    }

    // ===== LỆNH THONGBAO =====
    if (command === 'thongbao') {
      await deleteCommandMessage(message);
      
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này! Cần có vai trò Admin.');
      }

      const points = parseInt(args[args.length - 1]);
      const deadline = args.slice(args.length - 3, args.length - 1).join(' ');
      
      const mentionMatches = args.filter(arg => arg.match(/^<@[!&]?(\d+)>$/));
      const contentEndIndex = args.findIndex(arg => arg.match(/^<@[!&]?(\d+)>$/)) + mentionMatches.length;
      
      const receiverTags = mentionMatches.filter(tag => tag.match(/^<@!?(\d+)>$/));
      const roleTags = mentionMatches.filter(tag => tag.match(/^<@&(\d+)>$/));
      
      const receiverIds = receiverTags.map(tag => tag.match(/^<@!?(\d+)>$/)[1]);
      const roleIds = roleTags.map(tag => tag.match(/^<@&(\d+)>$/)[1]);
      
      const contentWithTitle = args.slice(0, args.findIndex(arg => arg.match(/^<@[!&]?(\d+)>$/)) || args.length).join(' ');
      
      if (!contentWithTitle || !deadline || isNaN(points) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(deadline)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Vui lòng nhập đúng cú pháp! Ví dụ: !thongbao NV12: Nội dung nhiệm vụ. @username1 @role1 2023-10-25 14:00 50');
      }

      const titleMatch = contentWithTitle.match(/^NV(\d+):/);
      if (!titleMatch) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Tiêu đề phải bắt đầu bằng NVXXX: (ví dụ: NV12:)');
      }
      
      const taskNumber = titleMatch[1];
      const formattedTaskNumber = `NV${taskNumber.padStart(3, '0')}`;
      
      const content = contentWithTitle.slice(titleMatch[0].length).trim();
      if (!content.endsWith('.')) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Nội dung nhiệm vụ phải kết thúc bằng dấu chấm!');
      }

      let announcementChannel = message.guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || 
                              message.guild.channels.cache.find(ch => ch.name === 'thong-bao');
      if (!announcementChannel) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Không tìm thấy kênh thông báo!');
      }
      
      let allReceiverIds = [...receiverIds];
      if (roleIds.length > 0) {
        for (const roleId of roleIds) {
          const role = message.guild.roles.cache.get(roleId);
          if (role) {
            const membersWithRole = role.members.map(member => member.id);
            allReceiverIds = [...allReceiverIds, ...membersWithRole];
          }
        }
      }
      
      allReceiverIds = [...new Set(allReceiverIds)];
      
      const announcement = {
        id: parseInt(taskNumber),
        content,
        points,
        author: message.author.id,
        receivers: allReceiverIds,
        roleReceivers: roleIds,
        deadline: new Date(deadline).getTime(),
        created: Date.now(),
        messageId: null,
        isProcessed: false,
      };

      try {
        announcements.push(announcement);
        fs.writeFileSync('announcements.json', JSON.stringify(announcements));
      } catch (error) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Có lỗi khi lưu thông báo!');
      }

      let mentionText = '';
      if (receiverIds.length === 0) {
        mentionText += `Người nhận: Bất kỳ`;
      } else {
        mentionText += `Người nhận: ${receiverIds.map(id => `<@${id}>`).join(', ')}`;
      }
      if (roleIds.length > 0) {
        if (mentionText) mentionText += '\n';
        mentionText += `Role nhận: ${roleIds.map(id => `<@&${id}>`).join(', ')}`;
      }

      let statusLine = '';
      if (receiverIds.length === 0 && roleIds.length > 0) {
        statusLine = '\n**Tình trạng**: Chưa có người nhận';
      }

      const announcementMessage = `${formattedTaskNumber}\n${content}\nSố điểm: ${points}\n${mentionText}\nDeadline: ${deadline}${statusLine}`;

      try {
        const sentMessage = await announcementChannel.send(announcementMessage);
        announcement.messageId = sentMessage.id;
        fs.writeFileSync('announcements.json', JSON.stringify(announcements));
        sendPrivateOrTempMessage(message.author, message.channel, 'Thông báo đã được gửi thành công!');
      } catch (error) {
        console.error('Lỗi khi gửi thông báo:', error);
        sendPrivateOrTempMessage(message.author, message.channel, 'Có lỗi khi gửi thông báo!');
      }
    }

    // ===== LỆNH BAOCAO =====
    if (command === 'baocao') {
      await deleteCommandMessage(message);
      
      if (!hasAllowedRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền gửi báo cáo!');
      }

      const announcementId = parseInt(args[0]);
      const content = args.slice(1).join(' ');
      if (isNaN(announcementId) || !content) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Vui lòng nhập ID thông báo và nội dung báo cáo!');
      }

      if (content.length > 5000) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Báo cáo không được vượt quá 5000 chữ!');
      }

      const announcement = announcements.find(a => a.id === announcementId);
      if (!announcement) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Thông báo không tồn tại!');
      }

      if (announcement.deadline && Date.now() > announcement.deadline) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Thông báo đã hết hạn!');
      }

      if (announcement.acceptedBy && announcement.acceptedBy !== message.author.id) {
        return sendPrivateOrTempMessage(message.author, message.channel, `Nhiệm vụ này đã được <@${announcement.acceptedBy}> nhận.`);
      } else if (!announcement.acceptedBy) {
        const isDirectReceiver = announcement.receivers.includes(message.author.id);
        const isRoleReceiver = announcement.roleReceivers && announcement.roleReceivers.some(roleId => 
          message.member.roles.cache.has(roleId)
        );
        
        if (!isDirectReceiver && !isRoleReceiver) {
          return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không phải là người nhận của thông báo này!');
        }
      }

      let reportChannel = message.guild.channels.cache.get(REPORT_CHANNEL_ID) || 
                        message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
      if (!reportChannel) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Không tìm thấy kênh báo cáo!');
      }

      const report = {
        id: Date.now(),
        announcementId,
        content,
        author: message.author.id,
        status: 'pending',
      };
      
      reports.push(report);
      fs.writeFileSync('reports.json', JSON.stringify(reports));

      await reportChannel.send(`**Báo cáo từ ${message.author.tag}** (ID: ${report.id}, Thông báo ID: ${announcementId})\n${content}\n**Trạng thái**: Đang chờ duyệt`);
      sendPrivateOrTempMessage(message.author, message.channel, 'Báo cáo của bạn đã được gửi và đang chờ duyệt!');
    }

    // ===== LỆNH DUYET =====
    if (command === 'duyet') {
      await deleteCommandMessage(message);
      
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này!');
      }

      const reportId = parseInt(args[0]);
      reports = JSON.parse(fs.readFileSync('reports.json', 'utf-8') || '[]');
      const report = reports.find(r => r.id === reportId);
      if (!report || report.status !== 'pending') {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Báo cáo không tồn tại hoặc đã được xử lý!');
      }

      const announcement = announcements.find(a => a.id === report.announcementId);
      if (!announcement) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Thông báo không tồn tại!');
      }

      if (announcement.deadline && Date.now() > announcement.deadline) {
        report.status = 'rejected';
        fs.writeFileSync('reports.json', JSON.stringify(reports));
        let reportChannel = message.guild.channels.cache.get(REPORT_CHANNEL_ID) || 
                          message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
        if (!reportChannel) {
          return sendPrivateOrTempMessage(message.author, message.channel, 'Không tìm thấy kênh báo cáo!');
        }
        await reportChannel.send(`Báo cáo ID ${reportId} đã bị **tự động từ chối** vì thông báo đã hết hạn!`);
        return sendPrivateOrTempMessage(message.author, message.channel, 'Thông báo đã hết hạn!');
      }

      report.status = 'approved';
      fs.writeFileSync('reports.json', JSON.stringify(reports));

      points = JSON.parse(fs.readFileSync('points.json', 'utf-8') || '{}');
      points[report.author] = (points[report.author] || 0) + announcement.points;
      
      try {
        fs.writeFileSync('points.json', JSON.stringify(points));
      } catch (error) {
        console.error('Lỗi khi lưu điểm:', error);
        return sendPrivateOrTempMessage(message.author, message.channel, 'Lỗi khi lưu điểm, vui lòng thử lại!');
      }

      let reportChannel = message.guild.channels.cache.get(REPORT_CHANNEL_ID) || 
                        message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
      if (!reportChannel) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Không tìm thấy kênh báo cáo!');
      }
      
      await reportChannel.send(`Báo cáo ID ${reportId} đã được **duyệt** bởi ${message.author.tag}! Đã cộng ${announcement.points} điểm cho <@${report.author}>.`);
      sendPrivateOrTempMessage(message.author, message.channel, 'Đã duyệt báo cáo!');
    }

    // ===== LỆNH TUCHOI =====
    if (command === 'tuchoi') {
      await deleteCommandMessage(message);
      
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này!');
      }

      const reportId = parseInt(args[0]);
      reports = JSON.parse(fs.readFileSync('reports.json', 'utf-8') || '[]');
      const report = reports.find(r => r.id === reportId);
      if (!report || report.status !== 'pending') {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Báo cáo không tồn tại hoặc đã được xử lý!');
      }

      report.status = 'rejected';
      fs.writeFileSync('reports.json', JSON.stringify(reports));

      let reportChannel = message.guild.channels.cache.get(REPORT_CHANNEL_ID) || 
                        message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
      if (!reportChannel) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Không tìm thấy kênh báo cáo!');
      }
      
      await reportChannel.send(`Báo cáo ID ${reportId} đã bị **từ chối** bởi ${message.author.tag}!`);
      sendPrivateOrTempMessage(message.author, message.channel, 'Đã từ chối báo cáo!');
    }

    // ===== LỆNH DIEM =====
    if (command === 'diem') {
      await deleteCommandMessage(message);
      
      const userId = message.author.id;
      const userPoints = points[userId] || 0;
      
      await message.channel.send(`<@${userId}>, bạn hiện có ${userPoints} điểm.`);
    }

    // ===== LỆNH XOANHIEMVU =====
    if (command === 'xoanhiemvu') {
      await deleteCommandMessage(message);
      
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này!');
      }

      const announcementId = parseInt(args[0]);
      if (isNaN(announcementId)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Vui lòng nhập ID nhiệm vụ muốn xóa! Ví dụ: !xoanhiemvu 123');
      }

      const announcementIndex = announcements.findIndex(a => a.id === announcementId);
      if (announcementIndex === -1) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Nhiệm vụ không tồn tại!');
      }

      const announcement = announcements[announcementIndex];
      if (announcement.messageId) {
        const announcementChannel = message.guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || 
                                  message.guild.channels.cache.find(ch => ch.name === 'thong-bao');
        if (announcementChannel) {
          try {
            await announcementChannel.messages.delete(announcement.messageId);
          } catch (error) {
            console.error('Lỗi khi xóa tin nhắn thông báo:', error);
          }
        }
      }

      announcements.splice(announcementIndex, 1);
      try {
        fs.writeFileSync('announcements.json', JSON.stringify(announcements));
        sendPrivateOrTempMessage(message.author, message.channel, `Đã xóa nhiệm vụ NV${announcementId.toString().padStart(3, '0')} thành công!`);
      } catch (error) {
        console.error('Lỗi khi xóa nhiệm vụ:', error);
        sendPrivateOrTempMessage(message.author, message.channel, 'Lỗi khi xóa nhiệm vụ, vui lòng thử lại!');
      }
    }

    // ===== LỆNH HELP =====
    if (command === 'help') {
      await deleteCommandMessage(message);
      
      const helpMessage = `
**Hướng dẫn sử dụng bot:**

**Lệnh chung:**
\`!help\` - Hiển thị danh sách các lệnh hỗ trợ
\`!hello\` - Kiểm tra bot có hoạt động không
\`!diem\` - Xem số điểm hiện có của bạn
\`!bangdiem\` - Xem bảng điểm theo role (dành cho Phó chủ tịch, Ban điều hành hoặc Admin)

**Lệnh nhiệm vụ:**
\`!thongbao NV12: Nội dung nhiệm vụ. @người_nhận1 @role1 YYYY-MM-DD HH:MM điểm\` - Tạo thông báo nhiệm vụ (chỉ dành cho Admin)
\`!nhannhiemvu ID_nhiệm_vụ\` - Nhận nhiệm vụ được giao cho role của bạn (dành cho Phó chủ tịch và Ban điều hành)
\`!baocao ID_nhiệm_vụ nội_dung_báo_cáo\` - Gửi báo cáo hoàn thành nhiệm vụ (dành cho người nhận nhiệm vụ)
\`!duyet ID_báo_cáo\` - Duyệt báo cáo (chỉ dành cho Admin)
\`!tuchoi ID_báo_cáo\` - Từ chối báo cáo (chỉ dành cho Admin)

**Lệnh quản lý (Admin):**
\`!diemdanh @người_dùng điểm\` - Cộng điểm cho người dùng
\`!suadiem @người_dùng điểm\` - Sửa điểm của người dùng
\`!xoanhiemvu ID_nhiệm_vụ\` - Xóa nhiệm vụ cụ thể theo ID (dùng để test thông báo)

**Cơ chế tự động:**
- Nếu nhiệm vụ giao cho **một người cụ thể** và trễ deadline mà chưa báo cáo, hệ thống sẽ tự động trừ điểm của người đó (số điểm trừ = điểm nhiệm vụ).
- Nếu nhiệm vụ giao cho **bất kỳ ai** (chỉ định role mà không có người cụ thể):
  - Nếu chưa có người nhận và trễ deadline, hệ thống sẽ trừ điểm tất cả thành viên trong role **┠Phó chủ tịch┤** và **┠Ban điều hành ┤** (số điểm trừ = điểm nhiệm vụ).
  - Nếu đã có người nhận và trễ deadline mà chưa báo cáo, chỉ người nhận nhiệm vụ bị trừ điểm.
`;
      await message.channel.send(helpMessage);
    }

    // ===== LỆNH BANGDIEM =====
    if (command === 'bangdiem') {
      await deleteCommandMessage(message);
      
      if (!hasAllowedRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này!');
      }
      
      try {
        const roleScores = {};
        const guild = message.guild;
        
        const userIds = Object.keys(points);
        
        for (const userId of userIds) {
          const member = await guild.members.fetch(userId).catch(() => null);
          
          if (member) {
            const highestRole = member.roles.highest;
            
            if (!roleScores[highestRole.id]) {
              roleScores[highestRole.id] = {
                name: highestRole.name,
                totalPoints: 0,
                members: []
              };
            }
            
            roleScores[highestRole.id].totalPoints += (points[userId] || 0);
            roleScores[highestRole.id].members.push({
              id: userId,
              tag: member.user.tag,
              points: points[userId] || 0
            });
          }
        }
        
        const sortedRoles = Object.values(roleScores).sort((a, b) => b.totalPoints - a.totalPoints);
        
        let bangdiemMessage = '**Bảng Điểm Theo Role**\n\n';
        
        if (sortedRoles.length === 0) {
          bangdiemMessage += 'Hiện chưa có dữ liệu điểm.';
        } else {
          sortedRoles.forEach((role, index) => {
            bangdiemMessage += `**${index + 1}. ${role.name}** - ${role.totalPoints} điểm\n`;
            
            const sortedMembers = role.members.sort((a, b) => b.points - a.points);
            
            sortedMembers.forEach((member, memberIndex) => {
              bangdiemMessage += `   ${memberIndex + 1}. <@${member.id}> - ${member.points} điểm\n`;
            });
            
            bangdiemMessage += '\n';
          });
        }
        
        await message.channel.send(bangdiemMessage);
      } catch (error) {
        console.error('Lỗi khi hiển thị bảng điểm:', error);
        sendPrivateOrTempMessage(message.author, message.channel, 'Đã xảy ra lỗi khi tạo bảng điểm.');
      }
    }

    // ===== LỆNH DIEMDANH =====
    if (command === 'diemdanh') {
      await deleteCommandMessage(message);
      
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này!');
      }
      
      if (args.length < 2 || !args[0].match(/^<@!?(\d+)>$/) || isNaN(parseInt(args[1]))) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Vui lòng nhập đúng cú pháp! Ví dụ: !diemdanh @username 50');
      }
      
      const userId = args[0].match(/^<@!?(\d+)>$/)[1];
      const pointsToAdd = parseInt(args[1]);
      
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (!member) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Người dùng không tồn tại trong server!');
      }
      
      try {
        points = JSON.parse(fs.readFileSync('points.json', 'utf-8') || '{}');
        points[userId] = (points[userId] || 0) + pointsToAdd;
        fs.writeFileSync('points.json', JSON.stringify(points));
        
        await message.channel.send(`Đã cập nhật ${pointsToAdd} điểm cho <@${userId}>. Tổng điểm hiện tại: ${points[userId]}.`);
      } catch (error) {
        console.error('Lỗi khi cập nhật điểm:', error);
        sendPrivateOrTempMessage(message.author, message.channel, 'Đã xảy ra lỗi khi cập nhật điểm.');
      }
    }

    // ===== LỆNH SUADIEM =====
    if (command === 'suadiem') {
      await deleteCommandMessage(message);
      
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này!');
      }
      
      if (args.length < 2 || !args[0].match(/^<@!?(\d+)>$/) || isNaN(parseInt(args[1]))) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Vui lòng nhập đúng cú pháp! Ví dụ: !suadiem @username 100');
      }
      
      const userId = args[0].match(/^<@!?(\d+)>$/)[1];
      const newPoints = parseInt(args[1]);
      
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (!member) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Người dùng không tồn tại trong server!');
      }
      
      try {
        points = JSON.parse(fs.readFileSync('points.json', 'utf-8') || '{}');
        const oldPoints = points[userId] || 0;
        points[userId] = newPoints;
        fs.writeFileSync('points.json', JSON.stringify(points));
        
        await message.channel.send(`Đã sửa điểm của <@${userId}> từ ${oldPoints} thành ${newPoints}.`);
      } catch (error) {
        console.error('Lỗi khi sửa điểm:', error);
        sendPrivateOrTempMessage(message.author, message.channel, 'Đã xảy ra lỗi khi sửa điểm.');
      }
    }

    // ===== LỆNH NHANNHIEMVU =====
    if (command === 'nhannhiemvu') {
      await deleteCommandMessage(message);
      
      const isPCT = message.member.roles.cache.some(role => role.name === '┠Phó chủ tịch┤');
      const isBDH = message.member.roles.cache.some(role => role.name === '┠Ban điều hành ┤');
      
      if (!isPCT && !isBDH && !hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền nhận nhiệm vụ!');
      }

      const announcementId = parseInt(args[0]);
      if (isNaN(announcementId)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Vui lòng nhập ID nhiệm vụ! Ví dụ: !nhannhiemvu 123');
      }

      const announcement = announcements.find(a => a.id === announcementId);
      if (!announcement) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Nhiệm vụ không tồn tại!');
      }

      const allowedRoleIds = announcement.roleReceivers || [];
      const isInAssignedRole = message.member.roles.cache.some(role => allowedRoleIds.includes(role.id));
      
      if (!isInAssignedRole) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Nhiệm vụ này không dành cho role của bạn!');
      }

      if (announcement.deadline && Date.now() > announcement.deadline) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Nhiệm vụ này đã hết hạn!');
      }

      if (announcement.acceptedBy) {
        if (announcement.acceptedBy === message.author.id) {
          return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn đã nhận nhiệm vụ này rồi!');
        } else {
          return sendPrivateOrTempMessage(message.author, message.channel, `Nhiệm vụ này đã được <@${announcement.acceptedBy}> nhận!`);
        }
      }

      announcement.acceptedBy = message.author.id;
      announcement.acceptedAt = Date.now();
      
      try {
        fs.writeFileSync('announcements.json', JSON.stringify(announcements));
      } catch (error) {
        console.error('Lỗi khi lưu dữ liệu nhận nhiệm vụ:', error);
        return sendPrivateOrTempMessage(message.author, message.channel, 'Có lỗi xảy ra, không thể nhận nhiệm vụ!');
      }

      const announcementChannel = message.guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || 
                                message.guild.channels.cache.find(ch => ch.name === 'thong-bao');
      if (announcementChannel && announcement.messageId) {
        try {
          const messageToEdit = await announcementChannel.messages.fetch(announcement.messageId);
          const formattedTaskNumber = `NV${announcementId.toString().padStart(3, '0')}`;
          let receiverText = '';
          if (announcement.receivers.length === 0) {
            receiverText = 'Người nhận: Bất kỳ';
          } else {
            receiverText = `Người nhận: ${announcement.receivers.map(id => `<@${id}>`).join(', ')}`;
          }
          const roleText = announcement.roleReceivers.length > 0 
            ? `Role nhận: ${announcement.roleReceivers.map(id => `<@&${id}>`).join(', ')}\n`
            : '';
          const newContent = `${formattedTaskNumber}\n${announcement.content}\nSố điểm: ${announcement.points}\n${receiverText}\n${roleText}Deadline: ${new Date(announcement.deadline).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}\n**Tình trạng**: Đã có người nhận - <@${announcement.acceptedBy}>`;
          await messageToEdit.edit(newContent);
        } catch (error) {
          console.error('Lỗi khi chỉnh sửa thông báo gốc:', error);
        }
      }
      
      if (announcementChannel) {
        try {
          await announcementChannel.send(
            `🔔 **THÔNG BÁO:** <@${message.author.id}> đã nhận nhiệm vụ NV${announcementId.toString().padStart(3, '0')}.\n` +
            `Nhiệm vụ phải hoàn thành trước ${new Date(announcement.deadline).toLocaleString('vi-VN')}.`
          );
        } catch (error) {
          console.error('Lỗi khi gửi thông báo nhận nhiệm vụ:', error);
        }
      }
      
      await message.channel.send(`✅ <@${message.author.id}>, bạn đã nhận nhiệm vụ NV${announcementId.toString().padStart(3, '0')} thành công!`);
    }

  } catch (error) {
    console.error('Lỗi khi xử lý lệnh:', error);
    sendPrivateOrTempMessage(message.author, message.channel, 'Đã xảy ra lỗi khi xử lý lệnh.');
  }
});

// ===== XỬ LÝ LỖI =====
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// ===== KIỂM TRA DEADLINE THEO ĐỊNH KỲ =====
async function checkDeadlines() {
  try {
    console.log('Checking deadlines at:', new Date().toLocaleString('vi-VN'));

    points = JSON.parse(fs.readFileSync('points.json', 'utf-8') || '{}');
    announcements = JSON.parse(fs.readFileSync('announcements.json', 'utf-8') || '[]');
    reports = JSON.parse(fs.readFileSync('reports.json', 'utf-8') || '[]');
    
    const now = Date.now();
    const expiredAnnouncements = announcements.filter(announcement => 
      !announcement.isProcessed && announcement.deadline && now > announcement.deadline &&
      !reports.some(report => 
        report.announcementId === announcement.id && 
        (report.status === 'pending' || report.status === 'approved')
      )
    );
    
    for (const announcement of expiredAnnouncements) {
      announcement.isProcessed = true;
      const announcementChannel = client.guilds.cache
        .find(guild => guild.channels.cache.has(ANNOUNCEMENT_CHANNEL_ID))
        ?.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || 
        client.guilds.cache
          .find(guild => guild.channels.cache.some(ch => ch.name === 'thong-bao'))
          ?.channels.cache.find(ch => ch.name === 'thong-bao');
      
      if (!announcementChannel) {
        console.warn('Announcement channel not found!');
        continue;
      }

      if (announcement.messageId) {
        try {
          const messageToEdit = await announcementChannel.messages.fetch(announcement.messageId);
          const formattedTaskNumber = `NV${announcement.id.toString().padStart(3, '0')}`;
          let receiverText = announcement.receivers.length === 0 
            ? 'Người nhận: Bất kỳ' 
            : `Người nhận: ${announcement.receivers.map(id => `<@${id}>`).join(', ')}`;
          const roleText = announcement.roleReceivers.length > 0 
            ? `Role nhận: ${announcement.roleReceivers.map(id => `<@&${id}>`).join(', ')}\n`
            : '';
          const newContent = `${formattedTaskNumber}\n${announcement.content}\nSố điểm: ${announcement.points}\n${receiverText}\n${roleText}Deadline: ${new Date(announcement.deadline).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}\n**Tình trạng**: Quá hạn`;
          await messageToEdit.edit(newContent);
        } catch (error) {
          console.error('Lỗi khi chỉnh sửa thông báo gốc:', error);
        }
      }

      const guild = announcementChannel.guild;
      if (announcement.receivers && announcement.receivers.length > 0) {
        let directUsers = [...announcement.receivers];
        if (announcement.roleReceivers && announcement.roleReceivers.length > 0) {
          const roleMembers = [];
          for (const roleId of announcement.roleReceivers) {
            const role = guild.roles.cache.get(roleId);
            if (role) {
              roleMembers.push(...role.members.map(member => member.id));
            }
          }
          directUsers = directUsers.filter(userId => !roleMembers.includes(userId));
        }

        for (const userId of directUsers) {
          points[userId] = Math.max(0, (points[userId] || 0) - announcement.points);
          await announcementChannel.send(
            `**CẢNH BÁO:** Nhiệm vụ NV${announcement.id.toString().padStart(3, '0')} đã quá hạn!\n` +
            `<@${userId}> đã bị trừ ${announcement.points} điểm! (Điểm còn lại: ${points[userId]})`
          ).catch(err => console.error('Lỗi gửi thông báo trừ điểm:', err));
        }
      }

      if (announcement.receivers.length === 0 && announcement.roleReceivers && announcement.roleReceivers.length > 0) {
        if (announcement.acceptedBy) {
          const userId = announcement.acceptedBy;
          points[userId] = Math.max(0, (points[userId] || 0) - announcement.points);
          await announcementChannel.send(
            `**CẢNH BÁO:** Nhiệm vụ NV${announcement.id.toString().padStart(3, '0')} đã quá hạn!\n` +
            `Người nhận <@${userId}> đã bị trừ ${announcement.points} điểm! (Điểm còn lại: ${points[userId]})`
          ).catch(err => console.error('Lỗi gửi thông báo trừ điểm:', err));
        } else {
          const targetRoleNames = ['┠Phó chủ tịch┤', '┠Ban điều hành ┤'];
          const roleMembers = new Set();
          for (const roleName of targetRoleNames) {
            const role = guild.roles.cache.find(r => r.name === roleName);
            if (role) {
              role.members.forEach(member => roleMembers.add(member.id));
            }
          }

          for (const userId of roleMembers) {
            points[userId] = Math.max(0, (points[userId] || 0) - announcement.points);
            await announcementChannel.send(
              `**CẢNH BÁO:** Nhiệm vụ NV${announcement.id.toString().padStart(3, '0')} đã quá hạn!\n` +
              `<@${userId}> (thuộc role ${targetRoleNames.join(', ')}) đã bị trừ ${announcement.points} điểm! (Điểm còn lại: ${points[userId]})`
            ).catch(err => console.error('Lỗi gửi thông báo trừ điểm:', err));
          }
        }
      }
    }

    if (expiredAnnouncements.length > 0) {
      fs.writeFileSync('announcements.json', JSON.stringify(announcements));
      fs.writeFileSync('points.json', JSON.stringify(points));
      console.log(`Đã xử lý ${expiredAnnouncements.length} thông báo quá hạn.`);
    }
  } catch (error) {
    console.error('Lỗi khi kiểm tra deadline:', error);
  }
}

// ===== CHẠY KIỂM TRA DEADLINE THEO ĐỊNH KỲ (MỖI 1 PHÚT) =====
setInterval(checkDeadlines, 60 * 1000);

// ===== LOGIN BOT =====
client.login(process.env.TOKEN)
  .then(() => console.log('Bot đã đăng nhập thành công!'))
  .catch(err => console.error('Lỗi khi đăng nhập bot:', err));
