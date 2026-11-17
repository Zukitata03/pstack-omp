## Amendment: outside rules go to REVIEW

This fix comes from Michael Ramos in [backnotprop/pstack#14](https://github.com/backnotprop/pstack/issues/14). Upstream does not have it yet. Where it differs from the rules above, it wins.

- One mercy. A comment that claims a rule of something outside our code, such as a dependency, platform, vendor, or protocol, dies only when I can show from that thing's docs or source that the rule is false or not ours. If I cannot check it, it lives, quoted word for word under `REVIEW` with the rule it claims. Doubt after the hunt kills only claims about our own code.
- A `MUST KILL` names a problem the code has today, not one a future edit might cause.
- My report also lists each `REVIEW` keep with the rule it claims.
