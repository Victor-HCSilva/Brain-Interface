"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
} from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import styles from "./todo-detail.module.css";
import { cachedFetch } from "@/lib/cachedFetch";

/* ── Types ──────────────────────────────────────────────────── */
interface SharedUser {
    id: number;
    username: string;
    first_name?: string;
    last_name?: string;
}

interface SharedGroup {
    id: number;
    name: string;
    membros_count?: number;
}

interface Todo {
    id: number;
    titulo: string;
    anotacao: string;
    favorito: boolean;
    completo: boolean;
    prioridade: string;
    tag: string;
    prazo_inicial: string;
    prazo_final: string;
    folder: number | null;
    created_at?: string;
    updated_at?: string;
    colaboradores_detail?: SharedUser[];
    grupos_detail?: SharedGroup[];
}

interface Folder {
    id: number;
    name: string;
}

interface TodoImage {
    id: number;
    titulo: string;
    descricao: string;
    observacao: string;
    img: string;
}

interface Tarefa {
    id: number;
    titulo: string;
    color: string;
    itens: TarefaItem[];
}

interface TarefaItem {
    id: number;
    descricao: string;
    feito: string;
    color: string;
}

interface Linker {
    id: number;
    todo: number;
    tarefa: number;
    tarefa_titulo: string;
    tarefa_color: string;
}

interface Props {
    todo: Todo;
    folders: Folder[];
    initialTab?: "view" | "images";
    onClose: () => void;
    onSave: (updated: Todo) => void;
    onDelete: (id: number) => void;
}

type Tab = "view" | "write" | "images" | "tasks" | "share";
type WriteMode = "editor" | "split" | "preview";

/* ── Helpers ─────────────────────────────────────────────────── */
function localDT(iso: string) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(iso: string) {
    if (!iso) return "Não definido";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Inválido";
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function priorityBadge(p: string) {
    if (p === "Alta" || p === "3") return styles.badgeHigh;
    if (p === "Média" || p === "2") return styles.badgeMed;
    return styles.badgeLow;
}

function readApiError(data: unknown, fallback: string): string {
    if (data && typeof data === "object") {
        for (const value of Object.values(data)) {
            if (typeof value === "string") return value;
            if (Array.isArray(value) && typeof value[0] === "string") return value[0];
        }
    }
    return fallback;
}

function MarkdownContent({ text }: { text: string }) {
    const [html, setHtml] = useState("");

    useEffect(() => {
        let cancelled = false;
        const markdown = text.replace(/https?:\/\/(127\.0\.0\.1|localhost):8000\/media\//g, "/media/");
        const rendered = marked.parse(markdown, { gfm: true, breaks: false, async: false });

        Promise.resolve().then(() => {
            if (!cancelled) {
                setHtml(DOMPurify.sanitize(rendered, { USE_PROFILES: { html: true } }));
            }
        });

        return () => {
            cancelled = true;
        };
    }, [text]);

    return <div className={styles.markdownRender} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ── Main component ──────────────────────────────────────────── */
export default function TodoDetail({ todo, folders, initialTab = "view", onClose, onSave, onDelete }: Props) {
    const [tab, setTab] = useState<Tab>(initialTab);
    const [form, setForm] = useState({
        titulo: todo.titulo,
        anotacao: todo.anotacao,
        tag: todo.tag,
        prioridade: todo.prioridade,
        prazo_inicial: localDT(todo.prazo_inicial),
        prazo_final: localDT(todo.prazo_final),
        folder: todo.folder ? String(todo.folder) : "",
        favorito: todo.favorito,
        completo: todo.completo,
    });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [saveOk, setSaveOk] = useState(false);
    const [completionError, setCompletionError] = useState("");
    const [completionSaving, setCompletionSaving] = useState(false);

    // write mode state
    const [writeMode, setWriteMode] = useState<WriteMode>("editor");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // images
    const [images, setImages] = useState<TodoImage[]>([]);
    const [imgLoading, setImgLoading] = useState(false);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [imgForm, setImgForm] = useState({ titulo: "", descricao: "", observacao: "" });
    const [imgFile, setImgFile] = useState<File | null>(null);
    const [imgSaving, setImgSaving] = useState(false);
    const [imgError, setImgError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // linked tasks
    const [linkers, setLinkers] = useState<Linker[]>([]);
    const [allTarefas, setAllTarefas] = useState<Tarefa[]>([]);
    const [linkerLoading, setLinkerLoading] = useState(false);
    const [expandedTarefa, setExpandedTarefa] = useState<number | null>(null);
    const [selectedTarefaId, setSelectedTarefaId] = useState<string>("");
    const [newChecklistTitle, setNewChecklistTitle] = useState("");
    const [checklistCreating, setChecklistCreating] = useState(false);
    const [linkingError, setLinkingError] = useState("");

    // sharing
    const [sharedUsers, setSharedUsers] = useState<SharedUser[]>(todo.colaboradores_detail ?? []);
    const [sharedGroups, setSharedGroups] = useState<SharedGroup[]>(todo.grupos_detail ?? []);
    const [availableGroups, setAvailableGroups] = useState<SharedGroup[]>([]);
    const [shareUsername, setShareUsername] = useState("");
    const [shareSelectedGroupId, setShareSelectedGroupId] = useState("");
    const [shareLoading, setShareLoading] = useState(false);
    const [shareError, setShareError] = useState("");
    const [shareSuccess, setShareSuccess] = useState("");

    // confirm delete
    const [confirm, setConfirm] = useState(false);

    // Load images when switching to images tab
    useEffect(() => {
        if (tab !== "images") return;
        setImgLoading(true);
        cachedFetch(`/api/images/?todo=${todo.id}`)
            .then((r) => r.json())
            .then((data: { results?: TodoImage[] } | TodoImage[]) => {
                setImages(Array.isArray(data) ? data : (data.results ?? []));
            })
            .catch(() => setImages([]))
            .finally(() => setImgLoading(false));
    }, [tab, todo.id]);

    // Load linked tasks when switching to tasks tab
    useEffect(() => {
        if (tab !== "tasks") return;
        setLinkerLoading(true);
        Promise.all([
            cachedFetch(`/api/linkers/?todo=${todo.id}`).then((r) => r.json()),
            cachedFetch("/api/checklist/tarefas/").then((r) => r.json()),
        ])
            .then(([linkerData, tarefaData]) => {
                const linkerArr: Linker[] = Array.isArray(linkerData)
                    ? linkerData
                    : (linkerData.results ?? []);
                const tarefaArr: Tarefa[] = Array.isArray(tarefaData)
                    ? tarefaData
                    : (tarefaData.results ?? []);
                setLinkers(linkerArr);
                setAllTarefas(tarefaArr);
            })
            .catch(() => {
                setLinkers([]);
                setAllTarefas([]);
            })
            .finally(() => setLinkerLoading(false));
    }, [tab, todo.id]);

    // Load sharing data when switching to share tab
    const loadShareData = useCallback(async () => {
        setShareLoading(true);
        setShareError("");
        try {
            const [todoRes, groupsRes] = await Promise.all([
                cachedFetch(`/api/todos/${todo.id}/`).then((r) => r.json()),
                cachedFetch("/api/groups/").then((r) => r.json()),
            ]);
            const freshTodo = todoRes as Todo;
            setSharedUsers(freshTodo.colaboradores_detail ?? []);
            setSharedGroups(freshTodo.grupos_detail ?? []);

            const groupList: SharedGroup[] = Array.isArray(groupsRes)
                ? groupsRes
                : (groupsRes.results ?? []);
            setAvailableGroups(groupList);
        } catch {
            setShareError("Erro ao carregar dados de compartilhamento.");
        } finally {
            setShareLoading(false);
        }
    }, [todo.id]);

    useEffect(() => {
        if (tab !== "share") return;
        void loadShareData();
    }, [tab, loadShareData]);

    // Close on Escape
    useEffect(() => {
        function handler(e: KeyboardEvent) {
            if (e.key === "Escape" && !lightbox && !confirm) onClose();
        }
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose, lightbox, confirm]);

    async function handleSave(e: FormEvent) {
        e.preventDefault();
        setSaving(true); setSaveError(""); setSaveOk(false);
        try {
            const res = await cachedFetch(`/api/todos/${todo.id}/`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    titulo: form.titulo,
                    anotacao: form.anotacao,
                    tag: form.tag,
                    prioridade: form.prioridade,
                    prazo_inicial: form.prazo_inicial ? new Date(form.prazo_inicial).toISOString() : null,
                    prazo_final: form.prazo_final ? new Date(form.prazo_final).toISOString() : null,
                    folder: form.folder ? Number(form.folder) : null,
                    favorito: form.favorito,
                    completo: form.completo,
                }),
            });
            if (!res.ok) throw new Error("Erro ao salvar a tarefa.");
            const updated = await res.json() as Todo;
            onSave(updated);
            setSaveOk(true);
            setTimeout(() => setSaveOk(false), 2500);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : "Erro ao salvar.");
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleComplete() {
        if (completionSaving) return;
        const next = !form.completo;
        setCompletionSaving(true);
        setCompletionError("");
        setForm((f) => ({ ...f, completo: next }));
        try {
            const res = await cachedFetch(`/api/todos/${todo.id}/toggle-complete/`, { method: "PATCH" });
            if (!res.ok) throw new Error(readApiError(await res.json().catch(() => null), "Não foi possível atualizar a tarefa."));
            const updated = await res.json() as Todo;
            onSave(updated);
        } catch (err) {
            setForm((f) => ({ ...f, completo: !next }));
            setCompletionError(err instanceof Error ? err.message : "Não foi possível atualizar a tarefa.");
        } finally {
            setCompletionSaving(false);
        }
    }

    async function handleDelete() {
        try {
            const res = await cachedFetch(`/api/todos/${todo.id}/`, { method: "DELETE" });
            if (res.ok || res.status === 204) {
                onDelete(todo.id);
                onClose();
            }
        } catch {
            setSaveError("Erro ao excluir tarefa.");
        }
    }

    function handleMdShortcut(syntax: string, wrap = false) {
        const ta = textareaRef.current;
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const val = form.anotacao;
        let inserted = "";
        if (wrap) {
            const selected = val.substring(start, end) || "texto";
            inserted = `${syntax}${selected}${syntax}`;
        } else {
            inserted = `${syntax} `;
        }
        const newVal = val.substring(0, start) + inserted + val.substring(end);
        setForm((f) => ({ ...f, anotacao: newVal }));
        setTimeout(() => {
            ta.focus();
            ta.setSelectionRange(start + inserted.length, start + inserted.length);
        }, 0);
    }

    async function handleUploadImage(e: FormEvent) {
        e.preventDefault();
        if (!imgFile) return;
        setImgSaving(true); setImgError("");
        const fd = new FormData();
        fd.append("todo", String(todo.id));
        fd.append("titulo", imgForm.titulo || imgFile.name);
        fd.append("descricao", imgForm.descricao);
        fd.append("observacao", imgForm.observacao);
        fd.append("img", imgFile);
        try {
            const res = await cachedFetch("/api/images/", { method: "POST", body: fd });
            if (!res.ok) throw new Error("Erro ao enviar imagem.");
            const created = await res.json() as TodoImage;
            setImages((prev) => [created, ...prev]);
            setImgForm({ titulo: "", descricao: "", observacao: "" });
            setImgFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (err) {
            setImgError(err instanceof Error ? err.message : "Erro ao salvar imagem.");
        } finally {
            setImgSaving(false);
        }
    }

    async function handleDeleteImage(imgId: number) {
        try {
            await cachedFetch(`/api/images/${imgId}/`, { method: "DELETE" });
            setImages((prev) => prev.filter((i) => i.id !== imgId));
        } catch {
            setImgError("Erro ao remover imagem.");
        }
    }

    async function handleLinkTarefa(e: FormEvent) {
        e.preventDefault();
        if (!selectedTarefaId) return;
        setLinkingError("");
        try {
            const res = await cachedFetch("/api/linkers/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ todo: todo.id, tarefa: Number(selectedTarefaId) }),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({})) as { detail?: string };
                throw new Error(errData.detail ?? "Esta lista já está vinculada ou é inválida.");
            }
            const created = await res.json() as Linker;
            setLinkers((prev) => [...prev, created]);
            setSelectedTarefaId("");
        } catch (err) {
            setLinkingError(err instanceof Error ? err.message : "Erro ao vincular lista.");
        }
    }

    async function handleCreateChecklist(e: FormEvent) {
        e.preventDefault();
        const title = newChecklistTitle.trim();
        if (!title) return;
        setChecklistCreating(true);
        setLinkingError("");
        try {
            const checklistResponse = await cachedFetch("/api/checklist/tarefas/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ titulo: title }),
            });
            if (!checklistResponse.ok) {
                const data = await checklistResponse.json().catch(() => null) as unknown;
                throw new Error(readApiError(data, "Não foi possível criar a checklist."));
            }
            const checklist = await checklistResponse.json() as Tarefa;
            setAllTarefas((previous) => [...previous, checklist]);
            setNewChecklistTitle("");

            const linkResponse = await cachedFetch("/api/linkers/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ todo: todo.id, tarefa: checklist.id }),
            });
            if (!linkResponse.ok) {
                const data = await linkResponse.json().catch(() => null) as unknown;
                throw new Error(`Checklist criada, mas não foi vinculada: ${readApiError(data, "tente vinculá-la pela lista abaixo.")}`);
            }
            const linker = await linkResponse.json() as Linker;
            setLinkers((previous) => [...previous, linker]);
        } catch (err) {
            setLinkingError(err instanceof Error ? err.message : "Não foi possível criar a checklist.");
        } finally {
            setChecklistCreating(false);
        }
    }

    async function handleUnlink(linkerId: number) {
        try {
            await cachedFetch(`/api/linkers/${linkerId}/`, { method: "DELETE" });
            setLinkers((prev) => prev.filter((l) => l.id !== linkerId));
        } catch {
            setLinkingError("Erro ao desvincular lista.");
        }
    }

    // Share actions
    async function handleShareAddUser(e: FormEvent) {
        e.preventDefault();
        const username = shareUsername.trim();
        if (!username) return;
        setShareLoading(true); setShareError(""); setShareSuccess("");
        try {
            const res = await cachedFetch(`/api/todos/${todo.id}/share/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_ids: [username] }),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({})) as { detail?: string };
                throw new Error(errData.detail ?? "Erro ao compartilhar com o usuário.");
            }
            const updated = await res.json() as Todo;
            setSharedUsers(updated.colaboradores_detail ?? []);
            setShareUsername("");
            setShareSuccess(`Compartilhado com @${username}!`);
            setTimeout(() => setShareSuccess(""), 3000);
        } catch (err) {
            setShareError(err instanceof Error ? err.message : "Erro ao compartilhar.");
        } finally {
            setShareLoading(false);
        }
    }

    async function handleShareAddGroup(e: FormEvent) {
        e.preventDefault();
        if (!shareSelectedGroupId) return;
        setShareLoading(true); setShareError(""); setShareSuccess("");
        try {
            const res = await cachedFetch(`/api/todos/${todo.id}/share/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ group_ids: [Number(shareSelectedGroupId)] }),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({})) as { detail?: string };
                throw new Error(errData.detail ?? "Erro ao vincular grupo.");
            }
            const updated = await res.json() as Todo;
            setSharedGroups(updated.grupos_detail ?? []);
            setShareSelectedGroupId("");
            setShareSuccess("Grupo vinculado com sucesso!");
            setTimeout(() => setShareSuccess(""), 3000);
        } catch (err) {
            setShareError(err instanceof Error ? err.message : "Erro ao vincular grupo.");
        } finally {
            setShareLoading(false);
        }
    }

    async function handleShareRemoveUser(userId: number) {
        setShareLoading(true); setShareError("");
        try {
            const res = await cachedFetch(`/api/todos/${todo.id}/share/`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_ids: [userId] }),
            });
            if (!res.ok) throw new Error("Erro ao remover compartilhamento.");
            const updated = await res.json() as Todo;
            setSharedUsers(updated.colaboradores_detail ?? []);
        } catch (err) {
            setShareError(err instanceof Error ? err.message : "Erro ao remover.");
        } finally {
            setShareLoading(false);
        }
    }

    async function handleShareRemoveGroup(groupId: number) {
        setShareLoading(true); setShareError("");
        try {
            const res = await cachedFetch(`/api/todos/${todo.id}/share/`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ group_ids: [groupId] }),
            });
            if (!res.ok) throw new Error("Erro ao desvincular grupo.");
            const updated = await res.json() as Todo;
            setSharedGroups(updated.grupos_detail ?? []);
        } catch (err) {
            setShareError(err instanceof Error ? err.message : "Erro ao desvincular grupo.");
        } finally {
            setShareLoading(false);
        }
    }

    const totalShareBadge = sharedUsers.length + sharedGroups.length;

    return (
        <div className={styles.overlay} onMouseDown={onClose}>
            <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={todo.titulo}>

                {lightbox && (
                    <div className={styles.lightbox} onClick={() => setLightbox(null)}>
                        <img src={lightbox} alt="Visualização expandida" />
                        <button className={styles.lightboxClose} onClick={() => setLightbox(null)} type="button">×</button>
                    </div>
                )}

                {confirm && (
                    <div className={styles.confirmOverlay}>
                        <div className={styles.confirmBox}>
                            <h4>Excluir esta tarefa?</h4>
                            <p>Esta ação é irreversível.</p>
                            <div className={styles.confirmActions}>
                                <button className={styles.saveBtn} onClick={() => void handleDelete()} type="button" style={{ background: "#dc2626" }}>Confirmar Exclusão</button>
                                <button className={styles.copyBtn} onClick={() => setConfirm(false)} type="button">Cancelar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Header */}
                <header className={styles.header}>
                    <h2 className={styles.title}>{todo.titulo}</h2>
                    <div className={styles.headerActions}>
                        <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Fechar">×</button>
                        <button
                            className={`${styles.iconBtn} ${styles.completeBtn} ${form.completo ? styles.completeBtnActive : ""}`}
                            title={form.completo ? "Marcar como pendente" : "Concluir"}
                            aria-label={form.completo ? "Marcar como pendente" : "Concluir tarefa"}
                            aria-pressed={form.completo}
                            disabled={completionSaving}
                            onClick={() => void handleToggleComplete()}
                            type="button"
                        >
                            <i className="check icon" aria-hidden />
                        </button>
                        <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} title="Excluir" onClick={() => setConfirm(true)} type="button">
                            <i className="trash alternate outline icon" aria-hidden />
                        </button>
                    </div>
                </header>

                {/* Tabs */}
                <nav className={styles.tabs}>
                    {(["view", "write", "images", "tasks", "share"] as Tab[]).map((t) => {
                        const labels: Record<Tab, string> = {
                            view: "Visualizar",
                            write: "Escrever",
                            images: "Imagens",
                            tasks: "Listas",
                            share: "Compartilhar",
                        };
                        const icons: Record<Tab, string> = {
                            view: "eye",
                            write: "edit outline",
                            images: "image outline",
                            tasks: "tasks",
                            share: "share alternate",
                        };
                        return (
                            <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`} onClick={() => setTab(t)} type="button">
                                <i className={`${icons[t]} icon`} aria-hidden />{" "}{labels[t]}
                                {t === "images" && images.length > 0 && <span className={styles.tabBadge}>{images.length}</span>}
                                {t === "tasks" && linkers.length > 0 && <span className={styles.tabBadge}>{linkers.length}</span>}
                                {t === "share" && totalShareBadge > 0 && <span className={styles.tabBadge}>{totalShareBadge}</span>}
                            </button>
                        );
                    })}
                </nav>

                {/* Body */}
                <div className={styles.body}>
                    {completionError && <div className={styles.errorMsg} role="alert"><i className="exclamation circle icon" /> {completionError}</div>}

                    {/* ── VIEW TAB ─────────────────────────────── */}
                    {tab === "view" && (
                        <>
                            <div className={styles.metaRow}>
                                {form.completo && <span className={`${styles.badge} ${styles.badgeComplete}`}><i className="check icon" aria-hidden /> Concluída</span>}
                                {form.favorito && <span className={`${styles.badge} ${styles.badgeFavorite}`}><i className="star icon" aria-hidden /> Favorita</span>}
                                <span className={`${styles.badge} ${priorityBadge(todo.prioridade)}`}><i className="flag icon" aria-hidden /> {todo.prioridade}</span>
                                <span className={styles.badge}><i className="tag icon" aria-hidden /> {todo.tag}</span>
                                {todo.folder && <span className={styles.badge}><i className="folder icon" aria-hidden />{folders.find((f) => f.id === todo.folder)?.name ?? "Pasta"}</span>}
                            </div>
                            <div className={styles.dateInfo}>
                                <span className={styles.dateInfoLabel}>Prazo:</span>
                                <i className="calendar alternate outline icon" aria-hidden />
                                {fmtDate(todo.prazo_final)}
                                <span style={{ marginLeft: 12 }} className={styles.dateInfoLabel}>Início:</span>
                                {fmtDate(todo.prazo_inicial)}
                            </div>
                            <div className={styles.markdownSection}>
                                {todo.anotacao ? (
                                    <MarkdownContent text={todo.anotacao} />
                                ) : (
                                    <p className={styles.emptyText}>Sem anotações nesta tarefa.</p>
                                )}
                            </div>
                            <div className={styles.actionsFooter}>
                                <button className={styles.copyBtn} onClick={async () => { await navigator.clipboard.writeText(todo.anotacao).catch(() => null); }} type="button">
                                    <i className="copy outline icon" aria-hidden /> Copiar texto
                                </button>
                                <button className={styles.saveBtn} onClick={() => setTab("write")} type="button" style={{ marginTop: 0 }}>
                                    <i className="edit icon" aria-hidden /> Editar em Escrever
                                </button>
                            </div>
                        </>
                    )}

                    {/* ── WRITE / EDIT TAB ──────────────────────── */}
                    {tab === "write" && (
                        <form onSubmit={(e) => void handleSave(e)}>
                            <div className={styles.modeToolbar}>
                                <div className={styles.modeGroup}>
                                    {(["editor", "split", "preview"] as WriteMode[]).map((m) => {
                                        const labels: Record<WriteMode, string> = { editor: "Editor", split: "Split", preview: "Preview" };
                                        return (
                                            <button key={m} className={`${styles.modeBtn} ${writeMode === m ? styles.modeBtnActive : ""}`} onClick={() => setWriteMode(m)} type="button">
                                                {labels[m]}
                                            </button>
                                        );
                                    })}
                                </div>
                                {writeMode !== "preview" && (
                                    <div className={styles.mdShortcuts}>
                                        {[
                                            { label: "B", syntax: "**", wrap: true },
                                            { label: "I", syntax: "*", wrap: true },
                                            { label: "H2", syntax: "## ", wrap: false },
                                            { label: "List", syntax: "- ", wrap: false },
                                            { label: "Quote", syntax: "> ", wrap: false },
                                            { label: "Code", syntax: "`", wrap: true },
                                        ].map((s) => (
                                            <button key={s.label} className={styles.mdBtn} title={s.label} type="button" onClick={() => handleMdShortcut(s.syntax, s.wrap ?? false)}>
                                                {s.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className={styles.editorArea}>
                                {(writeMode === "editor" || writeMode === "split") && (
                                    <textarea
                                        ref={textareaRef}
                                        className={styles.textarea}
                                        value={form.anotacao}
                                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm((f) => ({ ...f, anotacao: e.target.value }))}
                                        placeholder="Digite o conteúdo da anotação em Markdown..."
                                    />
                                )}
                                {(writeMode === "preview" || writeMode === "split") && (
                                    <div className={styles.previewPane}>
                                        <MarkdownContent text={form.anotacao || "_Nada para visualizar ainda._"} />
                                    </div>
                                )}
                            </div>

                            <p className={styles.sectionTitle} style={{ marginTop: 24 }}>Metadados da Tarefa</p>
                            <div className={styles.fieldsGrid}>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.label}>Título</label>
                                    <input className={styles.input} value={form.titulo} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, titulo: e.target.value }))} required />
                                </div>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.label}>Pasta</label>
                                    <select className={styles.select} value={form.folder} onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm((f) => ({ ...f, folder: e.target.value }))}>
                                        <option value="">Sem pasta (Raiz)</option>
                                        {folders.map((folder) => (
                                            <option key={folder.id} value={folder.id}>{folder.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.label}>Tag</label>
                                    <input className={styles.input} value={form.tag} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, tag: e.target.value }))} />
                                </div>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.label}>Prioridade</label>
                                    <select className={styles.select} value={form.prioridade} onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm((f) => ({ ...f, prioridade: e.target.value }))}>
                                        <option value="1">Baixa</option>
                                        <option value="2">Média</option>
                                        <option value="3">Alta</option>
                                    </select>
                                </div>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.label}>Data Inicial</label>
                                    <input className={styles.input} type="datetime-local" value={form.prazo_inicial} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, prazo_inicial: e.target.value }))} />
                                </div>
                                <div className={styles.fieldGroup}>
                                    <label className={styles.label}>Prazo Final</label>
                                    <input className={styles.input} type="datetime-local" value={form.prazo_final} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, prazo_final: e.target.value }))} />
                                </div>
                            </div>

                            <div className={styles.checkboxRow}>
                                <label className={styles.checkboxLabel}>
                                    <input type="checkbox" checked={form.favorito} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, favorito: e.target.checked }))} />
                                    <span>Marcar como favorita ⭐</span>
                                </label>
                                <label className={styles.checkboxLabel}>
                                    <input type="checkbox" checked={form.completo} onChange={(e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, completo: e.target.checked }))} />
                                    <span>Concluída ✅</span>
                                </label>
                            </div>

                            {saveError && <div className={styles.errorMsg}><i className="exclamation circle icon" /> {saveError}</div>}
                            {saveOk && <div className={styles.successMsg}><i className="check circle icon" /> Salvo com sucesso!</div>}

                            <div className={styles.actionsFooter}>
                                <button type="submit" className={styles.saveBtn} disabled={saving}>
                                    <i className={saving ? "spinner loading icon" : "save icon"} aria-hidden />
                                    {saving ? "Salvando..." : "Salvar alterações"}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ── IMAGES TAB ────────────────────────────── */}
                    {tab === "images" && (
                        <div>
                            <form className={styles.uploadForm} onSubmit={(e) => void handleUploadImage(e)}>
                                <div
                                    className={styles.dropZone}
                                    onClick={() => fileInputRef.current?.click()}
                                    onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                                    role="button"
                                    tabIndex={0}
                                    aria-label="Selecionar imagem"
                                >
                                    <i className="cloud upload icon" style={{ fontSize: 24, color: "var(--accent)", marginBottom: 6 }} />
                                    <p style={{ margin: 0, fontWeight: 500, fontSize: 13 }}>
                                        {imgFile ? imgFile.name : "Clique para selecionar uma imagem"}
                                    </p>
                                    <span style={{ fontSize: 11, color: "var(--muted)" }}>PNG, JPG, WEBP, GIF</span>
                                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e: ChangeEvent<HTMLInputElement>) => setImgFile(e.target.files?.[0] ?? null)} />
                                </div>
                                <div className={styles.fieldsGrid} style={{ gridTemplateColumns: "1fr 1fr" }}>
                                    <input className={styles.input} placeholder="Título da imagem" value={imgForm.titulo} onChange={(e: ChangeEvent<HTMLInputElement>) => setImgForm((f) => ({ ...f, titulo: e.target.value }))} />
                                    <input className={styles.input} placeholder="Descrição curta" value={imgForm.descricao} onChange={(e: ChangeEvent<HTMLInputElement>) => setImgForm((f) => ({ ...f, descricao: e.target.value }))} />
                                </div>
                                <input className={styles.input} placeholder="Observação / Anotação extra" value={imgForm.observacao} onChange={(e: ChangeEvent<HTMLInputElement>) => setImgForm((f) => ({ ...f, observacao: e.target.value }))} />
                                {imgError && <div className={styles.errorMsg}><i className="exclamation circle icon" /> {imgError}</div>}
                                <button type="submit" className={styles.saveBtn} disabled={imgSaving || !imgFile}>
                                    <i className={imgSaving ? "spinner loading icon" : "upload icon"} />
                                    {imgSaving ? "Enviando..." : "Enviar Imagem"}
                                </button>
                            </form>

                            {imgLoading ? (
                                <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                                    <i className="spinner loading icon" /> Carregando imagens...
                                </div>
                            ) : images.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <i className="image outline icon" style={{ fontSize: 28, marginBottom: 8, display: "block" }} />
                                    Nenhuma imagem vinculada a esta tarefa.
                                </div>
                            ) : (
                                <div className={styles.imagesGrid}>
                                    {images.map((img) => (
                                        <div key={img.id} className={styles.imageCard}>
                                            <div className={styles.imagePreviewWrap} onClick={() => setLightbox(`/api/images/${img.id}/file/`)}>
                                                <img src={`/api/images/${img.id}/file/`} alt={img.titulo || "Imagem"} className={styles.imageThumb} />
                                                <div className={styles.imageHoverOverlay}>
                                                    <i className="zoom in icon" /> Ampliar
                                                </div>
                                            </div>
                                            <div className={styles.imageCardBody}>
                                                <div className={styles.imageCardTop}>
                                                    <span className={styles.imageTitle} title={img.titulo}>{img.titulo || "Sem título"}</span>
                                                    <button className={styles.imageDeleteBtn} title="Remover" onClick={() => void handleDeleteImage(img.id)} type="button">
                                                        <i className="trash alternate outline icon" />
                                                    </button>
                                                </div>
                                                {img.observacao && <p className={styles.imageObs}>{img.observacao}</p>}
                                                {img.descricao && !img.observacao && <p className={styles.imageObs}>{img.descricao}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── TASKS / CHECKLIST TAB ────────────────── */}
                    {tab === "tasks" && (
                        <div>
                            <form className={styles.addMemberForm} onSubmit={(e) => void handleCreateChecklist(e)} style={{ marginBottom: 12 }}>
                                <input
                                    className={styles.input}
                                    aria-label="Nome da nova checklist"
                                    placeholder="Nome da nova checklist..."
                                    value={newChecklistTitle}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewChecklistTitle(e.target.value)}
                                    maxLength={100}
                                    required
                                />
                                <button className={styles.saveBtn} type="submit" disabled={checklistCreating || !newChecklistTitle.trim()} style={{ marginTop: 0, whiteSpace: "nowrap" }}>
                                    <i className={checklistCreating ? "spinner loading icon" : "plus icon"} /> Criar checklist
                                </button>
                            </form>
                            <form className={styles.addMemberForm} onSubmit={(e) => void handleLinkTarefa(e)} style={{ marginBottom: 20 }}>
                                <select
                                    className={styles.select}
                                    value={selectedTarefaId}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedTarefaId(e.target.value)}
                                    style={{ flex: 1 }}
                                >
                                    <option value="">Selecione uma lista de tarefas (checklist)...</option>
                                    {allTarefas.map((t) => (
                                        <option key={t.id} value={t.id}>{t.titulo} ({t.itens?.length ?? 0} itens)</option>
                                    ))}
                                </select>
                                <button className={styles.saveBtn} type="submit" disabled={!selectedTarefaId} style={{ marginTop: 0, whiteSpace: "nowrap" }}>
                                    <i className="plus icon" /> Vincular Lista
                                </button>
                            </form>
                            {linkingError && <div className={styles.errorMsg} style={{ marginBottom: 16 }}><i className="exclamation circle icon" /> {linkingError}</div>}

                            {linkerLoading ? (
                                <div style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                                    <i className="spinner loading icon" /> Carregando listas vinculadas...
                                </div>
                            ) : linkers.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <i className="tasks icon" style={{ fontSize: 28, marginBottom: 8, display: "block" }} />
                                    Nenhuma lista de tarefas vinculada a este Todo.
                                </div>
                            ) : (
                                <div className={styles.linkedList}>
                                    {linkers.map((linker) => {
                                        const fullTarefa = allTarefas.find((t) => t.id === linker.tarefa);
                                        const isExpanded = expandedTarefa === linker.tarefa;
                                        const doneCount = (fullTarefa?.itens ?? []).filter((i) => i.feito === "1" || i.feito === "true" || i.feito === "S").length;
                                        const totalCount = fullTarefa?.itens?.length ?? 0;
                                        const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

                                        return (
                                            <div key={linker.id} className={styles.linkedCard}>
                                                <div className={styles.linkedCardHeader}>
                                                    <button className={styles.linkedCardTitle} onClick={() => setExpandedTarefa(isExpanded ? null : linker.tarefa)} type="button">
                                                        <i className={isExpanded ? "chevron down icon" : "chevron right icon"} />
                                                        <span className={styles.colorBadge} style={{ background: linker.tarefa_color || "var(--accent)" }} />
                                                        <strong>{linker.tarefa_titulo || fullTarefa?.titulo || `Lista #${linker.tarefa}`}</strong>
                                                        <span className={styles.linkedProgressBadge}>{doneCount}/{totalCount} ({pct}%)</span>
                                                    </button>
                                                    <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => void handleUnlink(linker.id)} type="button" title="Desvincular">
                                                        <i className="times icon" />
                                                    </button>
                                                </div>
                                                <div className={styles.progressBarBg}>
                                                    <div className={styles.progressBarFill} style={{ width: `${pct}%`, background: linker.tarefa_color || "var(--accent)" }} />
                                                </div>
                                                {isExpanded && fullTarefa && (
                                                    <div className={styles.linkedItensList}>
                                                        {(fullTarefa.itens ?? []).length === 0 ? (
                                                            <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>Sem itens nesta lista.</p>
                                                        ) : (
                                                            (fullTarefa.itens ?? []).map((item) => {
                                                                const itemDone = item.feito === "1" || item.feito === "true" || item.feito === "S";
                                                                return (
                                                                    <div key={item.id} className={styles.linkedItemRow}>
                                                                        <i className={itemDone ? "check circle icon" : "circle outline icon"} style={{ color: itemDone ? "var(--accent)" : "var(--muted)" }} />
                                                                        <span style={{ textDecoration: itemDone ? "line-through" : "none", color: itemDone ? "var(--muted)" : "var(--ink)" }}>{item.descricao}</span>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── SHARE TAB ────────────────────────────── */}
                    {tab === "share" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                            {shareError && <div className={styles.errorMsg}><i className="exclamation circle icon" /> {shareError}</div>}
                            {shareSuccess && <div className={styles.successMsg}><i className="check circle icon" /> {shareSuccess}</div>}

                            <div>
                                <p className={styles.sectionTitle}><i className="user plus icon" /> Compartilhar com Usuário</p>
                                <form className={styles.addMemberForm} onSubmit={(e) => void handleShareAddUser(e)}>
                                    <input
                                        className={styles.input}
                                        value={shareUsername}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setShareUsername(e.target.value)}
                                        placeholder="Nome de usuário (ex: victor)"
                                        disabled={shareLoading}
                                    />
                                    <button type="submit" className={styles.saveBtn} disabled={shareLoading || !shareUsername.trim()} style={{ marginTop: 0, whiteSpace: "nowrap" }}>
                                        <i className={shareLoading ? "spinner loading icon" : "plus icon"} /> Compartilhar
                                    </button>
                                </form>
                            </div>

                            <div>
                                <p className={styles.sectionTitle}><i className="users icon" /> Compartilhar com Grupo de Colaboração</p>
                                <form className={styles.addMemberForm} onSubmit={(e) => void handleShareAddGroup(e)}>
                                    <select
                                        className={styles.select}
                                        value={shareSelectedGroupId}
                                        onChange={(e: ChangeEvent<HTMLSelectElement>) => setShareSelectedGroupId(e.target.value)}
                                        disabled={shareLoading}
                                        style={{ flex: 1 }}
                                    >
                                        <option value="">Selecione um grupo...</option>
                                        {availableGroups.map((g) => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                    <button type="submit" className={styles.saveBtn} disabled={shareLoading || !shareSelectedGroupId} style={{ marginTop: 0, whiteSpace: "nowrap" }}>
                                        <i className={shareLoading ? "spinner loading icon" : "users icon"} /> Vincular Grupo
                                    </button>
                                </form>
                            </div>

                            <div>
                                <p className={styles.sectionTitle}>Colaboradores com acesso ({sharedUsers.length})</p>
                                {shareLoading && sharedUsers.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: 16, color: "var(--muted)" }}><i className="spinner loading icon" /> Carregando...</div>
                                ) : sharedUsers.length === 0 ? (
                                    <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>Nenhum usuário vinculado individualmente.</p>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        {sharedUsers.map((u) => (
                                            <div key={u.id} className={styles.linkedCardHeader} style={{ padding: "8px 12px", background: "var(--surface-soft)", borderRadius: 8 }}>
                                                <span>
                                                    <i className="user icon" style={{ marginRight: 6, color: "var(--accent)" }} />
                                                    <strong>{u.username}</strong>
                                                    {u.first_name ? ` (${u.first_name} ${u.last_name ?? ""})` : ""}
                                                </span>
                                                <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => void handleShareRemoveUser(u.id)} type="button" title="Remover acesso">
                                                    <i className="times icon" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <p className={styles.sectionTitle}>Grupos vinculados ({sharedGroups.length})</p>
                                {shareLoading && sharedGroups.length === 0 ? (
                                    <div style={{ textAlign: "center", padding: 16, color: "var(--muted)" }}><i className="spinner loading icon" /> Carregando...</div>
                                ) : sharedGroups.length === 0 ? (
                                    <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>Nenhum grupo de colaboração vinculado.</p>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                        {sharedGroups.map((g) => (
                                            <div key={g.id} className={styles.linkedCardHeader} style={{ padding: "8px 12px", background: "var(--surface-soft)", borderRadius: 8 }}>
                                                <span>
                                                    <i className="users icon" style={{ marginRight: 6, color: "var(--accent)" }} />
                                                    <strong>{g.name}</strong>
                                                </span>
                                                <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => void handleShareRemoveGroup(g.id)} type="button" title="Remover grupo">
                                                    <i className="times icon" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
