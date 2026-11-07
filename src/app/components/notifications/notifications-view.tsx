"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import styles from "./notifications-view.module.css";
import { cachedFetch } from "@/lib/cachedFetch";

interface ScheduledNotification {
    id: number;
    recipient_email: string;
    scheduled_at: string;
    message: string;
    sent_at: string | null;
    created_at: string;
}

interface Props {
    email: string;
}

function localDateTime(value: string) {
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
    }).format(new Date(value));
}

async function responseError(response: Response) {
    const data = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (data) {
        for (const [field, value] of Object.entries(data)) {
            if (typeof value === "string") return value;
            if (Array.isArray(value) && typeof value[0] === "string") return value[0];
            if (field === "recipient_email" && typeof value === "string") return value;
        }
    }
    return "Não foi possível concluir a operação.";
}

export default function NotificationsView({ email }: Props) {
    const [notifications, setNotifications] = useState<ScheduledNotification[]>([]);
    const [scheduledAt, setScheduledAt] = useState("");
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const loadNotifications = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await cachedFetch("/api/notifications/");
            if (!response.ok) throw new Error(await responseError(response));
            const data = await response.json() as { results?: ScheduledNotification[] } | ScheduledNotification[];
            setNotifications(Array.isArray(data) ? data : data.results ?? []);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível carregar as notificações.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadNotifications();
    }, [loadNotifications]);

    async function scheduleNotification(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setError("");
        setSuccess("");
        try {
            const response = await cachedFetch("/api/notifications/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    scheduled_at: new Date(scheduledAt).toISOString(),
                    message,
                }),
            });
            if (!response.ok) throw new Error(await responseError(response));
            setScheduledAt("");
            setMessage("");
            setSuccess("E-mail agendado com sucesso.");
            await loadNotifications();
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível agendar o e-mail.");
        } finally {
            setSaving(false);
        }
    }

    async function deleteNotification(notification: ScheduledNotification) {
        if (!window.confirm("Remover este agendamento de e-mail?")) return;
        setError("");
        setSuccess("");
        try {
            const response = await cachedFetch(`/api/notifications/${notification.id}/`, { method: "DELETE" });
            if (!response.ok) throw new Error(await responseError(response));
            setNotifications((current) => current.filter((item) => item.id !== notification.id));
            setSuccess("Agendamento removido.");
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "Não foi possível remover o agendamento.");
        }
    }

    const now = new Date().toISOString();
    const pending = notifications.filter((notification) => !notification.sent_at);
    const sent = notifications.filter((notification) => Boolean(notification.sent_at));

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <span className={styles.kicker}>LEMBRETES PESSOAIS</span>
                    <h1>Notificações</h1>
                    <p>Agende um e-mail para você receber no horário escolhido.</p>
                </div>
            </header>

            {error && <div className={styles.messageError} role="alert">{error}</div>}
            {success && <div className={styles.messageSuccess} role="status">{success}</div>}

            <section className={styles.composeCard} aria-labelledby="schedule-notification-heading">
                <div className={styles.cardHeading}>
                    <span className={styles.cardIcon}><i className="bell outline icon" aria-hidden="true" /></span>
                    <div>
                        <h2 id="schedule-notification-heading">Novo e-mail agendado</h2>
                        <p>A notificação será enviada para o e-mail da sua conta.</p>
                    </div>
                </div>
                <form className={styles.form} onSubmit={(event) => void scheduleNotification(event)}>
                    <div className={styles.field}>
                        <label htmlFor="notification-email">E-mail de destino</label>
                        <input id="notification-email" type="email" value={email} readOnly placeholder="Nenhum e-mail cadastrado" />
                        {!email && <span className={styles.hint}>Cadastre um e-mail na sua conta para ativar os agendamentos.</span>}
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="notification-time">Data e hora do envio</label>
                        <input
                            id="notification-time"
                            type="datetime-local"
                            min={localDateTime(now)}
                            value={scheduledAt}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => setScheduledAt(event.target.value)}
                            required
                            disabled={!email || saving}
                        />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="notification-message">Mensagem</label>
                        <textarea
                            id="notification-message"
                            value={message}
                            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setMessage(event.target.value)}
                            maxLength={500}
                            placeholder="Escreva a mensagem que deseja receber..."
                            required
                            disabled={!email || saving}
                        />
                        <span className={styles.hint}>{message.length}/500 caracteres</span>
                    </div>
                    <button className={styles.submitButton} type="submit" disabled={!email || saving || !scheduledAt || !message.trim()}>
                        <i className={saving ? "spinner loading icon" : "bell outline icon"} aria-hidden="true" />
                        {saving ? "Agendando..." : "Agendar e-mail"}
                    </button>
                </form>
            </section>

            <section className={styles.listSection} aria-labelledby="notifications-list-heading">
                <div className={styles.listHeader}>
                    <div>
                        <h2 id="notifications-list-heading">Seus agendamentos</h2>
                        <p>{pending.length} pendente{pending.length === 1 ? "" : "s"} · {sent.length} enviado{sent.length === 1 ? "" : "s"}</p>
                    </div>
                </div>
                {loading ? (
                    <div className={styles.emptyState}><i className="spinner loading icon" /> Carregando notificações...</div>
                ) : notifications.length === 0 ? (
                    <div className={styles.emptyState}>Você ainda não tem e-mails agendados.</div>
                ) : (
                    <div className={styles.notificationList}>
                        {notifications.map((notification) => {
                            const isSent = Boolean(notification.sent_at);
                            return (
                                <article className={styles.notificationCard} key={notification.id}>
                                    <div className={styles.notificationMain}>
                                        <span className={`${styles.status} ${isSent ? styles.statusSent : styles.statusPending}`}>
                                            <i className={isSent ? "check circle icon" : "clock outline icon"} aria-hidden="true" />
                                            {isSent ? "Enviado" : "Agendado"}
                                        </span>
                                        <time dateTime={notification.sent_at ?? notification.scheduled_at}>
                                            {formatDate(notification.sent_at ?? notification.scheduled_at)}
                                        </time>
                                        <p>{notification.message}</p>
                                        <span className={styles.recipient}>Para: {notification.recipient_email}</span>
                                    </div>
                                    {!isSent && (
                                        <button className={styles.deleteButton} type="button" onClick={() => void deleteNotification(notification)} aria-label="Remover agendamento" title="Remover agendamento">
                                            <i className="trash alternate outline icon" aria-hidden="true" />
                                        </button>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
