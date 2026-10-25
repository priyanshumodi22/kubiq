package main
import (
 "context"
 "encoding/json"
 "net/http"
 "os"
 "os/signal"
 "syscall"
 "time"
 "go.opentelemetry.io/otel/trace"
 "go.opentelemetry.io/otel/attribute"
)
func main() {
 ctx:=context.Background()
 provider,err:=initTracer(ctx);if err!=nil{panic(err)}
 client:=tracedClient()
 handler:=http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  span:=trace.SpanFromContext(r.Context());span.SetAttributes(attribute.String("kubiq.validation.run_id",os.Getenv("CANARY_RUN_ID")))
  req,_:=http.NewRequestWithContext(r.Context(),"GET","http://127.0.0.1:18081"+r.URL.Path,nil)
  response,err:=client.Do(req);if err!=nil{http.Error(w,"upstream",502);return};defer response.Body.Close()
  data:=map[string]interface{}{};json.NewDecoder(response.Body).Decode(&data);data["frontTraceId"]=span.SpanContext().TraceID().String()
  w.Header().Set("Content-Type","application/json");w.WriteHeader(response.StatusCode);json.NewEncoder(w).Encode(data)
 })
 server:=&http.Server{Addr:"0.0.0.0:18080",Handler:tracedHandler(handler),ReadHeaderTimeout:3*time.Second}
 go server.ListenAndServe()
 done:=make(chan os.Signal,1);signal.Notify(done,syscall.SIGTERM,syscall.SIGINT);<-done
 shutdown,cancel:=context.WithTimeout(ctx,5*time.Second);defer cancel();server.Shutdown(shutdown);provider.Shutdown(shutdown)
}
