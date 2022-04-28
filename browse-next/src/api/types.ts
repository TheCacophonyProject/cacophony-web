export type JwtToken<T> = string;

export interface ErrorResult {
  messages: string[];
  errors?: string[];
  errorType?: string;
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
