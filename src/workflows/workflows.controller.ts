import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  create(@Body() createWorkflowDto: CreateWorkflowDto) {
    return this.workflowsService.create(createWorkflowDto);
  }

  @Get()
  findAll() {
    return this.workflowsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflowsService.findOne(id);
  }

  @Post(':id/execute')
  execute(@Param('id') id: string) {
    return this.workflowsService.executeWorkflow(id);
  }

  @Get('executions/:id')
  getExecution(@Param('id') id: string) {
    return this.workflowsService.getExecution(id);
  }
}
