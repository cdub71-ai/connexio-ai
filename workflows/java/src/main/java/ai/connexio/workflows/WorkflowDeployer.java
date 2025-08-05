package ai.connexio.workflows;

import io.littlehorse.sdk.common.config.LHConfig;
import io.littlehorse.sdk.worker.LHTaskWorker;
import io.littlehorse.sdk.worker.LHTaskWorkerFactory;
import ai.connexio.workers.SlackCommandParser;
import ai.connexio.workers.CampaignActionExecutor;
import ai.connexio.workers.SlackResponseSender;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.CountDownLatch;

/**
 * Workflow Deployer for Connexio.ai Marketing Campaigns
 * 
 * This class handles:
 * 1. Deploying workflow specifications to Little Horse
 * 2. Starting task workers
 * 3. Managing the application lifecycle
 */
public class WorkflowDeployer {
    
    private static final Logger log = LoggerFactory.getLogger(WorkflowDeployer.class);
    
    public static void main(String[] args) {
        log.info("🚀 Starting Connexio.ai Workflow Deployer");
        
        try {
            // Initialize Little Horse configuration
            LHConfig config = createLHConfig();
            
            // Deploy workflows
            deployWorkflows(config);
            
            // Start task workers
            startTaskWorkers(config);
            
            log.info("✅ Connexio.ai workflows deployed and workers started");
            log.info("🎯 Ready to process marketing campaigns!");
            
            // Keep the application running
            waitForShutdown();
            
        } catch (Exception e) {
            log.error("❌ Failed to start Connexio.ai workflows: {}", e.getMessage(), e);
            System.exit(1);
        }
    }
    
    /**
     * Create Little Horse configuration
     */
    private static LHConfig createLHConfig() {
        log.info("📋 Initializing Little Horse configuration");
        
        LHConfig config = new LHConfig();
        
        // Set configuration from environment variables
        String lhHost = System.getenv("LITTLEHORSE_API_HOST");
        String lhPort = System.getenv("LITTLEHORSE_API_PORT");
        String clientId = System.getenv("LITTLEHORSE_CLIENT_ID");
        String clientSecret = System.getenv("LITTLEHORSE_CLIENT_SECRET");
        
        if (lhHost != null) {
            config.setApiHost(lhHost);
        }
        if (lhPort != null) {
            config.setApiPort(Integer.parseInt(lhPort));
        }
        if (clientId != null) {
            config.setClientId(clientId);
        }
        if (clientSecret != null) {
            config.setClientSecret(clientSecret);
        }
        
        log.info("📡 Little Horse API: {}:{}", config.getApiHost(), config.getApiPort());
        return config;
    }
    
    /**
     * Deploy all workflow specifications
     */
    private static void deployWorkflows(LHConfig config) {
        log.info("🔄 Deploying workflow specifications");
        
        try {
            // Deploy Marketing Campaign Workflow
            MarketingCampaignWorkflow.deployWorkflow(config);
            
            log.info("✅ All workflows deployed successfully");
            
        } catch (Exception e) {
            log.error("❌ Failed to deploy workflows: {}", e.getMessage(), e);
            throw new RuntimeException("Workflow deployment failed", e);
        }
    }
    
    /**
     * Start all task workers
     */
    private static void startTaskWorkers(LHConfig config) {
        log.info("🏭 Starting task workers");
        
        try {
            // Create worker factory
            LHTaskWorkerFactory factory = new LHTaskWorkerFactory(config);
            
            // Register task workers
            factory.registerTaskWorker(new SlackCommandParser());
            factory.registerTaskWorker(new CampaignActionExecutor());
            factory.registerTaskWorker(new SlackResponseSender());
            
            // Start workers
            factory.start();
            
            log.info("✅ Task workers started successfully");
            log.info("👥 Active workers:");
            log.info("   • parse-slack-command");
            log.info("   • execute-campaign-action");
            log.info("   • send-slack-response");
            
        } catch (Exception e) {
            log.error("❌ Failed to start task workers: {}", e.getMessage(), e);
            throw new RuntimeException("Task worker startup failed", e);
        }
    }
    
    /**
     * Wait for shutdown signal
     */
    private static void waitForShutdown() {
        log.info("⏳ Application running. Press Ctrl+C to shutdown.");
        
        CountDownLatch shutdownLatch = new CountDownLatch(1);
        
        // Add shutdown hook
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            log.info("🛑 Shutdown signal received");
            shutdownLatch.countDown();
        }));
        
        try {
            shutdownLatch.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Shutdown interrupted");
        }
        
        log.info("👋 Connexio.ai workflows shutting down");
    }
    
    /**
     * Utility method to check configuration
     */
    public static void checkConfiguration() {
        log.info("🔍 Checking configuration");
        
        // Check required environment variables
        String[] requiredVars = {
            "LITTLEHORSE_API_HOST",
            "LITTLEHORSE_API_PORT",
            "ANTHROPIC_API_KEY",
            "SLACK_BOT_TOKEN"
        };
        
        boolean configValid = true;
        
        for (String var : requiredVars) {
            String value = System.getenv(var);
            if (value == null || value.trim().isEmpty()) {
                log.error("❌ Missing required environment variable: {}", var);
                configValid = false;
            } else {
                log.info("✅ {}: configured", var);
            }
        }
        
        // Check optional variables
        String[] optionalVars = {
            "SURESHOT_API_KEY",
            "SURESHOT_BASE_URL",
            "SURESHOT_WORKSPACE_ID"
        };
        
        for (String var : optionalVars) {
            String value = System.getenv(var);
            if (value == null || value.trim().isEmpty()) {
                log.warn("⚠️  Optional environment variable not set: {} (will use mock responses)", var);
            } else {
                log.info("✅ {}: configured", var);
            }
        }
        
        if (!configValid) {
            throw new RuntimeException("Configuration validation failed");
        }
        
        log.info("✅ Configuration check passed");
    }
}