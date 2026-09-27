"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import styles from "./groups.module.css";

interface Member {
    id: number;
    username: string;
}

interface Group {
    id: number;
    name: string;
    descricao: string;
    membros: Member[];
}

interface Props {
    onClose: () => void;
}

export default function Groups({ onClose }: Props) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState("");
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState("");
    const [expanded, setExpanded] = useState<number | null>(null);
    const [newMember, setNewMember] = useState<Record<number, string>>({});
    const [addingMember, setAddingMember] = useState<number | null>(null);

    useEffect(() => {
        void loadGroups();
    }, []);

    useEffect(() => {
        function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    async function loadGroups() {
        setLoading(true);
        try {
            const res = await fetch("/api/groups/");
            if (!res.ok) throw new Error("Erro ao carregar grupos.");
            const data = await res.json() as { results?: Group[] } | Group[];
            setGroups(Array.isArray(data) ? data : (data.results ?? []));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro desconhecido.");
        } finally {
            setLoading(false);
        }
    }

    async function createGroup(e: FormEvent) {
        e.preventDefault();
        if (!newName.trim()) return;
        setCreating(true); setError("");
        try {
            const res = await fetch("/api/groups/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newName.trim(), descricao: "" }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({})) as { detail?: string; name?: string[] };
                throw new Error(err.detail ?? err.name?.[0] ?? "Erro ao criar grupo.");
            }
            const created = await res.json() as Group;
            setGroups((prev) => [{ ...created, membros: created.membros ?? [] }, ...prev]);
            setNewName("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro ao criar grupo.");
        } finally { setCreating(false); }
    }

    async function deleteGroup(groupId: number) {
        await fetch("/api/groups/" + groupId + "/", { method: "DELETE" }).catch(() => null);
        setGroups((prev) => prev.filter((g) => g.id !== groupId));
        if (expanded === groupId) setExpanded(null);
    }

    async function addMember(group: Group, e: FormEvent) {
        e.preventDefault();
        const username = (newMember[group.id] ?? "").trim();
        if (!username) return;
        setAddingMember(group.id); setError("");
        try {
            const res = await fetch("/api/groups/" + group.id + "/members/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({})) as { detail?: string };
                throw new Error(err.detail ?? "Usuário não encontrado.");
            }
            const updated = await res.json() as Group;
            setGroups((prev) => prev.map((g) => g.id === group.id ? updated : g));
            setNewMember((prev) => ({ ...prev, [group.id]: "" }));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro ao adicionar membro.");
        } finally { setAddingMember(null); }
    }

    async function removeMember(group: Group, userId: number) {
        await fetch("/api/groups/" + group.id + "/members/" + userId + "/", { method: "DELETE" }).catch(() => null);
        setGroups((prev) => prev.map((g) =>
            g.id === group.id ? { ...g, membros: g.membros.filter((m) => m.id !== userId) } : g
        ));
    }

    return (
        <div className={styles.overlay} onMouseDown={onClose}>
            <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <header className={styles.header}>
                    <h2 className={styles.headerTitle}>
                        <i className="users icon" aria-hidden /> Grupos de colaboracao
                    </h2>
                    <button className={styles.closeBtn} onClick={onClose} type="button" aria-label="Fechar">x</button>
                </header>
                <div className={styles.body}>
                    {error && <div className={styles.errorMsg}><i className="exclamation circle icon" /> {error}</div>}

                    <div>
                        <p className={styles.sectionTitle}>Novo grupo</p>
                        <form className={styles.newGroupForm} onSubmit={createGroup}>
                            <input
                                id="new-group-name"
                                className={styles.groupInput}
                                value={newName}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                                placeholder="Nome do grupo"
                                maxLength={100}
                                required
                            />
                            <button type="submit" className={styles.addBtn} disabled={creating || !newName.trim()}>
                                <i className={creating ? "spinner loading icon" : "plus icon"} aria-hidden />
                                {creating ? "Criando..." : "Criar"}
                            </button>
                        </form>
                    </div>

                    <div>
                        <p className={styles.sectionTitle}>Meus grupos ({groups.length})</p>
                        {loading ? (
                            <div style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 13 }}>
                                <i className="spinner loading icon" /> Carregando...
                            </div>
                        ) : groups.length === 0 ? (
                            <div className={styles.emptyState}>
                                <i className="users icon" style={{ fontSize: 24, marginBottom: 8, display: "block" }} />
                                Nenhum grupo criado ainda.
                            </div>
                        ) : (
                            <div className={styles.groupList}>
                                {groups.map((group) => (
                                    <div key={group.id} className={styles.groupCard}>
                                        <div className={styles.groupCardHead}>
                                            <span className={styles.groupName}>
                                                <i className="users icon" aria-hidden />
                                                {group.name}
                                                <span className={styles.groupMemberCount}>
                                                    {(group.membros ?? []).length} membro(s)
                                                </span>
                                            </span>
                                            <div className={styles.groupCardActions}>
                                                <button
                                                    className={styles.iconBtn}
                                                    onClick={() => setExpanded(expanded === group.id ? null : group.id)}
                                                    type="button"
                                                    title="Membros"
                                                >
                                                    <i className={expanded === group.id ? "chevron up icon" : "chevron down icon"} aria-hidden />
                                                </button>
                                                <button
                                                    className={styles.iconBtn + " " + styles.iconBtnDanger}
                                                    title="Excluir"
                                                    onClick={() => void deleteGroup(group.id)}
                                                    type="button"
                                                >
                                                    <i className="trash icon" aria-hidden />
                                                </button>
                                            </div>
                                        </div>
                                        {expanded === group.id && (
                                            <>
                                                <div className={styles.memberList}>
                                                    {(group.membros ?? []).length === 0 ? (
                                                        <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>Sem membros.</p>
                                                    ) : (
                                                        (group.membros ?? []).map((m) => (
                                                            <div key={m.id} className={styles.memberRow}>
                                                                <span><i className="user icon" aria-hidden /> {m.username}</span>
                                                                <button
                                                                    className={styles.iconBtn + " " + styles.iconBtnDanger}
                                                                    onClick={() => void removeMember(group, m.id)}
                                                                    type="button"
                                                                    title="Remover"
                                                                >
                                                                    <i className="times icon" aria-hidden />
                                                                </button>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                                <form className={styles.addMemberForm} onSubmit={(e) => void addMember(group, e)}>
                                                    <input
                                                        className={styles.groupInput}
                                                        value={newMember[group.id] ?? ""}
                                                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                                            setNewMember((prev) => ({ ...prev, [group.id]: e.target.value }))
                                                        }
                                                        placeholder="Username do usuario"
                                                    />
                                                    <button type="submit" className={styles.addBtn} disabled={addingMember === group.id}>
                                                        <i className={addingMember === group.id ? "spinner loading icon" : "user plus icon"} aria-hidden />
                                                        Adicionar
                                                    </button>
                                                </form>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
