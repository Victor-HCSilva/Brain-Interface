/**
 * Substituto "drop-in" de `fetch` para as chamadas feitas ao proxy /api/*.
 *
 * Comportamento:
 *  - GET bem-sucedido: serve do cache (IndexedDB) se ainda houver uma
 *    entrada válida para a mesma URL (mesmos query params); caso
 *    contrário chama a API normalmente e guarda o resultado em cache.
 *  - Qualquer mutação (POST/PUT/PATCH/DELETE) bem-sucedida: descarta
 *    (na interface, forçando nova chamada à API nas próximas leituras)
 *    as tags de cache relacionadas ao recurso afetado.
 *
 * Como cada chamada já existente é `fetch(url, init)` seguida de
 * `res.ok` / `res.json()`, basta trocar `fetch` por `cachedFetch` nos
 * componentes — a assinatura e o objeto Response retornado são
 * equivalentes.
 */
import { cacheGet, cacheSet, invalidateAll, invalidateTag, DEFAULT_TTL_MS } from "./apiCache";

type Tag =
    | "auth"
    | "todos"
    | "folders"
    | "agenda"
    | "agenda-configs"
    | "checklist"
    | "images"
    | "audios"
    | "drawings"
    | "linkers"
    | "groups"
    | "search"
    | "notifications"
    | "misc";

/** Resolve a "tag" (grupo de recurso) a partir do path chamado. */
function tagForPath(pathname: string): Tag {
    if (pathname.startsWith("/api/auth/")) return "auth";
    if (pathname.startsWith("/api/todos/")) return "todos";
    if (pathname.startsWith("/api/folders/")) return "folders";
    if (pathname.startsWith("/api/agenda/configs/")) return "agenda-configs";
    if (pathname.startsWith("/api/agenda/")) return "agenda";
    if (pathname.startsWith("/api/checklist/")) return "checklist";
    if (pathname.startsWith("/api/images/")) return "images";
    if (pathname.startsWith("/api/audio-recordings/") || pathname.startsWith("/api/audio-linkers/")) return "audios";
    if (pathname.startsWith("/api/drawings/") || pathname.startsWith("/api/draw-linkers/")) return "drawings";
    if (pathname.startsWith("/api/linkers/")) return "linkers";
    if (pathname.startsWith("/api/groups/")) return "groups";
    if (pathname.startsWith("/api/notifications/")) return "notifications";
    if (pathname.startsWith("/api/search/")) return "search";
    return "misc";
}

/**
 * Quando uma mutação de uma tag ocorre, quais outras tags de leitura
 * ficam potencialmente desatualizadas e também devem ser descartadas.
 * "auth" é especial: login/logout/registro trocam o usuário, então o
 * cache inteiro (de qualquer conta usada neste navegador) é limpo.
 */
const INVALIDATION_MAP: Record<Tag, Tag[] | "all"> = {
    auth: "all",
    todos: ["todos", "search"],
    folders: ["folders", "todos", "audios", "drawings", "search"],
    agenda: ["agenda", "search"],
    "agenda-configs": ["agenda-configs"],
    checklist: ["checklist", "linkers"],
    images: ["images", "search"],
    audios: ["audios", "search"],
    drawings: ["drawings", "search"],
    linkers: ["linkers"],
    groups: ["groups", "todos"],
    search: ["search"],
    notifications: ["notifications"],
    misc: ["misc"],
};

function pathnameOf(input: RequestInfo | URL): string {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    try {
        return new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://localhost").pathname;
    } catch {
        return raw;
    }
}

function urlKeyOf(input: RequestInfo | URL): string {
    return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

async function invalidateForTag(tag: Tag): Promise<void> {
    const targets = INVALIDATION_MAP[tag];
    if (targets === "all") {
        await invalidateAll();
        return;
    }
    await Promise.all(targets.map((t) => invalidateTag(t)));
}

export interface CachedFetchOptions {
    /** Sobrescreve o TTL padrão (5 min) para esta chamada específica. */
    ttlMs?: number;
}

export async function cachedFetch(input: RequestInfo | URL, init?: RequestInit, options?: CachedFetchOptions): Promise<Response> {
    const method = (init?.method ?? "GET").toUpperCase();
    const pathname = pathnameOf(input);
    const tag = tagForPath(pathname);

    if (method === "GET") {
        const key = urlKeyOf(input);
        const cached = await cacheGet(key, options?.ttlMs ?? DEFAULT_TTL_MS);
        if (cached) {
            return new Response(JSON.stringify(cached.data), {
                status: cached.status,
                statusText: cached.statusText,
                headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
            });
        }

        const res = await fetch(input, init);
        if (res.ok) {
            // Guarda em segundo plano; não atrasa a resposta ao chamador.
            res.clone().json()
                .then((data) => cacheSet(key, tag, data, res.status, res.statusText))
                .catch(() => {
                    // corpo não é JSON (ou vazio) — não há o que cachear
                });
        }
        return res;
    }

    // Mutação: sempre vai à API; em caso de sucesso, descarta o cache
    // relacionado para que a próxima leitura busque dados frescos.
    const res = await fetch(input, init);
    if (res.ok) {
        void invalidateForTag(tag);
    }
    return res;
}
