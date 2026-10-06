# Styles

`app/globals.css` only imports these files. The import order is the cascade order of the original stylesheet. Do not reorder it.

Each file has one owner per wave. New UI adds its own surface file and an import at the position that keeps equal-specificity overrides in their current order. Do not add rules to a file you do not own.

| File | Owns |
| --- | --- |
| `tokens.css` | V1 tokens, dark-surface custom properties, base reset |
| `shell.css` | App shell, sidebar, account row |
| `overview.css` | Overview banner, metric cards, Projects table |
| `components.css` | Shared buttons, fields, empty states, status pills |
| `documents.css` | Documents register, cite chips, evidence rail |
| `pack.css` | Pack export and proof |
| `changes.css` | Changes queue, evidence, and the shared responsive block |
| `people.css` | People desk |

A rule that sits between two surfaces stays where it is so source order does not change. Those rules are marked `Order-locked`.
