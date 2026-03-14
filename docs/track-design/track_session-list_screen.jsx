export default function SessionsListScreen() {
  const sessions = [
    {
      track: 'Fuji Speedway',
      layout: 'Full Course',
      date: 'Mar 10, 2026',
      time: '10:24 AM',
      bestLap: '1:48.771',
      laps: 12,
      status: 'Best',
    },
    {
      track: 'Suzuka Circuit',
      layout: 'East Course',
      date: 'Mar 2, 2026',
      time: '2:18 PM',
      bestLap: '58.214',
      laps: 9,
      status: 'Recent',
    },
    {
      track: 'Tsukuba Circuit',
      layout: 'TC2000',
      date: 'Feb 21, 2026',
      time: '8:42 AM',
      bestLap: '1:03.998',
      laps: 15,
      status: 'Saved',
    },
    {
      track: 'Mobility Resort Motegi',
      layout: 'Road Course',
      date: 'Feb 8, 2026',
      time: '11:06 AM',
      bestLap: '2:07.441',
      laps: 11,
      status: 'Wet',
    },
    {
      track: 'Okayama International Circuit',
      layout: 'Full Course',
      date: 'Jan 29, 2026',
      time: '3:51 PM',
      bestLap: '1:56.320',
      laps: 10,
      status: 'Archived',
    },
  ];

  const filters = ['All', 'Recent', 'Best', 'Saved'];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-violet-500/15 via-zinc-900 to-zinc-900">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
            <span>Sessions</span>
            <span>57 Runs</span>
          </div>

          <div className="mb-5">
            <div className="text-zinc-400 text-sm mb-1">Your Track History</div>
            <div className="text-2xl font-semibold tracking-tight">Session Library</div>
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
              <span className="text-sm text-zinc-400">Search by circuit, date, or session type</span>
            </div>

            <div className="flex gap-2 overflow-x-auto pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filters.map((filter, index) => (
                <button
                  key={filter}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm border ${
                    index === 0
                      ? 'bg-violet-500 text-white border-violet-400'
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
          {sessions.map((session) => (
            <button
              key={`${session.track}-${session.date}-${session.time}`}
              className="w-full rounded-3xl bg-white/5 border border-white/10 p-4 text-left transition hover:bg-white/10"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-base font-semibold leading-tight">{session.track}</div>
                  <div className="text-sm text-zinc-400">{session.layout}</div>
                </div>
                <div className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs text-violet-300 border border-violet-400/20">
                  {session.status}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                  <div className="text-xs text-zinc-500 mb-1">Date</div>
                  <div className="text-sm font-medium">{session.date}</div>
                </div>
                <div className="rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                  <div className="text-xs text-zinc-500 mb-1">Start Time</div>
                  <div className="text-sm font-medium">{session.time}</div>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                <div>
                  <div className="text-xs text-zinc-500 mb-1">Best Lap</div>
                  <div className="text-sm font-semibold">{session.bestLap}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-500 mb-1">Laps</div>
                  <div className="text-sm font-semibold">{session.laps}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="px-5 pb-5 pt-1">
          <button className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-white">
            Export Sessions
          </button>
        </div>
      </div>
    </div>
  );
}
