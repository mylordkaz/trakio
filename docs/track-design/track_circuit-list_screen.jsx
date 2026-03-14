export default function CircuitsListScreen() {
  const circuits = [
    {
      name: 'Fuji Speedway',
      country: 'Japan',
      length: '4.563 km',
      corners: 16,
      status: 'Recent',
    },
    {
      name: 'Suzuka Circuit',
      country: 'Japan',
      length: '5.807 km',
      corners: 18,
      status: 'Popular',
    },
    {
      name: 'Tsukuba Circuit',
      country: 'Japan',
      length: '2.045 km',
      corners: 8,
      status: 'Nearby',
    },
    {
      name: 'Mobility Resort Motegi',
      country: 'Japan',
      length: '4.801 km',
      corners: 14,
      status: 'Saved',
    },
    {
      name: 'Okayama International Circuit',
      country: 'Japan',
      length: '3.703 km',
      corners: 13,
      status: 'New',
    },
  ];

  const filters = ['All', 'Recent', 'Popular', 'Saved'];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-sky-500/15 via-zinc-900 to-zinc-900">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
            <span>Circuits</span>
            <span>128 Tracks</span>
          </div>

          <div className="mb-5">
            <div className="text-zinc-400 text-sm mb-1">Choose a Circuit</div>
            <div className="text-2xl font-semibold tracking-tight">Track Database</div>
          </div>

          <div className="rounded-3xl bg-black/40 border border-white/10 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                className="h-4 w-4 text-zinc-400"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
                <circle cx="11" cy="11" r="6" />
              </svg>
              <span className="text-sm text-zinc-400">Search circuits, country, or layout</span>
            </div>

            <div className="flex gap-2 overflow-x-auto pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filters.map((filter, index) => (
                <button
                  key={filter}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm border ${
                    index === 0
                      ? 'bg-sky-500 text-black border-sky-400'
                      : 'bg-white/5 text-zinc-300 border-white/10'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {circuits.map((circuit) => (
            <button
              key={circuit.name}
              className="w-full rounded-3xl bg-white/5 border border-white/10 p-4 text-left transition hover:bg-white/10"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-base font-semibold leading-tight">{circuit.name}</div>
                  <div className="text-sm text-zinc-400">{circuit.country}</div>
                </div>
                <div className="rounded-full bg-sky-500/15 px-2.5 py-1 text-xs text-sky-300 border border-sky-400/20">
                  {circuit.status}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                  <div className="text-xs text-zinc-500 mb-1">Length</div>
                  <div className="text-sm font-medium">{circuit.length}</div>
                </div>
                <div className="rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                  <div className="text-xs text-zinc-500 mb-1">Corners</div>
                  <div className="text-sm font-medium">{circuit.corners}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="px-5 pb-5 pt-1">
          <button className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-white">
            Import Custom Circuit
          </button>
        </div>
      </div>
    </div>
  );
}
