const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static('public'));

if (!fs.existsSync('./public/voices')) fs.mkdirSync('./public/voices', { recursive: true });
const upload = multer({ dest: 'public/voices/' });

const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const GIFTS_FILE = path.join(DATA_DIR, 'gifts.json');

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([
        { id: 1, username: 'Toxilisk', displayName: 'Toxilisk', password: '676752526969', role: 'owner', verified: true, premium: true, banned: false, avatar: '', coins: 1000, level: 10, createdAt: Date.now() },
        { id: 2, username: 'test', displayName: 'test', password: '123', role: 'user', verified: false, premium: false, banned: false, avatar: '', coins: 100, level: 1, createdAt: Date.now() }
    ], null, 2));
}
if (!fs.existsSync(CHANNELS_FILE)) fs.writeFileSync(CHANNELS_FILE, '[]');
if (!fs.existsSync(MESSAGES_FILE)) fs.writeFileSync(MESSAGES_FILE, '[]');
if (!fs.existsSync(GIFTS_FILE)) fs.writeFileSync(GIFTS_FILE, JSON.stringify([
    { id: 1, emoji: '🎂', name: 'Торт', price: 50 },
    { id: 2, emoji: '💐', name: 'Цветы', price: 30 },
    { id: 3, emoji: '🧸', name: 'Мишка', price: 100 },
    { id: 4, emoji: '💎', name: 'Драгоценность', price: 200 },
    { id: 5, emoji: '🎮', name: 'Игра', price: 150 },
    { id: 6, emoji: '❤️', name: 'Сердце', price: 20 }
], null, 2));

function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return []; } }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// Сохранение сессии (токен)
app.post('/api/session', (req, res) => {
    const { userId } = req.body;
    res.json({ success: true });
});

// Загрузка голосовых
app.post('/api/upload-voice', upload.single('audio'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Нет файла' });
    const filename = `/voices/${req.file.filename}.webm`;
    fs.renameSync(req.file.path, `./public${filename}`);
    res.json({ url: filename });
});

// WebSocket
wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'message') {
                const messages = readJSON(MESSAGES_FILE);
                const newMsg = { id: Date.now(), type: msg.chatType || 'private', fromUserId: msg.fromUserId, toId: msg.toId, text: msg.text || '', timestamp: Date.now(), isVoice: msg.isVoice || false, voiceUrl: msg.voiceUrl || null };
                messages.push(newMsg);
                writeJSON(MESSAGES_FILE, messages);
                wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'new_message', message: newMsg })); });
            }
        } catch(e) { console.error(e); }
    });
});

// API
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ error: 'Неверно' });
    if (user.banned) return res.status(403).json({ error: 'Забанен' });
    res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, verified: user.verified, premium: user.premium, avatar: user.avatar, coins: user.coins || 0, level: user.level || 1 });
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);
    if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Логин занят' });
    const newUser = { id: users.length + 1, username, displayName: username, password, role: 'user', verified: false, premium: false, banned: false, avatar: '', coins: 100, level: 1, gifts: [], createdAt: Date.now() };
    users.push(newUser);
    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

app.get('/api/users', (req, res) => {
    const users = readJSON(USERS_FILE);
    res.json(users.map(u => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role, verified: u.verified, premium: u.premium, avatar: u.avatar, banned: u.banned, coins: u.coins || 0, level: u.level || 1 })));
});

app.get('/api/channels', (req, res) => { res.json(readJSON(CHANNELS_FILE)); });

app.post('/api/channels', (req, res) => {
    const { name, ownerId } = req.body;
    const channels = readJSON(CHANNELS_FILE);
    if (channels.find(c => c.name === name)) return res.status(400).json({ error: 'Канал существует' });
    const newChannel = { id: Date.now(), name, ownerId, subscribers: [], moderators: [], admins: [], writeAccess: 'all', verified: false, premium: false, description: '', avatar: '', createdAt: Date.now() };
    channels.push(newChannel);
    writeJSON(CHANNELS_FILE, channels);
    res.json({ success: true });
});

app.post('/api/channel/add-admin', (req, res) => {
    const { channelId, userId, adminId } = req.body;
    const channels = readJSON(CHANNELS_FILE);
    const channel = channels.find(c => c.id == channelId);
    const users = readJSON(USERS_FILE);
    const admin = users.find(u => u.id == adminId);
    if (channel && (admin.role === 'owner' || admin.role === 'admin' || channel.ownerId === adminId)) {
        if (!channel.admins.includes(userId)) channel.admins.push(userId);
        writeJSON(CHANNELS_FILE, channels);
        res.json({ success: true });
    } else res.status(403).json({ error: 'Нет прав' });
});

app.post('/api/channel/remove-admin', (req, res) => {
    const { channelId, userId, adminId } = req.body;
    const channels = readJSON(CHANNELS_FILE);
    const channel = channels.find(c => c.id == channelId);
    const users = readJSON(USERS_FILE);
    const admin = users.find(u => u.id == adminId);
    if (channel && (admin.role === 'owner' || admin.role === 'admin' || channel.ownerId === adminId)) {
        channel.admins = channel.admins.filter(id => id != userId);
        writeJSON(CHANNELS_FILE, channels);
        res.json({ success: true });
    } else res.status(403).json({ error: 'Нет прав' });
});

app.post('/api/channel/set-write-access', (req, res) => {
    const { channelId, access, adminId } = req.body;
    const channels = readJSON(CHANNELS_FILE);
    const channel = channels.find(c => c.id == channelId);
    const users = readJSON(USERS_FILE);
    const admin = users.find(u => u.id == adminId);
    if (channel && (admin.role === 'owner' || admin.role === 'admin' || channel.ownerId === adminId)) {
        channel.writeAccess = access; // 'all', 'admins', 'owner'
        writeJSON(CHANNELS_FILE, channels);
        res.json({ success: true });
    } else res.status(403).json({ error: 'Нет прав' });
});

app.post('/api/subscribe', (req, res) => {
    const { channelId, userId } = req.body;
    const channels = readJSON(CHANNELS_FILE);
    const ch = channels.find(c => c.id == channelId);
    if (ch && !ch.subscribers.includes(userId)) ch.subscribers.push(userId);
    writeJSON(CHANNELS_FILE, channels);
    res.json({ success: true });
});

app.post('/api/unsubscribe', (req, res) => {
    const { channelId, userId } = req.body;
    const channels = readJSON(CHANNELS_FILE);
    const ch = channels.find(c => c.id == channelId);
    if (ch) ch.subscribers = ch.subscribers.filter(id => id != userId);
    writeJSON(CHANNELS_FILE, channels);
    res.json({ success: true });
});

app.get('/api/messages', (req, res) => {
    const { type, id } = req.query;
    const messages = readJSON(MESSAGES_FILE);
    const filtered = messages.filter(m => m.type === type && (m.fromUserId == id || m.toId == id));
    res.json(filtered.sort((a,b) => a.timestamp - b.timestamp));
});

app.post('/api/update-profile', (req, res) => {
    const { userId, displayName, avatar } = req.body;
    const users = readJSON(USERS_FILE);
    const user = users.find(u => u.id == userId);
    if (user) { if (displayName) user.displayName = displayName; if (avatar) user.avatar = avatar; writeJSON(USERS_FILE, users); res.json({ success: true }); }
    else res.status(404).json({ error: 'Not found' });
});

app.post('/api/send-gift', (req, res) => {
    const { fromUserId, toUserId, giftId } = req.body;
    const users = readJSON(USERS_FILE);
    const gifts = readJSON(GIFTS_FILE);
    const gift = gifts.find(g => g.id == giftId);
    const from = users.find(u => u.id == fromUserId);
    const to = users.find(u => u.id == toUserId);
    if (to && gift && from && (from.coins || 0) >= gift.price) {
        from.coins -= gift.price;
        to.gifts = to.gifts || [];
        to.gifts.push({ giftId: gift.id, name: gift.name, emoji: gift.emoji, from: from.username, timestamp: Date.now() });
        writeJSON(USERS_FILE, users);
        res.json({ success: true, coins: from.coins });
    } else res.status(400).json({ error: 'Недостаточно монет' });
});

// Админка
const adminActions = ['ban', 'unban', 'verify', 'unverify', 'premium', 'unpremium', 'makeAdmin', 'makeModerator', 'restrict', 'unrestrict', 'giveCoins', 'takeCoins', 'setCoins', 'giveExp', 'resetUser', 'deleteUserMessages', 'channelVerify', 'channelUnverify', 'channelPremium', 'channelUnpremium', 'addSubs100', 'addSubs1000', 'addSubs10000', 'deleteChannel', 'deleteAllMessages', 'clearAllMessages', 'resetAll', 'announce', 'exportUsers', 'exportMessages', 'globalMute', 'globalUnmute'];
adminActions.forEach(action => {
    app.post(`/api/admin/${action}`, (req, res) => {
        const users = readJSON(USERS_FILE);
        const channels = readJSON(CHANNELS_FILE);
        const messages = readJSON(MESSAGES_FILE);
        const { userId, channelId, amount, text } = req.body;
        const user = users.find(u => u.id == userId);
        const channel = channels.find(c => c.id == channelId);
        if (action === 'ban' && user && user.role !== 'owner') user.banned = true;
        if (action === 'unban' && user) user.banned = false;
        if (action === 'verify' && user) user.verified = true;
        if (action === 'unverify' && user) user.verified = false;
        if (action === 'premium' && user) user.premium = true;
        if (action === 'unpremium' && user) user.premium = false;
        if (action === 'makeAdmin' && user && user.role !== 'owner') user.role = 'admin';
        if (action === 'makeModerator' && user && user.role !== 'owner') user.role = 'moderator';
        if (action === 'restrict' && user && user.role !== 'owner') user.role = 'restricted';
        if (action === 'unrestrict' && user && user.role !== 'owner') user.role = 'user';
        if (action === 'giveCoins' && user) user.coins = (user.coins || 0) + (amount || 100);
        if (action === 'takeCoins' && user) user.coins = Math.max(0, (user.coins || 0) - (amount || 100));
        if (action === 'setCoins' && user) user.coins = amount || 0;
        if (action === 'giveExp' && user) user.level = Math.floor(((user.exp || 0) + (amount || 100)) / 500) + 1;
        if (action === 'resetUser' && user && user.role !== 'owner') { user.banned = false; user.verified = false; user.premium = false; user.role = 'user'; user.coins = 100; user.level = 1; }
        if (action === 'deleteUserMessages' && userId) { const newMsg = messages.filter(m => m.fromUserId != userId && m.toId != userId); writeJSON(MESSAGES_FILE, newMsg); }
        if (action === 'channelVerify' && channel) channel.verified = true;
        if (action === 'channelUnverify' && channel) channel.verified = false;
        if (action === 'channelPremium' && channel) channel.premium = true;
        if (action === 'channelUnpremium' && channel) channel.premium = false;
        if (action === 'addSubs100' && channel) for (let i = 0; i < 100; i++) channel.subscribers.push(`fake_${Date.now()}_${i}`);
        if (action === 'addSubs1000' && channel) for (let i = 0; i < 1000; i++) channel.subscribers.push(`fake_${Date.now()}_${i}`);
        if (action === 'addSubs10000' && channel) for (let i = 0; i < 10000; i++) channel.subscribers.push(`fake_${Date.now()}_${i}`);
        if (action === 'deleteChannel' && channel) { const newCh = channels.filter(c => c.id != channelId); writeJSON(CHANNELS_FILE, newCh); }
        if (action === 'deleteAllMessages') writeJSON(MESSAGES_FILE, []);
        if (action === 'clearAllMessages') writeJSON(MESSAGES_FILE, []);
        if (action === 'resetAll') { writeJSON(MESSAGES_FILE, []); users.forEach(u => { if (u.role !== 'owner') { u.banned = false; u.verified = false; u.premium = false; u.role = 'user'; u.coins = 100; } }); writeJSON(USERS_FILE, users); }
        if (action === 'globalMute') users.forEach(u => { if (u.role !== 'owner') u.muted = true; });
        if (action === 'globalUnmute') users.forEach(u => u.muted = false);
        if (action === 'announce' && text) { wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify({ type: 'announcement', text })); }); }
        if (action === 'exportUsers') return res.json({ data: users });
        if (action === 'exportMessages') return res.json({ data: messages });
        if (action !== 'exportUsers' && action !== 'exportMessages') writeJSON(USERS_FILE, users);
        if (action !== 'deleteChannel' && action !== 'resetChannels') writeJSON(CHANNELS_FILE, channels);
        if (action !== 'deleteAllMessages' && action !== 'deleteUserMessages' && action !== 'clearAllMessages') writeJSON(MESSAGES_FILE, messages);
        res.json({ success: true });
    });
});

server.listen(PORT, () => console.log(`🚀 Сервер: http://localhost:${PORT}`));
