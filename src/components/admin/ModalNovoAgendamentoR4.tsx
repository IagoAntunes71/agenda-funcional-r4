'use client';

import { useEffect, useState } from 'react';
import { Ban, CalendarPlus, Check, Plus, Search, UserPlus, X } from 'lucide-react';
import { RoleSistema } from '@/lib/admin-auth';
import { formatarDuracaoLabel } from '@/lib/agenda-status-r4';
import {
    AlunoAdmin,
    ProfessorAdmin,
    TemaClasses,
    UnidadeAdmin,
} from './types';

const HORAS_INICIO = Array.from({ length: 15 }, (_, i) =>
    String(8 + i).padStart(2, '0')
);
const MINUTOS_PASSO = ['00', '10', '20', '30', '40', '50'];

export default function ModalNovoAgendamentoR4({
                                                   aberto,
                                                   onFecharAction,
                                                   modoInicial = 'aula',
                                                   roleUsuario,
                                                   professorTravadoId,
                                                   unidadeInicialId,
                                                   professorInicialId,
                                                   dataInicial,
                                                   horaInicial = '08:00',
                                                   unidades,
                                                   professores,
                                                   alunos,
                                                   onSucessoAction,
                                                   classes,
                                               }: {
    aberto: boolean;
    onFecharAction: () => void;
    modoInicial?: 'aula' | 'bloqueio';
    roleUsuario: RoleSistema;
    professorTravadoId?: number | null;
    unidadeInicialId: number;
    professorInicialId: number;
    dataInicial: string;
    horaInicial?: string;
    unidades: UnidadeAdmin[];
    professores: ProfessorAdmin[];
    alunos: AlunoAdmin[];
    onSucessoAction: () => Promise<void>;
    classes: TemaClasses;
}) {
    const { clsCard, clsSubCard, clsInput, clsTitulo, clsSubtexto } = classes;
    const ehProfessor = roleUsuario === 'professor';

    const [modo, setModo] = useState<'aula' | 'bloqueio'>(
        ehProfessor ? 'bloqueio' : modoInicial
    );
    const [unidadeId, setUnidadeId] = useState<number>(unidadeInicialId);
    const [professorId, setProfessorId] = useState<number>(
        ehProfessor && professorTravadoId ? professorTravadoId : professorInicialId
    );
    const [materia, setMateria] = useState<string>('');
    const [data, setData] = useState<string>(dataInicial);
    const [hora, setHora] = useState<string>('08');
    const [minuto, setMinuto] = useState<string>('00');

    const [duracaoHoras, setDuracaoHoras] = useState<number>(1);
    const [duracaoMinutos, setDuracaoMinutos] = useState<number>(40);
    const [recorrencia, setRecorrencia] = useState<number>(1);
    const [statusInicial, setStatusInicial] = useState<'agendado' | 'confirmado'>('confirmado');
    const [observacoes, setObservacoes] = useState<string>('');

    const [buscaAluno, setBuscaAluno] = useState<string>('');
    const [alunoId, setAlunoId] = useState<number>(0);
    const [cadastroRapido, setCadastroRapido] = useState<boolean>(false);
    const [novoAlunoNome, setNovoAlunoNome] = useState<string>('');
    const [novoRespNome, setNovoRespNome] = useState<string>('');
    const [novoTelefone, setNovoTelefone] = useState<string>('');
    const [novoColegio, setNovoColegio] = useState<string>('');
    const [novoSerie, setNovoSerie] = useState<string>('');

    const [tituloBloqueio, setTituloBloqueio] = useState<string>('Indisponível');
    const [descricaoBloqueio, setDescricaoBloqueio] = useState<string>('');

    const [salvando, setSalvando] = useState<boolean>(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        if (!aberto) return;
        const modoAlvo = ehProfessor ? 'bloqueio' : modoInicial;
        setModo(modoAlvo);
        setUnidadeId(unidadeInicialId || unidades[0]?.id || 0);
        const profAlvo =
            ehProfessor && professorTravadoId
                ? professorTravadoId
                : professorInicialId || professores[0]?.id || 0;
        setProfessorId(profAlvo);

        const profObj = professores.find((p) => p.id === profAlvo);
        setMateria(profObj?.materias?.[0] || '');

        setData(dataInicial);
        const [h, m] = (horaInicial || '08:00').split(':');
        setHora(HORAS_INICIO.includes(h) ? h : '08');
        setMinuto(MINUTOS_PASSO.includes(m) ? m : '00');

        if (modoAlvo === 'bloqueio') {
            setDuracaoHoras(1);
            setDuracaoMinutos(0);
        } else {
            setDuracaoHoras(1);
            setDuracaoMinutos(40);
        }
        setRecorrencia(1);
        setErro(null);
    }, [
        aberto,
        ehProfessor,
        modoInicial,
        professorTravadoId,
        unidadeInicialId,
        professorInicialId,
        dataInicial,
        horaInicial,
        unidades,
        professores,
    ]);

    if (!aberto) return null;

    const totalMinutos = duracaoHoras * 60 + duracaoMinutos;
    const profSelecionado = professores.find((p) => p.id === professorId);
    const profsDaUnidade = professores.filter(
        (p) => p.ativo && (!unidadeId || p.unidade_id === unidadeId)
    );

    const alunosFiltrados = buscaAluno.trim()
        ? alunos
            .filter(
                (a) =>
                    a.nome_aluno.toLowerCase().includes(buscaAluno.toLowerCase()) ||
                    a.responsavel_nome.toLowerCase().includes(buscaAluno.toLowerCase()) ||
                    a.telefone.includes(buscaAluno.replace(/\D/g, ''))
            )
            .slice(0, 8)
        : alunos.slice(0, 8);

    async function handleSalvar(e: React.FormEvent) {
        e.preventDefault();
        setErro(null);

        if (modo === 'aula' && (totalMinutos < 50 || totalMinutos > 300)) {
            setErro('A duração da aula deve ficar entre 50 e 300 minutos.');
            return;
        }
        if (modo === 'bloqueio' && totalMinutos < 10) {
            setErro('Escolha uma duração válida para o bloqueio.');
            return;
        }

        setSalvando(true);
        try {
            const horaFormatada = `${hora}:${minuto}`;

            if (modo === 'bloqueio') {
                const res = await fetch('/api/admin/bloqueios', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        professor_id: professorId,
                        motivo: tituloBloqueio,
                        descricao: descricaoBloqueio,
                        data,
                        hora_inicio: horaFormatada,
                        duracao_minutos: totalMinutos,
                        recorrencia_semanas: recorrencia,
                    }),
                });
                const json = await res.json();
                if (!res.ok) {
                    setErro(json.error || 'Erro ao salvar bloqueio.');
                    return;
                }
            } else {
                const res = await fetch('/api/admin/agendamentos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        unidade_id: unidadeId,
                        professor_id: professorId,
                        aluno_id: cadastroRapido ? null : alunoId,
                        novo_aluno: cadastroRapido
                            ? {
                                nome_aluno: novoAlunoNome,
                                responsavel_nome: novoRespNome,
                                telefone: novoTelefone,
                                colegio_nome: novoColegio,
                                serie: novoSerie,
                            }
                            : null,
                        materia,
                        data,
                        hora_inicio: horaFormatada,
                        duracao_minutos: totalMinutos,
                        observacoes,
                        status: statusInicial,
                        recorrencia_semanas: recorrencia,
                    }),
                });
                const json = await res.json();
                if (!res.ok) {
                    setErro(json.error || 'Erro ao agendar aula.');
                    return;
                }
            }

            await onSucessoAction();
            onFecharAction();
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
            <div
                className={`border rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto ${clsCard}`}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <span
                            className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${
                                modo === 'bloqueio' ? 'bg-[#C24124]' : 'bg-[#0E7C86]'
                            }`}
                        >
                            {modo === 'bloqueio' ? (
                                <Ban className="w-4 h-4" />
                            ) : (
                                <CalendarPlus className="w-4 h-4" />
                            )}
                        </span>
                        <div>
                            <h2 className={`text-base font-bold ${clsTitulo}`}>
                                {modo === 'bloqueio' ? 'Bloqueio de Agenda' : 'Nova Marcação R4'}
                            </h2>
                            <p className={`text-[11px] ${clsSubtexto}`}>
                                {modo === 'bloqueio'
                                    ? 'Bloqueia horários na grade e no portal do aluno'
                                    : 'Agendamento flexível (50 a 300 min • individual ou grupo)'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onFecharAction}
                        className={`p-1.5 rounded-lg cursor-pointer ${clsSubtexto}`}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {!ehProfessor && (
                    <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border ${clsSubCard}`}>
                        <button
                            type="button"
                            onClick={() => {
                                setModo('aula');
                                setDuracaoHoras(1);
                                setDuracaoMinutos(40);
                                setErro(null);
                            }}
                            className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                                modo === 'aula'
                                    ? 'bg-[#0E7C86] text-white'
                                    : `${clsSubtexto} hover:text-[#1496A1]`
                            }`}
                        >
                            Agendar Aula
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setModo('bloqueio');
                                setDuracaoHoras(1);
                                setDuracaoMinutos(0);
                                setErro(null);
                            }}
                            className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                                modo === 'bloqueio'
                                    ? 'bg-[#C24124] text-white'
                                    : `${clsSubtexto} hover:text-[#E07A5F]`
                            }`}
                        >
                            Bloqueio de Agenda
                        </button>
                    </div>
                )}

                <form onSubmit={(e) => void handleSalvar(e)} className="space-y-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {!ehProfessor && (
                            <div>
                                <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                    Unidade *
                                </label>
                                <select
                                    value={unidadeId}
                                    onChange={(e) => {
                                        const uid = Number(e.target.value);
                                        setUnidadeId(uid);
                                        const primeiroProf = professores.find(
                                            (p) => p.ativo && p.unidade_id === uid
                                        );
                                        if (primeiroProf) {
                                            setProfessorId(primeiroProf.id);
                                            setMateria(primeiroProf.materias?.[0] || '');
                                        }
                                    }}
                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                >
                                    {unidades.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className={ehProfessor ? 'sm:col-span-2' : ''}>
                            <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                Professor(a) *
                            </label>
                            <select
                                disabled={ehProfessor}
                                value={professorId}
                                onChange={(e) => {
                                    const pid = Number(e.target.value);
                                    setProfessorId(pid);
                                    const prof = professores.find((p) => p.id === pid);
                                    if (prof?.materias?.length) {
                                        setMateria(prof.materias[0]);
                                    }
                                }}
                                className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                            >
                                {(ehProfessor ? professores : profsDaUnidade).map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.nome}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {modo === 'aula' ? (
                        <>
                            <div className={`border rounded-xl p-3 space-y-2.5 ${clsSubCard}`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-bold ${clsTitulo}`}>
                                        Aluno(a) *
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setCadastroRapido((v) => !v)}
                                        className="text-[11px] font-bold text-[#1496A1] hover:underline inline-flex items-center gap-1 cursor-pointer"
                                    >
                                        <UserPlus className="w-3.5 h-3.5" />
                                        {cadastroRapido
                                            ? 'Selecionar aluno já cadastrado'
                                            : '+ Cadastrar novo aluno'}
                                    </button>
                                </div>

                                {!cadastroRapido ? (
                                    <div className="space-y-2">
                                        <div className="relative">
                                            <Search
                                                className={`w-3.5 h-3.5 absolute left-3 top-2.5 ${clsSubtexto}`}
                                            />
                                            <input
                                                type="text"
                                                value={buscaAluno}
                                                onChange={(e) => setBuscaAluno(e.target.value)}
                                                placeholder="Buscar aluno por nome, responsável ou telefone..."
                                                className={`w-full border rounded-xl pl-8 pr-3 py-2 text-xs ${clsInput}`}
                                            />
                                        </div>
                                        <select
                                            required
                                            value={alunoId}
                                            onChange={(e) => setAlunoId(Number(e.target.value))}
                                            className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                        >
                                            <option value={0}>Selecione o aluno...</option>
                                            {alunosFiltrados.map((al) => (
                                                <option key={al.id} value={al.id}>
                                                    {al.nome_aluno} — {al.serie} ({al.colegio_nome}) • Resp.:{' '}
                                                    {al.responsavel_nome || al.telefone_formatado}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <input
                                            type="text"
                                            required
                                            value={novoAlunoNome}
                                            onChange={(e) => setNovoAlunoNome(e.target.value)}
                                            placeholder="Nome do aluno *"
                                            className={`border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                        />
                                        <input
                                            type="text"
                                            required
                                            value={novoTelefone}
                                            onChange={(e) => setNovoTelefone(e.target.value)}
                                            placeholder="WhatsApp c/ DDD *"
                                            className={`border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                        />
                                        <input
                                            type="text"
                                            value={novoRespNome}
                                            onChange={(e) => setNovoRespNome(e.target.value)}
                                            placeholder="Nome do responsável"
                                            className={`border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                        />
                                        <input
                                            type="text"
                                            value={novoSerie}
                                            onChange={(e) => setNovoSerie(e.target.value)}
                                            placeholder="Série (ex: 8º Ano)"
                                            className={`border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                        />
                                        <input
                                            type="text"
                                            value={novoColegio}
                                            onChange={(e) => setNovoColegio(e.target.value)}
                                            placeholder="Colégio"
                                            className={`sm:col-span-2 border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                        Matéria / Serviço *
                                    </label>
                                    <select
                                        required
                                        value={materia}
                                        onChange={(e) => setMateria(e.target.value)}
                                        className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                    >
                                        {(profSelecionado?.materias || ['Reforço Geral']).map((m) => (
                                            <option key={m} value={m}>
                                                {m}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                        Status Inicial
                                    </label>
                                    <select
                                        value={statusInicial}
                                        onChange={(e) =>
                                            setStatusInicial(
                                                e.target.value as 'agendado' | 'confirmado'
                                            )
                                        }
                                        className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                    >
                                        <option value="confirmado">Confirmado</option>
                                        <option value="agendado">Agendado</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                    Assuntos / Conteúdo da Aula
                                </label>
                                <input
                                    type="text"
                                    value={observacoes}
                                    onChange={(e) => setObservacoes(e.target.value)}
                                    placeholder="Ex: Equação do 2º grau, revisão prova trimestral..."
                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                    Título do Bloqueio *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={tituloBloqueio}
                                    onChange={(e) => setTituloBloqueio(e.target.value)}
                                    placeholder="Ex: Indisponível, Reunião pedagógica, Almoço..."
                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-[11px] mb-1 ${clsSubtexto}`}>
                                    Descrição do Bloqueio (opcional)
                                </label>
                                <textarea
                                    rows={2}
                                    value={descricaoBloqueio}
                                    onChange={(e) => setDescricaoBloqueio(e.target.value)}
                                    placeholder="Detalhes adicionais sobre o bloqueio..."
                                    className={`w-full border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                                />
                            </div>
                        </>
                    )}

                    <div className={`border rounded-xl p-3.5 space-y-3 ${clsSubCard}`}>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-xs font-bold w-16 ${clsTitulo}`}>Início *</span>
                            <input
                                type="date"
                                required
                                value={data}
                                onChange={(e) => setData(e.target.value)}
                                className={`border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                            />
                            <select
                                value={hora}
                                onChange={(e) => setHora(e.target.value)}
                                className={`border rounded-xl px-2.5 py-2 text-xs font-semibold ${clsInput}`}
                            >
                                {HORAS_INICIO.map((h) => (
                                    <option key={h} value={h}>
                                        {h}
                                    </option>
                                ))}
                            </select>
                            <span className={`font-bold ${clsSubtexto}`}>:</span>
                            <select
                                value={minuto}
                                onChange={(e) => setMinuto(e.target.value)}
                                className={`border rounded-xl px-2.5 py-2 text-xs font-semibold ${clsInput}`}
                            >
                                {MINUTOS_PASSO.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-xs font-bold w-16 ${clsTitulo}`}>Duração *</span>
                            <select
                                value={duracaoHoras}
                                onChange={(e) => setDuracaoHoras(Number(e.target.value))}
                                className={`border rounded-xl px-2.5 py-2 text-xs font-semibold ${clsInput}`}
                            >
                                {(modo === 'bloqueio'
                                        ? [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14]
                                        : [0, 1, 2, 3, 4, 5]
                                ).map((hr) => (
                                    <option key={hr} value={hr}>
                                        {hr}
                                    </option>
                                ))}
                            </select>
                            <span className={`text-xs ${clsSubtexto}`}>hr</span>

                            <select
                                value={duracaoMinutos}
                                onChange={(e) => setDuracaoMinutos(Number(e.target.value))}
                                className={`border rounded-xl px-2.5 py-2 text-xs font-semibold ${clsInput}`}
                            >
                                {MINUTOS_PASSO.map((m) => (
                                    <option key={m} value={Number(m)}>
                                        {Number(m)}
                                    </option>
                                ))}
                            </select>
                            <span className={`text-xs ${clsSubtexto}`}>min</span>

                            <span className="ml-auto px-3 py-1.5 rounded-lg bg-[#0E7C86]/20 border border-[#0E7C86]/40 text-xs font-bold text-[#25A4AF]">
                                {formatarDuracaoLabel(totalMinutos)}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <span className={`text-xs font-semibold ${clsSubtexto}`}>Recorrência</span>
                        <select
                            value={recorrencia}
                            onChange={(e) => setRecorrencia(Number(e.target.value))}
                            className={`border rounded-xl px-3 py-2 text-xs ${clsInput}`}
                        >
                            <option value={1}>Não se repete</option>
                            <option value={2}>Repetir semanalmente (2 semanas)</option>
                            <option value={4}>Repetir semanalmente (4 semanas)</option>
                            <option value={8}>Repetir semanalmente (8 semanas)</option>
                        </select>
                    </div>

                    {erro && (
                        <p className="text-xs text-rose-400 bg-[#BE1E23]/15 border border-[#BE1E23]/40 rounded-xl px-3.5 py-2.5">
                            {erro}
                        </p>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onFecharAction}
                            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${clsSubCard}`}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={salvando}
                            className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer shadow-md ${
                                modo === 'bloqueio'
                                    ? 'bg-[#C24124] hover:bg-[#D14D30]'
                                    : 'bg-[#0E7C86] hover:bg-[#118E99]'
                            }`}
                        >
                            {modo === 'bloqueio' ? (
                                <Plus className="w-4 h-4" />
                            ) : (
                                <Check className="w-4 h-4" />
                            )}
                            {salvando
                                ? 'Salvando...'
                                : modo === 'bloqueio'
                                    ? 'Salvar Bloqueio'
                                    : 'Criar Atendimento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}