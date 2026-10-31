import type { ChannelType, DecryptedChannel, LocalFileStorage, MediaUploadDescriptor } from "@multipost/core";
import type { PlatformRenderResult } from "@multipost/renderers";

export class ConnectorError extends Error {
  readonly retryable: boolean;
  readonly code?: string;
  readonly details?: unknown;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: {
      retryable?: boolean;
      code?: string;
      details?: unknown;
      retryAfterMs?: number;
    } = {}
  ) {
    super(message);
    this.name = "ConnectorError";
    this.retryable = options.retryable ?? false;
    this.code = options.code;
    this.details = options.details;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export type PublishConnectorInput = {
  channel: DecryptedChannel;
  render: PlatformRenderResult;
  media: MediaUploadDescriptor[];
  storage: LocalFileStorage;
};

export type TestConnectorInput = {
  channel: DecryptedChannel;
};

export type PublishConnectorResult = {
  externalIds?: Record<string, unknown>;
  requestPayload?: unknown;
  responsePayload?: unknown;
};

export type TestConnectorResult = {
  message: string;
  externalIds?: Record<string, unknown>;
  requestPayload?: unknown;
  responsePayload?: unknown;
};

export interface ChannelConnector<TType extends ChannelType = ChannelType> {
  readonly type: TType;
  publish(input: PublishConnectorInput): Promise<PublishConnectorResult>;
  test(input: TestConnectorInput): Promise<TestConnectorResult>;
}
