import { sql } from '@/lib/db';

export interface TextosPortal {
    badge_topo: string;
    titulo_principal: string;
    subtitulo_principal: string;
    horario_secretaria: string;
    aviso_proxima_semana_titulo: string;
    aviso_proxima_semana_texto: string;
    aviso_cancelamento_titulo: string;
    aviso_cancelamento_texto: string;
    aviso_agenda_cancelamento: string;
    aviso_modal_lembrete: string;
    aviso_sistema_fechado: string;
}

export const TEXTOS_PORTAL_PADRAO: TextosPortal = {
    badge_topo: 'R4 Ensina • Central Oficial de Agendamento (100 min)',
    titulo_principal: 'Agende o atendimento do seu filho(a) na R4 Ensina',
    subtitulo_principal:
        'Sistema exclusivo para famílias atendidas pela R4 Ensina. Agendamento online disponível de segunda a sexta, das 18:00 às 22:00, para aulas a partir do próximo dia até domingo desta semana.',
    horario_secretaria: 'Secretaria R4: Seg a Sex, 08h às 18h',
    aviso_proxima_semana_titulo: 'Aulas da Próxima Semana',
    aviso_proxima_semana_texto:
        'Marcações para a próxima semana são realizadas exclusivamente com o atendimento humano da R4 Ensina (segunda a sexta, das 08:00 às 18:00).',
    aviso_cancelamento_titulo: 'Política de Cancelamento e Taxa de Aula',
    aviso_cancelamento_texto:
        'Cancelamentos gratuitos pelo site são permitidos até 2 horas antes do início da aula. Após esse prazo de 2h, o horário já estará reservado ao professor e a taxa referente à aula será cobrada.',
    aviso_agenda_cancelamento:
        'O cancelamento gratuito pelo site fica disponível apenas até 2 horas antes do início da aula. Caso ultrapasse esse limite de 2 horas, a vaga já estará comprometida e a taxa da aula será cobrada normalmente.',
    aviso_modal_lembrete:
        'Lembrete: cancelamentos gratuitos são aceitos até 2h antes do horário marcado; após esse prazo a taxa da aula é cobrada.',
    aviso_sistema_fechado:
        'O agendamento online funciona de segunda a sexta, das 18:00 às 22:00. Para marcar aulas agora ou para a próxima semana, fale com nosso atendimento humano (segunda a sexta, das 08:00 às 18:00).',
};

const CHAVE_TEXTOS_PORTAL = 'portal_textos_json';

export async function obterTextosPortal(): Promise<TextosPortal> {
    try {
        await sql`
      CREATE TABLE IF NOT EXISTS configuracoes_sistema (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL,
        atualizado_em TIMESTAMPTZ DEFAULT now()
      )
    `;

        const rows = (await sql`
      SELECT valor
      FROM configuracoes_sistema
      WHERE chave = ${CHAVE_TEXTOS_PORTAL}
      LIMIT 1
    `) as { valor: string }[];

        if (rows.length === 0 || !rows[0].valor) {
            return { ...TEXTOS_PORTAL_PADRAO };
        }

        const salvo = JSON.parse(rows[0].valor) as Partial<TextosPortal>;
        return {
            ...TEXTOS_PORTAL_PADRAO,
            ...Object.fromEntries(
                Object.entries(salvo).filter(
                    ([, v]) => typeof v === 'string' && v.trim().length > 0
                )
            ),
        };
    } catch (error) {
        console.error('Erro ao ler textos do portal:', error);
        return { ...TEXTOS_PORTAL_PADRAO };
    }
}

export async function salvarTextosPortal(
    parcial: Partial<TextosPortal>
): Promise<TextosPortal> {
    const atual = await obterTextosPortal();
    const mesclado: TextosPortal = { ...atual };

    (Object.keys(TEXTOS_PORTAL_PADRAO) as (keyof TextosPortal)[]).forEach(
        (chave) => {
            if (typeof parcial[chave] === 'string') {
                const limpo = parcial[chave]!.trim();
                mesclado[chave] = limpo || TEXTOS_PORTAL_PADRAO[chave];
            }
        }
    );

    const jsonString = JSON.stringify(mesclado);

    await sql`
    INSERT INTO configuracoes_sistema (chave, valor, atualizado_em)
    VALUES (${CHAVE_TEXTOS_PORTAL}, ${jsonString}, now())
    ON CONFLICT (chave)
    DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()
  `;

    return mesclado;
}