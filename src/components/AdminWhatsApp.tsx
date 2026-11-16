'use client';

import { useEffect, useRef, useState } from 'react';
import { formatarTelefone } from '@/lib/cliente-helpers';

interface ConfigWhatsApp {
    ativo: boolean;
    provedor: 'evolution' | 'zapi' | 'webhook';
    url_api: string;
    token_api: string;
    client_token: string;
    instancia: string;
    grupo_id: string;
    wame_ativo: boolean;
    wame_numero: string;
    alerta_sonoro_ativo: boolean;
}

interface AgendamentoRecente {
    id: number;
    unidade_nome: string;
    professor_nome: string;
    materia: string;
    data: string;
    data_formatada: string;
    hora_inicio: string;
    hora_fim: string;
    aluno_nome: string;
    aluno_telefone: string;
    colegio_nome: string | null;
    serie: string | null;
    observacoes: string | null;
    notificado_whatsapp: boolean;
    lancado_clincare: boolean;
}

function tocarCampainhaAlerta() {
    try {
        const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
                .webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        const agora = ctx.currentTime;

        const notas = [587.33, 880]; // Ré5 -> Lá5
        notas.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, agora + idx * 0.18);
            gain.gain.setValueAtTime(0.001, agora + idx * 0.18);
            gain.gain.exponentialRampToValueAtTime(0.25, agora + idx * 0.18 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, agora + idx * 0.18 + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(agora + idx * 0.18);
            osc.stop(agora + idx * 0.18 + 0.38);
        });
    } catch {
        // Ignora caso o navegador bloqueie áudio antes de interação
    }
}

export default function AdminWhatsApp() {
    const [config, setConfig] = useState<ConfigWhatsApp>({
        ativo: false,
        provedor: 'evolution',
        url_api: '',
        token_api: '',
        client_token: '',
        instancia: '',
        grupo_id: '',
        wame_ativo: false,
        wame_numero: '',
        alerta_sonoro_ativo: true,
    });
    const [recentes, setRecentes] = useState<AgendamentoRecente[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [testando, setTestando] = useState(false);
    const [novoAvisoVisual, setNovoAvisoVisual] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<{
        tipo: 'ok' | 'erro';
        texto: string;
    } | null>(null);

    const maiorIdConhecidoRef = useRef<number | null>(null);
    const alertaSonoroAtivoRef = useRef<boolean>(true);

    useEffect(() => {
        alertaSonoroAtivoRef.current = config.alerta_sonoro_ativo;
    }, [config.alerta_sonoro_ativo]);

    useEffect(() => {
        let cancelado = false;

        async function carregarInicial() {
            try {
                const res = await fetch('/api/admin/whatsapp', { cache: 'no-store' });
                const json = await res.json();
                if (!cancelado && res.ok) {
                    if (json.config) {
                        setConfig(json.config);
                        alertaSonoroAtivoRef.current = Boolean(
                            json.config.alerta_sonoro_ativo
                        );
                    }
                    const lista: AgendamentoRecente[] = json.recentes || [];
                    setRecentes(lista);
                    maiorIdConhecidoRef.current = lista.length > 0 ? lista[0].id : 0;
                }
            } finally {
                if (!cancelado) setCarregando(false);
            }
        }

        void carregarInicial();

        // Monitoramento em tempo real a cada 20 segundos
        const intervalo = window.setInterval(async () => {
            try {
                const res = await fetch('/api/admin/whatsapp', { cache: 'no-store' });
                const json = await res.json();
                if (cancelado || !res.ok) return;

                const lista: AgendamentoRecente[] = json.recentes || [];
                setRecentes(lista);

                const topoId = lista.length > 0 ? lista[0].id : 0;
                if (
                    maiorIdConhecidoRef.current !== null &&
                    topoId > maiorIdConhecidoRef.current
                ) {
                    maiorIdConhecidoRef.current = topoId;
                    const novo = lista[0];
                    setNovoAvisoVisual(
                        `Novo agendamento #${novo.id}: ${novo.aluno_nome} com ${novo.professor_nome} (${novo.data_formatada} às ${novo.hora_inicio})`
                    );
                    if (alertaSonoroAtivoRef.current) {
                        tocarCampainhaAlerta();
                    }
                }
            } catch {
                // Ignora falha temporária de rede
            }
        }, 20000);

        return () => {
            cancelado = true;
            window.clearInterval(intervalo);
        };
    }, []);

    async function salvarConfiguracoes(novaCfg: ConfigWhatsApp, msgOk?: string) {
        setSalvando(true);
        setFeedback(null);

        try {
            const res = await fetch('/api/admin/whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acao: 'salvarConfig', ...novaCfg }),
            });
            const json = await res.json();
            if (res.ok) {
                if (json.config) setConfig(json.config);
                if (msgOk) {
                    setFeedback({ tipo: 'ok', texto: msgOk });
                }
            } else {
                setFeedback({
                    tipo: 'erro',
                    texto: json.error || 'Falha ao salvar configuração.',
                });
            }
        } finally {
            setSalvando(false);
        }
    }

    async function handleSalvarFormulario(e: React.FormEvent) {
        e.preventDefault();
        await salvarConfiguracoes(
            config,
            'Preferências de notificação salvas com sucesso!'
        );
    }

    async function handleTestarApi() {
        setTestando(true);
        setFeedback(null);

        try {
            await fetch('/api/admin/whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acao: 'salvarConfig', ...config }),
            });

            const res = await fetch('/api/admin/whatsapp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ acao: 'testarEnvio' }),
            });
            const json = await res.json();

            if (res.ok) {
                setFeedback({
                    tipo: 'ok',
                    texto: 'Mensagem de teste enviada com sucesso!',
                });
            } else {
                setFeedback({
                    tipo: 'erro',
                    texto: json.error || 'Erro ao enviar teste.',
                });
            }
        } finally {
            setTestando(false);
        }
    }

    async function handleMarcarClinCare(agendamentoId: number, lancado: boolean) {
        const res = await fetch('/api/admin/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                acao: 'marcarLancadoClinCare',
                agendamentoId,
                lancado,
            }),
        });
        const json = await res.json();
        if (res.ok) {
            setRecentes(json.recentes || []);
        }
    }

    async function handleReenviar(agendamentoId: number) {
        setFeedback(null);
        const res = await fetch('/api/admin/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                acao: 'reenviarAgendamento',
                agendamentoId,
            }),
        });
        const json = await res.json();
        if (res.ok) {
            setRecentes(json.recentes || []);
            setFeedback({
                tipo: 'ok',
                texto: `Agendamento #${agendamentoId} reenviado via API!`,
            });
        } else {
            setFeedback({
                tipo: 'erro',
                texto: json.error || 'Falha ao reenviar.',
            });
        }
    }

    const pendentesClinCare = recentes.filter((r) => !r.lancado_clincare).length;

    return (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-lg font-bold text-white">
                        Avisos de Novos Agendamentos (3 Modos Configuráveis)
                    </h2>
                    <p className="text-xs text-slate-400">
                        Ative ou desative cada modo de aviso de acordo com a operação da recepção.
                    </p>
                </div>
                {pendentesClinCare > 0 && (
                    <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold">
            {pendentesClinCare} aula(s) pendente(s) de lançar no Clin Care
          </span>
                )}
            </div>

            {novoAvisoVisual && (
                <div className="rounded-xl bg-amber-500/15 border border-amber-400/50 px-4 py-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-amber-200">
                        🔔 {novoAvisoVisual}
                    </p>
                    <button
                        type="button"
                        onClick={() => setNovoAvisoVisual(null)}
                        className="text-xs text-amber-300 hover:text-white"
                    >
                        Dispensar
                    </button>
                </div>
            )}

            {feedback && (
                <div
                    className={`rounded-xl px-4 py-2.5 text-xs border ${
                        feedback.tipo === 'ok'
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                            : 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                    }`}
                >
                    {feedback.texto}
                </div>
            )}

            <form onSubmit={handleSalvarFormulario} className="space-y-4">
                {/* OPÇÃO 1: ENVIO AUTOMÁTICO VIA API */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-bold text-white">
                                1. Envio Automático para Grupo ou Número (API WhatsApp)
                            </h3>
                            <p className="text-xs text-slate-400">
                                Dispara automaticamente em segundo plano via Evolution API, Z-API ou Webhook.
                            </p>
                        </div>
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.ativo}
                                onChange={(e) => {
                                    const atualizada = { ...config, ativo: e.target.checked };
                                    setConfig(atualizada);
                                    void salvarConfiguracoes(atualizada);
                                }}
                                className="w-4 h-4 accent-emerald-500"
                            />
                            <span
                                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                    config.ativo
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'bg-slate-800 text-slate-400'
                                }`}
                            >
                {config.ativo ? 'ATIVADO' : 'DESATIVADO'}
              </span>
                        </label>
                    </div>

                    {config.ativo && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                    Provedor de Envio
                                </label>
                                <select
                                    value={config.provedor}
                                    onChange={(e) =>
                                        setConfig((prev) => ({
                                            ...prev,
                                            provedor: e.target.value as ConfigWhatsApp['provedor'],
                                        }))
                                    }
                                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                                >
                                    <option value="evolution">Evolution API</option>
                                    <option value="zapi">Z-API</option>
                                    <option value="webhook">Webhook (n8n / Make / Zapier)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                    Destino (ID do Grupo @g.us ou Número com DDD)
                                </label>
                                <input
                                    type="text"
                                    value={config.grupo_id}
                                    onChange={(e) =>
                                        setConfig((prev) => ({ ...prev, grupo_id: e.target.value }))
                                    }
                                    placeholder="Ex: 120363123456789012@g.us ou 71999999999"
                                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                    {config.provedor === 'zapi'
                                        ? 'URL da Instância Z-API'
                                        : config.provedor === 'evolution'
                                            ? 'URL Base da Evolution API'
                                            : 'URL do Webhook'}
                                </label>
                                <input
                                    type="url"
                                    value={config.url_api}
                                    onChange={(e) =>
                                        setConfig((prev) => ({ ...prev, url_api: e.target.value }))
                                    }
                                    placeholder="https://..."
                                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                                />
                            </div>

                            {config.provedor === 'evolution' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-300 mb-1">
                                            Nome da Instância
                                        </label>
                                        <input
                                            type="text"
                                            value={config.instancia}
                                            onChange={(e) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    instancia: e.target.value,
                                                }))
                                            }
                                            placeholder="Ex: r4ensina"
                                            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-slate-300 mb-1">
                                            Global API Key / Token
                                        </label>
                                        <input
                                            type="password"
                                            value={config.token_api}
                                            onChange={(e) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    token_api: e.target.value,
                                                }))
                                            }
                                            placeholder="Sua apikey"
                                            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                                        />
                                    </div>
                                </>
                            )}

                            {config.provedor === 'zapi' && (
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-slate-300 mb-1">
                                        Client-Token de Segurança Z-API (opcional)
                                    </label>
                                    <input
                                        type="password"
                                        value={config.client_token}
                                        onChange={(e) =>
                                            setConfig((prev) => ({
                                                ...prev,
                                                client_token: e.target.value,
                                            }))
                                        }
                                        placeholder="Client-Token"
                                        className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                                    />
                                </div>
                            )}

                            <div className="md:col-span-2 flex justify-end">
                                <button
                                    type="button"
                                    disabled={testando || !config.url_api}
                                    onClick={handleTestarApi}
                                    className="px-4 py-2 rounded-xl bg-sky-600/20 hover:bg-sky-600 border border-sky-500/50 disabled:opacity-40 text-xs font-semibold text-sky-200 hover:text-white transition"
                                >
                                    {testando ? 'Enviando teste...' : 'Testar Envio da API'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* OPÇÃO 2: BOTÃO GRATUITO WA.ME PARA O CLIENTE */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-bold text-white">
                                2. Botão &ldquo;Enviar Comprovante no WhatsApp&rdquo; para o Cliente (Gratuito)
                            </h3>
                            <p className="text-xs text-slate-400">
                                Exibe um botão verde logo após o agendamento abrindo o WhatsApp do cliente já com a mensagem pronta para a secretaria.
                            </p>
                        </div>
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.wame_ativo}
                                onChange={(e) => {
                                    const atualizada = { ...config, wame_ativo: e.target.checked };
                                    setConfig(atualizada);
                                    void salvarConfiguracoes(atualizada);
                                }}
                                className="w-4 h-4 accent-emerald-500"
                            />
                            <span
                                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                    config.wame_ativo
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'bg-slate-800 text-slate-400'
                                }`}
                            >
                {config.wame_ativo ? 'ATIVADO' : 'DESATIVADO'}
              </span>
                        </label>
                    </div>

                    {config.wame_ativo && (
                        <div className="pt-2 border-t border-slate-800/80">
                            <label className="block text-xs font-medium text-slate-300 mb-1">
                                WhatsApp da Secretaria / Atendimento (com DDD)
                            </label>
                            <input
                                type="tel"
                                value={config.wame_numero}
                                onChange={(e) =>
                                    setConfig((prev) => ({
                                        ...prev,
                                        wame_numero: formatarTelefone(e.target.value),
                                    }))
                                }
                                placeholder="(71) 99999-9999"
                                className="w-full max-w-xs rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-sm text-white"
                            />
                        </div>
                    )}
                </div>

                {/* OPÇÃO 3: ALERTA SONORO AUTOMÁTICO NO PAINEL ADMIN */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-white">
                            3. Alerta Sonoro Automático nesta Tela (/admin)
                        </h3>
                        <p className="text-xs text-slate-400">
                            Atualiza a fila a cada 20s e toca uma campainha no computador da recepção sempre que entrar uma nova aula.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={tocarCampainhaAlerta}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                        >
                            🔊 Testar Som
                        </button>

                        <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.alerta_sonoro_ativo}
                                onChange={(e) => {
                                    const atualizada = {
                                        ...config,
                                        alerta_sonoro_ativo: e.target.checked,
                                    };
                                    setConfig(atualizada);
                                    void salvarConfiguracoes(atualizada);
                                }}
                                className="w-4 h-4 accent-emerald-500"
                            />
                            <span
                                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                    config.alerta_sonoro_ativo
                                        ? 'bg-emerald-500/20 text-emerald-300'
                                        : 'bg-slate-800 text-slate-400'
                                }`}
                            >
                {config.alerta_sonoro_ativo ? 'ATIVADO' : 'DESATIVADO'}
              </span>
                        </label>
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={salvando}
                        className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white"
                    >
                        {salvando ? 'Salvando...' : 'Salvar Todas as Configurações'}
                    </button>
                </div>
            </form>

            {/* Fila de Agendamentos Recentes para controle dos atendentes */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Últimos Agendamentos (Controle de Lançamento no Clin Care)
                </h3>

                {carregando ? (
                    <p className="text-xs text-slate-400">Carregando agendamentos...</p>
                ) : recentes.length === 0 ? (
                    <p className="text-xs text-slate-500">
                        Nenhum agendamento registrado ainda.
                    </p>
                ) : (
                    <div className="space-y-2.5">
                        {recentes.map((ag) => (
                            <div
                                key={ag.id}
                                className={`rounded-xl border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
                                    ag.lancado_clincare
                                        ? 'bg-slate-950/60 border-slate-800/80 opacity-75'
                                        : 'bg-slate-950 border-amber-500/40'
                                }`}
                            >
                                <div className="space-y-1 text-xs">
                                    <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white">
                      #{ag.id} • {ag.aluno_nome}
                    </span>
                                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {ag.unidade_nome}
                    </span>
                                        {ag.notificado_whatsapp && (
                                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                        Enviado via API
                      </span>
                                        )}
                                    </div>
                                    <p className="text-slate-300">
                                        <strong>{ag.data_formatada}</strong> ({ag.hora_inicio} às{' '}
                                        {ag.hora_fim}) • <strong>Prof.:</strong> {ag.professor_nome}{' '}
                                        • <strong>Matéria:</strong> {ag.materia}
                                    </p>
                                    <p className="text-slate-400">
                                        WhatsApp: {formatarTelefone(ag.aluno_telefone)}
                                        {ag.colegio_nome ? ` • ${ag.colegio_nome}` : ''}
                                        {ag.serie ? ` (${ag.serie})` : ''}
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    {config.ativo && (
                                        <button
                                            type="button"
                                            onClick={() => handleReenviar(ag.id)}
                                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                                        >
                                            Reenviar via API
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleMarcarClinCare(ag.id, !ag.lancado_clincare)
                                        }
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                                            ag.lancado_clincare
                                                ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-300'
                                                : 'bg-amber-600 hover:bg-amber-500 text-white'
                                        }`}
                                    >
                                        {ag.lancado_clincare
                                            ? '✓ Lançado no Clin Care'
                                            : 'Marcar como lançado no Clin Care'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}