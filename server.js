const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Создаем папку для загрузок если её нет
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Простая база данных пользователей (в памяти)
const users = new Map();
const userSessions = new Map(); // socket.id -> username
const messages = new Map(); // "user1-user2" -> [messages] для приватных
const generalMessages = []; // Сообщения в общий чат

// Настройка multer для загрузки файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB лимит
    }
});

// Статические файлы
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Загрузка файлов
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен' });
    }
    
    res.json({
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`
    });
});

// Функция для получения ключа диалога
function getDialogKey(user1, user2) {
    return [user1, user2].sort().join('-');
}

// Socket.IO для реального времени
const connectedUsers = new Map(); // socket.id -> {username, socketId}

io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);
    
    // Присоединение к общему чату
    socket.join('general');
    
    // Регистрация пользователя
    socket.on('register', (data) => {
        const { username, password } = data;
        
        if (users.has(username)) {
            socket.emit('register-response', { success: false, message: 'Пользователь уже существует' });
            return;
        }
        
        users.set(username, { password, createdAt: new Date() });
        socket.emit('register-response', { success: true, message: 'Регистрация успешна' });
    });
    
    // Вход пользователя
    socket.on('login', (data) => {
        const { username, password } = data;
        
        if (!users.has(username)) {
            socket.emit('login-response', { success: false, message: 'Пользователь не найден' });
            return;
        }
        
        const user = users.get(username);
        if (user.password !== password) {
            socket.emit('login-response', { success: false, message: 'Неверный пароль' });
            return;
        }
        
        userSessions.set(socket.id, username);
        connectedUsers.set(socket.id, { username, socketId: socket.id });
        
        socket.emit('login-response', { success: true, message: 'Вход успешен' });
        
        // Отправляем список всех пользователей
        const usersList = Array.from(users.keys());
        socket.emit('users-list', usersList);
        
        // Отправляем список онлайн пользователей
        const onlineUsers = Array.from(connectedUsers.values()).map(u => u.username);
        io.emit('online-users', onlineUsers);
        
        // Отправляем историю общего чата
        socket.emit('load-general-messages', generalMessages);
        
        // Уведомляем всех что пользователь онлайн
        io.to('general').emit('user-status', { 
            username: username, 
            status: 'online' 
        });
    });
    
    // Загрузка истории приватного чата
    socket.on('load-private-messages', (data) => {
        const currentUser = userSessions.get(socket.id);
        const otherUser = data.username;
        
        if (!currentUser) return;
        
        const dialogKey = getDialogKey(currentUser, otherUser);
        const dialogMessages = messages.get(dialogKey) || [];
        
        socket.emit('private-messages-loaded', dialogMessages);
    });
    
    // Обработка сообщений в общий чат
    socket.on('send-message', (data) => {
        const username = userSessions.get(socket.id);
        if (!username) return;
        
        const messageData = {
            id: Date.now(),
            username: username,
            message: data.message,
            timestamp: new Date().toLocaleString('ru-RU'),
            type: 'text'
        };
        
        generalMessages.push(messageData);
        io.to('general').emit('new-message', messageData);
    });
    
    // Обработка файлов в общий чат
    socket.on('send-file', (data) => {
        const username = userSessions.get(socket.id);
        if (!username) return;
        
        const messageData = {
            id: Date.now(),
            username: username,
            filename: data.filename,
            originalname: data.originalname,
            url: data.url,
            mimetype: data.mimetype,
            caption: data.caption || '',
            timestamp: new Date().toLocaleString('ru-RU'),
            type: 'file'
        };
        
        generalMessages.push(messageData);
        io.to('general').emit('new-message', messageData);
    });
    
    // Удаление сообщения
    socket.on('delete-message', (data) => {
        io.to('general').emit('message-deleted', { id: data.id });
    });
    
    // Личные сообщения
    socket.on('send-private-message', (data) => {
        const senderUsername = userSessions.get(socket.id);
        if (!senderUsername) return;
        
        const { recipientUsername, message } = data;
        
        // Находим socket ID получателя
        let recipientSocketId = null;
        for (const [socketId, user] of connectedUsers.entries()) {
            if (user.username === recipientUsername) {
                recipientSocketId = socketId;
                break;
            }
        }
        
        const messageData = {
            id: Date.now(),
            from: senderUsername,
            to: recipientUsername,
            message: message,
            timestamp: new Date().toLocaleString('ru-RU'),
            type: 'text'
        };
        
        // Сохраняем сообщение
        const dialogKey = getDialogKey(senderUsername, recipientUsername);
        if (!messages.has(dialogKey)) {
            messages.set(dialogKey, []);
        }
        messages.get(dialogKey).push(messageData);
        
        // Отправляем отправителю
        socket.emit('private-message', messageData);
        
        // Отправляем получателю если онлайн
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('private-message', messageData);
        }
    });
    
    // Личные файлы
    socket.on('send-private-file', (data) => {
        const senderUsername = userSessions.get(socket.id);
        if (!senderUsername) return;
        
        const { recipientUsername, filename, originalname, url, mimetype, caption } = data;
        
        // Находим socket ID получателя
        let recipientSocketId = null;
        for (const [socketId, user] of connectedUsers.entries()) {
            if (user.username === recipientUsername) {
                recipientSocketId = socketId;
                break;
            }
        }
        
        const messageData = {
            id: Date.now(),
            from: senderUsername,
            to: recipientUsername,
            filename: filename,
            originalname: originalname,
            url: url,
            mimetype: mimetype,
            caption: caption || '',
            timestamp: new Date().toLocaleString('ru-RU'),
            type: 'file'
        };
        
        // Сохраняем сообщение
        const dialogKey = getDialogKey(senderUsername, recipientUsername);
        if (!messages.has(dialogKey)) {
            messages.set(dialogKey, []);
        }
        messages.get(dialogKey).push(messageData);
        
        // Отправляем отправителю
        socket.emit('private-message', messageData);
        
        // Отправляем получателю если онлайн
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('private-message', messageData);
        }
    });
    
    // Отключение
    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
        const username = userSessions.get(socket.id);
        
        userSessions.delete(socket.id);
        connectedUsers.delete(socket.id);
        
        if (username) {
            const onlineUsers = Array.from(connectedUsers.values()).map(u => u.username);
            io.emit('online-users', onlineUsers);
            
            io.to('general').emit('user-status', { 
                username: username, 
                status: 'offline' 
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер Родня запущен на порту ${PORT}`);
});