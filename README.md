This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Atualização para a agenda nativa do R4

1. Faça um backup do banco atual e teste a atualização em uma cópia do banco.
2. Antes de publicar o código, execute `migrations/001-agenda-nativa.sql` no banco PostgreSQL usado pelo R4, pelo editor SQL do Neon ou com `psql -v ON_ERROR_STOP=1 -f migrations/001-agenda-nativa.sql`, usando a conexão do ambiente de destino.
3. Aponte `DATABASE_URL` para o banco migrado e suba a aplicação. Para homologar, use `npm run dev` e confirme criação, remarcação e cancelamento com um aluno de teste no Portal. Confira a mesma aula no Mapa do Dia, na Recepção e no resumo semanal.
4. Revise se o GitHub mostra apenas execução manual para os quatro workflows históricos. Deixe o robô histórico fora da operação diária.

A migração preserva os históricos, converte o agrupamento de professores entre unidades em uma chave interna e copia apenas os bloqueios manuais para a agenda nativa. Os registros externos anteriores permanecem no banco de origem. A aplicação continua usando o WhatsApp configurado para notificações e verificação do Portal.

A remarcação altera a aula existente após validar a titularidade, o prazo e o novo horário. A agenda original é liberada quando a transação confirma o novo horário. Abas administrativas abertas em primeiro plano atualizam os dados a cada cinco segundos.

Mantenha o `.env.local` original e as exportações históricas em armazenamento privado. Os scripts antigos estão arquivados e excluídos da compilação da aplicação.

## Modalidade online por unidade e resposta por WhatsApp

Aplique `migrations/002-modalidade-e-confirmacao.sql` no Neon antes de publicar esta versão. Ela pressupõe a migração 001. As cinco unidades derivadas usam o cadastro de professores da unidade presencial de origem.

Configure `R4_URL_PUBLICA` no servidor com a URL pública HTTPS do Portal se o endereço de produção detectado pelo Vercel não for o endereço desejado. O WhatsApp precisa estar ativo e o provedor configurado para mensagens individuais. Para webhook, valide os eventos `aula_agendada`, `responder_aula` e `aula_confirmada`, com o destino em `telefone`. O link recebido pelo responsável abre as ações no R4.

## Lembretes e cancelamentos via DataCrazy

1. Aplique `migrations/005-whatsapp-aulas.sql` antes de publicar os arquivos da etapa 3.
2. Configure no DataCrazy a automação do evento `lembrete_aula`. O destino está em `telefone`, os detalhes em `agendamento` e a chave de deduplicação em `lembreteId`. Configure `R4_DATACRAZY_LEMBRETE_URL` se a automação tiver um webhook próprio. Sem essa variável, a Agenda usa o webhook principal configurado no painel.
3. Aponte um agendador para `GET /api/interno/lembretes-whatsapp` a cada 5 minutos com `Authorization: Bearer <CRON_SECRET>`. A Agenda busca aulas entre 23 e 24 horas à frente, com um disparo automático por versão da aula. Desative o lembrete antigo de 24 horas no DataCrazy ao ativar este agendamento.
4. Para exibir **Entregue**, configure `R4_DATACRAZY_RETORNO_SECRET` no servidor e envie `POST /api/interno/lembretes-whatsapp` com `Authorization: Bearer <R4_DATACRAZY_RETORNO_SECRET>` e JSON `{"lembreteId":"<id recebido no envio>","status":"entregue"}` quando o CRM confirmar a entrega. Resposta HTTP de sucesso ao disparo significa **Enviado ao CRM**.
5. Os botões existentes continuam chamando `POST /responder-aula`. O retorno de cancelamento mantém `status: "cancelado"` para compatibilidade e traz a classificação em `statusAplicado`. Use `mensagem` na resposta automática e informe no botão ou na mensagem que cancelamentos abaixo do prazo têm cobrança. O comprovante continua em `POST /responder-aula/comprovante`.

O limite exato fica reservado à secretaria até a definição da regra. Em homologação, teste cancelamento antes e depois do prazo, clique repetido, comprovante da confirmação e clique em mensagem anterior à remarcação. Para lembretes, use um contato de teste e confira os estados no detalhe da aula e o disparo no histórico. Uma tentativa de resultado desconhecido permanece registrada sem reenvio automático, pois o CRM pode ter recebido a solicitação.
