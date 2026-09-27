export default async function get({
    url,
    token,
    quantityPerPage = 10,
    filters = []
}: {
    url: string,
    token?: string,
    quantityPerPage?: number,
    filters?: [string, string][],
}) {
    const filters_ = new URLSearchParams(filters);
    filters_.append("perPage", quantityPerPage.toString());
    const urlFinal = `${url}?${filters_.toString()}`;
    const cleanToken = (token || "").replace(/^(Bearer\s+)+/i, "").trim();
    const headers: Record<string, string> = {
        "Content-Type": "application/json"
    };
    if (cleanToken) {
        headers["Authorization"] = `Bearer ${cleanToken}`;
    }

    const res = await fetch(urlFinal, {
        method: "GET",
        headers,
    });

    const data = await res.json();
    return data;
}
