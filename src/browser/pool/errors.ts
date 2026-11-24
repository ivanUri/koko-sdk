export class PoolClosedError extends Error {
  constructor(message = "Koko pool is closed") {
    super(message);
    this.name = "PoolClosedError";
  }
}

export class PoolQueueFullError extends Error {
  constructor(message = "Koko pool queue is full") {
    super(message);
    this.name = "PoolQueueFullError";
  }
}

export class PoolAcquireTimeoutError extends Error {
  constructor(message = "Timed out waiting for a Koko pool worker") {
    super(message);
    this.name = "PoolAcquireTimeoutError";
  }
}
