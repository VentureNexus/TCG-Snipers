import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useSystemMetrics } from "@/hooks/useSystemMetrics";

function metricColor(value: number): string {
  if (value >= 80) return "#f87171";
  if (value >= 60) return "#facc15";
  return "#34d399";
}

// Chart dimensions — must match the AreaChart props below so the
// userSpaceOnUse gradient aligns with the actual Y-axis domain [0, 100].
const CHART_HEIGHT = 110;
const MARGIN_TOP = 4;
const LEGEND_HEIGHT = 22;
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN_TOP - LEGEND_HEIGHT;
// Map data value (0–100) → SVG y coordinate
const yPos = (value: number) =>
  MARGIN_TOP + PLOT_HEIGHT * (1 - value / 100);

// Threshold stops: red ≥ 80%, yellow 60-80%, green < 60%
const THRESH_Y_RED = yPos(80);   // top of yellow band / bottom of red band
const THRESH_Y_GREEN = yPos(60); // top of green band / bottom of yellow band
const THRESH_Y_BOTTOM = yPos(0); // bottom of chart

export function SystemPerformanceGraph() {
  const { history, current } = useSystemMetrics();

  const isElectron = typeof window !== "undefined" && !!window.electronAPI?.system;
  if (!isElectron) return null;

  const totalGiB = current.ramTotalBytes > 0
    ? (current.ramTotalBytes / 1024 ** 3).toFixed(1)
    : null;

  const chartData = history.map((point, i) => ({
    index: i,
    cpu: point.cpuPercent,
    ram: point.ramPercent,
  }));

  const cpuColor = metricColor(current.cpuPercent);
  const ramColor = metricColor(current.ramPercent);

  return (
    <div className="border border-border/50 rounded-lg bg-card/50 glass-card px-4 pt-3 pb-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          System Performance
        </span>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span style={{ color: cpuColor }}>CPU {current.cpuPercent}%</span>
          <span style={{ color: ramColor }}>
            RAM {current.ramPercent}%{totalGiB ? ` / ${totalGiB} GiB` : ""}
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <AreaChart
          data={chartData}
          margin={{ top: MARGIN_TOP, right: 0, left: -28, bottom: 0 }}
        >
          <defs>
            {/*
              Threshold gradient — y coordinates are in the SVG's userSpace.
              The gradient transitions sharply at the 60% and 80% thresholds so
              the line/fill colour reflects the actual value at each point:
                red   → value ≥ 80% (top of chart)
                yellow → value 60-80%
                green  → value < 60% (bottom of chart)
            */}
            <linearGradient
              id="cpuThreshGrad"
              x1="0"
              y1={MARGIN_TOP}
              x2="0"
              y2={THRESH_Y_BOTTOM}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#f87171" stopOpacity={0.35} />
              <stop offset={`${((THRESH_Y_RED - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#f87171" stopOpacity={0.28} />
              <stop offset={`${((THRESH_Y_RED - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#facc15" stopOpacity={0.25} />
              <stop offset={`${((THRESH_Y_GREEN - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#facc15" stopOpacity={0.2} />
              <stop offset={`${((THRESH_Y_GREEN - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#34d399" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
            <linearGradient
              id="cpuThreshStroke"
              x1="0"
              y1={MARGIN_TOP}
              x2="0"
              y2={THRESH_Y_BOTTOM}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#f87171" />
              <stop offset={`${((THRESH_Y_RED - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#f87171" />
              <stop offset={`${((THRESH_Y_RED - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#facc15" />
              <stop offset={`${((THRESH_Y_GREEN - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#facc15" />
              <stop offset={`${((THRESH_Y_GREEN - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#34d399" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
            <linearGradient
              id="ramThreshGrad"
              x1="0"
              y1={MARGIN_TOP}
              x2="0"
              y2={THRESH_Y_BOTTOM}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#f87171" stopOpacity={0.25} />
              <stop offset={`${((THRESH_Y_RED - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#f87171" stopOpacity={0.2} />
              <stop offset={`${((THRESH_Y_RED - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#facc15" stopOpacity={0.18} />
              <stop offset={`${((THRESH_Y_GREEN - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#facc15" stopOpacity={0.15} />
              <stop offset={`${((THRESH_Y_GREEN - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#34d399" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
            <linearGradient
              id="ramThreshStroke"
              x1="0"
              y1={MARGIN_TOP}
              x2="0"
              y2={THRESH_Y_BOTTOM}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#f87171" />
              <stop offset={`${((THRESH_Y_RED - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#f87171" />
              <stop offset={`${((THRESH_Y_RED - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#facc15" />
              <stop offset={`${((THRESH_Y_GREEN - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#facc15" />
              <stop offset={`${((THRESH_Y_GREEN - MARGIN_TOP) / PLOT_HEIGHT) * 100}%`} stopColor="#34d399" />
              <stop offset="100%" stopColor="#34d399" />
            </linearGradient>
          </defs>

          <XAxis dataKey="index" hide />
          <YAxis
            domain={[0, 100]}
            tickCount={3}
            tick={{ fontSize: 9, fill: "#6b7280" }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              background: "#0d1117",
              border: "1px solid #30363d",
              borderRadius: 6,
              fontSize: 11,
              fontFamily: "monospace",
            }}
            formatter={(value: number, name: string) => [
              `${value}%`,
              name === "cpu" ? "CPU" : "RAM",
            ]}
            labelFormatter={() => ""}
          />
          <ReferenceLine
            y={80}
            stroke="#ef4444"
            strokeDasharray="3 3"
            strokeOpacity={0.5}
            label={{
              value: `80% limit${totalGiB ? ` (${(parseFloat(totalGiB) * 0.8).toFixed(1)} GiB)` : ""}`,
              position: "insideTopRight",
              fontSize: 9,
              fill: "#ef4444",
              opacity: 0.75,
            }}
          />
          <Area
            type="monotone"
            dataKey="cpu"
            name="cpu"
            stroke="url(#cpuThreshStroke)"
            strokeWidth={1.5}
            fill="url(#cpuThreshGrad)"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="ram"
            name="ram"
            stroke="url(#ramThreshStroke)"
            strokeWidth={1.5}
            fill="url(#ramThreshGrad)"
            dot={false}
            isAnimationActive={false}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, fontFamily: "monospace", paddingTop: 2 }}
            formatter={(value: string) => (value === "cpu" ? "CPU %" : "RAM %")}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
