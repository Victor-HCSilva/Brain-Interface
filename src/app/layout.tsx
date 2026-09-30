import "semantic-ui-css/semantic.min.css";
import "./globals.css";

interface LayoutProps {
    children: React.ReactNode;
}

export default function RootLayout({ children }: LayoutProps) {
    return (
        <html lang="pt-BR" suppressHydrationWarning>
            <head>
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{var t=localStorage.getItem("todo-theme");if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t;}else if(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.dataset.theme="dark";}}catch(e){}})();`,
                    }}
                />
            </head>
            <body>{children}</body>
        </html>
    );
}
