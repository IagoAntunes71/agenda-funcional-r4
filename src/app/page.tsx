'use client';

import { useEffect, useState } from 'react';
import { SLOTS_FIXOS_100_MIN, SlotAula } from '@/lib/horarios-reforco';
import {
  SERIES_ESCOLARES,
  formatarTelefone,
  normalizarTelefone,
} from '@/lib/cliente-helpers';

interface Unidade {
  id: number;
  nome: string;
}

interface DataLiberada {
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

interface AlunoCadastrado {
  id: number;
  telefone: string;
  telefone_formatado: string | null;
  nome_aluno: string;
  colegio_id: number | null;
  colegio_nome: string;
  serie: string;
}

interface ColegioOficial {
  id: number;
  nome: string;
}

interface ComprovanteAgendamento {
  id: number;
  unidade: string;
  professor: string;
  materia: string;
  data: string;
  horario: string;
  alunoNome: string;
  colegioNome?: string;
  serie?: string;
  linkWaMe?: string | null;
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
  const [telefoneInput, setTelefoneInput] = useState<string>('');
  const [telefoneConfirmado, setTelefoneConfirmado] = useState<string>('');
  const [buscandoCliente, setBuscandoCliente] = useState<boolean>(true);
  const [erroCliente, setErroCliente] = useState<string | null>(null);

  const [alunos, setAlunos] = useState<AlunoCadastrado[]>([]);
  const [alunoSelecionadoId, setAlunoSelecionadoId] = useState<number>(0);
  const [colegiosOficiais, setColegiosOficiais] = useState<ColegioOficial[]>([]);
  const [exibirFormNovoAluno, setExibirFormNovoAluno] = useState<boolean>(false);

  const [novoAlunoNome, setNovoAlunoNome] = useState<string>('');
  const [colegioOpcao, setColegioOpcao] = useState<string>('');
  const [colegioOutroNome, setColegioOutroNome] = useState<string>('');
  const [serieAluno, setSerieAluno] = useState<string>(SERIES_ESCOLARES[0]);
  const [salvandoAluno, setSalvandoAluno] = useState<boolean>(false);
  const [erroFormAluno, setErroFormAluno] = useState<string | null>(null);

  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [datas, setDatas] = useState<DataLiberada[]>([]);
  const [materias, setMaterias] = useState<string[]>([]);
  const [professores, setProfessores] = useState<ProfessorDisponivel[]>([]);

  const [unidadeId, setUnidadeId] = useState<number>(0);
  const [dataSelecionada, setDataSelecionada] = useState<string>('');
  const [materiaFiltro, setMateriaFiltro] = useState<string>('todas');
  const [buscaProfessor, setBuscaProfessor] = useState<string>('');

  const [carregandoHorarios, setCarregandoHorarios] = useState<boolean>(true);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  const [selecaoSlot, setSelecaoSlot] = useState<{
    professor: ProfessorDisponivel;
    slot: SlotAula;
  } | null>(null);

  const [materiaAula, setMateriaAula] = useState<string>('');
  const [observacoes, setObservacoes] = useState<string>('');
  const [enviandoAgendamento, setEnviandoAgendamento] = useState<boolean>(false);
  const [erroModal, setErroModal] = useState<string | null>(null);
  const [comprovante, setComprovante] =
      useState<ComprovanteAgendamento | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function inicializar() {
      const search = new URLSearchParams(window.location.search);
      const telUrl =
          search.get('tel') ||
          search.get('telefone') ||
          search.get('whatsapp') ||
          search.get('phone') ||
          '';
      const telSalvo = window.localStorage.getItem('r4_whatsapp_cliente') || '';
      const telInicial = normalizarTelefone(telUrl || telSalvo);

      if (telInicial) {
        setTelefoneInput(formatarTelefone(telInicial));
      }

      try {
        const [resCliente, resDisp] = await Promise.all([
          fetch(
              `/api/cliente${
                  telInicial ? `?telefone=${encodeURIComponent(telInicial)}` : ''
              }`,
              { cache: 'no-store' }
          ),
          fetch('/api/disponibilidade', { cache: 'no-store' }),
        ]);

        const jsonCliente = await resCliente.json();
        const jsonDisp = await resDisp.json();
        if (cancelado) return;

        if (resCliente.ok) {
          const listaColegios: ColegioOficial[] = jsonCliente.colegios || [];
          setColegiosOficiais(listaColegios);
          setColegioOpcao(
              listaColegios.length > 0 ? String(listaColegios[0].id) : 'outros'
          );

          if (jsonCliente.telefone) {
            setTelefoneConfirmado(jsonCliente.telefone);
            window.localStorage.setItem(
                'r4_whatsapp_cliente',
                jsonCliente.telefone
            );
            const listaAlunos: AlunoCadastrado[] = jsonCliente.alunos || [];
            setAlunos(listaAlunos);
            if (listaAlunos.length > 0) {
              setAlunoSelecionadoId(listaAlunos[0].id);
              setExibirFormNovoAluno(false);
            } else {
              setExibirFormNovoAluno(true);
            }
          }
        }

        if (resDisp.ok) {
          setUnidades(jsonDisp.unidades || []);
          setDatas(jsonDisp.datas || []);
          setMaterias(jsonDisp.materias || []);
          setProfessores(jsonDisp.professores || []);

          if (jsonDisp.unidadeIdSelecionada) {
            setUnidadeId(jsonDisp.unidadeIdSelecionada);
          }
          if (jsonDisp.dataSelecionada) {
            setDataSelecionada(jsonDisp.dataSelecionada);
          }
        } else {
          setErroGeral(jsonDisp.error || 'Falha ao carregar horários.');
        }
      } catch {
        if (!cancelado) {
          setErroGeral('Erro de conexão com o servidor.');
        }
      } finally {
        if (!cancelado) {
          setBuscandoCliente(false);
          setCarregandoHorarios(false);
        }
      }
    }

    void inicializar();
    return () => {
      cancelado = true;
    };
  }, []);

  async function handleIdentificarTelefone(e: React.FormEvent) {
    e.preventDefault();
    const tel = normalizarTelefone(telefoneInput);
    if (tel.length < 10 || tel.length > 11) {
      setErroCliente('Digite um número de WhatsApp válido com DDD.');
      return;
    }

    setBuscandoCliente(true);
    setErroCliente(null);

    try {
      const res = await fetch(
          `/api/cliente?telefone=${encodeURIComponent(tel)}`,
          { cache: 'no-store' }
      );
      const json = await res.json();

      if (!res.ok) {
        setErroCliente(json.error || 'Erro ao buscar número.');
        return;
      }

      setTelefoneConfirmado(json.telefone);
      setTelefoneInput(formatarTelefone(json.telefone));
      window.localStorage.setItem('r4_whatsapp_cliente', json.telefone);

      const listaColegios: ColegioOficial[] = json.colegios || [];
      setColegiosOficiais(listaColegios);
      if (!colegioOpcao) {
        setColegioOpcao(
            listaColegios.length > 0 ? String(listaColegios[0].id) : 'outros'
        );
      }

      const listaAlunos: AlunoCadastrado[] = json.alunos || [];
      setAlunos(listaAlunos);
      if (listaAlunos.length > 0) {
        setAlunoSelecionadoId(listaAlunos[0].id);
        setExibirFormNovoAluno(false);
      } else {
        setExibirFormNovoAluno(true);
      }
    } catch {
      setErroCliente('Falha de conexão ao verificar seu WhatsApp.');
    } finally {
      setBuscandoCliente(false);
    }
  }

  function handleTrocarNumero() {
    window.localStorage.removeItem('r4_whatsapp_cliente');
    setTelefoneConfirmado('');
    setTelefoneInput('');
    setAlunos([]);
    setAlunoSelecionadoId(0);
    setExibirFormNovoAluno(false);
    setSelecaoSlot(null);
  }

  async function handleCadastrarAluno(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoAluno(true);
    setErroFormAluno(null);

    try {
      const res = await fetch('/api/cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'cadastrarAluno',
          telefone: telefoneConfirmado,
          nomeAluno: novoAlunoNome,
          colegioOpcao,
          colegioOutroNome,
          serie: serieAluno,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErroFormAluno(json.error || 'Erro ao cadastrar aluno.');
        return;
      }

      const listaAtualizada: AlunoCadastrado[] = json.alunos || [];
      setAlunos(listaAtualizada);
      if (json.alunoCriado?.id) {
        setAlunoSelecionadoId(json.alunoCriado.id);
      }
      setNovoAlunoNome('');
      setColegioOutroNome('');
      setExibirFormNovoAluno(false);
    } catch {
      setErroFormAluno('Erro de rede ao salvar aluno.');
    } finally {
      setSalvandoAluno(false);
    }
  }

  async function atualizarDisponibilidade(
      unId: number,
      dt: string,
      mat: string
  ) {
    setCarregandoHorarios(true);
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
    } catch {
      setErroGeral('Erro de conexão ao consultar horários disponíveis.');
    } finally {
      setCarregandoHorarios(false);
    }
  }

  function handleTrocarUnidade(novoId: number) {
    setUnidadeId(novoId);
    setMateriaFiltro('todas');
    setSelecaoSlot(null);
    void atualizarDisponibilidade(novoId, dataSelecionada, 'todas');
  }

  function handleTrocarData(novaData: string) {
    setDataSelecionada(novaData);
    setSelecaoSlot(null);
    void atualizarDisponibilidade(unidadeId, novaData, materiaFiltro);
  }

  function handleTrocarMateria(novaMateria: string) {
    setMateriaFiltro(novaMateria);
    setSelecaoSlot(null);
    void atualizarDisponibilidade(unidadeId, dataSelecionada, novaMateria);
  }

  function abrirModalAgendamento(prof: ProfessorDisponivel, slot: SlotAula) {
    setSelecaoSlot({ professor: prof, slot });
    const matInicial =
        materiaFiltro !== 'todas'
            ? materiaFiltro
            : prof.materias[0] || 'Reforço Geral';
    setMateriaAula(matInicial);
    setErroModal(null);
  }

  async function handleConfirmarAgendamento(e: React.FormEvent) {
    e.preventDefault();
    const alunoAtivo = alunos.find((a) => a.id === alunoSelecionadoId);
    if (!selecaoSlot || !alunoAtivo) return;

    setEnviandoAgendamento(true);
    setErroModal(null);

    try {
      const res = await fetch('/api/agendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unidadeId,
          professorId: selecaoSlot.professor.id,
          alunoId: alunoAtivo.id,
          materia: materiaAula,
          data: dataSelecionada,
          horaInicio: selecaoSlot.slot.inicio,
          alunoNome: alunoAtivo.nome_aluno,
          alunoTelefone: telefoneConfirmado,
          colegioNome: alunoAtivo.colegio_nome,
          serie: alunoAtivo.serie,
          observacoes,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErroModal(json.error || 'Não foi possível concluir o agendamento.');
        return;
      }

      setComprovante(json.agendamento);
      setSelecaoSlot(null);
      setObservacoes('');
      await atualizarDisponibilidade(unidadeId, dataSelecionada, materiaFiltro);
    } catch {
      setErroModal('Falha de rede ao enviar agendamento.');
    } finally {
      setEnviandoAgendamento(false);
    }
  }

  const alunoAtivo = alunos.find((a) => a.id === alunoSelecionadoId) || null;
  const professoresExibidos = professores.filter(
      (p) =>
          !buscaProfessor.trim() ||
          p.nome.toLowerCase().includes(buscaProfessor.trim().toLowerCase())
  );

  return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
          <header className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <span className="inline-block text-xs font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">
            R4 Ensina • Reforço Escolar
          </span>
            <h1 className="text-2xl font-bold text-white mt-2">
              Agendamento de Aulas (100 min)
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Turnos fixos de 1h40 (14:10 às 20:50) sincronizados em tempo real com a agenda dos professores.
            </p>
          </header>

          {comprovante && (
              <section className="bg-emerald-950/50 border border-emerald-500/40 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-emerald-300">
                    Aula agendada com sucesso!
                  </p>
                  <p className="text-xs text-slate-200">
                    <strong>Aluno(a):</strong> {comprovante.alunoNome}
                    {comprovante.colegioNome ? ` • ${comprovante.colegioNome}` : ''}
                    {comprovante.serie ? ` (${comprovante.serie})` : ''}
                  </p>
                  <p className="text-xs text-slate-300">
                    <strong>Unidade:</strong> {comprovante.unidade} •{' '}
                    <strong>Matéria:</strong> {comprovante.materia} •{' '}
                    <strong>Professor(a):</strong> {comprovante.professor} •{' '}
                    <strong>Data:</strong> {comprovante.data} às{' '}
                    {comprovante.horario}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {comprovante.linkWaMe && (
                      <a
                          href={comprovante.linkWaMe}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-slate-950 transition"
                      >
                        Enviar Comprovante no WhatsApp da Secretaria
                      </a>
                  )}
                  <button
                      type="button"
                      onClick={() => setComprovante(null)}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white"
                  >
                    Fechar aviso
                  </button>
                </div>
              </section>
          )}

          {/* PASSO 1: IDENTIFICAÇÃO PELO NÚMERO DE WHATSAPP */}
          {!telefoneConfirmado ? (
              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg mx-auto space-y-4">
                <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Passo 1 de 3
              </span>
                  <h2 className="text-xl font-bold text-white mt-1">
                    Informe seu WhatsApp
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Digite apenas o seu número com DDD para cadastrar ou selecionar seus filhos.
                  </p>
                </div>

                <form onSubmit={handleIdentificarTelefone} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Número do WhatsApp *
                    </label>
                    <input
                        type="tel"
                        required
                        value={telefoneInput}
                        onChange={(e) =>
                            setTelefoneInput(formatarTelefone(e.target.value))
                        }
                        placeholder="(71) 99999-9999"
                        className="w-full rounded-xl bg-slate-950 border border-slate-700 px-4 py-3 text-base text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {erroCliente && (
                      <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
                        {erroCliente}
                      </div>
                  )}

                  <button
                      type="submit"
                      disabled={buscandoCliente}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold text-white transition"
                  >
                    {buscandoCliente ? 'Verificando número...' : 'Continuar'}
                  </button>
                </form>
              </section>
          ) : (
              <>
                {/* PASSO 2: SELEÇÃO / CADASTRO DE ALUNOS (MÚLTIPLOS FILHOS) */}
                <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                    <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                    WhatsApp Identificado
                  </span>
                      <p className="text-base font-bold text-white">
                        {formatarTelefone(telefoneConfirmado)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {alunos.length > 0 && !exibirFormNovoAluno && (
                          <button
                              type="button"
                              onClick={() => setExibirFormNovoAluno(true)}
                              className="px-3.5 py-2 rounded-xl bg-sky-600/20 hover:bg-sky-600 border border-sky-500/50 text-sky-200 hover:text-white text-xs font-semibold transition"
                          >
                            + Cadastrar outro filho(a)
                          </button>
                      )}
                      <button
                          type="button"
                          onClick={handleTrocarNumero}
                          className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
                      >
                        Trocar número
                      </button>
                    </div>
                  </div>

                  {alunos.length > 0 && (
                      <div className="space-y-2.5">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Selecione o(a) Aluno(a) para esta aula
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {alunos.map((al) => {
                            const selecionado = al.id === alunoSelecionadoId;
                            return (
                                <button
                                    key={al.id}
                                    type="button"
                                    onClick={() => {
                                      setAlunoSelecionadoId(al.id);
                                      setExibirFormNovoAluno(false);
                                    }}
                                    className={`text-left p-4 rounded-xl border transition ${
                                        selecionado
                                            ? 'bg-emerald-600/15 border-emerald-500 text-white'
                                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                                    }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-sm">
                              {al.nome_aluno}
                            </span>
                                    {selecionado && (
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950">
                                Selecionado
                              </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-400 mt-1">
                                    {al.colegio_nome}
                                  </p>
                                  <p className="text-xs text-slate-500">{al.serie}</p>
                                </button>
                            );
                          })}
                        </div>
                      </div>
                  )}

                  {exibirFormNovoAluno && (
                      <form
                          onSubmit={handleCadastrarAluno}
                          className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-white">
                            {alunos.length === 0
                                ? 'Cadastrar Dados do Aluno(a)'
                                : 'Cadastrar Novo Filho(a) neste WhatsApp'}
                          </h3>
                          {alunos.length > 0 && (
                              <button
                                  type="button"
                                  onClick={() => setExibirFormNovoAluno(false)}
                                  className="text-xs text-slate-400 hover:text-white"
                              >
                                Cancelar
                              </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              Nome Completo do Aluno(a) *
                            </label>
                            <input
                                type="text"
                                required
                                value={novoAlunoNome}
                                onChange={(e) => setNovoAlunoNome(e.target.value)}
                                placeholder="Ex: Lucas Andrade"
                                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-sm text-white"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              Colégio *
                            </label>
                            <select
                                required
                                value={colegioOpcao}
                                onChange={(e) => setColegioOpcao(e.target.value)}
                                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-sm text-white"
                            >
                              {colegiosOficiais.map((col) => (
                                  <option key={col.id} value={String(col.id)}>
                                    {col.nome}
                                  </option>
                              ))}
                              <option value="outros">
                                Outros (digitar nome do colégio)
                              </option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                              Série / Ano Escolar *
                            </label>
                            <select
                                required
                                value={serieAluno}
                                onChange={(e) => setSerieAluno(e.target.value)}
                                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-sm text-white"
                            >
                              {SERIES_ESCOLARES.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {colegioOpcao === 'outros' && (
                            <div>
                              <label className="block text-xs font-medium text-amber-300 mb-1">
                                Digite o Nome do Colégio *
                              </label>
                              <input
                                  type="text"
                                  required
                                  value={colegioOutroNome}
                                  onChange={(e) => setColegioOutroNome(e.target.value)}
                                  placeholder="Ex: Colégio Antônio Vieira"
                                  className="w-full rounded-xl bg-slate-900 border border-amber-500/50 px-3.5 py-2.5 text-sm text-white"
                              />
                            </div>
                        )}

                        {erroFormAluno && (
                            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-300">
                              {erroFormAluno}
                            </div>
                        )}

                        <div className="flex justify-end">
                          <button
                              type="submit"
                              disabled={salvandoAluno}
                              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white"
                          >
                            {salvandoAluno
                                ? 'Salvando aluno...'
                                : 'Salvar Aluno e Escolher Horário'}
                          </button>
                        </div>
                      </form>
                  )}
                </section>

                {/* PASSO 3: ESCOLHA DE UNIDADE, DATA, MATÉRIA E HORÁRIO (100 MIN) */}
                {alunoAtivo && (
                    <>
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
                          {datas.length === 0 && !carregandoHorarios ? (
                              <p className="text-sm text-amber-400">
                                Nenhuma data liberada no momento.
                              </p>
                          ) : (
                              <div className="flex flex-wrap gap-2">
                                {datas.map((d) => {
                                  const ativa = d.data === dataSelecionada;
                                  return (
                                      <button
                                          key={d.data}
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
                              <option value="todas">
                                Todas as matérias da unidade
                              </option>
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

                      <section className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h2 className="text-lg font-semibold text-white">
                            4. Horários Disponíveis para {alunoAtivo.nome_aluno}
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

                        {carregandoHorarios ? (
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
                                                  onClick={() =>
                                                      abrirModalAgendamento(prof, slot)
                                                  }
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
                    </>
                )}
              </>
          )}
        </div>

        {/* Modal Rápido de Confirmação */}
        {selecaoSlot && alunoAtivo && (
            <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Confirmar Aula de Reforço
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {selecaoSlot.professor.nome} • {selecaoSlot.slot.label} (100 min)
                    </p>
                  </div>
                  <button
                      type="button"
                      onClick={() => setSelecaoSlot(null)}
                      className="text-slate-400 hover:text-white text-sm"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1 text-xs">
                  <p className="text-white font-semibold">
                    Aluno(a): {alunoAtivo.nome_aluno}
                  </p>
                  <p className="text-slate-400">
                    {alunoAtivo.colegio_nome} • {alunoAtivo.serie}
                  </p>
                  <p className="text-slate-400">
                    WhatsApp: {formatarTelefone(telefoneConfirmado)}
                  </p>
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
                      {(selecaoSlot.professor.materias.length > 0
                              ? selecaoSlot.professor.materias
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
                      Assunto da Prova / Observações (opcional)
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
                        onClick={() => setSelecaoSlot(null)}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
                    >
                      Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={enviandoAgendamento}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white"
                    >
                      {enviandoAgendamento
                          ? 'Confirmando...'
                          : 'Confirmar Agendamento'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
        )}
      </main>
  );
}