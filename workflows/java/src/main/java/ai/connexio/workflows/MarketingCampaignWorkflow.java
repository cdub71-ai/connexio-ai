package ai.connexio.workflows;

import io.littlehorse.sdk.common.config.LHConfig;
import io.littlehorse.sdk.common.proto.LHStatus;
import io.littlehorse.sdk.common.proto.VariableType;
import io.littlehorse.sdk.wfsdk.LittleHorseWorkflow;
import io.littlehorse.sdk.wfsdk.ThreadBuilder;
import io.littlehorse.sdk.wfsdk.WorkflowThread;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Marketing Campaign Workflow for Connexio.ai
 * 
 * Flow:
 * 1. Accept Slack command input
 * 2. Parse command with Claude API
 * 3. Execute campaign action
 * 4. Send status back to Slack
 */
public class MarketingCampaignWorkflow implements LittleHorseWorkflow {
    
    private static final Logger log = LoggerFactory.getLogger(MarketingCampaignWorkflow.class);
    
    public static final String WORKFLOW_NAME = "marketing-campaign-workflow";
    
    @Override
    public WorkflowThread getWorkflowThread() {
        return new WorkflowThread("main-thread", this::mainThread);
    }
    
    @Override
    public String getName() {
        return WORKFLOW_NAME;
    }
    
    /**
     * Main workflow thread definition
     */
    public void mainThread(ThreadBuilder thread) {
        // Input variables
        thread.addVariable("slackCommand", VariableType.JSON_OBJ)
              .addVariable("slackChannelId", VariableType.STR)
              .addVariable("slackUserId", VariableType.STR)
              .addVariable("slackResponseUrl", VariableType.STR);
        
        // Processing variables
        thread.addVariable("parsedIntent", VariableType.JSON_OBJ)
              .addVariable("campaignResult", VariableType.JSON_OBJ)
              .addVariable("finalStatus", VariableType.STR);
        
        log.info("Setting up marketing campaign workflow");
        
        // Step 1: Parse Slack command with Claude API
        thread.execute("parse-slack-command")
              .withInput("command", thread.getVariable("slackCommand"))
              .withInput("userId", thread.getVariable("slackUserId"))
              .withInput("channelId", thread.getVariable("slackChannelId"))
              .withOutput(thread.getVariable("parsedIntent"));
        
        // Step 2: Execute campaign action based on parsed intent
        thread.execute("execute-campaign-action")
              .withInput("intent", thread.getVariable("parsedIntent"))
              .withInput("originalCommand", thread.getVariable("slackCommand"))
              .withOutput(thread.getVariable("campaignResult"));
        
        // Step 3: Send status back to Slack
        thread.execute("send-slack-response")
              .withInput("result", thread.getVariable("campaignResult"))
              .withInput("responseUrl", thread.getVariable("slackResponseUrl"))
              .withInput("channelId", thread.getVariable("slackChannelId"))
              .withInput("userId", thread.getVariable("slackUserId"))
              .withOutput(thread.getVariable("finalStatus"));
        
        log.info("Marketing campaign workflow completed");
    }
    
    /**
     * Create and deploy workflow specification
     */
    public static void deployWorkflow(LHConfig config) {
        try {
            MarketingCampaignWorkflow workflow = new MarketingCampaignWorkflow();
            workflow.registerWf(config);
            log.info("✅ Marketing Campaign Workflow deployed successfully");
        } catch (Exception e) {
            log.error("❌ Failed to deploy workflow: {}", e.getMessage(), e);
            throw new RuntimeException("Workflow deployment failed", e);
        }
    }
}