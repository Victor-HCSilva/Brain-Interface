export default async function createUpdateOrDelete({
    url,
    token,
    bodyData,
    method
}: {
    url: string,
    token: string,
    bodyData: Record<string, any>
    method: string
}) {
    try {
        const res = await fetch(url, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bodyData)
        });

        const data = await res.json();
        return data
    } catch (err) {
        //TODO: Criar modo DEBUG
        console.log("erro:" + err)
        return (
            <div >
                {}
            </div>
        );
    }
}

