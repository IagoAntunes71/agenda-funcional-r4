'use client';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Search } from 'lucide-react';
import { enderecoMapa } from '@/lib/admin-navegacao';
import { filtrarMateriasVisiveis } from '@/lib/cliente-helpers';
import { obterAgoraBahia } from '@/lib/horarios-reforco';
import { obterIniciais, type ProfessorAdmin, type TemaClasses } from './types';

export default function DiretorioProfessoresR4({ professores, classes }: {
    professores: ProfessorAdmin[];
    classes: TemaClasses;
}) {
    const textoR4 = useTextoR4();
    const [busca, setBusca] = useState('');
    const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
    const termo = normalizar(busca);
    const hoje = obterAgoraBahia().dataISO;
    const perfis = new Map<string, { nome: string; unidades: Map<number, string>; materias: Set<string> }>();
    for (const prof of professores.filter((item) => item.ativo)) {
        const chave = prof.clin_care_id || normalizar(prof.nome);
        const perfil = perfis.get(chave) ?? { nome: prof.nome, unidades: new Map(), materias: new Set() };
        perfil.unidades.set(prof.unidade_id, prof.unidade_nome);
        filtrarMateriasVisiveis(prof.materias).forEach((materia) => perfil.materias.add(materia));
        perfis.set(chave, perfil);
    }
    const visiveis = [...perfis.entries()].filter(([, p]) =>
        normalizar([p.nome, ...p.unidades.values(), ...p.materias].join(' ')).includes(termo));
    return <section className="space-y-4">
        <label className={`flex items-center gap-2 p-3 rounded-xl border ${classes.clsInput}`}>
            <Search size={16} />
            <input className="w-full bg-transparent" type="search" value={busca}
                onChange={(e) => setBusca(e.target.value)} aria-label={textoR4("Buscar professor")} placeholder={textoR4("Buscar por professor, matéria ou unidade")} />
        </label>
        {!visiveis.length && <p className={classes.clsSubtexto}>{textoR4("Nenhum professor encontrado.")}</p>}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visiveis.map(([chave, perfil]) => <article key={chave} className={`border rounded-xl p-4 space-y-3 ${classes.clsCard}`}>
                <div className="flex items-center gap-3">
                    <span className="w-9 h-9 grid place-items-center rounded-lg bg-[#0E7C86] text-white font-bold">{obterIniciais(perfil.nome)}</span>
                    <h2 className="font-bold">{perfil.nome}</h2>
                </div>
                <p className={`text-sm ${classes.clsSubtexto}`}>{[...perfil.materias].join(' · ')}</p>
                <div className="flex gap-2 flex-wrap">{[...perfil.unidades].map(([id, nome]) =>
                    <Link key={id} href={enderecoMapa(hoje, id)} target="_blank" rel="noopener"
                        className={`inline-flex gap-1 items-center text-xs rounded-lg border px-2 py-1.5 ${classes.clsSubCard}`}>
                        <CalendarDays size={13} /> {nome}
                    </Link>)}</div>
            </article>)}
        </div>
    </section>;
}
