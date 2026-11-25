import { createInterface } from 'node:readline/promises';
import dotenv from 'dotenv';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Locator, type Page } from 'playwright';
import { realizarLogin } from './login-clincare';
import { FORMATO_ALUNOS_CLINCARE, inferirColegioClinCare, inferirSerieClinCare, padronizarColegioClinCare, validarAlunoClinCare, type AlunoClinCare as Aluno, type ResponsavelClinCare as Responsavel } from './importacao-alunos-clincare';

dotenv.config({ path: '.env.local', quiet: true });

type Pendencia = { id: string; motivo: string };

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const rotaAluno = new RegExp('^/painel/pacientes/(' + UUID + ')/?$', 'i');

async function campo(area: Locator, nomes: RegExp) {
    const acessivel = area.getByLabel(nomes).filter({ visible: true }).first();
    if (await acessivel.count()) {
        const valor = await acessivel.evaluate((el) => el instanceof HTMLSelectElement ?
            (el.value ? el.selectedOptions[0]?.textContent || '' : '') :
            el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : '');
        if (valor.trim()) return valor.trim();
    }
    const rotulos = area.getByText(nomes).filter({ visible: true });
    for (const rotulo of await rotulos.all()) {
        const valor = await rotulo.evaluate((el) => {
            const seletor = 'input:not([type="hidden"]):not([type="file"]),textarea,select';
            let linha: Element | null = el;
            for (let i = 0; linha && i < 4; i++, linha = linha.parentElement) {
                const campos = linha.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(seletor);
                if (campos.length === 1) {
                    const campo = campos[0];
                    return campo instanceof HTMLSelectElement ? (campo.value ? campo.selectedOptions[0]?.textContent || '' : '') : campo.value;
                }
            }
            return '';
        });
        if (valor.trim()) return valor.trim();
    }
    return '';
}

function nascimentoISO(valor: string) {
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
    const data = br ? [br[3],br[2],br[1]].join('-') : valor;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return '';
    const instante = Date.parse(data);
    return Number.isFinite(instante) && new Date(instante).toISOString().slice(0,10) === data ? data : '';
}

const rotaCalendarioAluno = new RegExp('^/painel/calendario/(' + UUID + ')/?$', 'i');

function conferirRotaDaFicha(page: Page, base: string, id: string, secao: 'perfil' | 'contatos') {
    const url = new URL(page.url());
    if (url.origin !== base || url.pathname.replace(/\/$/, '').toLowerCase() !== '/painel/pacientes/' + id.toLowerCase() + '/' + secao) {
        throw new Error('O Clin Care abriu uma rota diferente da ficha solicitada.');
    }
}

async function descobrirAlunos(page: Page, base: string, limite: number) {
    await page.goto(base + '/painel/pacientes', { waitUntil: 'domcontentloaded' });
    const seletor = '[href*="/painel/pacientes/"],[data-href*="/painel/pacientes/"],[data-url*="/painel/pacientes/"],[data-patient-id],[data-paciente-id],li div[role="button"] a[title="Abrir calendário do paciente"][href^="/painel/calendario/"]';
    const lerLinks = () => page.locator(seletor).evaluateAll((elementos) => elementos.flatMap((el) => {
        const destino = el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('data-url');
        const id = el.getAttribute('data-patient-id') || el.getAttribute('data-paciente-id');
        return destino ? [new URL(destino, location.origin).href] :
            id ? [location.origin + '/painel/pacientes/' + id] : [];
    }));
    try { await page.locator(seletor).first().waitFor({ timeout: 15000 }); }
    catch {
        if (new URL(page.url()).pathname.replace(/\/$/, '') !== '/painel/pacientes') {
            throw new Error('Após o login, a lista de pacientes não abriu. Confira se a conta tem acesso à aba Pacientes.');
        }
        throw new Error('A página Pacientes abriu, mas os cartões não expuseram links ou IDs reconhecíveis. Teste com --ficha e o link copiado de uma ficha aberta.');
    }
    const ids = new Set<string>();
    let totalEsperado: number | undefined;
    for (let rodada = 0; rodada < 500; rodada++) {
        const antes = ids.size;
        const links = await lerLinks();
        for (const link of links) {
            const url = new URL(link);
            const id = (rotaAluno.exec(url.pathname) ?? rotaCalendarioAluno.exec(url.pathname))?.[1];
            if (id && url.origin === base) ids.add(id.toLowerCase());
        }
        const contagem = (await page.locator('body').innerText()).match(/(?:^|\n)\s*([\d.]+)\s+pacientes\s*(?:$|\n)/im);
        if (contagem) totalEsperado = Math.max(totalEsperado ?? 0, Number(contagem[1].replace(/\./g,'')));
        if ((limite && ids.size >= limite) || (totalEsperado && ids.size >= totalEsperado)) break;
        const proximo = page.locator('button,a').filter({ visible: true }).and(
            page.getByRole('button', { name: /^(pr[oó]xim[ao]( p[aá]gina)?|carregar mais)$/i })
                .or(page.getByRole('link', { name: /^pr[oó]xim[ao]( p[aá]gina)?$/i }))
                .or(page.locator('[rel="next"],[title="Próxima página"],[aria-label="Próxima página"]'))
        ).first();
        await page.locator(seletor).last().scrollIntoViewIfNeeded();
        await page.waitForTimeout(350);
        const quantidade = await page.locator(seletor).count();
        if (quantidade > links.length) continue;
        if (await proximo.count() && await proximo.isEnabled() && await proximo.getAttribute('aria-disabled') !== 'true') {
            if (rodada && ids.size === antes) break;
            await proximo.click();
            const ultimo = links.at(-1);
            await page.waitForFunction(({ seletor, ultimo }) =>
                (() => {
                    const elementos = document.querySelectorAll(seletor);
                    const el = elementos[elementos.length - 1];
                    if (!el) return false;
                    const destino = el.getAttribute('href') || el.getAttribute('data-href') || el.getAttribute('data-url');
                    const id = el.getAttribute('data-patient-id') || el.getAttribute('data-paciente-id');
                    return (destino ? new URL(destino, location.origin).href : location.origin + '/painel/pacientes/' + id) !== ultimo;
                })(),
                { seletor, ultimo }, { timeout: 10000 }).catch(() => undefined);
            continue;
        }
        if (ids.size === antes) break;
    }
    return { ids: [...ids].slice(0,limite || ids.size), totalEsperado };
}

async function lerAluno(page: Page, base: string, id: string, pendencias: Pendencia[], assistido: boolean): Promise<Aluno> {
    const ficha = base + '/painel/pacientes/' + id;
    await page.goto(ficha + '/perfil', { waitUntil: 'domcontentloaded' });
    const corpo = page.locator('body');
    await corpo.getByText(/^Nome\s*:?$/i).filter({ visible: true }).first().waitFor();
    conferirRotaDaFicha(page, base, id, 'perfil');
    const nome_aluno = await campo(corpo, /^Nome(?: completo)?\s*:?$/i);
    if (!nome_aluno) throw new Error('perfil');
    const colegioCampo = await campo(corpo, /^(Col[eé]gio|Escola)\s*:?$/i);
    const colegio = (colegioCampo || inferirColegioClinCare(nome_aluno)).replace(/\s+/g, ' ').trim();
    const colegio_nome = /^(sem (col[eé]gio|escola)|n[aã]o informado|outros?|particular|[-–—])$/i.test(colegio) ? '' : padronizarColegioClinCare(colegio).slice(0,180);
    const serie = inferirSerieClinCare(nome_aluno);
    const nascimento = nascimentoISO(await campo(corpo, /^(?:Data de )?Nascimento\s*:?$/i));
    await page.goto(ficha + '/contatos', { waitUntil: 'domcontentloaded' });
    const titulo = corpo.getByText(/^Respons[aá]veis$/i).filter({ visible: true }).first();
    await titulo.waitFor();
    conferirRotaDaFicha(page, base, id, 'contatos');
    const endereco = await campo(corpo, /^Endere[cç]o\s*:?$/i);
    const secao = titulo.locator('xpath=ancestor::*[descendant::*[contains(normalize-space(.),"Novo responsável") and not(*[contains(normalize-space(.),"Novo responsável")])]][1]');
    const iconeEditar = page.locator('span.material-icons-outlined').filter({ hasText: /^\s*edit\s*$/ });
    const lapis = page.locator('button').filter({ has: iconeEditar, visible: true });
    const lapisComRemover = lapis.and(page.locator('button:has(+ button[aria-label^="Remover" i])'));
    const editaveis = lapisComRemover.or(secao.locator('button').filter({ has: iconeEditar, visible: true })).or(secao.locator('button,a,[role="button"],[tabindex="0"]').filter({visible:true}).and(
        secao.getByRole('button', {name:/^Editar(?: responsável| contato)?$/i})
            .or(secao.getByRole('link', {name:/^Editar(?: responsável| contato)?$/i}))
            .or(secao.locator('[title^="Editar" i],[aria-label^="Editar" i],button:has([class*="pencil"]),a:has([class*="pencil"]),button:has(i.fa-edit),a:has(i.fa-edit),button:has([data-icon="pen"]),button:has([data-icon="edit"]),button:has([class*="edit"]),button:has([class*="pen-to-square"])'))
    ));
    const responsaveis: Responsavel[] = [];
    const total = await editaveis.count();
    if (!total && !assistido) pendencias.push({ id, motivo: 'Nenhum editor de responsável identificado. Confira a ficha.' });
    const terminal = assistido ? createInterface({ input: process.stdin, output: process.stdout }) : null;
    const chaves = new Set<string>();
    try {
        for (let i = 0; terminal || i < total; i++) {
            let principal = false;
            if (terminal) {
                const opcao = (await terminal.question('Abra Editar responsável e expanda Dados adicionais. Digite p (principal), a (adicional) ou f (finalizar ficha): ')).trim().toLowerCase();
                if (opcao === 'f') break;
                if (opcao !== 'p' && opcao !== 'a') continue;
                principal = opcao === 'p';
            } else {
                const editar = editaveis.nth(i);
                principal = await editar.evaluate((el) => {
                    let pai = el.parentElement;
                    for (let nivel = 0; pai && nivel < 5; nivel++, pai = pai.parentElement) {
                        if (Array.from(pai.querySelectorAll('button,a')).some((item) => /Novo responsável/i.test(item.textContent || ''))) break;
                        if (/responsável principal/i.test(pai.innerText)) return true;
                    }
                    return false;
                });
                await editar.click();
            }
            const tituloModal = page.getByText(/^(Editar|Alterar) respons[aá]vel\s*:?$/i).filter({ visible: true }).first();
            const janela = page.getByRole('dialog').filter({ visible: true }).first()
                .or(tituloModal.locator('xpath=ancestor::*[.//input][1]')).first();
            try { await janela.waitFor(); }
            catch (e) {
                if (!terminal) throw e;
                console.log('Editor não identificado. Abra o formulário de edição e tente novamente.');
                continue;
            }
            const extra = janela.locator('details:not([open]) > summary')
                .filter({ hasText: /Dados adicionais/i, visible: true }).first();
            if (await extra.count()) await extra.click();
            const nome = await campo(janela, /^Nome(?: completo)?\s*:?$/i);
            const telefone = await campo(janela, /^(Telefone|WhatsApp)\s*:?$/i);
            const email = await campo(janela, /^E-?mail\s*:?$/i);
            const cpf = (await campo(janela, /^CPF\s*:?$/i)).replace(/\D/g,'');
            const chave = JSON.stringify([nome,telefone,email,cpf]);
            if (nome && !chaves.has(chave)) {
                chaves.add(chave);
                responsaveis.push({ nome, telefone, email, cpf: cpf.length === 11 ? cpf : '', principal });
                if (terminal) console.log(cpf.length === 11 ? 'Responsável coletado com CPF.' : 'Responsável coletado sem CPF completo.');
            }
            if (!nome || cpf.length !== 11) pendencias.push({ id, motivo: 'Responsável ' + (i + 1) + ' com nome ou CPF ausente/incompleto.' });
            if (terminal) {
                await terminal.question('Feche o editor com Cancelar, sem salvar, e pressione Enter: ');
                continue;
            }
            const cancelar = janela.getByRole('button', { name: /^(cancelar|fechar)$/i }).first();
            if (await cancelar.count()) await cancelar.click();
            else await page.keyboard.press('Escape');
            await janela.waitFor({ state: 'hidden' });
        }
    } finally { terminal?.close(); }
    if (assistido && !responsaveis.length) pendencias.push({ id, motivo: 'Nenhum responsável coletado no modo assistido.' });
    if (!nascimento) pendencias.push({ id, motivo: 'Nascimento ausente ou fora do formato esperado.' });
    if (!endereco) pendencias.push({ id, motivo: 'Endereço ausente ou campo não identificado.' });
    return { clin_care_aluno_id: id, nome_aluno, nascimento, endereco, responsaveis, colegio_nome, serie };
}

async function main() {
    const argumentos = process.argv.slice(2);
    const assistido = argumentos.includes('--assistido');
    if (assistido && !process.stdin.isTTY) throw new Error('Use --assistido diretamente no terminal interativo.');
    const argumento = argumentos.find((item) => item.startsWith('--limite='));
    const limite = argumento ? Number(argumento.split('=')[1]) : 0;
    if (argumento && (!Number.isSafeInteger(limite) || limite < 1)) throw new Error('Use --limite=3 para uma amostra.');
    const base = new URL(process.env.CLINCARE_URL || 'https://app.clin.care').origin;
    if (base !== 'https://app.clin.care') throw new Error('Confira se CLINCARE_URL aponta para https://app.clin.care.');
    const referencias = argumentos.filter((arg) => arg.startsWith('--ficha=')).map((arg) => arg.slice('--ficha='.length));
    const lista = argumentos.find((arg) => arg.startsWith('--lista='));
    if (lista) referencias.push(...(await readFile(lista.slice('--lista='.length), 'utf8'))
        .replace(/^\uFEFF/, '').split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean));
    const idsInformados = new Set<string>();
    for (const referencia of referencias) {
        let url: URL;
        try { url = new URL(referencia, base); }
        catch { throw new Error('Informe um link válido de uma ficha do Clin Care.'); }
        const id = rotaAluno.exec(url.pathname.replace(/\/(perfil|contatos)\/?$/i, ''))?.[1];
        if (url.origin !== base || !id) throw new Error('Use links de fichas do Clin Care, um por linha no arquivo de lista.');
        idsInformados.add(id.toLowerCase());
    }
    if (lista && !idsInformados.size) throw new Error('A lista de fichas está vazia.');
    const email = process.env.CLINCARE_EMAIL?.trim();
    const senha = process.env.CLINCARE_PASSWORD;
    if (!email || !senha) throw new Error('Configure CLINCARE_EMAIL e CLINCARE_PASSWORD no .env.local.');
    const pasta = '.exportacoes-clincare';
    await mkdir(pasta, { recursive: true, mode: 0o700 });
    const arquivo = join(pasta, 'alunos-' + new Date().toISOString().replace(/[:.]/g,'-') + '.json');
    const browser = await chromium.launch({ headless: !assistido && !argumentos.includes('--visivel') });
    try {
        const contexto = await browser.newContext({ locale: 'pt-BR', timezoneId: 'America/Bahia' });
        const page = await contexto.newPage();
        page.setDefaultTimeout(8000);
        try { await realizarLogin(page, base, email, senha, true); }
        catch { throw new Error('Falha no login. Confira as credenciais e o acesso da conta.'); }
        const { ids, totalEsperado } = idsInformados.size
            ? { ids: [...idsInformados].slice(0, limite || idsInformados.size), totalEsperado: undefined }
            : await descobrirAlunos(page, base, limite);
        if (!ids.length) throw new Error('Nenhum link de ficha com ID permanente foi localizado.');
        const pendencias: Pendencia[] = [];
        const alunos: Aluno[] = [];
        let fichasComFalha = 0;
        async function gravar(parcial: boolean) {
            const temporario = arquivo + '.tmp';
            await writeFile(temporario, JSON.stringify({ formato: FORMATO_ALUNOS_CLINCARE, parcial, totalEsperado, alunos, pendencias },null,2),
                { encoding: 'utf8', mode: 0o600, flag: 'wx' });
            await rename(temporario, arquivo);
        }
        await gravar(true);
        console.log('Progresso salvo em: ' + arquivo);
        for (let i = 0; i < ids.length; i++) {
            try {
                const aluno = await lerAluno(page,base,ids[i],pendencias,assistido);
                if (!validarAlunoClinCare(aluno)) throw new Error('Dados da ficha fora do formato.');
                alunos.push(aluno);
            } catch {
                fichasComFalha++;
                pendencias.push({ id: ids[i], motivo: 'Ficha incompleta. Confira a navegação em Perfil e Contatos.' });
            }
            if ((i + 1) % 10 === 0 || i + 1 === ids.length) {
                await gravar(true);
                console.log('Fichas processadas: ' + (i + 1) + '/' + ids.length);
            }
        }
        if (!limite && totalEsperado && ids.length < totalEsperado) pendencias.push({
            id: '', motivo: 'A lista informa ' + totalEsperado + ' pacientes, mas só ' + ids.length + ' links foram encontrados.',
        });
        const parcial = Boolean(limite || fichasComFalha || !totalEsperado || ids.length < totalEsperado);
        await gravar(parcial);
        console.log(alunos.length + ' fichas exportadas, ' + pendencias.length + ' pendências. Arquivo: ' + arquivo);
        if (parcial) console.log('Coleta parcial ou cobertura total não confirmada. Confira a contagem antes da importação.');
    } finally { await browser.close(); }
}

main().catch((erro: unknown) => {
    console.error(erro instanceof Error && !/locator\.|page\.|browserType\./.test(erro.message)
        ? erro.message : 'Falha ao abrir ou ler o Clin Care. Confira a instalação do Chromium e a interface.');
    process.exitCode = 1;
});
