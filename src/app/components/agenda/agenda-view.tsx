"use client";

import { useEffect, useState, useMemo } from "react";
import styles from "./agenda-view.module.css";
import { cachedFetch } from "@/lib/cachedFetch";

export interface AgendaEvent {
    id: number;
    titulo: string;
    descricao: string;
    tipo_de_evento: string;
    importancia: string;
    dia_do_evento: string;
    email_notification_at?: string | null;
    email_notification_message?: string;
}

export interface AgendaColors {
    user?: number;
    cor_de_destaque: string;
    cor_do_dia: string;
}

interface Props {
    events: AgendaEvent[];
    onNewEvent: (dateStr?: string) => void;
    onEditEvent: (event: AgendaEvent) => void;
    onDeleteEvent: (event: AgendaEvent) => void;
}

const PRESET_COLORS = [
    { name: "Azul", value: "#3b82f6" },
    { name: "Verde", value: "#10b981" },
    { name: "Vermelho", value: "#ef4444" },
    { name: "Amarelo", value: "#f59e0b" },
    { name: "Roxo", value: "#8b5cf6" },
    { name: "Rosa", value: "#ec4899" },
    { name: "Turquesa", value: "#06b6d4" },
    { name: "Dourado", value: "#eab308" },
    { name: "Cinza", value: "#64748b" },
    { name: "Escuro", value: "#1e293b" },
];

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function cleanValue(raw: string): string {
    if (!raw) return "";
    let val = raw.trim();
    if (val.startsWith("(") && val.endsWith(")")) {
        val = val.slice(1, -1);
        const parts = val.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
        return parts[1] || parts[0] || raw;
    }
    return val;
}

export function cleanImportance(raw: string): { label: string; level: string } {
    const val = cleanValue(raw);
    if (val === "3" || val.toLowerCase().includes("máx") || val.toLowerCase().includes("max")) {
        return { label: "Alta (3)", level: "alta" };
    }
    if (val === "2" || val.toLowerCase().includes("med")) {
        return { label: "Média (2)", level: "media" };
    }
    return { label: "Baixa (1)", level: "baixa" };
}

export default function AgendaView({ events, onNewEvent, onEditEvent, onDeleteEvent }: Props) {
    const today = new Date();
    const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState<Date | null>(today);
    const [colors, setColors] = useState<AgendaColors>({
        cor_de_destaque: "#3b82f6",
        cor_do_dia: "#3b82f6",
    });
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [tempColors, setTempColors] = useState<AgendaColors>(colors);
    const [savingColors, setSavingColors] = useState(false);

    // Carregar configurações de cores
    useEffect(() => {
        async function loadColors() {
            try {
                const res = await cachedFetch("/api/agenda/configs/");
                if (!res.ok) return;
                const data = await res.json();
                const config = Array.isArray(data) ? data[0] : data;
                if (config && config.cor_de_destaque) {
                    setColors({
                        cor_de_destaque: config.cor_de_destaque || "#3b82f6",
                        cor_do_dia: config.cor_do_dia || "#3b82f6",
                    });
                    setTempColors({
                        cor_de_destaque: config.cor_de_destaque || "#3b82f6",
                        cor_do_dia: config.cor_do_dia || "#3b82f6",
                    });
                }
            } catch {
                // Manter padrão se falhar
            }
        }
        void loadColors();
    }, []);

    const monthName = viewDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    function prevMonth() {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    }

    function nextMonth() {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    }

    function jumpToday() {
        const now = new Date();
        setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
        setSelectedDate(now);
    }

    async function saveColors() {
        setSavingColors(true);
        try {
            const res = await cachedFetch("/api/agenda/configs/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(tempColors),
            });
            if (res.ok) {
                setColors(tempColors);
                setConfigModalOpen(false);
            }
        } catch {
            //
        } finally {
            setSavingColors(false);
        }
    }

    // Gerar matriz de dias do calendário
    const calendarDays = useMemo(() => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);

        // Ajuste para semana começando na Segunda-feira (0 = Segunda, ..., 6 = Domingo)
        let firstDayIndex = firstDayOfMonth.getDay() - 1;
        if (firstDayIndex < 0) firstDayIndex = 6;

        const days = [];

        // Dias do mês anterior
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = firstDayIndex - 1; i >= 0; i--) {
            const d = new Date(year, month - 1, prevMonthLastDay - i);
            days.push({ date: d, isCurrentMonth: false });
        }

        // Dias do mês atual
        for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
            const d = new Date(year, month, i);
            days.push({ date: d, isCurrentMonth: true });
        }

        // Dias do próximo mês para completar múltiplos de 7
        const remaining = 7 - (days.length % 7);
        if (remaining < 7) {
            for (let i = 1; i <= remaining; i++) {
                const d = new Date(year, month + 1, i);
                days.push({ date: d, isCurrentMonth: false });
            }
        }

        return days;
    }, [viewDate]);

    // Mapear eventos por string YYYY-MM-DD
    const eventsByDate = useMemo(() => {
        const map = new Map<string, AgendaEvent[]>();
        for (const ev of events) {
            if (!ev.dia_do_evento) continue;
            const d = new Date(ev.dia_do_evento);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const list = map.get(key) || [];
            list.push(ev);
            map.set(key, list);
        }
        return map;
    }, [events]);

    // Eventos do dia selecionado ou do mês atual
    const displayedEvents = useMemo(() => {
        if (selectedDate) {
            const key = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
            return eventsByDate.get(key) || [];
        }
        // Se nenhum dia específico estiver selecionado, exibe todos os eventos do mês
        return events.filter((ev) => {
            const d = new Date(ev.dia_do_evento);
            return d.getFullYear() === viewDate.getFullYear() && d.getMonth() === viewDate.getMonth();
        });
    }, [selectedDate, eventsByDate, events, viewDate]);

    const isSameDay = (d1: Date, d2: Date) =>
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();

    return (
        <div
            className={styles.agendaContainer}
            style={
                {
                    "--agenda-destaque": colors.cor_de_destaque,
                    "--agenda-dia": colors.cor_do_dia,
                } as React.CSSProperties
            }
        >
            {/* Header de Navegação do Mês */}
            <div className={styles.agendaHeader}>
                <div className={styles.monthNav}>
                    <div className={styles.navButtons}>
                        <button className={styles.navBtn} onClick={prevMonth} aria-label="Mês anterior">
                            <i className="chevron left icon" />
                        </button>
                        <button className={styles.navBtn} onClick={nextMonth} aria-label="Próximo mês">
                            <i className="chevron right icon" />
                        </button>
                    </div>
                    <span className={styles.monthTitle}>{monthName}</span>
                    <button className={styles.todayBtn} onClick={jumpToday}>
                        Hoje
                    </button>
                </div>

                <div className={styles.agendaActions}>
                    <button
                        className="ui basic button"
                        onClick={() => {
                            setTempColors(colors);
                            setConfigModalOpen(true);
                        }}
                    >
                        <i className="paint brush icon" /> Cores da Agenda
                    </button>
                    <button
                        className="ui primary button"
                        onClick={() => {
                            if (selectedDate) {
                                const offset = selectedDate.getTimezoneOffset() * 60_000;
                                const localIso = new Date(selectedDate.getTime() - offset).toISOString().slice(0, 16);
                                onNewEvent(localIso);
                            } else {
                                onNewEvent();
                            }
                        }}
                    >
                        <i className="plus icon" /> Novo Evento
                    </button>
                </div>
            </div>

            {/* Calendário Mensal Visual */}
            <div className={styles.calendarCard}>
                <div className={styles.weekdaysHeader}>
                    {WEEKDAYS.map((wd) => (
                        <div key={wd} className={styles.weekdayCell}>
                            {wd}
                        </div>
                    ))}
                </div>

                <div className={styles.calendarGrid}>
                    {calendarDays.map(({ date, isCurrentMonth }, idx) => {
                        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                        const dayEvents = eventsByDate.get(dateKey) || [];
                        const isDayToday = isSameDay(date, today);
                        const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;

                        return (
                            <div
                                key={idx}
                                className={[
                                    styles.dayCell,
                                    !isCurrentMonth ? styles.dayCellOtherMonth : "",
                                    isDayToday ? styles.isToday : "",
                                    dayEvents.length > 0 ? styles.hasEvents : "",
                                    isSelected ? styles.dayCellSelected : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                                onClick={() => setSelectedDate(date)}
                            >
                                <div className={styles.dayHeader}>
                                    <span className={styles.dayNumber}>{date.getDate()}</span>
                                    {dayEvents.length > 0 && <span className={styles.eventDot} />}
                                </div>

                                <div className={styles.cellEvents}>
                                    {dayEvents.slice(0, 3).map((ev) => (
                                        <span key={ev.id} className={styles.eventPill} title={ev.titulo}>
                                            {ev.titulo}
                                        </span>
                                    ))}
                                    {dayEvents.length > 3 && (
                                        <span className={styles.eventPillMore}>+{dayEvents.length - 3} mais</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Lista de Eventos do Dia Selecionado */}
            <div className={styles.eventsSection}>
                <div className={styles.sectionHeader}>
                    <h3>
                        <i className="calendar check outline icon" />
                        {selectedDate
                            ? `Eventos em ${selectedDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}`
                            : "Eventos do Mês"}
                    </h3>
                    {selectedDate && (
                        <button className="ui mini basic button" onClick={() => setSelectedDate(null)}>
                            Ver todos do mês
                        </button>
                    )}
                </div>

                {displayedEvents.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)" }}>
                        <i className="calendar outline icon" style={{ fontSize: 28, marginBottom: 8, display: "block" }} />
                        <p style={{ margin: 0, fontWeight: 600 }}>Nenhum evento registrado nesta data.</p>
                        <small>Clique em &quot;Novo Evento&quot; para agendar um compromisso.</small>
                    </div>
                ) : (
                    <div className={styles.eventsList}>
                        {displayedEvents.map((event) => {
                            const imp = cleanImportance(event.importancia);
                            const tipo = cleanValue(event.tipo_de_evento);
                            const d = new Date(event.dia_do_evento);
                            const dateStr = d.toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                            });

                            return (
                                <article key={event.id} className={styles.eventCard}>
                                    <div className={styles.eventMain}>
                                        <span className={styles.eventTitle}>{event.titulo}</span>
                                        {event.descricao && <span className={styles.eventDesc}>{event.descricao}</span>}
                                        <div className={styles.eventMeta}>
                                            <span className={styles.tagBadge}>{tipo || "Evento"}</span>
                                            <span
                                                className={`${styles.importanceBadge} ${
                                                    imp.level === "alta"
                                                        ? styles.importanceAlta
                                                        : imp.level === "media"
                                                        ? styles.importanceMedia
                                                        : styles.importanceBaixa
                                                }`}
                                            >
                                                Prioridade {imp.label}
                                            </span>
                                            <span>
                                                <i className="clock outline icon" /> {dateStr}
                                            </span>
                                        </div>
                                    </div>

                                    <div className={styles.eventActions}>
                                        <button
                                            className="ui icon basic button"
                                            title="Editar evento"
                                            onClick={() => onEditEvent(event)}
                                        >
                                            <i className="pencil alternate icon" />
                                        </button>
                                        <button
                                            className="ui icon basic button"
                                            title="Excluir evento"
                                            onClick={() => onDeleteEvent(event)}
                                        >
                                            <i className="trash alternate outline icon" />
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Modal de Configuração de Cores */}
            {configModalOpen && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 1000,
                        background: "rgba(0, 0, 0, 0.6)",
                        display: "grid",
                        placeItems: "center",
                        padding: 16,
                    }}
                    onMouseDown={() => setConfigModalOpen(false)}
                >
                    <div
                        className="ui modal visible active"
                        style={{ maxWidth: 480, width: "100%", background: "var(--surface)", color: "var(--ink)", borderRadius: 10 }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>Personalizar Cores da Agenda</span>
                            <button
                                className="ui icon basic mini button"
                                onClick={() => setConfigModalOpen(false)}
                                style={{ border: 0 }}
                            >
                                <i className="close icon" />
                            </button>
                        </div>

                        <div className="content">
                            <div className={styles.colorPickerGroup}>
                                <label>Cor de Destaque dos Eventos</label>
                                <div className={styles.paletteRow}>
                                    {PRESET_COLORS.map((c) => (
                                        <button
                                            key={c.value}
                                            type="button"
                                            className={`${styles.paletteDot} ${
                                                tempColors.cor_de_destaque === c.value ? styles.paletteDotActive : ""
                                            }`}
                                            style={{ background: c.value }}
                                            onClick={() => setTempColors({ ...tempColors, cor_de_destaque: c.value })}
                                            title={c.name}
                                        />
                                    ))}
                                </div>
                                <div className={styles.customColorRow}>
                                    <input
                                        type="color"
                                        className={styles.colorInput}
                                        value={tempColors.cor_de_destaque}
                                        onChange={(e) => setTempColors({ ...tempColors, cor_de_destaque: e.target.value })}
                                    />
                                    <span style={{ fontSize: 11, color: "var(--muted)" }}>Ou escolha uma cor personalizada</span>
                                </div>
                            </div>

                            <div className={styles.colorPickerGroup}>
                                <label>Cor do Dia Atual (Hoje)</label>
                                <div className={styles.paletteRow}>
                                    {PRESET_COLORS.map((c) => (
                                        <button
                                            key={c.value}
                                            type="button"
                                            className={`${styles.paletteDot} ${
                                                tempColors.cor_do_dia === c.value ? styles.paletteDotActive : ""
                                            }`}
                                            style={{ background: c.value }}
                                            onClick={() => setTempColors({ ...tempColors, cor_do_dia: c.value })}
                                            title={c.name}
                                        />
                                    ))}
                                </div>
                                <div className={styles.customColorRow}>
                                    <input
                                        type="color"
                                        className={styles.colorInput}
                                        value={tempColors.cor_do_dia}
                                        onChange={(e) => setTempColors({ ...tempColors, cor_do_dia: e.target.value })}
                                    />
                                    <span style={{ fontSize: 11, color: "var(--muted)" }}>Ou escolha uma cor personalizada</span>
                                </div>
                            </div>

                            <div className={styles.previewBox}>
                                <div
                                    style={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: "50%",
                                        background: tempColors.cor_do_dia,
                                        color: "#fff",
                                        display: "grid",
                                        placeItems: "center",
                                        fontWeight: "bold",
                                        fontSize: 16,
                                    }}
                                >
                                    27
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>Prévia Visual</div>
                                    <div
                                        style={{
                                            display: "inline-block",
                                            marginTop: 4,
                                            padding: "3px 8px",
                                            borderRadius: 4,
                                            fontSize: 11,
                                            borderLeft: `4px solid ${tempColors.cor_de_destaque}`,
                                            background: "var(--surface-soft)",
                                            color: "var(--ink)",
                                        }}
                                    >
                                        Exemplo de compromisso
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="actions">
                            <button className="ui basic button" onClick={() => setConfigModalOpen(false)}>
                                Cancelar
                            </button>
                            <button
                                className={`ui primary button ${savingColors ? "loading" : ""}`}
                                onClick={saveColors}
                                disabled={savingColors}
                            >
                                <i className="check icon" /> Salvar Cores
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
