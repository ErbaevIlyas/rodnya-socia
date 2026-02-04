// Подключение к Socket.IO
const socket = io();

// Элементы DOM
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const usernameInput = document.getElementById('username');
const fileInput = document.getElementById('file-input');
const fileUploadArea = document.getElementById('file-upload-area');
const attachBtn = document.getElementById('attach-btn');
const emojiBtn = document.getElementById('emoji-btn');
const voiceBtn = document.getElementById('voice-btn');
const emojiPicker = document.getElementById('emoji-picker');
const onlineCount = document.getElementById('online-count');

// Переменные
let isRecording = false;
let mediaRecorder;
let recordedChunks = [];

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    // Удаляем приветственное сообщение при первом сообщении
    const welcomeMessage = document.querySelector('.welcome-message');
    
    // Фокус на поле ввода
    messageInput.focus();
    
    // Загружаем имя пользователя из localStorage
    const savedUsername = localStorage.getItem('rodnya-username');
    if (savedUsername) {
        usernameInput.value = savedUsername;
    }
});

// Сохранение имени пользователя
usernameInput.addEventListener('change', () => {
    localStorage.setItem('rodnya-username', usernameInput.value);
});

// Отправка сообщения
function sendMessage() {
    const message = messageInput.value.trim();
    const username = usernameInput.value.trim() || 'Аноним';
    
    if (message) {
        socket.emit('send-message', {
            username: username,
            message: message
        });
        
        messageInput.value = '';
        removeWelcomeMessage();
    }
}

// Обработчики событий
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Прикрепление файлов
attachBtn.addEventListener('click', () => {
    fileUploadArea.classList.toggle('active');
});

fileUploadArea.addEventListener('click', () => {
    fileInput.click();
});

// Drag & Drop
fileUploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadArea.style.background = '#e3f2fd';
});

fileUploadArea.addEventListener('dragleave', () => {
    fileUploadArea.style.background = '#f8f9fa';
});

fileUploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUploadArea.style.background = '#f8f9fa';
    
    const files = e.dataTransfer.files;
    handleFiles(files);
});

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

// Обработка файлов
function handleFiles(files) {
    Array.from(files).forEach(file => {
        uploadFile(file);
    });
    fileUploadArea.classList.remove('active');
}

// Загрузка файла
async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            const username = usernameInput.value.trim() || 'Аноним';
            
            socket.emit('send-file', {
                username: username,
                filename: result.filename,
                originalname: result.originalname,
                url: result.url,
                mimetype: result.mimetype
            });
            
            removeWelcomeMessage();
        } else {
            alert('Ошибка загрузки файла: ' + result.error);
        }
    } catch (error) {
        alert('Ошибка загрузки файла: ' + error.message);
    }
}

// Эмодзи
emojiBtn.addEventListener('click', () => {
    emojiPicker.classList.toggle('active');
});

// Закрытие эмодзи при клике вне
document.addEventListener('click', (e) => {
    if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) {
        emojiPicker.classList.remove('active');
    }
});

// Выбор эмодзи
document.querySelectorAll('.emoji').forEach(emoji => {
    emoji.addEventListener('click', () => {
        messageInput.value += emoji.textContent;
        messageInput.focus();
        emojiPicker.classList.remove('active');
    });
});

// Голосовые сообщения
voiceBtn.addEventListener('click', toggleRecording);

async function toggleRecording() {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            recordedChunks = [];
            
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    recordedChunks.push(e.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'audio/webm' });
                const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
                uploadFile(file);
                
                // Останавливаем все треки
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            isRecording = true;
            voiceBtn.classList.add('active');
            voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
            
        } catch (error) {
            alert('Ошибка доступа к микрофону: ' + error.message);
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        voiceBtn.classList.remove('active');
        voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    }
}

// Socket.IO события
socket.on('new-message', (data) => {
    displayMessage(data);
});

socket.on('user-joined', (data) => {
    displayNotification(data.message);
});

socket.on('user-left', (data) => {
    displayNotification(data.message);
});

// Отображение сообщения
function displayMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    if (data.type === 'file') {
        messageDiv.classList.add('file-message');
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="username">${data.username}</span>
                <span class="timestamp">${data.timestamp}</span>
            </div>
            <div class="message-content">
                <div class="file-info">
                    <i class="fas ${getFileIcon(data.mimetype)} file-icon"></i>
                    <span class="file-name">${data.originalname}</span>
                </div>
                ${getMediaPreview(data.url, data.mimetype, data.originalname)}
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="username">${data.username}</span>
                <span class="timestamp">${data.timestamp}</span>
            </div>
            <div class="message-content">${data.message}</div>
        `;
    }
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Отображение уведомления
function displayNotification(message) {
    const notificationDiv = document.createElement('div');
    notificationDiv.className = 'notification';
    notificationDiv.textContent = message;
    
    messagesContainer.appendChild(notificationDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Удаление приветственного сообщения
function removeWelcomeMessage() {
    const welcomeMessage = document.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }
}

// Получение иконки файла
function getFileIcon(mimetype) {
    if (mimetype.startsWith('image/')) return 'fa-image';
    if (mimetype.startsWith('video/')) return 'fa-video';
    if (mimetype.startsWith('audio/')) return 'fa-music';
    return 'fa-file';
}

// Предварительный просмотр медиа
function getMediaPreview(url, mimetype, filename) {
    if (mimetype.startsWith('image/')) {
        return `<img src="${url}" alt="${filename}" class="media-preview" onclick="window.open('${url}', '_blank')">`;
    }
    
    if (mimetype.startsWith('video/')) {
        return `<video src="${url}" controls class="media-preview"></video>`;
    }
    
    if (mimetype.startsWith('audio/')) {
        return `<audio src="${url}" controls style="width: 100%; margin-top: 0.5rem;"></audio>`;
    }
    
    return `<a href="${url}" target="_blank" class="file-link">Скачать файл</a>`;
}