import login from "@/auth/login";
import get from "./components/httpMethods/get";
import TODO from "../app/interfaces/todo";
import { ShowTodos } from "./components/todo/todo";

export default async function HomePage() {
    const baseUrl = process.env.BACKEND_URL ?? "";
    const username_ = process.env.NEXT_USERNAME ?? "";
    const password_ = process.env.PASSWORD ?? "";

    const token = await login({ username: username_, password: password_ });

    const response = await get({
        url: `${baseUrl}/todos/`,
        token: token.access,
        quantityPerPage: 10,
        filters: [],
    });

    const todos: TODO[] = response?.results || [];

    return (
        <div>
            <ShowTodos todos={todos} />
        </div>
    );
}
