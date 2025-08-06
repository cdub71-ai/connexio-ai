import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import FileEnrichmentWorker from './workers/file-enrichment-worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test Phase 1 File Processing Workflow
 */
async function testPhase1Workflow() {
  console.log('🚀 Testing Phase 1 File Processing Workflow\n');

  const worker = new FileEnrichmentWorker();
  
  try {
    // Test file path
    const testFilePath = path.join(__dirname, '../../test-sample.csv');
    
    // Check if test file exists
    try {
      await fs.access(testFilePath);
      console.log('✅ Test file found:', testFilePath);
    } catch (error) {
      console.error('❌ Test file not found:', testFilePath);
      return;
    }

    // Get file stats
    const stats = await fs.stat(testFilePath);
    console.log('📊 File size:', Math.round(stats.size / 1024) + 'KB');

    // Create file specification
    const fileSpec = {
      fileName: 'test-sample.csv',
      filePath: testFilePath,
      fileSize: stats.size,
      format: 'csv',
      columns: null, // Auto-detect
    };

    console.log('\n⏳ Starting file processing...');

    // Process the file
    const result = await worker.processFile(fileSpec);

    // Display results
    console.log('\n📋 PROCESSING RESULTS:');
    console.log('==================');
    
    if (result.success) {
      console.log('✅ Status: SUCCESS');
      console.log('🆔 Process ID:', result.processId);
      console.log('⏱️  Duration:', result.processing.duration + 'ms');
      
      console.log('\n📊 VALIDATION SUMMARY:');
      console.log('- Total Records:', result.validation.totalRecords);
      console.log('- Valid Records:', result.validation.validRecords);
      console.log('- Invalid Records:', result.validation.invalidRecords);
      console.log('- Validation Rate:', Math.round((result.validation.validRecords / result.validation.totalRecords) * 100) + '%');
      
      console.log('\n📧 EMAIL VALIDATION:');
      console.log('- Valid:', result.validation.emailValidation.valid);
      console.log('- Invalid:', result.validation.emailValidation.invalid);
      console.log('- Questionable:', result.validation.emailValidation.questionable);
      
      console.log('\n📞 PHONE VALIDATION:');
      console.log('- Valid:', result.validation.phoneValidation.valid);
      console.log('- Invalid:', result.validation.phoneValidation.invalid);
      console.log('- Formatted:', result.validation.phoneValidation.formatted);
      
      console.log('\n📄 OUTPUT FILE:');
      console.log('- File Name:', result.output.fileName);
      console.log('- Format:', result.output.format);
      console.log('- Record Count:', result.output.recordCount);
      console.log('- Download URL:', result.output.downloadUrl);
      
      console.log('\n🔧 PROCESSING STEPS:');
      result.processing.steps.forEach((step, index) => {
        const status = step.success ? '✅' : '❌';
        console.log(`${index + 1}. ${status} ${step.name} (${step.endTime ? Math.round((new Date(step.endTime) - new Date(step.startTime))) + 'ms' : 'pending'})`);
        if (step.error) {
          console.log(`   Error: ${step.error}`);
        }
        if (step.metrics) {
          console.log(`   Metrics:`, step.metrics);
        }
      });
      
      if (result.warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        result.warnings.forEach((warning, index) => {
          console.log(`${index + 1}. ${warning}`);
        });
      }
      
    } else {
      console.log('❌ Status: FAILED');
      console.log('Error:', result.error);
      
      if (result.processing.steps.length > 0) {
        console.log('\n🔧 PROCESSING STEPS:');
        result.processing.steps.forEach((step, index) => {
          const status = step.success ? '✅' : '❌';
          console.log(`${index + 1}. ${status} ${step.name}`);
          if (step.error) {
            console.log(`   Error: ${step.error}`);
          }
        });
      }
    }

    if (result.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      result.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.stage || 'Unknown'}: ${error.error}`);
      });
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error.stack);
  }

  console.log('\n🏁 Test completed');
}

// Demo function to show what the workflow will do
function showWorkflowDemo() {
  console.log('📋 PHASE 1 FILE PROCESSING WORKFLOW DEMO');
  console.log('=========================================\n');
  
  console.log('🎯 PHASE 1 OBJECTIVES:');
  console.log('1. ✅ File Upload & Parsing (CSV)');
  console.log('2. ✅ Email Validation & Quality Scoring');
  console.log('3. ✅ Phone Number Validation & Formatting');
  console.log('4. ✅ Data Quality Assessment');
  console.log('5. ✅ Standardized Output Generation');
  console.log('6. ✅ Slack Integration for File Processing\n');
  
  console.log('📊 STANDARD OUTPUT COLUMNS:');
  const columns = [
    'email', 'email_valid', 'email_deliverable', 'email_quality_score',
    'phone', 'phone_valid', 'phone_formatted', 'phone_type', 'phone_quality_score',
    'first_name', 'last_name', 'company', 'title', 'city', 'state', 'country',
    'validation_status', 'quality_score', 'processing_notes'
  ];
  columns.forEach((col, index) => {
    console.log(`${index + 1}. ${col}`);
  });
  
  console.log('\n🔄 PROCESSING PIPELINE:');
  console.log('1. File Validation → Check format, size, structure');
  console.log('2. Data Parsing → Extract records, detect columns');
  console.log('3. Record Validation → Validate emails, phones, required fields');
  console.log('4. Quality Scoring → Calculate individual and overall scores');
  console.log('5. Output Generation → Create standardized CSV with results');
  
  console.log('\n📱 SLACK COMMANDS:');
  console.log('• `/validate-file` - Get help and instructions');
  console.log('• `/validate-file start` - Process uploaded CSV file');
  console.log('• `/validate-file status` - Check processing status');
  console.log('• `/help` - Show all available commands');
  
  console.log('\n🔮 PHASE 2 PREVIEW (Coming Next):');
  console.log('• 🔍 External data enrichment (Apollo, Leadspace)');
  console.log('• 📊 Excel file support');
  console.log('• 🎯 Advanced email deliverability checking');
  console.log('• 🌍 International phone number validation');
  console.log('• 🧹 List hygiene and deduplication');
  
  console.log('\n' + '='.repeat(50));
}

// Run the demo
if (process.argv.includes('--demo')) {
  showWorkflowDemo();
} else if (process.argv.includes('--test')) {
  testPhase1Workflow().catch(console.error);
} else {
  console.log('Usage:');
  console.log('  node test-phase1-workflow.js --demo   (Show workflow overview)');
  console.log('  node test-phase1-workflow.js --test   (Run actual test - requires services)');
  console.log('');
  showWorkflowDemo();
}