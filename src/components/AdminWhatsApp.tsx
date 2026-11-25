'use client';
import { useTextoR4 } from '@/components/TextosInterfaceR4';


import { useEffect, useRef, useState } from 'react';
import { formatarTelefone } from '@/lib/cliente-helpers';

interface ConfigWhatsApp {
    ativo: boolean;
    provedor: 'evolution' | 'zapi' | 'webhook';
    url_api: string;
    url_webhook_otp: string;
    url_webhook_grupo: string;
    token_api: string;
    client_token: string;
    instancia: string;
    grupo_id: string;
    wame_ativo: boolean;
    wame_numero: string;
    alerta_sonoro_ativo: boolean;
    verificar_cadastro_whatsapp: boolean;
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

        const notas = [587.33, 880];
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
    const textoR4 = useTextoR4();
    const [config, setConfig] = useState<ConfigWhatsApp>({
        ativo: false,
        provedor: 'evolution',
        url_api: '',
        url_webhook_otp: '',
        url_webhook_grupo: '',
        token_api: '',
        client_token: '',
        instancia: '',
        grupo_id: '',
        wame_ativo: false,
        wame_numero: '',
        alerta_sonoro_ativo: true,
        verificar_cadastro_whatsapp: true,
    });
    const [recentes, setRecentes] = useState<AgendamentoRecente[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [testando, setTestando] = useState(false);
    const [testandoGrupo, setTestandoGrupo] = useState(false);
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

    async function handleTestarGrupo() {
        setTestandoGrupo(true);
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
                body: JSON.stringify({ acao: 'testarEnvioGrupo' }),
            });
            const json = await res.json();

            if (res.ok) {
                setFeedback({
                    tipo: 'ok',
                    texto: 'Mensagem de teste enviada para o Webhook do Grupo!',
                });
            } else {
                setFeedback({
                    tipo: 'erro',
                    texto: json.error || 'Erro ao enviar teste para o grupo.',
                });
            }
        } finally {
            setTestandoGrupo(false);
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


    return (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-lg font-bold text-white">{textoR4("Avisos, Códigos OTP & Integração WhatsApp")}</h2>
                    <p className="text-xs text-slate-400">{textoR4("Configure o envio automático de confirmações, validação de cadastro e recuperação de PIN.")}</p>
                </div>
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
                    >{textoR4("Dispensar")}</button>
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
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-bold text-white">{textoR4("1. Envio Automático para Grupo ou Número (API WhatsApp / CRM)")}</h3>
                            <p className="text-xs text-slate-400">{textoR4("Dispara confirmações de aula, códigos de cadastro e recuperação de PIN via Evolution API, Z-API ou Webhook (DataCrazy).")}</p>
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
                {config.ativo ? textoR4("ATIVADO") : textoR4("DESATIVADO")}
              </span>
                        </label>
                    </div>

                    {config.ativo && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">{textoR4("Provedor de Envio")}</label>
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
                                    <option value="evolution">{textoR4("Evolution API")}</option>
                                    <option value="zapi">{textoR4("Z-API")}</option>
                                    <option value="webhook">{textoR4("Webhook (DataCrazy / n8n / Make)")}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-300 mb-1">{textoR4("Destino Padrão (ID do Grupo @g.us ou Número com DDD)")}</label>
                                <input
                                    type="text"
                                    value={config.grupo_id}
                                    onChange={(e) =>
                                        setConfig((prev) => ({ ...prev, grupo_id: e.target.value }))
                                    }
                                    placeholder={textoR4("Ex: 120363123456789012@g.us ou 71999999999")}
                                    className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-slate-300 mb-1">
                                    {config.provedor === 'zapi'
                                        ? textoR4("URL da Instância Z-API")
                                        : config.provedor === 'evolution'
                                            ? textoR4("URL Base da Evolution API")
                                            : textoR4("URL do Webhook (Agendamentos)")}
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

                            {config.provedor === 'webhook' && (
                                <>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-medium text-slate-300 mb-1">{textoR4("2ª URL do Webhook — Códigos OTP e Recuperação de PIN (opcional)")}</label>
                                        <input
                                            type="url"
                                            value={config.url_webhook_otp || ''}
                                            onChange={(e) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    url_webhook_otp: e.target.value,
                                                }))
                                            }
                                            placeholder="https://api.datacrazy.io/... (se vazio, usa a URL do Webhook acima)"
                                            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                                        />
                                        <p className="text-[11px] text-slate-400 mt-1">{textoR4("Automação 2 no DataCrazy: envia códigos de 4 dígitos no WhatsApp do cliente no cadastro e na recuperação de PIN.")}</p>
                                    </div>

                                    <div className="md:col-span-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                            <label className="block text-xs font-medium text-slate-300">{textoR4("3ª URL do Webhook — Controle no Grupo (Agendamentos e Cancelamentos)")}</label>
                                            <button
                                                type="button"
                                                disabled={
                                                    testandoGrupo ||
                                                    !config.url_webhook_grupo ||
                                                    !config.grupo_id
                                                }
                                                onClick={handleTestarGrupo}
                                                className="px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/40 disabled:opacity-40 text-[11px] font-semibold text-emerald-200 hover:text-white transition"
                                            >
                                                {testandoGrupo ? textoR4("Testando Grupo...") : textoR4("Testar Webhook do Grupo")}
                                            </button>
                                        </div>
                                        <input
                                            type="url"
                                            value={config.url_webhook_grupo || ''}
                                            onChange={(e) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    url_webhook_grupo: e.target.value,
                                                }))
                                            }
                                            placeholder="https://api.datacrazy.io/... (dispara para o Destino Padrão @g.us ao agendar e ao cancelar)"
                                            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                                        />
                                        <p className="text-[11px] text-slate-400 mt-1">{textoR4("Automação 3 no DataCrazy: dispara resumo com Cliente, Aluno e Telefone para o grupo (@g.us) sempre que uma aula for marcada ou cancelada.")}</p>
                                    </div>
                                </>
                            )}

                            {config.provedor === 'evolution' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-300 mb-1">{textoR4("Nome da Instância")}</label>
                                        <input
                                            type="text"
                                            value={config.instancia}
                                            onChange={(e) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    instancia: e.target.value,
                                                }))
                                            }
                                            placeholder={textoR4("Ex: r4ensina")}
                                            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-slate-300 mb-1">{textoR4("Global API Key / Token")}</label>
                                        <input
                                            type="password"
                                            value={config.token_api}
                                            onChange={(e) =>
                                                setConfig((prev) => ({
                                                    ...prev,
                                                    token_api: e.target.value,
                                                }))
                                            }
                                            placeholder={textoR4("Sua apikey")}
                                            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white"
                                        />
                                    </div>
                                </>
                            )}

                            {config.provedor === 'zapi' && (
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-slate-300 mb-1">{textoR4("Client-Token de Segurança Z-API (opcional)")}</label>
                                    <input
                                        type="password"
                                        value={config.client_token}
                                        onChange={(e) =>
                                            setConfig((prev) => ({
                                                ...prev,
                                                client_token: e.target.value,
                                            }))
                                        }
                                        placeholder={textoR4("Client-Token")}
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
                                    {testando ? textoR4("Enviando teste...") : textoR4("Testar Envio da API")}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-white">{textoR4("2. Validar WhatsApp com Código de 4 Dígitos no Cadastro")}</h3>
                        <p className="text-xs text-slate-400">{textoR4("Exige que novos responsáveis confirmem um código enviado no WhatsApp antes de concluir o cadastro (requer a Opção 1 ativada).")}</p>
                    </div>

                    <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.verificar_cadastro_whatsapp}
                            onChange={(e) => {
                                const atualizada = {
                                    ...config,
                                    verificar_cadastro_whatsapp: e.target.checked,
                                };
                                setConfig(atualizada);
                                void salvarConfiguracoes(atualizada);
                            }}
                            className="w-4 h-4 accent-emerald-500"
                        />
                        <span
                            className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                                config.verificar_cadastro_whatsapp
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-slate-800 text-slate-400'
                            }`}
                        >
              {config.verificar_cadastro_whatsapp ? textoR4("ATIVADO") : textoR4("DESATIVADO")}
            </span>
                    </label>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-bold text-white">
                                3. Botão &ldquo;Enviar Comprovante no WhatsApp&rdquo; para o Cliente (Gratuito)
                            </h3>
                            <p className="text-xs text-slate-400">{textoR4("Exibe um botão verde logo após o agendamento abrindo o WhatsApp do cliente já com a mensagem pronta para a secretaria.")}</p>
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
                {config.wame_ativo ? textoR4("ATIVADO") : textoR4("DESATIVADO")}
              </span>
                        </label>
                    </div>

                    {config.wame_ativo && (
                        <div className="pt-2 border-t border-slate-800/80">
                            <label className="block text-xs font-medium text-slate-300 mb-1">{textoR4("WhatsApp da Secretaria / Atendimento (com DDD)")}</label>
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

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-white">{textoR4("4. Alerta Sonoro Automático nesta Tela (/admin)")}</h3>
                        <p className="text-xs text-slate-400">{textoR4("Atualiza a fila a cada 20s e toca uma campainha no computador da recepção sempre que entrar uma nova aula.")}</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={tocarCampainhaAlerta}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                        >{textoR4("🔊 Testar Som")}</button>

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
                {config.alerta_sonoro_ativo ? textoR4("ATIVADO") : textoR4("DESATIVADO")}
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
                        {salvando ? textoR4("Salvando...") : textoR4("Salvar Todas as Configurações")}
                    </button>
                </div>
            </form>

            <div className="space-y-3 pt-2 border-t border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{textoR4("Últimos Agendamentos")}</h3>

                {carregando ? (
                    <p className="text-xs text-slate-400">{textoR4("Carregando agendamentos...")}</p>
                ) : recentes.length === 0 ? (
                    <p className="text-xs text-slate-500">{textoR4("Nenhum agendamento registrado ainda.")}</p>
                ) : (
                    <div className="space-y-2.5">
                        {recentes.map((ag) => (
                            <div
                                key={ag.id}
                                className="rounded-xl border border-slate-800 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-950"
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
                                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">{textoR4("Enviado via API")}</span>
                                        )}
                                    </div>
                                    <p className="text-slate-300">
                                        <strong>{ag.data_formatada}</strong> ({ag.hora_inicio}{' ' + textoR4("às")}{' '}
                                        {ag.hora_fim}) • <strong>{textoR4("Prof.:")}</strong> {ag.professor_nome}{' '}
                                        • <strong>{textoR4("Matéria:")}</strong> {ag.materia}
                                    </p>
                                    <p className="text-slate-400">{textoR4("WhatsApp:") + ' '}{formatarTelefone(ag.aluno_telefone)}
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
                                        >{textoR4("Reenviar via API")}</button>
                                    )}

                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
