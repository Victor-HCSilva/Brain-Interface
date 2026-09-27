import "semantic-ui-css/semantic.min.css";
import "./globals.css";

interface LayoutProps {
    children: React.ReactNode;
}

export default function RootLayout({ children }: LayoutProps) {
    return (
        <html lang="pt-BR">
            <body>{children}</body>
        </html>
    );
}
