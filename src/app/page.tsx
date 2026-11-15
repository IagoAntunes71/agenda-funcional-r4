'use client';

import { useEffect, useState } from 'react';
import { SLOTS_FIXOS_100_MIN, SlotAula } from '@/lib/horarios-reforco';

interface Unidade {
  id: number;
  nome: string;
}

interface DataLiberada {
  id: number;
  data: string;
  data_formatada: string;
}

interface ProfessorDisponivel {
  id: number;
  nome: string;
  unidade_id: number;
  materias: string[];
  slotsDisponiveis: SlotAula[];
}

interface ComprovanteAgendamento {
  id: number;
  unidade: string;
  professor: string;
  materia: string;
  data: string;
  horario: string;
  alunoNome: string;
}

function formatarDiaSemana(isoDate: string): string {
  const [ano, mes, dia] = isoDate.split('-').map(Number);
  if (!ano || !mes || !dia) return '';
  const dt = new Date(ano, mes - 1, dia);
  return dt
      .toLocaleDateString('pt-BR', { weekday: 'short' })
      .replace('.', '')
      .toUpperCase();
}

export default function PaginaAgendamentoReforco() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [datas, setDatas] = useState<DataLiberada[]>([]);
  const [materias, setMaterias] = useState<string[]>([]);
  const [professores, setProfessores] = useState<ProfessorDisponivel[]>([]);

  const [unidadeId, setUnidadeId] = useState<number>(0);
  const [dataSelecionada, setDataSelecionada] = useState<string>('');
  const [materiaFiltro, setMateriaFiltro] = useState<string>('todas');
  const [buscaProfessor, setBuscaProfessor] = useState<string>('');

  const [carregando, setCarregando] = useState<boolean>(true);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  // Seleção de professor e horário para agendar
  const [selecao, setSelecao] = useState<{
    professor: ProfessorDisponivel;
    slot: SlotAula;
  } | null>(null);

  const [materiaAula, setMateriaAula] = useState<string>('');
  const [alunoNome, setAlunoNome] = useState<string>('');
  const [alunoTelefone, setAlunoTelefone] = useState<string>('');
  const [responsavelNome, setResponsavelNome] = useState<string>('');
  const [observacoes, setObservacoes] = useState<string>('');
  const [enviando, setEnviando] = useState<boolean>(false);
  const [erroModal, setErroModal] = useState<string | null>(null);
  const [comprovante, setComprovante] =
      useState<ComprovanteAgendamento | null>(null);

  async function carregarDisponibilidade(
      unId?: number,
      dt?: string,
      mat?: string
  ) {
    setCarregando(true);
    setErroGeral(null);

    try {
      const params = new URLSearchParams();
      if (unId) params.set('unidadeId', String(unId));
      if (dt) params.set('data', dt);
      if (mat && mat !== 'todas') params.set('materia', mat);

      const res = await fetch(`/api/disponibilidade?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = await res.json();

      if (!res.ok) {
        setErroGeral(json.error || 'Falha ao carregar horários.');
        return;
      }

      setUnidades(json.unidades || []);
      setDatas(json.datas || []);
      setMaterias(json.materias || []);
      setProfessores(json.professores || []);

      if (!unId && json.unidadeIdSelecionada) {
        setUnidadeId(json.unidadeIdSelecionada);
      }
      if (!dt && json.dataSelecionada) {
        setDataSelecionada(json.dataSelecionada);
      }
    } catch {
      setErroGeral('Erro de conexão ao consultar horários disponíveis.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarDisponibilidade();
  }, []);

  function handleTrocarUnidade(novoId: number) {
    setUnidadeId(novoId);
    setMateriaFiltro('todas');
    setSelecao(null);
    carregarDisponibilidade(novoId, dataSelecionada, 'todas');
  }

  function handleTrocarData(novaData: string) {
    setDataSelecionada(novaData);
    setSelecao(null);
    carregarDisponibilidade(unidadeId, novaData, materiaFiltro);
  }

  function handleTrocarMateria(novaMateria: string) {
    setMateriaFiltro(novaMateria);
    setSelecao(null);
    carregarDisponibilidade(unidadeId, dataSelecionada, novaMateria);
  }

  function abrirModalAgendamento(prof: ProfessorDisponivel, slot: SlotAula) {
    setSelecao({ professor: prof, slot });
    const matInicial =
        materiaFiltro !== 'todas'
            ? materiaFiltro
            : prof.materias[0] || 'Reforço Geral';
    setMateriaAula(matInicial);
    setErroModal(null);
  }

  async function handleConfirmarAgendamento(e: React.FormEvent) {
    e.preventDefault();
    if (!selecao) return;

    setEnviando(true);
    setErroModal(null);

    try {
      const res = await fetch('/api/agendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unidadeId,
          professorId: selecao.professor.id,
          materia: materiaAula,
          data: dataSelecionada,
          horaInicio: selecao.slot.inicio,
          alunoNome,
          alunoTelefone,
          responsavelNome,
          observacoes,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErroModal(json.error || 'Não foi possível concluir o agendamento.');
        return;
      }

      setComprovante(json.agendamento);
      setSelecao(null);
      setAlunoNome('');
      setAlunoTelefone('');
      setResponsavelNome('');
      setObservacoes('');
      await carregarDisponibilidade(unidadeId, dataSelecionada, materiaFiltro);
    } catch {
      setErroModal('Falha de rede ao enviar agendamento.');
    } finally {
      setEnviando(false);
    }
  }

  const professoresExibidos = professores.filter(
      (p) =>
          !buscaProfessor.trim() ||
          p.nome.toLowerCase().includes(buscaProfessor.trim().toLowerCase())
  );

  return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
          {/* Cabeçalho */}
          <header className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              R4 Ensina • Reforço Escolar
            </span>
              <h1 className="text-2xl font-bold text-white mt-2">
                Agendamento de Aulas (100 min)
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Turnos fixos de 1h40 (14:10 às 20:50) sincronizados em tempo real com a agenda dos professores.
              </p>
            </div>
          </header>

          {/* Comprovante após agendar */}
          {comprovante && (
              <section className="bg-emerald-950/50 border border-emerald-500/40 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-emerald-300">
                    Aula agendada com sucesso! (Protocolo #{comprovante.id})
                  </p>
                  <p className="text-xs text-slate-200">
                    <strong>Aluno:</strong> {comprovante.alunoNome} •{' '}
                    <strong>Unidade:</strong> {comprovante.unidade} •{' '}
                    <strong>Matéria:</strong> {comprovante.materia}
                  </p>
                  <p className="text-xs text-slate-300">
                    <strong>Professor(a):</strong> {comprovante.professor} •{' '}
                    <strong>Data:</strong> {comprovante.data} •{' '}
                    <strong>Horário:</strong> {comprovante.horario}
                  </p>
                </div>
                <button
                    type="button"
                    onClick={() => setComprovante(null)}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                >
                  Fechar aviso
                </button>
              </section>
          )}

          {/* Passo 1: Unidade e Data */}
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                1. Escolha a Unidade
              </label>
              <div className="flex flex-wrap gap-2">
                {unidades.map((u) => {
                  const ativa = u.id === unidadeId;
                  return (
                      <button
                          key={u.id}
                          type="button"
                          onClick={() => handleTrocarUnidade(u.id)}
                          className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
                              ativa
                                  ? 'bg-emerald-600 border-emerald-500 text-white'
                                  : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                          }`}
                      >
                        {u.nome}
                      </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
                2. Escolha a Data
              </label>
              {datas.length === 0 && !carregando ? (
                  <p className="text-sm text-amber-400">
                    Nenhuma data liberada no momento.
                  </p>
              ) : (
                  <div className="flex flex-wrap gap-2">
                    {datas.map((d) => {
                      const ativa = d.data === dataSelecionada;
                      return (
                          <button
                              key={d.id}
                              type="button"
                              onClick={() => handleTrocarData(d.data)}
                              className={`px-3.5 py-2 rounded-xl text-left border transition ${
                                  ativa
                                      ? 'bg-sky-600 border-sky-400 text-white'
                                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                              }`}
                          >
                      <span className="block text-[10px] font-bold opacity-80">
                        {formatarDiaSemana(d.data)}
                      </span>
                            <span className="text-sm font-semibold">
                        {d.data_formatada}
                      </span>
                          </button>
                      );
                    })}
                  </div>
              )}
            </div>

            {/* Passo 3: Filtro de Matéria e Busca */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  3. Filtrar por Matéria
                </label>
                <select
                    value={materiaFiltro}
                    onChange={(e) => handleTrocarMateria(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="todas">Todas as matérias da unidade</option>
                  {materias.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Buscar Professor(a)
                </label>
                <input
                    type="text"
                    value={buscaProfessor}
                    onChange={(e) => setBuscaProfessor(e.target.value)}
                    placeholder="Digite o nome do professor..."
                    className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </section>

          {/* Lista de Professores e Horários de 100 min */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                4. Selecione o Professor e o Horário Disponível
              </h2>
              <span className="text-xs text-slate-400">
              Duração de cada aula: 100 min (1h40)
            </span>
            </div>

            {erroGeral && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                  {erroGeral}
                </div>
            )}

            {carregando ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-400">
                  Verificando horários livres e bloqueios dos professores...
                </div>
            ) : professoresExibidos.length === 0 ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-400">
                  Nenhum professor encontrado para os filtros selecionados nesta unidade.
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                  {professoresExibidos.map((prof) => {
                    const livresSet = new Set(
                        prof.slotsDisponiveis.map((s) => s.inicio)
                    );

                    return (
                        <div
                            key={prof.id}
                            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div className="space-y-2">
                            <h3 className="text-base font-bold text-white">
                              {prof.nome}
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                              {prof.materias.map((mat, idx) => (
                                  <span
                                      key={`${prof.id}-${idx}`}
                                      className="px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 text-xs"
                                  >
                            {mat}
                          </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {SLOTS_FIXOS_100_MIN.map((slot) => {
                              const disponivel = livresSet.has(slot.inicio);

                              return disponivel ? (
                                  <button
                                      key={slot.inicio}
                                      type="button"
                                      onClick={() => abrirModalAgendamento(prof, slot)}
                                      className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/60 text-emerald-200 hover:text-white text-xs font-semibold transition"
                                  >
                                    {slot.label}
                                  </button>
                              ) : (
                                  <span
                                      key={slot.inicio}
                                      title="Horário bloqueado ou ocupado na agenda do professor"
                                      className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-600 text-xs line-through select-none"
                                  >
                            {slot.label}
                          </span>
                              );
                            })}
                          </div>
                        </div>
                    );
                  })}
                </div>
            )}
          </section>
        </div>

        {/* Modal de Confirmação de Agendamento */}
        {selecao && (
            <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Confirmar Aula de Reforço
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {selecao.professor.nome} • {selecao.slot.label} (100 min)
                    </p>
                  </div>
                  <button
                      type="button"
                      onClick={() => setSelecao(null)}
                      className="text-slate-400 hover:text-white text-sm"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleConfirmarAgendamento} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Matéria da Aula *
                    </label>
                    <select
                        required
                        value={materiaAula}
                        onChange={(e) => setMateriaAula(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                    >
                      {(selecao.professor.materias.length > 0
                              ? selecao.professor.materias
                              : ['Reforço Geral']
                      ).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Nome Completo do Aluno *
                    </label>
                    <input
                        type="text"
                        required
                        value={alunoNome}
                        onChange={(e) => setAlunoNome(e.target.value)}
                        placeholder="Ex: João Pedro Silva"
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      WhatsApp / Telefone *
                    </label>
                    <input
                        type="tel"
                        required
                        value={alunoTelefone}
                        onChange={(e) => setAlunoTelefone(e.target.value)}
                        placeholder="(71) 99999-9999"
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Nome do Responsável (opcional)
                    </label>
                    <input
                        type="text"
                        value={responsavelNome}
                        onChange={(e) => setResponsavelNome(e.target.value)}
                        placeholder="Nome do pai, mãe ou responsável"
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Assunto / Observações (opcional)
                    </label>
                    <input
                        type="text"
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        placeholder="Ex: Revisão para prova de funções"
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  {erroModal && (
                      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                        {erroModal}
                      </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={() => setSelecao(null)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
                    >
                      Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={enviando}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white"
                    >
                      {enviando ? 'Confirmando...' : 'Confirmar Agendamento'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
        )}
      </main>
  );
}