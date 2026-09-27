"use client";

import styles from "./about-view.module.css";

export default function AboutView() {
    return (
        <div className={styles.container}>
            <div className={styles.heroCard}>
                <div className={styles.brandHeader}>
                    <div className={styles.brandIcon}>
                        <i className="leaf icon" />
                    </div>
                    <div className={styles.brandTitles}>
                        <span>ESPAÇO PESSOAL / BRAIN</span>
                        <h1>Sobre o Sistema</h1>
                    </div>
                </div>

                <div className={styles.sectionBlock}>
                    <h2>
                        <i className="info circle icon" /> Sobre este aplicativo
                    </h2>
                    <p>
                        Este é um aplicativo completo de produtividade e gestão pessoal (To-Do List, Agenda, Anotações e Checklists)
                        construído com arquitetura moderna e desacoplada: um backend robusto em <strong>Django REST Framework (DRF)</strong>
                        integrado a uma interface moderna em <strong>Next.js</strong> com componentes estilizados com <strong>Semantic UI</strong>.
                    </p>
                    <p>
                        O sistema permite gerenciar tarefas com suporte a Markdown, anexar imagens, organizar tarefas em pastas, colaborar
                        em grupos de estudos e trabalho, acompanhar compromissos em uma agenda mensal interativa com personalização de cores
                        e dividir grandes projetos em etapas estruturadas de checklist.
                    </p>
                </div>

                <div className={styles.sectionBlock}>
                    <h2>
                        <i className="star outline icon" /> Principais Funcionalidades
                    </h2>
                    <div className={styles.featureGrid}>
                        <div className={styles.featureCard}>
                            <strong>
                                <i className="tasks icon" /> Gestão de Tarefas
                            </strong>
                            <span>Criação, edição, priorização, prazos, pastas e painel deslizante com Markdown e anexos de imagem.</span>
                        </div>
                        <div className={styles.featureCard}>
                            <strong>
                                <i className="calendar alternate outline icon" /> Agenda Interativa
                            </strong>
                            <span>Grade mensal com navegação, destaque de eventos e personalização completa da paleta de cores.</span>
                        </div>
                        <div className={styles.featureCard}>
                            <strong>
                                <i className="list ul icon" /> Listas Checklist
                            </strong>
                            <span>Listas dinâmicas de itens com estados (Não iniciado, Fazendo, Concluído, Cancelado).</span>
                        </div>
                        <div className={styles.featureCard}>
                            <strong>
                                <i className="users icon" /> Grupos de Colaboração
                            </strong>
                            <span>Compartilhamento de pastas e anotações com membros de grupos cadastrados.</span>
                        </div>
                        <div className={styles.featureCard}>
                            <strong>
                                <i className="moon icon" /> Modo Dark / Light
                            </strong>
                            <span>Alternância visual persistida em localStorage com variáveis CSS integradas ao Semantic UI.</span>
                        </div>
                        <div className={styles.featureCard}>
                            <strong>
                                <i className="shield alternate icon" /> Autenticação Segura
                            </strong>
                            <span>Tokens JWT com refresh automático e proteção de sessão privada em cookies HttpOnly.</span>
                        </div>
                    </div>
                </div>

                <div className={styles.sectionBlock}>
                    <h2>
                        <i className="code branch icon" /> Tecnologias Utilizadas
                    </h2>
                    <div className={styles.techPills}>
                        <span className={styles.techPill}>Python 3.12</span>
                        <span className={styles.techPill}>Django 5</span>
                        <span className={styles.techPill}>Django REST Framework</span>
                        <span className={styles.techPill}>SimpleJWT</span>
                        <span className={styles.techPill}>Celery & Redis</span>
                        <span className={styles.techPill}>Next.js 16 (App Router)</span>
                        <span className={styles.techPill}>React 19</span>
                        <span className={styles.techPill}>TypeScript</span>
                        <span className={styles.techPill}>Semantic UI</span>
                        <span className={styles.techPill}>Marked & DOMPurify</span>
                    </div>
                </div>
            </div>

            <div className={styles.authorCard}>
                <div className={styles.authorAvatar}>V</div>
                <div className={styles.authorInfo}>
                    <h3>Sobre o Desenvolvedor</h3>
                    <p>
                        Me chamo <strong>Victor</strong>, programador Web BackEnd com Python e entusiasta do ecossistema Django,
                        APIs RESTful e arquiteturas frontend modernas.
                    </p>
                </div>
            </div>
        </div>
    );
}
