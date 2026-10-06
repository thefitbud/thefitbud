import type { MiddlewareHandler } from "hono";
import { describeRoute, resolver, type DescribeRouteOptions } from "hono-openapi";
import { apiDataEnvelopeSchema, apiErrorBodySchema } from "@fitbud/contracts";
import type { ZodTypeAny } from "zod";

export type OperationSecurity = "public" | "sessionOrBearer" | "bearer";
export type FitbudRole = "trainer" | "trainee";

type JsonSchema = Record<string, unknown>;

export type OpenApiParameter = {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  required?: boolean;
  description: string;
  schema: JsonSchema;
};

type SuccessStatus = number | number[];

export type OperationInput = {
  tag: string;
  summary: string;
  description: string;
  security?: OperationSecurity;
  roles?: FitbudRole[];
  idempotency?: boolean;
  parameters?: OpenApiParameter[];
  body?: ZodTypeAny;
  bodyRequired?: boolean;
  binaryRequest?: boolean;
  successStatus?: SuccessStatus;
  successDescription?: string;
  response?: ZodTypeAny;
  envelope?: boolean;
  binaryResponse?: boolean;
  html?: boolean;
  websocketMessage?: ZodTypeAny;
  errors?: Array<{ status: number; description: string }>;
  defaultErrors?: boolean;
};

const errorContent = {
  "application/json": { schema: resolver(apiErrorBodySchema) },
};

function jsonResolver(schema: ZodTypeAny) {
  return resolver(schema as Parameters<typeof resolver>[0]);
}

function errorResponse(description: string) {
  return { description, content: errorContent };
}

const roleHeader: OpenApiParameter = {
  name: "x-fitbud-role",
  in: "header",
  required: false,
  description:
    "Optional role selection when the account can act as trainer or trainee. Allowed values are trainer and trainee.",
  schema: { type: "string", enum: ["trainer", "trainee"] },
};

export function idempotencyKeyParameter(): OpenApiParameter {
  return {
    name: "Idempotency-Key",
    in: "header",
    required: true,
    description:
      "Required. Stable key for this logical mutation. Reuse the same key when retrying that action.",
    schema: { type: "string", minLength: 1 },
  };
}

export function cursorParameter(): OpenApiParameter {
  return {
    name: "cursor",
    in: "query",
    required: false,
    description: "Opaque cursor from a previous nextCursor. Omit it to read the first page.",
    schema: { type: "string" },
  };
}

export function limitParameter(options: {
  defaultValue: number;
  maximum: number;
  invalid?: "fallback" | "reject";
}): OpenApiParameter {
  const invalid = options.invalid ?? "fallback";
  const invalidText =
    invalid === "reject"
      ? "A present value that is not a finite number is rejected."
      : "A missing or non-numeric value falls back to the default. The handler then clamps the value.";
  return {
    name: "limit",
    in: "query",
    required: false,
    description: `Page size. Default ${options.defaultValue}. Maximum ${options.maximum}. ${invalidText}`,
    schema: {
      type: "integer",
      minimum: 1,
      maximum: options.maximum,
      default: options.defaultValue,
    },
  };
}

export function dateWindowParameters(): OpenApiParameter[] {
  return [
    {
      name: "fromDate",
      in: "query",
      required: false,
      description:
        "Optional civil start date (YYYY-MM-DD). Invalid values are rejected. Omitted means no start bound.",
      schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
    {
      name: "toDate",
      in: "query",
      required: false,
      description:
        "Optional civil end date (YYYY-MM-DD). Invalid values are rejected. Omitted means no end bound.",
      schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
  ];
}

export function signedFileParameters(): OpenApiParameter[] {
  return [
    {
      name: "exp",
      in: "query",
      required: false,
      description:
        "Unix expiry for a signed file access token. Together with sig, this can authorize the request without a session.",
      schema: { type: "string" },
    },
    {
      name: "sig",
      in: "query",
      required: false,
      description:
        "Signature for a time-limited file access token. Together with exp, this can authorize the request without a session.",
      schema: { type: "string" },
    },
  ];
}

export function exceptionStatusParameter(): OpenApiParameter {
  return {
    name: "status",
    in: "query",
    required: false,
    description:
      "Optional exception status filter. When omitted, detected and active exceptions are returned.",
    schema: {
      type: "string",
      enum: ["detected", "active", "acknowledged", "resolved"],
    },
  };
}

export function planFilterParameters(): OpenApiParameter[] {
  return [
    {
      name: "versionStatus",
      in: "query",
      required: false,
      description:
        "Optional plan version status: draft, published, scheduled, effective, or superseded. Omitted returns every version, including drafts.",
      schema: {
        type: "string",
        enum: ["draft", "published", "scheduled", "effective", "superseded"],
      },
    },
    {
      name: "effectiveFrom",
      in: "query",
      required: false,
      description:
        "Optional ISO-8601 start of an effective-interval overlap window. Versions without effectiveFrom do not match a date window.",
      schema: { type: "string", format: "date-time" },
    },
    {
      name: "effectiveTo",
      in: "query",
      required: false,
      description:
        "Optional ISO-8601 end of an effective-interval overlap window. An open-ended version overlaps when it has already started.",
      schema: { type: "string", format: "date-time" },
    },
  ];
}

export function historyFilterParameters(): OpenApiParameter[] {
  return [
    {
      name: "kind",
      in: "query",
      required: false,
      description:
        "Optional history item kind. Applied in the matching source query before that source's row cap.",
      schema: { type: "string" },
    },
    {
      name: "occurredFrom",
      in: "query",
      required: false,
      description:
        "Optional ISO-8601 lower bound on the source occurred time. Applied before the per-source row cap.",
      schema: { type: "string", format: "date-time" },
    },
    {
      name: "occurredTo",
      in: "query",
      required: false,
      description:
        "Optional ISO-8601 upper bound on the source occurred time. Applied before the per-source row cap.",
      schema: { type: "string", format: "date-time" },
    },
  ];
}

export function activityQueryParameters(): OpenApiParameter[] {
  return [
    {
      name: "type",
      in: "query",
      required: true,
      description: "Activity type: workout, meal, or checkin.",
      schema: { type: "string", enum: ["workout", "meal", "checkin"] },
    },
    {
      name: "state",
      in: "query",
      required: false,
      description:
        "Optional derived state for the requested type. A state that belongs to a different type is rejected.",
      schema: { type: "string" },
    },
    {
      name: "occurredFrom",
      in: "query",
      required: false,
      description: "Optional civil start date (YYYY-MM-DD) on the assignment or check-in.",
      schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
    {
      name: "occurredTo",
      in: "query",
      required: false,
      description: "Optional civil end date (YYYY-MM-DD) on the assignment or check-in.",
      schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    },
  ];
}

export function relationshipIdQueryParameter(): OpenApiParameter {
  return {
    name: "relationshipId",
    in: "query",
    required: false,
    description:
      "Coaching relationship whose onboarding form should be resolved. Required for a trainee who cannot be resolved from a single relationship.",
    schema: { type: "string", format: "uuid" },
  };
}

export function realtimeAccessParameters(): OpenApiParameter[] {
  return [
    {
      name: "access_token",
      in: "query",
      required: false,
      description:
        "Firebase ID token for clients that cannot set an Authorization header on a socket. Ignored when a bearer header is already present.",
      schema: { type: "string" },
    },
    {
      name: "role",
      in: "query",
      required: false,
      description: "Optional trainer or trainee role when the x-fitbud-role header is absent.",
      schema: { type: "string", enum: ["trainer", "trainee"] },
    },
  ];
}

function roleSentence(roles: FitbudRole[] | undefined): string {
  if (!roles || roles.length === 0) {
    return "The handler does not add a further role restriction beyond an authenticated actor.";
  }
  if (roles.length === 1) return `Requires the ${roles[0]} role.`;
  return `Requires the ${roles.join(" or ")} role.`;
}

function authParagraph(input: OperationInput): string {
  if ((input.security ?? "sessionOrBearer") === "public") {
    return "No authentication is required.";
  }
  if (input.security === "bearer") {
    return "Requires a Firebase bearer token. A session cookie is not accepted, because the caller may not have a FitBud account yet. The server resolves the actor from that token.";
  }
  return `Accepts the session cookie (default name fitbud_session) or a Firebase bearer token. ${roleSentence(input.roles)} Send x-fitbud-role to select trainer or trainee. The server resolves the actor and allows access only to coaching relationships that actor owns or belongs to.`;
}

function successStatuses(status: SuccessStatus | undefined): number[] {
  if (status === undefined) return [200];
  return Array.isArray(status) ? status : [status];
}

function jsonSuccess(input: OperationInput) {
  const schema = input.response;
  if (!schema) {
    throw new Error(`OpenAPI operation "${input.summary}" is missing a response schema.`);
  }
  const wrapped = input.envelope === false ? schema : apiDataEnvelopeSchema(schema);
  return {
    description: input.successDescription ?? "Success.",
    content: { "application/json": { schema: jsonResolver(wrapped) } },
  };
}

function defaultErrorList(securityMode: OperationSecurity) {
  if (securityMode === "public") {
    return [
      { status: 400, description: "The request was rejected." },
      { status: 401, description: "Authentication was rejected." },
    ];
  }
  return [
    { status: 400, description: "The request was rejected." },
    { status: 401, description: "Authentication is required or was rejected." },
    {
      status: 403,
      description:
        "The account is disabled, the role is not permitted, or the actor may not perform this action.",
    },
    {
      status: 404,
      description:
        "The record was not found for this actor. Another trainer's records are not disclosed.",
    },
    {
      status: 409,
      description: "The request conflicts with the current version or an idempotency replay.",
    },
  ];
}

export function operation(input: OperationInput): MiddlewareHandler {
  const securityMode = input.security ?? "sessionOrBearer";
  const parameters: OpenApiParameter[] = [];
  if (securityMode === "sessionOrBearer") parameters.push(roleHeader);
  if (input.idempotency) parameters.push(idempotencyKeyParameter());
  if (input.parameters) parameters.push(...input.parameters);

  const responses: NonNullable<DescribeRouteOptions["responses"]> = {};
  if (input.websocketMessage) {
    responses[426] = errorResponse(
      "WEBSOCKET_UPGRADE_REQUIRED. A request that is not a WebSocket upgrade.",
    );
    responses[101] = {
      description:
        "Switching Protocols. Each socket text frame is a JSON object matching realtimeEventSchema. That schema is the socket message, not an HTTP response body.",
      content: {
        "application/x.fitbud-websocket-message+json": {
          schema: jsonResolver(input.websocketMessage),
        },
      },
    };
  } else if (input.html) {
    responses[200] = {
      description: input.successDescription ?? "HTML API reference.",
      content: { "text/html": { schema: { type: "string" } } },
    };
  } else if (input.binaryResponse) {
    for (const status of successStatuses(input.successStatus)) {
      responses[status] = {
        description: input.successDescription ?? "File bytes.",
        content: {
          "application/octet-stream": { schema: { type: "string", format: "binary" } },
        },
      };
    }
  } else if (input.response) {
    const success = jsonSuccess(input);
    for (const status of successStatuses(input.successStatus)) responses[status] = success;
  }

  const defaultErrors = input.defaultErrors === false ? [] : defaultErrorList(securityMode);
  for (const error of [...defaultErrors, ...(input.errors ?? [])]) {
    if (responses[error.status]) continue;
    responses[error.status] = errorResponse(error.description);
  }
  if (!responses[500]) {
    responses[500] = errorResponse("An unexpected server error occurred.");
  }

  const security: Array<Record<string, string[]>> =
    securityMode === "public"
      ? []
      : securityMode === "bearer"
        ? [{ bearerAuth: [] }]
        : [{ sessionCookie: [] }, { bearerAuth: [] }];
  const spec: DescribeRouteOptions = {
    tags: [input.tag],
    summary: input.summary,
    description: `${input.description.trim()} ${authParagraph(input)}`,
    parameters,
    responses,
    security,
  };
  if (input.roles && input.roles.length > 0) {
    Object.assign(spec, { "x-fitbud-roles": input.roles });
  }
  if (input.binaryRequest) {
    spec.requestBody = {
      required: true,
      content: {
        "application/octet-stream": { schema: { type: "string", format: "binary" } },
      },
    };
  } else if (input.body) {
    spec.requestBody = {
      required: input.bodyRequired !== false,
      content: { "application/json": { schema: jsonResolver(input.body) } },
    };
  }
  return describeRoute(spec);
}

export const fitbudOpenApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "FitBud API",
    version: "0.0.0",
    description:
      "HTTP API for FitBud coaching. Successful JSON responses use a data envelope. Binary file content does not. The server resolves the actor, role, and ownership on every protected request.",
  },
  servers: [{ url: "/", description: "This API origin" }],
  tags: [
    { name: "Health", description: "Service health." },
    { name: "Auth", description: "Session exchange and the current actor." },
    { name: "Invitations", description: "Trainer invitations and trainee acceptance." },
    { name: "Relationships", description: "Coaching relationships visible to the caller." },
    { name: "Subscriptions", description: "Relationship subscription terms and renewal attention." },
    { name: "Onboarding", description: "Onboarding form resolution, draft, submit, and review." },
    { name: "Configurations", description: "Coaching configuration drafts and activation." },
    { name: "Plans", description: "Plan drafts, published versions, and effective plans." },
    { name: "Templates", description: "Trainer plan templates." },
    { name: "Libraries", description: "Exercise and food libraries." },
    { name: "Workouts", description: "Workout assignments and execution." },
    { name: "Meals", description: "Meal assignments and compliance." },
    { name: "Checkins", description: "Check-in scheduling, submission, and review." },
    { name: "Exceptions", description: "Derived exceptions and trainer interventions." },
    { name: "Progress", description: "Measurements, progress entries, and summary." },
    { name: "History", description: "Readable coaching history for a relationship." },
    { name: "Files", description: "Media upload and download targets." },
    { name: "Sync", description: "Offline trainee sync push and pull." },
    { name: "Notifications", description: "Device tokens, preferences, inbox, and reminder rules." },
    { name: "Realtime", description: "Relationship change hints. REST and sync stay authoritative." },
    { name: "Documentation", description: "Generated OpenAPI document and interactive reference." },
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey" as const,
        in: "cookie" as const,
        name: "fitbud_session",
        description:
          "Session cookie. The default cookie name is fitbud_session. Most protected routes accept this cookie or a bearer token.",
      },
      bearerAuth: {
        type: "http" as const,
        scheme: "bearer",
        bearerFormat: "Firebase ID token",
        description: "Firebase ID token. POST /invitations/accept accepts only a bearer token.",
      },
    },
  },
};

export const openApiRouteOptions = {
  documentation: fitbudOpenApiDocument,
  excludeStaticFile: false,
  defaultValidationErrorResponse: false,
};
