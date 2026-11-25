import { sql } from '@/lib/db';
import {
    TEXTOS_PORTAL_PADRAO,
    TextosPortal,
} from '@/lib/portal-textos-padrao';

export { TEXTOS_PORTAL_PADRAO };
export type { TextosPortal };

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