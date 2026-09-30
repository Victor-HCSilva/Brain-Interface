"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type {
    ButtonHTMLAttributes,
    FormHTMLAttributes,
    InputHTMLAttributes,
    ReactNode,
    TextareaHTMLAttributes,
} from "react";
import styles from "./workspace.module.css";
import TodoDetail from "../todo-detail/todo-detail";
import Groups from "../groups/groups";
import AgendaView, { type AgendaEvent } from "../agenda/agenda-view";
import AboutView from "../about/about-view";
import LoginPage from "../login-page/login-page";

type UiButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    basic?: boolean;
    fluid?: boolean;
    icon?: boolean;
    loading?: boolean;
    primary?: boolean;
    size?: "large" | "mini";
};

function Button({ basic, children, className, fluid, icon, loading, primary, size, ...props }: UiButtonProps) {
    const classes = ["ui", primary && "primary", basic && "basic", icon && "icon", fluid && "fluid", size, loading && "loading", "button", className].filter(Boolean).join(" ");
    return <button {...props} className={classes}>{children}</button>;
}

type UiInputProps = InputHTMLAttributes<HTMLInputElement> & {
    fluid?: boolean;
    icon?: string;
    iconPosition?: "left" | "right";
};

function Input({ className, fluid, icon, iconPosition = "left", ...props }: UiInputProps) {
    const classes = ["ui", fluid && "fluid", icon && `${iconPosition} icon`, "input", className].filter(Boolean).join(" ");
    return <div className={classes}><input {...props} />{icon && <i className={`${icon} icon`} aria-hidden="true" />}</div>;
}

function SemanticForm(props: FormHTMLAttributes<HTMLFormElement>) {
    return <form {...props} className={`ui form ${props.className ?? ""}`} />;
}

function FormField({ children, required, ...props }: { children: ReactNode; required?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
    return <div {...props} className={`${required ? "required " : ""}field ${props.className ?? ""}`}>{children}</div>;
}

const Form = Object.assign(SemanticForm, { Field: FormField });

function Icon({ name, color }: { name: string; color?: string }) {
    return <i className={`${color ?? ""} ${name} icon`} aria-hidden="true" />;
}

function Label({ basic, children }: { basic?: boolean; children: ReactNode }) {
    return <span className={`ui ${basic ? "basic " : ""}label`}>{children}</span>;
}

function Loader({ active, inline, size, children }: { active?: boolean; inline?: string | boolean; size?: string; children?: ReactNode }) {
    return <div className={`ui ${active ? "active " : ""}${inline ? "inline " : ""}${size ?? ""} text loader`}>{children}</div>;
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea {...props} />;
}

function Message({ content, negative, onDismiss, size }: { content: string; negative?: boolean; onDismiss?: () => void; size?: string }) {
    return <div className={`ui ${negative ? "negative " : ""}${size ?? ""} message`}>
        {onDismiss && <button className="ui icon button" type="button" aria-label="Fechar mensagem" onClick={onDismiss}><Icon name="close" /></button>}
        {content}
    </div>;
}

function ModalRoot({ children, closeIcon, onClose, open, size = "small" }: {
    children: ReactNode;
    closeIcon?: boolean;
    onClose: () => void;
    open: boolean;
    size?: "small" | "tiny";
}) {
    if (!open) return null;
    return <div className={styles.modalBackdrop} onMouseDown={onClose}>
        <div className={`ui ${size} modal visible active`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            {closeIcon && <button className="ui icon basic button" type="button" aria-label="Fechar" onClick={onClose}><Icon name="close" /></button>}
            {children}
        </div>
    </div>;
}

function ModalHeader({ children }: { children: ReactNode }) { return <div className="header">{children}</div>; }
function ModalContent({ children }: { children: ReactNode }) { return <div className="content">{children}</div>; }
function ModalActions({ children }: { children: ReactNode }) { return <div className="actions">{children}</div>; }
const Modal = Object.assign(ModalRoot, { Header: ModalHeader, Content: ModalContent, Actions: ModalActions });

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

interface User {
    username: string;
    first_name: string;
}

interface ChecklistItem {
    id: number;
    descricao: string;
    feito: string;
}

interface Checklist {
    id: number;
    titulo: string;
    color: string;
    itens: ChecklistItem[];
}

interface TodoForm {
    titulo: string;
    anotacao: string;
    tag: string;
    prioridade: string;
    prazo_inicial: string;
    prazo_final: string;
    folder: string;
}

const emptyForm: TodoForm = {
    titulo: "",
    anotacao: "",
    tag: "Tarefa",
    prioridade: "Média",
    prazo_inicial: "",
    prazo_final: "",
    folder: "",
};

async function readError(response: Response) {
    const data = await response.json().catch(() => null) as { detail?: string; non_field_errors?: string[] } | null;
    return data?.detail ?? data?.non_field_errors?.[0] ?? "Não foi possível concluir a operação.";
}

function localDateTime(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function displayDate(value?: string) {
    if (!value) return "Sem prazo";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value));
}

export default function Workspace() {
    const [user, setUser] = useState<User | null>(null);
    const [todos, setTodos] = useState<Todo[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [agendaEvents, setAgendaEvents] = useState<AgendaEvent[]>([]);
    const [checklists, setChecklists] = useState<Checklist[]>([]);
    const [view, setView] = useState<"tasks" | "agenda" | "checklist" | "sobre">("tasks");
    const [page, setPage] = useState(1);
    const [pageCount, setPageCount] = useState(1);
    const [selectedFolder, setSelectedFolder] = useState<number | "all" | null>("all");
    const [filter, setFilter] = useState<"all" | "open" | "done" | "favorites">("all");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [theme, setTheme] = useState<"light" | "dark">("light");
    const [error, setError] = useState("");
    const [loginError, setLoginError] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [taskOpen, setTaskOpen] = useState(false);
    const [folderOpen, setFolderOpen] = useState(false);
    const [folderName, setFolderName] = useState("");
    const [editing, setEditing] = useState<Todo | null>(null);
    const [form, setForm] = useState<TodoForm>(emptyForm);
    const [eventOpen, setEventOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<AgendaEvent | null>(null);
    const [eventForm, setEventForm] = useState({ titulo: "", descricao: "", tipo_de_evento: "Lembrete", importancia: "2", dia_do_evento: "" });
    const [checklistOpen, setChecklistOpen] = useState(false);
    const [checklistTitle, setChecklistTitle] = useState("");
    const [detailTodo, setDetailTodo] = useState<Todo | null>(null);
    const [groupsOpen, setGroupsOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [folderPickerOpen, setFolderPickerOpen] = useState(false);

    useEffect(() => {
        try {
            const storedTheme = window.localStorage.getItem("todo-theme");
            if (storedTheme === "dark" || storedTheme === "light") {
                setTheme(storedTheme);
                document.documentElement.dataset.theme = storedTheme;
            } else if (document.documentElement.dataset.theme === "dark" || document.documentElement.dataset.theme === "light") {
                setTheme(document.documentElement.dataset.theme as "light" | "dark");
            }
        } catch {
            // ignore
        }
        async function checkSession() {
            try {
                const response = await fetch("/api/auth/me/");
                if (!response.ok) return;
                setUser(await response.json() as User);
            } catch {
                setError("Não foi possível conectar à API. Confira se o backend está disponível.");
            } finally {
                setLoading(false);
            }
        }
        void checkSession();
    }, []);

    const toggleTheme = useCallback(() => {
        setTheme((prevTheme) => {
            const nextTheme = prevTheme === "dark" ? "light" : "dark";
            document.documentElement.dataset.theme = nextTheme;
            try {
                window.localStorage.setItem("todo-theme", nextTheme);
            } catch {
                // ignore
            }
            return nextTheme;
        });
    }, []);

    const loadWorkspace = useCallback(async (requestedPage = page) => {
        setLoading(true);
        setError("");
        try {
            const folderQuery = selectedFolder === "all" ? "" : `&folder=${selectedFolder ?? "none"}`;
            const [todoResponse, folderResponse, agendaResponse, checklistResponse] = await Promise.all([
                fetch(`/api/todos/?page=${requestedPage}${folderQuery}`),
                fetch("/api/folders/"),
                fetch("/api/agenda/"),
                fetch("/api/checklist/tarefas/"),
            ]);
            if (!todoResponse.ok) throw new Error(await readError(todoResponse));
            if (!folderResponse.ok) throw new Error(await readError(folderResponse));
            if (!agendaResponse.ok) throw new Error(await readError(agendaResponse));
            if (!checklistResponse.ok) throw new Error(await readError(checklistResponse));
            const todoData = await todoResponse.json() as { results?: Todo[]; count?: number };
            const folderData = await folderResponse.json() as { results?: Folder[] } | Folder[];
            const agendaData = await agendaResponse.json() as { results?: AgendaEvent[] } | AgendaEvent[];
            const checklistData = await checklistResponse.json() as { results?: Checklist[] } | Checklist[];
            setTodos(todoData.results ?? []);
            setPageCount(Math.max(1, Math.ceil((todoData.count ?? 0) / 20)));
            setFolders(Array.isArray(folderData) ? folderData : folderData.results ?? []);
            setAgendaEvents(Array.isArray(agendaData) ? agendaData : agendaData.results ?? []);
            setChecklists(Array.isArray(checklistData) ? checklistData : checklistData.results ?? []);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Falha ao carregar as tarefas.");
        } finally {
            setLoading(false);
        }
    }, [page, selectedFolder]);

    useEffect(() => {
        if (user) void loadWorkspace(page);
    }, [user, page, selectedFolder, loadWorkspace]);

    async function handleLogin(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setLoginError("");
        try {
            const response = await fetch("/api/auth/login/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            if (!response.ok) throw new Error(await readError(response));
            const profile = await fetch("/api/auth/me/");
            if (!profile.ok) throw new Error(await readError(profile));
            setUser(await profile.json() as User);
            setPassword("");
        } catch (reason) {
            setLoginError(reason instanceof Error ? reason.message : "Não foi possível entrar.");
        } finally {
            setSaving(false);
        }
    }

    async function handleLogout() {
        await fetch("/api/auth/logout/", { method: "POST" });
        setUser(null);
        setTodos([]);
        setFolders([]);
        setAgendaEvents([]);
        setChecklists([]);
        setView("tasks");
    }

    function openNewTask() {
        setEditing(null);
        setForm({ ...emptyForm, folder: typeof selectedFolder === "number" ? String(selectedFolder) : "" });
        setTaskOpen(true);
    }

    function openEditTask(todo: Todo) {
        setEditing(todo);
        setForm({
            titulo: todo.titulo,
            anotacao: todo.anotacao,
            tag: todo.tag,
            prioridade: todo.prioridade,
            prazo_inicial: localDateTime(todo.prazo_inicial),
            prazo_final: localDateTime(todo.prazo_final),
            folder: todo.folder ? String(todo.folder) : "",
        });
        setTaskOpen(true);
    }

    async function saveTask(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError("");
        const payload = {
            ...form,
            folder: form.folder ? Number(form.folder) : null,
            prazo_inicial: form.prazo_inicial ? new Date(form.prazo_inicial).toISOString() : undefined,
            prazo_final: form.prazo_final ? new Date(form.prazo_final).toISOString() : undefined,
        };
        try {
            const response = await fetch(`/api/todos/${editing ? `${editing.id}/` : ""}`, {
                method: editing ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(await readError(response));
            setTaskOpen(false);
            await loadWorkspace();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível salvar a tarefa.");
        } finally {
            setSaving(false);
        }
    }

    async function toggleComplete(todo: Todo) {
        const response = await fetch(`/api/todos/${todo.id}/toggle-complete/`, { method: "PATCH" });
        if (!response.ok) setError(await readError(response));
        else await loadWorkspace();
    }

    async function toggleFavorite(todo: Todo) {
        const response = await fetch(`/api/todos/${todo.id}/`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ favorito: !todo.favorito }),
        });
        if (!response.ok) setError(await readError(response));
        else await loadWorkspace();
    }

    async function deleteTask(todo: Todo) {
        if (!window.confirm(`Excluir “${todo.titulo}”?`)) return;
        const response = await fetch(`/api/todos/${todo.id}/`, { method: "DELETE" });
        if (!response.ok) setError(await readError(response));
        else await loadWorkspace();
    }

    async function createFolder(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        try {
            const response = await fetch("/api/folders/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: folderName }),
            });
            if (!response.ok) throw new Error(await readError(response));
            setFolderOpen(false);
            setFolderName("");
            await loadWorkspace();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível criar a pasta.");
        } finally {
            setSaving(false);
        }
    }

    function openNewEvent(dateStr?: string) {
        setEditingEvent(null);
        setEventForm({
            titulo: "",
            descricao: "",
            tipo_de_evento: "Lembrete",
            importancia: "1",
            dia_do_evento: dateStr || localDateTime(new Date().toISOString()),
        });
        setEventOpen(true);
    }

    function openEditEvent(event: AgendaEvent) {
        setEditingEvent(event);
        setEventForm({
            titulo: event.titulo,
            descricao: event.descricao,
            tipo_de_evento: event.tipo_de_evento,
            importancia: event.importancia,
            dia_do_evento: localDateTime(event.dia_do_evento),
        });
        setEventOpen(true);
    }

    async function saveEvent(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        try {
            const response = await fetch(`/api/agenda/${editingEvent ? `${editingEvent.id}/` : ""}`, {
                method: editingEvent ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...eventForm, dia_do_evento: new Date(eventForm.dia_do_evento).toISOString() }),
            });
            if (!response.ok) throw new Error(await readError(response));
            setEventOpen(false);
            await loadWorkspace();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível salvar o evento.");
        } finally {
            setSaving(false);
        }
    }

    async function deleteEvent(event: AgendaEvent) {
        if (!window.confirm(`Excluir “${event.titulo}”?`)) return;
        const response = await fetch(`/api/agenda/${event.id}/`, { method: "DELETE" });
        if (!response.ok) setError(await readError(response));
        else await loadWorkspace();
    }

    async function createChecklist(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        try {
            const response = await fetch("/api/checklist/tarefas/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ titulo: checklistTitle }),
            });
            if (!response.ok) throw new Error(await readError(response));
            setChecklistTitle("");
            setChecklistOpen(false);
            await loadWorkspace();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível criar a lista.");
        } finally {
            setSaving(false);
        }
    }

    async function addChecklistItem(event: FormEvent<HTMLFormElement>, checklist: Checklist) {
        event.preventDefault();
        const formElement = event.currentTarget;
        const description = String(new FormData(formElement).get("descricao") ?? "").trim();
        if (!description) return;
        setSaving(true);
        try {
            const response = await fetch("/api/checklist/itens/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ descricao: description, tarefa: checklist.id }),
            });
            if (!response.ok) throw new Error(await readError(response));
            formElement.reset();
            await loadWorkspace();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível adicionar o item.");
        } finally {
            setSaving(false);
        }
    }

    async function updateChecklistItem(item: ChecklistItem, status: string) {
        const response = await fetch(`/api/checklist/itens/${item.id}/`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ feito: status }),
        });
        if (!response.ok) setError(await readError(response));
        else await loadWorkspace();
    }

    async function deleteChecklist(checklist: Checklist) {
        if (!window.confirm(`Excluir a lista “${checklist.titulo}” e seus itens?`)) return;
        const response = await fetch(`/api/checklist/tarefas/${checklist.id}/`, { method: "DELETE" });
        if (!response.ok) setError(await readError(response));
        else await loadWorkspace();
    }

    const visibleTodos = todos.filter((todo) => {
        const matchesSearch = `${todo.titulo} ${todo.anotacao} ${todo.tag}`.toLowerCase().includes(search.toLowerCase());
        const matchesFilter = filter === "all" || (filter === "open" && !todo.completo)
            || (filter === "done" && todo.completo) || (filter === "favorites" && todo.favorito);
        return matchesSearch && matchesFilter;
    });
    const visibleEvents = agendaEvents.filter((event) => `${event.titulo} ${event.descricao} ${event.tipo_de_evento}`.toLowerCase().includes(search.toLowerCase()));
    const visibleChecklists = checklists.filter((checklist) => `${checklist.titulo} ${checklist.itens.map((item) => item.descricao).join(" ")}`.toLowerCase().includes(search.toLowerCase()));

    if (loading && !user) {
        return <main className={styles.loading}><Loader active inline="centered" size="large">Carregando seu espaço</Loader></main>;
    }

    if (!user) {
        return (
            <LoginPage onLogin={() => {
                // Re-check session after login
                fetch("/api/auth/me/")
                    .then((r) => r.json())
                    .then((u) => setUser(u as User))
                    .catch(() => null);
            }} />
        );
    }

    const pendingCount = todos.filter((todo) => !todo.completo).length;
    const completedCount = todos.filter((todo) => todo.completo).length;
    const greetingName = user.first_name || user.username;

    return (
        <main className={styles.appShell}>
            {mobileMenuOpen && (
                <div
                    className={styles.mobileDrawerOverlay}
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}

            <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarMobileOpen : ""}`}>
                <div className={styles.sidebarHeaderMobile}>
                    <a className={styles.brand} href="#inicio"><span className={styles.brandMark}><Icon name="leaf" /></span><span>brain<small>ESPAÇO PESSOAL</small></span></a>
                    <button className={styles.closeDrawerBtn} onClick={() => setMobileMenuOpen(false)} title="Fechar menu"><Icon name="close" /></button>
                </div>
                <div className={styles.navCaption}>VISÃO GERAL</div>
                <button className={`${styles.navItem} ${view === "tasks" && selectedFolder === "all" && filter === "all" ? styles.navActive : ""}`} onClick={() => { setView("tasks"); setSelectedFolder("all"); setFilter("all"); setPage(1); setMobileMenuOpen(false); }}><Icon name="inbox" /> Tarefas</button>
                <button className={`${styles.navItem} ${view === "tasks" && filter === "open" ? styles.navActive : ""}`} onClick={() => { setView("tasks"); setFilter("open"); setMobileMenuOpen(false); }}><Icon name="circle outline" /> Em andamento <span className={styles.navCount}>{pendingCount}</span></button>
                <button className={`${styles.navItem} ${view === "tasks" && filter === "done" ? styles.navActive : ""}`} onClick={() => { setView("tasks"); setFilter("done"); setMobileMenuOpen(false); }}><Icon name="check circle outline" /> Concluídas <span className={styles.navCount}>{completedCount}</span></button>
                <button className={`${styles.navItem} ${view === "tasks" && filter === "favorites" ? styles.navActive : ""}`} onClick={() => { setView("tasks"); setFilter("favorites"); setMobileMenuOpen(false); }}><Icon name="star outline" /> Favoritas</button>
                <button className={`${styles.navItem} ${view === "agenda" ? styles.navActive : ""}`} onClick={() => { setView("agenda"); setPage(1); setMobileMenuOpen(false); }}><Icon name="calendar alternate outline" /> Agenda</button>
                <button className={`${styles.navItem} ${view === "checklist" ? styles.navActive : ""}`} onClick={() => { setView("checklist"); setPage(1); setMobileMenuOpen(false); }}><Icon name="list ul" /> Checklist</button>
                <button className={styles.navItem} onClick={() => { setGroupsOpen(true); setMobileMenuOpen(false); }}><Icon name="users" /> Grupos de Colaboração</button>
                <button className={`${styles.navItem} ${view === "sobre" ? styles.navActive : ""}`} onClick={() => { setView("sobre"); setMobileMenuOpen(false); }}><Icon name="info circle" /> Sobre o Sistema</button>
                <div className={styles.folderHeading}><span className={styles.navCaption}>PASTAS</span><Button icon basic size="mini" title="Criar pasta" onClick={() => { setFolderOpen(true); setMobileMenuOpen(false); }}><Icon name="plus" /></Button></div>
                <button className={`${styles.navItem} ${view === "tasks" && selectedFolder === null ? styles.navActive : ""}`} onClick={() => { setView("tasks"); setSelectedFolder(null); setFilter("all"); setPage(1); setMobileMenuOpen(false); }}><Icon name="folder outline" /> Sem pasta</button>
                {folders.map((folder) => <button key={folder.id} className={`${styles.navItem} ${view === "tasks" && selectedFolder === folder.id ? styles.navActive : ""}`} onClick={() => { setView("tasks"); setSelectedFolder(folder.id); setFilter("all"); setPage(1); setMobileMenuOpen(false); }}><Icon name="folder outline" /> <span className={styles.folderName}>{folder.name}</span></button>)}
                <div className={styles.sidebarBottom}>
                    <div className={styles.profile}><span className={styles.avatar}>{greetingName.slice(0, 1).toUpperCase()}</span><span className={styles.profileName}>{greetingName}<small>{user.username}</small></span><Button icon basic size="mini" title="Sair" onClick={handleLogout}><Icon name="sign out" /></Button></div>
                </div>
            </aside>

            <section className={styles.mainPanel}>
                <header className={styles.topbar}>
                    <div className={styles.topbarLeft}>
                        <button className={styles.mobileMenuBtn} onClick={() => setMobileMenuOpen(true)} title="Abrir menu">
                            <Icon name="bars" />
                        </button>
                        <span className={styles.breadcrumb}>Meu espaço <Icon name="chevron right" /> {view === "agenda" ? "Agenda Mensal" : view === "checklist" ? "Checklist" : view === "sobre" ? "Sobre o Sistema" : selectedFolder === "all" ? "Tarefas" : selectedFolder === null ? "Sem pasta" : folders.find((folder) => folder.id === selectedFolder)?.name ?? "Pasta"}</span>
                    </div>
                    <div className={styles.topActions}>
                        <Button basic title="Grupos de Colaboração" onClick={() => setGroupsOpen(true)}><Icon name="users" /> Grupos</Button>
                        <Button icon basic title={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"} onClick={toggleTheme}><Icon name={theme === "dark" ? "sun" : "moon"} /></Button>
                        {view !== "sobre" && (
                            <Button primary onClick={view === "tasks" ? openNewTask : view === "agenda" ? () => openNewEvent() : () => setChecklistOpen(true)}>
                                <Icon name="plus" /> {view === "tasks" ? "Nova tarefa" : view === "agenda" ? "Novo evento" : "Nova lista"}
                            </Button>
                        )}
                    </div>
                </header>

                <div className={styles.content}>
                    {view === "sobre" ? (
                        <AboutView />
                    ) : view === "agenda" ? (
                        <AgendaView
                            events={agendaEvents}
                            onNewEvent={openNewEvent}
                            onEditEvent={openEditEvent}
                            onDeleteEvent={deleteEvent}
                        />
                    ) : (
                        <>
                            <div className={styles.welcomeLine}><div><span className={styles.kicker}>SEU DIA, NO SEU TEMPO</span><h1>Olá, {greetingName}.</h1><p>Um passo de cada vez. O que merece sua atenção hoje?</p></div><div className={styles.dateStamp}><span>HOJE</span><strong>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(new Date())}</strong></div></div>

                            <div className={styles.statsRow}>
                                <div className={styles.stat}><span>{view === "tasks" ? "TAREFAS NESTA PÁGINA" : "LISTAS"}</span><strong>{view === "tasks" ? todos.length : checklists.length}</strong><Icon name={view === "tasks" ? "tasks" : "list ul"} /></div>
                                <div className={styles.stat}><span>{view === "tasks" ? "EM ANDAMENTO" : "ITENS"}</span><strong>{view === "tasks" ? pendingCount : checklists.reduce((total, checklist) => total + checklist.itens.length, 0)}</strong><Icon name={view === "tasks" ? "circle outline" : "tasks"} /></div>
                                <div className={styles.stat}><span>{view === "tasks" ? "CONCLUÍDAS" : "ITENS CONCLUÍDOS"}</span><strong>{view === "tasks" ? completedCount : checklists.reduce((total, checklist) => total + checklist.itens.filter((item) => item.feito === "concluido").length, 0)}</strong><Icon name={view === "tasks" ? "check circle outline" : "check circle outline"} /></div>
                            </div>

                            <div className={styles.taskToolbar}><div><h2>{view === "tasks" ? "Suas tarefas" : "Suas listas"}</h2><span>{view === "tasks" ? `${visibleTodos.length} itens exibidos` : `${visibleChecklists.length} listas exibidas`}</span></div><div className={styles.taskControls}><Input icon="search" aria-label="Buscar" placeholder={view === "tasks" ? "Buscar tarefa..." : "Buscar lista..."} value={search} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)} />{view === "tasks" && <div className={styles.filterTabs}><button className={filter === "all" ? styles.tabActive : ""} onClick={() => setFilter("all")}>Todas</button><button className={filter === "open" ? styles.tabActive : ""} onClick={() => setFilter("open")}>Abertas</button><button className={filter === "done" ? styles.tabActive : ""} onClick={() => setFilter("done")}>Feitas</button></div>}</div></div>

                            {error && <Message negative size="small" onDismiss={() => setError("")} content={error} />}
                            <section className={styles.taskList} aria-label={view === "tasks" ? "Lista de tarefas" : "Listas checklist"}>
                                {loading ? <div className={styles.emptyState}><Loader active inline="centered" /></div> : view === "tasks" ? visibleTodos.length === 0 ? <div className={styles.emptyState}><span className={styles.emptyIcon}><Icon name="leaf" /></span><strong>Nada por aqui, por enquanto.</strong><span>Adicione uma tarefa ou ajuste os filtros.</span><Button basic onClick={openNewTask}><Icon name="plus" /> Criar tarefa</Button></div> : visibleTodos.map((todo) => (
                                    <article key={todo.id} className={`${styles.taskRow} ${todo.completo ? styles.taskDone : ""}`}>
                                        <input className={styles.taskCheck} type="checkbox" checked={todo.completo} onChange={() => void toggleComplete(todo)} aria-label={todo.completo ? "Reabrir tarefa" : "Concluir tarefa"} />
                                        <button className={styles.taskText} onClick={() => setDetailTodo(todo)}><span className={styles.taskTitle}>{todo.titulo}</span>{todo.anotacao && <span className={styles.taskNote}>{todo.anotacao}</span>}<span className={styles.taskMeta}><Label basic>{todo.tag}</Label><span><Icon name="calendar outline" /> {displayDate(todo.prazo_final)}</span>{todo.prioridade && <span className={styles.priority}><Icon name="flag outline" /> {todo.prioridade}</span>}</span></button>
                                        <div className={styles.rowActions}>
                                            <Button icon basic title={todo.favorito ? "Remover dos favoritos" : "Adicionar aos favoritos"} onClick={() => void toggleFavorite(todo)}><Icon name={todo.favorito ? "star" : "star outline"} color={todo.favorito ? "yellow" : undefined} /></Button>
                                            <Button icon basic title="Ver detalhes e anexos" onClick={() => setDetailTodo(todo)}><Icon name="eye" /></Button>
                                            <Button icon basic title="Editar tarefa" onClick={() => openEditTask(todo)}><Icon name="pencil alternate" /></Button>
                                            <Button icon basic title="Excluir tarefa" onClick={() => void deleteTask(todo)}><Icon name="trash alternate outline" /></Button>
                                        </div>
                                    </article>
                                )) : visibleChecklists.length === 0 ? <div className={styles.emptyState}><span className={styles.emptyIcon}><Icon name="list ul" /></span><strong>Nenhuma lista criada.</strong><span>Quebre um projeto em etapas menores.</span><Button basic onClick={() => setChecklistOpen(true)}><Icon name="plus" /> Criar lista</Button></div> : visibleChecklists.map((checklist) => <article key={checklist.id} className={styles.checklistBlock}><header><div><h3>{checklist.titulo}</h3><span>{checklist.itens.filter((item) => item.feito === "concluido").length} de {checklist.itens.length} concluídos</span></div><Button icon basic title="Excluir lista" onClick={() => void deleteChecklist(checklist)}><Icon name="trash alternate outline" /></Button></header>{checklist.itens.map((item) => <div className={styles.checklistItem} key={item.id}><span className={item.feito === "concluido" ? styles.itemDone : ""}>{item.descricao}</span><select aria-label={`Estado de ${item.descricao}`} value={item.feito} onChange={(event: ChangeEvent<HTMLSelectElement>) => void updateChecklistItem(item, event.target.value)}><option value="nao_iniciado">Não iniciado</option><option value="fazendo">Fazendo</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option></select></div>)}<Form className={styles.addItemForm} onSubmit={(event) => void addChecklistItem(event, checklist)}><Input name="descricao" aria-label="Descrição do item" placeholder="Adicionar item à lista" maxLength={100} /><Button icon basic type="submit" title="Adicionar item"><Icon name="plus" /></Button></Form></article>)}
                            </section>
                            {view === "tasks" && pageCount > 1 && <div className={styles.pagination}><Button basic disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="arrow left" /> Anterior</Button><span>Página {page} de {pageCount}</span><Button basic disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Próxima <Icon name="arrow right" /></Button></div>}
                            <footer className={styles.footerNote}><Icon name="lock" /> Seus dados ficam vinculados à sua conta.</footer>
                        </>
                    )}
                </div>
            </section>

            <Modal open={taskOpen} onClose={() => setTaskOpen(false)} size="small" closeIcon>
                <Modal.Header>{editing ? "Editar tarefa" : "Nova tarefa"}</Modal.Header>
                <Modal.Content>
                    <Form id="task-form" onSubmit={saveTask}>
                        <Form.Field required><label htmlFor="task-title">Título</label><Input id="task-title" value={form.titulo} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, titulo: event.target.value })} required maxLength={100} placeholder="Dê um nome para esta tarefa" /></Form.Field>
                        <Form.Field><label htmlFor="task-note">Anotação</label><TextArea id="task-note" value={form.anotacao} onChange={(event: FormEvent<HTMLTextAreaElement>) => setForm({ ...form, anotacao: event.currentTarget.value })} rows={3} maxLength={15000} placeholder="Detalhes, ideias ou contexto..." /></Form.Field>
                        <div className={styles.formColumns}><Form.Field><label htmlFor="task-tag">Categoria</label><select id="task-tag" className="ui fluid dropdown" value={form.tag} onChange={(event: ChangeEvent<HTMLSelectElement>) => setForm({ ...form, tag: event.target.value })}>{["Tarefa", "Atividade", "Anotação", "Prova", "Arquivo", "Urgente", "Importante.", "Link", "Lembrete.", "Avulso", "Outro"].map((tag) => <option key={tag}>{tag}</option>)}</select></Form.Field><Form.Field><label htmlFor="task-priority">Prioridade</label><select id="task-priority" className="ui fluid dropdown" value={form.prioridade} onChange={(event: ChangeEvent<HTMLSelectElement>) => setForm({ ...form, prioridade: event.target.value })}>{["Baixa", "Média", "Alta"].map((priority) => <option key={priority}>{priority}</option>)}</select></Form.Field></div>
                        <div className={styles.formColumns}><Form.Field><label htmlFor="task-deadline">Prazo</label><Input id="task-deadline" type="datetime-local" value={form.prazo_final} onChange={(event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, prazo_final: event.target.value })} /></Form.Field><Form.Field><label htmlFor="task-folder">Pasta</label><select id="task-folder" className="ui fluid dropdown" value={form.folder} onChange={(event: ChangeEvent<HTMLSelectElement>) => setForm({ ...form, folder: event.target.value })}><option value="">Sem pasta</option>{folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select></Form.Field></div>
                    </Form>
                </Modal.Content>
                <Modal.Actions><Button basic onClick={() => setTaskOpen(false)}>Cancelar</Button><Button primary type="submit" form="task-form" loading={saving}><Icon name="check" /> Salvar tarefa</Button></Modal.Actions>
            </Modal>

            <Modal open={folderOpen} onClose={() => setFolderOpen(false)} size="tiny" closeIcon>
                <Modal.Header>Nova pasta</Modal.Header>
                <Modal.Content><Form id="folder-form" onSubmit={createFolder}><Form.Field required><label htmlFor="folder-name">Nome da pasta</label><Input id="folder-name" value={folderName} onChange={(event: ChangeEvent<HTMLInputElement>) => setFolderName(event.target.value)} maxLength={100} placeholder="Ex.: Estudos" required /></Form.Field></Form></Modal.Content>
                <Modal.Actions><Button basic onClick={() => setFolderOpen(false)}>Cancelar</Button><Button primary type="submit" form="folder-form" loading={saving}><Icon name="folder plus" /> Criar pasta</Button></Modal.Actions>
            </Modal>

            {/* Modal de Evento da Agenda */}
            <Modal open={eventOpen} onClose={() => setEventOpen(false)} size="small" closeIcon>
                <Modal.Header>{editingEvent ? "Editar evento da agenda" : "Novo evento na agenda"}</Modal.Header>
                <Modal.Content>
                    <Form id="event-form" onSubmit={saveEvent}>
                        <Form.Field required>
                            <label htmlFor="event-title">Título do evento</label>
                            <Input
                                id="event-title"
                                value={eventForm.titulo}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setEventForm({ ...eventForm, titulo: e.target.value })}
                                required
                                maxLength={100}
                                placeholder="Ex.: Prova de Cálculo, Entrega de Trabalho..."
                            />
                        </Form.Field>
                        <Form.Field>
                            <label htmlFor="event-desc">Descrição / Detalhes</label>
                            <TextArea
                                id="event-desc"
                                value={eventForm.descricao}
                                onChange={(e: FormEvent<HTMLTextAreaElement>) => setEventForm({ ...eventForm, descricao: e.currentTarget.value })}
                                rows={3}
                                placeholder="Notas ou observações adicionais..."
                            />
                        </Form.Field>
                        <div className={styles.formColumns}>
                            <Form.Field>
                                <label htmlFor="event-type">Tipo de Evento</label>
                                <select
                                    id="event-type"
                                    className="ui fluid dropdown"
                                    value={eventForm.tipo_de_evento}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setEventForm({ ...eventForm, tipo_de_evento: e.target.value })}
                                >
                                    {["Lembrete", "Atividade", "Prova", "Trabalho", "Reunião", "Outro"].map((t) => (
                                        <option key={t}>{t}</option>
                                    ))}
                                </select>
                            </Form.Field>
                            <Form.Field>
                                <label htmlFor="event-importance">Prioridade / Importância</label>
                                <select
                                    id="event-importance"
                                    className="ui fluid dropdown"
                                    value={eventForm.importancia}
                                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setEventForm({ ...eventForm, importancia: e.target.value })}
                                >
                                    <option value="1">Baixa (1)</option>
                                    <option value="2">Média (2)</option>
                                    <option value="3">Alta (3)</option>
                                </select>
                            </Form.Field>
                        </div>
                        <Form.Field required>
                            <label htmlFor="event-date">Data e Hora do Evento</label>
                            <Input
                                id="event-date"
                                type="datetime-local"
                                value={eventForm.dia_do_evento}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setEventForm({ ...eventForm, dia_do_evento: e.target.value })}
                                required
                            />
                        </Form.Field>
                    </Form>
                </Modal.Content>
                <Modal.Actions>
                    <Button basic onClick={() => setEventOpen(false)}>Cancelar</Button>
                    <Button primary type="submit" form="event-form" loading={saving}>
                        <Icon name="check" /> Salvar evento
                    </Button>
                </Modal.Actions>
            </Modal>

            {/* Modal de Criação de Checklist */}
            <Modal open={checklistOpen} onClose={() => setChecklistOpen(false)} size="tiny" closeIcon>
                <Modal.Header>Nova Lista de Tarefas (Checklist)</Modal.Header>
                <Modal.Content>
                    <Form id="checklist-form" onSubmit={createChecklist}>
                        <Form.Field required>
                            <label htmlFor="checklist-title">Título da Lista</label>
                            <Input
                                id="checklist-title"
                                value={checklistTitle}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setChecklistTitle(e.target.value)}
                                required
                                maxLength={100}
                                placeholder="Ex.: Sprint da Semana, Planejamento..."
                            />
                        </Form.Field>
                    </Form>
                </Modal.Content>
                <Modal.Actions>
                    <Button basic onClick={() => setChecklistOpen(false)}>Cancelar</Button>
                    <Button primary type="submit" form="checklist-form" loading={saving}>
                        <Icon name="check" /> Criar lista
                    </Button>
                </Modal.Actions>
            </Modal>

            {/* Slide-over de Detalhe Completo do Todo */}
            {detailTodo && (
                <TodoDetail
                    todo={detailTodo}
                    folders={folders}
                    onClose={() => setDetailTodo(null)}
                    onSave={(updated) => {
                        setTodos((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
                        setDetailTodo(null);
                        void loadWorkspace();
                    }}
                    onDelete={(id) => {
                        setTodos((prev) => prev.filter((t) => t.id !== id));
                        setDetailTodo(null);
                        void loadWorkspace();
                    }}
                />
            )}

            {/* Modal de Gestão de Grupos de Colaboração */}
            {groupsOpen && <Groups onClose={() => setGroupsOpen(false)} />}

            {/* Modal de Seleção de Pastas no Mobile */}
            <Modal open={folderPickerOpen} onClose={() => setFolderPickerOpen(false)} size="tiny" closeIcon>
                <Modal.Header>Suas Pastas</Modal.Header>
                <Modal.Content>
                    <div className={styles.folderPickerList}>
                        <button
                            className={`${styles.folderPickerItem} ${selectedFolder === "all" ? styles.folderPickerActive : ""}`}
                            onClick={() => { setView("tasks"); setSelectedFolder("all"); setFilter("all"); setPage(1); setFolderPickerOpen(false); }}
                        >
                            <Icon name="inbox" /> Todas as Tarefas
                        </button>
                        <button
                            className={`${styles.folderPickerItem} ${selectedFolder === null ? styles.folderPickerActive : ""}`}
                            onClick={() => { setView("tasks"); setSelectedFolder(null); setFilter("all"); setPage(1); setFolderPickerOpen(false); }}
                        >
                            <Icon name="folder outline" /> Sem pasta
                        </button>
                        {folders.map((folder) => (
                            <button
                                key={folder.id}
                                className={`${styles.folderPickerItem} ${selectedFolder === folder.id ? styles.folderPickerActive : ""}`}
                                onClick={() => { setView("tasks"); setSelectedFolder(folder.id); setFilter("all"); setPage(1); setFolderPickerOpen(false); }}
                            >
                                <Icon name="folder outline" /> {folder.name}
                            </button>
                        ))}
                    </div>
                </Modal.Content>
                <Modal.Actions>
                    <Button basic onClick={() => setFolderPickerOpen(false)}>Cancelar</Button>
                    <Button primary onClick={() => { setFolderPickerOpen(false); setFolderOpen(true); }}>
                        <Icon name="plus" /> Criar nova pasta
                    </Button>
                </Modal.Actions>
            </Modal>

            {/* Barra de Navegação Inferior para Celulares */}
            <nav className={styles.mobileBottomBar}>
                <button
                    className={`${styles.mobileNavItem} ${view === "tasks" && selectedFolder === "all" ? styles.navActive : ""}`}
                    onClick={() => { setView("tasks"); setSelectedFolder("all"); setFilter("all"); setPage(1); }}
                >
                    <Icon name="inbox" />
                    <span>Tarefas</span>
                </button>
                <button
                    className={`${styles.mobileNavItem} ${view === "agenda" ? styles.navActive : ""}`}
                    onClick={() => { setView("agenda"); setPage(1); }}
                >
                    <Icon name="calendar alternate outline" />
                    <span>Agenda</span>
                </button>
                <button
                    className={`${styles.mobileNavItem} ${view === "checklist" ? styles.navActive : ""}`}
                    onClick={() => { setView("checklist"); setPage(1); }}
                >
                    <Icon name="list ul" />
                    <span>Checklist</span>
                </button>
                <button
                    className={`${styles.mobileNavItem} ${selectedFolder !== "all" && view === "tasks" ? styles.navActive : ""}`}
                    onClick={() => setFolderPickerOpen(true)}
                >
                    <Icon name="folder outline" />
                    <span>Pastas</span>
                </button>
                <button
                    className={`${styles.mobileNavItem} ${mobileMenuOpen ? styles.navActive : ""}`}
                    onClick={() => setMobileMenuOpen(true)}
                >
                    <Icon name="bars" />
                    <span>Menu</span>
                </button>
            </nav>
        </main>
    );
}