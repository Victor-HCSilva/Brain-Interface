import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { backendApiUrl, responseData } from "@/lib/backend";

type RouteContext = { params: Promise<{ path: string[] }> };

function cleanToken(token?: string | null): string {
    if (!token) return "";
    return token.replace(/^(Bearer\s+)+/i, "").trim();
}

async function proxy(request: Request, context: RouteContext) {
    const cookieStore = await cookies();
    let accessToken = cleanToken(cookieStore.get("todo_access")?.value);
    const refreshToken = cleanToken(cookieStore.get("todo_refresh")?.value);

    // If no cookie token, check if client provided Authorization header
    if (!accessToken) {
        const clientAuth = request.headers.get("authorization");
        if (clientAuth) {
            accessToken = cleanToken(clientAuth);
        }
    }

    if (!accessToken) {
        return NextResponse.json({ detail: "Autenticação necessária." }, { status: 401 });
    }

    const { path } = await context.params;
    let joinedPath = path.map(encodeURIComponent).join("/");
    if (!joinedPath.endsWith("/")) joinedPath += "/";
    const upstreamUrl = new URL(backendApiUrl(joinedPath));
    upstreamUrl.search = new URL(request.url).search;
    const method = request.method;
    const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
    const contentType = request.headers.get("content-type");

    const sendRequest = (token: string) => {
        const t = cleanToken(token);
        const headers = new Headers();
        if (t) {
            headers.set("Authorization", `Bearer ${t}`);
        }
        if (contentType) {
            headers.set("Content-Type", contentType);
        }
        return fetch(upstreamUrl, {
            method,
            headers,
            body,
            cache: "no-store",
        });
    };

    try {
        let upstream = await sendRequest(accessToken);
        let newAccessToken: string | undefined;

        if (upstream.status === 401 && refreshToken) {
            const refreshed = await fetch(backendApiUrl("auth/refresh/"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh: refreshToken }),
                cache: "no-store",
            });
            const refreshData = await responseData(refreshed) as { access?: string } | null;

            if (refreshed.ok && refreshData?.access) {
                newAccessToken = cleanToken(refreshData.access);
                accessToken = newAccessToken;
                upstream = await sendRequest(accessToken);
            }
        }

        const response = new Response(upstream.body, {
            status: upstream.status,
            headers: {
                "Content-Type": upstream.headers.get("content-type") ?? "application/json",
                "Cache-Control": "no-store",
            },
        });

        if (newAccessToken) {
            response.headers.append("Set-Cookie", `todo_access=${newAccessToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
        } else if (upstream.status === 401) {
            response.headers.append("Set-Cookie", "todo_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
            response.headers.append("Set-Cookie", "todo_refresh=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
        }

        return response;
    } catch {
        return NextResponse.json({ detail: "Não foi possível conectar à API." }, { status: 503 });
    }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
