export default interface TODO {
    id: number;
    user: number;
    titulo: string;
    favorito: boolean;
    completo: boolean;
    anotacao: string;
    prioridade: string; // ou 'Baixa' | 'Média' | 'Alta' se quiser restringir
    tag: string;
    prazo_inicial: string;
    prazo_final: string;
    folder: number | null; // pode vir null do backend
    colaboradores: any[];  // ou defina uma interface específica para colaborador
    grupos_colaboracao: any[];
    created_at: string;
    updated_at: string;
    is_active: boolean;
}
