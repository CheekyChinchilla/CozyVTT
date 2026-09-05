# Changelog

All notable changes to CozyVTT will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.3.0] — 2026-09-04

### Added

- **Notes of your own, in a new Notes tab.** Keep up to two hundred of them for each campaign — a plan for next session, what the party knows about a villain, a running list of who owes whom money. They are written in **Markdown**, so headings, lists, bold, quotes and links all work, and a preview button shows them laid out. Pick between notes from a dropdown, and everything saves itself a moment after you stop typing, so nothing is lost by closing the tab. **These are private.** Nobody else can read them, including your DM — that is enforced on the server, not just hidden in the page. A single note can run to 100,000 characters, about fifty printed pages; the list loads titles only, so having a lot of long notes does not slow anything down. **Self-hosters: this adds one new database table.** It is created automatically when you upgrade, and nothing existing is altered

- **You can add skills of your own to a D&D 5e sheet.** Tool proficiencies had nowhere to live: the rules say proficiency with a tool lets you add your proficiency bonus to any check made using it, which is exactly how a skill works, but the sheet only had the standard eighteen. Players were recording Thieves' Tools as a *weapon* to get something they could click — which put a lockpick on the combat tab and gave it an attack roll it does not have. **Stats & Skills** now has a **Your Own Skills** section: give it a name, pick the ability it uses, tick proficiency or expertise, and the bonus is worked out for you. It appears on the sheet with the other skills and in the right-click roll menu, so "roll my thieves' tools" is one click. Anything works, not just tools — a homebrew skill, or a subsystem your table invented. Because the bonus is calculated rather than stored, it follows your character as their ability scores and level change, and there is an **Other** box for anything the maths cannot know about, like a magic item

- **The notes your DM writes at the end of a session are finally readable.** CozyVTT has always offered a Session Notes box when ending a session, and always saved what was typed there — but nothing ever showed it again, so every recap written since the feature shipped went straight into the database and stayed there. The end-session dialog even admitted it, promising history viewing "in a later update". The **Session** tab now has a **Past Sessions** list: every finished session, newest first, with its date, how long you played, and whatever the DM wrote. Everyone in the campaign can read it, which is the point — it is what a player looks at before the next game. **Notes written months ago appear immediately**; nothing needed to be re-entered, they were there all along. That is worth a moment's thought before your next game: because nothing ever displayed them, some DMs used that box as a private reminder to themselves, and those reminders are now visible to the table. So the DM can **edit or clear any past session's notes** — a pencil button on each entry, visible only to them; clearing the box and saving removes the recap while leaving the session in the list. Have a read through before your players do

- **The Call of Cthulhu sheet can record what the rules ask an investigator to track.** Four things were missing, and each is core 7th-edition play rather than an optional extra. **Conditions** — Major Wound, Dying, Unconscious, Temporary Insanity and Indefinite Insanity — were shown when reading the sheet but had no box to tick, so an investigator could never actually be marked as hurt or mad. **Cthulhu Mythos and the spells an investigator knows** had nowhere to live at all, despite the Mythos rating being what caps a character's maximum Sanity. **Appearance** (age, height, weight, eyes, hair, skin) was displayed but could not be filled in. And the **Keeper's Notes** shown on the sheet had no field to write them in. All four can now be edited and all four are shown

- **A weapon you add yourself can carry properties.** The read-only sheet has always shown labels like Finesse, Light and Thrown, but only the weapons from the built-in starter sheets ever had them: the editor gave no way to set them, and the one box on offer was a note reading "e.g., Versatile, Finesse" — so anything typed there came out as a line of italic prose rather than a label. All eleven properties from the rules are now buttons on each weapon. **They are not a limit**: a homebrew game can add a property of its own by typing it in, and it gets a label on the sheet exactly like the standard ones. Properties of your own are shown in amber while you edit, so you can see at a glance which are yours, and anything a starter sheet or an import brought with it is kept rather than quietly dropped

- **A weapon can have more than one damage roll.** A spear does 1d6 in one hand and 1d8 in two, and there was nowhere to record the second one — the built-in longsword resorted to writing "Two-handed: 1d10+3" in its notes, where it read as a sentence and could not be rolled. Each weapon or spell can now hold as many damage lines as it needs, each with a note saying when it applies, and each is clickable to roll on its own — both on the sheet and in the right-click roll menu, so a spear is versatile everywhere. **Nothing on your existing sheets is rewritten** — a second damage die you typed into a note stays exactly as you left it, and you can move it into a row of its own whenever you want

- **A feature or trait can carry its description.** Features used to be names only, which is why the templates' rules text had nowhere to go. Each one now has an optional description shown beneath it on the sheet. **Your existing lists are untouched**: a feature you typed stays exactly as you typed it, with no description, and names like "NakuDama-Amphibious" or "Fighting Style: Defense" are never split apart to invent one.

### Changed

- **The dice panel reads like a conversation.** It used to show one roll at a time with arrows to step backwards through the rest, which made comparing two rolls — or just glancing at what the party had been rolling — needlessly fiddly. It is now a running list like the chat beside it, oldest at the top and newest at the bottom, following along as rolls come in unless you have scrolled up to read something

- **The token details panel is bigger and properly laid out.** The panel in the bottom-left corner showed only a name and a coordinate, crammed into a box too small to make anything out. It is now a proper card, roughly twice the size, with the token's **picture** big enough to actually recognise — on the map a token is often only a few dozen pixels at play zoom, which is what made them hard to see. Underneath, clearly labelled: **HP**, **Conditions** as badges, and **Initiative** where the token is in the turn order — a dash if it has joined the fight but nothing has rolled for it yet, and no line at all if it is not in the fight. Hit points appear only where you are meant to see them: a player character's always, since that is on their sheet, and a creature's only once the DM has turned its HP bar on

- **Exhaustion is tracked properly, in its six levels.** It used to be a single tick box beside the other conditions, which cannot tell "disadvantage on ability checks" apart from "death" — the difference between level 1 and level 6. The sheet now has a level picker and lists every effect in force, since each level carries all the ones below it.

- **Spell save DC and spell attack are worked out for you.** Both were boxes you typed a number into, and the starter templates filled them with 8 and +0 — values no character can legitimately have, since the lowest possible save DC at level 1 is 10. They are now derived from your proficiency bonus and spellcasting ability, the way initiative and passive Perception already were, each with its own **Other bonus** box for items and features that change them — a Rod of the Pact Keeper, a Robe of the Archmagi. The two boxes are separate because some items raise the attack roll and not the save DC. **If you had typed your own numbers in, they are kept**: the difference is read back into the bonus box, so a character with a magic item does not quietly lose it.

- **A misleading promise about secret rolls has been corrected.** The checkbox read "Secret Roll (only you can see)" — but the DM has always been sent secret rolls as well, deliberately, so they can settle an argument about what was really rolled. Telling a player otherwise set an expectation CozyVTT could not keep. It now reads **"hidden from other players"**, and the confirmation says plainly that your DM can still see it. **Nothing about who sees what has changed** — only what you are told. Other players still never receive your secret rolls; they are filtered on the server, not hidden in the page

- **The roster's "Reassign to Player" menu entry is gone.** It never did anything — it opened a "not yet available" notice — and there is no groundwork behind it either, so it was advertising a control the DM did not have. It will come back when it works

- **Internal: the codebase is strictly typed again.** CozyVTT was specified as strictly typed, but the rule that enforces it was switched off in the frontend and absent from the backend entirely, so 326 uses of TypeScript's `any` escape hatch had accumulated. Every one is gone from the code that runs the app, and the rule is now an error in both projects. Test files are held back for a pass of their own and are the only thing still exempted. A CI workflow is included that runs the same checks on every push and pull request — note that it reports failures rather than blocking them, so making it a required check is a separate step in the repository's own settings. **Nothing about this changes how CozyVTT behaves**: types are erased when the code is compiled, so there is no schema change, no migration, and nothing required of a self-hosted instance beyond the usual rebuild. Every backend change was checked by comparing the compiled JavaScript before and after, which is what makes that claim verifiable rather than a promise

- **Three unnecessary packages removed from the backend install.** `@types/socket.io` and `@types/mathjs` were stub packages for type definitions that socket.io and mathjs have shipped themselves for years — one of them pinned a whole major version behind the library it described. Both are gone, and the one type package still needed moved to development-only, so a production install no longer pulls any of them. Nothing about how CozyVTT runs changes; there is simply less to download

### Fixed

- **Signing in successfully no longer counts towards the lockout.** The rate limit on the authentication endpoints counted every request, so five *correct* logins within fifteen minutes locked you out with "Too many authentication attempts" — and because the limit is keyed on the client address, on a self-hosted instance behind a router that allowance of five was shared by everyone in the house. A brute-force guard is there to stop repeated *wrong* answers, so only failures count now. Getting your password right, or your authenticator code right, no longer moves you closer to being locked out; five wrong ones in fifteen minutes still does. **Password reset is deliberately unchanged**: that endpoint answers the same way whether or not the address exists, so that it cannot be used to find out who has an account, and it sends an email either way — skipping its successful requests would have left no limit on the sending at all. **Creating an account is limited separately**, for the same reason in reverse: registration has no wrong answer to repeat, so what is worth limiting there is how many accounts one address can create — ten an hour, successful or not. That is also more headroom than the old five-in-fifteen-minutes gave a household signing several people up in one sitting

- **Players can see the map and the token art again.** If the DM chose a map image from their own asset library rather than uploading a fresh one while creating the map, every player got **"Failed to load map image"** and an empty grid — the picture belonged to the DM personally, and using it as the campaign's battlemap never granted anyone else permission to look at it. Token pictures failed the same way and silently: rather than showing an error they fell back to the plain coloured circle with an initial, so a table could play for months assuming that was simply how their tokens looked. Permission now follows **use** — if a map, a token on a map, a character, or one of the campaign's creature or token templates uses a picture, everyone in that campaign can see it. Nothing is moved or re-labelled, so a map shared between several campaigns keeps working in all of them, and this only ever grants *viewing*: who can replace or delete a picture has not changed. **Existing campaigns are fixed by upgrading** — there is nothing to re-upload or re-pick

- **Character sheets now show the features and proficiencies they were built with.** Every built-in template had been written against an older version of the sheet, so it filled in fields nothing on the page reads. A D&D 5e Fighter's **Features tab was simply blank** — "Second Wind" and "Fighting Style: Defense" were stored, with their full rules text, and displayed nowhere. A Pathfinder 2e Fighter reported **"No strikes/attacks recorded"** while holding a warhammer and a crossbow. The same went for armour and weapon proficiencies, languages, personality traits, ideals, bonds, flaws, allies, and a Pathfinder Fighter's Attack of Opportunity and Shield Block. All of it is now written where the sheet looks for it, and a test compares each template against its schema so this cannot creep back. **D&D 5e sheets show their features straight away, with no migration.** Pathfinder 2e characters need one command run once after upgrading — `docker compose exec backend npm run migrate:sheet-fields` — which is described in the deployment guide and can be run with `--dry-run` first to see exactly what it would change.

- **Pathfinder 2e sheets show the right Armor Class, Class DC and Initiative.** Initiative read **+0** for everyone — a character with Perception +6 showed nothing at all — because the sheet printed a stored number that was never worked out. Armor Class and Class DC had the same problem, and the built-in Level 1 Fighter shipped both one point too high: AC 18 where its own armour and proficiency give 17, and Class DC 17 where they give 16. All three are now worked out from your character rather than read from a stored copy, so they are right on every sheet immediately, with nothing to open or re-save. The starter template's numbers are corrected too, and a test now compares each template against the rules so one cannot ship a wrong number again.

- **Your character keeps the name you gave it.** Picking one of the "(Example)" starter templates quietly replaced it: type "Grimtooth Ashfang", choose the Level 1 Fighter, and the sheet came out headed "Brave Fighter". Worse, the sheet's name is what the character record follows, so the first time you saved, the character was **renamed** — permanently. All three game systems did it (Brave Fighter, Dwarven Defender, Jack Morrison). The name you type now wins.

- **Characters no longer claim to be wizards.** Every D&D 5e sheet announced "Wizard Spellcasting", whatever the character was, because the starter templates filled in a spellcasting class and there was no field on the sheet to change it. There is one now, the templates leave it blank, and a character with no spells, cantrips or slots gets no spellcasting panel at all.

- **A Pathfinder 2e sheet no longer breaks when a strike has no proficiency recorded.** The badge beside each strike looked its colour up by proficiency rank and assumed one was always there. A strike without one — from an older sheet, an import, or a hand edit — took the entire character sheet down to an error screen. The rank is optional, so it is now simply left off the badge rather than guessed at, and a strike with no reach recorded stops printing "(undefined ft.)".

- **The Pathfinder 2e sheet shows everything it lets you record.** Several parts of the sheet could be filled in but never appeared when you opened it to read — **rituals** (the one most likely to be noticed, since they are also the hardest to keep track of), **weapon and armour proficiencies**, any **conditions** currently on the character, and **treasure**. All of them are on the sheet now, grouped with what they belong to. **Deity** and **alignment** have also been added: both are part of the character the server stores and validates, and neither had a box to type them in or a place to show them, which is awkward for a cleric, champion or oracle

- **A Pathfinder 2e character with a ritual can be saved again.** Adding a ritual made the whole sheet impossible to save: the editor wrote the ritual's name *and* the rank it is cast at, matching the rank selector shown right beside it, but the server would only accept a bare name. Every save came back "Character data does not match game system schema", and everything else typed since the last save went with it. The server now accepts both, so a ritual keeps its rank — and a sheet stored under the old rule still opens, with its rituals starting at rank 1 where the rank was never recorded

- **Adding a feature to a sheet works, and a deleted one stays deleted.** Pressing **Add Feature** on a D&D 5e sheet appeared to do nothing: the empty row it created vanished the instant the sheet re-drew, so there was no way to type into it. Deleting a feature that came from a starter template had the opposite problem — it came straight back. The list was being rebuilt from storage on every keystroke, and storage quite reasonably drops entries with no name yet, which is exactly what a row you have only just added is. The list is now settled once when the sheet opens and behaves like the rest of the form, with blank rows dropped when you save. The Pathfinder 2e class features list had the same fault and is fixed with it

- **A D&D 5e sheet with an empty Hit Dice total opens again.** The Hit Dice box is free text and can be left blank, which saved without complaint — but opening that character to read threw an error and the sheet did not render at all. The line responsible was doing nothing useful in the first place: it replaced the first run of digits in the total with itself

- **Your D&D 5e languages stay where you put them.** Reading a sheet back, languages the app did not recognise were quietly filed under **Weapons** instead — so "Thieves' Cant" and "Druidic" appeared as weapons, and a character whose languages were mostly homebrew looked as though only one or two had saved at all. Nothing was ever lost; the sheet was re-sorting your four proficiency boxes from scratch every time it was read, by comparing each entry against a fixed list of twenty language names. It now simply shows what you typed in each box, so anything goes in Languages — a homebrew tongue, Thieves' Cant, a note to yourself. Sheets saved before this are read exactly as they were until the next time you save one

- **Hit points changed on a character sheet show up straight away.** Editing hit points on the sheet — the maximum, the current value, or temporary hit points — left the campaign screen showing the old number until the page was reloaded. Both the player's card on the roster and the health bar on their map token kept displaying whatever they had last seen, which meant a DM could not watch damage land during a fight. The **+** and **−** buttons on the roster were never affected; it was only edits made on the sheet itself. Everyone in the campaign now sees the new value the moment the sheet is saved

- **A character created for a campaign now actually appears in it.** Picking a campaign while creating a character recorded it on the character but never told the campaign, so the character was in the campaign as far as the database was concerned and invisible everywhere you looked — missing from the campaign roster, and its token could not be moved by the player who owned it. Assigning it to the same campaign a second time was what repaired it, because that path filled in the half that was missing. Both halves are now written together, so a character reaches the roster the moment it is created. Creating a character in a campaign you are not a member of is refused, which is the rule the assign screen has always applied

- **The DM can put any player's character on the map.** Placing a character required it to already have a token picture, so a DM could place their own character and nobody else's — and because the thing you dragged *was* the picture, a character without one had nothing to grab. There was no menu route either. Any character can now be dragged from the roster onto the map, picture or not, and the roster's right-click menu has an **Add to Map** entry for when the map is not in view. A character with no picture is drawn the way the creature library has always drawn one: a coloured circle with its initial

- **Your own secret rolls stay in your list.** Previously a secret roll flashed up in a popup and then vanished, and refreshing the page lost it entirely — the record existed, it simply was not shown to you. Secret rolls now sit in the list like any other, marked as secret, and a **Secret** button at the top of the panel hides them if you would rather keep the list to open rolls. That button changes nothing but your own view

- **The roll picker now offers the rolls a Pathfinder 2e or Call of Cthulhu character actually has.** Right-clicking a character offered a list built by reading fields that have never existed on a saved sheet, so four kinds of roll were quietly wrong or missing. **Pathfinder skills** were every one of them offered at **+0** — the list read a skill's `total` where a sheet stores `bonus`, so proficiency, item bonuses and armour penalties were all discarded. **Pathfinder lore skills** never appeared at all, because the list looked for them inside `skills` when they are kept beside it. **Call of Cthulhu characteristic rolls** never appeared either, for two reasons at once: the list looked up lowercase names (`str`) where a sheet stores uppercase (`STR`), and read `value` where a sheet stores `regular`. **Call of Cthulhu weapon rolls** never appeared, because weapons are kept under `combat` and the list looked for them at the top level. Nothing about your characters was wrong — the sheets held the right numbers all along, and the picker was reading the wrong places. D&D 5e was unaffected

- **Pointing at the dark no longer tells you what is standing in it.** The token details panel would **name a creature in unrevealed fog**, which the map had gone to the trouble of hiding — so a player could sweep the mouse across a dark room and learn what was waiting in it. Separately, while you were **dragging a token** the panel kept showing the name of whatever you last pointed at beside the square you were now over, pairing the wrong name with the right coordinates; it now names what is actually under the cursor, so you can see what you are about to land on

- **You cannot lose your own token underneath someone else's.** Moving onto a square already occupied left a player's token buried: the map always picked whatever was drawn on top, so clicking the square selected the other creature, refused the move because it was not yours, and did nothing at all. The token was still there, invisible and unusable, with no way to get it back. Clicking now looks past anything you are not allowed to move and finds your own token underneath. Two further changes go with it. **Creatures no longer share a square** — the rules are explicit that you cannot end your move in another creature's space, so a move onto an occupied square is refused and says who is standing there. **A creature at zero hit points is drawn faded and can be stood on**, so a body marks where it fell without blocking the fight going on over it. The DM is deliberately exempt from both and can still stack tokens freely, which is needed for mounts, swarms and arranging scenery

- **Messages from the map are readable again.** Notices raised by the map — a locked door, or a square already occupied — appeared squashed into a narrow strip at the bottom of the screen, cut off mid-sentence, and their close button did nothing. The map was placing the notice inside a positioning box that the notice was never meant to be put in, which pinned it to the wrong corner, squeezed it to a few characters wide and swallowed clicks. They now appear in the top-right at full width, like every other notice in CozyVTT

- **A token added to the initiative tracker starts with no initiative.** A rolled initiative is saved onto the token itself, but ending combat only clears the order — so the number outlived the fight it was rolled for. Adding that token to the *next* fight seeded its entry from the leftover value, so it arrived already sorted into the order carrying last fight's result, before anyone had rolled. Combatants now join as **—** and take their place once something rolls for them. Joining the fight and having a position in it are separate steps. The value still stored on the token is untouched, so a DM who typed one into the NPC editor still sees it there. The **Add Combatant** list no longer shows a token's old initiative beside its name either — it was advertising a number that adding the token would not carry in

- **A DM can now mark an NPC with any of the fifteen D&D 5e conditions.** The token quick editor offered only twelve of them — Deafened, Grappled and Petrified were missing, so a creature that was grappled could not be recorded as such even though a player character on the same map could be. The two lists are now one list, which is what stops them parting company again.

- **The setup wizard now keeps the settings it asks you for.** Its "System Configuration" step collects an instance name, a timezone, and whether people may register themselves — it even checks the name and shows all three back for confirmation on the last screen. None of them were ever saved. Every new instance came up called "CozyVTT", on UTC, with registration switched off, whatever you chose. The one that mattered was registration: an administrator who deliberately turned it **on** got an instance with it **off**, and nothing said so. All three are now stored, and registration takes effect immediately.

- **Finishing setup takes you to your dashboard, signed in.** The wizard's closing screen says you will be logged in automatically and sent to the dashboard. Instead it dropped you on the login page to type the password you had just chosen. You are now signed in as the wizard promised.

- **Uploaded files are filed by what they are.** Every asset — token art, audio, avatars — was written into the maps folder, because the upload knows what it is only after the file has already been saved. Nothing was broken by it, since CozyVTT records where each file actually is, but anyone looking through their own `uploads/` folder was told something untrue. New uploads go to the right place. **Files you already have are left exactly where they are** and keep working.

- **A lit room behind a wall is no longer visible — or readable — through the wall.** ([#29](https://github.com/CheekyChinchilla/CozyVTT/issues/29)) With dynamic lighting on, a lamp inside a closed room lit that room for everyone, whether or not they could see into it: players standing outside a sealed building saw its interior, furniture and all. This was three separate faults with one cause — a light was being treated as though it were a second pair of eyes. Worst of the three, **the creatures standing in that room were sent to the player's browser**, so their positions could be read even when the map drew them hidden; a player could learn where everything in a lit room was without ever seeing it. Separately, the map request a client makes when opening a map skipped the visibility filter altogether, handing over every token on a lit map. Light now reveals only what you could already see: you see something when you have line of sight to it **and** it is lit, which is how every virtual tabletop with dynamic lighting behaves. A sight radius still governs what you make out in the dark, and no longer stops you noticing a lit room across a courtyard.

- **A character's new picture reaches its token again.** Changing the image on a character sheet was supposed to update that character's token on every map it stands on, and for some characters it silently did nothing — the player saw their new picture on the sheet while the token kept the old one, and the DM had to remove the token and place it again. The search for tokens to update was scoped by the campaign recorded *on the character*, which is not what binds a token to a character and is very often not set: unassigning a character from a campaign clears it and leaves the tokens exactly where they are, a character can only record one campaign while having tokens in several, and a DM placing one of your characters on their map does not touch it at all. Tokens are now found by the character they are actually bound to, so the picture follows wherever that character stands, and everyone watching sees it change without reloading

- **One unreadable dice roll no longer takes down the whole campaign screen.** If a stored roll was missing the detail of which dice came up — possible on a roll restored from an older backup, brought in by an import, or written by a version before the roll history was displayed at all — the dice panel threw while drawing it. Because the error is caught at the page level, the result was that the **entire campaign** became unusable for everyone in it: no map, no roster, no chat, just "Something went wrong". A roll like that now shows what it does know, which is the expression and the total, and everything else on the screen carries on working

- **The backup and restore scripts work on a Docker install.** `backend/scripts/backup.sh` is what the upgrade instructions, the README and the deployment guide all tell you to run before upgrading — and on a normal Docker install it could not run at all. It tried to reach the database from the host machine, but CozyVTT deliberately does not publish the database port, and a Docker install has no reason to have PostgreSQL's tools installed either. What you actually got was `pg_dump: command not found`, at exactly the moment you were told to protect your data. Both scripts now notice they are running under Docker and do the work inside the database container. Nothing is needed on the host, and `./backend/scripts/backup.sh` does what it has always claimed to. If you run CozyVTT without Docker, set `DATABASE_URL` and they behave as before

- **A large save no longer fails with an unexplained error.** CozyVTT refused any request bigger than 100 KB and reported it as "An unexpected error occurred" — which told you nothing, and pointed at the server for something that was really a limit nobody had ever raised. A very detailed character sheet, a map carrying a lot of tokens with stat blocks, or a long session recap could all reach it. The limit is now 1 MB, and a request that genuinely is too big says so plainly instead. This is a backstop against absurd requests rather than the real limit on anything: what each individual field accepts is checked separately and has not changed

### Security

- **A token's hit points, size, conditions and stat block are now checked before they are stored.** The route that places a token on a map validated its name, position and type, then wrote the rest of what it was sent straight into the database — while the near-identical token *template* route had always checked the same fields properly. Nothing CozyVTT itself sends is affected, and there is no way to reach it without already being the campaign's DM, so this is a hardening fix rather than a hole anyone could have walked through. It also closes the way malformed hit points could be stored and then show up as "8/undefined" wherever the token appeared.

### Documentation

- **The SRD attribution now says the right thing.** The project claimed its creature content was used under the Open Game License while the file named after that licence held a Creative Commons notice — for a version of the SRD the app does not use — and the OGL text it said "must be included with any distribution" was nowhere in the repository. The System Reference Document 5.1 is in fact released under *both* licences, so CozyVTT now uses it under **Creative Commons Attribution 4.0**: a single attribution notice rather than a licence document and a copyright chain to maintain, and the direction Wizards themselves have taken. The notice, the in-app credit on the creature library, and the third-party notices all agree on this now, and **Open5e** — the community project that serves the data — is credited alongside. The files are renamed `SRD_ATTRIBUTION.md` and `SRD_LICENSE.txt`, since they no longer describe the OGL

- **The rest of the documentation has been checked against the code.** A sweep of all 26 documents, with the mechanically-checkable claims verified rather than read: the permissions reference had been missing four per-user permission flags since v1.0.0 — including the one that locks an account out of every endpoint until its password is changed — the schema checklist still described 10 models and 7 enums where there are now 17 and 9, the game-system guide's own code examples taught the `any` pattern the codebase has just finished removing, the backlog still listed a feature that shipped in v1.0.0, and two documents pointed at files that are not in the repository at all. All corrected, and the schema checklist is now labelled as the February snapshot it always was

- **The WebSocket protocol is documented in one place, and the event list can no longer fall behind.** The reference had drifted about half a protocol: fog of war, walls, lighting and map pings had no entry at all, while token movement had two hundred lines to itself — and a section named "Additional Implemented Events" had been bolted on where someone hit the wall. The conceptual half is kept, the token-movement walkthrough stays as a worked example, and the exhaustive catalogue is now generated from the handlers themselves, covering all 39 events the server listens for and all 36 it emits, each with who is allowed to send it. The same protocol was also being described in `docs/API_REFERENCE.md`, which now points here instead of repeating it

- **Twelve endpoints that no longer exist have been removed from `docs/API_REFERENCE.md`.** Each was a path that had moved rather than a feature that had gone — maps and tokens are nested under their campaign, asset downloads moved, the user profile routes are keyed by id — so anyone following that guide was being sent to a 404. It now says plainly what it is: a hand-written guide to the endpoints people ask about, not a complete list, with the complete list pointed to

- **The backend route reference is accurate again, and is no longer described as a public API.** `backend/docs/API_DOCUMENTATION.yaml` had drifted: eleven routes existed with no entry — the whole shared-character-sheet group, roll history, clearing old join/leave messages, Universal VTT import and export, and admin backup restore — and the rate-limit summary still described the login limit the way it worked before 1.2.2. All eleven are now documented and the inaccuracies corrected. It is also retitled and reframed: these routes are what CozyVTT's own client calls, they are not versioned, and they carry no compatibility promise, so they are not something to build on and expect to keep working. They can, however, be *called* — there are no API keys or service accounts, but signing in with your own email and password returns a session cookie that works for both the routes and the live connection, which is exactly how the web client authenticates. An earlier draft of that page said no program could authenticate at all, which was simply wrong, and it has been corrected. A `scripts/spec-coverage.py` check compares the spec against the routes the server actually mounts and fails if the two disagree

### Upgrading from 1.2.2

`docker compose up -d --build`. No configuration changes.

This release adds one new table, for the personal notes feature. The backend
container applies it on start — you don't run anything by hand. It is purely
additive: no existing table or row is altered, so campaigns, characters, maps
and history all carry over untouched. If the migration fails the backend
refuses to start rather than serving against a half-updated database.

As with any release that migrates, take a database dump first — migrations here
are forward-only:

```bash
./backend/scripts/backup.sh
```

**Pathfinder 2e tables have one command to run afterwards.** The starter
templates used to fill in fields the sheet never read, and this moves that
content to where it is displayed:

```bash
docker compose exec backend npm run migrate:sheet-fields
```

Add `-- --dry-run` first if you would like to see what it would change. D&D 5e
sheets need nothing; they are read correctly as they are.

**One change worth telling your players about.** Dynamic lighting now requires
line of sight: a lit room is only visible to someone who can actually see into
it. If your maps relied on a light revealing a room to the whole table, those
rooms will now stay dark until a character can see them.

---

## [1.2.2] — 2026-08-27

### Added

- **Campaign invitation emails are now opt-in.** Inviting a player used to email them every time, with no way to say no — awkward if you're sitting next to them, or if the address on file is stale. The invite dialog has a **Also email them an invitation** checkbox, unticked by default; the invitation still appears on their dashboard either way, which is what they actually act on. On an instance with no mail server configured the box explains itself and stays disabled rather than silently doing nothing

### Changed

- **Clicking a character in your gallery opens it for reading, not for editing.** It used to drop you straight into the editor, so glancing at your own character meant entering a screen you could accidentally change things in and then had to back out of. It now opens the sheet to read, with **Edit** on the sheet when you want it — the same order the campaign screen already used
- **Players joining and leaving no longer post to chat.** Those notices were written every time a connection was made or lost — so on every page load, every refresh and every brief network blip — and each one was a permanent message, not just a passing notification. On a flaky connection they buried the actual conversation. Who is currently in the session is now shown as a green or grey dot beside each name in the **Campaign Roster**, which is what the messages were trying to tell you. Someone with two tabs open stays green until they close the last one, and moving to another campaign clears them from the one they left. Existing campaigns keep the messages they already have; a DM can clear them with the eraser button on the chat panel, and nothing is deleted on upgrade

### Fixed

- **The Roll button no longer sticks on "Rolling…".** The cause was not in the dice code at all: reconnecting to the server replaced the underlying connection and every live subscription in the app was quietly left attached to the discarded one. Nothing re-subscribed, so the panel stopped hearing about its own rolls — and since the button is only released when the result comes back, it stayed disabled until the page was reloaded. That is why nobody could pin down a trigger: the trigger was a dropped connection, which has no visible sign. Subscriptions now survive a reconnect, so chat, the roster and everything else keep working after a blip too — including tokens moving on the map and the initiative tracker, which subscribed in a way the central repair did not reach and were corrected alongside it. As a backstop, a roll that goes unanswered for ten seconds releases the button and says so rather than leaving you stuck
- **A character's name now appears on its sheet.** The name typed when creating a character was stored, but the sheet kept its own separate name field and nothing joined the two — so every new character opened showing "New Character". The sheet is now filled in from the name you gave it. **Player Name** is filled in from your display name and is no longer an editable field: it identifies whoever owns the character, so it is not free text. Characters created before this release are not changed
- **Number fields on character sheets can be cleared and retyped.** Deleting the contents of a box put its default straight back, so the next keystroke was appended to that — selecting an ability score and typing "18" gave you something else entirely. Boxes now stay empty while you type and are only corrected when you leave them, so an out-of-range value is caught without fighting you halfway through entering it. This applies to every numeric field on the sheets, not only ability scores: hit points, experience, level, proficiency bonus, speed, armour class and the rest
- **Changing a character's token image updates the map.** A token keeps its own copy of the picture from when it was placed, so editing the character sheet left the old one on the map until the DM removed and re-added the token. Tokens bound to that character now update in place, for everyone, without a reload. A token's **name** is deliberately not overwritten — a DM may have renamed it, and losing that on a player's next save would be its own annoyance
- **Roll history survives a refresh.** ([#25](https://github.com/CheekyChinchilla/CozyVTT/issues/25)) Every roll was already being saved — to a dice table *and* the message log — but nothing ever read them back, so the dice panel was seeded only by rolls that happened while you had the page open. Reloading, navigating away and back, or dropping your connection all started you from an empty list. History now loads from the server on open and re-syncs after a reconnect. **Secret rolls stay secret**: the server decides what each person may see before anything is sent, so a player gets public rolls plus their own hidden ones, and a DM gets everything — refreshing never reveals a roll you were not already entitled to. One limit worth knowing: rolls made while the session is **paused** are still calculated in your browser and never reach the server, so those remain local and will not come back
- **Clearing roll history now sticks.** The DM's Clear button told every connected client to empty its list but changed nothing on the server, so a reload brought everything straight back. It now records when the history was cleared and serves only rolls newer than that. The rolls themselves are kept rather than deleted — secret rolls are stored deliberately so a DM can audit them later, and an accidental Clear should not destroy that. Ending a session does not clear history; only the DM's Clear does
- **Leaving the character editor asks before discarding your work — and only then.** Opening a sheet from the campaign screen has always confirmed when you cancel, but the full-page editor at Characters → Edit did not: its confirmation was written and wired up, yet gated on a flag nothing ever set, so the back arrow discarded unsaved edits without a word. The sheet now reports whether it actually holds unsaved edits, so the warning appears when there is genuinely something to lose and stays out of the way otherwise. It no longer interrupts you after a successful save, or when you were only reading a sheet and never changed anything — a prompt that cannot be trusted is one people learn to click straight through. The warning now also covers closing or reloading the browser tab, which the back arrow's confirmation never could
- **Invitation links now open the "choose a password" screen instead of the sign-in page.** ([#22](https://github.com/CheekyChinchilla/CozyVTT/issues/22)) The email was always correct — it carried a valid one-time token to `/accept-invite` — but the page threw the invitation away before it could be used. The API client redirects to the login page whenever a request comes back unauthorized, skipping that for pages a signed-out visitor is expected to be on. `/accept-invite` was added to the router and never added to that list, so an invited user, who by definition is not signed in yet, was bounced to `/auth/login` the moment the page checked who they were. The redirect discards the query string, which took the token with it, so the link could not even be retried. Invited users could never complete sign-up without an admin issuing them a password by hand
- **The character sheet no longer shows two Save buttons.** ([#23](https://github.com/CheekyChinchilla/CozyVTT/issues/23)) The editor page drew its own Save above the sheet's, and the page's copy was permanently disabled — nothing ever marked the sheet as having unsaved changes, so it could not be clicked even when it looked available. The sheet's own Save was always the working one, and is now the only one
- **Save and Cancel no longer sit on top of Experience Points and the colour picker.** ([#23](https://github.com/CheekyChinchilla/CozyVTT/issues/23)) Those buttons are positioned over the sheet header, but the header reserved no room for them, so they landed on whatever was underneath — the experience field on D&D 5e, level and hero points on Pathfinder 2e. The header now reserves the space, and the character name shrinks rather than sliding under the buttons on a narrow window
- **The character sheet viewer no longer shows two Edit buttons.** The window drew an Edit button and also passed one down to the sheet, which drew its own; both worked, which made it look like they might do different things. Edit now belongs to the sheet alone
- **The close button on the character sheet window is back on the window.** It was positioned against the page rather than the dialog, so it drifted to the corner of the browser window on a wide screen, and collided with the sheet's colour picker on a narrow one
- **Players can roll their own initiative.** The die beside a combatant was the DM's alone, so once the DM had added everyone to the tracker there was no way for a player to roll for themselves — the DM had to roll for the whole table, or take numbers called out loud and type them in. A player now gets the same die, on their own row only, and can also right-click their token on the map and pick **Roll Initiative** from the **Roll...** menu. The result goes straight into the turn order and the roll appears in chat, attributed to the player who made it. The option shows only once the DM has put that token in the tracker — rolling is how you take part in a fight you are already in, not a way to add yourself to one. Everything else stays with the DM: who is in the fight, the order, typing a value in by hand, whose turn it is, and ending combat. The DM can still roll for anyone, including players. Two limits on the player's die: it disappears **once combat has started**, because re-rolling re-sorts the order and could skip somebody's turn — ask your DM to change a value mid-fight — and spectators never get it, even on a token that was theirs before they were demoted
- **Token conditions are readable on the map.** ([#27](https://github.com/CheekyChinchilla/CozyVTT/issues/27)) Each condition was drawn as a single letter in a small dot, which cannot tell most of them apart: Paralyzed, Poisoned, Petrified and Prone all showed **P**, and Incapacitated and Invisible both showed **I**. A player could see that something was wrong with a creature and nothing more — and the dots were tiny enough to be easy to miss at all. Conditions now show as amber badges with a two-letter code, one that is unique to each condition, large enough to read at normal zoom. Beyond four the rest collapse into a grey **+N** badge rather than growing a row wider than the token itself. **Hovering any token now names its conditions in full**, for players as well as the DM, in the same panel that already showed the token's name — the badges are a reminder, and the hover is how you learn what they mean
- **Initiative rolls now follow each game system's rules.** Every initiative roll in the app was a flat `1d20` — no Dexterity, no bonuses, and the same roll whatever you were playing, so a Dexterity 20 rogue rolled exactly what a Dexterity 8 wizard did. The server now works each combatant's initiative out from their sheet, so the tracker's die and the map's **Roll...** menu always agree:
  - **D&D 5e** rolls `d20 + your Dexterity modifier`. Because Dexterity is not the whole story — the Alert feat adds a flat +5, Jack of All Trades and Remarkable Athlete add part of your proficiency bonus, some subclasses use another ability entirely — the sheet has a new **Initiative — other bonus** box for everything else, and Initiative itself is now worked out for you rather than typed in. **Characters made before this release keep the total they had**: a hand-typed +7 on a Dexterity 14 character is read back as Dexterity +2 with an other bonus of +5, so nothing changes under you, and it rolls that way immediately without needing to be opened and re-saved. The one exception is a sheet whose Initiative was left at **0** — since it was typed by hand and blank sheets start at zero, that is read as "never filled in" rather than as a real total, so such a character now correctly shows their Dexterity modifier instead of nothing
  - **Pathfinder 2e** rolls `d20 +` whichever stat the **Uses:** dropdown names — Perception by default, or Stealth when you are sneaking up on someone. That dropdown and the bonus beside it were already on the sheet, but nothing ever calculated the bonus, so **every Pathfinder character has been rolling +0** no matter how good their Perception was
  - **Call of Cthulhu 7e** does not roll for initiative at all — combatants act in DEX order, highest first — so the menu offers **Set Initiative** rather than Roll, takes your investigator's DEX, and nothing appears in the dice log. The app previously invented a `1d10 + DEX/5` roll that is not a rule in the book. A readied firearm still acts at DEX + 50; that is a property of the round rather than the investigator, so the Keeper sets it
  - **Shadowrun 6e** rolls the character's own initiative dice and base from the sheet, rather than a d20
  - **NPCs** with a D&D 5e stat block roll from their recorded Dexterity too. A token with nothing to work from still rolls a plain d20
  - Not handled yet: things that grant **advantage** on initiative, such as a Sentinel Shield. Roll `2d20kh1` in the dice panel and have the DM type the value in
- **Passive Perception is right on a D&D 5e sheet, expertise included.** ([#26](https://github.com/CheekyChinchilla/CozyVTT/issues/26))The editor worked out the number from your Perception bonus, but the view read a stored value that nothing ever recalculated — so it kept whatever it was first given. With expertise in Perception it counted your proficiency bonus once instead of twice: a Wisdom 12 character with expertise showed Perception **+5** and a passive score of **13** where it should read **15**. Both sheets now derive it from the Perception bonus shown next to it, so the two cannot disagree, and characters saved before this release read correctly straight away without being re-saved. The stored value is also brought up to date the next time the sheet is saved, so exported characters carry the right number. The sheet also gained an **Other bonus** box beside it, for the things that raise a passive score without changing the skill — the **Observant** feat's +5 above all. A character imported with such a bonus keeps it: the stored total is read back as "the skill, plus the rest"
- **Renaming a character updates it everywhere.** A character carries two names — the one the gallery and the map know it by, and the one written on the sheet itself — and changing the name on the sheet only ever updated the sheet. The gallery card and the editor's title bar kept showing whatever the character was first created as, so a renamed character was hard to find again. Saving a sheet now carries the new name across, and the two stay in step
- **Call of Cthulhu characteristics are in the same order whether you are reading or editing.** The view showed them in the order the printed sheet uses, while the editor listed them in whatever order they happened to be stored in — so STR, CON, SIZ, DEX, APP, INT, POW, EDU became something else the moment you clicked Edit, and you had to hunt for the box you meant. Both are now driven by one shared order
- **The token right-click menu is only as wide as it needs to be, and no longer lists "Roll…" twice.** The menu stretched most of the way across the screen: its items are laid out as a stack, but the browser was sizing the menu as though every label sat side by side on one line, so its width came out as the total of all of them — a little under a thousand pixels on a full menu, against the couple of hundred it actually needs. The duplicate entry came from a second Roll item shown for any NPC token, including the ones that are really a player's character and already had one

### Upgrading from 1.2.1

`docker compose up -d --build`. No configuration changes.

This release adds one nullable column, which the backend container applies on start — you don't run anything by hand. It is purely additive and touches no existing row: campaigns simply start with no "history cleared" timestamp, which means every roll you have already made stays visible. If the migration fails the backend refuses to start rather than serving against a half-updated database.

As with any release that migrates, take a database dump first — migrations here are forward-only:

```bash
./backend/scripts/backup.sh
```

---

## [1.2.1] — 2026-08-23

### Added

- **Character templates — shareable starter sheets.** A DM preparing a campaign can now build a sheet for a player who hasn't joined yet, and a player new to a system can start from someone else's work rather than a blank page. Publish a template from the new **Character Templates** page on the dashboard, from an existing character sheet with **Save as Template**, while creating a character, or by **importing a character JSON** — including one exported from a different CozyVTT instance, so a sheet built on one server can be shared with a group on another. Every template on the instance is visible to everyone; copying one creates a character that belongs entirely to you, and the original is untouched. You can edit and delete templates you published. A new **template editor** permission, granted per user from the admin panel exactly like Global Assets, lets a trusted user tidy up or correct anyone's — nobody has it until an admin grants it. A template can carry a token image, which must be a global asset: everyone who can see the template needs to be able to load its picture, so the app says so plainly rather than storing an image that would fail for other people
- **Alt+click places an area template freely.** Not every effect is measured from a caster — a wall of fire is a line dropped wherever you like within range. Holding Alt while clicking an area template skips the grid snap and pins it exactly where you clicked, with the shape turning about that point

### Fixed

- **A global asset manager can delete their own global assets again.** The permission check loaded the flag only when the requester was *not* the asset's uploader, but the rule that consults it also requires that they *are* — so in the one case it was meant to permit, the flag was never actually read and the delete was refused. Anyone holding that permission would have seen every attempt to remove their own global upload fail. Admins were unaffected, which is likely why it went unnoticed
- **Cone and line templates now sweep around the square you pin them on.** Aiming one moved its own starting point, so rotating a cone made its tip jump between a few fixed spots rather than turning smoothly — and because the old snapping ignored *which way* the shape pointed, a cone or line aimed left came out of the square's right edge and cut back through the caster's own token. Exactly half of all directions were affected. The square you click is now a fixed pivot, and the point the shape leaves it from slides continuously around that square's edge to follow your aim: the middle of an edge along a row or column, the corner on a diagonal, always on the side you're aiming at. This also finishes the grid alignment started in 1.2.0, where the cone still snapped to the nearest intersection and sat half a square off centre. The cone's 53° spread is unchanged
- **Esc now closes the area template tool, as the DM guide has always said it does.** Nothing was listening for it, so the only way out was to click the toolbar button again. Esc drops the placement, and a second press puts the tool away — the same two-stage escape the wall tools use. Aiming a template also no longer snaps back to pointing right when the cursor crosses onto the tool panel that sits over the map; it holds the direction you left it at
- **A token with no image no longer shows a heart icon.** The token edit panel used a heart where the image should be, which read as "favourite" and gave no hint that the avatar is a button. It now shows a dashed circle with an upload icon, matching the empty image slot in the token template editor

### Upgrading from 1.2.0

`docker compose up -d --build`. No configuration changes.

This release adds a database table, which the backend container applies on start — you don't run anything by hand. If the migration fails the backend refuses to start rather than serving against a half-updated database, so a broken upgrade is loud rather than silent.

The change is additive and touches no existing data: one new table nothing previously read, and one new permission column that defaults to off. **Nobody gains the template editor permission on upgrade** — an admin grants it per user. Your characters, campaigns, maps and creatures are untouched.

As with any release that migrates, take a database dump first — migrations here are forward-only, so rolling back to 1.2.0 means restoring one:

```bash
./backend/scripts/backup.sh
```

---

## [1.2.0] — 2026-08-22

### Added

- **Ping a location on the map with Tab.** Put the cursor where you mean and press Tab: a dot appears with rings radiating out of it, in your own colour and labelled with your name, visible to everyone at the table for about a second and a half. Every player gets a consistent colour automatically — there is nothing to configure and no migration. Tab only pings when the cursor is over the map and you aren't typing or tabbing between controls, so keyboard navigation is unaffected. Pings are drawn above dynamic lighting so pointing into an unlit area works, and repeat pings are rate-limited server-side. Under the OS *reduce motion* setting the rings hold still and simply fade
- **The acting combatant's token is highlighted on the map.** During initiative, the token whose turn it is gets a pulsing gold ring, visible to everyone at the table — so it's obvious which of five identical goblins is up, without counting rows in the tracker. The ring is a gold band edged in black rather than a single colour, so it stays legible over any map image, light or dark. It respects the same visibility rules as the token itself: a creature hidden from players, or standing in unexplored fog, shows no ring on their screens, so an ambusher's position is never given away by their turn coming around. The operating system's *reduce motion* setting turns off the pulse and keeps the ring
- **Hovering an initiative row highlights that token on the map, and vice versa.** Pointing at a name in the turn order draws a thin white outline around its token and lifts it slightly — quieter than the turn ring, and both can show at once. Hovering a token on the map tints its row in the tracker the same way. Works for players as well as the DM, is purely a pointer (it never selects or moves anything), and respects the same visibility rules, so hovering a hidden creature's row doesn't give its position away to players

- **Creature saving throws and skills are worked out for you.** Instead of typing a number for each one, tick which saves and skills a creature is proficient or expert in and CozyVTT derives the bonus from its ability score and proficiency. A commoner with Wisdom 14 who is proficient in Perception gets **+4** — +2 Wisdom, +2 proficiency — and expertise doubles the proficiency to +6. All six saves and all eighteen skills are listed, so there is no longer a free-text field where a misspelling silently created a skill called "perceptoin". The proficiency bonus comes from Challenge Rating on the same scale a character's comes from level, and is shown with its source ("From CR 1/4"); changing an ability score or the CR updates every derived bonus at once. Homebrew is still possible: any row can be overridden by hand, and an override that its ability scores and CR cannot support is flagged rather than silently accepted. **Existing creatures keep their exact numbers** — an SRD Goblin opens already showing Stealth as expertise at its printed +6, and values that don't fit the rules, like the Night Hag's, are preserved as overrides

### Changed

- **Creature rolls now depend on your game system.** The right-click NPC roll menu applied D&D 5e maths to every campaign, so a Call of Cthulhu NPC was offered `1d20 + ability modifier` for a percentile game that has neither d20s nor ability modifiers, and a Shadowrun NPC the same for a dice-pool game. D&D 5e and Pathfinder 2e now each get their own correct treatment; Call of Cthulhu and Shadowrun offer the free-form **Custom Roll** input instead of confidently wrong dice, and are noted for a future release
- **Pathfinder 2e creatures use Pathfinder's own structure.** PF2e stat blocks print final modifiers because creatures are built from level benchmark tables, not from proficiency ranks — so nothing is derived for them, unlike D&D 5e. PF2e creatures now show **Fortitude, Reflex and Will** rather than six ability saves, a **Level** rather than a Challenge Rating, and attribute **modifiers** rather than scores. Values are entered directly and never recalculated; a number far outside the usual range for the creature's level is flagged as a possible typo, nothing more
- **The Creature Library now shows your campaign's game system by default.** Every campaign saw all ~320 D&D 5e SRD creatures regardless of system, so a Call of Cthulhu table browsed a list of dragons to find its own creatures. The library now defaults to the campaign's system, with an **All game systems** option in Filters for deliberately borrowing a stat block from elsewhere — worth keeping, since only D&D 5e ships SRD content. Creatures saved without a system recorded always appear either way, and the seeding button is now labelled **Import D&D 5e SRD** so it's clear what it fetches in a non-D&D campaign
- **Challenge Rating is chosen from a list rather than typed.** It sets the proficiency bonus, so a typo used to silently change every derived save and skill
- **Fog of war is now a box selection instead of a brush.** Drag over the map and the selection snaps to whole grid squares, showing its size (`4 × 7`) as you go, so you reveal exactly the area you meant — the circular brush it replaces caught neighbouring squares by accident, which on a fog tool means showing players a room they weren't supposed to see yet. Click a single square to toggle just that one, drag in any direction, and cancel a drag with Esc or a right-drag. **The brush and its size slider are gone.** Existing maps are unaffected: the fog data was always one cell per grid square, so revealed areas carry over exactly as they were

### Fixed

- **Editing a creature no longer deletes its saving throws and skills.** The creature editor rebuilt the stat block from the fields on screen, and it had no fields for saves or skills — so duplicating an SRD Goblin and renaming it silently removed its Stealth +6, which also removed the skill from the right-click roll menu with nothing to indicate anything had been lost. The same save also dropped XP and notes. Every field the form doesn't show is now carried through untouched
- **A creature can no longer be given an impossible saving throw.** The creature endpoints accepted whatever they were sent — the only checks were that the name was a string and the stat block was an object — so a commoner could be stored with a +30 Wisdom save and the roll menu would faithfully roll `1d20+30`. Stat blocks are now validated on every write, on creature templates, token templates and campaign import alike
- **Negative bonuses no longer display as `+-1`,** and multi-word skills read as "Sleight of Hand" rather than "SleightOfHand"
- **Editing one creature straight after another no longer carries the first one's data across.** Clicking edit on a second creature while the editor was already open reused the open form without reloading it, so the new creature showed the previous one's name, ability scores and stats — and saving wrote them onto it. The same applied to token templates
- **AoE templates now line up with the grid.** Cube, cone and line were anchored to the *centre* of the hovered square, so they sat half a square off — a 10 ft cube on a 5 ft grid straddled four squares instead of covering two. Each shape now snaps by the rule that puts its edges on grid lines: an even span centres on a grid intersection, an odd one on a square centre. A cube is also axis-aligned now rather than rotating toward the cursor, since a tilted square can't align to a square grid. A cone's point lands on an intersection, though its spreading edges still cross squares — that's the shape itself. Circle is unchanged, as it was already placed correctly

- **Creature token images can be chosen from the asset library, not just uploaded.** Editing a custom or duplicated creature previously offered only **Upload**, so an image you had already uploaded couldn't be reused — the DM guide had described picking from your token assets for some time, but the screen never offered it. There is now a **Browse Assets** grid with search alongside **Upload New**
- **Creature token images were broken even when uploaded.** The editor's preview pointed at `/api/assets/{id}/file`, an endpoint that has never existed, so the thumbnail silently 404'd. The same defect affected the token template library. Both now use the real serving route
- **Changing a token's image updates the map immediately for everyone.** The canvas cached token images by token id alone, so a changed image kept rendering the old picture until the page was reloaded — for every player, not just the DM. The cache now also checks the image URL
- **The NPC Quick Editor's close button is no longer pushed off the panel edge** by a long token name, and the token avatar in its header is larger and easier to see
- **The initiative tracker no longer freezes after a WebSocket reconnect.** Its listener was attached to a socket instance that gets rebuilt on reconnect, so after a dropped connection the tracker silently kept showing whatever turn was current when the link went down. Combat state is now mirrored into the shared session store by a reconnect-aware subscription, and re-synced from the server each time the socket comes back

### Documentation

- **`docs/GAME_SYSTEMS.md` now covers creatures**, which it had never mentioned — it documented only the player-character pipeline, leaving the entirely separate creature model undocumented. Adds a section on the shared `NpcStatBlock` shape, the four places creature code branches on game system, and the decision a contributor has to make first: whether their system's creature values are *derived* (D&D 5e) or *printed as final* (Pathfinder 2e). Deriving values a system doesn't derive fabricates numbers that look authoritative. A new optional Step 11 covers adding creature support, and records that returning no roll options is a valid, correct outcome
- Documented the creature stat block object and its validation bounds in the API reference, including the new `proficiencies`, `attributeModifiers` and `level` fields, and why save and skill keys are deliberately not enumerated
- **Documented character templates** across the user guide (browsing, copying and the three ways to publish), the DM guide (preparing sheets before players join), the API reference (the five endpoints, the permission matrix and the global-image rule), and the deployment guide, which gained a **Per-User Permissions** section covering both Global Assets and Templates — neither had been described for operators
- **Corrected the roadmap**, which still listed the global asset manager admin toggle as outstanding long after it shipped
- Documented the asset deletion rules in the API reference — who may delete at each scope was only discoverable by reading the handler
- **Documented the ruler and AoE Shape tools**, which had never been described in any guide despite being in the map toolbar. Covers how each template snaps to the grid, that a cone's angled edges will still cross squares by nature, and that template sizes follow the map's *feet per square* setting
- Rewrote the DM guide's NPC roll and creature-library sections: the claim that skills show "only skills the stat block lists explicit bonuses for" no longer held, and there was nothing describing how to give a creature a proficiency. Adds the proficiency-bonus-by-CR table and what differs under Pathfinder 2e
- Corrected the socket API reference for initiative, which still described the original name-based combatants (`{ name, initiative, hp? }`) years after they became token-based. Documented the `CombatState` payload while there
- Corrected the DM guide's "Adding Combatants", which described typing a name, initiative and HP by hand rather than picking a token from the map
- Corrected the README and user guide, which described admin logo/mascot/favicon **upload** as a shipped feature. The instance does honour custom images — they appear on the login page and across the app — but there is no upload screen yet, so the guide now explains how to change branding today (replace the images in `frontend/public/` and rebuild, or set the URLs through the settings API). The upload UI remains on the roadmap

### Upgrading from 1.1.2

`docker compose up -d --build` is all that is required — **no database migration, and no configuration changes.** Creature stat blocks are stored as JSON and every new field is optional, so existing creatures, tokens, token templates and campaign archives load unchanged.

Your existing creatures keep their exact numbers. CozyVTT works backwards from each stored bonus to show the right proficiency checkboxes, so an SRD Goblin opens already showing Stealth as expertise at its printed +6 without anything being rewritten.

One optional follow-up:

- **Record proficiency on your seeded SRD creatures.** The editor infers it on the fly regardless, so this is a tidiness step rather than a fix. It writes the structure into the stored stat blocks so it doesn't have to be re-derived each time:

  ```bash
  # See what would change without writing anything
  docker compose exec backend node dist/scripts/backfillCreatureProficiency.js --dry-run

  # Apply it
  docker compose exec backend node dist/scripts/backfillCreatureProficiency.js
  ```

  It only touches creatures with `source: 'srd'` — **your custom creatures are never read or written** — and it never changes a printed bonus, only records the reasoning behind it. Safe to run more than once; a second run reports everything as already done. Add `--verbose` for a per-creature breakdown. On a full SRD library expect roughly 212 of 322 creatures updated, with a handful of entries left as overrides where the published stat block doesn't follow the CR proficiency table (the Night Hag is one).

---

## [1.1.2] — 2026-08-21

A readability and account-management release: text is legible on every theme, admins can invite users
by email instead of handing out passwords, and the external-reverse-proxy documentation now describes
a setup that actually works. No breaking changes and no database migration — update and restart.

### Added

- **Invite users by email.** With SMTP configured, admins can add someone from **Admin → Users → Invite User** by entering just an email address and role. The person receives a link, chooses their own password, and signs in — no password is ever generated, shown to the admin, or sent by email. Links are valid for 7 days, and an **Invite** button on any user who has never signed in sends a fresh one (invalidating the previous link). Instances without SMTP keep using Create User exactly as before

### Fixed

- **Text is now readable on every theme.** All 16 built-in themes failed the WCAG AA contrast minimum somewhere, despite the codebase claiming otherwise: muted text — the most common text color in the app — sat between 3.3:1 and 4.4:1 on 13 themes, accent-colored text dropped to 1.84:1 on Northern Frost, and headings fell to 2.6:1 on Shadow Realm. Measured across every theme, text role and surface, **141 unreadable combinations are now zero**, with the worst pairing anywhere improved from 1.71:1 to 4.50:1
- **Screens now follow your theme.** Error, success and warning panels, status badges, NPC stat blocks and various inline messages were built from fixed colors, so on the dark themes they appeared as pale pink or washed-out boxes with near-invisible text. Roughly 850 hardcoded colors across 50 files now use theme-aware tokens
- Stat blocks in the creature library and NPC editor used dark text with no background of their own, making them nearly unreadable on all four dark themes
- The Pathfinder and Call of Cthulhu stat block accents never rendered at all — they were built from dynamic class names the styling system cannot generate
- Faint labels and icons on character sheets (as low as 1.4:1) and unreadable hint text on the DM wall, light and fog control panels
- **Admin-issued temporary passwords now stop working once used.** Accounts created or reset by an admin were flagged as needing a password change, and the login response even said so — but nothing acted on it, so the temporary password the admin had just seen kept working indefinitely and the user was never prompted. The flag is now enforced on the server: until the password is replaced, every API call except changing it is refused, WebSocket connections are declined, and the app sends the user straight to a change-password screen
- Resetting a user's password from the admin panel now signs out that user's existing sessions, instead of leaving them browsing on a session created with the old password

### Changed

- Custom theme colors are now checked for readability: the theme picker shows the contrast ratio of each key text/background pair and flags anything below the 4.5:1 minimum, and derived text shades are adjusted automatically instead of being computed by fixed lightening steps that could produce unreadable results
- The temporary password from **Create User** is no longer displayed to the admin when the welcome email was delivered successfully — it is shown only when there is no other way to hand it over (no SMTP, or the send failed)
- Password requirement checklists are now defined once and shared by every screen that sets a password, so they cannot drift from what the server enforces

### Documentation

- **Fixed the external-reverse-proxy instructions, which described a setup that cannot work.** Removing the bundled `nginx` service leaves *nothing* publishing a port — the backend and frontend are `expose`-only — so the old "Option A" sent people's proxies at a closed port. The API then either failed outright (502 during setup) or, when a proxy pointed only at the frontend, returned the web page itself for every `/api` call, which made a brand-new install show the login page instead of the setup wizard. Option A now covers publishing both services on `127.0.0.1`, why the loopback prefix matters (and that Docker's published ports bypass UFW), and the routing every proxy must do
- **New Cloudflare Tunnel section** covering all three working setups — keeping the bundled nginx (one ingress rule), running `cloudflared` as a container on CozyVTT's network, and running it on the host with path rules — including that ingress rules match in order so the catch-all must be last, and that `localhost` inside a container means the container itself
- **New troubleshooting section**: fresh install showing the login page instead of the setup wizard, setup failing with 502, live features not updating, `git pull` blocked by local changes, and large uploads failing — each with the one-command check that identifies it
- **New `docker-compose.override.example.yml`** and docs for keeping personal deployment tweaks in `docker-compose.override.yml`, which Compose merges automatically and git ignores, so `git pull` stops conflicting with local edits. Also documents the `git stash` workflow for anyone who edits `docker-compose.yml` directly
- Corrected the health-check instructions — `/health` is served by the backend and is not forwarded by the bundled Nginx, so `curl http://localhost/health` never worked; the docs now use `docker compose exec`
- `docker-compose.yml` header comments now list everything required to run without the bundled nginx (comments only — no configuration changes)

### Upgrading from 1.1.1

```bash
git pull
docker compose up -d --build
```

No database migration, no configuration changes. Verified by upgrading a 1.1.1 instance in place:
existing accounts sign in with their original passwords and are **not** forced to reset, campaigns,
characters and uploaded files are untouched, and saved theme choices — including custom colors — carry
over exactly.

Two changes are visible immediately and are intentional:

- Muted and accent-colored text shifts slightly (darker on light themes, lighter on dark ones) — that
  text was below the readable minimum on most themes
- Error, success and warning panels now tint with your theme instead of always being pale pink or green

If your instance has SMTP configured, **Admin → Users** gains an **Invite User** button; if it doesn't,
Create User behaves exactly as before.

---

## [1.1.1] — 2026-08-17

A bug-fix release for two settings that looked configurable but weren't: upload size limits set in
`.env`, and a creature's HP Max. No breaking changes, no database migration — update and restart.

### Fixed

- **Creature HP Max now saves.** Editing a custom creature's HP Max appeared to work but the value was never sent to the server, so reopening the creature always showed 10 again — hit points were not part of a creature stat block at all. HP is now stored with the creature, loaded back into the edit form, and used when placing the creature on a map (previously every creature placed as a 10 HP token regardless of its stat block)
- **SRD monsters now carry their real hit points.** The SRD importer fetched each monster's HP and hit dice from Open5e and then discarded them. New imports include them, and re-running **Seed SRD** from the creature library backfills hit points onto SRD creatures already in your library — it only fills in the missing HP fields and never touches custom creatures. Stat blocks now display hit points alongside armor class
- **Upload size limits set in `.env` are now actually applied.** `MAX_MAP_SIZE_MB`, `MAX_TOKEN_SIZE_MB`, `MAX_AUDIO_SIZE_MB`, and `MAX_AVATAR_SIZE_MB` were documented, passed into the container, and displayed in the admin panel — but never read: every limit was a hardcoded constant, so raising a limit had no effect and the admin panel reported values that didn't match `.env`. The backend now resolves all four at startup, the upload dialog and admin panel read the live values from the server, and the generic upload cap follows the largest configured limit (it previously capped *every* upload at 25 MB, below the documented 50 MB for maps)
- Oversize uploads no longer produce the error "FILE files must be smaller than NaNMB"; the message now names the asset type and its real limit
- Files dropped onto the upload dialog are validated against the asset type currently selected, not the one selected when the dialog opened
- Avatars are checked against the server's avatar limit after cropping, instead of being rejected by the server after a 10 MB client-side check that never matched it

### Changed

- Default upload limits in code now match the documented defaults — MAP 50 MB and AUDIO 20 MB (previously 25 MB and 10 MB in code, while `.env.example`, the README, and the docs all advertised 50/20). Docker installs already passed these values, so only installs running without the environment variables see a change, and only as an increase
- The bundled Nginx reads its `client_max_body_size` from the new **`NGINX_MAX_BODY_SIZE`** variable (default `55M`, i.e. today's behaviour), so a limit increase no longer requires editing `nginx/nginx.conf`. `docker-compose.yml` now mounts `nginx/nginx.conf` as an Nginx template; custom configs keep working unchanged
- The backend logs its effective upload limits at startup, and warns when they exceed the proxy's body cap — including a note about Cloudflare's 100 MB cap on proxied requests (Tunnels included), which no application setting can raise
- The upload dialog now shows the maximum size for the selected asset type up front, and the admin panel shows the body limit your reverse proxy needs

### Added

- `GET /api/config` — public endpoint returning the server's upload limits, so limit changes take effect on restart without rebuilding the frontend image
- **`NGINX_MAX_BODY_SIZE`** environment variable (optional, defaults to `55M`) — sets the bundled Nginx request body cap without editing `nginx/nginx.conf`

### Upgrading from 1.1.0

`docker compose up -d --build` is all that is required — no migration, no configuration changes.

Two optional follow-ups:
- To give SRD monsters their hit points, open a campaign's creature library and click **Seed SRD**. It backfills HP onto the SRD creatures already in your library and leaves custom creatures alone.
- If you raise a `MAX_*_SIZE_MB` above ~50 MB, also raise `NGINX_MAX_BODY_SIZE` (bundled Nginx) or your own proxy's body limit — the backend logs a warning at startup telling you the value it needs.

---

## [1.1.0] — 2026-07-12

A modernization release: faster and smoother real-time play, a redesigned resizable session workspace, a shared UI component layer, a hardened and restructured backend, and accessibility + polish throughout — with no breaking changes for existing installs.

### Performance

- **The map now draws on three stacked canvases** (terrain / tokens / overlay) coordinated by a single animation-frame loop — dragging a token repaints only the token layer, leaving the map image, grid, and fog untouched, instead of repainting the entire scene several times per mouse move
- **Dynamic-lighting vision is memoized** — moving one token or light now re-raycasts only that source against the walls, and panning re-raycasts nothing, so lit maps with many walls stay smooth
- **Spirit-layer and lighting broadcasts no longer scale their database work with the player count** — map switches, spirit-layer toggles, and spirit-token moves now resolve every viewer's visibility in a fixed number of queries per event instead of repeating the visibility lookup once per connected socket, so large groups stay responsive
- The throttled token-drag handler now reads the map a single time per frame instead of twice, halving its per-frame database work during a drag
- Added per-connection flood ceilings on token movement and wall/light edits — a misbehaving or malicious client can no longer overwhelm the server with rapid map mutations (legitimate play stays far below the limits)
- **The campaign-load API response is now bounded** — opening a campaign no longer downloads every map's full token/wall/fog/light data and every character's full sheet; it fetches only the metadata it uses and loads the active map and character sheets on demand, so large campaigns open quickly
- **Live token state moved into a dedicated game store** (zustand) — socket events now write outside the React tree, so dragging a token re-renders only the map canvas, while the roster, initiative tracker, and side panels skip position updates entirely (previously every token move re-rendered every campaign component)
- **Dashboard, Characters, and Asset Library now cache server data** (react-query) — navigating back to a page is instant, duplicate requests are deduped, and data refetches automatically after a network reconnect
- Memoized all React context provider values (Campaign, WebSocket, Auth) — token movement no longer re-renders the entire campaign UI on every socket event
- Asset serving now sends `Cache-Control`/`ETag` headers with 304 conditional-request support; token and map images are cached by the browser instead of re-downloaded on every map load
- The map canvas is code-split into its own chunk, so the campaign page shell paints while canvas code loads
- Default logo and mascot images optimized (1.4 MB → 64 KB combined)

### Fixed

- **The setup wizard now appears automatically on a brand-new install** — visiting the root URL of a fresh instance redirects to `/setup` instead of showing a login prompt you can't yet use. The redirect fires only when no admin account exists; existing installs and container updates are unaffected, and the wizard route now bounces already-configured instances back to the landing page
- **Completing the setup wizard now reliably marks the instance as configured** — the setup-complete flag is written to, and read from, a single canonical settings row, fixing a race on brand-new installs where the wizard created the admin account but the app still reported "Setup Required" (and then refused to re-run setup because a user already existed)
- **Session status now updates live for players** — when the DM starts, pauses, resumes, or ends a session, players see it change to live / paused / inactive immediately instead of having to reload the page
- **Uploading a token image from a character sheet inside a campaign now saves** — previously the image uploaded but the character's token was never updated (the character-library path was unaffected)
- Ending combat and restoring a backup now use the themed in-app confirmation dialog instead of the native browser popup
- The `character.hp.update` WebSocket handler now rejects sockets that have not completed campaign authentication, matching all other handlers

### UI

- **Session screen redesigned as a resizable workspace** — the three campaign columns can now be resized by dragging the dividers and collapsed entirely (header toggle buttons or drag-to-collapse); layout persists per browser between sessions
- **Tabbed session sidebar** — Chat, Dice, Initiative, and Session (vibe + session controls) are now full-height tabs instead of a stacked scrolling column with fixed heights; chat shows an unread-message badge while another tab is active, and all tabs keep their state when switching
- **Grouped DM toolbar** — the seven header pill buttons are now compact icon buttons with tooltips, grouped by purpose (content / ambience / settings), with an active-state highlight while a panel is open
- The map canvas now resizes live as panels are dragged or collapsed
- New shared UI primitive components (Button, Modal, Input/Textarea/Select, Field, Tooltip) — buttons and dialogs now share one implementation instead of per-screen copies
- All ~180 buttons migrated to the shared Button component; 12 dialogs plus the confirmation dialog now render on the shared Modal (portal-based, so dialogs no longer risk clipping inside blurred panels)
- Dialogs, form hints, and status badges now use theme tokens throughout — hardcoded parchment backgrounds and raw gray/slate colors no longer break non-default themes
- The secret dice-roll popup follows the active theme instead of a hardcoded dark style
- Session sidebar tabs now cross-fade when switching instead of snapping
- Proper favicon set — crisp browser-tab and home-screen icons rendered from the logo replace the single oversized mascot image
- New shared empty-state component brings the mascot and consistent framing to "nothing here yet" screens (adopted on the Characters page)

### Accessibility

- **All animation now respects the operating system's "reduce motion" setting** — dice pops, toast slides, modal transitions, tab fades, and ambient effects are suppressed when a user has motion sensitivity enabled, via a single global motion configuration plus a CSS guard

### Security

- **Updated dependencies to clear every known vulnerability in shipped code** — `nodemailer` (email delivery) moved to 9.x and `express`/`ws`/`qs`/`body-parser` to patched releases, resolving reported CRLF-injection/SSRF and denial-of-service advisories; `react-router` updated to close a protocol-relative open-redirect. Production dependency audits (`npm audit --omit=dev`) now report zero vulnerabilities for both the backend and the frontend bundle
- **The admin backup restore now validates a ZIP before extracting it** — restore archives are checked for path-traversal ("zip-slip") entries and capped on file count and total decompressed size (zip-bomb protection), and are streamed to disk entry-by-entry so a malformed or hostile backup can neither write outside the temporary restore directory nor exhaust memory or disk. Campaign import and backup restore now share this single hardened extraction path

### Internal

- The 2,300-line WebSocket handler monolith was split into one focused module per domain (tokens, dice, chat, spirit layer, vibe, maps, atmosphere, characters, initiative, walls, fog, lights) behind a thin connection orchestrator — wire behaviour is unchanged, verified by the full 28-test integration suite passing without modification
- WebSocket handlers now use the structured winston logger instead of `console` calls, so real-time gameplay logs reach the configured file/JSON transports in production
- The rest of the backend (REST routes, services, middleware, config) was likewise swept from `console.*` to the winston logger — production errors now land in `backend/logs/error.log` as structured JSON instead of only the console
- Campaign and character create/update endpoints now validate request bodies with Zod schemas instead of hand-rolled type checks, rejecting malformed input with the same error shape as before
- Map rendering decomposed into pure, unit-tested draw layers (background, grid, fog, tokens, dynamic lighting, walls, tool overlays) with vision polygons computed in a separate module — the canvas render function is now a thin orchestrator, and each layer can be exercised with a mock context (17 new tests)
- Per-layer dirty-flag render scheduler (single requestAnimationFrame) replaces the previous scatter of imperative full-scene repaints; a per-source vision-polygon cache backs the lighting layer (5 new tests)
- Token-tween and fog-reveal animation loops extracted into dedicated hooks
- New state-layer architecture with a documented boundary rule: zustand owns live socket-fed session state, react-query owns REST resources, CampaignContext keeps campaign metadata — never both for the same data
- Game-store unit tests covering the token actions and the movement-ignoring subscription that keeps sidebars static during drags
- New WebSocket integration test suite (28 tests) covering connection auth, token movement permissions, walls/doors, fog of war, lights, initiative, chat, dice, and spirit-layer visibility filtering — run against a real Socket.io server and database
- Map-canvas geometry (Douglas-Peucker simplification, Sobel edge-snapping, grid distance rules) extracted to a pure, unit-tested `utils/geometry` module
- Added visibility-polygon test fixtures (closed rooms, doorway gaps, locked doors) and context-memoization regression tests
- Restored the missing ESLint configuration — `npm run lint` now runs clean (rule strictness documented for future ratcheting)
- The example frontend environment file no longer hardcodes an absolute backend URL — `VITE_API_URL`/`VITE_SOCKET_URL` are left empty so the Vite dev server proxies on a single origin like Docker and production; this fixes asset thumbnail previews not loading under local `npm run dev` (absolute URLs made the images cross-origin, which Cross-Origin-Resource-Policy blocks)

---

## [1.0.0] — 2026-05-17

Initial public release.

### Platform

- Self-hosted VTT platform supporting multiple concurrent campaigns run by different GMs for different player groups
- Three-tier role system: **Admin** (instance operator), **DM** (campaign owner), **Player**
- Setup wizard on first launch to initialize the instance and create the admin account
- Admin dashboard with user management, system settings, and database backup/restore
- User registration with optional admin approval gate
- Campaign invitations with accept/decline flow
- Player can belong to multiple campaigns simultaneously

### Theming & Customization

- **16 built-in color themes** across light, warm, cool, dark, neutral, and vibrant categories
- **Custom theme builder** — pick primary, accent, background, and text colors; the system derives complementary shades automatically
- **8 font families** — all open-source (Google Fonts / SIL OFL): Default, Medieval, Elegant, Modern, Handwritten, Clean, Scholarly, Gothic
- **Per-user theme preferences** — each user picks their own theme and font from the Profile page; persists across logout/login
- **Admin-controlled defaults** — the admin's chosen theme is used on the login page and as the starting theme for new users
- **Custom branding** — admin-configurable logo, mascot, and browser favicon stored on system settings (admin upload UI is a planned enhancement; self-hosters can replace `frontend/public/default-logo.png` and `default-mascot.png` at deploy time)
- **Live preview** — theme and font changes apply instantly before saving

### Authentication & Security

- Email + password authentication with Passport.js
- **Multi-factor authentication (MFA)** via TOTP (compatible with any authenticator app) with single-use backup codes
- "Remember me" persistent sessions (30-day) alongside standard sessions (1-hour)
- Password reset via email (SMTP) or admin-generated temporary password
- Session secret validation — server refuses to start in production with placeholder secrets
- Express rate limiting: global API limit (300 req/min per IP) + strict auth limit (5 req/15 min) + asset-upload limit (30 req/min per user)
- Helmet.js with explicit Content Security Policy tuned for WebSocket and audio
- Magic-byte file validation on every upload (not just MIME header)
- Non-root Docker containers throughout

### Game Systems

Four character sheet implementations included at launch:

| System | Notes |
|--------|-------|
| D&D 5e | Ability scores, skills, combat stats, spells, equipment, features |
| Pathfinder 2e | Ability scores, skills, ancestry/class features, spells, equipment |
| Call of Cthulhu 7e | Investigator stats, skills, combat, possessions, backstory |
| Flexible | Freeform JSON-backed sheet for any system not listed above |

### Campaigns & Sessions

- Campaign creation with name, description, game system, and status lifecycle (Preparation → Active → Paused → Completed → Archived)
- DM roster management — invite players, assign roles, manage characters
- Session start/pause/resume/end with saved map state (token positions, annotations)
- Session history with notes
- **Campaign export & import** — portable `.cozyvtt` archives with maps, tokens, creatures, token templates, assets, and settings; manifest preview before import; optional audio toggle; security-hardened (path traversal prevention, zip-bomb detection, magic-byte validation, Zod schema, fresh UUIDs)

### Interactive Map

- Upload map images with configurable grid (size, feet-per-square, diagonal rule)
- Token placement and movement with real-time sync via Socket.io
- Token drag with live position broadcast to all connected players
- Token types: player, NPC, object — with disposition (friendly/neutral/hostile), HP bars, conditions, stat blocks, notes; three display modes (pog, top-down, full-art); colored-letter placeholders for tokens without images
- **Spirit layer** — optional ethereal overlay for spirit/astral scenes; per-token visibility control so spirit tokens are only visible to characters on the spirit layer
- **Fog of war** — DM-controlled fog brush with configurable radius; reveal/hide individual cells or reveal/hide all; animated fade transitions

### Walls & Dynamic Lighting

- **Wall drawing tools** — six tool modes: Draw, Select, Split, Erase, Polygon, Brush
- **Wall types** — Wall (blocks vision), Door (closed/open/locked, interactive), Window (transparent)
- **Polygon mode** — click corners to outline a room; close the shape to create all wall segments at once
- **Brush mode** — paint over the map to trace walls; Douglas-Peucker simplification converts strokes to straight segments; image-aware edge snapping refines placement when snap-to-grid is off
- **Snap-to-grid** — wall endpoints align to grid intersections for precise placement
- **Snap-to-endpoint** — connect walls to existing endpoints within a configurable radius
- **Snap-to-wall door/window placement** — click two points on an existing wall to automatically split it and insert a door or window
- **Select mode** — click segments to change type or delete; drag endpoints to reposition (all connected segments move together); merge intermediate points to join two segments into one
- **Split mode** — click a wall segment to add a midpoint
- **Erase mode** — brush-erase multiple wall segments by dragging
- **Wall color customization** — preset palette and custom color picker
- **Undo/redo** — full history for all wall operations (Ctrl+Z / Ctrl+Y)
- **Dynamic lighting** — per-map toggle; raycasting visibility from each player's token position with circular perimeter sampling for accurate light shapes in open areas
- **Three-state fog rendering** — dark, dim (half-tint), and bright zones with proper visual falloff
- **Dim-overlap-bright house rule** — two overlapping dim zones from different lights combine to bright via additive alpha
- **Light sources** — DM-placed point lights with separate bright and dim radii matching TTRPG light mechanics (D&D 5e, PF2e); named presets (Candle, Torch, Lamp, Lantern, Campfire); configurable color
- **DM preview player view** — DM can toggle to see what players actually see
- **Door interaction** — players can click doors to toggle open/closed; DM can lock/unlock
- **Performance** — spatial grid index activates automatically for maps with 200+ wall segments

### Token Templates & Creature Library

- **Creature Library** — browse, search, and place creatures from the SRD bestiary (auto-imported from Open5e); per-campaign favorites; duplicate SRD creatures to customize stat blocks; **edit custom creatures in-place** (name, image, stat block, traits, actions, etc.); save token images back to creature templates
- **Token Templates** — save any token configuration (image, stats, HP, size, disposition, display mode, notes, full NPC stat block) as a reusable template; place on map with one click; copy templates between campaigns the DM owns
- **DM right-click NPC token rolls** — DMs can roll abilities, saves, skills, attacks, and damage parsed from the NPC's stat block; advantage/disadvantage selector for d20 systems; free-form custom roll fallback for non-5e systems or tokens without stat blocks; phase-1 D&D 5e math fully supported

### Asset Library

- Three-scope asset model: **Global** (admin-managed, instance-wide), **Campaign** (DM-managed, campaign-scoped), **User** (personal uploads)
- Supported asset types: Maps, Tokens, Audio, Avatars, Documents, Other
- File type validation via magic bytes (not just extension)
- Configurable upload size limits per asset type (env vars)
- Avatar serving per user (`GET /api/assets/avatars/:userId`)

### Atmosphere & Vibe

- **Vibe tracker** — DMs set the time-of-day "vibe" (dawn/day/dusk/night or custom periods); UI shifts ambiance accordingly
- **Atmosphere overlays** — six CSS particle effects (rain, mist, leaves, sparkles, snow, wind) rendered over the map canvas
- **Spirit layer controls** — DMs toggle spirit realm mode and choose the layer style (wispy, ethereal, shadow, custom color)
- **Atmosphere audio** — DMs play ambient audio tracks from the asset library for all connected players

### Chat & Dice

- In-session chat with message types: player, DM, system, dice roll, character action
- Dice roller supporting standard RPG notation (`2d6+3`, `4d6kh3`, etc.)
- Secret rolls visible only to the roller and the DM
- Roll results broadcast to the session with full breakdown

### Initiative Tracker

- Add/remove combatants, set initiative values
- Advance turn, highlight active combatant
- Real-time sync to all session participants

### Infrastructure

- **Docker Compose** production stack — PostgreSQL, backend, frontend (Nginx), reverse proxy (Nginx) on an isolated internal network
- **Development stack** (`docker-compose.dev.yml`) — hot-reload, all ports exposed
- Multi-stage production Dockerfiles (Alpine-based, non-root users, compiled output only)
- **Winston** structured logging — JSON in production (written to `backend/logs/`), pretty-printed in development
- Health check endpoint (`GET /health`) reporting API and database status
- Configurable host ports via `HTTP_PORT` / `HTTPS_PORT` env vars
- Support for external reverse proxies (Traefik, Caddy, Cloudflare Tunnel) — bundled Nginx is optional
- Production builds strip `console.log` / `debugger` statements via Vite/esbuild

### Known Limitations

- Moving assets between scopes (Global ↔ Campaign ↔ User) via the UI is not yet implemented; assets are assigned to their scope at upload time
- Admin UI toggle for the `globalAssetManager` permission is not yet exposed (field exists in the database)
- Admin upload UI for runtime branding swap (logo / favicon / mascot) is not yet built — backend supports the override; self-hosters replace files in `frontend/public/` at deploy time
- "Map-only" campaign import option (skip tokens) is not yet available — current toggles are audio-include only
- Shadowrun 6e character sheet is partially scaffolded but not yet shipped
- No built-in log rotation for `backend/logs/` — use `logrotate` on the host
- Accessibility has not been formally audited
- UVTT import/export supports walls and light sources; UVTT single-range format is mapped to bright/dim radii on import (bright = range/2, dim = range)

### Roadmap

- Asset scope management UI
- Admin UI for branding uploads
- Map-only campaign import toggle
- Shadowrun 6e character sheet
- AI-powered features (NPC chatbots, asset generation)
- In-app log viewer for admins
- Formal accessibility audit and remediation
