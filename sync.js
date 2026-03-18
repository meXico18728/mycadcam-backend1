/**
 * sync.js — сервис синхронизации offline очереди с сервером.
 * Запускается на клиентских машинах.
 */
const offlineDb = require('./offline-db');

let serverUrl = 'http://localhost:4000';
let syncInterval = null;
let isSyncing = false;
let onStatusChange = null;

function configure(url, statusCallback) {
    serverUrl = url;
    onStatusChange = statusCallback;
}

function notifyStatus(online, pendingCount) {
    if (onStatusChange) onStatusChange({ online, pendingCount });
}

async function checkOnline() {
    try {
        const res = await fetch(`${serverUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
        return res.ok;
    } catch {
        return false;
    }
}

async function syncQueue(token) {
    if (isSyncing) return;
    isSyncing = true;

    const pending = offlineDb.getPendingQueue();
    if (pending.length === 0) {
        isSyncing = false;
        return;
    }

    console.log(`[sync] Синхронизация ${pending.length} операций...`);

    for (const op of pending) {
        try {
            const opts = {
                method: op.method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            };
            if (op.body) opts.body = op.body;

            const res = await fetch(`${serverUrl}${op.url}`, opts);
            if (res.ok || res.status === 400 || res.status === 409) {
                // 400/409 — дубликат или ошибка данных, всё равно помечаем как обработанное
                offlineDb.markSynced(op.id);
                console.log(`[sync] OK: ${op.method} ${op.url}`);
            } else {
                console.warn(`[sync] Ошибка ${res.status}: ${op.method} ${op.url}`);
            }
        } catch (err) {
            console.error(`[sync] Сбой: ${err.message}`);
            break; // прерываем если нет связи
        }
    }

    isSyncing = false;
}

async function refreshCache(token, tables) {
    const endpoints = {
        patients: '/api/patients',
        cases: '/api/cases',
        transactions: '/api/finances',
        restorations: '/api/restorations',
    };

    for (const table of tables) {
        const ep = endpoints[table];
        if (!ep) continue;
        try {
            const res = await fetch(`${serverUrl}${ep}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                offlineDb.saveCache(`cache_${table}`, data);
                console.log(`[sync] Кэш обновлён: ${table} (${data.length} записей)`);
            }
        } catch (err) {
            console.error(`[sync] Ошибка кэша ${table}: ${err.message}`);
        }
    }
}

async function runSync(token) {
    const online = await checkOnline();
    const pending = offlineDb.getPendingCount();
    notifyStatus(online, pending);

    if (!online) return;

    await syncQueue(token);
    await refreshCache(token, ['patients', 'cases', 'transactions', 'restorations']);

    notifyStatus(true, offlineDb.getPendingCount());
}

function startAutoSync(getToken, intervalMs = 30000) {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(async () => {
        const token = getToken();
        if (token) await runSync(token);
    }, intervalMs);

    // Первый запуск сразу
    const token = getToken();
    if (token) runSync(token);
}

function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}

module.exports = { configure, runSync, startAutoSync, stopAutoSync, checkOnline };
