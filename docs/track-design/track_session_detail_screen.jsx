export default function SessionDetailScreen() {
  const sectors = [
    { label: 'S1', value: '31.842', status: 'Best' },
    { label: 'S2', value: '41.317', status: 'Best' },
    { label: 'S3', value: '34.511', status: 'Best' },
  ];

  const laps = [
    { lap: 1, time: '1:54.238', delta: '+0.82', status: 'Warm-up' },
    { lap: 2, time: '1:49.914', delta: '-4.32', status: 'Push' },
    { lap: 3, time: '1:48.771', delta: '-1.14', status: 'Best Lap' },
    { lap: 4, time: '1:49.102', delta: '+0.33', status: 'Cool Down' },
  ];

  const metrics = [
    { label: 'Top Speed', value: '214 km/h' },
    { label: 'Duration', value: '18:42' },
    { label: 'Total Laps', value: '12' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-violet-500/15 via-zinc-900 to-zinc-900">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
            <span>Session Details</span>
            <span>Fuji Speedway</span>
          </div>

          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="text-zinc-400 text-sm">Recorded Session</div>
              <div className="text-2xl font-semibold tracking-tight">Track Day · Session 2</div>
              <div className="text-sm text-zinc-400 mt-1">Mar 10, 2026 · 10:24 AM</div>
            </div>
            <div className="rounded-full bg-violet-500/15 px-3 py-1.5 text-sm text-violet-300 border border-violet-400/20">
              Best Run
            </div>
          </div>

          <div className="rounded-3xl bg-black/40 border border-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3 text-sm text-zinc-400">
              <span>Circuit View</span>
              <span>Record Line</span>
            </div>

            <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-4 mb-3">
              <svg viewBox="0 0 320 200" className="w-full h-40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M41 111C44 80 66 58 98 54C130 50 149 66 170 68C195 70 213 44 247 46C283 48 298 72 294 100C290 129 261 139 235 140C207 141 193 128 170 128C143 128 126 150 93 148C58 146 38 132 41 111Z"
                  stroke="rgba(255,255,255,0.22)"
                  strokeWidth="18"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M41 111C44 80 66 58 98 54C130 50 149 66 170 68C195 70 213 44 247 46C283 48 298 72 294 100C290 129 261 139 235 140C207 141 193 128 170 128C143 128 126 150 93 148C58 146 38 132 41 111Z"
                  stroke="white"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M247 50C266 56 279 69 281 89C283 108 272 122 255 129C238 136 220 135 202 129C188 124 176 118 163 117C145 116 130 123 117 132C104 141 89 145 73 142"
                  stroke="#8b5cf6"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="0 0"
                />
                <line x1="244" y1="34" x2="244" y2="63" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
                <circle cx="244" cy="48" r="7" fill="#22c55e" />
                <circle cx="117" cy="132" r="6" fill="#8b5cf6" />
              </svg>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {sectors.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl p-3 border bg-violet-500/10 border-violet-400/20"
                >
                  <div className="text-xs text-zinc-400 mb-1">{item.label}</div>
                  <div className="text-lg font-medium">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 mt-3">
              <span>Green = start / finish</span>
              <span>Purple = fastest line</span>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {metrics.map((item) => (
              <div key={item.label} className="rounded-2xl bg-white/5 border border-white/10 p-3">
                <div className="text-xs text-zinc-400 mb-1">{item.label}</div>
                <div className="text-lg font-semibold">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium">Session Insights</div>
                <div className="text-xs text-zinc-400">Quick performance summary</div>
              </div>
              <div className="text-violet-300 text-sm">+1.2s vs last</div>
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
                  <div className="h-full w-[88%] rounded-full bg-violet-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Lap Breakdown</div>
              <button className="text-xs text-zinc-400">Compare</button>
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
              Export Data
            </button>
            <button className="rounded-2xl bg-violet-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30">
              View Replay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
