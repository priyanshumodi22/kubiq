import { Link, useInRouterContext } from 'react-router-dom';
import { logCorrelation } from '../utils/logCorrelation';
import { useAuth } from '../contexts/AuthContext';
export function LogCorrelationLinks({ message, record }: Readonly<{ message: string; record?: unknown }>) {
    const inRouter = useInRouterContext();
    const { hasPermission } = useAuth();
    const ids = logCorrelation(message, record);
    if (!inRouter || !hasPermission('apm.read') || !ids) return null;
    const trace = `/apm?traceId=${ids.traceId}`;
    return <span className="ml-3 inline-flex flex-wrap gap-3 text-xs font-medium text-primary">
        <Link to={trace} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} className="hover:underline focus-visible:ring-2 focus-visible:ring-primary" title={`Open trace ${ids.traceId}`}>View trace</Link>
        {ids.spanId && <Link to={`${trace}&spanId=${ids.spanId}`} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()} className="hover:underline focus-visible:ring-2 focus-visible:ring-primary" title={`Open span ${ids.spanId}`}>View span</Link>}
    </span>;
}
