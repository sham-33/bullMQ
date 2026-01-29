import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';
import { Workflow } from './entities/workflow.entity';
import { WorkflowExecution } from './entities/workflow-execution.entity';
import { WorkflowProcessor } from './workflow.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workflow, WorkflowExecution]),
    BullModule.registerQueue({
      name: 'workflow',
    }),
  ],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowProcessor],
})
export class WorkflowsModule {}
