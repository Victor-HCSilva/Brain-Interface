"use client";

import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import styles from "./login-page.module.css";

interface Props {
    onLogin: () => void;
}

export default function LoginPage({ onLogin }: Props) {
    const [mode, setMode] = useState<"login" | "register">("login");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [theme, setTheme] = useState<"light" | "dark">("light");

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem("todo-theme");
            if (stored === "dark" || stored === "light") {
                setTheme(stored);
                document.documentElement.dataset.theme = stored;
            } else if (document.documentElement.dataset.theme === "dark" || document.documentElement.dataset.theme === "light") {
                setTheme(document.documentElement.dataset.theme as "light" | "dark");
            }
        } catch {
            // ignore
        }
    }, []);

    const toggleTheme = () => {
        setTheme((prev) => {
            const next = prev === "dark" ? "light" : "dark";
            document.documentElement.dataset.theme = next;
            try {
                window.localStorage.setItem("todo-theme", next);
            } catch {
                // ignore
            }
            return next;
        });
    };

    function switchMode(newMode: "login" | "register") {
        setMode(newMode);
        setError("");
        setSuccessMsg("");
    }

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccessMsg("");

        if (mode === "register") {
            if (!username.trim()) {
                setError("Informe um nome de usuário.");
                setLoading(false);
                return;
            }
            if (password.length < 6) {
                setError("A senha deve ter pelo menos 6 caracteres.");
                setLoading(false);
                return;
            }
            if (password !== confirmPassword) {
                setError("As senhas não coincidem.");
                setLoading(false);
                return;
            }

            try {
                const res = await fetch("/api/auth/register/", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: username.trim(),
                        email: email.trim(),
                        password,
                    }),
                });
                const data = await res.json() as { detail?: string; authenticated?: boolean };
                if (!res.ok) {
                    setError(data.detail ?? "Erro ao realizar cadastro. Verifique os dados.");
                    return;
                }

                if (data.authenticated) {
                    onLogin();
                    return;
                }

                setSuccessMsg("Conta criada com sucesso! Faça login para continuar.");
                setMode("login");
                setPassword("");
                setConfirmPassword("");
            } catch {
                setError("Não foi possível conectar ao servidor.");
            } finally {
                setLoading(false);
            }
            return;
        }

        // Login Mode
        try {
            const res = await fetch("/api/auth/login/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });
            if (!res.ok) {
                const data = await res.json() as { detail?: string };
                setError(data.detail ?? "Credenciais inválidas. Tente novamente.");
                return;
            }
            onLogin();
        } catch {
            setError("Não foi possível conectar ao servidor.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className={styles.page}>
            {/* ── Brand side ──────────────────────────── */}
            <section className={styles.brand} aria-hidden="true">
                <div className={styles.brandBg} />
                <div className={styles.brandContent}>
                    <div className={styles.brandMark}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M12 2a10 10 0 0 1 0 20" />
                            <path d="M12 6a6 6 0 0 1 0 12" />
                            <path d="M12 10a2 2 0 0 1 0 4" />
                        </svg>
                    </div>

                    <span className={styles.kicker}>BRAIN / ESPAÇO PESSOAL</span>
                    <h1 className={styles.headline}>
                        Um lugar para<br />pensar com clareza.
                    </h1>
                    <p className={styles.tagline}>
                        Suas tarefas, anotações, agenda e próximos passos em um só lugar.
                    </p>

                    <ul className={styles.featureList} aria-label="Recursos do sistema">
                        {[
                            { icon: "✦", text: "Tarefas e anotações em Markdown" },
                            { icon: "✦", text: "Agenda com prioridade e lembretes" },
                            { icon: "✦", text: "Checklists e listas vinculadas" },
                            { icon: "✦", text: "Colaboração em pastas e grupos" },
                        ].map((f) => (
                            <li key={f.text} className={styles.featureItem}>
                                <span className={styles.featureDot}>{f.icon}</span>
                                {f.text}
                            </li>
                        ))}
                    </ul>

                    <footer className={styles.brandFooter}>
                        <span className={styles.statusDot} /> Sistema ativo e funcionando
                    </footer>
                </div>

                {/* Decorative circles */}
                <div className={styles.circle1} />
                <div className={styles.circle2} />
                <div className={styles.circle3} />
            </section>

            {/* ── Form side ───────────────────────────── */}
            <section className={styles.formSide}>
                <button
                    type="button"
                    className={styles.themeToggleBtn}
                    onClick={toggleTheme}
                    aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
                    title={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
                >
                    {theme === "dark" ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="5" />
                            <line x1="12" y1="1" x2="12" y2="3" />
                            <line x1="12" y1="21" x2="12" y2="23" />
                            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                            <line x1="1" y1="12" x2="3" y2="12" />
                            <line x1="21" y1="12" x2="23" y2="12" />
                            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                        </svg>
                    ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        </svg>
                    )}
                </button>
                <div className={styles.formWrap}>
                    {/* Tab Switcher */}
                    <div className={styles.modeSwitcher} role="tablist" aria-label="Acesso à conta">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mode === "login"}
                            className={`${styles.switchBtn} ${mode === "login" ? styles.switchBtnActive : ""}`}
                            onClick={() => switchMode("login")}
                        >
                            Entrar
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mode === "register"}
                            className={`${styles.switchBtn} ${mode === "register" ? styles.switchBtnActive : ""}`}
                            onClick={() => switchMode("register")}
                        >
                            Cadastrar-se
                        </button>
                    </div>

                    <div className={styles.formHeader}>
                        <span className={styles.kicker} style={{ color: "var(--muted)" }}>
                            {mode === "login" ? "BEM-VINDO DE VOLTA" : "CRIE SUA CONTA"}
                        </span>
                        <h2 className={styles.formTitle}>
                            {mode === "login" ? "Entre no seu espaço" : "Cadastre-se no Brain"}
                        </h2>
                        <p className={styles.formSubtitle}>
                            {mode === "login"
                                ? "Use as credenciais da sua conta para continuar."
                                : "Preencha os dados abaixo para criar o seu espaço."}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className={styles.form} noValidate>
                        <div className={styles.field}>
                            <label htmlFor="login-username" className={styles.label}>Usuário</label>
                            <div className={styles.inputWrap}>
                                <span className={styles.inputIcon} aria-hidden>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                                    </svg>
                                </span>
                                <input
                                    id="login-username"
                                    className={styles.input}
                                    type="text"
                                    autoComplete="username"
                                    placeholder="seu.usuario"
                                    value={username}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                        </div>

                        {mode === "register" && (
                            <div className={styles.field}>
                                <label htmlFor="login-email" className={styles.label}>E-mail (opcional)</label>
                                <div className={styles.inputWrap}>
                                    <span className={styles.inputIcon} aria-hidden>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                                        </svg>
                                    </span>
                                    <input
                                        id="login-email"
                                        className={styles.input}
                                        type="email"
                                        autoComplete="email"
                                        placeholder="seu.email@exemplo.com"
                                        value={email}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}

                        <div className={styles.field}>
                            <label htmlFor="login-password" className={styles.label}>Senha</label>
                            <div className={styles.inputWrap}>
                                <span className={styles.inputIcon} aria-hidden>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                </span>
                                <input
                                    id="login-password"
                                    className={styles.input}
                                    type={showPassword ? "text" : "password"}
                                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                                    placeholder={mode === "register" ? "mínimo 6 caracteres" : "••••••••"}
                                    value={password}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    className={styles.eyeBtn}
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                                >
                                    {showPassword ? (
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" />
                                        </svg>
                                    ) : (
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {mode === "register" && (
                            <div className={styles.field}>
                                <label htmlFor="login-confirm-password" className={styles.label}>Confirmar Senha</label>
                                <div className={styles.inputWrap}>
                                    <span className={styles.inputIcon} aria-hidden>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                        </svg>
                                    </span>
                                    <input
                                        id="login-confirm-password"
                                        className={styles.input}
                                        type={showPassword ? "text" : "password"}
                                        autoComplete="new-password"
                                        placeholder="repita sua senha"
                                        value={confirmPassword}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className={styles.errorMsg} role="alert">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                {error}
                            </div>
                        )}

                        {successMsg && (
                            <div className={styles.successMsg} role="status">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                                {successMsg}
                            </div>
                        )}

                        <button
                            type="submit"
                            className={styles.submitBtn}
                            disabled={loading || !username || !password || (mode === "register" && !confirmPassword)}
                        >
                            {loading ? (
                                <>
                                    <span className={styles.spinner} aria-hidden />
                                    {mode === "login" ? "Entrando..." : "Cadastrando..."}
                                </>
                            ) : mode === "login" ? (
                                <>
                                    Entrar
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                                    </svg>
                                </>
                            ) : (
                                <>
                                    Criar Conta
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </form>

                    <div className={styles.toggleWrap}>
                        {mode === "login" ? (
                            <p className={styles.toggleText}>
                                Não possui uma conta?{" "}
                                <button type="button" className={styles.toggleLink} onClick={() => switchMode("register")}>
                                    Cadastre-se gratuitamente
                                </button>
                            </p>
                        ) : (
                            <p className={styles.toggleText}>
                                Já possui uma conta?{" "}
                                <button type="button" className={styles.toggleLink} onClick={() => switchMode("login")}>
                                    Fazer login
                                </button>
                            </p>
                        )}
                    </div>

                    <div className={styles.formFooter}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Sessão protegida com JWT — seus dados são privados
                    </div>
                </div>
            </section>
        </main>
    );
}
