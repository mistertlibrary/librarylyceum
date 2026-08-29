# The faces in this folder

Every copyright line below was read out of the font binary sitting beside it —
its `name` table, fields 0, 13 and 14 — not from a search result. Where a file
could not say who made it, the line was taken from the family's upstream
`OFL.txt` and the source is named.

This file exists because the license asks for it. OFL 1.1, condition 2:
redistributed copies must each carry the copyright notice and the license,
"either as stand-alone text files, human-readable headers or in the appropriate
machine-readable metadata fields." `OFL.txt` beside this note is the license;
this note is the notice.

---

## Under the SIL Open Font License, Version 1.1

See `OFL.txt`.

| Family | Copyright | Files |
| --- | --- | --- |
| Cinzel | Copyright 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel) | `cinzel-400`, `-600`, `-700` |
| Cormorant Garamond | Copyright 2015 the Cormorant Project Authors (github.com/CatharsisFonts/Cormorant) | `cormorant-garamond-300-700`, `-300-700-italic` |
| EB Garamond | Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12) | `eb-garamond-400-800`, `-400-800-italic` |
| Fraunces | Copyright 2020 The Fraunces Project Authors (github.com/undercasetype/Fraunces) | `fraunces-400`, `-500`, `-500-italic`, `-600`, `-700`, `-800`, `-800-italic`, `-900` |
| Hanken Grotesk | Copyright 2021 The Hanken Grotesk Project Authors (https://github.com/marcologous/hanken-grotesk) | `hanken-grotesk-400`, `-400-italic`, `-500`, `-600`, `-700` |
| IBM Plex Mono | Copyright 2017 IBM Corp. All rights reserved. | `ibm-plex-mono-400`, `-400-italic`, `-500`, `-600` |
| IM Fell English | © 2007 Igino Marini (www.iginomarini.com), with Reserved Font Name IM FELL English Roman / IM FELL English Italic | `im-fell-english-400`, `-400-italic` |
| Inter | Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) | `inter-400`, `-500`, `-600`, `-700` |
| JetBrains Mono | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) | `jetbrains-mono-400`, `-400-italic`, `-500`, `-700` |
| Libre Franklin | Copyright 2020 The Libre Franklin Project Authors (https://github.com/googlefonts/Libre-Franklin) | `libre-franklin-100-900` |
| Lora | Copyright 2011 The Lora Project Authors (https://github.com/cyrealtype/Lora-Cyrillic), with Reserved Font Name "Lora". | `lora-400`, `-400-italic`, `-600`, `-600-italic` |
| Newsreader | Copyright 2020 The Newsreader Project Authors (http://github.com/productiontype/Newsreader) | `newsreader-400`, `-400-italic`, `-500`, `-600` |
| Playfair Display | Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display), with Reserved Font Name "Playfair Display". | `playfair-display-400`, `-400-italic`, `-700`, `-700-italic` |

Reserved Font Names are declared for IM Fell English, Lora and Playfair Display.
Under condition 3 a modified version may not be released under those names. We
subset and re-encode; we do not rename or redraw, so nothing here is a Modified
Version in the license's sense.

## OpenDyslexic — two licenses, not one

The four files do not agree with each other, and the difference is real.

| Files | What the binary says |
| --- | --- |
| `opendyslexic-400.woff2`, `opendyslexic-700.woff2` | Copyright © 2019 by Abbie Gonzalez. License field names the SIL OFL and a Reserved Font Name. |
| `opendyslexic-400-italic.woff`, `opendyslexic-700-italic.woff` | "Original Fonts are © Bitstream. OpenDyslexic changes and additional glyphs by Abelardo Gonzalez are licensed under a Creative Commons Attribution 3.0 Unported License." Bitstream terms at http://opendyslexic.org/legal/ |

The two italics are the older, pre-OFL generation of the project, carried
forward from the copies already self-hosted in the guide network. CC BY 3.0
requires attribution, which this note gives; it does not require that its own
text travel with the work, so there is no third license file here. Replacing the
two `.woff` italics with current OpenDyslexic builds would collapse the family
back onto a single license, and would let them be `.woff2` besides. See
`OPENDYSLEXIC-LICENSE.txt`.

## Five files that cannot say what they are

`cormorant-garamond-300-700.woff2`, `cormorant-garamond-300-700-italic.woff2`,
`eb-garamond-400-800.woff2`, `eb-garamond-400-800-italic.woff2` and
`libre-franklin-100-900.woff2` have **no `name` table at all** — no family, no
copyright, no license field. Whatever subsetting pipeline produced them stripped
it. Their copyright lines in the table above therefore come from the families'
upstream `OFL.txt` in `github.com/google/fonts`, not from the files.

This is not a licensing failure — the OFL travels with the work regardless, and
condition 2 is satisfied by this folder's text files. It is a provenance failure:
the binaries cannot be identified from themselves, and one of them, EB Garamond,
is the body face of the Babel catalogue. Re-fetching those five from upstream
with their metadata intact would close it.

## One more artifact worth noting

The Newsreader files report their typographic family as `Newsreader 16pt 16pt` —
the optical-size token doubled. Harmless, since the `@font-face` rules name the
family themselves, but it is another sign that these came through a subsetter
that was not careful with the `name` table.
