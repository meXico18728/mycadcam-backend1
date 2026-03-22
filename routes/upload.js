const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma'); // BUG FIX #1: singleton
const authenticateToken = require('../middleware/auth');

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (['.stl', '.jpg', '.jpeg', '.png'].includes(ext)) return cb(null, true);
        cb(new Error('Разрешены только файлы STL и изображения'));
    },
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// BUG FIX #9: Upload route had no authenticateToken - any user could upload files
router.post('/case/:caseId', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const caseId = parseInt(req.params.caseId);
        if (!req.file) return res.status(400).json({ error: 'Файл не найден' });

        const type = path.extname(req.file.originalname).toLowerCase() === '.stl' ? 'stl' : 'image';
        const attachment = await prisma.attachment.create({
            data: { caseId, filePath: `/uploads/${req.file.filename}`, type }
        });
        res.status(201).json(attachment);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка загрузки файла' });
    }
});

// Удалить вложение
router.delete('/:attachmentId', authenticateToken, async (req, res) => {
    try {
        const attachment = await prisma.attachment.findUnique({
            where: { id: parseInt(req.params.attachmentId) }
        });
        if (!attachment) return res.status(404).json({ error: 'Файл не найден' });

        // Delete physical file
        const filePath = path.join(__dirname, '..', attachment.filePath);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        await prisma.attachment.delete({ where: { id: attachment.id } });
        res.json({ message: 'Файл удален' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка удаления файла' });
    }
});

module.exports = router;
