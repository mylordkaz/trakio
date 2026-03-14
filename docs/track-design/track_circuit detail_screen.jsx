export default function CircuitDetailScreen() {
  const stats = [
    { label: 'Length', value: '4.563 km' },
    { label: 'Corners', value: '16' },
    { label: 'Direction', value: 'Clockwise' },
  ];

  const sectors = [
    { label: 'Sector 1', value: '1.42 km' },
    { label: 'Sector 2', value: '1.68 km' },
    { label: 'Sector 3', value: '1.46 km' },
  ];

  const notes = [
    'Long main straight with heavy braking into Turn 1',
    'Technical middle sector with quick direction changes',
    'Final sector rewards clean exits and throttle control',
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-sky-500/15 via-zinc-900 to-zinc-900">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
            <button className="text-zinc-400">Back</button>
            <span>Track Details</span>
          </div>

          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="text-zinc-400 text-sm">Circuit Profile</div>
              <div className="text-2xl font-semibold tracking-tight">Fuji Speedway</div>
              <div className="text-sm text-zinc-400 mt-1">Shizuoka, Japan</div>
            </div>
            <div className="rounded-full bg-sky-500/15 px-3 py-1.5 text-sm text-sky-300 border border-sky-400/20">
              FIA Grade 1
            </div>
          </div>

          <div className="rounded-3xl bg-black/40 border border-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3 text-sm text-zinc-400">
              <span>Track Layout</span>
              <span>Full Course</span>
            </div>

            <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-5 mb-3">
              <svg viewBox="0 0 320 180" className="w-full h-36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M36 101C38 76 59 57 90 54C122 50 142 67 164 68C188 69 206 46 240 47C276 48 292 70 288 96C284 120 258 129 232 130C206 131 191 120 168 120C141 120 123 142 91 140C57 138 33 126 36 101Z"
                  stroke="white"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="249" cy="48" r="6" fill="#22c55e" />
                <circle cx="89" cy="140" r="5" fill="#38bdf8" />
              </svg>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Start / Finish</span>
              <span>Pit Entry at final corner</span>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {stats.map((item) => (
              <div key={item.label} className="rounded-2xl bg-white/5 border border-white/10 p-3">
                <div className="text-xs text-zinc-400 mb-1">{item.label}</div>
                <div className="text-sm font-semibold">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium">Sector Breakdown</div>
                <div className="text-xs text-zinc-400">Distance split across the lap</div>
              </div>
              <button className="text-xs text-zinc-400">Compare</button>
            </div>

            <div className="space-y-2">
              {sectors.map((item, index) => (
                <div
                  key={item.label}
                  className={`flex items-center justify-between rounded-2xl px-3 py-2.5 border ${
                    index === 0
                      ? 'bg-sky-500/10 border-sky-400/20'
                      : 'bg-black/20 border-white/5'
                  }`}
                >
                  <span className="text-sm">{item.label}</span>
                  <span className="text-sm font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium">Driver Notes</div>
                <div className="text-xs text-zinc-400">Quick reference before the session</div>
              </div>
              <button className="text-xs text-zinc-400">Edit</button>
            </div>

            <div className="space-y-2">
              {notes.map((note) => (
                <div
                  key={note}
                  className="rounded-2xl bg-black/20 px-3 py-2.5 border border-white/5 text-sm text-zinc-200"
                >
                  {note}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <button className="rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-white">
              View History
            </button>
            <button className="rounded-2xl bg-sky-500 py-3.5 text-sm font-semibold text-black shadow-lg shadow-sky-500/30">
              Start Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
