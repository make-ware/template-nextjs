// Public surface of the `@template-ware/shared` package.
//
// Per the project architecture this exposes shared **types, schemas, and
// utility functions** only. Mutators and services are application-specific and
// live under `@/mutators` and `@/services` (reachable as
// `@template-ware/shared/mutators` for the data layer).
export * from '../schema';
export * from '../lib/loading-manager';
export * from '../lib/errors';
export * from '../lib/retry';
