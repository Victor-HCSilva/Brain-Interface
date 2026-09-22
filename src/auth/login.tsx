import createUpdateOrDelete from "../app/components/httpMethods/createUpdateOrDelete";


export default async function login({
    username,
    password
}: {
    username: string, password: string
}) {

    try {
        const token = await createUpdateOrDelete({
            url: `${process.env.BACKEND_URL}/auth/login/`,
            token: "",
            bodyData: {
                "username": username,
                "password": password
            },
            method: "POST"
        })
        console.log(password, username)
        return token

    } catch (err) {
        console.log("Erro ao tentar fazer login:" + err)
        return {}
    }
}
