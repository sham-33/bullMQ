import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  WorkflowExecution,
  WorkflowStatus,
} from './entities/workflow-execution.entity';
import { Workflow } from './entities/workflow.entity';
import { WorkflowJobData, WorkflowStep } from './workflow.interfaces';

@Processor('workflow')
export class WorkflowProcessor extends WorkerHost {
  constructor(
    @InjectRepository(WorkflowExecution)
    private executionsRepository: Repository<WorkflowExecution>,
    @InjectRepository(Workflow)
    private workflowsRepository: Repository<Workflow>,
    @InjectQueue('workflow') private workflowQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<WorkflowJobData, any, string>): Promise<any> {
    console.log(`[${job.name}] Processing... ID: ${job.id}`);

    switch (job.name) {
      case 'init-workflow':
        return this.handleInitWorkflow(job);
      case 'execute-step':
        return this.handleExecuteStep(job);
      case 'complete-step':
        return this.handleCompleteStep(job);
      case 'fail-workflow':
        return this.handleFailWorkflow(job);
      default:
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  private async handleInitWorkflow(job: Job<WorkflowJobData>) {
    const { executionId } = job.data;
    const execution = await this.executionsRepository.findOne({
      where: { id: executionId },
      relations: ['workflow'],
    });

    if (!execution) throw new Error('Execution not found');

    if (!execution.workflow.steps || execution.workflow.steps.length === 0) {
      execution.status = WorkflowStatus.COMPLETED;
      await this.executionsRepository.save(execution);
      return { result: 'No steps, completed' };
    }

    execution.status = WorkflowStatus.RUNNING;
    execution.currentStepIndex = 0;
    await this.executionsRepository.save(execution);

    await this.workflowQueue.add(
      'execute-step',
      {
        executionId: execution.id,
        workflowId: execution.workflow.id,
        stepIndex: 0,
      },
      {
        jobId: `exec-${executionId}-step-0`,
      },
    );

    return { result: 'Started step 0' };
  }

  private async handleExecuteStep(job: Job<WorkflowJobData>) {
    const { executionId, stepIndex } = job.data;

    if (stepIndex === undefined || stepIndex === null) {
      throw new Error('stepIndex is undefined');
    }

    const execution = await this.executionsRepository.findOne({
      where: { id: executionId },
      relations: ['workflow'],
    });
    if (!execution) throw new Error('Execution not found');

    const step = execution.workflow.steps[stepIndex] as
      | WorkflowStep
      | undefined;
    if (!step) {
      // Should not happen if index is correct, but safe check to complete if overflow
      console.warn(
        `Step ${stepIndex} not found, completing workflow step safely.`,
      );
      return this.handleCompleteStep(job);
    }

    console.log(`Executing Step ${stepIndex}: ${step.type}`);

    // Simulation of work
    let result: any = null;
    try {
      if (step.type === 'DELAY') {
        const delayMs = (step.payload?.seconds || 1) * 1000;
        console.log(`Delaying for ${delayMs}ms...`);

        await this.workflowQueue.add(
          'complete-step',
          {
            executionId,
            workflowId: execution.workflow.id,
            stepIndex,
            result: { waited: delayMs },
          },
          {
            delay: delayMs,
            jobId: `exec-${executionId}-step-${stepIndex}-complete`,
          },
        );
        return { status: 'delayed' };
      } else if (step.type === 'SEND_EMAIL') {
        // Mock email sending
        const to = step.payload?.to || 'user@example.com';
        const template = step.payload?.template;
        result = { sentTo: to, template };
        // Simulate processing time
        await new Promise((r) => setTimeout(r, 500));
      } else if (step.type === 'HTTP_CALL') {
        // Mock HTTP
        result = { status: 200, data: 'mock response' };
      } else {
        result = { processed: true, type: step.type };
      }

      // If not delayed, complete immediately
      await this.workflowQueue.add(
        'complete-step',
        {
          executionId,
          workflowId: execution.workflow.id,
          stepIndex,
          result,
        },
        {
          jobId: `exec-${executionId}-step-${stepIndex}-complete`,
        },
      );
    } catch (error) {
      throw error;
    }
  }

  private async handleCompleteStep(job: Job<WorkflowJobData>) {
    const { executionId, stepIndex: jobStepIndex, result } = job.data;

    // Safety check for undefined
    const stepIndex = jobStepIndex ?? -1;
    if (stepIndex < 0) throw new Error('Invalid stepIndex');

    const execution = await this.executionsRepository.findOne({
      where: { id: executionId },
      relations: ['workflow'],
    });
    if (!execution) throw new Error('Execution not found');

    // Update state
    execution.state = execution.state || {};
    execution.state[`step_${stepIndex}`] = result;
    // We update to next step index based on current + 1 or logical next?
    // Usually stepIndex in job is the one that JUST completed.

    // Only increment if we are strictly following a linear path and this job corresponds to the current step.
    // Ideally we trust the job data.

    execution.currentStepIndex = stepIndex + 1;
    await this.executionsRepository.save(execution);

    // Check next step
    const nextIndex = stepIndex + 1;
    if (nextIndex < execution.workflow.steps.length) {
      const nextStep = execution.workflow.steps[nextIndex] as WorkflowStep;

      // Setup retry options based on step config
      const retryOpts = {
        attempts: nextStep.retryConfig?.attempts || 3,
        backoff: {
          type: 'exponential',
          delay: nextStep.retryConfig?.backoff || 1000,
        },
      };

      await this.workflowQueue.add(
        'execute-step',
        {
          executionId,
          workflowId: execution.workflow.id,
          stepIndex: nextIndex,
        },
        {
          jobId: `exec-${executionId}-step-${nextIndex}`,
          attempts: retryOpts.attempts,
          backoff: retryOpts.backoff,
          delay: nextStep.delay ? nextStep.delay * 1000 : 0, // Initial step delay if any
        },
      );
    } else {
      execution.status = WorkflowStatus.COMPLETED;
      await this.executionsRepository.save(execution);
      console.log(`Workflow ${executionId} COMPLETED`);
    }

    return { status: 'step-completed', nextIndex };
  }

  private async handleFailWorkflow(job: Job<WorkflowJobData>) {
    const { executionId } = job.data;
    const execution = await this.executionsRepository.findOne({
      where: { id: executionId },
    });
    if (execution) {
      execution.status = WorkflowStatus.FAILED;
      await this.executionsRepository.save(execution);
    }
  }

  // Hook for failed jobs
  @OnWorkerEvent('failed')
  async onJobFailed(job: Job, err: Error) {
    console.error(`Job ${job.id} failed: ${err.message}`);

    if (job.attemptsMade >= (job.opts.attempts || 1)) {
      if (job.name === 'execute-step') {
        const { executionId } = job.data;
        await this.workflowQueue.add('fail-workflow', { executionId });
      }
    }
  }
}
