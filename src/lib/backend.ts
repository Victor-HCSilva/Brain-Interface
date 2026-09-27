export function backendApiUrl(path: string) {
    const configuredUrl = process.env.BACKEND_URL;

    if (!configuredUrl) {
        throw new Error("BACKEND_URL não está configurada.");
    }

    const baseUrl = configuredUrl.replace(/\/+$/, "");
    const apiBase = baseUrl.endsWith("/api") ? baseUrl : `${baseUrl}/api`;

    let cleanPath = path.replace(/^\/+/, "");
    // Sempre assegura a barra final para compatibilidade com Django APPEND_SLASH
    if (cleanPath && !cleanPath.endsWith("/")) {
        cleanPath = `${cleanPath}/`;
    }

    return `${apiBase}/${cleanPath}`;
}

export async function responseData(response: Response) {
    const body = await response.text();

    if (!body) return null;

    try {
        return JSON.parse(body) as unknown;
    } catch {
        return { detail: body };
    }
}
