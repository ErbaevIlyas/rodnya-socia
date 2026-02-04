# Гайд по обновлению Родни

## Способ 1: Через GitHub веб-интерфейс

1. Открой https://github.com/твой-username/rodnya-social
2. Найди файл который хочешь изменить
3. Нажми карандашик ✏️
4. Внеси изменения
5. Commit changes
6. Railway автоматически обновит сайт за 1-2 минуты

## Способ 2: GitHub Desktop

1. Скачай GitHub Desktop: https://desktop.github.com
2. Клонируй репозиторий на компьютер
3. Редактируй файлы в любом редакторе
4. В GitHub Desktop нажми "Commit to main"
5. Нажми "Push origin"
6. Railway обновит сайт

## Способ 3: Через Git (для продвинутых)

```bash
git clone https://github.com/твой-username/rodnya-social.git
cd rodnya-social
# Внеси изменения
git add .
git commit -m "Описание изменений"
git push
```

## Что происходит после изменений:

1. ✅ Ты делаешь commit в GitHub
2. ✅ Railway видит изменения
3. ✅ Автоматически запускается новый деплой
4. ✅ Через 1-2 минуты сайт обновляется
5. ✅ Все пользователи видят изменения

## Полезные изменения для начала:

### Изменить название:
Файл: `public/index.html`
Строка: `<h1>Родня</h1>`

### Изменить цвета:
Файл: `public/style.css`
Найди: `#4facfe` и `#00f2fe`

### Добавить новые эмодзи:
Файл: `public/index.html`
Секция: `<div class="emoji-grid">`

### Изменить лимиты файлов:
Файл: `server.js`
Строка: `fileSize: 50 * 1024 * 1024`