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
