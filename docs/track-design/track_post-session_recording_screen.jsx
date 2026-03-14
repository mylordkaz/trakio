export default function TrackSessionPostSessionScreen() {
  const laps = [
    { lap: 1, time: '1:54.238', delta: '+0.82', status: 'Warm-up' },
    { lap: 2, time: '1:49.914', delta: '-4.32', status: 'Push' },
    { lap: 3, time: '1:48.771', delta: '-1.14', status: 'Best Lap' },
    { lap: 4, time: '1:49.102', delta: '+0.33', status: 'Cool Down' },
  ];

  const highlights = [
    { label: 'Best S1', time: '31.842' },
    { label: 'Best S2', time: '41.317' },
    { label: 'Best S3', time: '34.511' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-emerald-500/15 via-zinc-900 to-zinc-900">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
            <span>Fuji Speedway</span>
            <span>12:41 PM</span>
          </div>

          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="text-zinc-400 text-sm">Session Complete</div>
              <div className="text-2xl font-semibold tracking-tight">Track Day · Session 2</div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-400 border border-emerald-400/20">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              SAVED
            </div>
          </div>

          <div className="rounded-3xl bg-black/40 border border-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2 text-sm text-zinc-400">
              <span>Best Lap</span>
              <span>Lap 3</span>
            </div>
            <div className="text-6xl leading-none font-semibold tracking-tight mb-3">1:48.771</div>
            <div className="grid grid-cols-3 gap-2">
              {highlights.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl p-3 border bg-emerald-500/10 border-emerald-400/30"
                >
                  <div className="text-xs text-zinc-400 mb-1">{item.label}</div>
                  <div className="text-lg font-medium">{item.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs text-zinc-400 mb-1">Top Speed</div>
              <div className="text-lg font-semibold">214 km/h</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs text-zinc-400 mb-1">Duration</div>
              <div className="text-lg font-semibold">18:42</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs text-zinc-400 mb-1">Total Laps</div>
              <div className="text-lg font-semibold">4</div>
            </div>
          </div>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium">Session Overview</div>
                <div className="text-xs text-zinc-400">Performance summary from this run</div>
              </div>
              <div className="text-emerald-400 text-sm">Personal Best</div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Consistency</span>
                  <span>91%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[91%] rounded-full bg-white" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Throttle Avg</span>
                  <span>76%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[76%] rounded-full bg-white" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Braking Efficiency</span>
                  <span>88%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[88%] rounded-full bg-emerald-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Lap Breakdown</div>
              <button className="text-xs text-zinc-400">Export</button>
            </div>
            <div className="space-y-2">
              {laps.map((item) => (
                <div key={item.lap} className="flex items-center justify-between rounded-2xl bg-black/20 px-3 py-2.5 border border-white/5">
                  <div>
                    <div className="text-sm font-medium">Lap {item.lap}</div>
                    <div className="text-xs text-zinc-500">{item.status}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{item.time}</div>
                    <div className={`text-xs ${item.delta.startsWith('-') ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {item.delta}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <button className="rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-white">
              Save Notes
            </button>
            <button className="rounded-2xl bg-emerald-500 py-3.5 text-sm font-semibold text-black shadow-lg shadow-emerald-500/30">
              New Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
