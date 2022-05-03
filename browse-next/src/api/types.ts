export type JwtToken<T> = string;

export interface FieldValidationError {
  msg: string;
  location: "body" | "query" | "param";
  param: string;
}

export interface ErrorResult {
  messages: string[];
  errors?: string[] | FieldValidationError[];
  errorType?: string;
}

export interface ValidationErrorResult extends ErrorResult {
  messages: string[];
  errors: FieldValidationError[];
  errorType?: "validation";
}

interface SuccessFetchResult<SUCCESS> {
  result: SUCCESS;
  success: true;
  status: number;
}

interface FailureFetchResult<FAILURE = ErrorResult> {
  result: FAILURE;
  success: false;
  status: number;
}

export type FetchResult<T> = SuccessFetchResult<T> | FailureFetchResult;
