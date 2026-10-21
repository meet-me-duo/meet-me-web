package com.meetme.integration;

import com.meetme.server.MeetMeServerApplication;
import com.meetme.server.account.adapter.input.web.AuthEndToEndPostgresTest;
import com.meetme.server.submission.adapter.input.web.PrecheckNativeBeans;
import com.meetme.server.submission.adapter.input.web.NativePrecheckProvider;
import com.meetme.server.precheck.application.service.PreSubmissionCheckWorker;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;

import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Test-only launcher compiled against unchanged frozen server classes. Never packaged as product. */
public final class HostIntegrationServer {
  private static final String WEB = "https://localhost:19443";
  private static final String API = "https://localhost:19444";

  public static void main(String[] args) throws Exception {
    if (args.length != 1) throw new IllegalArgumentException("ISOLATED_WORK_DIRECTORY_REQUIRED");
    Path work = Path.of(args[0]).toAbsolutePath().normalize();
    if (!(work.startsWith("/tmp") || work.startsWith("/workspace"))) throw new IllegalArgumentException("ISOLATED_WORK_DIRECTORY_REQUIRED");
    for (String key : new String[] {"OPENAI_API_KEY", "GEMINI_API_KEY"}) {
      if (!System.getenv().getOrDefault(key, "").isEmpty()) throw new IllegalStateException("EMPTY_PROVIDER_KEYS_REQUIRED");
    }
    Path stop = work.resolve("stop");
    if (Files.exists(stop)) throw new IllegalStateException("STALE_STOP_FILE");
    Map<String, String> settings = new LinkedHashMap<>();
    AuthEndToEndPostgresTest.properties((name, supplier) -> settings.put(name, supplier.get().toString()));
    settings.putAll(Map.ofEntries(
      Map.entry("server.address", "127.0.0.1"), Map.entry("server.port", "19440"),
      Map.entry("meetme.auth.test.redirect-base", API),
      Map.entry("meetme.anonymous.allowed-origins", WEB), Map.entry("meetme.anonymous.cookie-secure", "true"),
      Map.entry("meetme.auth.web-callback-uri", WEB + "/auth/callback"),
      Map.entry("meetme.reliability.enabled", "false"), Map.entry("meetme.rate-limit.enabled", "false"),
      Map.entry("meetme.data-retention.enabled", "false"), Map.entry("meetme.operations.cleanup-enabled", "false"),
      Map.entry("meetme.ai.budget.enabled", "false"), Map.entry("meetme.precheck.provider.enabled", "false"),
      Map.entry("meetme.precheck.decision-routing.enabled", "false"), Map.entry("meetme.precheck.classifier.enabled", "false")
    ));
    settings.forEach(System::setProperty);
    ConfigurableApplicationContext context = new SpringApplicationBuilder(MeetMeServerApplication.class,
      AuthEndToEndPostgresTest.IsolatedAuthProviders.class, PrecheckNativeBeans.class).run();
    NativePrecheckProvider provider = context.getBean(NativePrecheckProvider.class);
    PreSubmissionCheckWorker worker = context.getBean(PreSubmissionCheckWorker.class);
    ObjectMapper mapper = context.getBean(ObjectMapper.class);
    // Synthetic fixture getters expose only disposable container metadata and exact loopback issuer.
    var postgresGetter = AuthEndToEndPostgresTest.class.getDeclaredMethod("access$getPostgres$cp");
    var issuerGetter = AuthEndToEndPostgresTest.class.getDeclaredMethod("access$getProviderOrigin$cp");
    PostgreSQLContainer postgres = (PostgreSQLContainer) postgresGetter.invoke(null);
    String issuer = (String) issuerGetter.invoke(null);
    Map<String, Object> health = Map.ofEntries(
      Map.entry("fixture", "issue123-host-current-v1"), Map.entry("production", false),
      Map.entry("web_origin", WEB), Map.entry("api_origin", API), Map.entry("oidc_origin", issuer),
      Map.entry("db_container", postgres.getContainerId()), Map.entry("db_user", postgres.getUsername()), Map.entry("db_name", postgres.getDatabaseName()),
      Map.entry("primary_provider_fake", true), Map.entry("actual_ai_calls", 0), Map.entry("actual_oauth_provider_calls", 0)
    );
    var executor = Executors.newFixedThreadPool(2);
    HttpServer control = HttpServer.create(new InetSocketAddress("127.0.0.1", 19442), 0);
    control.setExecutor(executor);
    control.createContext("/", exchange -> {
      try {
        if (!exchange.getRemoteAddress().getAddress().isLoopbackAddress()) { reply(exchange, mapper, 403, Map.of("error", "LOOPBACK_REQUIRED")); return; }
        String route = exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath();
        Object result;
        switch (route) {
          case "GET /health": result = health; break;
          case "POST /provider":
            byte[] bytes = exchange.getRequestBody().readNBytes(16_385);
            if (bytes.length > 16_384) throw new IllegalArgumentException("CONTROL_BODY_LIMIT");
            provider.configure(mapper.readTree(bytes)); result = Map.of("configured", true); break;
          case "POST /worker/run-one": result = Map.of("ran", worker.runOne()); break;
          default: reply(exchange, mapper, 404, Map.of("error", "UNKNOWN_FIXTURE_CONTROL")); return;
        }
        reply(exchange, mapper, 200, result);
      } catch (Throwable ignored) { reply(exchange, mapper, 409, Map.of("error", "FIXTURE_CONTROL_REJECTED")); }
    });
    AtomicBoolean closed = new AtomicBoolean();
    Runnable cleanup = () -> {
      if (closed.compareAndSet(false, true)) {
        provider.release(); control.stop(0); executor.shutdownNow(); context.close(); AuthEndToEndPostgresTest.stop();
      }
    };
    Runtime.getRuntime().addShutdownHook(new Thread(cleanup, "host-current-fixture-cleanup"));
    try {
      control.start(); Files.write(work.resolve("runtime-health.json"), mapper.writeValueAsBytes(health));
      System.out.println("CURRENT_HOST_HTTPS_FIXTURE_READY");
      while (!Files.exists(stop)) Thread.sleep(250);
    } finally { cleanup.run(); }
  }

  private static void reply(HttpExchange exchange, ObjectMapper mapper, int status, Object value) throws java.io.IOException {
    byte[] bytes = mapper.writeValueAsBytes(value);
    exchange.getResponseHeaders().set("Content-Type", "application/json"); exchange.getResponseHeaders().set("Cache-Control", "no-store");
    exchange.sendResponseHeaders(status, bytes.length); try (var output = exchange.getResponseBody()) { output.write(bytes); } exchange.close();
  }
}
