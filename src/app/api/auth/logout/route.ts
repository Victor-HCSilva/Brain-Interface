import { NextResponse } from "next/server";

export async function POST() {
    const response = NextResponse.json({ authenticated: false });
    response.cookies.delete("todo_access");
    response.cookies.delete("todo_refresh");
    return response;
}