# One colour system

Colour carries meaning or it is not used. Before this document, xP was shaded on one page and plain on
another, run totals used a different rule from the numbers beside them, and pink appeared on template
tags. That is colour as decoration, which trains the eye to ignore it.

## The rule

**Colour encodes state, never magnitude.** A number is white unless it is telling you something a
number alone cannot.

| Colour | Meaning | Where |
|---|---|---|
| White | Every value, by default | All numbers everywhere |
| Green `#00E87B` | A good state: fixture is easy, player is under his expected price, quota complete, action available | Fixture dots, X£ when under, position counts when filled, primary buttons |
| Pink `#E90052` | A bad state: risk, over-priced, illegal, excluded | Availability under 70%, X£ when over, negative bank, excluded players |
| Magenta `#FF2ECC` | Captain, ×2, and locks. Nothing else | Armband, locked players, shape lock |
| Cyan `#22D3EE` | Ownership and shortlist, which are about the field rather than the player | Owned column, top-rank ownership, shortlist |

## What is NOT coloured

- **xP is never colour-coded by size.** There is no defensible threshold where 5.0 is good and 4.9 is
  not. Fixture difficulty next to it already carries the context.
- Price is never coloured. It is a fact, not a judgement.
- Points totals, minutes, appearances: white.

## Fixture difficulty

The only place a scale is coloured, because it is a defined 0-100 measure: green easiest through pink
hardest. It is the reason xP does not need shading.

## Enforcement

`tests/design-system.test.mjs` fails the build if a banned colour appears, if type drops below 13px, or
if a table row declares a different number of columns from the cells it renders.
