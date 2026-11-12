export const httpError = (statusCode: number, message: string) => {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
};

export const statusCodeOf = (error: unknown): number => {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const statusCode = (error as { statusCode: unknown }).statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode <= 599) return statusCode;
  }
  return 500;
};
