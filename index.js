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
// Tên các role có quyền sử dụng lệnh báo cáo
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
});

// ===== CÁC HÀM TIỆN ÍCH =====

// Hàm kiểm tra các kênh có tồn tại không
function checkChannels() {
  client.guilds.cache.forEach(guild => {
    const announceChannel = guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
    const reportChannel = guild.channels.cache.get(REPORT_CHANNEL_ID);
    
    if (!announceChannel) {
      console.warn(`⚠️ Không tìm thấy kênh thông báo với ID ${ANNOUNCEMENT_CHANNEL_ID} trong server ${guild.name}`);
    }
    
    if (!reportChannel) {
      console.warn(`⚠️ Không tìm thấy kênh báo cáo với ID ${REPORT_CHANNEL_ID} trong server ${guild.name}`);
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
      const contentEndIndex = args.findLastIndex(arg => arg.match(/^<@!?(\d+)>$/)) + 1;
      const receiverTags = args.slice(contentEndIndex - args.slice(0, args.length - 3).filter(arg => arg.match(/^<@!?(\d+)>$/)).length, contentEndIndex);
      const receiverIds = receiverTags.map(tag => tag.match(/^<@!?(\d+)>$/)[1]);
      const contentWithTitle = args.slice(0, contentEndIndex - receiverTags.length).join(' ');

      if (!contentWithTitle || receiverIds.length === 0 || !deadline || isNaN(points) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(deadline)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Vui lòng nhập đúng cú pháp! Ví dụ: !thongbao NV12: Nội dung nhiệm vụ. @username1 @username2 2023-10-25 14:00 50');
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

      const announcement = {
        id: parseInt(taskNumber), // Sử dụng id từ mã NV người dùng nhập
        content,
        points,
        author: message.author.id,
        receivers: receiverIds,
        deadline: new Date(deadline).getTime(),
      };

      try {
        announcements.push(announcement);
        fs.writeFileSync('announcements.json', JSON.stringify(announcements));
      } catch (error) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Có lỗi khi lưu thông báo!');
      }

      const announcementMessage = `${formattedTaskNumber}\n${content}\nSố điểm: ${points}\nNgười nhận: ${receiverIds.map(id => `<@${id}>`).join(', ')}\nDeadline: ${deadline}`;
      
      try {
        await announcementChannel.send(announcementMessage);
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

      if (!announcement.receivers.includes(message.author.id)) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Bạn không phải là người nhận của thông báo này!');
      }

      if (announcement.deadline && Date.now() > announcement.deadline) {
        return sendPrivateOrTempMessage(message.author, message.channel, 'Thông báo đã hết hạn!');
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
**📚 HƯỚNG DẪN SỬ DỤNG BOT**

**📋 Lệnh cơ bản:**
\`!hello\` - Kiểm tra bot có hoạt động không
\`!help\` - Hiển thị hướng dẫn sử dụng bot
\`!diem\` - Xem số điểm hiện có của bạn

**📢 Lệnh quản lý nhiệm vụ:**
\`!thongbao NV12: Nội dung nhiệm vụ. @người_nhận1 @người_nhận2 YYYY-MM-DD HH:MM điểm\` - Tạo thông báo nhiệm vụ (Admin)
\`!baocao ID_nhiệm_vụ nội_dung_báo_cáo\` - Gửi báo cáo hoàn thành nhiệm vụ
\`!duyet ID_báo_cáo\` - Duyệt báo cáo (Admin)
\`!tuchoi ID_báo_cáo\` - Từ chối báo cáo (Admin)
\`!resetnv\` - Reset danh sách nhiệm vụ (Admin)
\`!resetnv from 10\` - Reset danh sách nhiệm vụ từ ID 10 trở đi (Admin)

**🏆 Lệnh quản lý điểm:**
\`!bangdiem\` - Hiển thị bảng điểm của các role (Cần vai trò được phép)
\`!diemdanh @người_dùng số_điểm\` - Cập nhật/cộng thêm điểm cho người dùng (Admin)
\`!suadiem @người_dùng số_điểm\` - Sửa điểm của người dùng thành giá trị mới (Admin)

**ℹ️ Chú thích:**
- Lệnh có ghi chú (Admin) chỉ có thể được sử dụng bởi người có vai trò 【Chủ tịch】 hoặc Admin.
- Lệnh "Cần vai trò được phép" có thể được sử dụng bởi người có vai trò 【Chủ tịch】, ┠Phó chủ tịch┤, hoặc ┠Ban điều hành ┤.
- Khi nhập lệnh, không cần thêm các ký tự như [ ] hoặc < >.
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
