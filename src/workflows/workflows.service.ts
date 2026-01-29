import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Workflow } from './entities/workflow.entity';
import {
  WorkflowExecution,
  WorkflowStatus,
} from './entities/workflow-execution.entity';
import { CreateWorkflowDto } from './dto/create-workflow.dto';

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectRepository(Workflow)
    private workflowsRepository: Repository<Workflow>,
    @InjectRepository(WorkflowExecution)
    private executionsRepository: Repository<WorkflowExecution>,
    @InjectQueue('workflow') private workflowQueue: Queue,
  ) {}

  async create(createWorkflowDto: CreateWorkflowDto): Promise<Workflow> {
    const workflow = this.workflowsRepository.create(createWorkflowDto);
    return this.workflowsRepository.save(workflow);
  }

  async findAll(): Promise<Workflow[]> {
    return this.workflowsRepository.find();
  }

  async findOne(id: string): Promise<Workflow> {
    const workflow = await this.workflowsRepository.findOne({ where: { id } });
    if (!workflow) throw new NotFoundException(`Workflow ${id} not found`);
    return workflow;
  }

  async executeWorkflow(id: string): Promise<WorkflowExecution> {
    const workflow = await this.findOne(id);

    const execution = this.executionsRepository.create({
      workflow,
      workflowId: workflow.id,
      status: WorkflowStatus.RUNNING,
      currentStepIndex: 0,
      state: {},
    });

    await this.executionsRepository.save(execution);

    // Add initial job to queue
    await this.workflowQueue.add(
      'init-workflow',
      {
        executionId: execution.id,
        workflowId: workflow.id,
      },
      {
        jobId: `exec-${execution.id}-init`, // Deduplication
      },
    );

    return execution;
  }

  async getExecution(id: string): Promise<WorkflowExecution> {
    const execution = await this.executionsRepository.findOne({
      where: { id },
    });
    if (!execution) throw new NotFoundException(`Execution ${id} not found`);
    return execution;
  }
}
