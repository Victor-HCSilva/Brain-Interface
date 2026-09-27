export default async function createUpdateOrDelete({
    url,
    token,
    bodyData,
    method
}: {
    url: string,
    token?: string,
    bodyData: Record<string, any>,
    method: string
}) {
    try {
        const cleanToken = (token || "").replace(/^(Bearer\s+)+/i, "").trim();
        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };
        if (cleanToken) {
            headers["Authorization"] = `Bearer ${cleanToken}`;
        }

        const res = await fetch(url, {
            method: method,
            headers,
            body: JSON.stringify(bodyData)
        });

        const data = await res.json();
        return data;
    } catch (err) {
        console.log("erro:" + err);
        return null;
    }
}
