import "./globals.css";

interface LayoutProps {
    children: React.ReactNode;
}

export default function RootLayout({ children }: LayoutProps) {
    return (
        <html lang="pt-BR">
            <body>
                <header style={{ padding: "20px", borderBottom: "1px solid #ccc" }}>
                    <h1>Minhas Tarefas</h1>
                </header>

                <main style={{ padding: "20px" }}>
                    {/* Aqui dentro o Next.js vai injetar o que está no page.tsx */}
                    {children}
                </main>
            </body>
        </html>
    );
}
