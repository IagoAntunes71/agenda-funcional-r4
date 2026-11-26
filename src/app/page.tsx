'use client';
import AvatarProfessor from '@/components/agendamento/AvatarProfessor';
import { useCoresR4, variaveisCoresR4 } from '@/components/CoresInterfaceR4';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import LogoR4 from '@/components/LogoR4';
import { SlotAula } from '@/lib/horarios-reforco';
import {
  SERIES_ESCOLARES,
  formatarTelefone,
  normalizarTelefone,
} from '@/lib/cliente-helpers';
import { TEXTOS_PORTAL_PADRAO, TextosPortal } from '@/lib/portal-textos-padrao';
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
  todosSlots: SlotAula[];
  slotsDisponiveis: SlotAula[];
}

interface AlunoCadastrado {
  id: number;
  telefone: string;
  telefone_formatado: string | null;
  responsavel_nome?: string | null;
  nome_aluno: string;
  colegio_id: number | null;
  colegio_nome: string;
  serie: string;
}

interface ProximaAula {
  id: number;
  aluno_id?: number;
  unidade_nome: string;
  professor_nome: string;
  materia: string;
  data: string;
  data_formatada: string;
  hora_inicio: string;
  horario: string;
  aluno_nome: string;
  colegio_nome: string;
  serie: string;
  observacoes: string | null;
  pode_cancelar: boolean;
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
  respostaWhatsAppEnviada?: boolean;
}

type EtapaLoginCliente =
    | 'telefone'
    | 'exige_pin'
    | 'recuperar_pin'
    | 'criar_pin'
    | 'novo_cadastro'
    | 'confirmar_codigo_cadastro';

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
    const textoR4 = useTextoR4('portal');
    const { paleta } = useCoresR4();
  const [tema, setTema] = useState<'escuro' | 'claro'>('escuro');
  const [textos, setTextos] = useState<TextosPortal>(TEXTOS_PORTAL_PADRAO);

  const [sistemaAberto, setSistemaAberto] = useState<boolean>(true);
  const [motivoFechado, setMotivoFechado] = useState<string | null>(null);

  const [etapaLogin, setEtapaLogin] = useState<EtapaLoginCliente>('telefone');
  const [telefonePendente, setTelefonePendente] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>('');
  const [confirmarPinInput, setConfirmarPinInput] = useState<string>('');
  const [exigeVerificacaoCadastro, setExigeVerificacaoCadastro] =
      useState<boolean>(false);
  const [codigoOtpInput, setCodigoOtpInput] = useState<string>('');
  const [fichasPendentes, setFichasPendentes] = useState<Pick<AlunoCadastrado, 'id' | 'nome_aluno' | 'colegio_nome' | 'serie'>[]>([]);
  const [fichasSelecionadas, setFichasSelecionadas] = useState<number[]>([]);
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);
  const [erroVinculo, setErroVinculo] = useState('');
  const [avisoVinculo, setAvisoVinculo] = useState<string | null>(null);
  const [avisoOtp, setAvisoOtp] = useState<string | null>(null);
  const [cooldownOtpSegundos, setCooldownOtpSegundos] = useState<number>(0);
  const [enviandoCodigoOtp, setEnviandoCodigoOtp] = useState<boolean>(false);
  const [limiteSimultaneo, setLimiteSimultaneo] = useState<number>(2);

  const [responsavelInput, setResponsavelInput] = useState<string>('');
  const [responsavelConfirmado, setResponsavelConfirmado] = useState<string>('');
  const [telefoneInput, setTelefoneInput] = useState<string>('');
  const [telefoneConfirmado, setTelefoneConfirmado] = useState<string>('');
  const [buscandoCliente, setBuscandoCliente] = useState<boolean>(true);
  const [erroCliente, setErroCliente] = useState<string | null>(null);

  const [alunos, setAlunos] = useState<AlunoCadastrado[]>([]);
  const [alunoSelecionadoId, setAlunoSelecionadoId] = useState<number>(0);
  const [alunoEditandoId, setAlunoEditandoId] = useState<number | null>(null);
  const [colegiosOficiais, setColegiosOficiais] = useState<ColegioOficial[]>(
      []
  );
  const [exibirFormNovoAluno, setExibirFormNovoAluno] =
      useState<boolean>(false);

  const [remarcarId, setRemarcarId] = useState<number | null>(null);
  const [proximasAulas, setProximasAulas] = useState<ProximaAula[]>([]);
  const [confirmandoCancelamentoId, setConfirmandoCancelamentoId] = useState<
      number | null
  >(null);
  const [cancelandoAulaId, setCancelandoAulaId] = useState<number | null>(null);
  const [avisoProximasAulas, setAvisoProximasAulas] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

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
  const [enviandoAgendamento, setEnviandoAgendamento] =
      useState<boolean>(false);
  const [erroModal, setErroModal] = useState<string | null>(null);
  const [comprovante, setComprovante] =
      useState<ComprovanteAgendamento | null>(null);

  useEffect(() => {
    const salvo = window.localStorage.getItem('r4_cliente_tema');
    if (salvo === 'claro' || salvo === 'escuro') {
      setTema(salvo);
    }
  }, []);

  useEffect(() => {
    if (cooldownOtpSegundos <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldownOtpSegundos((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownOtpSegundos]);

  function alternarTema() {
    setTema((prev) => {
      const proximo = prev === 'escuro' ? 'claro' : 'escuro';
      window.localStorage.setItem('r4_cliente_tema', proximo);
      return proximo;
    });
  }

  async function atualizarDisponibilidade(
      unId: number,
      dt: string,
      mat: string,
      serie?: string
  ) {
    setCarregandoHorarios(true);
    setErroGeral(null);

    try {
      const params = new URLSearchParams();
      if (unId) params.set('unidadeId', String(unId));
      if (dt) params.set('data', dt);
      if (mat && mat !== 'todas') params.set('materia', mat);
      if (serie && serie.trim()) params.set('serie', serie.trim());

      const res = await fetch(`/api/disponibilidade?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = await res.json();

      if (!res.ok) {
        setErroGeral(json.error || 'Falha ao carregar horários.');
        return;
      }

      setSistemaAberto(json.sistemaAberto !== false);
      setMotivoFechado(json.motivoFechado || null);
      setUnidades(json.unidades || []);
      setDatas(json.datas || []);
      setMaterias(json.materias || []);
      setProfessores(json.professores || []);
      if (json.dataSelecionada) {
        setDataSelecionada(json.dataSelecionada);
      }
    } catch {
      setErroGeral('Erro de conexão ao consultar horários disponíveis.');
    } finally {
      setCarregandoHorarios(false);
    }
  }

  async function carregarDadosFamiliaAutenticada(
      telNorm: string,
      unAtual?: number,
      dtAtual?: string
  ): Promise<AlunoCadastrado[]> {
    const respostaFichas = await fetch('/api/cliente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'listarFichas' }),
    });
    if (!respostaFichas.ok) throw new Error('Não foi possível consultar os vínculos dos alunos.');
    const { fichas } = await respostaFichas.json();
    setFichasPendentes(fichas || []);
    setFichasSelecionadas([]);

    const resCliente = await fetch(
        `/api/cliente?telefone=${encodeURIComponent(telNorm)}`,
        { cache: 'no-store' }
    );
    const jsonCliente = await resCliente.json();

    if (!resCliente.ok) {
      throw new Error(jsonCliente.error || 'Erro ao carregar dados da conta.');
    }

    const listaColegios: ColegioOficial[] = jsonCliente.colegios || [];
    setColegiosOficiais(listaColegios);
    if (!colegioOpcao) {
      setColegioOpcao(
          listaColegios.length > 0 ? String(listaColegios[0].id) : 'outros'
      );
    }

    const nomeResp = String(
        jsonCliente.responsavelNome || responsavelInput || 'Responsável'
    ).trim();

    setTelefoneConfirmado(jsonCliente.telefone || telNorm);
    setTelefoneInput(formatarTelefone(jsonCliente.telefone || telNorm));
    setResponsavelConfirmado(nomeResp);
    setResponsavelInput(nomeResp);
    setProximasAulas(jsonCliente.proximasAulas || []);

    const listaAlunos: AlunoCadastrado[] = jsonCliente.alunos || [];
    setAlunos(listaAlunos);
    if (listaAlunos.length > 0) {
      setAlunoSelecionadoId(listaAlunos[0].id);
      setExibirFormNovoAluno(false);
      setMateriaFiltro('todas');
      await atualizarDisponibilidade(
          unAtual ?? unidadeId,
          dtAtual ?? dataSelecionada,
          'todas',
          listaAlunos[0].serie
      );
    } else {
      setExibirFormNovoAluno(!fichas?.length);
    }

    return listaAlunos;
  }

  async function vincularFichasSelecionadas() {
    setSalvandoVinculo(true);
    setErroVinculo('');
    try {
      const resposta = await fetch('/api/cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'vincularFichas', ids: fichasSelecionadas }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error || 'Não foi possível vincular os alunos.');
      await carregarDadosFamiliaAutenticada(telefoneConfirmado);
      setAvisoVinculo(dados.fichas.length
        ? 'Alunos vinculados: ' + dados.fichas.map((ficha: { nome_aluno: string }) => ficha.nome_aluno).join(', ') + '.'
        : 'As fichas selecionadas não estão mais disponíveis para vínculo.');
    } catch (erro) {
      setErroVinculo(erro instanceof Error ? erro.message : 'Não foi possível vincular os alunos.');
    } finally {
      setSalvandoVinculo(false);
    }
  }

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
      const telInicial = normalizarTelefone(telUrl);

      if (telInicial) {
        setTelefoneInput(formatarTelefone(telInicial));
      }

      try {
        const [resSessao, resDisp, resColegios, resTextos] = await Promise.all([
          fetch('/api/cliente/sessao', { cache: 'no-store' }),
          fetch('/api/disponibilidade', { cache: 'no-store' }),
          fetch('/api/cliente', { cache: 'no-store' }),
          fetch('/api/admin/textos-portal', { cache: 'no-store' }),
        ]);

        const jsonSessao = await resSessao.json();
        const jsonDisp = await resDisp.json();
        const jsonColegios = await resColegios.json();
        const jsonTextos = resTextos.ok ? await resTextos.json() : null;
        if (cancelado) return;

        if (jsonTextos?.textos) {
          setTextos(jsonTextos.textos);
        }

        if (resColegios.ok && Array.isArray(jsonColegios.colegios)) {
          const listaCol: ColegioOficial[] = jsonColegios.colegios;
          setColegiosOficiais(listaCol);
          setColegioOpcao(
              listaCol.length > 0 ? String(listaCol[0].id) : 'outros'
          );
        }

        const unIni = jsonDisp.unidadeIdSelecionada || 0;
        const dtIni = jsonDisp.dataSelecionada || '';

        if (resDisp.ok) {
          setSistemaAberto(jsonDisp.sistemaAberto !== false);
          setMotivoFechado(jsonDisp.motivoFechado || null);
          setUnidades(jsonDisp.unidades || []);
          setDatas(jsonDisp.datas || []);
          setMaterias(jsonDisp.materias || []);
          setProfessores(jsonDisp.professores || []);

          if (unIni) setUnidadeId(unIni);
          if (dtIni) setDataSelecionada(dtIni);
        } else {
          setErroGeral(jsonDisp.error || 'Falha ao carregar horários.');
        }

        if (resSessao.ok && jsonSessao.autenticado && jsonSessao.telefone) {
          if (jsonSessao.limiteSimultaneo) {
            setLimiteSimultaneo(Number(jsonSessao.limiteSimultaneo));
          }
          await carregarDadosFamiliaAutenticada(
              jsonSessao.telefone,
              unIni,
              dtIni
          );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function atualizarProximasAulas(tel: string) {
    if (!tel) return;
    try {
      const res = await fetch(
          `/api/cliente?telefone=${encodeURIComponent(tel)}`,
          { cache: 'no-store' }
      );
      if (res.ok) {
        const json = await res.json();
        setProximasAulas(json.proximasAulas || []);
      }
    } catch {
      // Ignora falha silenciosa
    }
  }

  async function handleVerificarTelefone(e: React.FormEvent) {
    e.preventDefault();
    const tel = normalizarTelefone(telefoneInput);

    if (tel.length < 10 || tel.length > 11) {
      setErroCliente('Digite um número de WhatsApp válido com DDD.');
      return;
    }

    setBuscandoCliente(true);
    setErroCliente(null);

    try {
      const res = await fetch('/api/cliente/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'verificar_telefone',
          telefone: tel,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setErroCliente(json.error || 'Não foi possível verificar o número.');
        return;
      }

      setTelefonePendente(tel);
      setTelefoneInput(formatarTelefone(tel));
      setPinInput('');
      setConfirmarPinInput('');
      setCodigoOtpInput('');
      setAvisoOtp(null);
      setExigeVerificacaoCadastro(Boolean(json.exigeVerificacaoCadastro));

      if (json.status === 'exige_pin') {
        setEtapaLogin('exige_pin');
      } else if (json.status === 'criar_pin') {
        setEtapaLogin('criar_pin');
      } else {
        setEtapaLogin('novo_cadastro');
      }
    } catch {
      setErroCliente('Falha de conexão ao verificar seu WhatsApp.');
    } finally {
      setBuscandoCliente(false);
    }
  }

  async function handleSolicitarRecuperacaoPin() {
    if (!telefonePendente) return;
    setEnviandoCodigoOtp(true);
    setErroCliente(null);
    setAvisoOtp(null);

    try {
      const res = await fetch('/api/cliente/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'solicitar_recuperacao_pin',
          telefone: telefonePendente,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.aguardarSegundos) {
          setCooldownOtpSegundos(Number(json.aguardarSegundos));
          setEtapaLogin('recuperar_pin');
        }
        setErroCliente(
          json.error || 'Não foi possível enviar o código no WhatsApp.'
        );
        return;
      }

      setCodigoOtpInput('');
      setPinInput('');
      setConfirmarPinInput('');
      setCooldownOtpSegundos(Number(json.cooldownSegundos || 60));
      setAvisoOtp(
        `Código de 4 dígitos enviado para ${formatarTelefone(telefonePendente)}. Válido por ${json.expiraMinutos || 10} minutos.`
      );
      setEtapaLogin('recuperar_pin');
    } catch {
      setErroCliente('Erro de conexão ao solicitar código de recuperação.');
    } finally {
      setEnviandoCodigoOtp(false);
    }
  }

  async function handleConfirmarRecuperacaoPin(e: React.FormEvent) {
    e.preventDefault();
    if (codigoOtpInput.length !== 4) {
      setErroCliente('Digite o código de 4 dígitos enviado no seu WhatsApp.');
      return;
    }
    if (pinInput.length !== 4 || confirmarPinInput.length !== 4) {
      setErroCliente('Defina e confirme um novo PIN de 4 números.');
      return;
    }
    if (pinInput !== confirmarPinInput) {
      setErroCliente('Os dois PINs digitados não conferem.');
      return;
    }

    setBuscandoCliente(true);
    setErroCliente(null);

    try {
      const res = await fetch('/api/cliente/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'redefinir_pin_codigo',
          telefone: telefonePendente,
          codigo: codigoOtpInput,
          pin: pinInput,
          confirmarPin: confirmarPinInput,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setErroCliente(json.error || 'Não foi possível redefinir o PIN.');
        return;
      }

      if (json.limiteSimultaneo) {
        setLimiteSimultaneo(Number(json.limiteSimultaneo));
      }

      await carregarDadosFamiliaAutenticada(telefonePendente);
      setPinInput('');
      setConfirmarPinInput('');
      setCodigoOtpInput('');
      setAvisoOtp(null);
    } catch {
      setErroCliente('Erro de conexão ao redefinir seu PIN.');
    } finally {
      setBuscandoCliente(false);
    }
  }

  async function handleEntrarComPin(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput.length !== 4) {
      setErroCliente('Digite os 4 números do seu PIN.');
      return;
    }

    setBuscandoCliente(true);
    setErroCliente(null);

    try {
      const res = await fetch('/api/cliente/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'entrar_pin',
          telefone: telefonePendente,
          pin: pinInput,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setErroCliente(json.error || 'PIN incorreto.');
        setPinInput('');
        return;
      }

      if (json.limiteSimultaneo) {
        setLimiteSimultaneo(Number(json.limiteSimultaneo));
      }

      await carregarDadosFamiliaAutenticada(telefonePendente);
      setPinInput('');
    } catch {
      setErroCliente('Erro de conexão ao validar seu PIN.');
    } finally {
      setBuscandoCliente(false);
    }
  }

  async function enviarCodigoPrimeiroAcesso() {
    setEnviandoCodigoOtp(true);
    setErroCliente(null);
    setAvisoOtp(null);
    try {
      const res = await fetch('/api/cliente/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'enviar_codigo_primeiro_acesso', telefone: telefonePendente }),
      });
      const dados = await res.json();
      if (!res.ok) {
        setErroCliente(dados.erro || dados.error || 'Não foi possível enviar o código.');
        setCooldownOtpSegundos(Number(dados.aguardarSegundos || 0));
        return;
      }
      setAvisoOtp('Código enviado para o seu WhatsApp.');
      setCooldownOtpSegundos(Number(dados.cooldownSegundos || 60));
    } catch {
      setErroCliente('Falha de conexão ao enviar o código.');
    } finally {
      setEnviandoCodigoOtp(false);
    }
  }

  async function handleCriarPinPrimeiroAcesso(e: React.FormEvent) {
    e.preventDefault();
    if (pinInput.length !== 4 || confirmarPinInput.length !== 4) {
      setErroCliente('O PIN deve ter exatamente 4 números.');
      return;
    }
    if (pinInput !== confirmarPinInput) {
      setErroCliente('Os dois PINs digitados não são iguais.');
      return;
    }

    setBuscandoCliente(true);
    setErroCliente(null);

    try {
      const res = await fetch('/api/cliente/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'criar_pin',
          responsavelNome: responsavelInput.trim(),
          telefone: telefonePendente,
          codigoVerificacao: codigoOtpInput,
          pin: pinInput,
          confirmarPin: confirmarPinInput,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setErroCliente(json.error || 'Não foi possível criar o PIN.');
        return;
      }

      if (json.limiteSimultaneo) {
        setLimiteSimultaneo(Number(json.limiteSimultaneo));
      }

      await carregarDadosFamiliaAutenticada(telefonePendente);
      setPinInput('');
      setConfirmarPinInput('');
    } catch {
      setErroCliente('Erro de conexão ao salvar seu PIN.');
    } finally {
      setBuscandoCliente(false);
    }
  }

  async function concluirCadastroNoServidor(codigoVerificacao?: string) {
    const nomeResp = responsavelInput.trim();
    const nomeAl = novoAlunoNome.trim();

    setBuscandoCliente(true);
    setErroCliente(null);

    try {
      const resConta = await fetch('/api/cliente/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'cadastrar_conta',
          telefone: telefonePendente,
          responsavelNome: nomeResp,
          nomeAluno: nomeAl,
          colegioOpcao,
          colegioOutroNome,
          serie: serieAluno,
          pin: pinInput,
          confirmarPin: confirmarPinInput,
          codigoVerificacao: codigoVerificacao || '',
        }),
      });
      const jsonConta = await resConta.json();

      if (!resConta.ok) {
        if (resConta.status === 409 && jsonConta.status) {
          setPinInput('');
          setConfirmarPinInput('');
          setEtapaLogin(jsonConta.status);
        } else if (jsonConta.exigeCodigoVerificacao) {
          setExigeVerificacaoCadastro(true);
          setEtapaLogin('confirmar_codigo_cadastro');
        }
        setErroCliente(jsonConta.error || 'Não foi possível salvar o cadastro.');
        return;
      }

      if (jsonConta.limiteSimultaneo) {
        setLimiteSimultaneo(Number(jsonConta.limiteSimultaneo));
      }

      setNovoAlunoNome('');
      setColegioOutroNome('');
      setPinInput('');
      setConfirmarPinInput('');
      setCodigoOtpInput('');
      setAvisoOtp(null);

      await carregarDadosFamiliaAutenticada(telefonePendente);
    } catch {
      setErroCliente('Erro de rede ao concluir cadastro.');
    } finally {
      setBuscandoCliente(false);
    }
  }

  async function solicitarCodigoParaCadastro(irParaEtapaCodigo: boolean) {
    setEnviandoCodigoOtp(true);
    setErroCliente(null);
    setAvisoOtp(null);

    try {
      const res = await fetch('/api/cliente/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'enviar_codigo_cadastro',
          telefone: telefonePendente,
          responsavelNome: responsavelInput.trim(),
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (json.aguardarSegundos) {
          setCooldownOtpSegundos(Number(json.aguardarSegundos));
          if (irParaEtapaCodigo) {
            setEtapaLogin('confirmar_codigo_cadastro');
          }
        }
        setErroCliente(
          json.error || 'Não foi possível enviar o código no WhatsApp.'
        );
        return;
      }

      if (json.verificacaoDispensada) {
        await concluirCadastroNoServidor();
        return;
      }

      setCodigoOtpInput('');
      setCooldownOtpSegundos(Number(json.cooldownSegundos || 60));
      setAvisoOtp(
        `Código de 4 dígitos enviado para ${formatarTelefone(telefonePendente)}. Válido por ${json.expiraMinutos || 10} minutos.`
      );
      if (irParaEtapaCodigo) {
        setEtapaLogin('confirmar_codigo_cadastro');
      }
    } catch {
      setErroCliente('Falha de conexão ao enviar o código de verificação.');
    } finally {
      setEnviandoCodigoOtp(false);
    }
  }

  async function handleFinalizarNovoCadastro(e: React.FormEvent) {
    e.preventDefault();
    const nomeResp = responsavelInput.trim();
    const nomeAl = novoAlunoNome.trim();

    if (nomeResp.length < 2) {
      setErroCliente('Informe o nome completo do responsável.');
      return;
    }
    if (nomeAl.length < 2) {
      setErroCliente('Informe o nome completo do aluno(a).');
      return;
    }
    if (colegioOpcao === 'outros' && colegioOutroNome.trim().length < 2) {
      setErroCliente('Informe o nome do colégio do aluno.');
      return;
    }
    if (pinInput.length !== 4 || confirmarPinInput.length !== 4) {
      setErroCliente('Defina e confirme um PIN de 4 números.');
      return;
    }
    if (pinInput !== confirmarPinInput) {
      setErroCliente('Os dois PINs digitados não conferem.');
      return;
    }

    if (exigeVerificacaoCadastro) {
      await solicitarCodigoParaCadastro(true);
      return;
    }

    await concluirCadastroNoServidor();
  }

  async function handleConfirmarCodigoCadastro(e: React.FormEvent) {
    e.preventDefault();
    if (codigoOtpInput.length !== 4) {
      setErroCliente('Digite o código de 4 dígitos enviado no seu WhatsApp.');
      return;
    }
    await concluirCadastroNoServidor(codigoOtpInput);
  }

  async function handleSairConta() {
    await fetch('/api/cliente/sessao', { method: 'DELETE' });
    setTelefoneConfirmado('');
    setResponsavelConfirmado('');
    setResponsavelInput('');
    setTelefonePendente('');
    setEtapaLogin('telefone');
    setPinInput('');
    setConfirmarPinInput('');
    setRemarcarId(null);
    setAvisoVinculo(null);
    setFichasPendentes([]);
    setFichasSelecionadas([]);
    setErroVinculo('');
    setAlunos([]);
    setProximasAulas([]);
    setAlunoSelecionadoId(0);
    setAlunoEditandoId(null);
    setExibirFormNovoAluno(false);
    setSelecaoSlot(null);
    setAvisoProximasAulas(null);
  }

  function iniciarEdicaoAluno(al: AlunoCadastrado) {
    setAlunoEditandoId(al.id);
    setNovoAlunoNome(al.nome_aluno);
    setSerieAluno(al.serie || SERIES_ESCOLARES[0]);
    const oficial = colegiosOficiais.find(
        (c) =>
            c.id === al.colegio_id ||
            c.nome.toLowerCase() === al.colegio_nome.toLowerCase()
    );
    if (oficial) {
      setColegioOpcao(String(oficial.id));
      setColegioOutroNome('');
    } else {
      setColegioOpcao('outros');
      setColegioOutroNome(al.colegio_nome);
    }
    setErroFormAluno(null);
    setExibirFormNovoAluno(true);
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
          acao: alunoEditandoId ? 'editarAluno' : 'cadastrarAluno',
          alunoId: alunoEditandoId,
          telefone: telefoneConfirmado,
          responsavelNome: responsavelConfirmado,
          nomeAluno: novoAlunoNome,
          colegioOpcao,
          colegioOutroNome,
          serie: serieAluno,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setErroFormAluno(json.error || 'Erro ao salvar aluno.');
        return;
      }

      const listaAtualizada: AlunoCadastrado[] = json.alunos || [];
      setAlunos(listaAtualizada);
      const idAtivo =
          json.alunoCriado?.id || alunoEditandoId || alunoSelecionadoId;
      if (idAtivo) {
        setAlunoSelecionadoId(idAtivo);
      }
      const alunoAtualizado = listaAtualizada.find((a) => a.id === idAtivo);
      if (alunoAtualizado) {
        setMateriaFiltro('todas');
        await atualizarDisponibilidade(
            unidadeId,
            dataSelecionada,
            'todas',
            alunoAtualizado.serie
        );
      }
      setNovoAlunoNome('');
      setColegioOutroNome('');
      setAlunoEditandoId(null);
      setExibirFormNovoAluno(false);
    } catch {
      setErroFormAluno('Erro de rede ao salvar aluno.');
    } finally {
      setSalvandoAluno(false);
    }
  }

  const alunoAtivo = alunos.find((a) => a.id === alunoSelecionadoId) || null;

  async function handleCancelarProximaAula(agendamentoId: number) {
    setCancelandoAulaId(agendamentoId);
    setAvisoProximasAulas(null);

    try {
      const res = await fetch('/api/cliente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'cancelarAgendamento',
          agendamentoId,
          telefone: telefoneConfirmado,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setAvisoProximasAulas({
          tipo: 'erro',
          texto: json.error || 'Não foi possível cancelar a aula.',
        });
        return;
      }

      setProximasAulas(json.proximasAulas || []);
      setConfirmandoCancelamentoId(null);
      setAvisoProximasAulas({
        tipo: 'sucesso',
        texto:
            'Aula cancelada dentro do prazo gratuito! O horário já voltou a ficar disponível na agenda.',
      });

      if (sistemaAberto && dataSelecionada) {
        await atualizarDisponibilidade(
            unidadeId,
            dataSelecionada,
            materiaFiltro,
            alunoAtivo?.serie
        );
      }
    } catch {
      setAvisoProximasAulas({
        tipo: 'erro',
        texto: 'Erro de conexão ao cancelar o agendamento.',
      });
    } finally {
      setCancelandoAulaId(null);
    }
  }

  function iniciarRemarcacao(aula: ProximaAula) {
    const aluno = alunos.find((item) => item.id === aula.aluno_id);
    if (!aluno) return;
    handleSelecionarAluno(aluno);
    setRemarcarId(aula.id);
    document.getElementById('grade-portal')?.scrollIntoView({ block: 'start' });
  }

  function handleSelecionarAluno(al: AlunoCadastrado) {
    setRemarcarId(null);
    setAlunoSelecionadoId(al.id);
    setExibirFormNovoAluno(false);
    setAlunoEditandoId(null);
    setSelecaoSlot(null);
    setMateriaFiltro('todas');
    void atualizarDisponibilidade(
        unidadeId,
        dataSelecionada,
        'todas',
        al.serie
    );
  }

  function handleTrocarUnidade(novoId: number) {
    setUnidadeId(novoId);
    setMateriaFiltro('todas');
    setSelecaoSlot(null);
    void atualizarDisponibilidade(
        novoId,
        dataSelecionada,
        'todas',
        alunoAtivo?.serie
    );
  }

  function handleTrocarData(novaData: string) {
    setDataSelecionada(novaData);
    setSelecaoSlot(null);
    void atualizarDisponibilidade(
        unidadeId,
        novaData,
        materiaFiltro,
        alunoAtivo?.serie
    );
  }

  function handleTrocarMateria(novaMateria: string) {
    setMateriaFiltro(novaMateria);
    setSelecaoSlot(null);
    void atualizarDisponibilidade(
        unidadeId,
        dataSelecionada,
        novaMateria,
        alunoAtivo?.serie
    );
  }

  const [modalidade, setModalidade] = useState<'presencial' | 'online'>('presencial');
  const [whatsappAluno, setWhatsappAluno] = useState('');
  const onlineDireto = unidades.find((u) => u.id === unidadeId)?.nome.trim().toLowerCase() === 'online';
  const aulaOnline = onlineDireto || modalidade === 'online';

  function abrirModalAgendamento(prof: ProfessorDisponivel, slot: SlotAula) {
    setModalidade('presencial');
    setWhatsappAluno('');
    setSelecaoSlot({ professor: prof, slot });
    const matInicial =
        materiaFiltro !== 'todas'
            ? materiaFiltro
            : prof.materias[0] || 'Reforço Escolar';
    setMateriaAula(matInicial);
    setErroModal(null);
  }

  async function handleConfirmarAgendamento(e: React.FormEvent) {
    e.preventDefault();
    if (!selecaoSlot || !alunoAtivo) return;

    setEnviandoAgendamento(true);
    setErroModal(null);

    try {
      const res = await fetch('/api/agendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unidadeId,
          modalidade: aulaOnline ? 'online' : 'presencial',
          whatsappAluno: aulaOnline ? whatsappAluno : undefined,
          remarcarId,
          professorId: selecaoSlot.professor.id,
          alunoId: alunoAtivo.id,
          materia: materiaAula,
          data: dataSelecionada,
          horaInicio: selecaoSlot.slot.inicio,
          alunoNome: alunoAtivo.nome_aluno,
          alunoTelefone: telefoneConfirmado,
          responsavelNome: responsavelConfirmado,
          colegioNome: alunoAtivo.colegio_nome,
          serie: alunoAtivo.serie,
          observacoes,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          await handleSairConta();
        }
        setErroModal(json.error || 'Não foi possível concluir o agendamento.');
        return;
      }

      setRemarcarId(null);
      setComprovante({ ...json.agendamento, respostaWhatsAppEnviada: json.respostaWhatsAppEnviada });
      setSelecaoSlot(null);
      setObservacoes('');
      await Promise.all([
        atualizarDisponibilidade(
            unidadeId,
            dataSelecionada,
            materiaFiltro,
            alunoAtivo.serie
        ),
        atualizarProximasAulas(telefoneConfirmado),
      ]);
    } catch {
      setErroModal('Falha de rede ao enviar agendamento.');
    } finally {
      setEnviandoAgendamento(false);
    }
  }

  const escuro = tema === 'escuro';

  const clsBg = escuro
      ? 'bg-[#0f172a] text-stone-100'
      : 'bg-[#f8fafc] text-stone-900';
  const clsCard = 'r4-painel shadow-xs';
  const clsSubCard = escuro
      ? 'bg-[#1e293b] border-[#334155]'
      : 'bg-stone-50 border-stone-200/80';
  const clsInput = escuro
      ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-400 focus:border-[#0284c7]'
      : 'bg-white border-stone-300 text-stone-900 placeholder:text-stone-400 focus:border-[#0284c7]';
  const clsTitulo = 'r4-texto';
  const clsSubtexto = escuro ? 'text-slate-300' : 'text-slate-600';

  const unidadeAtual = unidades.find((u) => u.id === unidadeId);
  const professoresExibidos = professores.filter(
      (p) =>
          !buscaProfessor.trim() ||
          p.nome.toLowerCase().includes(buscaProfessor.trim().toLowerCase())
  );

  const aulasAtivasAlunoSelecionado = alunoAtivo
      ? proximasAulas.filter(
          (a) =>
              a.aluno_nome.trim().toLowerCase() ===
              alunoAtivo.nome_aluno.trim().toLowerCase()
      ).length
      : 0;

  const regrasPortal = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl bg-[#0284c7]/15 border border-[#0284c7]/35 px-4 py-3 text-xs space-y-1" data-aviso-portal="horario">
                <p className="font-bold uppercase tracking-wide text-[11px]">
                  {textos.aviso_proxima_semana_titulo}
                </p>
                <p>{textos.aviso_proxima_semana_texto}</p>
              </div>

              <div className="rounded-xl bg-[#BE1E23]/15 border border-[#BE1E23]/45 px-4 py-3 text-xs space-y-1" data-aviso-portal="cancelamento">
                <p className="font-bold uppercase tracking-wide text-[11px] flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {textos.aviso_cancelamento_titulo}
                </p>
                <p>{textos.aviso_cancelamento_texto}</p>
              </div>
            </div>
  );

  return (
      <main data-tema={tema} className={`r4-portal min-h-screen transition-colors ${clsBg}`} style={variaveisCoresR4(paleta[escuro ? 'escuro' : 'claro'])}>
        <div
            className={`border-b backdrop-blur-md sticky top-0 z-30 ${
                escuro
                    ? 'bg-[#0f172a]/90 border-[#334155]'
                    : 'bg-white/90 border-stone-200'
            }`}
        >
          <div className="max-w-5xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
            <LogoR4 portal temaEscuro={escuro} subtitulo={textoR4("Portal de Agendamento")} />

            <div className="flex items-center gap-2.5">
            <span
                className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${clsSubCard} ${clsSubtexto}`}
            >
              <Clock className="w-3.5 h-3.5 text-[#0284c7]" />
              {textos.horario_secretaria}
            </span>

              <button
                  type="button"
                  onClick={alternarTema}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                      escuro
                          ? 'bg-slate-800 border-slate-700 text-slate-100 hover:border-stone-600'
                          : 'bg-[#0f172a] border-[#0f172a] text-white hover:bg-stone-800'
                  }`}
              >
                {escuro ? (
                    <>
                      <Sun className="w-3.5 h-3.5" />
                      <span>{textoR4("Tema Claro")}</span>
                    </>
                ) : (
                    <>
                      <Moon className="w-3.5 h-3.5" />
                      <span>{textoR4("Tema Escuro")}</span>
                    </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-4 sm:space-y-5">
          {/* BANNER INSTITUCIONAL COM TEXTOS EDITÁVEIS PELO PAINEL ADMIN */}
          {telefoneConfirmado ? (
              <details className={`group rounded-xl border px-4 py-2 ${clsCard}`}>
                <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
                  {textoR4("Ver regras de horário e cancelamento")}
                  <span aria-hidden="true" className="text-lg transition-transform group-open:rotate-45">+</span>
                </summary>
                <div className="pb-2">{regrasPortal}</div>
              </details>
          ) : (
          <header className={`border rounded-2xl p-6 space-y-3.5 max-w-lg mx-auto ${clsCard}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0284c7] bg-[#0284c7]/15 border border-[#0284c7]/35 px-3 py-1 rounded-full">
              {textos.badge_topo}
            </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 font-semibold">
              <ShieldCheck className="w-4 h-4" />{' ' + textoR4("Acesso protegido por PIN")}</span>
            </div>

            <h1 className={`text-xl sm:text-2xl font-bold ${clsTitulo}`}>
              {textos.titulo_principal}
            </h1>
            <p className={`text-sm ${clsSubtexto}`}>
              {textos.subtitulo_principal}
            </p>

            {regrasPortal}
          </header>)}

          {comprovante && (
              <section className="bg-emerald-500/10 border border-emerald-500/40 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-emerald-400 inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />{' ' + textoR4("Aula agendada na R4 Ensina com sucesso!")}</p>
                  <p className={`text-xs ${clsTitulo}`}>
                    <strong>{textoR4("Aluno(a):")}</strong> {comprovante.alunoNome}
                    {comprovante.colegioNome ? ` • ${comprovante.colegioNome}` : ''}
                    {comprovante.serie ? ` (${comprovante.serie})` : ''}
                  </p>
                  <p className={`text-xs ${clsSubtexto}`}>
                    <strong>{textoR4("Unidade:")}</strong> {comprovante.unidade} •{' '}
                    <strong>{textoR4("Matéria:")}</strong> {comprovante.materia} •{' '}
                    <strong>{textoR4("Professor(a):")}</strong> {comprovante.professor} •{' '}
                    <strong>{textoR4("Data:")}</strong> {comprovante.data}{' ' + textoR4("às")}{' '}
                    {comprovante.horario}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {comprovante.respostaWhatsAppEnviada === false && <p className="text-sm">
                    Aula agendada. O envio do link de confirmação pelo WhatsApp ficou indisponível. Fale com a secretaria.
                  </p>}
                  {comprovante.linkWaMe && (
                      <a
                          href={comprovante.linkWaMe}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white inline-flex items-center gap-1.5 transition"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />{' ' + textoR4("Enviar Comprovante no WhatsApp R4")}</a>
                  )}
                  <button
                      type="button"
                      onClick={() => setComprovante(null)}
                      className={`px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer ${clsCard} ${clsTitulo}`}
                  >{textoR4("Fechar aviso")}</button>
                </div>
              </section>
          )}

          {telefoneConfirmado && avisoVinculo && <p role="status" className={`rounded-xl border p-3 text-sm ${clsCard}`}>{avisoVinculo}</p>}
          {!telefoneConfirmado ? (
              <section
                  className={`border rounded-2xl p-6 sm:p-8 max-w-lg mx-auto space-y-5 ${clsCard}`}
              >
                {etapaLogin === 'telefone' && (
                    <>
                      <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0284c7]">
                    <Lock className="w-3.5 h-3.5" />{' ' + textoR4("Acesso Exclusivo R4 Ensina")}</span>
                        <h2 className={`text-xl font-bold ${clsTitulo}`}>{textoR4("Informe seu WhatsApp")}</h2>
                        <p className={`text-sm ${clsSubtexto}`}>{textoR4("Digite o número cadastrado com DDD. Sua sessão ficará lembrada neste dispositivo por 30 dias.")}</p>
                      </div>

                      <form onSubmit={handleVerificarTelefone} className="space-y-4">
                        <div>
                          <label
                              className={`block text-xs font-medium mb-1.5 ${clsSubtexto}`}
                          >{textoR4("Número do WhatsApp com DDD *")}</label>
                          <input
                              type="tel"
                              required
                              value={telefoneInput}
                              onChange={(e) =>
                                  setTelefoneInput(formatarTelefone(e.target.value))
                              }
                              placeholder="(71) 99999-9999"
                              className={`w-full rounded-xl border px-4 py-3 text-base focus:outline-none ${clsInput}`}
                          />
                        </div>

                        {erroCliente && (
                            <div className="rounded-xl border border-[#BE1E23]/40 bg-[#BE1E23]/15 px-3.5 py-2.5 text-xs text-rose-400">
                              {erroCliente}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={buscandoCliente}
                            className="w-full py-3 rounded-xl r4-acao disabled:opacity-50 text-sm font-semibold  transition cursor-pointer"
                        >
                          {buscandoCliente ? textoR4("Verificando...") : textoR4("Continuar")}
                        </button>
                      </form>
                    </>
                )}

                {etapaLogin === 'exige_pin' && (
                    <>
                      <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0284c7]">
                    <KeyRound className="w-3.5 h-3.5" />{' ' + textoR4("Verificação de Segurança")}</span>
                        <h2 className={`text-xl font-bold ${clsTitulo}`}>{textoR4("Digite seu PIN de 4 dígitos")}</h2>
                        <p className={`text-sm ${clsSubtexto}`}>{textoR4("Número:")}{' '}
                          <strong className={clsTitulo}>
                            {formatarTelefone(telefonePendente)}
                          </strong>
                        </p>
                      </div>

                      <form onSubmit={handleEntrarComPin} className="space-y-4">
                        <div>
                          <label
                              className={`block text-xs font-medium mb-1.5 ${clsSubtexto}`}
                          >{textoR4("PIN de Acesso (4 números) *")}</label>
                          <input
                              type="password"
                              inputMode="numeric"
                              pattern="\d{4}"
                              maxLength={4}
                              required
                              autoFocus
                              value={pinInput}
                              onChange={(e) =>
                                  setPinInput(
                                      e.target.value.replace(/\D/g, '').slice(0, 4)
                                  )
                              }
                              placeholder="••••"
                              className={`w-full rounded-xl border px-4 py-3.5 text-center text-2xl font-bold tracking-[0.6em] focus:outline-none ${clsInput}`}
                          />
                        </div>

                        {erroCliente && (
                            <div className="rounded-xl border border-[#BE1E23]/40 bg-[#BE1E23]/15 px-3.5 py-2.5 text-xs text-rose-400">
                              {erroCliente}
                            </div>
                        )}

                        <div className="flex items-center gap-2.5">
                          <button
                              type="button"
                              onClick={() => {
                                setEtapaLogin('telefone');
                                setErroCliente(null);
                                setPinInput('');
                              }}
                              className={`px-4 py-3 rounded-xl border text-xs font-semibold cursor-pointer ${clsSubCard} ${clsSubtexto}`}
                          >{textoR4("Voltar")}</button>
                          <button
                              type="submit"
                              disabled={buscandoCliente || pinInput.length < 4}
                              className="flex-1 py-3 rounded-xl r4-acao disabled:opacity-50 text-sm font-semibold  transition cursor-pointer"
                          >
                            {buscandoCliente ? textoR4("Validando...") : textoR4("Entrar na Agenda")}
                          </button>
                        </div>

                        <div className="pt-1 text-center">
                          <button
                              type="button"
                              disabled={enviandoCodigoOtp || buscandoCliente}
                              onClick={() => void handleSolicitarRecuperacaoPin()}
                              className="text-xs font-semibold text-[#0284c7] hover:underline disabled:opacity-50 cursor-pointer"
                          >
                            {enviandoCodigoOtp
                                ? textoR4("Enviando código no WhatsApp...")
                                : textoR4("Esqueci meu PIN (enviar código no WhatsApp)")}
                          </button>
                        </div>
                      </form>
                    </>
                )}

                {etapaLogin === 'recuperar_pin' && (
                    <>
                      <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0284c7]">
                    <KeyRound className="w-3.5 h-3.5" />{' ' + textoR4("Recuperação via WhatsApp")}</span>
                        <h2 className={`text-xl font-bold ${clsTitulo}`}>{textoR4("Redefinir seu PIN")}</h2>
                        <p className={`text-xs ${clsSubtexto}`}>{textoR4("WhatsApp:")}{' '}
                          <strong className={clsTitulo}>
                            {formatarTelefone(telefonePendente)}
                          </strong>
                        </p>
                      </div>

                      {avisoOtp && (
                          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300">
                            {avisoOtp}
                          </div>
                      )}

                      <form
                          onSubmit={handleConfirmarRecuperacaoPin}
                          className="space-y-4"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label
                                className={`text-xs font-medium ${clsSubtexto}`}
                            >{textoR4("Código de 4 dígitos (WhatsApp) *")}</label>
                            <button
                                type="button"
                                disabled={
                                    enviandoCodigoOtp || cooldownOtpSegundos > 0
                                }
                                onClick={() => void handleSolicitarRecuperacaoPin()}
                                className="text-[11px] font-semibold text-[#0284c7] hover:underline disabled:opacity-50 cursor-pointer"
                            >
                              {enviandoCodigoOtp
                                  ? textoR4("Reenviando...")
                                  : cooldownOtpSegundos > 0
                                      ? `Reenviar em ${cooldownOtpSegundos}s`
                                      : textoR4("Reenviar código")}
                            </button>
                          </div>
                          <input
                              type="text"
                              inputMode="numeric"
                              pattern="\d{4}"
                              maxLength={4}
                              required
                              autoFocus
                              value={codigoOtpInput}
                              onChange={(e) =>
                                  setCodigoOtpInput(
                                      e.target.value.replace(/\D/g, '').slice(0, 4)
                                  )
                              }
                              placeholder="0000"
                              className={`w-full rounded-xl border px-4 py-3 text-center text-2xl font-bold tracking-[0.6em] focus:outline-none ${clsInput}`}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label
                                className={`block text-xs font-medium mb-1.5 ${clsSubtexto}`}
                            >{textoR4("Novo PIN (4 dígitos) *")}</label>
                            <input
                                type="password"
                                inputMode="numeric"
                                pattern="\d{4}"
                                maxLength={4}
                                required
                                value={pinInput}
                                onChange={(e) =>
                                    setPinInput(
                                        e.target.value.replace(/\D/g, '').slice(0, 4)
                                    )
                                }
                                placeholder="••••"
                                className={`w-full rounded-xl border px-3 py-3 text-center text-xl font-bold tracking-[0.5em] focus:outline-none ${clsInput}`}
                            />
                          </div>

                          <div>
                            <label
                                className={`block text-xs font-medium mb-1.5 ${clsSubtexto}`}
                            >{textoR4("Confirmar PIN *")}</label>
                            <input
                                type="password"
                                inputMode="numeric"
                                pattern="\d{4}"
                                maxLength={4}
                                required
                                value={confirmarPinInput}
                                onChange={(e) =>
                                    setConfirmarPinInput(
                                        e.target.value.replace(/\D/g, '').slice(0, 4)
                                    )
                                }
                                placeholder="••••"
                                className={`w-full rounded-xl border px-3 py-3 text-center text-xl font-bold tracking-[0.5em] focus:outline-none ${clsInput}`}
                            />
                          </div>
                        </div>

                        {erroCliente && (
                            <div className="rounded-xl border border-[#BE1E23]/40 bg-[#BE1E23]/15 px-3.5 py-2.5 text-xs text-rose-400">
                              {erroCliente}
                            </div>
                        )}

                        <div className="flex items-center gap-2.5">
                          <button
                              type="button"
                              onClick={() => {
                                setEtapaLogin('exige_pin');
                                setErroCliente(null);
                                setAvisoOtp(null);
                                setPinInput('');
                                setConfirmarPinInput('');
                                setCodigoOtpInput('');
                              }}
                              className={`px-4 py-3 rounded-xl border text-xs font-semibold cursor-pointer ${clsSubCard} ${clsSubtexto}`}
                          >{textoR4("Voltar")}</button>
                          <button
                              type="submit"
                              disabled={
                                  buscandoCliente ||
                                  codigoOtpInput.length < 4 ||
                                  pinInput.length < 4
                              }
                              className="flex-1 py-3 rounded-xl r4-acao disabled:opacity-50 text-sm font-semibold  transition cursor-pointer"
                          >
                            {buscandoCliente
                                ? textoR4("Salvando...")
                                : textoR4("Redefinir PIN e Entrar")}
                          </button>
                        </div>
                      </form>
                    </>
                )}

                {etapaLogin === 'criar_pin' && (
                    <>
                      <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-500">
                    <ShieldCheck className="w-3.5 h-3.5" />{' ' + textoR4("Primeiro Acesso Protegido")}</span>
                        <h2 className={`text-xl font-bold ${clsTitulo}`}>{textoR4("Crie seu PIN de 4 dígitos")}</h2>
                        <p className={`text-sm ${clsSubtexto}`}>{textoR4("Para proteger os agendamentos de")}{' '}
                          <strong className={clsTitulo}>
                            {formatarTelefone(telefonePendente)}
                          </strong>{textoR4(", escolha uma senha numérica de 4 dígitos que você lembre facilmente.")}</p>
                      </div>

                      <form
                          onSubmit={handleCriarPinPrimeiroAcesso}
                          className="space-y-4"
                      >
                        <div className="grid gap-2">
                          <label className="grid gap-1 text-sm">Seu nome como responsável
                            <input required minLength={2} maxLength={120} autoComplete="name"
                              value={responsavelInput} onChange={(e) => setResponsavelInput(e.target.value)}
                              className={`rounded-lg border px-3 py-2 ${clsInput}`} />
                          </label>
                          <p className="text-sm">Confirme seu WhatsApp para acessar os alunos cadastrados no R4.</p>
                          <button type="button" className="r4-acao rounded-lg px-3 py-2 text-sm"
                            disabled={enviandoCodigoOtp || cooldownOtpSegundos > 0}
                            onClick={() => void enviarCodigoPrimeiroAcesso()}>
                            {enviandoCodigoOtp ? 'Enviando…' : cooldownOtpSegundos > 0
                              ? `Reenviar em ${cooldownOtpSegundos}s` : 'Enviar código pelo WhatsApp'}
                          </button>
                          {avisoOtp && <p role="status" className="text-sm">{avisoOtp}</p>}
                          <label className="grid gap-1 text-sm">Código recebido
                            <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{4}"
                              maxLength={4} value={codigoOtpInput}
                              onChange={(e) => setCodigoOtpInput(e.target.value.replace(/[^0-9]/g, ''))}
                              className={`rounded-lg border px-3 py-2 ${clsInput}`} />
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label
                                className={`block text-xs font-medium mb-1.5 ${clsSubtexto}`}
                            >{textoR4("Criar PIN (4 dígitos) *")}</label>
                            <input
                                type="password"
                                inputMode="numeric"
                                pattern="\d{4}"
                                maxLength={4}
                                required
                                autoFocus
                                value={pinInput}
                                onChange={(e) =>
                                    setPinInput(
                                        e.target.value.replace(/\D/g, '').slice(0, 4)
                                    )
                                }
                                placeholder="••••"
                                className={`w-full rounded-xl border px-3 py-3 text-center text-xl font-bold tracking-[0.5em] focus:outline-none ${clsInput}`}
                            />
                          </div>

                          <div>
                            <label
                                className={`block text-xs font-medium mb-1.5 ${clsSubtexto}`}
                            >{textoR4("Confirmar PIN *")}</label>
                            <input
                                type="password"
                                inputMode="numeric"
                                pattern="\d{4}"
                                maxLength={4}
                                required
                                value={confirmarPinInput}
                                onChange={(e) =>
                                    setConfirmarPinInput(
                                        e.target.value.replace(/\D/g, '').slice(0, 4)
                                    )
                                }
                                placeholder="••••"
                                className={`w-full rounded-xl border px-3 py-3 text-center text-xl font-bold tracking-[0.5em] focus:outline-none ${clsInput}`}
                            />
                          </div>
                        </div>

                        {erroCliente && (
                            <div className="rounded-xl border border-[#BE1E23]/40 bg-[#BE1E23]/15 px-3.5 py-2.5 text-xs text-rose-400">
                              {erroCliente}
                            </div>
                        )}

                        <div className="flex items-center gap-2.5">
                          <button
                              type="button"
                              onClick={() => {
                                setEtapaLogin('telefone');
                                setErroCliente(null);
                              }}
                              className={`px-4 py-3 rounded-xl border text-xs font-semibold cursor-pointer ${clsSubCard} ${clsSubtexto}`}
                          >{textoR4("Voltar")}</button>
                          <button
                              type="submit"
                              disabled={buscandoCliente}
                              className="flex-1 py-3 rounded-xl r4-acao disabled:opacity-50 text-sm font-semibold  transition cursor-pointer"
                          >
                            {buscandoCliente ? textoR4("Salvando...") : textoR4("Salvar PIN e Entrar")}
                          </button>
                        </div>
                      </form>
                    </>
                )}

                {etapaLogin === 'novo_cadastro' && (
                    <>
                      <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0284c7]">
                    <UserCheck className="w-3.5 h-3.5" />{' ' + textoR4("Primeiro Cadastro R4")}</span>
                        <h2 className={`text-xl font-bold ${clsTitulo}`}>{textoR4("Complete seus dados e crie seu PIN")}</h2>
                        <p className={`text-xs ${clsSubtexto}`}>{textoR4("WhatsApp:")}{' '}
                          <strong className={clsTitulo}>
                            {formatarTelefone(telefonePendente)}
                          </strong>
                        </p>
                      </div>

                      <form
                          onSubmit={handleFinalizarNovoCadastro}
                          className="space-y-3.5"
                      >
                        <div>
                          <label
                              className={`block text-xs font-medium mb-1 ${clsSubtexto}`}
                          >{textoR4("Nome Completo do Responsável *")}</label>
                          <input
                              type="text"
                              required
                              value={responsavelInput}
                              onChange={(e) => setResponsavelInput(e.target.value)}
                              placeholder={textoR4("Ex: Maria Silva")}
                              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                          />
                        </div>

                        <div>
                          <label
                              className={`block text-xs font-medium mb-1 ${clsSubtexto}`}
                          >{textoR4("Nome Completo do Aluno(a) *")}</label>
                          <input
                              type="text"
                              required
                              value={novoAlunoNome}
                              onChange={(e) => setNovoAlunoNome(e.target.value)}
                              placeholder={textoR4("Ex: Lucas Andrade")}
                              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                                className={`block text-xs font-medium mb-1 ${clsSubtexto}`}
                            >{textoR4("Colégio *")}</label>
                            <select
                                required
                                value={colegioOpcao}
                                onChange={(e) => setColegioOpcao(e.target.value)}
                                className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${clsInput}`}
                            >
                              {colegiosOficiais.map((col) => (
                                  <option key={col.id} value={String(col.id)}>
                                    {col.nome}
                                  </option>
                              ))}
                              <option value="outros">{textoR4("Outros (digitar)")}</option>
                            </select>
                          </div>

                          <div>
                            <label
                                className={`block text-xs font-medium mb-1 ${clsSubtexto}`}
                            >{textoR4("Série / Ano *")}</label>
                            <select
                                required
                                value={serieAluno}
                                onChange={(e) => setSerieAluno(e.target.value)}
                                className={`w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${clsInput}`}
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
                              <label className="block text-xs font-medium text-[#D96B43] mb-1">{textoR4("Nome do Colégio *")}</label>
                              <input
                                  type="text"
                                  required
                                  value={colegioOutroNome}
                                  onChange={(e) => setColegioOutroNome(e.target.value)}
                                  placeholder={textoR4("Ex: Colégio Antônio Vieira")}
                                  className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                              />
                            </div>
                        )}

                        <div
                            className={`border rounded-xl p-3.5 space-y-2.5 ${clsSubCard}`}
                        >
                          <p className="text-xs font-semibold text-[#0284c7]">{textoR4("Crie um PIN de 4 números para proteger seus próximos acessos:")}</p>
                          <div className="grid grid-cols-2 gap-3">
                            <input
                                type="password"
                                inputMode="numeric"
                                pattern="\d{4}"
                                maxLength={4}
                                required
                                value={pinInput}
                                onChange={(e) =>
                                    setPinInput(
                                        e.target.value.replace(/\D/g, '').slice(0, 4)
                                    )
                                }
                                placeholder={textoR4("PIN (4 dígitos)")}
                                className={`w-full rounded-xl border px-3 py-2.5 text-center text-base font-bold tracking-widest focus:outline-none ${clsInput}`}
                            />
                            <input
                                type="password"
                                inputMode="numeric"
                                pattern="\d{4}"
                                maxLength={4}
                                required
                                value={confirmarPinInput}
                                onChange={(e) =>
                                    setConfirmarPinInput(
                                        e.target.value.replace(/\D/g, '').slice(0, 4)
                                    )
                                }
                                placeholder={textoR4("Confirmar PIN")}
                                className={`w-full rounded-xl border px-3 py-2.5 text-center text-base font-bold tracking-widest focus:outline-none ${clsInput}`}
                            />
                          </div>
                        </div>

                        {erroCliente && (
                            <div className="rounded-xl border border-[#BE1E23]/40 bg-[#BE1E23]/15 px-3.5 py-2.5 text-xs text-rose-400">
                              {erroCliente}
                            </div>
                        )}

                        <div className="flex items-center gap-2.5">
                          <button
                              type="button"
                              onClick={() => {
                                setEtapaLogin('telefone');
                                setErroCliente(null);
                              }}
                              className={`px-4 py-3 rounded-xl border text-xs font-semibold cursor-pointer ${clsSubCard} ${clsSubtexto}`}
                          >{textoR4("Voltar")}</button>
                          <button
                              type="submit"
                              disabled={buscandoCliente || enviandoCodigoOtp}
                              className="flex-1 py-3 rounded-xl r4-acao disabled:opacity-50 text-sm font-semibold  transition cursor-pointer"
                          >
                            {enviandoCodigoOtp
                                ? textoR4("Enviando código...")
                                : buscandoCliente
                                    ? textoR4("Finalizando...")
                                    : exigeVerificacaoCadastro
                                        ? textoR4("Confirmar WhatsApp com Código")
                                        : textoR4("Concluir Cadastro e Acessar")}
                          </button>
                        </div>
                      </form>
                    </>
                )}

                {etapaLogin === 'confirmar_codigo_cadastro' && (
                    <>
                      <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-500">
                    <ShieldCheck className="w-3.5 h-3.5" />{' ' + textoR4("Confirmação de WhatsApp")}</span>
                        <h2 className={`text-xl font-bold ${clsTitulo}`}>{textoR4("Digite o código de 4 dígitos")}</h2>
                        <p className={`text-xs ${clsSubtexto}`}>{textoR4("Enviamos um código para")}{' '}
                          <strong className={clsTitulo}>
                            {formatarTelefone(telefonePendente)}
                          </strong>{' '}{textoR4("para confirmar que este WhatsApp pertence a você.")}</p>
                      </div>

                      {avisoOtp && (
                          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-300">
                            {avisoOtp}
                          </div>
                      )}

                      <form
                          onSubmit={handleConfirmarCodigoCadastro}
                          className="space-y-4"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label
                                className={`text-xs font-medium ${clsSubtexto}`}
                            >{textoR4("Código de Verificação *")}</label>
                            <button
                                type="button"
                                disabled={
                                    enviandoCodigoOtp || cooldownOtpSegundos > 0
                                }
                                onClick={() =>
                                    void solicitarCodigoParaCadastro(false)
                                }
                                className="text-[11px] font-semibold text-[#0284c7] hover:underline disabled:opacity-50 cursor-pointer"
                            >
                              {enviandoCodigoOtp
                                  ? textoR4("Reenviando...")
                                  : cooldownOtpSegundos > 0
                                      ? `Reenviar em ${cooldownOtpSegundos}s`
                                      : textoR4("Reenviar código")}
                            </button>
                          </div>
                          <input
                              type="text"
                              inputMode="numeric"
                              pattern="\d{4}"
                              maxLength={4}
                              required
                              autoFocus
                              value={codigoOtpInput}
                              onChange={(e) =>
                                  setCodigoOtpInput(
                                      e.target.value.replace(/\D/g, '').slice(0, 4)
                                  )
                              }
                              placeholder="0000"
                              className={`w-full rounded-xl border px-4 py-3.5 text-center text-2xl font-bold tracking-[0.6em] focus:outline-none ${clsInput}`}
                          />
                        </div>

                        {erroCliente && (
                            <div className="rounded-xl border border-[#BE1E23]/40 bg-[#BE1E23]/15 px-3.5 py-2.5 text-xs text-rose-400">
                              {erroCliente}
                            </div>
                        )}

                        <div className="flex items-center gap-2.5">
                          <button
                              type="button"
                              onClick={() => {
                                setEtapaLogin('novo_cadastro');
                                setErroCliente(null);
                                setAvisoOtp(null);
                                setCodigoOtpInput('');
                              }}
                              className={`px-4 py-3 rounded-xl border text-xs font-semibold cursor-pointer ${clsSubCard} ${clsSubtexto}`}
                          >{textoR4("Voltar")}</button>
                          <button
                              type="submit"
                              disabled={
                                  buscandoCliente || codigoOtpInput.length < 4
                              }
                              className="flex-1 py-3 rounded-xl r4-acao disabled:opacity-50 text-sm font-semibold  transition cursor-pointer"
                          >
                            {buscandoCliente
                                ? textoR4("Concluindo...")
                                : textoR4("Validar Código e Entrar")}
                          </button>
                        </div>
                      </form>
                    </>
                )}
              </section>
          ) : (
              <>
                {fichasPendentes.length > 0 && (
                  <section className={`rounded-2xl border p-5 space-y-3 ${clsCard}`}>
                    <h2 className="font-bold">Alunos encontrados neste WhatsApp</h2>
                    <p className="text-sm">Marque as fichas que deseja vincular à sua conta.</p>
                    {fichasPendentes.map((ficha) => (
                      <label key={ficha.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${clsInput}`}>
                        <input type="checkbox" checked={fichasSelecionadas.includes(ficha.id)} disabled={salvandoVinculo}
                          onChange={(e) => {
                            const marcado = e.target.checked;
                            setFichasSelecionadas((ids) => marcado ? [...ids, ficha.id] : ids.filter((id) => id !== ficha.id));
                          }} />
                        <span>
                          <strong className="block text-sm">{ficha.nome_aluno}</strong>
                          <span className="text-xs">{[ficha.colegio_nome?.trim(), ficha.serie?.trim()].filter(Boolean).join(' • ')}</span>
                        </span>
                      </label>
                    ))}
                    {erroVinculo && <p role="alert" className="text-sm text-rose-500">{erroVinculo}</p>}
                    <button type="button" className="r4-acao rounded-xl px-3 py-2 text-sm disabled:opacity-50"
                      disabled={salvandoVinculo || !fichasSelecionadas.length} onClick={() => void vincularFichasSelecionadas()}>
                      {salvandoVinculo ? 'Vinculando…' : 'Vincular selecionados'}
                    </button>
                  </section>
                )}
                {/* BARRA DO RESPONSÁVEL E SELEÇÃO DO ALUNO */}
                <section className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                  <div
                      className={`flex flex-wrap items-center justify-between gap-3 pb-3 border-b ${
                          escuro ? 'border-[#334155]' : 'border-stone-200'
                      }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <UserCheck className="w-5 h-5 text-[#0284c7]" />
                      <div>
                        <p className={`text-sm font-bold ${clsTitulo}`}>{textoR4("Responsável:") + ' '}{responsavelConfirmado}
                        </p>
                        <p className={`text-xs ${clsSubtexto}`}>{textoR4("WhatsApp:") + ' '}{formatarTelefone(telefoneConfirmado)} •{' '}
                          <span className="text-[#0284c7] font-medium">
                        {aulasAtivasAlunoSelecionado}/{limiteSimultaneo}{' ' + textoR4("aulas ativas para o aluno selecionado")}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {(alunos.length > 0 || fichasPendentes.length > 0) && (
                          <button
                              type="button"
                              onClick={() => {
                                setAlunoEditandoId(null);
                                setNovoAlunoNome('');
                                setColegioOutroNome('');
                                setExibirFormNovoAluno((v) => !v);
                                setErroFormAluno(null);
                              }}
                              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition ${
                                  escuro
                                      ? 'bg-[#0284c7]/15 hover:bg-[#0284c7]/25 border-[#0284c7]/40 text-[#38bdf8]'
                                      : 'bg-[#0284c7]/10 hover:bg-[#0284c7]/20 border-[#0284c7]/30 text-[#075985]'
                              }`}
                          >
                            <Plus className="w-3.5 h-3.5" />{' ' + textoR4("Cadastrar Outro Filho(a)")}</button>
                      )}

                      <button
                          type="button"
                          onClick={() => void handleSairConta()}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition ${clsSubCard} ${clsSubtexto} hover:text-rose-400`}
                      >
                        <LogOut className="w-3.5 h-3.5" />{' ' + textoR4("Sair / Trocar Conta")}</button>
                    </div>
                  </div>

                  {alunos.length > 0 && (
                      <div className="space-y-2">
                        <p className={`text-xs font-medium ${clsSubtexto}`}>{textoR4("Selecione o aluno(a) que terá a aula:")}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {alunos.map((al) => {
                            const ativo = al.id === alunoSelecionadoId;
                            return (
                                <div
                                    key={al.id}
                                    onClick={() => handleSelecionarAluno(al)}
                                    className={`text-left rounded-xl p-3.5 border transition cursor-pointer flex items-start justify-between gap-2 ${
                                        ativo
                                            ? escuro
                                                ? 'bg-[#0284c7]/20 border-[#0284c7] text-white'
                                                : 'bg-[#0284c7]/10 border-[#0284c7] text-stone-900'
                                            : `${clsSubCard} hover:border-[#0284c7]/50`
                                    }`}
                                >
                                  <div>
                                    <p className="text-sm font-bold">{al.nome_aluno}</p>
                                    <p
                                        className={`text-xs mt-0.5 ${
                                            ativo
                                                ? escuro
                                                    ? 'text-[#38bdf8]'
                                                    : 'text-[#075985]'
                                                : clsSubtexto
                                        }`}
                                    >
                                      {[al.colegio_nome?.trim(), al.serie?.trim()].filter(Boolean).join(' • ')}
                                    </p>
                                  </div>

                                  <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        iniciarEdicaoAluno(al);
                                      }}
                                      className={`text-[11px] font-semibold px-2 py-1 rounded-lg border cursor-pointer shrink-0 ${
                                          escuro
                                              ? 'bg-slate-800 border-slate-700 text-slate-100 hover:border-[#0284c7]'
                                              : 'bg-white border-stone-200 text-stone-600 hover:border-[#0284c7]'
                                      }`}
                                  >{textoR4("Editar")}</button>
                                </div>
                            );
                          })}
                        </div>
                      </div>
                  )}

                  {exibirFormNovoAluno && (
                      <form
                          onSubmit={handleCadastrarAluno}
                          className={`rounded-xl border p-4 sm:p-5 space-y-4 ${clsSubCard}`}
                      >
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-[#0284c7]">
                            {alunoEditandoId
                                ? textoR4("Editar Dados do Aluno(a)")
                                : textoR4("Cadastrar Aluno(a) na R4 Ensina")}
                          </h3>
                          {alunos.length > 0 && (
                              <button
                                  type="button"
                                  onClick={() => {
                                    setExibirFormNovoAluno(false);
                                    setAlunoEditandoId(null);
                                  }}
                                  className={`text-xs cursor-pointer ${clsSubtexto}`}
                              >{textoR4("Cancelar")}</button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label
                                className={`block text-xs font-medium mb-1 ${clsSubtexto}`}
                            >{textoR4("Nome Completo do Aluno(a) *")}</label>
                            <input
                                type="text"
                                required
                                value={novoAlunoNome}
                                onChange={(e) => setNovoAlunoNome(e.target.value)}
                                placeholder={textoR4("Ex: Lucas Andrade")}
                                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                            />
                          </div>

                          <div>
                            <label
                                className={`block text-xs font-medium mb-1 ${clsSubtexto}`}
                            >{textoR4("Colégio *")}</label>
                            <select
                                required
                                value={colegioOpcao}
                                onChange={(e) => setColegioOpcao(e.target.value)}
                                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                            >
                              {colegiosOficiais.map((col) => (
                                  <option key={col.id} value={String(col.id)}>
                                    {col.nome}
                                  </option>
                              ))}
                              <option value="outros">{textoR4("Outros (digitar)")}</option>
                            </select>
                          </div>

                          <div>
                            <label
                                className={`block text-xs font-medium mb-1 ${clsSubtexto}`}
                            >{textoR4("Série / Ano *")}</label>
                            <select
                                required
                                value={serieAluno}
                                onChange={(e) => setSerieAluno(e.target.value)}
                                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
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
                              <label className="block text-xs font-medium text-[#D96B43] mb-1">{textoR4("Nome do Colégio *")}</label>
                              <input
                                  type="text"
                                  required
                                  value={colegioOutroNome}
                                  onChange={(e) => setColegioOutroNome(e.target.value)}
                                  placeholder={textoR4("Ex: Colégio Antônio Vieira")}
                                  className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                              />
                            </div>
                        )}

                        {erroFormAluno && (
                            <div className="rounded-xl border border-[#BE1E23]/40 bg-[#BE1E23]/15 px-3.5 py-2.5 text-xs text-rose-400">
                              {erroFormAluno}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={salvandoAluno}
                            className="px-5 py-2.5 rounded-xl r4-acao disabled:opacity-50 text-xs font-semibold  cursor-pointer"
                        >
                          {salvandoAluno
                              ? textoR4("Salvando...")
                              : alunoEditandoId
                                  ? textoR4("Salvar Alterações")
                                  : textoR4("Salvar Aluno(a)")}
                        </button>
                      </form>
                  )}
                </section>

                {/* PRÓXIMAS AULAS AGENDADAS DO RESPONSÁVEL */}
                {proximasAulas.length > 0 && (
                    <section className={`border rounded-2xl p-5 space-y-4 ${clsCard}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#0284c7]">{textoR4("Sua Agenda na R4 Ensina")}</span>
                          <h2 className={`text-base font-bold ${clsTitulo}`}>{textoR4("Próximas Aulas Agendadas (")}{proximasAulas.length})
                          </h2>
                        </div>
                      </div>

                      <div className="rounded-xl bg-[#BE1E23]/12 border border-[#BE1E23]/35 px-3.5 py-2.5 text-xs text-rose-300 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{textos.aviso_agenda_cancelamento}</span>
                      </div>

                      {avisoProximasAulas && (
                          <div
                              className={`rounded-xl border px-3.5 py-2.5 text-xs flex items-center justify-between gap-2 ${
                                  avisoProximasAulas.tipo === 'sucesso'
                                      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                                      : 'bg-[#BE1E23]/15 border-[#BE1E23]/40 text-rose-400'
                              }`}
                          >
                            <span>{avisoProximasAulas.texto}</span>
                            <button
                                type="button"
                                onClick={() => setAvisoProximasAulas(null)}
                                className="cursor-pointer shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {proximasAulas.map((aula) => {
                          const pedindoConfirmacao =
                              confirmandoCancelamentoId === aula.id;

                          return (
                              <div
                                  key={aula.id}
                                  className={`rounded-xl border p-4 flex flex-col justify-between gap-3 ${clsSubCard}`}
                              >
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[#0284c7]">
                              {aula.data_formatada} • {aula.horario}
                            </span>
                                    <span
                                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                                            escuro
                                                ? 'bg-[#1e293b] text-stone-300 border border-[#334155]'
                                                : 'bg-white text-stone-700 border border-stone-200'
                                        }`}
                                    >
                              {aula.unidade_nome}
                            </span>
                                  </div>

                                  <p className={`text-sm font-bold ${clsTitulo}`}>
                                    {aula.aluno_nome}{' '}
                                    <span className={`font-normal ${clsSubtexto}`}>
                              • {aula.materia}
                            </span>
                                  </p>

                                  <p className={`text-xs ${clsSubtexto}`}>{textoR4("Professor(a):")}{' '}
                                    <strong className={clsTitulo}>
                                      {aula.professor_nome}
                                    </strong>
                                  </p>
                                </div>

                                <div
                                    className={`pt-2.5 border-t ${
                                        escuro ? 'border-[#334155]' : 'border-stone-200'
                                    }`}
                                >
                                  {aula.pode_cancelar && sistemaAberto && alunos.some((aluno) => aluno.id === aula.aluno_id) &&
                                      <button type="button" className="mr-3 text-xs font-semibold underline"
                                          onClick={() => iniciarRemarcacao(aula)}>Remarcar aula</button>}
                                  {!aula.pode_cancelar ? (
                                      <p className="text-[11px] font-medium text-rose-400">{textoR4("Prazo de 2h encerrado: cancelamento gratuito indisponível (taxa da aula aplicável). Contate a secretaria R4.")}</p>
                                  ) : pedindoConfirmacao ? (
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-rose-400">{textoR4("Confirmar cancelamento gratuito?")}</span>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                              type="button"
                                              disabled={cancelandoAulaId === aula.id}
                                              onClick={() =>
                                                  setConfirmandoCancelamentoId(null)
                                              }
                                              className={`px-2.5 py-1 rounded-lg border text-xs cursor-pointer ${clsCard}`}
                                          >{textoR4("Não")}</button>
                                          <button
                                              type="button"
                                              disabled={cancelandoAulaId === aula.id}
                                              onClick={() =>
                                                  void handleCancelarProximaAula(aula.id)
                                              }
                                              className="px-3 py-1 rounded-lg bg-[#BE1E23] hover:bg-rose-700 text-xs font-semibold text-white cursor-pointer"
                                          >
                                            {cancelandoAulaId === aula.id
                                                ? textoR4("Cancelando...")
                                                : textoR4("Sim, cancelar")}
                                          </button>
                                        </div>
                                      </div>
                                  ) : (
                                      <button
                                          type="button"
                                          onClick={() =>
                                              setConfirmandoCancelamentoId(aula.id)
                                          }
                                          className="text-xs font-semibold text-rose-400 hover:underline cursor-pointer"
                                      >{textoR4("Cancelar agendamento (gratuito até 2h antes)")}</button>
                                  )}
                                </div>
                              </div>
                          );
                        })}
                      </div>
                    </section>
                )}

                {/* GRADE DE AGENDAMENTO */}
                {alunoAtivo && (
                    <>
                      {!sistemaAberto && (
                          <section className="rounded-2xl border border-[#C24124]/45 bg-[#C24124]/15 p-5 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-[#E07A5F] shrink-0 mt-0.5" />
                            <div className="space-y-1 text-sm">
                              <p className="font-bold text-[#E07A5F]">{textoR4("Agendamento Online Indisponível Neste Momento")}</p>
                              <p className={clsSubtexto}>
                                {motivoFechado || textos.aviso_sistema_fechado}
                              </p>
                            </div>
                          </section>
                      )}

                      {sistemaAberto && (
                          <>
                            <section
                                className={`border rounded-2xl p-5 space-y-5 ${clsCard}`}
                            >
                              <div className="space-y-2">
                                {remarcarId !== null && <p className="mb-2 text-sm" role="status">
                                    Escolha o novo horário. A aula atual fica reservada até você confirmar.
                                    <button type="button" className="ml-2 underline" onClick={() => { setRemarcarId(null); setSelecaoSlot(null); }}>Sair da remarcação</button>
                                  </p>}
                                  <label id="grade-portal"
                                    className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${clsSubtexto}`}
                                >
                                  <MapPin className="w-3.5 h-3.5 text-[#0284c7]" />{' ' + textoR4("1. Escolha a Unidade R4")}</label>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                                  {unidades.map((u) => {
                                    const ativa = u.id === unidadeId;
                                    return (
                                        <button
                                            key={u.id}
                                            type="button"
                                            onClick={() => handleTrocarUnidade(u.id)}
                                            className={`min-h-11 break-words py-3 px-2 sm:px-4 rounded-xl text-sm font-semibold border transition cursor-pointer ${
                                                ativa
                                                    ? 'bg-[#0284c7] border-[#0284c7] text-white shadow-md shadow-[#0284c7]/25'
                                                    : `${clsSubCard} ${clsSubtexto} hover:border-[#0284c7]/50`
                                            }`}
                                        >
                                          {u.nome}
                                        </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <label
                                    className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${clsSubtexto}`}
                                >
                                  <Calendar className="w-3.5 h-3.5 text-[#0284c7]" />{' ' + textoR4("2. Datas Liberadas Esta Semana")}</label>

                                {datas.length === 0 ? (
                                    <div
                                        className={`rounded-xl border p-3.5 text-xs ${clsSubCard} ${clsSubtexto}`}
                                    >{textoR4("Não há mais datas disponíveis para esta semana. Para marcar na próxima semana, fale com nossa secretaria (segunda a sexta, das 08:00 às 18:00).")}</div>
                                ) : (
                                    <div className="flex gap-2.5 overflow-x-auto pb-1">
                                      {datas.map((d) => {
                                        const ativa = d.data === dataSelecionada;
                                        return (
                                            <button
                                                key={d.data}
                                                type="button"
                                                onClick={() => handleTrocarData(d.data)}
                                                className={`min-w-[118px] py-2.5 px-3.5 rounded-xl border text-center transition cursor-pointer shrink-0 ${
                                                    ativa
                                                        ? 'bg-[#0284c7] border-[#0284c7] text-white shadow-md shadow-[#0284c7]/25'
                                                        : `${clsSubCard} ${clsSubtexto} hover:border-[#0284c7]/50`
                                                }`}
                                            >
                                  <span
                                      className={`block text-[10px] font-bold tracking-wider ${
                                          ativa
                                              ? 'text-teal-100'
                                              : 'text-[#0284c7]'
                                      }`}
                                  >
                                    {formatarDiaSemana(d.data)}
                                  </span>
                                              <span className="block text-sm font-bold mt-0.5">
                                    {d.data_formatada}
                                  </span>
                                            </button>
                                        );
                                      })}
                                    </div>
                                )}
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                <div>
                                  <label
                                      className={`block text-xs font-medium mb-1 ${clsSubtexto}`}
                                  >{alunoAtivo.serie?.trim() ? `${textoR4("Filtrar por Matéria (para")} ${alunoAtivo.serie.trim()})` : textoR4("Filtrar por Matéria")}
                                  </label>
                                  <select
                                      value={materiaFiltro}
                                      onChange={(e) =>
                                          handleTrocarMateria(e.target.value)
                                      }
                                      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                  >
                                    <option value="todas">{textoR4("Todas as matérias para esta série")}</option>
                                    {materias.map((m) => (
                                        <option key={m} value={m}>
                                          {m}
                                        </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label
                                      className={`block text-xs font-medium mb-1 ${clsSubtexto}`}
                                  >{textoR4("Buscar Professor(a)")}</label>
                                  <div className="relative">
                                    <Search
                                        className={`w-4 h-4 absolute left-3.5 top-3 ${clsSubtexto}`}
                                    />
                                    <input
                                        type="text"
                                        value={buscaProfessor}
                                        onChange={(e) =>
                                            setBuscaProfessor(e.target.value)
                                        }
                                        placeholder={textoR4("Digite o nome do professor...")}
                                        className={`w-full rounded-xl border pl-10 pr-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                                    />
                                  </div>
                                </div>
                              </div>
                            </section>

                            {erroGeral && (
                                <div className="rounded-xl border border-[#BE1E23]/40 bg-[#BE1E23]/15 p-4 text-sm text-rose-400">
                                  {erroGeral}
                                </div>
                            )}

                            <section className="space-y-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 className={`text-base font-bold ${clsTitulo}`}>{textoR4("3. Horários Disponíveis (100 min) —")}{' '}
                                  {unidadeAtual?.nome || 'Unidade'}
                                </h2>
                                <span className={`text-xs ${clsSubtexto}`}>
                          {professoresExibidos.length}{' '}{alunoAtivo.serie?.trim()
                              ? `${textoR4("professor(es) para")} ${alunoAtivo.serie.trim()}`
                              : textoR4("professor(es)")}
                        </span>
                              </div>

                              {carregandoHorarios ? (
                                  <div
                                      className={`border rounded-2xl p-10 text-center text-sm ${clsCard} ${clsSubtexto}`}
                                  >{textoR4("Sincronizando agenda em tempo real...")}</div>
                              ) : datas.length === 0 ? null : professoresExibidos.length ===
                              0 ? (
                                  <div
                                      className={`border rounded-2xl p-10 text-center text-sm ${clsCard} ${clsSubtexto}`}
                                  >{alunoAtivo.serie?.trim() ? `${textoR4("Nenhum professor encontrado para")} ${alunoAtivo.serie.trim()} ${textoR4("com esta matéria/unidade.")}` : textoR4("Nenhum professor encontrado com esta matéria/unidade.")}</div>
                              ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {professoresExibidos.map((prof) => {
                                      const livresSet = new Set(
                                          prof.slotsDisponiveis.map((s) => s.inicio)
                                      );

                                      return (
                                          <article
                                              key={prof.id}
                                              className={`border rounded-2xl p-5 flex flex-col justify-between gap-4 transition ${clsCard}`}
                                          >
                                            <div className="space-y-1.5">
                                              <div className="flex items-center justify-between gap-2">
                                                <h3
                                                    className={`flex min-w-0 items-center gap-2 text-base font-bold ${clsTitulo}`}
                                                >
                                                  <AvatarProfessor nome={prof.nome} />
                                                  <span className="min-w-0 break-words">{prof.nome}</span>
                                                </h3>
                                                <span
                                                    className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                                        prof.slotsDisponiveis.length > 0
                                                            ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/35'
                                                            : `${clsSubCard} ${clsSubtexto}`
                                                    }`}
                                                >
                                      {prof.slotsDisponiveis.length}{' ' + textoR4("livre(s)")}</span>
                                              </div>
                                              <p className={`text-xs ${clsSubtexto}`}>
                                                {prof.materias.join(' • ')}
                                              </p>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                              {prof.todosSlots.map((slot) => {
                                                const disponivel = livresSet.has(
                                                    slot.inicio
                                                );
                                                return (
                                                    <button
                                                        key={slot.inicio}
                                                        type="button"
                                                        disabled={!disponivel}
                                                        onClick={() =>
                                                            abrirModalAgendamento(prof, slot)
                                                        }
                                                        className={`r4-horario flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-center text-xs font-semibold transition ${
                                                            disponivel ? 'cursor-pointer' : 'cursor-not-allowed opacity-55 line-through'
                                                        }`}
                                                    >
                                                      <Clock className="hidden h-3.5 w-3.5 shrink-0 sm:block" />
                                                      <span>{slot.label}</span>
                                                    </button>
                                                );
                                              })}
                                            </div>
                                          </article>
                                      );
                                    })}
                                  </div>
                              )}
                            </section>
                          </>
                      )}
                    </>
                )}
              </>
          )}
        </div>

        {/* MODAL DE CONFIRMAÇÃO DE AGENDAMENTO */}
        {selecaoSlot && alunoAtivo && (
            <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
              <div
                  className={`border rounded-2xl max-h-[90dvh] overflow-y-auto max-w-lg w-full p-4 sm:p-5 space-y-3 shadow-2xl ${clsCard}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#0284c7]">{textoR4("Agendar aula")}</span>
                    <h2 className={`text-lg font-bold mt-0.5 ${clsTitulo}`}>
                      {selecaoSlot.professor.nome}
                    </h2>
                    <p className={`text-xs mt-0.5 ${clsSubtexto}`}>
                      {unidadeAtual?.nome} •{' '}
                      {datas.find((d) => d.data === dataSelecionada)
                          ?.data_formatada || dataSelecionada}{' '}{textoR4("às") + ' '}{selecaoSlot.slot.label}
                    </p>
                  </div>
                  <button
                      type="button"
                      onClick={() => setSelecaoSlot(null)}
                      className={`p-1.5 rounded-lg cursor-pointer ${clsSubtexto}`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div
                    className={`rounded-xl border p-3.5 text-xs space-y-1 ${clsSubCard}`}
                >
                  <p>
                    <strong>{textoR4("Aluno(a):")}</strong> {alunoAtivo.nome_aluno}
                  </p>
                  <p>
                    <strong>{textoR4("Colégio / Série:")}</strong> {[alunoAtivo.colegio_nome?.trim(), alunoAtivo.serie?.trim()].filter(Boolean).join(' • ') || '—'}
                  </p>
                  <p>
                    <strong>{textoR4("Responsável:")}</strong> {responsavelConfirmado} (
                    {formatarTelefone(telefoneConfirmado)})
                  </p>
                </div>

                <form onSubmit={handleConfirmarAgendamento} className="space-y-3">
                  {!onlineDireto && <fieldset>
                    <legend className="mb-1 text-xs font-semibold">Modalidade da aula</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {(['presencial', 'online'] as const).map((opcao) => (
                        <label key={opcao} className={`flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${modalidade === opcao ? 'border-sky-500' : clsSubCard}`}>
                          <input type="radio" name="modalidade" checked={modalidade === opcao} onChange={() => setModalidade(opcao)} />
                          {opcao === 'online' ? 'Online' : 'Presencial'}
                        </label>
                      ))}
                    </div>
                  </fieldset>}
                  {aulaOnline && <div className={`space-y-2 rounded-xl border p-3 text-xs ${clsSubCard}`}>
                    <p>O professor enviará o link para o WhatsApp do responsável. Para receber no número do aluno, informe-o abaixo.</p>
                    <label className="block font-semibold">WhatsApp do aluno (opcional)
                      <input type="tel" inputMode="tel" value={whatsappAluno}
                        onChange={(e) => setWhatsappAluno(formatarTelefone(e.target.value))}
                        placeholder="(71) 99999-9999" className={`mt-1 w-full rounded-lg border px-3 py-2 ${clsInput}`} />
                    </label>
                  </div>}
                  <div>
                    <label
                        className={`block text-xs font-medium mb-1 ${clsSubtexto}`}
                    >{textoR4("Matéria da Aula *")}</label>
                    <select
                        required
                        value={materiaAula}
                        onChange={(e) => setMateriaAula(e.target.value)}
                        className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                    >
                      {selecaoSlot.professor.materias.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                        className={`block text-xs font-medium mb-1 ${clsSubtexto}`}
                    >{textoR4("Conteúdo / Assunto da Prova (opcional)")}</label>
                    <textarea
                        rows={2}
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        placeholder={textoR4("Ex: Revisão de equações do 2º grau para prova")}
                        className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none ${clsInput}`}
                    />
                  </div>

                  {erroModal && (
                      <div className="rounded-xl border border-[#BE1E23]/40 bg-[#BE1E23]/15 px-3.5 py-2.5 text-xs text-rose-400">
                        {erroModal}
                      </div>
                  )}

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                        type="button"
                        onClick={() => setSelecaoSlot(null)}
                        className={`px-4 py-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${clsSubCard} ${clsSubtexto}`}
                    >{textoR4("Voltar")}</button>
                    <button
                        type="submit"
                        disabled={enviandoAgendamento}
                        className="px-5 py-2.5 rounded-xl r4-acao disabled:opacity-50 text-xs font-bold  shadow-md cursor-pointer"
                    >
                      {enviandoAgendamento
                          ? textoR4("Agendando...")
                          : textoR4("Agendar aula")}
                    </button>
                  </div>
                </form>
              </div>
            </div>
        )}
      </main>
  );
}