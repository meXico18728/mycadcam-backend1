const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({});

// Убедимся, что папка uploads существует
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Разрешаем STL и изображения
        const extName = path.extname(file.originalname).toLowerCase();
        if (extName === '.stl' || extName === '.jpg' || extName === '.jpeg' || extName === '.png') {
            return cb(null, true);
        }
        cb(new Error('Разрешены только файлы STL и изображения'));
    }
});

// Загрузить STL для конкретного кейса
router.post('/case/:caseId', upload.single('file'), async (req, res) => {
    try {
        const caseId = parseInt(req.params.caseId);
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не найден' });
        }

        const type = path.extname(req.file.originalname).toLowerCase() === '.stl' ? 'stl' : 'image';

        const attachment = await prisma.attachment.create({
            data: {
                caseId,
                filePath: `/uploads/${req.file.filename}`,
                type
            }
        });

        res.status(201).json(attachment);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка загрузки файла' });
    }
});

module.exports = router;
