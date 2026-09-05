# SRD Attribution

## What this covers

CozyVTT ships no game content. When an administrator seeds the creature library,
the server fetches creature stat blocks from the [Open5e API](https://open5e.com)
into that instance's own database. Those stat blocks come from the **Dungeons &
Dragons 5th Edition System Reference Document 5.1 (SRD 5.1)**, published by
Wizards of the Coast LLC.

This file exists to attribute that content. It covers nothing else — the rest of
CozyVTT is the project's own work, and third-party software is credited in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) and
[THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).

## Licence

SRD 5.1 is released under **two** licences, and a user may choose either:
the Open Game License 1.0a, or the Creative Commons Attribution 4.0
International Licence.

**CozyVTT uses it under CC-BY-4.0.** That choice means a single attribution
notice rather than bundling the full OGL text and maintaining its Section 15
copyright chain. It is also the direction Wizards themselves have taken —
SRD 5.2.1 and everything after it is Creative Commons only.

The required notice is in [SRD_LICENSE.txt](SRD_LICENSE.txt) and reads:

> This work includes material from the System Reference Document 5.1
> ("SRD 5.1") by Wizards of the Coast LLC, available at
> https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is
> licensed under the Creative Commons Attribution 4.0 International License,
> available at https://creativecommons.org/licenses/by/4.0/legalcode.

It is also shown in the app, on the creature library panel.

## Open5e

The data reaches CozyVTT through the [Open5e API](https://open5e.com), which
serves the SRD in a structured form so applications do not each have to parse
the source document. That work is not ours and is worth naming: Open5e is a
community project, and the creature library would be a great deal more effort
without it.

The seeder requests the `wotc-srd` document specifically, so only SRD material
is imported.

## Trademarks

Dungeons & Dragons, D&D, and all related logos are trademarks of Wizards of the
Coast LLC. They are **not** included in CozyVTT, and nothing here implies
endorsement or affiliation. What the SRD makes freely usable is the mechanical
content — ability scores, hit points, actions, traits — and that is all CozyVTT
imports.

## If you add another game system

Attribute it here, in its own section, naming the licence it is published under
(OGL, ORC, Creative Commons, a fan-content policy) and where the content came
from. If a system is not openly licensed, restrict the contribution to sheet
structure and data the user enters themselves.
