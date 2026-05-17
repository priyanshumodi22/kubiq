import { AreaChart, Area, ResponsiveContainer } from 'recharts';

export interface K8sMiniSparklineProps {
    data: number[];
    color: string;
}

export function K8sMiniSparkline({ data, color }: K8sMiniSparklineProps) {
    const chartData = data.map((val, idx) => ({ id: idx, value: val }));
    while (chartData.length < 5) {
        chartData.unshift({ id: -chartData.length, value: 0 });
    }
    return (
        <div className="w-12 h-5 opacity-80 hover:opacity-100 transition-opacity shrink-0">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
                    <defs>
                        <linearGradient id={`color-${color}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
                            <stop offset="95%" stopColor={color} stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <Area 
                        type="monotone" 
                        dataKey="value" 
                        stroke={color} 
                        fill={`url(#color-${color})`} 
                        strokeWidth={1.2} 
                        dot={false}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
