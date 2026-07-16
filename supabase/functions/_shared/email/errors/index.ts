export class EmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailConfigError';
  }
}

export class EmailProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailProviderError';
  }
}

export class EmailValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailValidationError';
  }
}
