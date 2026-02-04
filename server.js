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

// Socket.IO для реального времени
const connectedUsers = new Set();

io.on('connection', (socket) => {
    console.log('Пользователь подключился:', socket.id);
    
    // Присоединение к общему чату
    socket.join('general');
    
    // Обработка входа пользователя
    socket.on('user-login', (data) => {
        socket.username = data.username;
        connectedUsers.add(socket.id);
        io.to('general').emit('online-count', connectedUsers.size);
    });
    
    // Обработка выхода пользователя
    socket.on('user-logout', () => {
        connectedUsers.delete(socket.id);
        io.to('general').emit('online-count', connectedUsers.size);
    });
    
    // Обработка сообщений
    socket.on('send-message', (data) => {
        const messageData = {
            id: Date.now(),
            username: data.username || 'Аноним',
            message: data.message,
            timestamp: new Date().toLocaleString('ru-RU'),
            type: 'text'
        };
        
        io.to('general').emit('new-message', messageData);
    });
    
    // Обработка файлов
    socket.on('send-file', (data) => {
        const messageData = {
            id: Date.now(),
            username: data.username || 'Аноним',
            filename: data.filename,
            originalname: data.originalname,
            url: data.url,
            mimetype: data.mimetype,
            caption: data.caption || '',
            timestamp: new Date().toLocaleString('ru-RU'),
            type: 'file'
        };
        
        io.to('general').emit('new-message', messageData);
    });
    
    // Удаление сообщения
    socket.on('delete-message', (data) => {
        io.to('general').emit('message-deleted', { id: data.id });
    });
    
    // Отключение
    socket.on('disconnect', () => {
        console.log('Пользователь отключился:', socket.id);
        connectedUsers.delete(socket.id);
        io.to('general').emit('online-count', connectedUsers.size);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер Родня запущен на порту ${PORT}`);
});