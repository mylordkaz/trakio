export default function TrackSessionRecordingScreen() {
  const laps = [
    { lap: 1, time: '1:54.238', delta: '+0.82', status: 'Warm-up' },
    { lap: 2, time: '1:49.914', delta: '-4.32', status: 'Push' },
    { lap: 3, time: '1:48.771', delta: '-1.14', status: 'Best' },
    { lap: 4, time: '1:49.102', delta: '+0.33', status: 'Cool' },
  ];

  const sectors = [
    { label: 'S1', time: '32.184', active: true },
    { label: 'S2', time: '41.902', active: false },
    { label: 'S3', time: '34.685', active: false },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-red-500/15 via-zinc-900 to-zinc-900">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
            <span>Fuji Speedway</span>
            <span>12:18 PM</span>
          </div>

          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="text-zinc-400 text-sm">Session Recording</div>
              <div className="text-2xl font-semibold tracking-tight">Track Day · Session 2</div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1.5 text-sm text-red-400 border border-red-400/20">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400 animate-pulse" />
              REC
            </div>
          </div>

          <div className="rounded-3xl bg-black/40 border border-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2 text-sm text-zinc-400">
              <span>Current Lap</span>
              <span>Lap 5</span>
            </div>
            <div className="text-6xl leading-none font-semibold tracking-tight mb-3">1:12.48</div>
            <div className="grid grid-cols-3 gap-2">
              {sectors.map((sector) => (
                <div
                  key={sector.label}
                  className={`rounded-2xl p-3 border ${sector.active ? 'bg-red-500/10 border-red-400/30' : 'bg-white/5 border-white/10'}`}
                >
                  <div className="text-xs text-zinc-400 mb-1">{sector.label}</div>
                  <div className="text-lg font-medium">{sector.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs text-zinc-400 mb-1">Best Lap</div>
              <div className="text-lg font-semibold">1:48.771</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs text-zinc-400 mb-1">Top Speed</div>
              <div className="text-lg font-semibold">214 km/h</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs text-zinc-400 mb-1">Duration</div>
              <div className="text-lg font-semibold">18:42</div>
            </div>
          </div>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium">Live Telemetry</div>
                <div className="text-xs text-zinc-400">GPS and lap timing active</div>
              </div>
              <div className="text-emerald-400 text-sm">Stable</div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Throttle</span>
                  <span>78%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[78%] rounded-full bg-white" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Brake</span>
                  <span>12%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[12%] rounded-full bg-white" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>GPS Signal</span>
                  <span>Strong</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[92%] rounded-full bg-emerald-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Recent Laps</div>
              <button className="text-xs text-zinc-400">View all</button>
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
                    <div className={`text-xs ${item.delta.startsWith('-') ? 'text-emerald-400' : 'text-zinc-500'}`}>{item.delta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <button className="rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium">Mark Pit In</button>
            <button className="rounded-2xl bg-red-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-red-500/30">End Session</button>
          </div>
        </div>
      </div>
    </div>
  );
}
