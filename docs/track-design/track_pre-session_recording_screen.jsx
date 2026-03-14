export default function PreSessionScreen() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-emerald-500/15 via-zinc-900 to-zinc-900">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
            <span>Fuji Speedway</span>
            <span>12:12 PM</span>
          </div>

          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="text-zinc-400 text-sm">Pre-Session Setup</div>
              <div className="text-2xl font-semibold tracking-tight">Track Day · Session 2</div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-400 border border-emerald-400/20">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              READY
            </div>
          </div>

          <div className="rounded-3xl bg-black/40 border border-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2 text-sm text-zinc-400">
              <span>Selected Vehicle</span>
              <span>Track Mode</span>
            </div>
            <div className="text-3xl leading-none font-semibold tracking-tight mb-3">GR86 Track Build</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl p-3 border bg-emerald-500/10 border-emerald-400/30">
                <div className="text-xs text-zinc-400 mb-1">GPS</div>
                <div className="text-lg font-medium">Strong</div>
              </div>
              <div className="rounded-2xl p-3 border bg-white/5 border-white/10">
                <div className="text-xs text-zinc-400 mb-1">Satellites</div>
                <div className="text-lg font-medium">18</div>
              </div>
              <div className="rounded-2xl p-3 border bg-white/5 border-white/10">
                <div className="text-xs text-zinc-400 mb-1">Battery</div>
                <div className="text-lg font-medium">92%</div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs text-zinc-400 mb-1">Track Temp</div>
              <div className="text-lg font-semibold">28°C</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs text-zinc-400 mb-1">Air Temp</div>
              <div className="text-lg font-semibold">24°C</div>
            </div>
          </div>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium">Session Checklist</div>
                <div className="text-xs text-zinc-400">All systems verified before recording</div>
              </div>
              <div className="text-emerald-400 text-sm">4/4 Ready</div>
            </div>

            <div className="space-y-2">
              {[
                'Start/finish line detected',
                'GPS lock confirmed',
                'Vehicle profile selected',
                'Storage available for session',
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center justify-between rounded-2xl bg-black/20 px-3 py-2.5 border border-white/5"
                >
                  <span className="text-sm">{item}</span>
                  <span className="text-emerald-400 text-sm font-medium">OK</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium">Session Config</div>
                <div className="text-xs text-zinc-400">Current setup for this run</div>
              </div>
              <button className="text-xs text-zinc-400">Edit</button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Timing Mode</span>
                <span className="font-medium">Auto Lap</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Units</span>
                <span className="font-medium">km/h</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Data Capture</span>
                <span className="font-medium">GPS + Speed</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <button className="rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-white">
              Back
            </button>
            <button className="rounded-2xl bg-emerald-500 py-3.5 text-sm font-semibold text-black shadow-lg shadow-emerald-500/30">
              Start Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
