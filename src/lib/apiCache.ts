/**
 * Cache local (IndexedDB) para respostas GET da API.
 *
 * Objetivo: acumular no disco do navegador as respostas já carregadas
 * (pastas, tarefas, agenda, checklists, etc.) para evitar re-chamadas
 * à API quando o usuário volta a navegar por um contexto já visto.
 * O cache expira por tempo (TTL) e é limitado em quantidade de entradas
 * (poda por LRU), além de poder ser descartado por completo ou por
 * "tag" (grupo de recursos) sempre que uma mutação relevante ocorrer.
 *
 * Em ambientes sem IndexedDB (SSR, navegador sem suporte, modo privado
 * bloqueando storage) o cache simplesmente não é usado — tudo volta a
 * se comportar como chamada direta à API.
 */

const DB_NAME = "todo-api-cache";
const DB_VERSION = 1;
const STORE = "entries";

/** Tempo de vida padrão de uma entrada em cache. */
export const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutos
/** Quantidade máxima de respostas acumuladas simultaneamente. */
const MAX_ENTRIES = 200;

interface CacheEntry {
    url: string;
    tag: string;
    data: unknown;
    status: number;
    statusText: string;
    storedAt: number;
    lastAccessed: number;
}

function hasIndexedDb(): boolean {
    return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
    if (!hasIndexedDb()) return Promise.resolve(null);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve) => {
        try {
            const req = window.indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    const store = db.createObjectStore(STORE, { keyPath: "url" });
                    store.createIndex("byTag", "tag", { unique: false });
                    store.createIndex("byLastAccessed", "lastAccessed", { unique: false });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
    return dbPromise;
}

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T | null> {
    return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
    });
}

/** Lê uma resposta em cache, se existir e ainda estiver dentro do TTL. */
export async function cacheGet(url: string, ttlMs: number = DEFAULT_TTL_MS): Promise<{ data: unknown; status: number; statusText: string } | null> {
    const db = await openDb();
    if (!db) return null;

    const entry = await new Promise<CacheEntry | null>((resolve) => {
        try {
            const tx = db.transaction(STORE, "readonly");
            const req = tx.objectStore(STORE).get(url);
            req.onsuccess = () => resolve((req.result as CacheEntry | undefined) ?? null);
            req.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });

    if (!entry) return null;

    const expired = Date.now() - entry.storedAt > ttlMs;
    if (expired) {
        void deleteEntry(url);
        return null;
    }

    // Atualiza o "último acesso" para a política de poda por LRU.
    void touchEntry(entry);

    return { data: entry.data, status: entry.status, statusText: entry.statusText };
}

async function touchEntry(entry: CacheEntry): Promise<void> {
    const db = await openDb();
    if (!db) return;
    try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({ ...entry, lastAccessed: Date.now() });
    } catch {
        // ignora falhas de atualização de metadados
    }
}

/** Guarda uma resposta GET no cache, associada a uma tag de recurso. */
export async function cacheSet(url: string, tag: string, data: unknown, status: number, statusText: string): Promise<void> {
    const db = await openDb();
    if (!db) return;

    const entry: CacheEntry = {
        url,
        tag,
        data,
        status,
        statusText,
        storedAt: Date.now(),
        lastAccessed: Date.now(),
    };

    try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(entry);
        await promisifyRequest(tx.objectStore(STORE).count());
    } catch {
        return;
    }

    void enforceLimit(db);
}

async function deleteEntry(url: string): Promise<void> {
    const db = await openDb();
    if (!db) return;
    try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(url);
    } catch {
        // ignora
    }
}

/** Mantém o cache acumulativo, mas limitado: remove as entradas menos
 *  recentemente acessadas quando o total ultrapassa MAX_ENTRIES. */
async function enforceLimit(db: IDBDatabase): Promise<void> {
    try {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const count = await promisifyRequest(store.count());
        if (!count || count <= MAX_ENTRIES) return;

        const toRemove = count - MAX_ENTRIES;
        const index = store.index("byLastAccessed");
        let removed = 0;
        await new Promise<void>((resolve) => {
            const cursorReq = index.openCursor();
            cursorReq.onsuccess = () => {
                const cursor = cursorReq.result;
                if (!cursor || removed >= toRemove) {
                    resolve();
                    return;
                }
                cursor.delete();
                removed += 1;
                cursor.continue();
            };
            cursorReq.onerror = () => resolve();
        });
    } catch {
        // ignora falhas de poda — não é crítico
    }
}

/** Descarta todas as entradas de uma tag (ex.: "todos", "folders"). */
export async function invalidateTag(tag: string): Promise<void> {
    const db = await openDb();
    if (!db) return;
    try {
        const tx = db.transaction(STORE, "readwrite");
        const index = tx.objectStore(STORE).index("byTag");
        const cursorReq = index.openCursor(IDBKeyRange.only(tag));
        await new Promise<void>((resolve) => {
            cursorReq.onsuccess = () => {
                const cursor = cursorReq.result;
                if (!cursor) {
                    resolve();
                    return;
                }
                cursor.delete();
                cursor.continue();
            };
            cursorReq.onerror = () => resolve();
        });
    } catch {
        // ignora
    }
}

/** Descarta o cache inteiro (ex.: troca de usuário logado). */
export async function invalidateAll(): Promise<void> {
    const db = await openDb();
    if (!db) return;
    try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).clear();
    } catch {
        // ignora
    }
}
