const { Client, IntentsBitField, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const express = require('express');
const app = express();
require('dotenv').config(); // ← Load biến môi trường từ .env

// Thêm config cho ID kênh
const ANNOUNCEMENT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID || '1360306086338625749'; // ID thực tế
const REPORT_CHANNEL_ID = process.env.REPORT_CHANNEL_ID || '1360306086338625749'; // ID thực tế

// Tên của các role có quyền quản trị (thay thế OWNER_ID)
const ADMIN_ROLE_NAME = process.env.ADMIN_ROLE_NAME || '【Chủ tịch】';
// Tên các role có quyền sử dụng lệnh báo cáo
const ALLOWED_ROLE_NAMES = ['┠Phó chủ tịch┤', '┠Ban điều hành ┤']; // Điều chỉnh theo nhu cầu

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(3000, () => {
  console.log('Web server running on port 3000');
});

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

const announcements = [];
let reports = [];
let points = {};

if (!fs.existsSync('announcements.json')) fs.writeFileSync('announcements.json', '[]');
if (!fs.existsSync('reports.json')) fs.writeFileSync('reports.json', '[]');
if (!fs.existsSync('points.json')) fs.writeFileSync('points.json', '{}');

try {
  announcements.push(...JSON.parse(fs.readFileSync('announcements.json', 'utf-8') || '[]'));
  reports = JSON.parse(fs.readFileSync('reports.json', 'utf-8') || '[]');
  points = JSON.parse(fs.readFileSync('points.json', 'utf-8') || '{}');
  console.log('Loaded data successfully');
} catch (error) {
  console.error('Error loading data:', error);
}

client.on('ready', () => {
  console.log(`Bot đã sẵn sàng với tên ${client.user.tag}`);
  
  // Kiểm tra cấu hình kênh khi bot khởi động
  checkChannels();
});

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

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(' ');
  const command = args.shift().toLowerCase();

  if (command === 'hello') {
    return message.reply('lô cc!');
  }

  if (command === 'thongbao') {
    // Kiểm tra quyền admin thay vì ID cố định
    if (!hasAdminRole(message.member)) {
      return message.reply('Bạn không có quyền sử dụng lệnh này! Cần có vai trò Admin.');
    }

    const points = parseInt(args[args.length - 1]);
    const deadline = args.slice(args.length - 3, args.length - 1).join(' ');
    const contentEndIndex = args.findLastIndex(arg => arg.match(/^<@!?(\d+)>$/)) + 1;
    const receiverTags = args.slice(contentEndIndex - args.slice(0, args.length - 3).filter(arg => arg.match(/^<@!?(\d+)>$/)).length, contentEndIndex);
    const receiverIds = receiverTags.map(tag => tag.match(/^<@!?(\d+)>$/)[1]);
    const contentWithTitle = args.slice(0, contentEndIndex - receiverTags.length).join(' ');

    if (!contentWithTitle || receiverIds.length === 0 || !deadline || isNaN(points) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(deadline)) {
      return message.reply('Vui lòng nhập đúng cú pháp! Ví dụ: !thongbao NV12: Nội dung nhiệm vụ. @username1 @username2 2023-10-25 14:00 50');
    }

    const titleMatch = contentWithTitle.match(/^NV(\d+):/);
    if (!titleMatch) return message.reply('Tiêu đề phải bắt đầu bằng NVXXX: (ví dụ: NV12:)');
    
    // Lấy mã số nhiệm vụ từ input của người dùng
    const taskNumber = titleMatch[1];
    const formattedTaskNumber = `NV${taskNumber.padStart(3, '0')}`;
    
    const content = contentWithTitle.slice(titleMatch[0].length).trim();
    if (!content.endsWith('.')) return message.reply('Nội dung nhiệm vụ phải kết thúc bằng dấu chấm!');

    // Thử tìm kênh bằng ID trước, nếu không tìm thấy thì tìm bằng tên
    let announcementChannel = message.guild.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
    if (!announcementChannel) {
      // Thử tìm bằng tên nếu không tìm thấy bằng ID
      announcementChannel = message.guild.channels.cache.find(ch => ch.name === 'thong-bao');
      if (!announcementChannel) {
        return message.reply('Không tìm thấy kênh thông báo! Vui lòng kiểm tra lại ID kênh hoặc tạo kênh có tên "thong-bao".');
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
      return message.reply('Có lỗi khi lưu thông báo!');
    }

    const announcementMessage = `${formattedTaskNumber}\n${content}\nSố điểm: ${points}\nNgười nhận: ${receiverIds.map(id => `<@${id}>`).join(', ')}\nDeadline: ${deadline}`;
    
    try {
      await announcementChannel.send(announcementMessage);
      
      // Gửi thông báo thành công riêng tư cho người dùng
      try {
        // Gửi tin nhắn riêng tư đến người tạo lệnh
        await message.author.send('Thông báo đã được gửi thành công!');
        
        // Xóa tin nhắn gốc chứa lệnh để người khác không thấy
        if (message.channel.type !== 'DM' && message.guild.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
          await message.delete().catch(err => console.error('Không thể xóa tin nhắn lệnh:', err));
        } else {
          // Nếu không thể xóa, gửi reply tạm thời và xóa sau 5 giây
          const replyMsg = await message.reply('Thông báo đã được gửi thành công!');
          setTimeout(() => replyMsg.delete().catch(() => {}), 5000);
        }
      } catch (dmError) {
        // Nếu không thể gửi DM (người dùng chặn DM), gửi tin nhắn trong kênh nhưng xóa sau vài giây
        console.error('Không thể gửi DM:', dmError);
        const replyMsg = await message.reply('Thông báo đã được gửi thành công! (Tin nhắn này sẽ tự xóa sau 5 giây)');
        setTimeout(() => replyMsg.delete().catch(() => {}), 5000);
      }
    } catch (error) {
      console.error('Lỗi khi gửi thông báo:', error);
      return message.reply('Có lỗi khi gửi thông báo vào kênh! Vui lòng kiểm tra quyền của bot.');
    }
  }

  if (command === 'baocao') {
    // Kiểm tra vai trò thay vì ID cố định
    if (!hasAllowedRole(message.member)) {
      return message.reply('Bạn không có quyền gửi báo cáo! Cần có vai trò được phép.');
    }

    const announcementId = parseInt(args[0]);
    const content = args.slice(1).join(' ');
    if (isNaN(announcementId) || !content) return message.reply('Vui lòng nhập ID thông báo và nội dung báo cáo!');

    if (content.length > 5000) return message.reply('Báo cáo không được vượt quá 5000 chữ!');

    const announcement = announcements.find(a => a.id === announcementId);
    if (!announcement) return message.reply('Thông báo không tồn tại!');

    if (!announcement.receivers.includes(message.author.id)) {
      return message.reply('Bạn không phải là người nhận của thông báo này!');
    }

    if (announcement.deadline && Date.now() > announcement.deadline) {
      return message.reply('Thông báo đã hết hạn!');
    }

    // Thử tìm kênh bằng ID trước, nếu không tìm thấy thì tìm bằng tên
    let reportChannel = message.guild.channels.cache.get(REPORT_CHANNEL_ID);
    if (!reportChannel) {
      // Thử tìm bằng tên nếu không tìm thấy bằng ID
      reportChannel = message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
      if (!reportChannel) {
        return message.reply('Không tìm thấy kênh báo cáo! Vui lòng kiểm tra lại ID kênh hoặc tạo kênh có tên "bao-cao".');
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
    message.reply('Báo cáo của bạn đã được gửi và đang chờ duyệt!');
  }

  if (command === 'duyet') {
    // Kiểm tra quyền admin thay vì ID cố định
    if (!hasAdminRole(message.member)) {
      return message.reply('Bạn không có quyền sử dụng lệnh này! Cần có vai trò Admin.');
    }

    const reportId = parseInt(args[0]);
    reports = JSON.parse(fs.readFileSync('reports.json', 'utf-8') || '[]');
    const report = reports.find(r => r.id === reportId);
    if (!report || report.status !== 'pending') return message.reply('Báo cáo không tồn tại hoặc đã được xử lý!');

    const announcement = announcements.find(a => a.id === report.announcementId);
    if (!announcement) return message.reply('Thông báo không tồn tại!');

    if (announcement.deadline && Date.now() > announcement.deadline) {
      report.status = 'rejected';
      fs.writeFileSync('reports.json', JSON.stringify(reports));
      
      // Thử tìm kênh bằng ID trước, nếu không tìm thấy thì tìm bằng tên
      let reportChannel = message.guild.channels.cache.get(REPORT_CHANNEL_ID);
      if (!reportChannel) {
        reportChannel = message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
        if (!reportChannel) {
          return message.reply('Không tìm thấy kênh báo cáo! Vui lòng kiểm tra lại ID kênh hoặc tạo kênh có tên "bao-cao".');
        }
      }
      
      await reportChannel.send(`Báo cáo ID ${reportId} đã bị **tự động từ chối** vì thông báo đã hết hạn!`);
      return message.reply('Thông báo đã hết hạn!');
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
        return message.reply('Không tìm thấy kênh báo cáo! Vui lòng kiểm tra lại ID kênh hoặc tạo kênh có tên "bao-cao".');
      }
    }
    
    await reportChannel.send(`Báo cáo ID ${reportId} đã được **duyệt** bởi ${message.author.tag}! Đã cộng ${announcement.points} điểm cho <@${report.author}>.`);
    message.reply('Đã duyệt báo cáo!');
  }

  if (command === 'tuchoi') {
    // Kiểm tra quyền admin thay vì ID cố định
    if (!hasAdminRole(message.member)) {
      return message.reply('Bạn không có quyền sử dụng lệnh này! Cần có vai trò Admin.');
    }

    const reportId = parseInt(args[0]);
    reports = JSON.parse(fs.readFileSync('reports.json', 'utf-8') || '[]');
    const report = reports.find(r => r.id === reportId);
    if (!report || report.status !== 'pending') return message.reply('Báo cáo không tồn tại hoặc đã được xử lý!');

    report.status = 'rejected';
    fs.writeFileSync('reports.json', JSON.stringify(reports));

    // Thử tìm kênh bằng ID trước, nếu không tìm thấy thì tìm bằng tên
    let reportChannel = message.guild.channels.cache.get(REPORT_CHANNEL_ID);
    if (!reportChannel) {
      reportChannel = message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
      if (!reportChannel) {
        return message.reply('Không tìm thấy kênh báo cáo! Vui lòng kiểm tra lại ID kênh hoặc tạo kênh có tên "bao-cao".');
      }
    }
    
    await reportChannel.send(`Báo cáo ID ${reportId} đã bị **từ chối** bởi ${message.author.tag}!`);
    message.reply('Đã từ chối báo cáo!');
  }

  // Thêm lệnh để xem điểm của mình
  if (command === 'diem') {
    const userId = message.author.id;
    const userPoints = points[userId] || 0;
    message.reply(`Bạn hiện có ${userPoints} điểm.`);
  }

  // Thêm lệnh reset NV
  if (command === 'resetnv') {
    // Kiểm tra quyền admin
    if (!hasAdminRole(message.member)) {
      return message.reply('Bạn không có quyền sử dụng lệnh này! Cần có vai trò Admin.');
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
        
        // Gửi thông báo qua DM thay vì reply công khai
        try {
          await message.author.send(`Đã reset danh sách nhiệm vụ từ ID ${startFrom}. Các nhiệm vụ cũ đã được lưu vào file backup.`);
          if (message.guild.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
            await message.delete().catch(err => console.error('Không thể xóa tin nhắn lệnh:', err));
          }
        } catch (dmError) {
          const replyMsg = await message.reply(`Đã reset danh sách nhiệm vụ từ ID ${startFrom}. (Tin nhắn này sẽ tự xóa sau 5 giây)`);
          setTimeout(() => replyMsg.delete().catch(() => {}), 5000);
        }
        return;
      }
      
      // Reset hoàn toàn
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(`announcements_backup_${timestamp}.json`, JSON.stringify(announcements));
      
      announcements.length = 0;
      fs.writeFileSync('announcements.json', '[]');
      
      // Gửi thông báo qua DM thay vì reply công khai
      try {
        await message.author.send('Đã reset danh sách nhiệm vụ thành công! Các nhiệm vụ cũ đã được lưu vào file backup.');
        if (message.guild.me.permissions.has(PermissionFlagsBits.ManageMessages)) {
          await message.delete().catch(err => console.error('Không thể xóa tin nhắn lệnh:', err));
        }
      } catch (dmError) {
        const replyMsg = await message.reply('Đã reset danh sách nhiệm vụ thành công! (Tin nhắn này sẽ tự xóa sau 5 giây)');
        setTimeout(() => replyMsg.delete().catch(() => {}), 5000);
      }
    } catch (error) {
      console.error('Lỗi khi reset nhiệm vụ:', error);
      message.reply('Có lỗi xảy ra khi reset nhiệm vụ!');
    }
  }

  // Thêm lệnh để xem trợ giúp về các lệnh
  if (command === 'help') {
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
    message.reply(helpMessage);
  }
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(process.env.TOKEN); // ← Token sẽ được lấy từ file .env
