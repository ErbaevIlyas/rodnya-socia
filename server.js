const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// MongoDB подключение
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://rodnya:PASSWORD@rodnya.be3oe9w.mongodb.net/?appName=rodnya';
let db;
let usersCollection;
let messagesCollection;

const client = new MongoClient(MONGODB_URI);

async function connectDB() {
    try {
        await client.connect();
        console.log('✅ Подключено к MongoDB');
        
        db = client.db('rodnya');
        usersCollection = db.collection('users');
        messagesCollection = db.collection('messages');
        
        // Создаем индексы для оптимизации
        await usersCollection.createIndex({ username: 1 }, { unique: true });
        await messagesCollection.createIndex({ createdAt: -1 });
        
    } catch (err) {
        console.error('❌ Ошибка подключения к MongoDB:', err);
        process.exit(1);
    }
}

connectDB();

// Создаем папку для загрузок если её нет
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

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
    socket.on('register', async (data) => {
        try {
            const { username, password } = data;
            
            // Проверяем существует ли пользователь
            const existingUser = await usersCollection.findOne({ username });
            if (existingUser) {
                socket.emit('register-response', { success: false, message: 'Пользователь уже существует' });
                return;
            }
            
            // Создаем нового пользователя
            await usersCollection.insertOne({
                username,
                password,
                createdAt: new Date()
            });
            
            socket.emit('register-response', { success: true, message: 'Регистрация успешна' });
        } catch (error) {
            console.error('Ошибка регистрации:', error);
            socket.emit('register-response', { success: false, message: 'Ошибка сервера' });
        }
    });
    
    // Вход пользователя
    socket.on('login', async (data) => {
        try {
            const { username, password } = data;
            
            // Ищем пользователя в БД
            const user = await usersCollection.findOne({ username });
            
            if (!user) {
                socket.emit('login-response', { success: false, message: 'Пользователь не найден' });
                return;
            }
            
            if (user.password !== password) {
                socket.emit('login-response', { success: false, message: 'Неверный пароль' });
                return;
            }
            
            // Сохраняем сессию
            socket.username = username;
            connectedUsers.set(socket.id, { username, socketId: socket.id });
            
            socket.emit('login-response', { success: true, message: 'Вход успешен' });
            
            // Отправляем список всех пользователей
            const allUsers = await usersCollection.find({}, { projection: { username: 1 } }).toArray();
            const usersList = allUsers.map(u => u.username);
            socket.emit('users-list', usersList);
            
            // Отправляем список онлайн пользователей
            const onlineUsers = Array.from(connectedUsers.values()).map(u => u.username);
            io.emit('online-users', onlineUsers);
            
            // Отправляем историю общего чата
            const generalMessages = await messagesCollection
                .find({ isGeneral: true })
                .sort({ createdAt: 1 })
                .limit(100)
                .toArray();
            
            const formattedMessages = generalMessages.map(msg => ({
                id: msg._id.toString(),
                username: msg.from,
                message: msg.message,
                filename: msg.filename,
                originalname: msg.originalname,
                url: msg.url,
                mimetype: msg.mimetype,
                caption: msg.caption,
                timestamp: new Date(msg.createdAt).toLocaleString('ru-RU'),
                type: msg.type
            }));
            
            socket.emit('load-general-messages', formattedMessages);
            
            // Уведомляем всех что пользователь онлайн
            io.to('general').emit('user-status', { 
                username: username, 
                status: 'online' 
            });
        } catch (error) {
            console.error('Ошибка входа:', error);
            socket.emit('login-response', { success: false, message: 'Ошибка сервера' });
        }
    });
    
    // Загрузка истории приватного чата
    socket.on('load-private-messages', async (data) => {
        try {
            const currentUser = socket.username;
            const otherUser = data.username;
            
            if (!currentUser) return;
            
            // Ищем сообщения между двумя пользователями
            const dialogMessages = await messagesCollection
                .find({
                    isGeneral: false,
                    $or: [
                        { from: currentUser, to: otherUser },
                        { from: otherUser, to: currentUser }
                    ]
                })
                .sort({ createdAt: 1 })
                .limit(100)
                .toArray();
            
            const formattedMessages = dialogMessages.map(msg => ({
                id: msg._id.toString(),
                from: msg.from,
                to: msg.to,
                message: msg.message,
                filename: msg.filename,
                originalname: msg.originalname,
                url: msg.url,
                mimetype: msg.mimetype,
                caption: msg.caption,
                timestamp: new Date(msg.createdAt).toLocaleString('ru-RU'),
                type: msg.type
            }));
            
            socket.emit('private-messages-loaded', formattedMessages);
        } catch (error) {
            console.error('Ошибка загрузки сообщений:', error);
        }
    });
    
    // Обработка сообщений в общий чат
    socket.on('send-message', async (data) => {
        try {
            const username = socket.username;
            if (!username) return;
            
            const messageData = {
                from: username,
                to: 'general',
                message: data.message,
                type: 'text',
                isGeneral: true,
                createdAt: new Date()
            };
            
            const result = await messagesCollection.insertOne(messageData);
            
            const formattedMessage = {
                id: result.insertedId.toString(),
                username: username,
                message: data.message,
                timestamp: new Date().toLocaleString('ru-RU'),
                type: 'text'
            };
            
            io.to('general').emit('new-message', formattedMessage);
        } catch (error) {
            console.error('Ошибка отправки сообщения:', error);
        }
    });
    
    // Обработка файлов в общий чат
    socket.on('send-file', async (data) => {
        try {
            const username = socket.username;
            if (!username) return;
            
            const messageData = {
                from: username,
                to: 'general',
                filename: data.filename,
                originalname: data.originalname,
                url: data.url,
                mimetype: data.mimetype,
                caption: data.caption || '',
                type: 'file',
                isGeneral: true,
                createdAt: new Date()
            };
            
            const result = await messagesCollection.insertOne(messageData);
            
            const formattedMessage = {
                id: result.insertedId.toString(),
                username: username,
                filename: data.filename,
                originalname: data.originalname,
                url: data.url,
                mimetype: data.mimetype,
                caption: data.caption || '',
                timestamp: new Date().toLocaleString('ru-RU'),
                type: 'file'
            };
            
            io.to('general').emit('new-message', formattedMessage);
        } catch (error) {
            console.error('Ошибка отправки файла:', error);
        }
    });
    
    // Удаление сообщения
    socket.on('delete-message', async (data) => {
        try {
            const { ObjectId } = require('mongodb');
            await messagesCollection.deleteOne({ _id: new ObjectId(data.id) });
            io.emit('message-deleted', { id: data.id });
        } catch (error) {
            console.error('Ошибка удаления сообщения:', error);
        }
    });
    
    // Личные сообщения
    socket.on('send-private-message', async (data) => {
        try {
            const senderUsername = socket.username;
            if (!senderUsername) return;
            
            const { recipientUsername, message } = data;
            
            // Сохраняем в БД
            const messageData = {
                from: senderUsername,
                to: recipientUsername,
                message: message,
                type: 'text',
                isGeneral: false,
                createdAt: new Date()
            };
            
            const result = await messagesCollection.insertOne(messageData);
            
            // Находим socket ID получателя
            let recipientSocketId = null;
            for (const [socketId, user] of connectedUsers.entries()) {
                if (user.username === recipientUsername) {
                    recipientSocketId = socketId;
                    break;
                }
            }
            
            const formattedMessage = {
                id: result.insertedId.toString(),
                from: senderUsername,
                to: recipientUsername,
                message: message,
                timestamp: new Date().toLocaleString('ru-RU'),
                type: 'text'
            };
            
            // Отправляем отправителю
            socket.emit('private-message', formattedMessage);
            
            // Отправляем получателю если онлайн
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('private-message', formattedMessage);
            }
        } catch (error) {
            console.error('Ошибка отправки приватного сообщения:', error);
        }
    });
    
    // Личные файлы
    socket.on('send-private-file', async (data) => {
        try {
            const senderUsername = socket.username;
            if (!senderUsername) return;
            
            const { recipientUsername, filename, originalname, url, mimetype, caption } = data;
            
            // Сохраняем в БД
            const messageData = {
                from: senderUsername,
                to: recipientUsername,
                filename: filename,
                originalname: originalname,
                url: url,
                mimetype: mimetype,
                caption: caption || '',
                type: 'file',
                isGeneral: false,
                createdAt: new Date()
            };
            
            const result = await messagesCollection.insertOne(messageData);
            
            // Находим socket ID получателя
            let recipientSocketId = null;
            for (const [socketId, user] of connectedUsers.entries()) {
                if (user.username === recipientUsername) {
                    recipientSocketId = socketId;
                    break;
                }
            }
            
            const formattedMessage = {
                id: result.insertedId.toString(),
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
            
            // Отправляем отправителю
            socket.emit('private-message', formattedMessage);
            
            // Отправляем получателю если онлайн
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('private-message', formattedMessage);
            }
        } catch (error) {
            console.error('Ошибка отправки приватного файла:', error);
        }
    });
    
    // Отключение
    socket.on('disconnect', async () => {
        console.log('Пользователь отключился:', socket.id);
        const username = socket.username;
        
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
    console.log(`🚀 Сервер Родня запущен на порту ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Закрытие соединения с MongoDB...');
    await client.close();
    process.exit(0);
});