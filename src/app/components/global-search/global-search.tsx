"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { cachedFetch } from "@/lib/cachedFetch";
import styles from "./global-search.module.css";

export type SearchEntityType = "task" | "event" | "audio" | "drawing" | "image" | "folder";

export interface SearchResult {
    id: number;
    type: SearchEntityType;
    title: string;
    subtitle: string;
    created_at: string;
    folder_id?: number | null;
    todo_id?: number;
}

interface SearchResponse {
    count: number;
    next: number | null;
    previous: number | null;
    results: SearchResult[];
}

interface Props {
    onSelect: (result: SearchResult) => void;
}

const TYPES: { value: SearchEntityType | "all"; label: string; icon: string }[] = [
    { value: "all", label: "Todos os tipos", icon: "search" },
    { value: "task", label: "Tarefas", icon: "tasks" },
    { value: "event", label: "Eventos", icon: "calendar alternate outline" },
    { value: "audio", label: "Áudios", icon: "microphone" },
    { value: "drawing", label: "Desenhos", icon: "paint brush" },
    { value: "image", label: "Imagens", icon: "image outline" },
    { value: "folder", label: "Pastas", icon: "folder outline" },
];

function errorMessage(data: unknown): string {
    if (data && typeof data === "object") {
        for (const value of Object.values(data)) {
            if (typeof value === "string") return value;
            if (Array.isArray(value) && typeof value[0] === "string") return value[0];
        }
    }
    return "Não foi possível pesquisar.";
}

export default function GlobalSearch({ onSelect }: Props) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState("");
    const [type, setType] = useState<SearchEntityType | "all">("all");
    const [createdAfter, setCreatedAfter] = useState("");
    const [createdBefore, setCreatedBefore] = useState("");
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [count, setCount] = useState(0);
    const [nextPage, setNextPage] = useState<number | null>(null);
    const [previousPage, setPreviousPage] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const hasFilters = Boolean(query.trim() || type !== "all" || createdAfter || createdBefore);

    useEffect(() => {
        function handlePointerDown(event: PointerEvent) {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        }
        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, []);

    useEffect(() => {
        let cancelled = false;
        if (!hasFilters) return;

        const timeout = window.setTimeout(async () => {
            const params = new URLSearchParams({ page: String(page) });
            if (query.trim()) params.set("q", query.trim());
            if (type !== "all") params.set("type", type);
            if (createdAfter) params.set("created_after", createdAfter);
            if (createdBefore) params.set("created_before", createdBefore);
            setLoading(true);
            setError("");
            try {
                const response = await cachedFetch(`/api/search/?${params}`);
                if (!response.ok) {
                    const data = await response.json().catch(() => null) as unknown;
                    throw new Error(errorMessage(data));
                }
                const data = await response.json() as SearchResponse;
                if (cancelled) return;
                setResults(data.results);
                setCount(data.count);
                setNextPage(data.next);
                setPreviousPage(data.previous);
            } catch (reason) {
                if (!cancelled) {
                    setResults([]);
                    setError(reason instanceof Error ? reason.message : "Não foi possível pesquisar.");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timeout);
        };
    }, [createdAfter, createdBefore, hasFilters, page, query, type]);

    function selectType(event: ChangeEvent<HTMLSelectElement>) {
        resetSearchState();
        setType(event.target.value as SearchEntityType | "all");
    }

    function resetSearchState() {
        setPage(1);
        setResults([]);
        setCount(0);
        setNextPage(null);
        setPreviousPage(null);
        setLoading(false);
        setError("");
    }

    return (
        <div className={styles.searchRoot} ref={rootRef}>
            <div className={styles.searchBox}>
                <i className="search icon" aria-hidden="true" />
                <input
                    type="search"
                    aria-label="Buscar em todo o espaço"
                    placeholder="Buscar em tarefas, eventos, arquivos..."
                    value={query}
                    onFocus={() => setOpen(true)}
                    onChange={(event) => { resetSearchState(); setQuery(event.target.value); setOpen(true); }}
                    onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
                />
                <button
                    type="button"
                    className={filtersOpen ? styles.filterActive : ""}
                    title="Filtros de busca"
                    aria-label="Mostrar filtros de busca"
                    aria-expanded={filtersOpen}
                    onClick={() => { setFiltersOpen((current) => !current); setOpen(true); }}
                >
                    <i className="sliders horizontal icon" aria-hidden="true" />
                </button>
            </div>
            {open && (
                <div className={styles.searchPanel}>
                    {filtersOpen && (
                        <div className={styles.filters}>
                            <label>
                                <span>Tipo</span>
                                <select value={type} onChange={selectType}>
                                    {TYPES.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                            <label>
                                <span>Criado a partir de</span>
                                <input type="date" value={createdAfter} onChange={(event) => { resetSearchState(); setCreatedAfter(event.target.value); }} />
                            </label>
                            <label>
                                <span>Criado até</span>
                                <input type="date" value={createdBefore} onChange={(event) => { resetSearchState(); setCreatedBefore(event.target.value); }} />
                            </label>
                        </div>
                    )}
                    <div className={styles.resultHeading}>
                        <span>{hasFilters ? `${count} resultado${count === 1 ? "" : "s"}` : "Pesquisa global"}</span>
                        {loading && <i className="notched circle loading icon" aria-label="Pesquisando" />}
                    </div>
                    {error ? (
                        <p className={styles.emptyState} role="alert">{error}</p>
                    ) : !hasFilters ? (
                        <p className={styles.emptyState}>Digite um termo ou escolha filtros para pesquisar.</p>
                    ) : loading && results.length === 0 ? (
                        <p className={styles.emptyState}>Pesquisando...</p>
                    ) : results.length === 0 ? (
                        <p className={styles.emptyState}>Nenhum resultado encontrado.</p>
                    ) : (
                        <div className={styles.resultList}>
                            {results.map((result) => {
                                const option = TYPES.find((item) => item.value === result.type);
                                return (
                                    <button
                                        type="button"
                                        className={styles.result}
                                        key={`${result.type}-${result.id}`}
                                        onClick={() => { setOpen(false); onSelect(result); }}
                                    >
                                        <span className={styles.resultIcon}><i className={`${option?.icon ?? "file"} icon`} aria-hidden="true" /></span>
                                        <span className={styles.resultText}>
                                            <strong>{result.title}</strong>
                                            <span>{option?.label}{result.subtitle ? ` · ${result.subtitle}` : ""}</span>
                                        </span>
                                        <time dateTime={result.created_at}>{new Date(result.created_at).toLocaleDateString("pt-BR")}</time>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    {hasFilters && (previousPage || nextPage) && (
                        <div className={styles.pagination}>
                            <button type="button" disabled={!previousPage || loading} onClick={() => setPage(previousPage ?? 1)}>Anterior</button>
                            <button type="button" disabled={!nextPage || loading} onClick={() => setPage(nextPage ?? page)}>Próxima</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
