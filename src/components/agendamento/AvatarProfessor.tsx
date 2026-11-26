export default function AvatarProfessor({ nome }: { nome: string }) {
    const iniciais = nome.trim().split(/\s+/).filter(Boolean).slice(0, 2)
        .map((parte) => Array.from(parte)[0]?.toLocaleUpperCase('pt-BR')).join('');
    return <span aria-hidden="true" className="r4-avatar-professor">{iniciais || 'P'}</span>;
}
