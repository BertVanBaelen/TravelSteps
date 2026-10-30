# VX – postponed features (later version)

Features that were planned for V2 but moved out of the v2.0.0 scope on 2026-10-30 so that
[V2-X](../V2/V2-X-Release.md) could ship v2.0.0 with what is done. They keep their full plan and can
be picked up after v2.0.0; the version they land in is decided when they are started.

| Phase | Name | Result | Was |
|-------|------|--------|-----|
| VX-1 | [Anonymous share link](VX-1-Share-Link.md) | 24h public card with one step, revocable | V2-5 |
| VX-2 | [Admin statistics](VX-2-Admin-Stats.md) | Beheer → Statistieken: users, content, storage | V2-6 |

## Notes for when they are picked up
- The decisions, [compatibility rules](../V2/README.md#compatibility-rules-apply-to-every-v2-phase)
  and [permission overview](../V2/README.md#permission-overview-after-v2) from the V2 plan still
  apply (share link and admin statistics rows included).
- VX-1 reuses `canUseAuthorRights` from [V2-4](../V2/V2-4-Trusted-Download.md); the trusted-user
  explanation in Profiel then has to mention share links again.
- VX-2 counts active share links only once VX-1 is done; it is otherwise independent.
- Each phase brings its own hardening: the security, Playwright and docs tasks that V2-X had for
  these features are listed in the phase files' acceptance criteria and must be done before release.
- UI texts are written in Dutch and English from the start (V2-3).
