import TODO from "@/app/interfaces/todo";

export function ShowTodos({ todos }: { todos: TODO[] }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {todos.map((todo) => (
                <div
                    key={todo.id}
                    style={{
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        padding: "16px",
                    }}
                >
                    {/* Título e se é favorito */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <h3 style={{ margin: 0 }}>{todo.titulo}</h3>
                        {todo.favorito && <span>⭐</span>}
                    </div>

                    {/* Anotação */}
                    <p style={{ color: "#666" }}>{todo.anotacao}</p>

                    {/* Badges / Informações adicionais */}
                    <div style={{ display: "flex", gap: "12px", fontSize: "14px" }}>
                        <span>🏷️ <strong>Tag:</strong> {todo.tag}</span>
                        <span>⚡ <strong>Prioridade:</strong> {todo.prioridade}</span>
                        <span>📅 <strong>Prazo:</strong> {todo.prazo_final}</span>
                        <span>
                            {todo.completo ? "✅ Concluída" : "⏳ Pendente"}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}
