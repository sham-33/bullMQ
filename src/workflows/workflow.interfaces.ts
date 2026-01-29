export interface WorkflowStep {
  type: string;
  payload: any;
  retryConfig?: {
    attempts: number;
    backoff: number;
  };
  delay?: number;
}

export interface WorkflowJobData {
  executionId: string;
  workflowId: string;
  stepIndex?: number;
  result?: any;
}
