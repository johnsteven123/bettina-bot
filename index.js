const { Client, IntentsBitField, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const express = require('express');
const app = express();
require('dotenv').config(); // ← Load biến môi trường từ .env

// Thêm config cho ID kênh
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID || '1360306086338625749'; // ID thực tế
const REPORT_CHANNEL_ID = process.env.REPORT_CHANNEL_ID || '1360306086338625749'; // ID thực tế

// Tên của các role có quyền quản trị
const ADMIN_ROLE_NAME = process.env.ADMIN_ROLE_NAME || '【Chủ tịch】';
// Tên các role có quyền sử dụng lệnh báo cáo và nhận nhiệm vụ
const ALLOWED_ROLE_NAMES = ['┠Phó chủ tịch┤', '┠Ban điều hành ┤']; // Điều chỉnh theo nhu cầu

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
const announcements = [];
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
  
  // Kiểm tra cấu hình kênh khi bot khởi động
  checkChannels();
  
  // Chạy kiểm tra deadline ngay khi bot khởi động
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

// Hàm xử lý tin nhắn riêng tư hoặc tin nhắn tạm thời
async function sendPrivateOrTempMessage(user, channel, content) {
  try {
    // Thử gửi tin nhắn qua DM trước
    await user.send(content);
  } catch (dmError) {
    // Nếu không thể gửi DM, gửi tin nhắn tạm thời vào kênh và tự xóa sau 5 giây
    try {
      const tempMsg = await channel.send(`${content} (Tin nhắn này sẽ tự xóa sau 5 giây)`);
      setTimeout(() => tempMsg.delete().catch(() => {}), 5000);
    } catch (channelError) {
      console.error('Không thể gửi tin nhắn vào kênh:', channelError);
    }
  }
}

// Hàm xóa tin nhắn lệnh nếu có quyền - cải tiến để đảm bảo hoạt động đúng
async function deleteCommandMessage(message) {
  if (message.guild) {
    try {
      // Kiểm tra quyền của bot một cách chính xác hơn
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
  // Bỏ qua tin nhắn từ bot hoặc không bắt đầu bằng !
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(' ');
  const command = args.shift().toLowerCase();

  try {
    // ===== LỆNH HELLO =====
    if (command === 'hello') {
      // Xóa tin nhắn lệnh ngay lập tức
      await deleteCommandMessage(message);
      await message.channel.send('lô cc!');
      return;
    }

    // ===== LỆNH THONGBAO =====
    if (command === 'thongbao') {
      // Xóa tin nhắn lệnh ngay lập tức
      await deleteCommandMessage(message);
      
      // Kiểm tra quyền admin
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này! Cần có vai trò Admin.');
      }

      const points = parseInt(args[args.length - 1]);
      const deadline = args.slice(args.length - 3, args.length - 1).join(' ');
      
      // Tìm tất cả các mention (bao gồm role và user)
      const mentionMatches = args.filter(arg => arg.match(/^<@[!&]?(\d+)>$/));
      const contentEndIndex = args.findIndex(arg => arg.match(/^<@[!&]?(\d+)>$/)) + mentionMatches.length;
      
      // Tách riêng mention user và mention role
      const receiverTags = mentionMatches.filter(tag => tag.match(/^<@!?(\d+)>$/));
      const roleTags = mentionMatches.filter(tag => tag.match(/^<@&(\d+)>$/));
      
      // Lấy ID của các user được tag trực tiếp
      const receiverIds = receiverTags.map(tag => tag.match(/^<@!?(\d+)>$/)[1]);
      
      // Lấy ID của các role được tag
      const roleIds = roleTags.map(tag => tag.match(/^<@&(\d+)>$/)[1]);
      
      const contentWithTitle = args.slice(0, args.findIndex(arg => arg.match(/^<@[!&]?(\d+)>$/)) || args.length).join(' ');
      
      if (!contentWithTitle || !deadline || isNaN(points) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(deadline)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Vui lòng nhập đúng cú pháp! Ví dụ: !thongbao NV12: Nội dung nhiệm vụ. @username1 @role1 2023-10-25 14:00 50');
      }

      const titleMatch = contentWithTitle.match(/^NV(\d+):/);
      if (!titleMatch) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Tiêu đề phải bắt đầu bằng NVXXX: (ví dụ: NV12:)');
      }
      
      // Lấy mã số nhiệm vụ từ input của người dùng
      const taskNumber = titleMatch[1];
      const formattedTaskNumber = `NV${taskNumber.padStart(3, '0')}`;
      
      const content = contentWithTitle.slice(titleMatch[0].length).trim();
      if (!content.endsWith('.')) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Nội dung nhiệm vụ phải kết thúc bằng dấu chấm!');
      }

      // Thử tìm kênh bằng ID trước, nếu không tìm thấy thì tìm bằng tên
      let announcementChannel = message.guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
      if (!announcementChannel) {
        // Thử tìm bằng tên nếu không tìm thấy bằng ID
        announcementChannel = message.guild.channels.cache.find(ch => ch.name === 'thong-bao');
        if (!announcementChannel) {
          return sendPrivateOrTempMessage(message.author, message.channel, 'Không tìm thấy kênh thông báo! Vui lòng kiểm tra lại ID kênh hoặc tạo kênh có tên "thong-bao".');
        }
      }
      
      // Lấy danh sách các thành viên từ role được tag
      let allReceiverIds = [...receiverIds]; // Bắt đầu với các user được tag trực tiếp
      
      // Thêm tất cả thành viên từ các role được tag
      if (roleIds.length > 0) {
        for (const roleId of roleIds) {
          const role = message.guild.roles.cache.get(roleId);
          if (role) {
            const membersWithRole = role.members.map(member => member.id);
            allReceiverIds = [...allReceiverIds, ...membersWithRole];
          }
        }
      }
      
      // Loại bỏ các ID trùng lặp
      allReceiverIds = [...new Set(allReceiverIds)];
      
      const announcement = {
        id: parseInt(taskNumber), // Sử dụng id từ mã NV người dùng nhập
        content,
        points,
        author: message.author.id,
        receivers: allReceiverIds,
        roleReceivers: roleIds, // Lưu ID của các role được giao nhiệm vụ
        deadline: new Date(deadline).getTime(),
        created: Date.now(), // Thêm thời gian tạo để theo dõi
        messageId: null, // Thêm field để lưu ID tin nhắn thông báo
        isProcessed: false, // Thêm cờ để đánh dấu đã xử lý trừ điểm
      };

      try {
        announcements.push(announcement);
        fs.writeFileSync('announcements.json', JSON.stringify(announcements));
      } catch (error) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Có lỗi khi lưu thông báo!');
      }

      // Tạo thông báo với mentions
      let mentionText = '';
      // Nếu không có người nhận cụ thể, hiển thị "Người nhận: Bất kỳ" ngay cả khi có role
      if (receiverIds.length === 0) {
        mentionText += `Người nhận: Bất kỳ`;
      } else {
        mentionText += `Người nhận: ${receiverIds.map(id => `<@${id}>`).join(', ')}`;
      }
      if (roleIds.length > 0) {
        if (mentionText) mentionText += '\n';
        mentionText += `Role nhận: ${roleIds.map(id => `<@&${id}>`).join(', ')}`;
      }

      // Xác định có hiển thị dòng tình trạng không
      let statusLine = '';
      if (receiverIds.length === 0 && roleIds.length > 0) {
        // Nếu chỉ có role mà không có user cụ thể, hiển thị dòng tình trạng
        statusLine = '\n**Tình trạng**: Chưa có người nhận';
      }

      // Khai báo announcementMessage một lần duy nhất
      const announcementMessage = `${formattedTaskNumber}\n${content}\nSố điểm: ${points}\n${mentionText}\nDeadline: ${deadline}${statusLine}`;

      // Gửi tin nhắn và lưu ID tin nhắn
      try {
        const sentMessage = await announcementChannel.send(announcementMessage);
        announcement.messageId = sentMessage.id; // Lưu ID tin nhắn
        fs.writeFileSync('announcements.json', JSON.stringify(announcements)); // Cập nhật file với messageId
        sendPrivateOrTempMessage(message.author, message.channel, 'Thông báo đã được gửi thành công!');
      } catch (error) {
        console.error('Lỗi khi gửi thông báo:', error);
        sendPrivateOrTempMessage(message.author, message.channel, 'Có lỗi khi gửi thông báo vào kênh! Vui lòng kiểm tra quyền của bot.');
      }
    }

    // ===== LỆNH BAOCAO =====
    if (command === 'baocao') {
      // Xóa tin nhắn lệnh ngay lập tức
      await deleteCommandMessage(message);
      
      // Kiểm tra vai trò
      if (!hasAllowedRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền gửi báo cáo! Cần có vai trò được phép.');
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

      // Kiểm tra xem nhiệm vụ này đã có người nhận chưa
      if (announcement.acceptedBy) {
        // Nếu người báo cáo không phải là người đã nhận nhiệm vụ
        if (announcement.acceptedBy !== message.author.id) {
          return sendPrivateOrTempMessage(message.author, message.channel, `Nhiệm vụ này đã được <@${announcement.acceptedBy}> nhận. Chỉ người nhận mới có thể báo cáo.`);
        }
      } else {
        // Nếu chưa có người nhận, kiểm tra xem người báo cáo có quyền không
        const isDirectReceiver = announcement.receivers.includes(message.author.id);
        const isRoleReceiver = announcement.roleReceivers && announcement.roleReceivers.some(roleId => 
          message.member.roles.cache.has(roleId)
        );
        
        if (!isDirectReceiver && !isRoleReceiver) {
          return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không phải là người nhận của thông báo này!');
        }
      }

      // Thử tìm kênh bằng ID trước, nếu không tìm thấy thì tìm bằng tên
      let reportChannel = message.guild.channels.cache.get(REPORT_CHANNEL_ID);
      if (!reportChannel) {
        // Thử tìm bằng tên nếu không tìm thấy bằng ID
        reportChannel = message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
        if (!reportChannel) {
          return sendPrivateOrTempMessage(message.author, message.channel, 'Không tìm thấy kênh báo cáo! Vui lòng kiểm tra lại ID kênh hoặc tạo kênh có tên "bao-cao".');
        }
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
      // Xóa tin nhắn lệnh ngay lập tức
      await deleteCommandMessage(message);
      
      // Kiểm tra quyền admin
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này! Cần có vai trò Admin.');
      }

      const reportId = parseInt(args[0]);
      // Đọc lại file reports.json để đảm bảo dữ liệu mới nhất
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
        
        // Thử tìm kênh bằng ID trước, nếu không tìm thấy thì tìm bằng tên
        let reportChannel = message.guild.channels.cache.get(REPORT_CHANNEL_ID);
        if (!reportChannel) {
          reportChannel = message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
          if (!reportChannel) {
            return sendPrivateOrTempMessage(message.author, message.channel, 'Không tìm thấy kênh báo cáo! Vui lòng kiểm tra lại ID kênh hoặc tạo kênh có tên "bao-cao".');
          }
        }
        
        await reportChannel.send(`Báo cáo ID ${reportId} đã bị **tự động từ chối** vì thông báo đã hết hạn!`);
        return sendPrivateOrTempMessage(message.author, message.channel, 'Thông báo đã hết hạn!');
      }

      report.status = 'approved';
      fs.writeFileSync('reports.json', JSON.stringify(reports));

      points[report.author] = (points[report.author] || 0) + announcement.points;
      fs.writeFileSync('points.json', JSON.stringify(points));

      // Thử tìm kênh bằng ID trước, nếu không tìm thấy thì tìm bằng tên
      let reportChannel = message.guild.channels.cache.get(REPORT_CHANNEL_ID);
      if (!reportChannel) {
        reportChannel = message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
        if (!reportChannel) {
          return sendPrivateOrTempMessage(message.author, message.channel, 'Không tìm thấy kênh báo cáo! Vui lòng kiểm tra lại ID kênh hoặc tạo kênh có tên "bao-cao".');
        }
      }
      
      await reportChannel.send(`Báo cáo ID ${reportId} đã được **duyệt** bởi ${message.author.tag}! Đã cộng ${announcement.points} điểm cho <@${report.author}>.`);
      sendPrivateOrTempMessage(message.author, message.channel, 'Đã duyệt báo cáo!');
    }

    // ===== LỆNH TUCHOI =====
    if (command === 'tuchoi') {
      // Xóa tin nhắn lệnh ngay lập tức
      await deleteCommandMessage(message);
      
      // Kiểm tra quyền admin
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này! Cần có vai trò Admin.');
      }

      const reportId = parseInt(args[0]);
      // Đọc lại file reports.json để đảm bảo dữ liệu mới nhất
      reports = JSON.parse(fs.readFileSync('reports.json', 'utf-8') || '[]');
      const report = reports.find(r => r.id === reportId);
      if (!report || report.status !== 'pending') {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Báo cáo không tồn tại hoặc đã được xử lý!');
      }

      report.status = 'rejected';
      fs.writeFileSync('reports.json', JSON.stringify(reports));

      // Thử tìm kênh bằng ID trước, nếu không tìm thấy thì tìm bằng tên
      let reportChannel = message.guild.channels.cache.get(REPORT_CHANNEL_ID);
      if (!reportChannel) {
        reportChannel = message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
        if (!reportChannel) {
          return sendPrivateOrTempMessage(message.author, message.channel, 'Không tìm thấy kênh báo cáo! Vui lòng kiểm tra lại ID kênh hoặc tạo kênh có tên "bao-cao".');
        }
      }
      
      await reportChannel.send(`Báo cáo ID ${reportId} đã bị **từ chối** bởi ${message.author.tag}!`);
      sendPrivateOrTempMessage(message.author, message.channel, 'Đã từ chối báo cáo!');
    }

    // ===== LỆNH DIEM =====
    if (command === 'diem') {
      // Xóa tin nhắn lệnh ngay lập tức
      await deleteCommandMessage(message);
      
      const userId = message.author.id;
      const userPoints = points[userId] || 0;
      
      // Gửi tin nhắn mới thay vì trả lời tin nhắn cũ
      await message.channel.send(`<@${userId}>, bạn hiện có ${userPoints} điểm.`);
    }

    // ===== LỆNH RESETNV =====
    if (command === 'resetnv') {
      // Xóa tin nhắn lệnh ngay lập tức
      await deleteCommandMessage(message);
      
      // Kiểm tra quyền admin
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này! Cần có vai trò Admin.');
      }

      try {
        // Option để reset từ một số cụ thể
        if (args[0] === 'from' && !isNaN(parseInt(args[1]))) {
          const startFrom = parseInt(args[1]);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          fs.writeFileSync(`announcements_backup_${timestamp}.json`, JSON.stringify(announcements));
          
          // Chỉ giữ lại các nhiệm vụ có ID nhỏ hơn startFrom
          const filteredAnnouncements = announcements.filter(a => a.id < startFrom);
          announcements.length = 0;
          announcements.push(...filteredAnnouncements);
          fs.writeFileSync('announcements.json', JSON.stringify(announcements));
          
          sendPrivateOrTempMessage(message.author, message.channel, `Đã reset danh sách nhiệm vụ từ ID ${startFrom}. Các nhiệm vụ cũ đã được lưu vào file backup.`);
          return;
        }
        
        // Reset hoàn toàn
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.writeFileSync(`announcements_backup_${timestamp}.json`, JSON.stringify(announcements));
        
        announcements.length = 0;
        fs.writeFileSync('announcements.json', '[]');
        
        sendPrivateOrTempMessage(message.author, message.channel, 'Đã reset danh sách nhiệm vụ thành công! Các nhiệm vụ cũ đã được lưu vào file backup.');
      } catch (error) {
        console.error('Lỗi khi reset nhiệm vụ:', error);
        sendPrivateOrTempMessage(message.author, message.channel, 'Có lỗi xảy ra khi reset nhiệm vụ!');
      }
    }

    // ===== LỆNH HELP =====
    if (command === 'help') {
      // Xóa tin nhắn lệnh ngay lập tức
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
\`!resetnv [from ID]\` - Reset danh sách nhiệm vụ, tùy chọn "from ID" để reset từ ID cụ thể trở đi

**Cơ chế tự động:**
- Nếu nhiệm vụ giao cho **một người cụ thể** và trễ deadline mà chưa báo cáo, hệ thống sẽ tự động trừ điểm của người đó (số điểm trừ = điểm nhiệm vụ).
- Nếu nhiệm vụ giao cho **bất kỳ ai** (chỉ định role mà không có người cụ thể):
  - Nếu chưa có người nhận và trễ deadline, hệ thống sẽ trừ điểm tất cả thành viên trong role **┠Phó chủ tịch┤** và **┠Ban điều hành ┤** (số điểm trừ = điểm nhiệm vụ).
  - Nếu đã có người nhận và trễ deadline mà chưa báo cáo, chỉ người nhận nhiệm vụ bị trừ điểm.
`;
      // Gửi tin nhắn mới thay vì trả lời tin nhắn cũ
      await message.channel.send(helpMessage);
    }

    // ===== LỆNH BANGDIEM =====
    if (command === 'bangdiem') {
      // Xóa tin nhắn lệnh ngay lập tức
      await deleteCommandMessage(message);
      
      // Kiểm tra quyền sử dụng lệnh
      if (!hasAllowedRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này! Cần có vai trò được phép.');
      }
      
      try {
        // Tạo bảng điểm theo role
        const roleScores = {};
        const guild = message.guild;
        
        // Lấy danh sách người dùng có điểm
        const userIds = Object.keys(points);
        
        // Lặp qua từng người dùng có điểm
        for (const userId of userIds) {
          // Tìm thành viên trong server
          const member = await guild.members.fetch(userId).catch(() => null);
          
          if (member) {
            // Lấy role cao nhất của thành viên
            const highestRole = member.roles.highest;
            
            // Thêm điểm của thành viên vào role tương ứng
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
        
        // Sắp xếp các role theo tổng điểm giảm dần
        const sortedRoles = Object.values(roleScores).sort((a, b) => b.totalPoints - a.totalPoints);
        
        // Tạo tin nhắn hiển thị bảng điểm
        let bangdiemMessage = '**Bảng Điểm Theo Role**\n\n';
        
        if (sortedRoles.length === 0) {
          bangdiemMessage += 'Hiện chưa có dữ liệu điểm.';
        } else {
          sortedRoles.forEach((role, index) => {
            bangdiemMessage += `**${index + 1}. ${role.name}** - ${role.totalPoints} điểm\n`;
            
            // Sắp xếp thành viên theo điểm giảm dần
            const sortedMembers = role.members.sort((a, b) => b.points - a.points);
            
            sortedMembers.forEach((member, memberIndex) => {
              bangdiemMessage += `   ${memberIndex + 1}. <@${member.id}> - ${member.points} điểm\n`;
            });
            
            bangdiemMessage += '\n';
          });
        }
        
        // Gửi tin nhắn bảng điểm
        await message.channel.send(bangdiemMessage);
      } catch (error) {
        console.error('Lỗi khi hiển thị bảng điểm:', error);
        sendPrivateOrTempMessage(message.author, message.channel, 'Đã xảy ra lỗi khi tạo bảng điểm. Vui lòng thử lại sau.');
      }
    }

    // ===== LỆNH DIEMDANH =====
    if (command === 'diemdanh') {
      // Xóa tin nhắn lệnh ngay lập tức
      await deleteCommandMessage(message);
      
      // Kiểm tra quyền admin
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này! Cần có vai trò Admin.');
      }
      
      // Kiểm tra cú pháp
      if (args.length < 2 || !args[0].match(/^<@!?(\d+)>$/) || isNaN(parseInt(args[1]))) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Vui lòng nhập đúng cú pháp! Ví dụ: !diemdanh @username 50');
      }
      
      // Lấy ID người dùng từ mention
      const userId = args[0].match(/^<@!?(\d+)>$/)[1];
      // Lấy số điểm cần cập nhật
      const pointsToAdd = parseInt(args[1]);
      
      // Kiểm tra người dùng có tồn tại không
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (!member) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Người dùng không tồn tại trong server!');
      }
      
      try {
        // Cập nhật điểm cho người dùng
        points[userId] = (points[userId] || 0) + pointsToAdd;
        fs.writeFileSync('points.json', JSON.stringify(points));
        
        // Thông báo đã cập nhật điểm thành công
        await message.channel.send(`Đã cập nhật ${pointsToAdd} điểm cho <@${userId}>. Tổng điểm hiện tại: ${points[userId]}.`);
      } catch (error) {
        console.error('Lỗi khi cập nhật điểm:', error);
        sendPrivateOrTempMessage(message.author, message.channel, 'Đã xảy ra lỗi khi cập nhật điểm. Vui lòng thử lại sau.');
      }
    }

    // ===== LỆNH SUADIEM =====
    if (command === 'suadiem') {
      // Xóa tin nhắn lệnh ngay lập tức
      await deleteCommandMessage(message);
      
      // Kiểm tra quyền admin
      if (!hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền sử dụng lệnh này! Cần có vai trò Admin.');
      }
      
      // Kiểm tra cú pháp
      if (args.length < 2 || !args[0].match(/^<@!?(\d+)>$/) || isNaN(parseInt(args[1]))) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Vui lòng nhập đúng cú pháp! Ví dụ: !suadiem @username 100');
      }
      
      // Lấy ID người dùng từ mention
      const userId = args[0].match(/^<@!?(\d+)>$/)[1];
      // Lấy số điểm mới
      const newPoints = parseInt(args[1]);
      
      // Kiểm tra người dùng có tồn tại không
      const member = await message.guild.members.fetch(userId).catch(() => null);
      if (!member) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Người dùng không tồn tại trong server!');
      }
      
      try {
        // Lưu điểm cũ để thông báo
        const oldPoints = points[userId] || 0;
        
        // Cập nhật điểm mới cho người dùng
        points[userId] = newPoints;
        fs.writeFileSync('points.json', JSON.stringify(points));
        
        // Thông báo đã sửa điểm thành công
        await message.channel.send(`Đã sửa điểm của <@${userId}> từ ${oldPoints} thành ${newPoints}.`);
      } catch (error) {
        console.error('Lỗi khi sửa điểm:', error);
        sendPrivateOrTempMessage(message.author, message.channel, 'Đã xảy ra lỗi khi sửa điểm. Vui lòng thử lại sau.');
      }
    }

    // ===== LỆNH NHANNHIEMVU =====
    if (command === 'nhannhiemvu') {
      // Xóa tin nhắn lệnh ngay lập tức
      await deleteCommandMessage(message);
      
      // Kiểm tra vai trò có phải là Phó chủ tịch hoặc Ban điều hành
      const isPCT = message.member.roles.cache.some(role => role.name === '┠Phó chủ tịch┤');
      const isBDH = message.member.roles.cache.some(role => role.name === '┠Ban điều hành ┤');
      
      if (!isPCT && !isBDH && !hasAdminRole(message.member)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không có quyền nhận nhiệm vụ! Cần là Phó chủ tịch hoặc Ban điều hành.');
      }

      const announcementId = parseInt(args[0]);
      if (isNaN(announcementId)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Vui lòng nhập ID nhiệm vụ muốn nhận! Ví dụ: !nhannhiemvu 123');
      }

      const announcement = announcements.find(a => a.id === announcementId);
      if (!announcement) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Nhiệm vụ không tồn tại!');
      }

      // Kiểm tra xem nhiệm vụ này có dành cho các role được phép không
      const allowedRoleIds = announcement.roleReceivers || [];
      
      // Kiểm tra xem người này có trong các role được giao không
      const isInAssignedRole = message.member.roles.cache.some(role => allowedRoleIds.includes(role.id));
      
      if (!isInAssignedRole) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Nhiệm vụ này không dành cho role của bạn!');
      }

      // Kiểm tra xem nhiệm vụ đã hết hạn chưa
      if (announcement.deadline && Date.now() > announcement.deadline) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Nhiệm vụ này đã hết hạn!');
      }

      // Kiểm tra xem đã có ai nhận chưa
      if (announcement.acceptedBy) {
        if (announcement.acceptedBy === message.author.id) {
          return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn đã nhận nhiệm vụ này rồi!');
        } else {
          return sendPrivateOrTempMessage(message.author, message.channel, `Nhiệm vụ này đã được <@${announcement.acceptedBy}> nhận rồi!`);
        }
      }

      // Gán người nhận cho nhiệm vụ
      announcement.acceptedBy = message.author.id;
      announcement.acceptedAt = Date.now();
      
      // Lưu lại dữ liệu
      try {
        fs.writeFileSync('announcements.json', JSON.stringify(announcements));
      } catch (error) {
        console.error('Lỗi khi lưu dữ liệu nhận nhiệm vụ:', error);
        return sendPrivateOrTempMessage(message.author, message.channel, 'Có lỗi xảy ra, không thể nhận nhiệm vụ!');
      }

      // Cập nhật thông báo gốc trong kênh thông báo
      const announcementChannel = message.guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || 
                                 message.guild.channels.cache.find(ch => ch.name === 'thong-bao');
      if (announcementChannel && announcement.messageId) {
        try {
          const messageToEdit = await announcementChannel.messages.fetch(announcement.messageId);
          const formattedTaskNumber = `NV${announcementId.toString().padStart(3, '0')}`;
          // Cập nhật hiển thị "Người nhận"
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
      
      // Thông báo trong kênh thông báo
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
      
      // Trả lời người dùng
      await message.channel.send(`✅ <@${message.author.id}>, bạn đã nhận nhiệm vụ NV${announcementId.toString().padStart(3, '0')} thành công! Hãy hoàn thành trước thời hạn.`);
    }

  } catch (error) {
    console.error('Lỗi khi xử lý lệnh:', error);
    try {
      sendPrivateOrTempMessage(message.author, message.channel, 'Đã xảy ra lỗi khi xử lý lệnh của bạn. Vui lòng thử lại sau.');
    } catch (e) {
      console.error('Không thể gửi thông báo lỗi:', e);
    }
  }
});

// ===== XỬ LÝ LỖI =====
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// ===== LOGIN BOT =====
client.login(process.env.TOKEN)
  .then(() => console.log('Bot đã đăng nhập thành công!'))
  .catch(err => console.error('Lỗi khi đăng nhập bot:', err));

// ===== KIỂM TRA DEADLINE THEO ĐỊNH KỲ =====
async function checkDeadlines() {
  try {
    console.log('Checking deadlines at:', new Date().toLocaleString('vi-VN'));

    // Load dữ liệu mới nhất
    const announcementsData = fs.readFileSync('announcements.json', 'utf-8');
    const reportsData = fs.readFileSync('reports.json', 'utf-8');
    const pointsData = fs.readFileSync('points.json', 'utf-8');

    console.log('Loaded announcements:', announcementsData);
    console.log('Loaded reports:', reportsData);
    console.log('Loaded points:', pointsData);

    if (announcementsData) announcements.length = 0;
    if (announcementsData) announcements.push(...JSON.parse(announcementsData));
    if (reportsData) reports = JSON.parse(reportsData);
    if (pointsData) points = JSON.parse(pointsData);
    
    const now = Date.now();
    console.log('Current time (timestamp):', now);
    
    // Lọc ra các thông báo đã quá deadline và chưa được xử lý
    const expiredAnnouncements = announcements.filter(announcement => {
      console.log(`Checking announcement ${announcement.id}: Deadline ${announcement.deadline} (${new Date(announcement.deadline).toLocaleString('vi-VN')}), isProcessed: ${announcement.isProcessed}`);
      if (!announcement.isProcessed && announcement.deadline && now > announcement.deadline) {
        // Kiểm tra xem có báo cáo nào đang chờ duyệt hoặc đã được duyệt cho thông báo này không
        const hasReport = reports.some(report => 
          report.announcementId === announcement.id && 
          (report.status === 'pending' || report.status === 'approved')
        );
        console.log(`Announcement ${announcement.id} has report: ${hasReport}`);
        return !hasReport; // Chỉ xử lý các thông báo không có báo cáo đang chờ/đã duyệt
      }
      return false;
    });
    
    console.log('Expired announcements:', expiredAnnouncements.map(a => a.id));
    
    // Xử lý từng thông báo quá hạn
    for (const announcement of expiredAnnouncements) {
      // Đánh dấu nhiệm vụ đã được xử lý
      announcement.isProcessed = true;
      console.log(`Processing expired announcement ${announcement.id}`);
      
      for (const guild of client.guilds.cache.values()) {
        const announcementChannel = guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID) || 
                                   guild.channels.cache.find(ch => ch.name === 'thong-bao');
        if (!announcementChannel) {
          console.warn('Announcement channel not found!');
          continue;
        }
        
        // Kiểm tra quyền gửi tin nhắn trong kênh
        const botMember = guild.members.cache.get(client.user.id);
        if (!botMember.permissionsIn(announcementChannel).has(PermissionFlagsBits.SendMessages)) {
          console.warn(`Bot lacks SendMessages permission in channel ${ANNOUNCEMENT_CHANNEL_ID}`);
          continue;
        }
        
        // Trường hợp 1: Nhiệm vụ được giao cho user cụ thể
        if (announcement.receivers && announcement.receivers.length > 0) {
          // Lọc ra các user cụ thể (không bao gồm những user thuộc role để tránh trừ điểm 2 lần)
          let directUsers = [...announcement.receivers];
          
          if (announcement.roleReceivers && announcement.roleReceivers.length > 0) {
            const roleMembers = [];
            for (const roleId of announcement.roleReceivers) {
              const role = guild.roles.cache.get(roleId);
              if (role) {
                roleMembers.push(...role.members.map(member => member.id));
              }
            }
            // Loại bỏ các user đã thuộc role
            directUsers = directUsers.filter(userId => !roleMembers.includes(userId));
          }
          
          console.log(`Direct users to penalize for announcement ${announcement.id}:`, directUsers);
          
          // Trừ điểm cho từng user cụ thể
          for (const userId of directUsers) {
            const oldPoints = points[userId] || 0;
            points[userId] = Math.max(0, oldPoints - announcement.points);
            
            // Thông báo trừ điểm
            await announcementChannel.send(
              `**CẢNH BÁO:** Nhiệm vụ NV${announcement.id.toString().padStart(3, '0')} đã quá hạn mà không có báo cáo!\n` +
              `<@${userId}> đã bị trừ ${announcement.points} điểm! (Điểm còn lại: ${points[userId]})`
            ).catch(err => console.error('Lỗi gửi thông báo trừ điểm cá nhân:', err));
          }
        }
        
        // Trường hợp 2: Nhiệm vụ giao cho "bất kỳ ai" (chỉ có roleReceivers, không có receivers cụ thể)
        if (announcement.receivers.length === 0 && announcement.roleReceivers && announcement.roleReceivers.length > 0) {
          // Nếu đã có người nhận nhiệm vụ
          if (announcement.acceptedBy) {
            const userId = announcement.acceptedBy;
            const oldPoints = points[userId] || 0;
            points[userId] = Math.max(0, oldPoints - announcement.points);
            
            console.log(`Penalizing accepted user ${userId} for announcement ${announcement.id}`);
            
            // Thông báo trừ điểm
            await announcementChannel.send(
              `**CẢNH BÁO:** Nhiệm vụ NV${announcement.id.toString().padStart(3, '0')} đã quá hạn mà không có báo cáo!\n` +
              `Người nhận <@${userId}> đã bị trừ ${announcement.points} điểm! (Điểm còn lại: ${points[userId]})`
            ).catch(err => console.error('Lỗi gửi thông báo trừ điểm cho người nhận:', err));
          } else {
            // Nếu chưa có người nhận, trừ điểm tất cả thành viên trong cả 2 role ┠Phó chủ tịch┤ và ┠Ban điều hành ┤
            const targetRoleNames = ['┠Phó chủ tịch┤', '┠Ban điều hành ┤'];
            const roleMembers = new Set();
            
            for (const roleName of targetRoleNames) {
              const role = guild.roles.cache.find(r => r.name === roleName);
              if (role) {
                role.members.forEach(member => roleMembers.add(member.id));
              } else {
                console.warn(`Role ${roleName} not found in guild ${guild.name}`);
              }
            }
            
            console.log(`Role members to penalize for announcement ${announcement.id}:`, [...roleMembers]);
            
            // Trừ điểm cho từng thành viên trong các role
            for (const userId of roleMembers) {
              const oldPoints = points[userId] || 0;
              points[userId] = Math.max(0, oldPoints - announcement.points);
              
              // Thông báo trừ điểm
              await announcementChannel.send(
                `**CẢNH BÁO:** Nhiệm vụ NV${announcement.id.toString().padStart(3, '0')} đã quá hạn mà không có người nhận hoặc báo cáo!\n` +
                `<@${userId}> (thuộc role ${targetRoleNames.join(', ')}) đã bị trừ ${announcement.points} điểm! (Điểm còn lại: ${points[userId]})`
              ).catch(err => console.error('Lỗi gửi thông báo trừ điểm role:', err));
            }
          }
        }
      }
    }
    
    // Lưu lại dữ liệu sau khi xử lý
    if (expiredAnnouncements.length > 0) {
      fs.writeFileSync('announcements.json', JSON.stringify(announcements));
      fs.writeFileSync('points.json', JSON.stringify(points));
      console.log(`Đã xử lý ${expiredAnnouncements.length} thông báo quá hạn.`);
    } else {
      console.log('Không có thông báo nào quá hạn cần xử lý.');
    }
  } catch (error) {
    console.error('Lỗi khi kiểm tra deadline:', error);
  }
}

// ===== CHẠY KIỂM TRA DEADLINE THEO ĐỊNH KỲ (MỖI 1 PHÚT) =====
setInterval(checkDeadlines, 60 * 1000);
