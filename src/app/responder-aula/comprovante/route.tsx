import { createHash } from 'node:crypto';
import { ImageResponse } from 'next/og';
import { sql } from '@/lib/db';

export async function POST(req: Request) {
    const dados = await req.json().catch(() => null);
    const token = dados?.token;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
        return Response.json({ mensagem: 'Código inválido.' }, { status: 400 });
    }
    const [aula] = await sql`
        SELECT coalesce(nullif(a.aluno_nome,''),a.nome_aluno,'Aluno') AS aluno, p.nome AS professor,
            u.nome AS unidade, a.materia, to_char(a.data,'DD/MM/YYYY') AS dia,
            to_char(coalesce(a.hora_inicio,a.horario),'HH24:MI') AS inicio,
            to_char(a.hora_fim,'HH24:MI') AS fim
        FROM agendamentos a
        LEFT JOIN professores p ON p.id = a.professor_id
        LEFT JOIN unidades u ON u.id = a.unidade_id
        WHERE a.resposta_whatsapp_hash = ${createHash('sha256').update(token).digest('hex')}
            AND a.status = 'confirmado' AND a.excluido_em IS NULL
            AND ((a.data + coalesce(a.hora_inicio,a.horario)) AT TIME ZONE 'America/Bahia') > now()
    `;
    if (!aula) return Response.json({ mensagem: 'Comprovante indisponível.' }, { status: 404 });
    const campos = [
        ['Professor', aula.professor], ['Unidade', aula.unidade], ['Data', aula.dia],
        ['Horário', [aula.inicio, aula.fim].filter(Boolean).join(' – ')], ['Matéria', aula.materia],
    ];
    return new ImageResponse(
        <div style={{display:'flex', flexDirection:'column', width:'100%', height:'100%', padding:36, background:'#f1f5f9', color:'#0f172a'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{fontSize:23, color:'#075985', fontWeight:700}}>R4 ENSINA · Comprovante da aula</div>
                <div style={{background:'#d1fae5', color:'#065f46', padding:'8px 16px', borderRadius:20, fontSize:20}}>Confirmado</div>
            </div>
            <div style={{display:'flex', fontSize:35, fontWeight:700, margin:'18px 0'}}>{String(aula.aluno).slice(0,120)}</div>
            <div style={{display:'flex', flexWrap:'wrap', border:'1px solid #cbd5e1', borderRadius:20, background:'#fff', padding:12}}>
                {campos.map(([rotulo, valor]) => <div key={rotulo} style={{display:'flex', flexDirection:'column', width:'50%', padding:14}}>
                    <div style={{fontSize:18, color:'#475569'}}>{rotulo}</div>
                    <div style={{fontSize:23, fontWeight:700}}>{String(valor || '—').slice(0,100)}</div>
                </div>)}
            </div>
        </div>,
        { width: 820, height: 520, headers: { 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="comprovante-r4.png"' } },
    );
}
