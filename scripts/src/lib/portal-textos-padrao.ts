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