const { Client, IntentsBitField } = require('discord.js');
const fs = require('fs');
const express = require('express');
const app = express();
require('dotenv').config(); // ← Load biến môi trường từ .env

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

const OWNER_ID = '1029557880657035294';
const ALLOWED_ROLES = ['1333820454875435098', '1333822162498490472', '993395084940820490'];
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
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(' ');
  const command = args.shift().toLowerCase();

  if (command === 'ping') {
    return message.reply('pong!');
  }

  if (command === 'thongbao') {
    if (message.author.id !== OWNER_ID) return message.reply('Chỉ chủ club được dùng lệnh này!');

    const points = parseInt(args[args.length - 1]);
    const deadline = args.slice(args.length - 3, args.length - 1).join(' ');
    const contentEndIndex = args.findLastIndex(arg => arg.match(/^<@!?(\d+)>$/)) + 1;
    const receiverTags = args.slice(contentEndIndex - args.slice(0, args.length - 3).filter(arg => arg.match(/^<@!?(\d+)>$/)).length, contentEndIndex);
    const receiverIds = receiverTags.map(tag => tag.match(/^<@!?(\d+)>$/)[1]);
    const contentWithTitle = args.slice(0, contentEndIndex - receiverTags.length).join(' ');

    if (!contentWithTitle || receiverIds.length === 0 || !deadline || isNaN(points) || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(deadline)) {
      return message.reply('Vui lòng nhập đúng cú pháp! Ví dụ: !thongbao NV12: Nội dung nhiệm vụ. @username1 @username2 2023-10-25 14:00 50');
    }

    const titleMatch = contentWithTitle.match(/^NV\d+:/);
    if (!titleMatch) return message.reply('Tiêu đề phải bắt đầu bằng NVXXX: (ví dụ: NV12:)');
    const content = contentWithTitle.slice(titleMatch[0].length).trim();
    if (!content.endsWith('.')) return message.reply('Nội dung nhiệm vụ phải kết thúc bằng dấu chấm!');

    const announcementChannel = message.guild.channels.cache.find(ch => ch.name === 'thong-bao');
    if (!announcementChannel) return message.reply('Kênh #thong-bao không tồn tại!');

    const taskNumber = announcements.length + 1;
    const formattedTaskNumber = `NV${String(taskNumber).padStart(3, '0')}`;

    const announcement = {
      id: taskNumber,
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
    } catch (error) {
      return message.reply('Có lỗi khi gửi thông báo vào kênh #thong-bao!');
    }

    if (message.author.id === OWNER_ID) {
      const hasRole = message.member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
      if (!hasRole) {
        message.reply('Thông báo đã được gửi!');
      }
    }
  }

  if (command === 'baocao') {
    const hasRole = message.member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
    if (!hasRole) return message.reply('Bạn không có quyền gửi báo cáo!');

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

    const reportChannel = message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
    if (!reportChannel) return message.reply('Kênh #bao-cao không tồn tại!');

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
    if (message.author.id !== OWNER_ID) return message.reply('Chỉ chủ club được dùng lệnh này!');

    const reportId = parseInt(args[0]);
    reports = JSON.parse(fs.readFileSync('reports.json', 'utf-8') || '[]');
    const report = reports.find(r => r.id === reportId);
    if (!report || report.status !== 'pending') return message.reply('Báo cáo không tồn tại hoặc đã được xử lý!');

    const announcement = announcements.find(a => a.id === report.announcementId);
    if (!announcement) return message.reply('Thông báo không tồn tại!');

    if (announcement.deadline && Date.now() > announcement.deadline) {
      report.status = 'rejected';
      fs.writeFileSync('reports.json', JSON.stringify(reports));
      const reportChannel = message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
      await reportChannel.send(`Báo cáo ID ${reportId} đã bị **tự động từ chối** vì thông báo đã hết hạn!`);
      return message.reply('Thông báo đã hết hạn!');
    }

    report.status = 'approved';
    fs.writeFileSync('reports.json', JSON.stringify(reports));

    points[report.author] = (points[report.author] || 0) + announcement.points;
    fs.writeFileSync('points.json', JSON.stringify(points));

    const reportChannel = message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
    await reportChannel.send(`Báo cáo ID ${reportId} đã được **duyệt** bởi ${message.author.tag}! Đã cộng ${announcement.points} điểm cho <@${report.author}>.`);
    message.reply('Đã duyệt báo cáo!');
  }

  if (command === 'tuchoi') {
    if (message.author.id !== OWNER_ID) return message.reply('Chỉ chủ club được dùng lệnh này!');

    const reportId = parseInt(args[0]);
    reports = JSON.parse(fs.readFileSync('reports.json', 'utf-8') || '[]');
    const report = reports.find(r => r.id === reportId);
    if (!report || report.status !== 'pending') return message.reply('Báo cáo không tồn tại hoặc đã được xử lý!');

    report.status = 'rejected';
    fs.writeFileSync('reports.json', JSON.stringify(reports));

    const reportChannel = message.guild.channels.cache.find(ch => ch.name === 'bao-cao');
    await reportChannel.send(`Báo cáo ID ${reportId} đã bị **từ chối** bởi ${message.author.tag}!`);
    message.reply('Đã từ chối báo cáo!');
  }
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(process.env.TOKEN); // ← Token sẽ được lấy từ file .env
