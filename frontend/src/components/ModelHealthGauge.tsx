import { Pie, PieChart, Sector } from "recharts";

type ModelHealthGaugeProps = {
  score: number;
  width?: number;
  height?: number;
};

const clampScore = (value: number): number => Math.max(0, Math.min(1, value));

const getZoneColor = (score: number): string => {
  if (score < 0.3) return "#ef4444";
  if (score < 0.6) return "#f59e0b";
  return "#22c55e";
};

function ModelHealthGauge({
  score,
  width = 360,
  height = 230,
}: ModelHealthGaugeProps) {
  const normalizedScore = clampScore(score);
  const activeColor = getZoneColor(normalizedScore);

  const zoneData = [
    { value: 0.3, fill: "#ef4444" },
    { value: 0.3, fill: "#f59e0b" },
    { value: 0.4, fill: "#22c55e" },
  ];

  const valueData = [
    { value: normalizedScore, fill: activeColor },
    { value: 1 - normalizedScore, fill: "rgba(148, 163, 184, 0.15)" },
  ];

  const centerX = width / 2;
  const centerY = height - 28;
  const needleRadius = 86;
  const angle = Math.PI * (1 - normalizedScore);
  const needleX = centerX + needleRadius * Math.cos(angle);
  const needleY = centerY - needleRadius * Math.sin(angle);

  return (
    <div
      style={{
        width,
        background: "linear-gradient(180deg, #0a1020 0%, #0f172a 100%)",
        border: "1px solid rgba(148, 163, 184, 0.25)",
        borderRadius: 14,
        padding: "12px 12px 10px",
        boxShadow: "0 16px 36px rgba(0, 0, 0, 0.35)",
      }}
    >
      <div
        style={{
          color: "#e2e8f0",
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          textAlign: "center",
          marginBottom: 2,
        }}
      >
        Model Health
      </div>

      <PieChart width={width - 24} height={height - 8}>
        <Pie
          data={zoneData}
          dataKey="value"
          startAngle={180}
          endAngle={0}
          cx="50%"
          cy="88%"
          innerRadius={90}
          outerRadius={105}
          stroke="none"
          isAnimationActive={false}
        >
          {zoneData.map((entry) => (
            <Sector key={entry.fill} fill={entry.fill} />
          ))}
        </Pie>

        <Pie
          data={valueData}
          dataKey="value"
          startAngle={180}
          endAngle={0}
          cx="50%"
          cy="88%"
          innerRadius={72}
          outerRadius={84}
          stroke="none"
          isAnimationActive
          animationDuration={900}
          animationEasing="ease-in-out"
        />

        <g>
          <line
            x1={centerX - 12}
            y1={centerY - 2}
            x2={needleX - 12}
            y2={needleY - 2}
            stroke={activeColor}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <circle
            cx={centerX - 12}
            cy={centerY - 2}
            r={6}
            fill="#e2e8f0"
            stroke="#0f172a"
            strokeWidth={2}
          />
        </g>
      </PieChart>

      <div style={{ textAlign: "center", marginTop: -12 }}>
        <span style={{ color: "#f8fafc", fontSize: 30, fontWeight: 800 }}>
          {normalizedScore.toFixed(2)}
        </span>
        <span style={{ color: "#94a3b8", fontSize: 14, marginLeft: 6 }}>/ 1.00</span>
      </div>
    </div>
  );
}

export default ModelHealthGauge;
