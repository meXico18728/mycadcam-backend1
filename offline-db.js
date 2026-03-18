/**
 * offline-db.js — локальная SQLite база для клиентского режима.
 * Хранит данные когда нет связи с сервером.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db = null;

function getDbPath() {
    // В Electron — userData, иначе рядом с файлом
    try {
        const { app } = require('electron');
        return path.join(app.getPath('userData'), 'offline.db');
    } catch {
        return path.join(__dirname, 'offline.db');
    }
}

function init() {
    if (db) return db;
    const dbPath = getDbPath();
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS offline_queue (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            method      TEXT NOT NULL,
            url         TEXT NOT NULL,
            body        TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            synced      INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS cache_patients (
            id   INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cache_cases (
            id   INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cache_transactions (
            id   INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cache_restorations (
            id   INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        );
    `);

    return db;
}

// Добавить операцию в очередь синхронизации
function enqueue(method, url, body) {
    const d = init();
    d.prepare('INSERT INTO offline_queue (method, url, body) VALUES (?, ?, ?)')
        .run(method, url, body ? JSON.stringify(body) : null);
}

// Получить все несинхронизированные операции
function getPendingQueue() {
    const d = init();
    return d.prepare('SELECT * FROM offline_queue WHERE synced = 0 ORDER BY id ASC').all();
}

// Пометить операцию как синхронизированную
function markSynced(id) {
    const d = init();
    d.prepare('UPDATE offline_queue SET synced = 1 WHERE id = ?').run(id);
}

// Сохранить кэш списка
function saveCache(table, items) {
    const d = init();
    const insert = d.prepare(`INSERT OR REPLACE INTO ${table} (id, data, updated_at) VALUES (?, ?, datetime('now'))`);
    const deleteAll = d.prepare(`DELETE FROM ${table}`);
    const tx = d.transaction((rows) => {
        deleteAll.run();
        for (const row of rows) {
            insert.run(row.id, JSON.stringify(row));
        }
    });
    tx(items);
}

// Получить кэш списка
function getCache(table) {
    const d = init();
    return d.prepare(`SELECT data FROM ${table} ORDER BY id DESC`).all()
        .map(r => JSON.parse(r.data));
}

// Количество ожидающих синхронизации
function getPendingCount() {
    const d = init();
    return d.prepare('SELECT COUNT(*) as cnt FROM offline_queue WHERE synced = 0').get().cnt;
}

module.exports = { init, enqueue, getPendingQueue, markSynced, saveCache, getCache, getPendingCount };
