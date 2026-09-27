import { NextResponse } from "next/server";
import { backendApiUrl, responseData } from "@/lib/backend";

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        const upstream = await fetch(backendApiUrl("auth/register/"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            cache: "no-store",
        });
        const data = await responseData(upstream);

        if (!upstream.ok) {
            return NextResponse.json(data, { status: upstream.status });
        }

        const tokens = data as { access?: string; refresh?: string };
        if (tokens.access && tokens.refresh) {
            const response = NextResponse.json({ authenticated: true, registered: true });
            const secure = process.env.NODE_ENV === "production";
            response.cookies.set("todo_access", tokens.access, {
                httpOnly: true,
                secure,
                sameSite: "lax",
                path: "/",
                maxAge: 60 * 60,
            });
            response.cookies.set("todo_refresh", tokens.refresh, {
                httpOnly: true,
                secure,
                sameSite: "lax",
                path: "/",
                maxAge: 60 * 60 * 24 * 7,
            });
            return response;
        }

        return NextResponse.json({ registered: true });
    } catch {
        return NextResponse.json({ detail: "Não foi possível conectar à API." }, { status: 503 });
    }
}
