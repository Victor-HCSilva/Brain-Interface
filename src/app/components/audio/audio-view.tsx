"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { cachedFetch } from "@/lib/cachedFetch";
import styles from "./audio-view.module.css";

interface Folder {
    id: number;
    name: string;
}

interface Todo {
    id: number;
    titulo: string;
}

interface AudioRecording {
    id: number;
    titulo: string;
    folder: number | null;
    folder_name: string | null;
    stream_url: string;
    created_at: string;
}

interface AudioLink {
    id: number;
    audio: number;
    todo: number;
    todo_titulo: string;
}

interface Paginated<T> {
    results: T[];
    next: string | null;
}

interface Props {
    folders: Folder[];
    folderFilter?: number | null;
    focusRecordingId?: number | null;
}

async function fetchAll<T>(path: string): Promise<T[]> {
    const results: T[] = [];
    let url = path;
    while (url) {
        const response = await cachedFetch(url);
        if (!response.ok) throw new Error("Não foi possível carregar os dados de áudio.");
        const data = await response.json() as Paginated<T> | T[];
        if (Array.isArray(data)) {
            results.push(...data);
            break;
        }
        results.push(...data.results);
        if (!data.next) break;
        const nextPage = new URL(data.next, window.location.origin);
        url = `${path.split("?")[0]}${nextPage.search}`;
    }
    return results;
}

async function responseError(response: Response, fallback: string): Promise<string> {
    const data = await response.json().catch(() => null) as Record<string, string | string[]> | null;
    if (!data) return fallback;
    for (const value of Object.values(data)) {
        if (typeof value === "string") return value;
        if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    }
    return fallback;
}

export default function AudioView({ folders, folderFilter, focusRecordingId }: Props) {
    const [recordings, setRecordings] = useState<AudioRecording[]>([]);
    const [todos, setTodos] = useState<Todo[]>([]);
    const [links, setLinks] = useState<AudioLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [title, setTitle] = useState("");
    const [folderId, setFolderId] = useState("");
    const [todoId, setTodoId] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState("");
    const [isRecording, setIsRecording] = useState(false);
    const [selectedTodos, setSelectedTodos] = useState<Record<number, string>>({});
    const previewUrlRef = useRef("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingStreamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    useEffect(() => {
        let cancelled = false;
        async function loadLibrary() {
            setLoading(true);
            try {
                const [recordingData, todoData, linkData] = await Promise.all([
                    fetchAll<AudioRecording>(folderFilter === undefined
                        ? "/api/audio-recordings/"
                        : `/api/audio-recordings/?folder=${folderFilter ?? "none"}`),
                    fetchAll<Todo>("/api/todos/"),
                    fetchAll<AudioLink>("/api/audio-linkers/"),
                ]);
                if (cancelled) return;
                setRecordings(recordingData);
                setTodos(todoData);
                setLinks(linkData);
            } catch (reason) {
                if (!cancelled) {
                    setError(reason instanceof Error ? reason.message : "Não foi possível carregar os áudios.");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void loadLibrary();
        return () => { cancelled = true; };
    }, [folderFilter]);

    useEffect(() => {
        if (focusRecordingId == null) return;
        document.getElementById(`audio-recording-${focusRecordingId}`)?.scrollIntoView({
            behavior: "smooth",
            block: "center",
        });
    }, [focusRecordingId, recordings]);

    const updateFile = useCallback((nextFile: File | null) => {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const nextUrl = nextFile ? URL.createObjectURL(nextFile) : "";
        previewUrlRef.current = nextUrl;
        setFile(nextFile);
        setPreviewUrl(nextUrl);
    }, []);

    useEffect(() => () => {
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    }, []);

    async function startRecording() {
        setError("");
        setSuccess("");
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
            setError("Este navegador não oferece suporte à gravação de áudio.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            recordingStreamRef.current = stream;
            chunksRef.current = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
                const mimeType = recorder.mimeType || "audio/webm";
                const blob = new Blob(chunksRef.current, { type: mimeType });
                if (!blob.size) {
                    setError("A gravação ficou vazia. Tente novamente.");
                } else {
                    const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
                    updateFile(new File([blob], `gravacao-${Date.now()}.${extension}`, { type: mimeType }));
                }
                stream.getTracks().forEach((track) => track.stop());
                recordingStreamRef.current = null;
                mediaRecorderRef.current = null;
                setIsRecording(false);
            };
            mediaRecorderRef.current = recorder;
            recorder.start();
            setIsRecording(true);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível iniciar a gravação.");
        }
    }

    function stopRecording() {
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    }

    async function saveRecording(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!file) return;
        setSaving(true);
        setError("");
        setSuccess("");
        const body = new FormData();
        body.append("titulo", title.trim() || file.name.replace(/\.[^.]+$/, ""));
        body.append("audio", file);
        if (folderFilter !== undefined) {
            if (folderFilter !== null) body.append("folder", String(folderFilter));
        } else if (folderId) {
            body.append("folder", folderId);
        }
        try {
            const response = await cachedFetch("/api/audio-recordings/", { method: "POST", body });
            if (!response.ok) throw new Error(await responseError(response, "Não foi possível salvar o áudio."));
            const recording = await response.json() as AudioRecording;
            setRecordings((previous) => [recording, ...previous]);
            updateFile(null);
            setTitle("");
            if (fileInputRef.current) fileInputRef.current.value = "";

            if (todoId) {
                const linkResponse = await cachedFetch("/api/audio-linkers/", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ audio: recording.id, todo: Number(todoId) }),
                });
                if (!linkResponse.ok) {
                    setError(`Áudio salvo, mas não foi possível vinculá-lo à tarefa: ${await responseError(linkResponse, "tente novamente.")}`);
                } else {
                    const link = await linkResponse.json() as AudioLink;
                    setLinks((previous) => [...previous, link]);
                    setSuccess("Áudio salvo e vinculado à tarefa.");
                }
            } else {
                setSuccess("Áudio salvo na biblioteca.");
            }
            setTodoId("");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível salvar o áudio.");
        } finally {
            setSaving(false);
        }
    }

    async function updateFolder(recording: AudioRecording, value: string) {
        setError("");
        const response = await cachedFetch(`/api/audio-recordings/${recording.id}/`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder: value ? Number(value) : null }),
        });
        if (!response.ok) {
            setError(await responseError(response, "Não foi possível atualizar a pasta."));
            return;
        }
        const updated = await response.json() as AudioRecording;
        setRecordings((previous) => folderFilter !== undefined && updated.folder !== folderFilter
            ? previous.filter((item) => item.id !== updated.id)
            : previous.map((item) => item.id === updated.id ? updated : item));
    }

    async function linkTodo(recording: AudioRecording) {
        const selectedTodo = selectedTodos[recording.id];
        if (!selectedTodo) return;
        setError("");
        const response = await cachedFetch("/api/audio-linkers/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: recording.id, todo: Number(selectedTodo) }),
        });
        if (!response.ok) {
            setError(await responseError(response, "Não foi possível vincular o áudio à tarefa."));
            return;
        }
        const link = await response.json() as AudioLink;
        setLinks((previous) => [...previous, link]);
        setSelectedTodos((previous) => ({ ...previous, [recording.id]: "" }));
    }

    async function unlinkTodo(link: AudioLink) {
        const response = await cachedFetch(`/api/audio-linkers/${link.id}/`, { method: "DELETE" });
        if (!response.ok) {
            setError(await responseError(response, "Não foi possível remover o vínculo."));
            return;
        }
        setLinks((previous) => previous.filter((item) => item.id !== link.id));
    }

    async function deleteRecording(recording: AudioRecording) {
        if (!window.confirm(`Excluir o áudio "${recording.titulo}"? Os vínculos com tarefas também serão removidos.`)) return;
        const response = await cachedFetch(`/api/audio-recordings/${recording.id}/`, { method: "DELETE" });
        if (!response.ok) {
            setError(await responseError(response, "Não foi possível excluir o áudio."));
            return;
        }
        setRecordings((previous) => previous.filter((item) => item.id !== recording.id));
        setLinks((previous) => previous.filter((item) => item.audio !== recording.id));
    }

    return (
        <section className={styles.audioView}>
            <header className={styles.heading}>
                <div>
                    <span className={styles.kicker}>BIBLIOTECA PESSOAL</span>
                    <h1>{folderFilter === undefined ? "Áudios" : "Áudios da pasta"}</h1>
                    <p>{folderFilter === undefined
                        ? "Grave e organize áudios. Vincule-os a tarefas apenas quando quiser."
                        : folderFilter === null
                            ? "Áudios que ainda não estão em uma pasta."
                            : `Áudios salvos em ${folders.find((folder) => folder.id === folderFilter)?.name ?? "esta pasta"}.`}</p>
                </div>
                <span className={styles.count}>{recordings.length} gravações</span>
            </header>

            {error && <div className={styles.error} role="alert">{error}</div>}
            {success && <div className={styles.success} role="status">{success}</div>}

            <form className={styles.recorder} onSubmit={(event) => void saveRecording(event)}>
                <h2><i className="microphone icon" /> Nova gravação</h2>
                <div className={styles.recordingActions}>
                    {!isRecording ? (
                        <button className={styles.secondaryButton} type="button" onClick={() => void startRecording()} disabled={saving}>
                            <i className="microphone icon" /> Gravar pelo microfone
                        </button>
                    ) : (
                        <button className={styles.stopButton} type="button" onClick={stopRecording}>
                            <i className="stop icon" /> Parar gravação
                        </button>
                    )}
                    <label className={styles.secondaryButton}>
                        <i className="upload icon" /> Escolher arquivo
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="audio/*,.m4a,.mp3,.ogg,.wav,.webm,.aac"
                            hidden
                            onChange={(event: ChangeEvent<HTMLInputElement>) => updateFile(event.target.files?.[0] ?? null)}
                        />
                    </label>
                </div>
                {file && (
                    <div className={styles.formFields}>
                        <span className={styles.fileName}>{file.name}</span>
                        <audio className={styles.player} controls src={previewUrl} />
                        <label className={styles.field}>
                            <span>Título</span>
                            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="Nome da gravação" />
                        </label>
                        {folderFilter === undefined && (
                            <label className={styles.field}>
                                <span>Pasta <small>(opcional)</small></span>
                                <select value={folderId} onChange={(event) => setFolderId(event.target.value)}>
                                    <option value="">Sem pasta</option>
                                    {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                                </select>
                            </label>
                        )}
                        <label className={styles.field}>
                            <span>Vincular a tarefa <small>(opcional)</small></span>
                            <select value={todoId} onChange={(event) => setTodoId(event.target.value)}>
                                <option value="">Não vincular agora</option>
                                {todos.map((todo) => <option key={todo.id} value={todo.id}>{todo.titulo}</option>)}
                            </select>
                        </label>
                        <button className={styles.primaryButton} type="submit" disabled={saving}>
                            <i className={saving ? "spinner loading icon" : "save icon"} />
                            {saving ? "Salvando..." : "Salvar áudio"}
                        </button>
                    </div>
                )}
                <p className={styles.hint}>AAC, M4A, MP3, OGG, WAV ou WEBM. Tamanho máximo: 25 MB.</p>
            </form>

            <div className={styles.libraryHeading}>
                <h2>{folderFilter === undefined ? "Sua biblioteca" : "Áudios nesta pasta"}</h2>
                <span>Os vínculos com tarefas e pastas são opcionais.</span>
            </div>
            {loading ? (
                <div className={styles.emptyState}>Carregando áudios...</div>
            ) : recordings.length === 0 ? (
                <div className={styles.emptyState}>Nenhum áudio salvo ainda. Grave ou selecione um arquivo para começar.</div>
            ) : (
                <div className={styles.recordingList}>
                    {recordings.map((recording) => {
                        const recordingLinks = links.filter((link) => link.audio === recording.id);
                        const availableTodos = todos.filter((todo) => !recordingLinks.some((link) => link.todo === todo.id));
                        return (
                            <article className={styles.recordingCard} id={`audio-recording-${recording.id}`} key={recording.id}>
                                <header className={styles.recordingHeader}>
                                    <div>
                                        <h3>{recording.titulo}</h3>
                                        <span>{new Date(recording.created_at).toLocaleString("pt-BR")}</span>
                                    </div>
                                    <button className={styles.deleteButton} type="button" title="Excluir áudio" onClick={() => void deleteRecording(recording)}>
                                        <i className="trash alternate outline icon" />
                                    </button>
                                </header>
                                <audio className={styles.player} controls preload="none" src={recording.stream_url} />
                                <label className={styles.field}>
                                    <span>Pasta</span>
                                    <select value={recording.folder ?? ""} onChange={(event) => void updateFolder(recording, event.target.value)}>
                                        <option value="">Sem pasta</option>
                                        {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                                    </select>
                                </label>
                                {recordingLinks.map((link) => (
                                    <div className={styles.todoLink} key={link.id}>
                                        <span><i className="tasks icon" /> {link.todo_titulo}</span>
                                        <button type="button" onClick={() => void unlinkTodo(link)}>Desvincular</button>
                                    </div>
                                ))}
                                <form className={styles.linkForm} onSubmit={(event) => { event.preventDefault(); void linkTodo(recording); }}>
                                    <select
                                        aria-label={`Vincular ${recording.titulo} a uma tarefa`}
                                        value={selectedTodos[recording.id] ?? ""}
                                        onChange={(event) => setSelectedTodos((previous) => ({ ...previous, [recording.id]: event.target.value }))}
                                    >
                                        <option value="">Vincular a uma tarefa...</option>
                                        {availableTodos.map((todo) => <option key={todo.id} value={todo.id}>{todo.titulo}</option>)}
                                    </select>
                                    <button type="submit" disabled={!selectedTodos[recording.id]}>Vincular</button>
                                </form>
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
