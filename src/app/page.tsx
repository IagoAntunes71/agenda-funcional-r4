import FluxoAgendamento from '@/components/agendamento/FluxoAgendamento';

export default function HomePage() {
  return (
      <main className="min-h-dvh bg-slate-950 text-slate-100 py-6 sm:py-10 px-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <header className="border-b border-slate-800/80 pb-5">
            <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
              Fins de Semana e Feriados
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Agendamento de Aulas de Reforço
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Escolha a unidade, a matéria, o professor e o horário disponível para reservar a aula.
            </p>
          </header>

          <FluxoAgendamento />
        </div>
      </main>
  );
}