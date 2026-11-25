import { useState, type ReactNode, type ChangeEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Building2, CalendarDays, LayoutGrid, Megaphone, UsersRound } from 'lucide-react';
import { enderecoAdmin, podeAcessarModulo } from '@/lib/admin-navegacao';
import type { RoleSistema } from '@/lib/admin-auth';
import type { CampoTextoLayout, PosicaoLayout } from '@/lib/layout-admin';
import { useLayoutR4 } from './EditorLayoutR4';
import { nomesModulos } from './PropriedadesLayoutR4';
import css from './EditorLayoutR4.module.css';
import cssInicio from './InicioAdmin.module.css';

const icones = { grade: LayoutGrid, agenda: CalendarDays, pessoas: UsersRound, escola: Building2, aviso: Megaphone };

export function IconeLayoutR4({ icone, fallback }: { icone?: PosicaoLayout['icone']; fallback: ReactNode }) {
    const Icone = icone ? icones[icone] : undefined;
    return Icone ? <Icone size={20} aria-hidden="true" /> : fallback;
}

export function TextoLayoutR4({ id, campo, texto }: { id: string; campo: CampoTextoLayout; texto: string }) {
    const editor = useLayoutR4();
    const config = editor?.layout[id]?.textos?.[campo];
    const [encerrado, setEncerrado] = useState(false);
    const ativo = Boolean(editor?.ativo && editor.selecionado?.dataset.r4LayoutId === id && editor.campoTexto === campo);
    const atributos = {
        'data-r4-layout-campo': editor?.ativo ? campo : undefined,
        'data-r4-layout-fonte': config?.fonte,
        'data-r4-layout-tamanho': config?.tamanho,
        'data-r4-layout-peso': config?.peso,
    };
    const valor = config?.texto ?? texto;
    const entrada = {
        ...atributos, autoFocus: true, 'data-r4-layout-inline': true, 'aria-label': 'Editar ' + campo,
        maxLength: campo === 'descricao' ? 1600 : 160, value: valor,
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
        onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
        onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => editor?.atualizarTexto(id, campo, { texto: e.target.value }),
        onBlur: () => setEncerrado(true),
        onKeyDown: (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            if (e.key === 'Escape' || (e.key === 'Enter' && campo !== 'descricao')) {
                e.preventDefault(); e.currentTarget.blur();
            }
        },
    };
    if (ativo && !encerrado) return campo === 'descricao' ? <textarea {...entrada} rows={2} /> : <input {...entrada} type="text" />;
    return <span {...atributos} onPointerDown={() => setEncerrado(false)}>{valor}</span>;
}

export function CardsLayoutR4({ grupo, perfil }: { grupo: NonNullable<PosicaoLayout['card']>['grupo']; perfil: RoleSistema }) {
    const editor = useLayoutR4();
    if (!editor) return null;
    return <>{Object.entries(editor.layout).filter(([, pos]) => pos.card?.grupo === grupo).map(([id, pos]) => {
        const modulo = pos.modulo;
        if (pos.card?.tipo === 'atalho' && (!modulo || !podeAcessarModulo(perfil, modulo))) return null;
        const titulo = pos.textos?.titulo?.texto || (modulo ? nomesModulos[modulo] : 'Aviso');
        const props = editor.item(id, grupo, titulo);
        const conteudo = <>
            <span className={cssInicio.icones}>
                <IconeLayoutR4 icone={pos.icone} fallback={modulo ? <LayoutGrid size={20} /> : <Megaphone size={20} />} />
                {modulo && <ArrowUpRight size={14} />}
            </span>
            <strong><TextoLayoutR4 id={id} campo="titulo" texto={titulo} /></strong>
            {(pos.textos?.descricao?.texto || editor.ativo) && <small className={css.textoLivre}>
                <TextoLayoutR4 id={id} campo="descricao" texto="Adicionar descrição" />
            </small>}
        </>;
        return modulo && pos.card?.tipo === 'atalho'
            ? <Link key={id} className={cssInicio.card} href={enderecoAdmin(modulo)} {...props}>{conteudo}</Link>
            : <article key={id} className={cssInicio.card} {...props}>{conteudo}</article>;
    })}</>;
}
