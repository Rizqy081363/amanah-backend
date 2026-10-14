export interface IPasswordGenerator {
  generate(length?: number): string;
}

export const PASSWORD_GENERATOR_TOKEN = Symbol('IPasswordGenerator');
