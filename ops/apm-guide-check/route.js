import { trace } from '@opentelemetry/api';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request, {params}) {
 const {route} = await params;
 const span = trace.getActiveSpan();
 span?.setAttribute('kubiq.validation.run_id', process.env.CANARY_RUN_ID);
 const frontTraceId = span?.spanContext().traceId || '';
 const response = await fetch('http://127.0.0.1:18081/apm-validation/'+route,{cache:'no-store'});
 return Response.json({...await response.json(),frontTraceId},{status:response.status});
}
