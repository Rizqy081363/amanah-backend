# Frontend Delegation Workflow

This document defines the backend-to-frontend delegation package for Amanah Healthcare features.

Use it when a backend feature, API contract, or product workflow needs frontend implementation or frontend integration.

The goal is to give frontend engineers enough verified information to build against the real backend contract without reverse-engineering controllers, DTOs, guards, or service behavior from source code.

---

## Core Rule

Do not delegate frontend work until the shared contract is stable enough to implement.

If a required behavior cannot be verified from source code, documentation, generated OpenAPI, tests, or explicit product requirements, mark it as:

```text
UNKNOWN - clarification required
```

Do not convert unknown behavior into a frontend assumption.

---

## Sources of Truth

Use these sources before preparing a frontend delegation package:

- Existing feature specification under `docs/features/`, when present.
- NestJS controllers and route decorators.
- DTOs and class-validator decorators.
- Guards, roles, and public-route decorators.
- Service methods called by the controller.
- Thrown exceptions and global exception filters.
- Generated OpenAPI document from the running backend.
- Relevant architecture rules in `docs/database-amanah-healthcare/`.
- Existing frontend or mobile references only when they are explicitly identified as current requirements.

Swagger/OpenAPI is documentation of the backend contract, but the implementation remains the first reality check when there is a mismatch.

---

## Responsibility Split

Frontend owns:

- presentation
- UI state
- user interaction
- client-side form behavior
- API integration
- loading states
- empty states
- error states
- disabled states
- permission-dependent rendering

Backend owns:

- business rules
- authorization
- validation
- persistence
- transactional behavior
- domain logic
- API behavior
- error semantics
- generated OpenAPI accuracy

Shared contract:

- request schema
- response schema
- HTTP method and path
- path and query parameters
- status codes
- validation errors
- business errors
- enum values
- pagination, filtering, and sorting semantics
- authentication and authorization requirements

---

## Required Delegation Package

Every frontend delegation package must include:

- Feature name.
- Goal.
- Actors and permissions.
- User flow.
- UI requirements.
- API contract.
- Authentication requirements.
- Request examples using non-production data.
- Response examples using non-production data.
- Error semantics.
- Loading, empty, success, and failure states.
- Acceptance criteria.
- Out-of-scope items.
- Unknowns, if any.

Do not send "same as existing screen" without naming the exact existing screen and the behavior that should be reused.

---

## Delegation Template

Copy this template into the relevant feature specification or delegation note.

````markdown
# Frontend Delegation - Feature Name

## Goal

Describe the user-facing outcome.

## Actors & Permissions

- Actor:
- Required authentication:
- Required role or permission:
- Public access:

## User Flow

1. User starts from:
2. User action:
3. Backend request:
4. Success result:
5. Failure result:

## UI Requirements

### Screen

Describe the screen or route.

### Components

- Component:
- Purpose:

### States

- Loading:
- Empty:
- Success:
- Validation error:
- Business error:
- Authorization error:
- Network/server error:
- Disabled state:

## API Contract

### Endpoint

```http
METHOD /api/v1/resource
```

### Authentication

Describe bearer token, public access, or other real guard behavior.

### Path Parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | UUID when verified |

### Query Parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| page | number | no | Use actual backend default |

### Request Body

```json
{
  "field": "example"
}
```

### Success Response

Status:

```json
{
  "data": {}
}
```

### Error Responses

| Status | Code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Request fails DTO validation |
| 401 | UNAUTHORIZED | Missing or invalid credentials |
| 403 | FORBIDDEN | Authenticated actor lacks permission |
| 404 | NOT_FOUND | Resource does not exist |
| 409 | CONFLICT | Business conflict |
| 412 | PRECONDITION_FAILED | Optimistic concurrency version mismatch |
| 429 | RATE_LIMIT_EXCEEDED | Rate limit exceeded |

Remove any rows that the real endpoint cannot emit.

## Frontend Validation

List only client-side validation that mirrors the backend contract for user experience.

Backend validation remains authoritative.

## Acceptance Criteria

- Given:
- When:
- Then:

## Out of Scope

- Explicitly excluded behavior.

## Unknowns

- UNKNOWN - clarification required:
````

---

## OpenAPI Requirements

Before delegation:

- The route must be present in the generated OpenAPI spec.
- Auth documentation must match the real guard chain.
- Request DTOs must match class-validator behavior.
- Response schemas must match actual controller/service output.
- Error responses must include real thrown exceptions from controller and service layers.
- Examples must use safe non-production data.
- "Try it out" must work against a reachable non-production instance for at least one endpoint in the tag.

If OpenAPI and implementation disagree, fix the source decorators or implementation before delegating.

---

## Frontend Implementation Expectations

Frontend implementation should:

- Use the documented API contract.
- Display loading, empty, success, and error states from the delegation package.
- Treat backend Problem Details responses as the source of machine-readable error codes.
- Avoid duplicating backend business rules except for lightweight UX validation.
- Avoid hard-coding enum values unless they are part of the documented shared contract.
- Preserve documented pagination, filtering, sorting, and cache semantics.
- Handle `401`, `403`, `404`, `409`, `412`, and `429` according to the endpoint contract when those statuses are documented.

---

## Readiness Checklist

Frontend work is ready to start when:

```text
[ ] Goal is clear
[ ] Actors and permissions are identified
[ ] User flow is defined
[ ] UI states are defined
[ ] API endpoint is verified from implementation
[ ] Request schema is verified from DTOs
[ ] Response schema is verified from implementation
[ ] Error semantics are verified from thrown exceptions and filters
[ ] Generated OpenAPI includes the endpoint
[ ] Auth behavior matches the real guard chain
[ ] Acceptance criteria are testable
[ ] Out-of-scope items are listed
[ ] Unknowns are resolved or explicitly documented
```

---

## Definition of Done

Frontend delegation is complete when:

```text
Delegation package exists
AND
API contract matches backend implementation
AND
OpenAPI is synchronized
AND
UI states are documented
AND
Error semantics are documented
AND
Acceptance criteria are testable
AND
Unknowns are listed
AND
Out-of-scope behavior is explicit
```
