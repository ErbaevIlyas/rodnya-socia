// Подключение к Socket.IO
const socket = io();

// Элементы DOM
const loginModal = document.getElementById('login-modal');
const mainContainer = document.getElementById('main-container');
const loginUsernameInput = document.getElementById('login-username');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const currentUserSpan = document.getElementById('current-user');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const fileInput = document.getElementById('file-input');
const fileUploadArea = document.getElementById('file-upload-area');
const attachBtn = document.getElementById('attach-btn');
const emojiBtn = document.getElementById('emoji-btn');
const voiceBtn = document.getElementById('voice-btn');
const emojiPicker = document.getElementById('emoji-picker');
const onlineCount = document.getElementById('online-count');
const imagePreviewModal = document.getElementById('image-preview-modal');
const previewImage = document.getElementById('preview-image');
const imageCaptionInput = document.getElementById('image-caption');
const sendPreviewBtn = document.getElementById('send-preview');
const cancelPreviewBtn = document.getElementById('cancel-preview');
const closePreviewBtn = document.getElementById('close-preview');

// Переменные
let currentUsername = '';
let isRecording = false;
let mediaRecorder;
let recordedChunks = [];
let currentPreviewFile = null;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    const savedUsername = localStorage.getItem('rodnya-username');
    
    if (savedUsername) {
        currentUsername = savedUsername;
        enterChat();
    } else {
        loginModal.style.display = 'flex';
        loginUsernameInput.focus();
    }
});

// Вход в чат
function enterChat() {
    if (!currentUsername) {
        currentUsername = loginUsernameInput.value.trim();
        if (!currentUsername) {
            alert('Пожалуйста, введите имя');
            return;
        }
    }
    
    localStorage.setItem('rodnya-username', currentUsername);
    currentUserSpan.textContent = `👤 ${currentUsername}`;
    loginModal.style.display = 'none';
    mainContainer.style.display = 'flex';
    messageInput.focus();
    
    socket.emit('user-login', { username: currentUsername });
}

// Обработчики входа
loginBtn.addEventListener('click', enterChat);
loginUsernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        enterChat();
    }
});

// Выход из чата
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('rodnya-username');
    currentUsername = '';
    socket.emit('user-logout', {});
    location.reload();
});

// Отправка сообщения
function sendMessage() {
    const message = messageInput.value.trim();
    
    if (message) {
        socket.emit('send-message', {
            username: currentUsername,
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
        if (file.type.startsWith('image/')) {
            showImagePreview(file);
        } else {
            uploadFile(file);
        }
    });
    fileUploadArea.classList.remove('active');
}

// Предпросмотр изображения
function showImagePreview(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        currentPreviewFile = file;
        previewImage.src = e.target.result;
        imageCaptionInput.value = '';
        imagePreviewModal.classList.add('active');
    };
    
    reader.readAsDataURL(file);
}

// Закрытие предпросмотра
closePreviewBtn.addEventListener('click', () => {
    imagePreviewModal.classList.remove('active');
    currentPreviewFile = null;
});

cancelPreviewBtn.addEventListener('click', () => {
    imagePreviewModal.classList.remove('active');
    currentPreviewFile = null;
});

// Отправка изображения с подписью
sendPreviewBtn.addEventListener('click', () => {
    if (currentPreviewFile) {
        uploadFile(currentPreviewFile, imageCaptionInput.value.trim());
        imagePreviewModal.classList.remove('active');
        currentPreviewFile = null;
    }
});

// Загрузка файла
async function uploadFile(file, caption = '') {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            socket.emit('send-file', {
                username: currentUsername,
                filename: result.filename,
                originalname: result.originalname,
                url: result.url,
                mimetype: result.mimetype,
                caption: caption
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

socket.on('online-count', (count) => {
    onlineCount.textContent = count;
});

// Отображение сообщения
function displayMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.id = `msg-${data.id}`;
    
    let deleteBtn = '';
    if (data.username === currentUsername) {
        deleteBtn = `<button class="delete-btn" onclick="deleteMessage('${data.id}')">Удалить</button>`;
    }
    
    if (data.type === 'file') {
        messageDiv.classList.add('file-message');
        let captionHtml = '';
        if (data.caption) {
            captionHtml = `<div class="image-caption">"${data.caption}"</div>`;
        }
        
        messageDiv.innerHTML = `
            ${deleteBtn}
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
                ${captionHtml}
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            ${deleteBtn}
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

// Удаление сообщения
function deleteMessage(messageId) {
    if (confirm('Удалить сообщение?')) {
        socket.emit('delete-message', { id: messageId });
        const messageDiv = document.getElementById(`msg-${messageId}`);
        if (messageDiv) {
            messageDiv.remove();
        }
    }
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