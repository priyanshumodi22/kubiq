package in.kubiq.validation;
import java.util.Map;
import io.opentelemetry.api.trace.Span;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.HttpStatusCodeException;
@SpringBootApplication
@RestController
public class Canary {
 public static void main(String[] args) { SpringApplication.run(Canary.class,args); }
 @GetMapping("/apm-validation/{route}")
 public ResponseEntity<Map<String,Object>> proxy(@PathVariable String route) throws Exception {
  Span span=Span.current();
  span.setAttribute("kubiq.validation.run_id",System.getenv("CANARY_RUN_ID"));
  String frontId=span.getSpanContext().getTraceId();
  String body; int status;
  try { var response=new RestTemplate().getForEntity("http://127.0.0.1:18081/apm-validation/"+route,String.class);body=response.getBody();status=response.getStatusCode().value();}
  catch(HttpStatusCodeException error){body=error.getResponseBodyAsString();status=error.getStatusCode().value();}
  var data=new com.fasterxml.jackson.databind.ObjectMapper().readValue(body, new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){});
  data.put("frontTraceId",frontId);
  return ResponseEntity.status(status).body(data);
 }
}
