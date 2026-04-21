declare type DurableObjectNamespace<T = unknown> = {
  readonly __brand?: T;
};

declare type ExportedHandler<E = unknown> = {
  readonly fetch: (
    request: Request,
    env: E,
    ctx: unknown,
  ) => Promise<Response> | Response;
};
