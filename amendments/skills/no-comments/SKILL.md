## Amendment: REVIEW keeps and rejected reruns

This fix comes from Michael Ramos in [backnotprop/pstack#14](https://github.com/backnotprop/pstack/issues/14). Upstream does not have it yet. Where it differs from the steps above, it wins.

- Comment Sicko may return `REVIEW` keeps: comments that claim a rule of a dependency, platform, vendor, or protocol that it could neither prove nor refute. Keep each one until someone checks that rule, and report it open. Delete it only with proof from that outside thing's docs or source that the rule is false or not ours.
- Reject a `MUST KILL` that names a problem a future edit might cause instead of one the code has today.
- If you reject the rerun too, do not fail `/no-comments`. Revert only the rejected findings, report them open, and go on with the accepted ones.
- The final report also lists `REVIEW` keeps, each with the rule it claims.
