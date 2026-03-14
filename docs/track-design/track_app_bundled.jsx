import { useState } from "react";

// ─── Data ───────────────────────────────────────────────────────────────────

const SESSIONS = [
  { track: "Fuji Speedway", layout: "Full Course", date: "Mar 10, 2026", time: "10:24 AM", bestLap: "1:48.771", laps: 12, status: "Best" },
  { track: "Suzuka Circuit", layout: "East Course", date: "Mar 2, 2026", time: "2:18 PM", bestLap: "58.214", laps: 9, status: "Recent" },
  { track: "Tsukuba Circuit", layout: "TC2000", date: "Feb 21, 2026", time: "8:42 AM", bestLap: "1:03.998", laps: 15, status: "Saved" },
  { track: "Mobility Resort Motegi", layout: "Road Course", date: "Feb 8, 2026", time: "11:06 AM", bestLap: "2:07.441", laps: 11, status: "Wet" },
  { track: "Okayama International Circuit", layout: "Full Course", date: "Jan 29, 2026", time: "3:51 PM", bestLap: "1:56.320", laps: 10, status: "Archived" },
];

const CIRCUITS = [
  { name: "Fuji Speedway", country: "Japan", length: "4.563 km", corners: 16, status: "Recent" },
  { name: "Suzuka Circuit", country: "Japan", length: "5.807 km", corners: 18, status: "Popular" },
  { name: "Tsukuba Circuit", country: "Japan", length: "2.045 km", corners: 8, status: "Nearby" },
  { name: "Mobility Resort Motegi", country: "Japan", length: "4.801 km", corners: 14, status: "Saved" },
  { name: "Okayama International Circuit", country: "Japan", length: "3.703 km", corners: 13, status: "New" },
];

const LAP_DATA = [
  { lap: 1, time: "1:54.238", delta: "+0.82", status: "Warm-up" },
  { lap: 2, time: "1:49.914", delta: "-4.32", status: "Push" },
  { lap: 3, time: "1:48.771", delta: "-1.14", status: "Best Lap" },
  { lap: 4, time: "1:49.102", delta: "+0.33", status: "Cool Down" },
];

const SECTOR_HIGHLIGHTS = [
  { label: "Best S1", time: "31.842" },
  { label: "Best S2", time: "41.317" },
  { label: "Best S3", time: "34.511" },
];

// ─── Shared primitives ───────────────────────────────────────────────────────

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-3xl bg-white/5 border border-white/10 p-4 ${className}`}>
      {children}
    </div>
  );
}

function MetricTile({ label, value, accent }) {
  return (
    <div className={`rounded-2xl border p-3 ${accent ? "bg-violet-500/10 border-violet-400/20" : "bg-white/5 border-white/10"}`}>
      <div className="text-xs text-zinc-400 mb-1">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function ProgressBar({ label, value, color = "bg-white" }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-400 mb-1">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: value }} />
      </div>
    </div>
  );
}

function LapRow({ item }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-black/20 px-3 py-2.5 border border-white/5">
      <div>
        <div className="text-sm font-medium">Lap {item.lap}</div>
        <div className="text-xs text-zinc-500">{item.status}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold">{item.time}</div>
        <div className={`text-xs ${item.delta.startsWith("-") ? "text-emerald-400" : "text-zinc-500"}`}>
          {item.delta}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ text, color }) {
  const map = {
    violet: "bg-violet-500/15 text-violet-300 border-violet-400/20",
    sky: "bg-sky-500/15 text-sky-300 border-sky-400/20",
    emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-400/20",
    red: "bg-red-500/15 text-red-400 border-red-400/20",
  };
  return (
    <div className={`rounded-full px-3 py-1.5 text-sm border ${map[color]}`}>{text}</div>
  );
}

// ─── Screens ─────────────────────────────────────────────────────────────────

function CircuitListScreen({ navigate }) {
  const filters = ["All", "Recent", "Popular", "Saved"];
  return (
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-zinc-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
              <circle cx="11" cy="11" r="6" />
            </svg>
            <span className="text-sm text-zinc-400">Search circuits, country, or layout</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pt-3">
            {filters.map((f, i) => (
              <button key={f} className={`shrink-0 rounded-full px-3 py-1.5 text-sm border ${i === 0 ? "bg-sky-500 text-black border-sky-400" : "bg-white/5 text-zinc-300 border-white/10"}`}>{f}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {CIRCUITS.map((c) => (
          <button key={c.name} onClick={() => navigate("circuit-detail")} className="w-full rounded-3xl bg-white/5 border border-white/10 p-4 text-left transition hover:bg-white/10">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-base font-semibold leading-tight">{c.name}</div>
                <div className="text-sm text-zinc-400">{c.country}</div>
              </div>
              <StatusPill text={c.status} color="sky" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                <div className="text-xs text-zinc-500 mb-1">Length</div>
                <div className="text-sm font-medium">{c.length}</div>
              </div>
              <div className="rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                <div className="text-xs text-zinc-500 mb-1">Corners</div>
                <div className="text-sm font-medium">{c.corners}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="px-5 pb-5 pt-1">
        <button className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-white">Import Custom Circuit</button>
      </div>
    </div>
  );
}

function CircuitDetailScreen({ navigate }) {
  const stats = [
    { label: "Length", value: "4.563 km" },
    { label: "Corners", value: "16" },
    { label: "Direction", value: "Clockwise" },
  ];
  const sectors = [
    { label: "Sector 1", value: "1.42 km" },
    { label: "Sector 2", value: "1.68 km" },
    { label: "Sector 3", value: "1.46 km" },
  ];
  const notes = [
    "Long main straight with heavy braking into Turn 1",
    "Technical middle sector with quick direction changes",
    "Final sector rewards clean exits and throttle control",
  ];

  return (
    <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
      <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-sky-500/15 via-zinc-900 to-zinc-900">
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
          <button onClick={() => navigate("circuit-list")} className="text-zinc-400 hover:text-white transition">← Back</button>
          <span>Track Details</span>
        </div>
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-zinc-400 text-sm">Circuit Profile</div>
            <div className="text-2xl font-semibold tracking-tight">Fuji Speedway</div>
            <div className="text-sm text-zinc-400 mt-1">Shizuoka, Japan</div>
          </div>
          <StatusPill text="FIA Grade 1" color="sky" />
        </div>
        <div className="rounded-3xl bg-black/40 border border-white/10 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3 text-sm text-zinc-400">
            <span>Track Layout</span><span>Full Course</span>
          </div>
          <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-5 mb-3">
            <svg viewBox="0 0 320 180" className="w-full h-36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M36 101C38 76 59 57 90 54C122 50 142 67 164 68C188 69 206 46 240 47C276 48 292 70 288 96C284 120 258 129 232 130C206 131 191 120 168 120C141 120 123 142 91 140C57 138 33 126 36 101Z" stroke="white" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="249" cy="48" r="6" fill="#22c55e" />
              <circle cx="89" cy="140" r="5" fill="#38bdf8" />
            </svg>
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Start / Finish</span><span>Pit Entry at final corner</span>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs text-zinc-400 mb-1">{s.label}</div>
              <div className="text-sm font-semibold">{s.value}</div>
            </div>
          ))}
        </div>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium">Sector Breakdown</div>
              <div className="text-xs text-zinc-400">Distance split across the lap</div>
            </div>
            <button className="text-xs text-zinc-400">Compare</button>
          </div>
          <div className="space-y-2">
            {sectors.map((s, i) => (
              <div key={s.label} className={`flex items-center justify-between rounded-2xl px-3 py-2.5 border ${i === 0 ? "bg-sky-500/10 border-sky-400/20" : "bg-black/20 border-white/5"}`}>
                <span className="text-sm">{s.label}</span>
                <span className="text-sm font-medium">{s.value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium">Driver Notes</div>
              <div className="text-xs text-zinc-400">Quick reference before the session</div>
            </div>
            <button className="text-xs text-zinc-400">Edit</button>
          </div>
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n} className="rounded-2xl bg-black/20 px-3 py-2.5 border border-white/5 text-sm text-zinc-200">{n}</div>
            ))}
          </div>
        </Card>
      </div>

      <div className="px-5 pb-5 pt-1 grid grid-cols-2 gap-3">
        <button className="rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-white">View History</button>
        <button onClick={() => navigate("pre-session")} className="rounded-2xl bg-sky-500 py-3.5 text-sm font-semibold text-black shadow-lg shadow-sky-500/30">Start Session</button>
      </div>
    </div>
  );
}

function PreSessionScreen({ navigate }) {
  const [selectedCircuit, setSelectedCircuit] = useState(CIRCUITS[0]);
  const [showCircuitPicker, setShowCircuitPicker] = useState(false);

  return (
    <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
      <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-emerald-500/15 via-zinc-900 to-zinc-900">
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
          <span>Pre-Session Setup</span><span>12:12 PM</span>
        </div>
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-zinc-400 text-sm">Ready to record</div>
            <div className="text-2xl font-semibold tracking-tight">Track Day · Session 3</div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-400 border border-emerald-400/20">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />READY
          </div>
        </div>

        {/* Track Selection */}
        <div className="rounded-3xl bg-black/40 border border-white/10 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3 text-sm text-zinc-400">
            <span>Selected Circuit</span>
            <button onClick={() => setShowCircuitPicker(!showCircuitPicker)} className="text-emerald-400 font-medium">
              {showCircuitPicker ? "Done" : "Change"}
            </button>
          </div>

          {!showCircuitPicker ? (
            <button onClick={() => setShowCircuitPicker(true)} className="w-full text-left">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xl font-semibold tracking-tight">{selectedCircuit.name}</div>
                  <div className="text-sm text-zinc-400 mt-0.5">{selectedCircuit.country} · {selectedCircuit.length} · {selectedCircuit.corners} corners</div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4 text-zinc-500 mt-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/5 border border-white/10 px-3 py-2">
                  <div className="text-xs text-zinc-500 mb-0.5">Last Visit</div>
                  <div className="text-sm font-medium">Mar 10, 2026</div>
                </div>
                <div className="rounded-2xl bg-white/5 border border-white/10 px-3 py-2">
                  <div className="text-xs text-zinc-500 mb-0.5">Best Lap</div>
                  <div className="text-sm font-medium">1:48.771</div>
                </div>
              </div>
            </button>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {CIRCUITS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => { setSelectedCircuit(c); setShowCircuitPicker(false); }}
                  className={`w-full flex items-center justify-between rounded-2xl px-3 py-2.5 border text-left transition ${
                    selectedCircuit.name === c.name
                      ? "bg-emerald-500/10 border-emerald-400/30"
                      : "bg-white/5 border-white/10 hover:bg-white/10"
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-zinc-500">{c.length} · {c.corners} corners</div>
                  </div>
                  {selectedCircuit.name === c.name && (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-emerald-400 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Vehicle & GPS */}
        <div className="rounded-3xl bg-black/40 border border-white/10 p-4">
          <div className="flex items-center justify-between mb-2 text-sm text-zinc-400">
            <span>Selected Vehicle</span><span>Track Mode</span>
          </div>
          <div className="text-xl font-semibold tracking-tight mb-3">GR86 Track Build</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl p-3 border bg-emerald-500/10 border-emerald-400/30">
              <div className="text-xs text-zinc-400 mb-1">GPS</div>
              <div className="text-base font-medium">Strong</div>
            </div>
            <div className="rounded-2xl p-3 border bg-white/5 border-white/10">
              <div className="text-xs text-zinc-400 mb-1">Satellites</div>
              <div className="text-base font-medium">18</div>
            </div>
            <div className="rounded-2xl p-3 border bg-white/5 border-white/10">
              <div className="text-xs text-zinc-400 mb-1">Battery</div>
              <div className="text-base font-medium">92%</div>
            </div>
          </div>
        </div>

        {/* Conditions */}
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

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium">Session Checklist</div>
              <div className="text-xs text-zinc-400">All systems verified before recording</div>
            </div>
            <div className="text-emerald-400 text-sm">4/4 Ready</div>
          </div>
          <div className="space-y-2">
            {["Start/finish line detected", "GPS lock confirmed", "Vehicle profile selected", "Storage available for session"].map((item) => (
              <div key={item} className="flex items-center justify-between rounded-2xl bg-black/20 px-3 py-2.5 border border-white/5">
                <span className="text-sm">{item}</span>
                <span className="text-emerald-400 text-sm font-medium">OK</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium">Session Config</div>
              <div className="text-xs text-zinc-400">Current setup for this run</div>
            </div>
            <button className="text-xs text-zinc-400">Edit</button>
          </div>
          <div className="space-y-3 text-sm">
            {[["Timing Mode", "Auto Lap"], ["Units", "km/h"], ["Data Capture", "GPS + Speed"]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-zinc-400">{k}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="px-5 pb-5 pt-1">
        <button onClick={() => navigate("recording")} className="w-full rounded-2xl bg-emerald-500 py-4 text-sm font-semibold text-black shadow-lg shadow-emerald-500/30">
          Start Session at {selectedCircuit.name}
        </button>
      </div>
    </div>
  );
}

function RecordingScreen({ navigate }) {
  const sectors = [
    { label: "S1", time: "32.184", active: true },
    { label: "S2", time: "41.902", active: false },
    { label: "S3", time: "34.685", active: false },
  ];

  return (
    <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
      <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-red-500/15 via-zinc-900 to-zinc-900">
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
          <span>Fuji Speedway</span><span>12:18 PM</span>
        </div>
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-zinc-400 text-sm">Session Recording</div>
            <div className="text-2xl font-semibold tracking-tight">Track Day · Session 2</div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-red-500/15 px-3 py-1.5 text-sm text-red-400 border border-red-400/20">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400 animate-pulse" />REC
          </div>
        </div>
        <div className="rounded-3xl bg-black/40 border border-white/10 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2 text-sm text-zinc-400">
            <span>Current Lap</span><span>Lap 5</span>
          </div>
          <div className="text-6xl leading-none font-semibold tracking-tight mb-3">1:12.48</div>
          <div className="grid grid-cols-3 gap-2">
            {sectors.map((s) => (
              <div key={s.label} className={`rounded-2xl p-3 border ${s.active ? "bg-red-500/10 border-red-400/30" : "bg-white/5 border-white/10"}`}>
                <div className="text-xs text-zinc-400 mb-1">{s.label}</div>
                <div className="text-lg font-medium">{s.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[["Best Lap", "1:48.771"], ["Top Speed", "214 km/h"], ["Duration", "18:42"]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs text-zinc-400 mb-1">{l}</div>
              <div className="text-lg font-semibold">{v}</div>
            </div>
          ))}
        </div>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium">Live Telemetry</div>
              <div className="text-xs text-zinc-400">GPS and lap timing active</div>
            </div>
            <div className="text-emerald-400 text-sm">Stable</div>
          </div>
          <div className="space-y-3">
            <ProgressBar label="Throttle" value="78%" />
            <ProgressBar label="Brake" value="12%" />
            <ProgressBar label="GPS Signal" value="92%" color="bg-emerald-400" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Recent Laps</div>
            <button className="text-xs text-zinc-400">View all</button>
          </div>
          <div className="space-y-2">
            {LAP_DATA.map((item) => <LapRow key={item.lap} item={item} />)}
          </div>
        </Card>
      </div>

      <div className="px-5 pb-5 pt-1 grid grid-cols-2 gap-3">
        <button className="rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium">Mark Pit In</button>
        <button onClick={() => navigate("post-session")} className="rounded-2xl bg-red-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-red-500/30">End Session</button>
      </div>
    </div>
  );
}

function PostSessionScreen({ navigate }) {
  return (
    <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
      <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-emerald-500/15 via-zinc-900 to-zinc-900">
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
          <span>Fuji Speedway</span><span>12:41 PM</span>
        </div>
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-zinc-400 text-sm">Session Complete</div>
            <div className="text-2xl font-semibold tracking-tight">Track Day · Session 2</div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-400 border border-emerald-400/20">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />SAVED
          </div>
        </div>
        <div className="rounded-3xl bg-black/40 border border-white/10 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2 text-sm text-zinc-400">
            <span>Best Lap</span><span>Lap 3</span>
          </div>
          <div className="text-6xl leading-none font-semibold tracking-tight mb-3">1:48.771</div>
          <div className="grid grid-cols-3 gap-2">
            {SECTOR_HIGHLIGHTS.map((s) => (
              <div key={s.label} className="rounded-2xl p-3 border bg-emerald-500/10 border-emerald-400/30">
                <div className="text-xs text-zinc-400 mb-1">{s.label}</div>
                <div className="text-lg font-medium">{s.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[["Top Speed", "214 km/h"], ["Duration", "18:42"], ["Total Laps", "4"]].map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs text-zinc-400 mb-1">{l}</div>
              <div className="text-lg font-semibold">{v}</div>
            </div>
          ))}
        </div>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium">Session Overview</div>
              <div className="text-xs text-zinc-400">Performance summary from this run</div>
            </div>
            <div className="text-emerald-400 text-sm">Personal Best</div>
          </div>
          <div className="space-y-3">
            <ProgressBar label="Consistency" value="91%" />
            <ProgressBar label="Throttle Avg" value="76%" />
            <ProgressBar label="Braking Efficiency" value="88%" color="bg-emerald-400" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Lap Breakdown</div>
            <button className="text-xs text-zinc-400">Export</button>
          </div>
          <div className="space-y-2">
            {LAP_DATA.map((item) => <LapRow key={item.lap} item={item} />)}
          </div>
        </Card>
      </div>

      <div className="px-5 pb-5 pt-1 grid grid-cols-2 gap-3">
        <button className="rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-white">Save Notes</button>
        <button onClick={() => navigate("session-list")} className="rounded-2xl bg-emerald-500 py-3.5 text-sm font-semibold text-black shadow-lg shadow-emerald-500/30">New Session</button>
      </div>
    </div>
  );
}

function SessionListScreen({ navigate }) {
  const filters = ["All", "Recent", "Best", "Saved"];
  return (
    <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
      <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-violet-500/15 via-zinc-900 to-zinc-900">
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
          <span>Sessions</span><span>57 Runs</span>
        </div>
        <div className="mb-5">
          <div className="text-zinc-400 text-sm mb-1">Your Track History</div>
          <div className="text-2xl font-semibold tracking-tight">Session Library</div>
        </div>
        <div className="rounded-3xl bg-black/40 border border-white/10 p-3 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-zinc-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
              <circle cx="11" cy="11" r="6" />
            </svg>
            <span className="text-sm text-zinc-400">Search by circuit, date, or session type</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pt-3">
            {filters.map((f, i) => (
              <button key={f} className={`shrink-0 rounded-full px-3 py-1.5 text-sm border ${i === 0 ? "bg-violet-500 text-white border-violet-400" : "bg-white/5 text-zinc-300 border-white/10"}`}>{f}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {SESSIONS.map((s) => (
          <button key={`${s.track}-${s.date}`} onClick={() => navigate("session-detail")} className="w-full rounded-3xl bg-white/5 border border-white/10 p-4 text-left transition hover:bg-white/10">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-base font-semibold leading-tight">{s.track}</div>
                <div className="text-sm text-zinc-400">{s.layout}</div>
              </div>
              <StatusPill text={s.status} color="violet" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                <div className="text-xs text-zinc-500 mb-1">Date</div>
                <div className="text-sm font-medium">{s.date}</div>
              </div>
              <div className="rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
                <div className="text-xs text-zinc-500 mb-1">Start Time</div>
                <div className="text-sm font-medium">{s.time}</div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-black/20 border border-white/5 px-3 py-2.5">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Best Lap</div>
                <div className="text-sm font-semibold">{s.bestLap}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-zinc-500 mb-1">Laps</div>
                <div className="text-sm font-semibold">{s.laps}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="px-5 pb-5 pt-1">
        <button className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-white">Export Sessions</button>
      </div>
    </div>
  );
}

function SessionDetailScreen({ navigate }) {
  const sectors = [
    { label: "S1", value: "31.842", status: "Best" },
    { label: "S2", value: "41.317", status: "Best" },
    { label: "S3", value: "34.511", status: "Best" },
  ];
  const metrics = [
    { label: "Top Speed", value: "214 km/h" },
    { label: "Duration", value: "18:42" },
    { label: "Total Laps", value: "12" },
  ];

  return (
    <div className="w-full max-w-sm rounded-[2rem] border border-white/10 bg-zinc-900 shadow-2xl overflow-hidden">
      <div className="relative px-5 pt-5 pb-4 bg-gradient-to-b from-violet-500/15 via-zinc-900 to-zinc-900">
        <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
          <button onClick={() => navigate("session-list")} className="text-zinc-400 hover:text-white transition">← Back</button>
          <span>Fuji Speedway</span>
        </div>
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-zinc-400 text-sm">Recorded Session</div>
            <div className="text-2xl font-semibold tracking-tight">Track Day · Session 2</div>
            <div className="text-sm text-zinc-400 mt-1">Mar 10, 2026 · 10:24 AM</div>
          </div>
          <StatusPill text="Best Run" color="violet" />
        </div>
        <div className="rounded-3xl bg-black/40 border border-white/10 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3 text-sm text-zinc-400">
            <span>Circuit View</span><span>Record Line</span>
          </div>
          <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-4 mb-3">
            <svg viewBox="0 0 320 200" className="w-full h-40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M41 111C44 80 66 58 98 54C130 50 149 66 170 68C195 70 213 44 247 46C283 48 298 72 294 100C290 129 261 139 235 140C207 141 193 128 170 128C143 128 126 150 93 148C58 146 38 132 41 111Z" stroke="rgba(255,255,255,0.22)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M41 111C44 80 66 58 98 54C130 50 149 66 170 68C195 70 213 44 247 46C283 48 298 72 294 100C290 129 261 139 235 140C207 141 193 128 170 128C143 128 126 150 93 148C58 146 38 132 41 111Z" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M247 50C266 56 279 69 281 89C283 108 272 122 255 129C238 136 220 135 202 129C188 124 176 118 163 117C145 116 130 123 117 132C104 141 89 145 73 142" stroke="#8b5cf6" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="244" y1="34" x2="244" y2="63" stroke="#22c55e" strokeWidth="4" strokeLinecap="round" />
              <circle cx="244" cy="48" r="7" fill="#22c55e" />
              <circle cx="117" cy="132" r="6" fill="#8b5cf6" />
            </svg>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {sectors.map((s) => (
              <div key={s.label} className="rounded-2xl p-3 border bg-violet-500/10 border-violet-400/20">
                <div className="text-xs text-zinc-400 mb-1">{s.label}</div>
                <div className="text-lg font-medium">{s.value}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-400 mt-3">
            <span>Green = start / finish</span><span>Purple = fastest line</span>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-xs text-zinc-400 mb-1">{m.label}</div>
              <div className="text-lg font-semibold">{m.value}</div>
            </div>
          ))}
        </div>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-medium">Session Insights</div>
              <div className="text-xs text-zinc-400">Quick performance summary</div>
            </div>
            <div className="text-violet-300 text-sm">+1.2s vs last</div>
          </div>
          <div className="space-y-3">
            <ProgressBar label="Consistency" value="91%" />
            <ProgressBar label="Throttle Avg" value="76%" />
            <ProgressBar label="Braking Efficiency" value="88%" color="bg-violet-400" />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-medium">Lap Breakdown</div>
            <button className="text-xs text-zinc-400">Compare</button>
          </div>
          <div className="space-y-2">
            {LAP_DATA.map((item) => <LapRow key={item.lap} item={item} />)}
          </div>
        </Card>
      </div>

      <div className="px-5 pb-5 pt-1 grid grid-cols-2 gap-3">
        <button className="rounded-2xl border border-white/10 bg-white/5 py-3.5 text-sm font-medium text-white">Export Data</button>
        <button className="rounded-2xl bg-violet-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/30">View Replay</button>
      </div>
    </div>
  );
}

// ─── Nav bar ─────────────────────────────────────────────────────────────────

const NAV = [
  { id: "circuit-list", icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7", label: "Circuits" },
  { id: "pre-session", icon: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z", label: "Record" },
  { id: "session-list", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2", label: "Sessions" },
];

// ─── App ──────────────────────────────────────────────────────────────────────

const SCREEN_MAP = {
  "circuit-list": CircuitListScreen,
  "circuit-detail": CircuitDetailScreen,
  "pre-session": PreSessionScreen,
  recording: RecordingScreen,
  "post-session": PostSessionScreen,
  "session-list": SessionListScreen,
  "session-detail": SessionDetailScreen,
};

export default function TrackApp() {
  const [screen, setScreen] = useState("pre-session");
  const Screen = SCREEN_MAP[screen];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-start p-6 pb-24">
      <Screen navigate={setScreen} />

      {/* Bottom nav */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-2xl border border-white/10 bg-zinc-900/90 backdrop-blur-md px-3 py-2 shadow-2xl">
        {NAV.map((n) => {
          const active =
            screen === n.id ||
            (n.id === "session-list" && screen === "session-detail") ||
            (n.id === "circuit-list" && screen === "circuit-detail") ||
            (n.id === "pre-session" && (screen === "recording" || screen === "post-session"));
          return (
            <button key={n.id} onClick={() => setScreen(n.id)} className={`flex flex-col items-center gap-1 px-5 py-2 rounded-xl transition-all ${active ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d={n.icon} />
              </svg>
              <span className="text-[10px] font-medium">{n.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
