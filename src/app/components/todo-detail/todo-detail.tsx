"use client";

import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type FormEvent,
} from "react";
import styles from "./todo-detail.module.css";

/* ── Types ──────────────────────────────────────────────────── */
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

interface Props {
    todo: Todo;
    folders: Folder[];
    onClose: () => void;
    onSave: (updated: Todo) => void;
    onDelete: (id: number) => void;
}

type Tab = "view" | "edit" | "images";

/* ── Helpers ─────────────────────────────────────────────────── */
function localDT(iso?: string) {
    if (!iso) return "";
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
}

function fmtDate(iso?: string) {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(iso));
}

function priorityBadge(p: string) {
    switch (p) {
        case "Alta": return styles.badgePriorityAlta;
        case "Média": return styles.badgePriorityMedia;
        case "Baixa": return styles.badgePriorityBaixa;
        default: return "";
    }
}

/* ── Markdown renderer (dynamic import of marked) ────────────── */
function MarkdownView({ raw }: { raw: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!ref.current) return;
        (async () => {
            try {
                const { marked } = await import("marked");
                const DOMPurify = (await import("dompurify")).default;
                const html = await marked.parse(raw, { breaks: true, gfm: true });
                const clean = DOMPurify.sanitize(html as string, {
                    FORBID_TAGS: ["script", "style", "iframe", "form"],
                    FORBID_ATTR: ["onerror", "onclick", "onload"],
                });
                if (ref.current) ref.current.innerHTML = clean;
            } catch {
                if (ref.current) ref.current.textContent = raw;
            }
        })();
    }, [raw]);

    async function handleCopy() {
        await navigator.clipboard.writeText(raw).catch(() => null);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
    }

    return (
        <div className={styles.markdownSection}>
            <div className={styles.markdownToolbar}>
                <span className={styles.markdownLabel}>
                    <i className="markdown icon" aria-hidden /> Markdown
                </span>
                <button className={styles.copyBtn} onClick={handleCopy} type="button">
                    <i className={copied ? "check icon" : "copy icon"} aria-hidden />
                    {copied ? "Copiado!" : "Copiar"}
                </button>
            </div>
            <div ref={ref} className={styles.markdownContent} />
        </div>
    );
}

/* ── Main component ──────────────────────────────────────────── */
export default function TodoDetail({ todo, folders, onClose, onSave, onDelete }: Props) {
    const [tab, setTab] = useState<Tab>("view");
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

    // images
    const [images, setImages] = useState<TodoImage[]>([]);
    const [imgLoading, setImgLoading] = useState(false);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [imgForm, setImgForm] = useState({ titulo: "", descricao: "", observacao: "" });
    const [imgFile, setImgFile] = useState<File | null>(null);
    const [imgSaving, setImgSaving] = useState(false);
    const [imgError, setImgError] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // confirm delete
    const [confirm, setConfirm] = useState(false);

    // Load images when switching to images tab
    useEffect(() => {
        if (tab !== "images") return;
        setImgLoading(true);
        fetch(`/api/images/?todo=${todo.id}`)
            .then((r) => r.json())
            .then((data: { results?: TodoImage[] } | TodoImage[]) => {
                setImages(Array.isArray(data) ? data : (data.results ?? []));
            })
            .catch(() => setImages([]))
            .finally(() => setImgLoading(false));
    }, [tab, todo.id]);

    // Close on Escape
    useEffect(() => {
        function handler(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    async function handleSave(e: FormEvent) {
        e.preventDefault();
        setSaving(true);
        setSaveError("");
        setSaveOk(false);
        try {
            const payload = {
                ...form,
                folder: form.folder ? Number(form.folder) : null,
                prazo_inicial: form.prazo_inicial ? new Date(form.prazo_inicial).toISOString() : undefined,
                prazo_final: form.prazo_final ? new Date(form.prazo_final).toISOString() : undefined,
            };
            const res = await fetch(`/api/todos/${todo.id}/`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({})) as { detail?: string };
                throw new Error(err.detail ?? "Erro ao salvar.");
            }
            const updated = await res.json() as Todo;
            setSaveOk(true);
            setTimeout(() => setSaveOk(false), 2000);
            onSave(updated);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : "Erro desconhecido.");
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        try {
            await fetch(`/api/todos/${todo.id}/`, { method: "DELETE" });
            onDelete(todo.id);
            onClose();
        } catch {
            /* ignore */
        }
    }

    async function handleToggleComplete() {
        const res = await fetch(`/api/todos/${todo.id}/toggle-complete/`, { method: "PATCH" });
        if (res.ok) {
            const updated = await res.json() as Todo;
            onSave(updated);
            setForm((f) => ({ ...f, completo: updated.completo }));
        }
    }

    async function handleUploadImage(e: FormEvent) {
        e.preventDefault();
        if (!imgFile) return;
        setImgSaving(true);
        setImgError("");
        try {
            const fd = new FormData();
            fd.append("img", imgFile);
            fd.append("titulo", imgForm.titulo || imgFile.name);
            fd.append("descricao", imgForm.descricao);
            fd.append("observacao", imgForm.observacao);
            fd.append("todo", String(todo.id));
            const res = await fetch("/api/images/", { method: "POST", body: fd });
            if (!res.ok) throw new Error("Erro ao enviar imagem.");
            const created = await res.json() as TodoImage;
            setImages((prev) => [created, ...prev]);
            setImgForm({ titulo: "", descricao: "", observacao: "" });
            setImgFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (err) {
            setImgError(err instanceof Error ? err.message : "Erro ao enviar imagem.");
        } finally {
            setImgSaving(false);
        }
    }

    async function handleDeleteImage(imgId: number) {
        await fetch(`/api/images/${imgId}/`, { method: "DELETE" }).catch(() => null);
        setImages((prev) => prev.filter((i) => i.id !== imgId));
    }

    return (
        <>
            <div className={styles.overlay} onMouseDown={onClose}>
                <div
                    className={styles.panel}
                    onMouseDown={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Detalhes: ${todo.titulo}`}
                >
                    {/* Header */}
                    <header className={styles.header}>
                        <div className={styles.headerLeft}>
                            <button
                                className={styles.closeBtn}
                                onClick={onClose}
                                type="button"
                                aria-label="Fechar"
                            >
                                ×
                            </button>
                            <h2 className={styles.headerTitle} title={todo.titulo}>
                                {todo.titulo}
                            </h2>
                        </div>
                        <div className={styles.headerActions}>
                            <button
                                className={styles.iconBtn}
                                title={form.completo ? "Marcar como pendente" : "Marcar como concluída"}
                                onClick={handleToggleComplete}
                                type="button"
                            >
                                <i className={form.completo ? "check circle icon" : "circle outline icon"} aria-hidden />
                            </button>
                            <button
                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                title="Excluir tarefa"
                                onClick={() => setConfirm(true)}
                                type="button"
                            >
                                <i className="trash alternate outline icon" aria-hidden />
                            </button>
                        </div>
                    </header>

                    {/* Tabs */}
                    <nav className={styles.tabs}>
                        {(["view", "edit", "images"] as Tab[]).map((t) => (
                            <button
                                key={t}
                                className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
                                onClick={() => setTab(t)}
                                type="button"
                            >
                                <i className={t === "view" ? "eye icon" : t === "edit" ? "edit icon" : "image icon"} aria-hidden />
                                {" "}
                                {t === "view" ? "Visualizar" : t === "edit" ? "Editar" : "Imagens"}
                            </button>
                        ))}
                    </nav>

                    {/* Body */}
                    <div className={styles.body}>
                        {/* ── VIEW TAB ────────────────────────────────── */}
                        {tab === "view" && (
                            <>
                                {/* Meta badges */}
                                <div className={styles.metaRow}>
                                    {form.completo && (
                                        <span className={`${styles.badge} ${styles.badgeComplete}`}>
                                            <i className="check icon" aria-hidden /> Concluída
                                        </span>
                                    )}
                                    {form.favorito && (
                                        <span className={`${styles.badge} ${styles.badgeFavorite}`}>
                                            <i className="star icon" aria-hidden /> Favorita
                                        </span>
                                    )}
                                    <span className={`${styles.badge} ${priorityBadge(todo.prioridade)}`}>
                                        <i className="flag icon" aria-hidden /> {todo.prioridade}
                                    </span>
                                    <span className={styles.badge}>
                                        <i className="tag icon" aria-hidden /> {todo.tag}
                                    </span>
                                    {todo.folder && (
                                        <span className={styles.badge}>
                                            <i className="folder icon" aria-hidden />
                                            {folders.find((f) => f.id === todo.folder)?.name ?? "Pasta"}
                                        </span>
                                    )}
                                </div>

                                {/* Dates */}
                                <div className={styles.dateInfo}>
                                    <span className={styles.dateInfoLabel}>Prazo:</span>
                                    <i className="calendar alternate outline icon" aria-hidden />
                                    {fmtDate(todo.prazo_final)}
                                    <span style={{ marginLeft: 12 }} className={styles.dateInfoLabel}>Início:</span>
                                    {fmtDate(todo.prazo_inicial)}
                                </div>

                                {/* Markdown */}
                                <MarkdownView raw={todo.anotacao} />

                                {/* Timestamps */}
                                <div style={{ fontSize: 10, color: "var(--muted)", display: "flex", gap: 16 }}>
                                    <span>Criado: {fmtDate(todo.created_at)}</span>
                                    <span>Atualizado: {fmtDate(todo.updated_at)}</span>
                                </div>
                            </>
                        )}

                        {/* ── EDIT TAB ────────────────────────────────── */}
                        {tab === "edit" && (
                            <form className={styles.editSection} onSubmit={handleSave} id="detail-edit-form">
                                {saveOk && <div className={styles.successMsg}><i className="check icon" /> Salvo com sucesso!</div>}
                                {saveError && <div className={styles.errorMsg}><i className="exclamation icon" /> {saveError}</div>}

                                <div className={styles.editField}>
                                    <label className={styles.editLabel} htmlFor="detail-titulo">Título</label>
                                    <input
                                        id="detail-titulo"
                                        className={styles.editInput}
                                        value={form.titulo}
                                        maxLength={100}
                                        required
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, titulo: e.target.value })}
                                    />
                                </div>

                                <div className={styles.editField}>
                                    <label className={styles.editLabel} htmlFor="detail-anotacao">Anotação (Markdown)</label>
                                    <textarea
                                        id="detail-anotacao"
                                        className={`${styles.editInput} ${styles.editTextarea}`}
                                        value={form.anotacao}
                                        maxLength={15000}
                                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, anotacao: e.target.value })}
                                    />
                                </div>

                                <div className={styles.editRow}>
                                    <div className={styles.editField}>
                                        <label className={styles.editLabel} htmlFor="detail-tag">Categoria</label>
                                        <select
                                            id="detail-tag"
                                            className={`${styles.editInput} ${styles.editSelect}`}
                                            value={form.tag}
                                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm({ ...form, tag: e.target.value })}
                                        >
                                            {["Tarefa", "Atividade", "Anotação", "Prova", "Arquivo", "Urgente", "Importante.", "Link", "Lembrete.", "Avulso", "Outro"].map((t) => (
                                                <option key={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className={styles.editField}>
                                        <label className={styles.editLabel} htmlFor="detail-prioridade">Prioridade</label>
                                        <select
                                            id="detail-prioridade"
                                            className={`${styles.editInput} ${styles.editSelect}`}
                                            value={form.prioridade}
                                            onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm({ ...form, prioridade: e.target.value })}
                                        >
                                            {["Baixa", "Média", "Alta"].map((p) => (
                                                <option key={p}>{p}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className={styles.editRow}>
                                    <div className={styles.editField}>
                                        <label className={styles.editLabel} htmlFor="detail-prazo-inicio">Início</label>
                                        <input
                                            id="detail-prazo-inicio"
                                            type="datetime-local"
                                            className={styles.editInput}
                                            value={form.prazo_inicial}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, prazo_inicial: e.target.value })}
                                        />
                                    </div>
                                    <div className={styles.editField}>
                                        <label className={styles.editLabel} htmlFor="detail-prazo-final">Prazo Final</label>
                                        <input
                                            id="detail-prazo-final"
                                            type="datetime-local"
                                            className={styles.editInput}
                                            value={form.prazo_final}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, prazo_final: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className={styles.editField}>
                                    <label className={styles.editLabel} htmlFor="detail-folder">Pasta</label>
                                    <select
                                        id="detail-folder"
                                        className={`${styles.editInput} ${styles.editSelect}`}
                                        value={form.folder}
                                        onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm({ ...form, folder: e.target.value })}
                                    >
                                        <option value="">Sem pasta</option>
                                        {folders.map((f) => (
                                            <option key={f.id} value={f.id}>{f.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className={styles.editRow}>
                                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                                        <input
                                            type="checkbox"
                                            checked={form.favorito}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, favorito: e.target.checked })}
                                        />
                                        <i className="star icon" aria-hidden /> Favorito
                                    </label>
                                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                                        <input
                                            type="checkbox"
                                            checked={form.completo}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, completo: e.target.checked })}
                                        />
                                        <i className="check circle icon" aria-hidden /> Concluída
                                    </label>
                                </div>

                                <button
                                    type="submit"
                                    className={styles.saveBtn}
                                    disabled={saving}
                                    form="detail-edit-form"
                                >
                                    <i className={saving ? "spinner loading icon" : "save icon"} aria-hidden />
                                    {saving ? "Salvando..." : "Salvar alterações"}
                                </button>
                            </form>
                        )}

                        {/* ── IMAGES TAB ─────────────────────────────── */}
                        {tab === "images" && (
                            <>
                                {/* Upload form */}
                                <form className={styles.imageForm} onSubmit={handleUploadImage} encType="multipart/form-data">
                                    <div className={styles.sectionHead}>
                                        <h3 className={styles.sectionTitle}>
                                            <i className="upload icon" aria-hidden /> Adicionar imagem
                                        </h3>
                                    </div>

                                    {imgError && <div className={styles.errorMsg}>{imgError}</div>}

                                    <div
                                        className={styles.uploadZone}
                                        onClick={() => fileInputRef.current?.click()}
                                        onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                                        role="button"
                                        tabIndex={0}
                                        aria-label="Selecionar arquivo de imagem"
                                    >
                                        <i className="image outline icon" style={{ fontSize: 28, color: "var(--accent)" }} aria-hidden />
                                        <span className={styles.uploadZoneLabel}>
                                            {imgFile ? imgFile.name : "Clique ou arraste uma imagem aqui"}
                                        </span>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        style={{ display: "none" }}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setImgFile(e.target.files?.[0] ?? null)}
                                    />

                                    <div className={styles.imageFormRow}>
                                        <div className={styles.editField}>
                                            <label className={styles.editLabel} htmlFor="img-titulo">Título</label>
                                            <input
                                                id="img-titulo"
                                                className={styles.editInput}
                                                value={imgForm.titulo}
                                                maxLength={100}
                                                placeholder="Nome da imagem"
                                                onChange={(e: ChangeEvent<HTMLInputElement>) => setImgForm({ ...imgForm, titulo: e.target.value })}
                                            />
                                        </div>
                                        <div className={styles.editField}>
                                            <label className={styles.editLabel} htmlFor="img-observacao">Observação</label>
                                            <input
                                                id="img-observacao"
                                                className={styles.editInput}
                                                value={imgForm.observacao}
                                                maxLength={100}
                                                placeholder="Ex.: Diagrama de classes"
                                                onChange={(e: ChangeEvent<HTMLInputElement>) => setImgForm({ ...imgForm, observacao: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className={styles.saveBtn}
                                        disabled={imgSaving || !imgFile}
                                    >
                                        <i className={imgSaving ? "spinner loading icon" : "upload icon"} aria-hidden />
                                        {imgSaving ? "Enviando..." : "Enviar imagem"}
                                    </button>
                                </form>

                                {/* Gallery */}
                                <div>
                                    <div className={styles.sectionHead}>
                                        <h3 className={styles.sectionTitle}>
                                            <i className="images icon" aria-hidden /> Galeria ({images.length})
                                        </h3>
                                    </div>
                                    {imgLoading ? (
                                        <div className={styles.loadingBox}>
                                            <i className="spinner loading icon" aria-hidden /> Carregando...
                                        </div>
                                    ) : images.length === 0 ? (
                                        <div className={styles.emptyImages}>Nenhuma imagem adicionada ainda.</div>
                                    ) : (
                                        <div className={styles.imagesGrid}>
                                            {images.map((img) => (
                                                <div key={img.id} className={styles.imageCard}>
                                                    <img
                                                        src={img.img}
                                                        alt={img.observacao || img.titulo}
                                                        className={styles.imageThumb}
                                                        onClick={() => setLightbox(img.img)}
                                                        loading="lazy"
                                                    />
                                                    <div className={styles.imageMeta}>
                                                        <span className={styles.imageName} title={img.titulo}>{img.titulo}</span>
                                                        <button
                                                            className={styles.imageDeleteBtn}
                                                            title="Remover imagem"
                                                            onClick={() => void handleDeleteImage(img.id)}
                                                            type="button"
                                                        >
                                                            <i className="trash icon" aria-hidden />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Lightbox */}
            {lightbox && (
                <div className={styles.lightbox} onClick={() => setLightbox(null)} role="dialog" aria-modal>
                    <img src={lightbox} className={styles.lightboxImg} alt="Visualização ampliada" />
                </div>
            )}

            {/* Confirm delete */}
            {confirm && (
                <div className={styles.confirmDialog}>
                    <div className={styles.confirmBox}>
                        <h3 className={styles.confirmTitle}>Excluir tarefa?</h3>
                        <p className={styles.confirmText}>
                            Esta ação não pode ser desfeita. A tarefa &ldquo;{todo.titulo}&rdquo; será removida permanentemente.
                        </p>
                        <div className={styles.confirmActions}>
                            <button className={styles.btnCancel} onClick={() => setConfirm(false)} type="button">Cancelar</button>
                            <button className={styles.btnDelete} onClick={() => void handleDelete()} type="button">
                                <i className="trash icon" aria-hidden /> Excluir
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
