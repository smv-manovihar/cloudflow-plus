# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

* State your assumptions explicitly. If uncertain, ask.
* If multiple interpretations exist, present them - don't pick silently.
* If a simpler approach exists, say so. Push back when warranted.
* If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

* No features beyond what was asked.
* No abstractions for single-use code.
* No "flexibility" or "configurability" that wasn't requested.
* No error handling for impossible scenarios.
* If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

* Don't "improve" adjacent code, comments, or formatting.
* Don't refactor things that aren't broken.
* Match existing style, even if you'd do it differently.
* If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

* Remove imports/variables/functions that YOUR changes made unused.
* Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

* "Add validation" → "Write tests for invalid inputs, then make them pass"
* "Fix the bug" → "Write a test that reproduces it, then make it pass"
* "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Clean Coding Standards & Practices

This guide outlines generalized, production-ready coding standards, architecture principles, and anti-patterns for modern full-stack applications utilizing a Python (FastAPI & Pydantic V2) backend and a TypeScript/React frontend.

---

## 1. Backend Standards (Python & FastAPI)

### Strict Type Safety & Imports

* **Explicit Type Annotations:** Mandatory static typing for all function arguments, return signatures, and class attributes using Python 3.12+ type hints (`type`, `list`, `dict`, `Union` via `|`).
* **Import Hoisting:** Always hoist all `import` statements to the absolute top of the file. NEVER place `import` statements inside functions, methods, or conditional branches (except for rare circular dependency resolutions).
* **Import Grouping:** Structure imports cleanly into three distinct blocks separated by single blank lines:
1. Standard library modules (`os`, `sys`, `datetime`, etc.)
2. Third-party packages (`fastapi`, `pydantic`, `sqlalchemy`, `motor`, etc.)
3. Local application modules (`app.core`, `app.services`, `app.models`, etc.)



### Pydantic V2 Usage

* **Exclusive V2 Syntax:** Strictly use Pydantic V2 APIs across all data validation, schemas, and settings management.
* Use `model_dump()` and `model_dump_json()` instead of `.dict()` or `.json()`.
* Use `model_validate()` instead of `.from_orm()`.
* Use `@field_validator` and `@model_validator` instead of deprecated `@validator` or `@root_validator`.
* Import `BaseSettings` and `SettingsConfigDict` exclusively from `pydantic_settings`.



### Layered Architecture (Router → Service → Store/Repository)

* **Lean Routers:** FastAPI route handlers must handle HTTP concerns only: request parsing, payload validation, status codes, and response formatting.
* **Business Logic:** All business logic, workflow orchestrations, and external API integrations belong strictly in the Service layer.
* **Data Persistence:** Database queries, transactions, and storage operations (SQLAlchemy, Motor, Redis) belong in dedicated Store or Repository layers. Routers must NEVER execute queries or interact with data engines directly.

### Request & Response Isolation

* **Explicit Data Contracts:** Always separate input schemas (`*Request`) from response schemas (`*Response`).
* **No Leaky Models:** Never return raw ORM entities (SQLAlchemy models, Mongo documents) directly from router endpoints. Always map outbound data into typed Pydantic response models.

### Error Handling

* **Centralized Exception Handling:** Raise custom domain exceptions or standard `HTTPException` inside routers and services.
* **Consistent Payload:** Ensure error responses follow a unified JSON schema across all endpoints (e.g., `{"detail": "Error message"}`).

### Datetime Handling & Serialization

* **Timezone Awareness:** All backend timestamps must be timezone-aware datetime objects defaulting to UTC (`datetime.now(timezone.utc)`).
* **ISO 8601 Serialization:** Ensure all datetime values exposed via REST APIs, webhooks, or SSE event streams are serialized using ISO 8601 format with an explicit `'Z'` suffix (`YYYY-MM-DDTHH:mm:ss.sssZ`).

---

## 2. Frontend Standards (TypeScript & React)

### Strict Type Safety

* **No Implicit Any:** Enable strict compiler configurations. The use of `any` is strictly prohibited. Use `unknown` for unpredictable data structures and execute runtime type guards.
* **Contract Synchronization:** Ensure TypeScript `interface` and `type` definitions exactly mirror backend Pydantic response models to maintain end-to-end type contract stability.
* **Type & Lint Verification:** Always verify that code changes pass type checking (`npm run typecheck`) and linting rules (`npm run lint`).

### Primitive Component Usage

* **UI Primitives Only:** For primitive components (e.g., buttons, inputs, cards, dialogs, dropdowns, tables, select elements), exclusively import and use shared UI library components (such as `components/ui`) instead of writing raw HTML elements (`<button>`, `<input>`) or importing arbitrary third-party wrappers.

### Page Layout Consistency

* **Container and Header Wrapper:** Every user-facing route page must be wrapped inside standardized layout/container components to ensure consistent padding, layout max-widths, and standard typography across both mobile and desktop viewports.

### Component Anatomy & Layout Lifecycle

Maintain a predictable and unified structural layout inside all React components to optimize readability:

1. **State Hooks:** `useState`
2. **Refs:** `useRef`
3. **Contexts:** `useContext`
4. **Memoized Logic:** `useMemo` and `useCallback`
5. **Side Effects:** `useEffect`
6. **Event Handlers:** Component-specific callback logic
7. **JSX Render Tree:** The returned presentation layout

### Ref Discipline

* **One ref per thing.** A DOM node gets exactly one ref, declared in the component that owns it. Never declare a second ref for a node that already has one.
* **Collections use one ref, not one ref per item.** Use a single `useRef(new Map())` populated by a callback ref, and delete the entry when the node unmounts:

```tsx
const itemRefs = useRef(new Map<string, HTMLLIElement>());

const setItemRef = (id: string) => (node: HTMLLIElement | null) => {
  if (node) itemRefs.current.set(id, node);
  else itemRefs.current.delete(id);
};

// <li key={item.id} ref={setItemRef(item.id)} />

```

* **Never mirror state in a ref.** If the value is rendered, it is state. Refs are only for values that must survive a render without causing one: DOM nodes, timers, abort controllers, subscriptions, mutable instances.
* **No orphan refs, no render-phase access.** Never read or write `ref.current` during render; confine access to effects and event handlers.

### API Layer Isolation

* **Decoupled Network Requests:** Components must never execute network requests (`fetch`, `axios`) directly. Encapsulate all network orchestration within abstract API modules, custom hooks, or state-management layers.

### Schema-Driven Form Validation

* **Declarative Validation:** Couple form states with declarative schemas (such as Zod) via form ecosystem engines (like `react-hook-form`).

---

## 3. General Architecture Principles

### Separation of Concerns (SoC)

* **Backend Layering:** Enforce a strict unidirectional architectural flow: **Presentation Layer (FastAPI Routers) → Business Logic Layer (Services) → Data Access Layer (Stores/Repositories)**.
* **Frontend Layering:** Separate logic from layout: **Routing Page → Orchestration Component → Custom Hook → API Client**.

### Zero-Fluff, Clear Formatting

* Code should speak for itself. Avoid decorative comment structures, large dividers, or redundant labeling. Rely on clean naming conventions and modular functions to dictate intent.

### Comment Hygiene

* **One line, one claim.** A comment is a single `//` or `#` line placed directly above the code it explains, under ~100 characters.
* **Hard ceiling: 3 lines.** Nothing in application code needs more. Block syntax (`/* ... */` or `""" ... """`) is reserved for docstrings/JSDoc on public API surfaces; never use it for inline narration.
* **Comment why, not what.** Exclude obvious restatements. A comment earns its tokens only if deleting it loses context not recoverable from code in 30 seconds.
* **Docstring standard:** Required for public API modules/functions when the name and types are not enough (`summary`, `Args`, `Returns`, exceptions). Keep it concise.

---

## 4. Operational Anti-Patterns (NEVER DO THESE)

* **Inline Dynamic Imports / Function Imports:** Never place `import` calls inside functions or methods in Python or TypeScript files, except when resolving rare circular dependency edge cases.
* **Deprecated Pydantic V1 Syntax:** Never use `.dict()`, `.json()`, `.from_orm()`, `@validator`, or `@root_validator` in Pydantic V2 codebases.
* **Raw Database Access in Routers:** FastAPI presentation layer endpoints must never talk directly to data engines (SQLAlchemy, Motor, PyMongo, Raw SQL). All operations must flow through services and stores.
* **Component-Bound Network Calls:** Never bind raw HTTP clients directly to interactive UI components.
* **Leaking ORM / Unsynchronized Models:** Never leak database ORM models directly in API response models, and never modify backend API models without updating corresponding frontend type definitions.
* **Em Dashes in Code:** Never use em dashes (—) inside code files, strings, or comments. Use standard hyphens (-) or syntax alternatives.
* **Comment Walls:** Never write multi-paragraph comments, banner comments, ASCII dividers, or code narrations.
* **Duplicate or Shadow Refs:** Never create parallel refs for a single node, a ref per list item, or a ref that mirrors component state.
* **Rewriting Comments to Match Broken Code:** Never resolve a comment/code contradiction by editing the comment unless the code is verified as the authority.
* **AI Attribution in Commits:** Never add `Co-Authored-By: AI...` or "Generated with" lines to commit messages or PR descriptions. End the body at its last content line.