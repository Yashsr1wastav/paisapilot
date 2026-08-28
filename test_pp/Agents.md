# Project Engineering Rules

## General

You are working on a production-quality software project (mobile app + website, possibly a shared backend).

Always inspect the existing code before making changes.

Understand:
- project structure
- architecture
- dependencies
- existing abstractions
- data flow
- error handling
- testing strategy

Do not rewrite working code unnecessarily.

## Code Quality

Prefer:

- simple solutions
- readable code
- maintainable architecture
- strong typing where appropriate
- small cohesive functions
- separation of concerns
- reusable existing abstractions
- clear naming
- explicit error handling

Avoid:

- unnecessary abstractions
- duplicated code
- unnecessary dependencies
- huge functions
- premature optimization
- clever code that reduces readability
- changing unrelated files

## Performance

Do not optimize based on assumptions.

Before optimization:

1. Identify the bottleneck.
2. Explain why it is a bottleneck.
3. Measure/profile when practical.
4. Implement the smallest effective improvement.
5. Verify that behavior remains correct.

Prefer better algorithms and data structures before micro-optimizations.

## Security

Never:

- expose API keys
- hardcode secrets
- commit credentials
- disable security checks
- bypass authentication to make tests pass
- trust unvalidated user input

Use environment variables for secrets.

For mobile: never request a permission without a clear, current feature need. Every permission is Play Store review surface area and a Store-Compliance finding waiting to happen.

For web: never expose secrets client-side; sanitize all user-generated content; set proper CORS.

## Testing

Every meaningful implementation change should have appropriate tests.

Run relevant tests after changes.

Never remove a failing test just to make the test suite pass.

When fixing a bug, add a regression test whenever practical.

## Git

Keep changes focused.

Do not modify unrelated files.

Do not create commits unless explicitly requested.

Never commit secrets.

## Release & Deployment

No task is "done" just because tests pass. Before anything is marked complete for release:

- Release-Engineer must confirm: version bumped, signed build produced (Android App Bundle, not a debug APK), CI green, no secrets committed, deployment target confirmed (web) and Play Console track confirmed (mobile — do not assume production).
- Staged rollout is the default recommendation for production Play Store releases, not 100% immediately, unless explicitly told otherwise.
- Any change to a shared API contract (request/response shape, auth requirement, endpoint path) must be flagged explicitly by whichever Coder made it — Mobile-Coder and Web-Coder both depend on that contract staying stable.

## Store Compliance

Applies to anything touching permissions, user data collection, tracking, or public-facing policy/listing content.

- Every requested permission must map to an actual, current feature — no speculative or leftover permissions.
- The app's Data Safety form (Play Store) must match what the code actually collects and transmits. Mismatches are a leading cause of rejection/suspension.
- A privacy policy must exist and be linked from both the app listing and the website footer, and its stated practices must match actual behavior.
- Any cookies/tracking on the website need a consent mechanism appropriate to likely target regions.
- Store-Compliance must sign off before a release touching any of the above is marked complete.

## Agent Collaboration

- Use Architect for architecture and to decide which surfaces (mobile/web/backend) a request actually touches.
- Use Mobile-Coder, Web-Coder, and Backend-Coder for implementation, split by surface — invoke only the ones a task actually needs, and run them in parallel only when their file sets don't overlap.
- Use Debugger for difficult bugs, never for silencing a failing check.
- Use Tester for coverage and regression testing after implementation.
- Use Reviewer after significant implementation, before release. Reviewer is read-only.
- Use Optimizer only after functionality is correct and tests pass, and only with a measured reason.
- Use Release-Engineer before any release is considered complete.
- Use Store-Compliance before any release touching permissions, user data, or public policy/listing content is considered complete.

Prefer parallel work only when tasks are independent and touch separate areas of the repository. Never run two agents editing the same file at the same time.