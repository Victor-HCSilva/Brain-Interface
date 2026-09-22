export default async function get({
    url,
    token,
    quantityPerPage = 10,
    filters = []
}: {
    url: string,
    token: string,
    quantityPerPage?: number,
    filters?: [string, string][],
}) {
    const filters_ = new URLSearchParams(filters);
    filters_.append('perPage', quantityPerPage.toString());
    const urlFinal = `${url}?${filters_.toString()}`;
    const res = await fetch(urlFinal, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });

    const data = await res.json();
    return data
}

