import {
  IsString,
  IsArray,
  ValidateNested,
  IsOptional,
  IsNotEmpty,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowStepDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsNotEmpty()
  payload: any;

  @IsOptional()
  retryConfig?: {
    attempts: number;
    backoff: number;
  };

  @IsOptional()
  delay?: number;
}

export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowStepDto)
  steps: WorkflowStepDto[];
}
