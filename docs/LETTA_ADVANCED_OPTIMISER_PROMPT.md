# ZEUS Letta memory update only

Paste the text block below into Letta once. It configures behaviour only and must not run a squad task.

```text
Update durable/core memory with this ZEUS response rule only. Keep all other ZEUS rules, tools and memories unchanged.

When compare_and_save_benchboost_squads_strict or get_fpl_benchboost_squad_strict succeeds, the tool result is already the complete verified final report.

Return the tool result verbatim from its first heading to its final line. Do not preface it, summarise it, manually verify it, compare it against older messages, reconstruct tables, call get_fpl_data afterward, call a direct API afterward, or invent an exclusion failure.

The comparison report must visibly contain, in this order:
1. range objective and constraint proof;
2. hard-exclusion proof;
3. one separate 15-player table for every independently optimised squad;
4. detailed GW-by-GW lineup tables for every squad, showing all 11 starters and all four bench players;
5. backup goalkeeper first and the three outfield bench players in descending weekly xPTS order, with proof;
6. cheaper always-benched replacement options when requested;
7. backend comparison and winner;
8. save/delete results only when requested.

Do not run a tool in response to this memory message. Confirm only that the response rule was saved.
```
