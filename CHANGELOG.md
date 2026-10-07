# Changelog

All notable changes to CozyVTT will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Upgrading from 1.5.0

If you have edited `nginx/nginx.conf`, for example to turn on HTTPS, `git pull` stops at it because this release changes that file. Set your edits aside and bring them back with `git stash`, `git pull origin main` and `git stash pop`, as described in [Updating after you've edited `docker-compose.yml`](docs/DEPLOYMENT.md#updating-after-youve-edited-docker-composeyml). If `git stash pop` reports a conflict, keep your own lines, then compare your HTTPS block with the new commented-out one and add what it has that yours lacks:

- the two `set` lines after `server_name`, naming `$cozyvtt_backend` and `$cozyvtt_frontend`,
- `$cozyvtt_backend` in place of `http://backend:4000`, and `$cozyvtt_frontend` in place of `http://frontend:80`, in every `proxy_pass` line,
- the whole `location /api/campaigns/import` block.

The new `resolver` line near the top of the file covers both blocks.

If you use your own proxy instead of the bundled nginx, give `/api/campaigns/import` a body limit of at least 505 MB and 300 seconds to answer, as [Minimum proxy requirements](docs/DEPLOYMENT.md#minimum-proxy-requirements) describes, or larger campaign archives cannot be imported. There is one new setting, `CAMPAIGN_ARCHIVE_RATE_LIMIT`, and it is optional: leave it out and the default applies.

### Changed

- **PDF files are no longer accepted as a map picture.** Nothing can draw a PDF as a map, so one used as a map's picture gave a blank map that could not be exported. Uploading a map now takes PNG, JPEG or WebP only, from the Asset Library, from a Universal VTT import and through the API; PDFs still go in the Documents library. No part of the app offered a PDF as a map, so nothing you can see changes, and a map already stored as a PDF is still served.

- **Deleting an asset that is still in use now shows where it is used before anything is removed.** If a map, a token, a character, a character template, a creature, a token template or a campaign's ambient sound still uses an image or a sound, the delete is held back and a window lists what would lose it. The file is removed only if you choose **Delete anyway**. This covers the Asset Library, the Documents pages and the Admin Panel's Assets tab, which used to delete on one click and now asks first, naming the asset, who uploaded it and its campaign. An admin sees every campaign by name; anyone else sees names only for the campaigns they run, their own characters and shared character templates, and just a count for the rest. A refused delete now shows the reason instead of a general "failed" message.

- **The Admin Panel asks before deleting a backup or changing someone's role.** The bin beside a backup and the USER / ADMIN pill beside a person used to act on one click. Each now opens a window that names the backup or the person, and the pill says what an administrator can do before it makes one, or that taking the role away removes their access to the Admin Panel. Those buttons also have names a screen reader can read.

- **Deleting a custom creature, a token template or a token from the map now asks first.** Delete in the Creature Library and the Token Templates list, and Remove in the Token Roster, the Token Manager and the token's quick editor, and **Remove from Map** in a token's right-click menu, used to act on one click with no undo. Each now names what will be deleted. In the Token Roster the row buttons also show while you tab through them and always on touch screens, are larger, and a failed hide, reveal or remove shows a message instead of nothing, as a failed **Remove from Map** now does too.

- **Dice rolls allow far more before the limit.** The limit of 30 rolls a minute per player could be reached by a DM rolling attacks and damage for a group of monsters in one round. It is now 200 a minute, and 50 in any one second, which no table reaches.

### Fixed

- **A Universal VTT import that is refused now says why.** A file with the wrong extension, one over the size limit, one sent under the wrong form field, or a damaged upload answered a generic "An unexpected error occurred". It now answers with a message saying what is wrong, and a file over the limit is told the limit. A map name sent twice, or longer than 200 characters, is refused the same way.

- **A Universal VTT import can no longer exhaust the server's memory.** A file packed with millions of tiny wall points, or with a picture far over the map limit, used to be built into millions of objects before it was refused, which could take the backend down for every campaign. The walls, doors and lights are now counted as soon as the file is read, and a picture over the map size limit is refused from its size before it is decoded. The largest file accepted now follows the map size limit instead of a fixed 100 MB, and one person can run one import at a time; a second file sent while the first is still being read is asked to wait. Importing a folder of maps one after another is not slowed down.

- **Exporting a map to a Universal VTT file is quick on large maps, and keeps more of the map.** Joining a big map's walls into lines could take many seconds and hold up every other table on the server. It now takes a fraction of a second. Windows are written as open doorways instead of walls, so they no longer block sight in another tool or when imported again, and switched-off lights and each light's bright radius are kept, so an exported map imported again lights the same way. A locked door still comes back as an ordinary closed door.

- **The proxy size advice now covers Universal VTT imports.** A `.uvtt` file is about a third bigger than its picture, so with the default 55 MB proxy limit a picture over about 37 MB was refused by the proxy with a bare 413. The deployment guide now explains the sizing rule and gives the value that lets a picture up to the full map limit through.

- **Closing a document you are writing or editing no longer throws the text away silently.** Pressing Escape, the X or Cancel in the New document window, or in the reader while editing, now asks whether to discard when there is typed text or unsaved changes. With nothing typed it closes straight away.

- **The backend's log files say what went wrong.** Almost every error was written as an empty `{}`, so a log kept a label such as "Error adding token" and nothing about the cause. Each error is now written with its message and where in the code it happened, on the console and in the log files, so a log attached to a bug report can be diagnosed. A value longer than 8,000 characters keeps only its start and end, so one oversized request cannot write a huge line.

- **Log files no longer grow until the disk is full.** The backend's two log files, and Docker's log of each container, had no size limit, and the deployment guide's advice to rotate them with logrotate did not free any space, because the backend keeps its files open. The backend now starts a new file at 10 MB and keeps five of each, and Docker keeps five files of 10 MB for each container. There is nothing to set up, and any logrotate rule added for the backend's logs can be removed. The container limits take effect the next time the stack is started with `docker compose up -d`.

- **The backend keeps running when the database restarts.** Stopping or restarting PostgreSQL, as a database upgrade or a host reboot does, could stop the backend with it, because the login-session store treated a dropped database connection as a crash. The drop is now logged, and the store opens a new connection for the next request.

- **Audio tracks are served correctly from any point in the file.** A request for the last part of a track, or for a part beyond its end, failed with a server error, and a request running past the end promised more than it sent. These now get the right part of the file, or a clear "outside the file" answer. Switching or seeking a track also no longer leaves the old file open on the server, which over a long session could stop it opening any more files, and a file that cannot be read part-way through no longer stops the backend.

- **Stopping, restarting or upgrading the stack is quick and clean.** The backend ignored the stop signal Docker sends, so every stop, restart and upgrade waited ten seconds and then killed it outright, cutting off whatever it was doing. It now finishes the requests in progress, disconnects everyone at the table, closes its database connections and exits, usually within a second. Players' browsers reconnect by themselves once it is back. A backend run without Docker stops the same way on Ctrl+C or a service manager's stop.

- **Markdown documents opened from the Documents page are formatted.** Headings, lists and tables showed as plain text there until a campaign had been opened in the same tab, because the reader's styles only loaded with the campaign page.

- **Typing in a token's stat block no longer saves, and resends the whole map to every player, on every keystroke.** A sixty-letter trait was sixty saves and sixty full map updates at every player's screen, and a slow save could land after a later one and leave an earlier keystroke stored. The stat block in the token's quick editor is now saved once you pause typing, or straight away when you click out of it, switch it back to View or close the editor.

- **Dragging the ambient sound's volume slider no longer sends every step to the whole table.** Each step was saved and sent to every player, whose sound restarted its fade each time, so one drag from silent to full was twenty saves and twenty fades. The new volume is now sent once, when you let go of the slider or a key moves it.

- **A chat cooldown longer than a minute now lasts its full length.** With a cooldown of, say, five minutes, a player could sometimes post again after a little over one, whenever the server's routine tidy-up happened to land inside their wait.

- **Uploaded file names keep their double quotes.** A file called `Dragon "Smaug".png` was recorded as `Dragon %22Smaug%22.png`, and was offered for download under that name.

- **Exporting a large campaign no longer risks stopping the server, and works on slow connections.** The export was built whole in the server's memory before any of it was sent, so a campaign with a few large maps could stop the server for every table, and the browser gave up on any export that took longer than 30 seconds to arrive. The archive is now sent as it is made, and the browser waits for as long as it takes. In Chrome and Edge you choose where to save it and it is written straight there; other browsers download it as before. An export whose pictures and sound add up to more than 500 MB, the most an import accepts, is now refused with a message giving its size and saying whether leaving out audio would bring it under, where it used to make an archive no server could import. The refusal used to show only "Failed to export campaign".

- **Campaign archives up to 500 MB can be imported through the bundled nginx.** Imports had the 55 MB body limit every other upload has, so a campaign with a couple of large maps could be exported but not imported again, and the import window said only "Request failed with status code 413". Imports now have a limit of 512 MB there and five minutes to finish unpacking, the import window waits for a slow upload instead of giving up after 30 seconds, and when a proxy refuses an archive as too large the window says so and what whoever runs the server can do about it.

- **A large campaign import or backup restore on a slow connection is no longer cut off after five minutes.** The server gave every request five minutes to arrive in full, so a 500 MB archive needed an upload speed of about 13 Mbit/s, and a slower one failed with an error after the wait. It now allows an hour, enough for a 500 MB archive at a little over 1 Mbit/s. An upload that stops altogether is still dropped within a minute.

- **The site no longer answers 502 after only the backend is recreated.** When `docker compose up -d` recreated the backend, after a change to `.env` for example, the bundled nginx went on sending to the old container's address until it was restarted itself, so the pages loaded but signing in failed. It now finds a recreated backend or frontend within ten seconds.

- **The deployment guide's section on the API documentation is corrected.** It recommended publishing the API docs as if CozyVTT had a public API, said every route needs a sign-in when some are public by design, and gave nginx steps that do not work with the bundled Docker setup. It now says what the file is for, how to read it without hosting anything, and what actually protects an instance.

- **The Characters page shows a character as you last saved it.** ([#40](https://github.com/CheekyChinchilla/CozyVTT/issues/40)) After saving in the Character Editor and going back, the Characters page could go on showing the character from before the save: on its card, in the sheet that opens when you click it, in **Export as JSON**, and in the editor opened from that sheet. Saving from that editor was then refused as out of date, which made it look as if your earlier changes had been lost. A character made from a template now also appears on the Characters page straight away.

- **Saving in the Character Editor no longer copies the whole sheet into the browser's console,** where it could end up in a log attached to a bug report.

- **Opening a D&D 5e sheet's editor and cancelling leaves the sheet as it was.** On a sheet whose modifiers, saving throws or skill bonuses did not match its ability scores, an imported one for example, opening the editor wrote the corrected numbers into the sheet behind it and into the Characters page before anything was saved. After **Cancel** they showed numbers that had never been saved, and **Export as JSON** wrote them out.

- **A D&D 5e sheet with cantrips typed in counts as saved once you save it.** The Character Editor went on saying there were unsaved changes, so leaving asked you to confirm and the time of the last save was not shown.

- **What you type while a sheet is saving is kept.** Every box stays editable while a save, and any new token picture with it, goes through. The sheet went back to its read-only view as soon as the save finished, dropping anything typed in those seconds, and the Character Editor then warned about unsaved changes when there was nothing left on screen to save. The editor now stays open with what you typed, still counted as unsaved, until you save again. This applies to every game system, in the Character Editor and in the editor that opens over a sheet.

- **A save refused because the character changed keeps your edits.** ([#40](https://github.com/CheekyChinchilla/CozyVTT/issues/40)) When a character changes after you open its editor, for example the DM takes hit points at the table or you save it from another window, your save is refused so that it cannot put the old values back. The editor used to close, or load the newer version over your work, and everything typed since you opened it was lost. It now stays open, puts your changes onto the newest version, and lists them in a box headed **This character has changed**. **Save my changes** saves them; **Keep editing** goes back to the editor with nothing saved. Anything changed both by you and in the newer version is shown with both values, and you pick which to keep before saving. This works in the Character Editor and in the editor that opens over a sheet on the Characters page or at the table.

- **Edit Template keeps your sheet edits when a save fails.** When the server refused a template's sheet, the sheet went back to the template as it was and every edit was lost, with only an error message. It now stays in its editor with your changes. Closing **Edit Template** with sheet changes you haven't saved asks first, and **Save Details** no longer closes the dialog over them. After a sheet save the dialog stays open and shows the saved sheet. A token picture chosen on the sheet cannot be used, since a template's picture has to be a global asset; the message after saving now says so, where before the picture was dropped without a word.

- **Saving a Flexible sheet keeps everything stored in it.** The Flexible sheet, used for characters with no game system, saved only its sections, so anything else it held, from an imported file or a program using the API, was deleted the first time it was saved.

- **A colour you pick for a D&D 5e or Pathfinder 2e sheet stays picked while you edit.** When the character was updated elsewhere during your edit, at the table for example, the colour saved there replaced the one you had just picked in the editor.

- **Players can no longer see through a wall that shares another wall's id.** On a map with more than 200 walls, a second wall or door given the same id as another was ignored when working out what players could see, so they saw, and were sent tokens, through it. The map editor never does this, but a script or another client could. Both walls now block sight, and saving a wall or light list with a repeated id, or adding one whose id is already on the map, is refused.

- **Editing one light can no longer leave its dim radius smaller than its bright radius.** Changing only one of the two radii skipped the check that they make sense together, and the light was then saved in a state that made every later save of the map's lights fail. The change is now refused with a message.

- **A single wall can be set to a locked door.** Changing one wall's type refused the locked-door type, which drawing walls, saving the wall list and the DM's live wall editing all accept.

- **Tokens always stand on whole squares, with all of them on the map.** The server took a token placed between squares, or one hanging mostly off the edge of the map, from a script or another client, and other players then saw it out of line with the grid. A position between squares is now refused, and a token too big for where it is put is moved back until it fits on the map, as dragging one already does. Placing a large creature from the Creature Library or a template on a small map now lands it fully on the map.

- **Wall, door, light and fog changes made at the same moment are all kept.** Placing a door on a wall, or splitting a wall in two, sends several changes at once, and the server could keep only the last of them: everyone's screen showed the door, but after a reload the original wall was back and the door was gone. The same could happen when a player opened a door while the DM was drawing walls, to lights placed or changed in quick succession, and to two fog reveals or hides that overlapped, which could leave part of a room covered again or uncovered. Changes to a map's walls, lights and fog are now saved one after another, so none of them is lost.

- **Undoing a wall change after switching maps no longer puts the old map's walls on the new one.** The wall undo history carried over from one map to the next, so pressing Ctrl+Z, or Undo in the Walls panel, on the new map replaced all of its walls with the previous map's, for everyone at the table. Each map now starts with nothing to undo.

- **Typing in the chat box, or any other text box, no longer edits the map's walls.** With the wall Select tool up, pressing Backspace or Delete in the chat box deleted the selected walls for everyone, and the key never reached the box. In the same way Ctrl+Z and Ctrl+Y undid or redid a wall edit, the arrow keys moved the selected walls, and Ctrl+A selected every wall. The map's keyboard shortcuts now apply only when you are not typing.

- **The DM's map shows doors players open, and the DM's next wall edit no longer closes them again.** The DM's page ignored every wall, door and light change, taking each for its own, so a player's door toggle, or a wall or light changed through the API, did not appear for the DM until a reload. Worse, the DM's next wall edit sent the old list back and undid the change for everyone. The DM's page now shows these changes as they happen, and undoing the DM's own wall edits leaves them in place. This also holds after the DM seat changes hands without a reload.

- **Handing over the DM seat no longer mixes up the spirit realm for the two people involved.** Until they reloaded, the former DM, now a player, was not told when their token crossed into or out of the spirit realm on a map change, so their "Spirit Realm" badge could stay wrong, and the new DM heard the crossing sound meant for players.

- **Reconnecting brings back doors and lights changed while you were away.** After a dropped connection the page did not fetch the map's walls and lights again, so a door opened in the meantime stayed closed on that screen, blocking the player's sight, and a light added or switched off did not change, until a reload.

- **Switching a map's lighting or fog no longer brings back its old picture.** After you changed the picture, grid size or name of the map on show in Edit Map, the next change to its dynamic lighting, fog of war, Global Illumination or explored areas put the old picture, grid and name back on the map until a reload.

- **Saving Edit Map no longer removes the map's spirit layer picture.** Opened from the Map Library, the dialog showed no spirit layer picture, and saving, even after changing only the name, cleared the picture. The dialog now shows the map's spirit layer picture and changes it only when you pick another or clear it. It also saves only what you changed.

### Security

- **One player can no longer flood the chat, hit points, hit dice or token moves.** Chat had no limit unless the DM turned the chat cooldown on, and changing hit points or spending hit dice had none at all, so a script could fill everyone's chat, or tie up the database until the whole instance stalled. Picking a token up and putting it down shared the allowance of the drag itself, so a script could rewrite the map 150 times a second. Each now has a limit per player, counted across all their open tabs, far above anything a real table sends: 50 chat messages a second and 300 a minute, 50 hit point changes a second, 50 hit dice spent a second, and 30 pick-ups and 30 drops a second. Anything past the limit changes nothing, and the sender is told once. The DM's chat cooldown still works as before, on top of this.

- **One account can no longer hold unlimited live connections, or rejoin a campaign in a loop.** Each open campaign page is one live connection, and nothing limited how many one account could have; since the server works out what to send each connection separately, a script holding a thousand of them slowed the game for everyone. An account may now have 40 open at once, across all its campaigns, and a page past that is told to close a tab or device. Joining a campaign is limited to 50 times in ten seconds per account, and a page that rejoins the campaign it is already in no longer makes everyone's player list refresh.

- **The DM's live controls have limits too.** Anyone can run a campaign of their own, so the DM's controls were as open to a script as a player's, and sending the map to the table had no limit at all, though each send rebuilds the whole map for every member. Sending the map, the atmosphere, ambient sound and vibe, the spirit layer, each initiative tracker action, clearing the dice log and resetting explored areas now each take up to 50 a second per account, far more than any click sends.

- **A dice roll's character name and purpose are limited in length.** They were stored and sent to every member exactly as sent, so one roll could carry close to a megabyte of text to every screen at the table and into the dice log. The name may now be up to 200 characters and the purpose up to 300; the dice panel's boxes stop there, and a roll sent with more is refused with a message saying which. A roll's secret setting must be on or off.

- **Exploring a map no longer rewrites a player's whole memory of it several times a second.** Each time a player's view moved, their remembered areas of the map were read and written back in full, even when nothing new had been seen, so a modified page could keep the database busy rewriting a large map's memory indefinitely. What a player sees is now saved at most once a second, and not at all when it adds nothing. A player with the map open in two tabs could also lose some of what they explored, because the second tab's reports were turned away; they no longer are.

- **Signing in correctly can no longer lock anyone out.** The limit of five failed sign-ins per fifteen minutes from one address also caught correct sign-ins that arrived together, as when a household, a club or a school signs in as a session starts, and each refusal then counted as a failure. A few of those locked everyone at that address out of signing in, resetting a password and changing two-factor settings for fifteen minutes. On an instance behind a proxy that shows every visitor as one address, that was everyone. Now only a wrong password, a wrong two-factor code or a password reset link that no longer works counts, and correct sign-ins arriving together all go through. Five wrong answers from one address still lock it for fifteen minutes, and an email with no account still answers exactly as a wrong password does.

- **A damaged upload can no longer shut the server down or leave it stuck.** The part of CozyVTT that reads uploaded files had known flaws: any signed-in user could send a cut-off or malformed upload that stopped the whole server for everyone at the table, or form data that kept it busy for minutes. It is updated to the current release, which closes them. Uploads also now refuse form data with more than 100 fields, field names over 100 characters, or deeply nested names, none of which a normal upload comes near. An upload cancelled halfway no longer leaves a part-written file behind.

- **A signed-in user can no longer fill the server's disk through its log.** A client could send an event named "error" carrying up to a megabyte of text, as often as it liked, and the server wrote each one to its log files and the console. Such events are now ignored, and nothing they carry is written.

- **A request that is not valid JSON is no longer logged with the text around the mistake.** The log line quoted part of the request, which in a sign-in could include the password. It now records only that a request was refused, why, and where it was sent. The browser never sends such requests; a hand-written script could.

- **Log files no longer keep full email addresses.** Every address the backend logs, from the emails it sends to the errors it records, is cut to its first letter and its domain, such as `a***@example.com`. That is enough to tell accounts apart, and an account deleted later no longer leaves its address behind in the logs. The database's own error messages, which quote the request that caused them, used to go to the container log in full; they now go through the same masking, and a very long value in them is shortened like any other. Logs written by older versions still hold full addresses; the deployment guide's section on log files says how to remove them.

- **A specially crafted email address could make the server stop responding for minutes.** Addresses are now checked safely. One over 254 characters, the most the email standards allow, is now refused when registering, during setup, on a profile change, or when an administrator adds or invites a user. No real address is that long, so no existing account is affected.

- **A specially crafted atmosphere setting could make the server stop responding for minutes.** Atmosphere filters are now checked safely, both when a DM saves them and when a campaign is imported. Every filter the atmosphere editor makes is accepted as before.

- **A specially crafted hit dice entry on a character sheet could freeze the browser of anyone who opened the sheet.** Hit dice are now read safely, and every existing sheet shows them as before.

- **Restoring a specially crafted backup from the Admin Dashboard could make the server stop responding.** Every line of a backup is now read safely, and backups CozyVTT made restore exactly as before.

- **A very large map can no longer take the whole server down.** Any signed-in user can create a campaign of their own, and the server accepted a map of any size, so a map tens of thousands of squares wide with fog of war on made the server run out of memory and stop for every table. Maps now have the limits Create Map and Edit Map already offered: 1 to 500 squares on each side, a grid size of 10 to 500 pixels, and 1 to 100 feet per square. The same limits apply to Universal VTT and campaign imports, so a campaign archive holding a map with a grid size between 201 and 500, which the app allows, now imports instead of losing that map. A map made before this release that is larger still opens and still saves edits that leave its size alone, but fog of war and explored areas cannot be turned on for it, and one that already had fog on shows no fog. The message says to make the map 500 by 500 squares or smaller.

- **One map can no longer be grown until the server stalls.** A map's tokens are stored together and read in full every time any token on the map is moved, dragged or changed, and nothing limited how many tokens a map could hold or how much a token's stat block could carry, so anyone able to create a campaign could make one map hundreds of megabytes and slow the server for every table. A map now holds up to 1,000 tokens, and a stat block up to 64 KB, about ten times the largest creature in the SRD. Adding a token past the limit, or moving tokens onto a map that would go past it, is refused with a message. A map that already has more keeps all of them, and they can still be moved, edited and removed.

- **A wall placed absurdly far away can no longer freeze the server.** Wall and light positions had no limit, and working out what players can see on a map with more than 200 walls walked over every part of the map a wall's ends spanned, so one wall reaching millions of pixels stopped the server for every table, and froze players' browsers too. Walls and lights may now reach up to 500 grid squares past the edge of their map, which leaves plenty of room for drawing past the edge and for Universal VTT files whose walls run outside their picture. One further out is refused with a message when it is drawn or saved, a Universal VTT file holding one is refused on import, and a map holding one in a campaign archive is left out of the import. Walls and lights already stored further out are kept, and the wall list still saves with them in it. Working out sight also no longer costs more the further a wall reaches.

- **A crafted campaign archive can no longer crash the server.** Importing a campaign, or only previewing one, unpacked each file inside the archive into memory before checking its size, so any signed-in user could send a small archive that unpacked to gigabytes and stop the server for every table. An archive listing a very large number of files did the same. Archives are now read from disk a piece at a time and stopped as soon as they pass a limit, and one listing more than 1,000 files is refused before it is opened. A picture or sound file inside an archive that is larger than the upload limit for its kind is left out of the import, as it would be refused if uploaded.

- **Campaign imports and exports are limited per person.** Each one moves up to 500 MB through the server every table shares, and nothing stopped one account from starting dozens at once, which was enough to stop the server. Each person may now preview 20 archives, import 20 campaigns and export 20 campaigns an hour, one at a time; someone who reaches a limit is told how many minutes to wait. Moving a campaign takes one preview and one import, so a real table never comes near this. Players can still import campaigns, under the same limits. The number can be changed with the new optional `CAMPAIGN_ARCHIVE_RATE_LIMIT` setting (see the deployment guide). Picture, sound and document uploads, and Universal VTT map imports, are not affected.

- **Campaign imports take only the files an upload would.** A crafted archive could put any kind of file into a campaign, a program among them, labelled as a PDF handout or a picture, and members could then download it from the campaign's library under whatever name the archive gave it. Each picture and sound file in an archive must now be a format the upload window accepts for its kind, judged by its content, and is stored as what it really is. Anything else is left out of the import. Archives exported by CozyVTT hold nothing else, so they import as before.

---

## [1.5.0] — 2026-10-03

### Upgrading from 1.4.0

The upgrade is the usual one, but read the two lists below: a few things look different afterwards, and some instances need a step or two. Back up first, as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

The database is updated automatically on the first start. The update adds three settings to every map (fog on or off, Global Illumination, and remembering explored areas), set so that existing maps keep their fog and Global Illumination. Remembering explored areas starts on, so players' maps begin to keep ground they have seen, in grey. It adds one new, empty table for explored areas. It also lets two existing columns be empty (who made a dice roll, and who uploaded a file) so that a deleted account's rolls and uploads can stay. No existing row is changed or removed, and there is no manual data migration. No new setting is required.

If you have edited `nginx/nginx.conf`, for example to turn on HTTPS, `git pull` stops at it because this release changes that file too. Set your edits aside and bring them back with `git stash`, `git pull origin main` and `git stash pop`, as described in [Updating after you've edited `docker-compose.yml`](docs/DEPLOYMENT.md#updating-after-youve-edited-docker-composeyml). If `git stash pop` reports a conflict, keep your own lines, then compare your HTTPS block with the new commented-out one and add what it has that yours lacks:

- `proxy_request_buffering off;` in the `location /api/admin/backups/restore` block,
- the whole `location = /health` block,
- `$remote_addr` wherever the file sets `X-Forwarded-For`.

#### What you will notice

- **Fog of war now hides the map completely.** Players see solid black where nothing has been revealed. Existing maps keep fog on, with the same areas revealed.
- **Existing lit maps keep line-of-sight lighting.** They get the new **Global Illumination** setting switched on, which keeps the old behaviour: everything in line of sight is visible. Turn it off in Edit Map, or at the top of the Lights panel, when you want lights and darkvision to matter. Two things do look different: unlit ground is now fully dark, where it used to be nearly dark, and ground a player has explored shows in grey.
- **A player or spectator with no token on a lit map sees nothing.** The server sends them no tokens. To let a spectator watch a lit map, turn dynamic lighting off for that map.
- **Players' maps remember explored areas.** On a lit map, ground a player has seen stays on their map in grey after it leaves their sight. It is on for existing maps.
- **A token belongs to whoever is set as its controller.** Tokens keep their controller. If a character's token is set to **Nobody (DM controls)**, or to someone else, the character's player no longer counts it as theirs: it gives them no sight on a lit map, and they cannot see it through fog. Choose them in **Edit Token → Controlled By** if they should have it.
- **Character sheets drop fields their game system does not define**, the next time each sheet is saved. Fields that the built-in sheets of versions before 1.3.0 wrote are moved to where the sheet reads them first. Where the sheet already has something in that place (a personality trait filled in both the old way and the new way, for example), the older copy is dropped.

#### What to do afterwards

- **Regenerate your MFA backup codes.** Existing backup codes stop working, because they are now stored like passwords. Sign in with your authenticator app and use **Profile & Settings → Security → Backup Codes → Regenerate**. The authenticator app keeps working.
- **Move old backups.** Backups now live in `backend/backups/`, outside the uploads folder. If you have backups in `backend/uploads/backups/`, move them once the upgraded stack has started; the dashboard lists only the new folder. On Docker both folders belong to the backend's user inside the container, so the move needs `sudo`. The `chmod` makes the moved backups readable by that user alone, like new ones:

  ```bash
  sudo sh -c 'mv backend/uploads/backups/*.zip backend/backups/ && chmod 600 backend/backups/*.zip'
  ```

  Without Docker, the folder is created the first time the Backups tab is opened. To move backups before that, run `mkdir -p backend/backups && chmod 700 backend/backups`, then the part in quotes above on its own, without `sudo sh -c`.
- **Check your database password.** A production instance now refuses to start while `DATABASE_PASSWORD` is still the placeholder from `.env.example`. If `docker compose logs backend` shows that message, change the password inside the database first, because the database only reads `POSTGRES_PASSWORD` when it is first created. Changing `.env` alone would lock the backend out. With the stack up (the database runs even while the backend refuses to start):

  ```bash
  NEW_PASSWORD=$(openssl rand -hex 24)
  docker compose exec database psql -U cozyvtt -d cozyvtt -c "ALTER USER cozyvtt WITH PASSWORD '$NEW_PASSWORD';"
  echo "$NEW_PASSWORD"
  ```

  Put the printed value in `.env` as `DATABASE_PASSWORD`, then run `docker compose up -d`. If you changed `DATABASE_USER` or `DATABASE_NAME`, use your own names in place of `cozyvtt` (the refusal message prints the command with your names filled in). See [Changing the database password](docs/DEPLOYMENT.md#changing-the-database-password).
- **Without Docker, make the database role own the database and its `public` schema.** Restoring a backup now recreates the `public` schema, which only its owner may do. Docker installs already have this. On a manual install, run these once, with your own names if you changed them (the second is needed on PostgreSQL 14, or on a database first created on 14, and is harmless on newer versions):

  ```bash
  sudo -u postgres psql -c "ALTER DATABASE cozyvtt OWNER TO cozyvtt;"
  sudo -u postgres psql -d cozyvtt -c "ALTER SCHEMA public OWNER TO cozyvtt;"
  ```

  Nothing else needs it until you restore a backup.

**Backups made from the Admin Dashboard on 1.4.0 could not be restored.** They were not damaged, and they restore on 1.5.0, including into a fresh 1.5.0 install. An install without Docker can keep backups somewhere else with the optional `BACKUP_DIR` setting.

### Added

- **Obscure a token's identity.** Right-click a token and choose **Obscure Identity** (the same switch is in Edit Token, the Token Roster and the Token Manager). Players who do not control it see a grey shape with a question mark, called "Unknown creature" in the hover card, the initiative tracker and the dice log. Its name, picture, conditions, hit points and disposition are not sent to their browsers at all. The DM still sees the token, with a small **?** badge. **Reveal Identity** undoes it. The DM sets it by hand; light does not affect it.

- **Maps remember what each player has explored.** On a map with dynamic lighting, areas a player's tokens have seen stay on that player's map, greyed and darkened, while out of sight. Each player's memory is kept on the server, so it survives a reload or a change of device. **Remember Explored Areas** in Edit Map turns it on or off for a map (on for existing maps, off for new ones), and **Reset explored areas** in the Fog of War panel clears every player's memory of a map.

- **Tokens have darkvision.** Set it in grid squares (0 means none) in the Token Manager when placing a token, or later in Edit Token, which now opens for player tokens too. The hint beside it converts squares to feet using the map's own scale. Only the DM can change it, since it decides what the server sends that token's player.

- **Preview the map through a token.** Preview Player View can now show what a single token sees, or **All player tokens** for the whole party. This suits a table that shares one projected screen and has no player accounts to preview as.

- **The DM can delete the campaign's own documents.** In the Campaign documents panel, a document uploaded or written in the campaign has a bin button for the DM, which deletes it after asking. Documents shared in from someone's own library are still only unshared there. This is also how a DM removes a document whose uploader has deleted their account, which before only an administrator could do from the app.

- **Fog of war can be turned on or off for each map**, at the top of the Fog of War panel or in Edit Map. While it is off, players see the whole map, apart from what dynamic lighting hides; revealed areas are kept for when it is turned back on.

- **Each vibe period can play its own music.** The period editor's audio box, which saved a note nothing read, is now a picker offering the tracks the DM may play: their own uploads, this campaign's, and the global library. Switching to a period starts its track looping for everyone at the table, and a period with no track silences the table. The Atmosphere panel still works as a live override: stop its track, or let a non-looping one finish, and the vibe's own music returns. Notes typed into the old box do not play and are dropped the next time the periods are saved.

### Changed

- **Tied initiative keeps the order combatants were added in**, where it used to sort them by name.

- **Dynamic lighting limits what players see.** A player sees what their tokens' darkvision reaches in the dark, plus whatever a light source lights. Bright light shows clearly; dim light, and darkness within darkvision, show half-dark. A token's own square is always visible. In 1.4.0 every token saw everything in line of sight whatever the light, which made lights decorative. The new per-map **Global Illumination** setting keeps that older behaviour, and it is on for maps made before this release.

- **Preview Player View shows one chosen player's view.** Pick a player (or a token) and the preview draws what they see: their darkvision, the lights and doors in their sight, their fog, the areas they remember, and only the tokens they are sent. It used to combine every token's vision and show the DM's fog and every token.

- **New maps start with fog of war off.** The DM turns it on when a map needs it. Dynamic lighting also starts off, as before, except on a map imported from a Universal VTT file that brings lights. Existing maps keep their settings.

- **The Creature Library and Token Templates buttons have their own icons**, a skull and a stamp. The Creature Library used the same open book as Campaign documents, and Token Templates a plain box.

- **Spectators can chat but can no longer roll dice.** The dice roller tells them rolling is for players, and the server refuses a roll from them.

### Fixed

#### Accounts

- **Deleting an account works.** It failed for almost everyone: anyone who had rolled a die, uploaded a file or created a campaign. The person's chat messages, dice rolls and uploads now stay, no longer linked to anyone, so campaigns keep their history and map art. Documents they shared into a campaign stay shared, credited to the campaign's DM, or to its owner when it has no other DM. Documents they uploaded into a campaign stay in it, listed as shared by "a deleted account". A campaign they created but someone else runs as DM passes to that DM. If a campaign they created has no other DM, the deletion is refused and names the campaign: hand the DM seat to another member, or delete the campaign, first. An administrator deleting such a user sees those campaigns in the delete panel and can hand each one to another member, or delete it, from there. The warnings on the profile page and in the admin panel now describe what actually happens.

- **Display names are checked by the server.** A name must be 1 to 50 characters once spaces at either end are trimmed. The server used to accept a name of only spaces (shown as a blank to the table), a name of any length, or a value that was not text (which caused a server error). Signing up and editing a profile now refuse these. Names already stored are unchanged.

- **A new instance gets exactly one first administrator.** Two setup-wizard submissions at the same moment could both create an administrator.

- **Accepting an invitation brings only characters that can join that campaign.** A character joins a campaign of its own game system, and a Flexible character joins a Flexible campaign, the same rule the Characters page uses. Characters already in a campaign stay where they are. Accepting the same invitation twice at once now joins once and refuses the second with a message, and a malformed character list is refused with a message. Accepting two invitations at once with the same character no longer lists it in both campaigns.

#### Character sheets

- **Character sheets store only the fields their game system defines.** Extra keys, whether sent by a program through the API or written by older sheets into places nothing reads, are dropped the next time the sheet is saved. Everything the editors let you fill in is kept, including the header colour, a Pathfinder 2e feat's description and a Call of Cthulhu custom skill's name. Older fields are moved first (see the upgrade note above).

- **Saving a sheet no longer undoes hit point changes the DM made.** A sheet open on the campaign page now follows hit point changes made from the roster. Saving from a sheet that has changed since it was opened is refused with a message, and the sheet reopens with the new values. Hit points or hit dice changed at the same moment as a save no longer undo that save. A program saving through the API can ask for the same check (see the API reference).

- **A save refused over a bad value keeps your edits.** The full-page character editor replaced the sheet with "Failed to Load Character" and lost everything typed since the last save. It now shows the reason and keeps the sheet open, so the value can be corrected. (A save refused because the sheet changed elsewhere reloads it, as described above.)

- **An emptied text box no longer stops a sheet saving.** Clearing Background or Alignment (D&D 5e and Pathfinder 2e), Deity or an innate spell's frequency (Pathfinder 2e), or Sex, Residence, Birthplace or a weapon's skill (Call of Cthulhu) made the server refuse the save. Empty boxes now save as empty.

- **D&D 5e characters made before 1.3.0 show their proficiencies and languages.** Those versions stored them as one list the sheet did not read, and the first save in the editor replaced them with four empty boxes. The sheet now sorts the old list into its boxes by what each entry names: a known language goes under Languages, armour and shields under Armor, tools under Tools, and anything else under Weapons. Saving any character made before 1.3.0 also moves its other older fields, as the `migrate:sheet-fields` command does.

- **A D&D 5e character without spellcasting details can be saved.** This affected characters created through the API or imported. They now save with every spell slot level empty.

- **Pathfinder 2e spells no longer stop a sheet saving.** Adding a cantrip, spell or focus spell, turning on spellcasting, or saving a character with no spellcasting at all was refused by the server. All of these save now.

- **Pathfinder 2e spell slots show how many are used.** The read-only sheet now subtracts the slots marked as used in the editor and shows how many are left. A count recorded on 1.4.0 carries over the first time the sheet is saved.

- **Pathfinder 2e feat descriptions show on the read-only sheet**, under the feat's name. They were only visible in the editor.

- **Call of Cthulhu skills inside a group can be edited.** Changes to Fighting (Brawl), Firearms skills, Other Languages, Sciences and custom skills went back to the old value and were not saved. They now save like every other skill.

- **Call of Cthulhu possession notes keep their dashes.** Only the first " - " on a line now separates the item from its notes.

- **A short colour code such as `#fff` works as a sheet's header colour.** It is saved in six-digit form. A sheet that already has one opens in the editor with that colour; the read-only view shows the default colour until the sheet is saved again. An unfinished code such as `#12` is flagged in the colour picker before anything is saved.

- **Screen readers can reach the character sheet and its editor.** Both pop-ups were hidden from assistive technology, so a screen reader found no sheet, no heading and no buttons in them.

- **The editor that opens over a character sheet asks "Discard Changes?" only when you have changed something.** It asked every time it was closed, even straight after opening. Changes from a save the server refused over a bad value, or because you had been signed out, still count as unsaved.

- **Escape no longer throws away edits in the sheet editor.** In the editor that opens over a character sheet, Escape closed the editor and the sheet behind it at once, losing anything typed without asking. It now does what the editor's Cancel button does, and the sheet stays open.

- **The Characters page shows a sheet as it was last saved.** After saving from the editor that opens over a sheet, closing the sheet and opening it again showed the version from before the save, and a second edit made from it put back what the first save had changed.

- **Leaving a Flexible sheet with unsaved changes asks first.** In the full-page editor the back arrow left a Flexible sheet straight away, losing anything added since the last save.

- **Being signed out no longer loses the changes in a character sheet editor.** If the browser was signed out while a sheet had unsaved changes, after the computer slept for over an hour or a password change on another device for example, pressing Save went to the sign-in page and the changes were lost; from the editor that opens over a sheet, on the Characters page or in a campaign, this happened without any warning. The editor now stays open with the changes and says how to sign in again in a new tab, and Save then works.

- **A character sheet editor with unsaved changes keeps you signed in.** A session ends after an hour without activity (unless you ticked Remember me when signing in), and typing into a sheet did not count, so a long spell of writing ended in being signed out. While an editor has unsaved changes it now keeps the session going, as an open game table already did. With nothing unsaved, the hour applies as before.

#### Maps, fog and lighting

- **Fog of war hides the map from players.** Unrevealed areas are now fully opaque for players from the first moment the map shows, and hide the walls, doors and light glows beneath them. Only the player's own token shows through. The DM still sees a see-through tint so they can work under it.

- **Players see lighting changes straight away.** When the DM places, moves or removes a light, changes a wall, or a door opens or closes, creatures coming into or leaving a player's sight appear or vanish at once. The same happens when the DM switches dynamic lighting or Global Illumination on or off. Players used to keep what they had until a token moved or they reloaded.

- **The screen and the server agree on what a player can see.** Each had its own copy of the sight calculation, and they disagreed near the edge of a light, so a creature could be drawn lit that the server never sent, or the reverse. Both now run the same code.

- **Move to Map… includes maps made after the page loaded.** The right-click submenu that sends a token to another map read a list written only when the page opened, so a map created or imported during the session was missing until a reload, a renamed one kept its old name, and a deleted one was still offered. The list now follows the Map Library.

- **The Map Library remembers which map the table is on.** After a switch, closing and reopening the library moved its Active badge back to the map the page loaded with, and offered Set Active on the map already showing, which opened a token-transfer dialog for moving tokens onto the map they were already on. The badge now follows every switch.

- **Wall and fog changes made through the API reach players' open maps at once.** They used to show only after a reload.

- **Revealed fog no longer looks lost after a refresh.** On some instances the DM's page loaded a fogged map with no fog: no tint on their own view, a fully covered Player Preview, and reveal boxes that could not be dragged. Nothing was lost on the server. The page now waits for its live connection before asking for the fog, and asks again after a reconnect.

- **A map with no picture says so.** A map whose picture is missing, such as one imported from an archive that left the picture out, used to show "Loading map..." and never finish. It now says "This map has no picture", and tells the DM to choose one in Edit Map.

- **Light edges fade softly.** The edges of each light's bright and dim areas now fade into the next, where they used to end in hard circles.

- **Carrying a player's token no longer reveals the map to them.** When the DM picked a player's token up and moved it about, the player's screen showed, and remembered, everything the token could see along the way, even if the DM then put it back. The player still sees the token being carried, but what they see and remember now follows it only where it is put down, as it already did when players move their own tokens. The same applied to a DM previewing a player while that player dragged their own token.

- **A token picked up and put back returns for everyone.** Cancelling a drag (right-click, leaving the map, or dropping on an occupied square) left the token where the cursor had been on other people's screens until it next moved.

#### Tokens

- **The Token Templates list shows each template's picture.** A picture uploaded in the template editor showed only the template's name in the list, though the token placed from it had the picture. Templates saved before this update show their pictures too, with nothing to re-save.

- **Any token can be hidden from the right-click menu.** **Hide from Players** was offered only for objects. It is now offered for every token, and the Token Manager can now place a creature already hidden, as it already could an object.

- **A token moved to another map keeps all its details.** Moving a token (when switching maps, or from the Token Manager or the right-click menu) rebuilt it from a partial copy: a player character came back as an NPC, and darkvision, hit points, disposition, stat block, art mode, rotation and notes were lost. The whole token now moves, keeping its id. A token that would hang off the edge of the new map is moved onto it. Duplicate also copies everything, except that the copy starts with fresh hit points and no conditions, is not linked to a character, and keeps its controller only if that person is still a player.

- **Moving several tokens between maps no longer loses or doubles any.** They now move in one step. Changes to a map's tokens are also applied one at a time, so a player's move, a DM's add or delete, a spirit-layer reveal, an initiative roll or a character's new picture landing together no longer overwrite each other.

- **A moved token keeps its initiative entry, and the table stays on its map.** A moved token came back under a new id, which left its combatant pointing at nothing, and moving a token switched every player to the destination map. Both are fixed.

- **A player's token is the one they control, on screen as on the server.** The map also treated a token bound to the player's character as theirs, but the server did not. When the two differed, the player could pick the token up only for it to snap back, and on a lit map was shown ground the server sent nothing for. The map now follows the server. A token created for a character with no controller named is given to the character's owner when that owner is a player in the campaign.

- **The page keeps its member list up to date as people join, leave or change role.**

- **Refused changes to a token now say why.** Edit Token shows the reason a change was refused, such as notes longer than the 5,000 characters now allowed; the change used to look saved and then disappear. A refused Duplicate names the stored field at fault, and **Save as Template** confirms the save or says why it failed.

- **Creatures and token templates with unrecognised values can be placed.** A disposition, display mode or kind the app does not know ("Hostile" with a capital H, for example) stopped them being placed. Such a value is now read as the default (hostile, or none for a template; pog; object), and the importer stores it that way.

#### Initiative tracker

- **The initiative tracker follows the token.** The hit points it showed were copied when the combatant was added and never updated. Changing a creature's hit points, name or picture, or hiding it, now updates every tracker at once. The DM Guide no longer describes an HP control the tracker never had, and says that ending combat clears the order.

- **Rolling or typing initiative works for a combatant on another map.** The tracker looked for the token on the map on screen, so rolling said "Token not found" and a typed value was not saved to the token.

- **Removing the last combatant ends the fight.** Removing the only combatant left an empty "Round N" with no way to end it. The fight now ends whenever the order empties, including when deleting a token or map takes out the last combatant. Removing the combatant whose turn it is now passes the turn to the next one, as **Next Turn** does.

- **A roll that finishes after the fight ends, or after its combatant is removed, no longer brings either back.**

- **A combatant whose token or map is deleted now leaves the order.**

#### Sessions and connections

- **Resuming a paused session keeps what the DM did during the break.** Resume restored the snapshot taken at the pause, undoing hidden or moved creatures, new tokens and map switches without a word. It now only reopens the session.

- **Role changes take effect on open pages at once.** A member whose role changes gets the new role's controls, roster and map view straight away (a spectator on a lit map is sent no tokens, a player their own). The same applies to both people in a DM handover. A page that was offline when a role change, a pause, the end of a session or a map switch happened catches up when it reconnects.

- **Messages and rolls sent by others during a reconnect are no longer missed.** After a dropped connection the page reloaded the chat and dice history a moment before it rejoined the game, so anything sent in between did not appear until a reload. It now reloads after rejoining.

- **A player no longer falls behind after a dropped connection.** After coming back online or pressing Retry, a player's page stopped receiving map changes (hiding, obscuring, spirit plane and vibe changes), explored memory and pings, and the initiative tracker froze after any automatic reconnect. Everything now follows the new connection.

- **The connection badge shows Connected after the server closes and reopens a connection**, and the page catches up as after any other reconnect. It stayed on Disconnected and missed pauses and session ends until a reload.

- **A game table whose sign-in has ended goes to the sign-in page.** It used to keep retrying for as long as the tab was open. A connection the server keeps closing is retried a few times and then left to the Retry button.

- **Deleting a campaign removes everyone still on it from its live game**, and clears its combat state.

- **A brief database error while telling the table about a change no longer reports a saved change as failed.** This affected initiative rolls and spirit-layer toggles. The change stands, and the table receives it with the next update or reconnect.

- **The vibe tracker says when it is off.** With the tracker switched off for a campaign, the Session tab still offered its period buttons, and clicking one did nothing visible while the server refused the change. The buttons now give way to a note saying the tracker is off and that saving the period editor turns it on.

- **The vibe period editor keeps its buttons on screen.** On an ordinary window the editor was taller than the dialog, and the Restore Defaults, Cancel and Save Periods buttons sat below the fold with nothing saying the dialog scrolls, so the editor looked like it had no save button. The period list now scrolls on its own and the buttons stay put.

#### Player Preview

- **The preview looks only through tokens the players would have.** A hidden token no longer lends it sight, pointing at a hidden, unlit or fogged token no longer opens its details.

- **The preview hides the DM's light markers.** A projected screen showed where every light was. Leave the preview to move or edit a light.

#### Backups and restore

- **Backups made from the Admin Dashboard restore again.** On 1.4.0 every restore failed with "Database restore failed", because the database tools in the backend image were newer than the database. The image now carries PostgreSQL 16 tools, the closest available to the PostgreSQL 15 database, a restore skips the setting that broke, and the backend log gives the reason for any failure. A restore now replaces the whole database and then applies this version's database updates, so a backup from an older version restores into a newer one, fresh installs included. A backup also restores onto an instance whose database user has a different name, as on a new machine with a fresh `.env`. New backups no longer record an owner. Without Docker, this needs the database ownership step in the upgrade note.

- **A restore checks the file first and keeps a copy of what it replaces.** A file that is not a complete CozyVTT backup is refused, and nothing is changed. Before restoring, a backup of the current database is added to the list, so restoring the wrong file can be undone; its name is shown when the restore finishes. If that copy cannot be made, nothing is restored, and the deployment guide shows how to restore from the command line instead. A restore whose uploaded files could not be copied now says so.

- **The command-line restore script no longer deletes your database before the backup has loaded.** It checks the file first, ignores ownership lines from another instance as the dashboard does, and loads the backup in one step that is undone completely if anything fails.

- **Long backups and restores no longer show as failed while still running.** The page gave up after 30 seconds. It now waits ten minutes for a backup, as the bundled web server does. For a restore it sets no limit of its own, so a slow upload is not cut off; the web server still ends a restore that goes ten minutes without an answer.

- **A backup appears in the list only once it is complete.** Another admin could download or delete one that was still being written. What an interrupted backup leaves behind is cleared the next time the list is opened.

- **Two backups made in the same second no longer overwrite each other.** A name already taken gets `-2`, `-3` and so on.

- **A backup that fails while being written no longer stops the backend.** A full disk during a backup or restore is reported in the dashboard, and the instance stays up.

- **A backups folder the backend cannot use is reported by name**, with what to check (permissions, a full disk). The Backups tab used to look empty, and a new backup failed with a bare message.

- **The restore script explains a full temporary folder.** It says nothing was changed and how to point it at a folder with more room, and it checks that the unpacked file is complete before loading it.

- **The message shown when the backup tools are missing names the right fix**: rebuild the backend image from the current source.

#### Setup, imports and documentation

- **Malformed requests from scripts get a 400 that says what is wrong, not an internal error.** The app never sends these, but a program driving the API could, and got "An unexpected error occurred". This covers a password reset request whose email, link or new password is not text, and an unknown type, scope or game system in the asset, creature and character template lists. A negative asset page is read as the first. Assigning a character with a campaign that is not text is refused too. A campaign invitation's expiry must be a whole number of days, up to a year; a number sent as text used to be joined onto the date, so "7" on the 3rd of the month set an expiry 34 days away. A map's width, height and grid size must be whole numbers, and a Universal VTT import given an unusable grid size uses the default of 70, where a negative one used to be stored.

- **A map whose picture was deleted before the campaign was exported now imports without a picture**, keeping its walls, tokens and fog. Such maps used to be left out of the import, including from archives made on 1.4.0.

- **`SESSION_MAX_AGE`, `REMEMBER_ME_MAX_AGE` and `LOG_LEVEL` in `.env` now work on Docker.** They were never passed to the backend. The guides and the app's messages also now say that `docker compose restart` keeps the old settings (use `docker compose up -d` after changing `.env`), and that `BACKUP_DIR` is only for installs without Docker.

- **The bundled web server forwards `/health` to the backend.** It used to answer 200 itself, so a dead backend looked healthy. `/health` now answers 503 when the database is unreachable. Upgrading now also recreates the web server's container, so changes to its configuration take effect.

- **The deployment guide covers backups behind your own proxy**: the larger upload limit and longer wait the backup routes need, and what Cloudflare's own limits mean for backups.

- **Above a PDF, the document reader now says "Not showing?" and links to open it in a new tab**, for browsers such as Safari that show an embedded PDF as a blank page.

- **Imported tokens and token templates are held to the same limits as ones placed by hand.** An unknown value falls back to the default, an oversized token becomes one square, an over-long condition is dropped, out-of-range hit points are cleared, a token with no name is called *Unnamed token*, and an invalid creature link is dropped. A creature stat block is the exception: an archive may carry one up to twice the in-app limit (two and a half times for names and speed). It imports, but duplicating the token or placing that creature is refused until the stat block is shortened.

- **Imported tokens whose picture was not in the archive import with no picture.** They used to point at a file on the instance the archive came from.

- **The API's character validation check reports real problems.** It answered "valid" for every sheet. Saving a sheet was never affected.

- **Guides and in-app text corrected.** The user, player and DM guides now name controls as they appear on screen and describe what players see during play. The deployment guide's API checks work as printed, it shows how to install PostgreSQL 15 on Ubuntu 22.04, its command for moving older character sheets now works in the Docker image, its steps for a conflict after `git stash pop` finish the job, and its example nginx configuration for an install without Docker forwards `/health` to the backend. The restore script says how to find the port to check afterwards. In the app, the pause banners say that a player's dice rolls stay on their own screen while paused (they were described as secret), the account and campaign deletion warnings say what is kept, the restore confirmation mentions the safety copy (it said a restore could not be undone), and the upload window names its scopes in plain words.

- **Developer documentation corrections.** The live-event reference now says correctly who may send each event, and its check fails on any difference from the code. The API specification (backend/docs/API_DOCUMENTATION.yaml) is corrected throughout: rate limits, shared responses, and the fields and limits of its schemas.

### Security

#### Sign-in and accounts

- **A profile picture can only point at that user's own uploaded avatar.** The address was stored exactly as sent, and every member's browser loads it, so a script could set it to anything. The app was not affected, since it only ever sets the user's own avatar.

- **A page on another address can no longer act as you.** Your browser sends CozyVTT's sign-in with requests from any page on the same site, including another port or subdomain of the same server. Such a page could make changes as whoever was signed in (an administrator restoring a backup or inviting a new admin, for example) or open a live game connection as the DM. A browser request that changes something, and a live game connection, are now refused unless they come from the address in `CORS_ORIGIN`. Nothing changes for the app itself or for scripts.

- **MFA backup codes are harder to guess and stored like passwords.** They were generated from too small a range and stored with a fast, unsalted hash. Existing codes stop working; regenerate them as described in the upgrade note.

- **A backup code works only once, even when two sign-ins use it at the same moment.** Two simultaneous sign-ins could both get in with one code, and the count of codes left could come out wrong.

- **An authenticator code works only once, and wrong codes are limited per account.** A code could be reused by anyone who saw it for up to a minute and a half. If a sign-in right after another is refused, wait for the next code. Wrong codes are now limited to five per 15 minutes for each account, as well as for each network address.

- **Setting up MFA, turning it off and regenerating backup codes have attempt limits.** Confirming a code during setup allows five wrong codes in 15 minutes. Turning MFA off and regenerating backup codes share the sign-in page's limit: five failed attempts in 15 minutes from one address, counted together with failed sign-ins and password resets.

- **Changing an email address through the API, or turning on MFA, needs your current password.** Someone with access to a signed-in browser could otherwise change the address and reset the password from their own mailbox, or add their own authenticator. When an address changes, the old address is told by email (if email is set up), and any reset or invitation link already sent stops working. Turning MFA on also signs out your other devices. An administrator changing someone else's address does not need that person's password.

- **Only the newest password-reset or invitation link works.** Using a link, changing your password, or an administrator's reset cancels all older links, and a link sets a password only once.

- **The forgot-password page no longer gives away which addresses have accounts by how long it takes.** It already answered the same for any address, but for a real one it waited for the email to be sent first, which takes noticeably longer. It now answers before sending.

- **Ending a sign-in closes its live game connections too.** This covers changing your password, turning off MFA, an administrator resetting a password or changing a platform role, deleting an account, and signing out. A password change or MFA removal keeps the device it was made on, and signing out closes only that sign-in's connections. Resetting a password through **Forgot password?** now signs out every device. A connection whose sign-in has expired can no longer join a campaign.

- **Deleting your own account signs it out on every device.** Other signed-in devices stayed signed in, which for an admin meant keeping admin powers.

- **An instance can no longer lose its last administrator.** The only admin could delete their account or remove their own admin role, and nothing could give it back. Both are now refused with a message asking you to promote another user first.

- **An account registered while admin approval is required cannot sign in before it is approved.** It is now created waiting for approval.

- **Each sign-in starts a new session.** A new session identifier is issued when you log in, finish two-factor verification or register. You will not notice any difference.

- **One password rule everywhere: at least 12 characters, with an uppercase letter, a lowercase letter, a number and a special character.** Pages disagreed with each other and with the server, which accepted eight characters. Every page now checks the server's rule, including which characters count as special: one of `! @ # $ % ^ & * ( ) _ + - = [ ] { } ; ' : " \ | , . < > / ?`. Passwords already set are not affected.

- **Names and descriptions typed by users appear as plain text in emails.** A display name, campaign name or description containing HTML was inserted into invitation, welcome and password-reset emails as markup.

#### Campaigns, maps and members

- **The Creature Library's homebrew count covers only your campaign.** The count was taken across every campaign on the instance, so any member could see roughly how much homebrew other campaigns had. The app did not display it.

- **Saving someone else's character no longer reveals its game system.** Someone who knew a character's id, but could not edit it, could tell which game system it used from whether the refusal named the system or their permission.

- **Maps the DM has not shown yet are private to the DM.** Any member could list every map and fetch any of them, with its artwork, walls, lights and visible tokens. Players and spectators now get only the campaign's current map and the art it uses, cannot change anything on other maps (moving a staged token, rolling its initiative, opening its doors or recording explored areas), and are not sent the DM's live edits to them. The DM still sees every map. Art in the campaign's asset library stays visible to every member, and that includes art uploaded from inside the campaign and the picture of a map imported from a UVTT file. The DM Guide explains how to keep a surprise map's art private until it is shown.

- **Players are not told about combatants on a map the table is not showing**, and do not hear their initiative rolls.

- **A removed player's characters leave the campaign with them.** Other members could still open the sheets, the DM could still edit them, and the removed player's changes still reached the table. The characters now leave with their owner, and one left behind by an earlier removal can be opened only by its owner. A token on the map bound to such a character still shows the character's picture.

- **A former member can no longer delete or move campaign assets they uploaded.** That right now lasts only while they are a member. The DM can still delete or move them.

- **Deleting a campaign hands its library to the uploaders and deletes the campaign in one step.** A failure between the two left the campaign in place with its files moved to their uploaders' personal libraries, and an upload made during the deletion could be left open to every signed-in user.

- **Only the DM can add assets to a campaign's library, by uploading or by moving.** Moving a personal asset into a campaign only checked membership. Players may still add token art; spectators may not. The upload window only offers campaigns you can add that kind of asset to.

- **A picture can only be used by someone allowed to read it.** Every place a picture is chosen (a character's token image, a map's image and spirit layer, token art, and token and creature templates) now checks it exactly as it will be stored, so a member cannot point at another member's private picture to read it. This applies to a DM who is also an administrator. The picture pickers list only usable images. Saving something whose picture has not changed, and copying within a campaign (Duplicate, Save as Template, placing from a template), are never refused over a picture the campaign already uses, and a picture that has been deleted no longer blocks a save. A refused placement now says why. The asset library no longer reveals where files are stored on the server, and no longer lists or serves a map's spirit-layer image to a player who cannot see that plane.

- **Exports include only files the person exporting may open.** A crafted picture address could put another user's private upload into a campaign or UVTT export. A picture address on this server must now be exactly a file's own address, which also stops a picture pointing at another page of the app.

- **The creature and token template libraries can be read only by the DM.** Any member could read NPC notes, stat blocks and the whole homebrew bestiary. A placed token's creature link is now sent only to the DM and the token's controller, since it revealed a renamed creature's real name.

- **The campaign overview no longer shows players a map's spirit-layer image address** unless they can see that plane.

- **Campaign settings are checked before they are saved.** Any value was accepted for any field. A bad value is now refused with a message naming the field.

- **Only the DM's chat messages are shown as DM messages.** A player could mark a message as the DM's. The sender's role now decides it.

- **A live connection is only ever in one campaign.** A scripted client that joined a second campaign on the same connection, or sent two join requests at once, stayed in the first campaign's room while holding its role from the second. A player in one campaign who is DM of another could receive the first campaign's DM view that way: hidden creatures and notes, explored areas, secret rolls and the fog. Joining now leaves every other campaign, join requests are handled one at a time, and every message that depends on role skips a connection that is no longer in that campaign. The browser app opens a new connection per campaign and was not affected.

- **Repeated requests can no longer slow the server down.** The requests a page makes on load (initiative, walls, lights, fog, explored areas, who is online) are limited per person across all their connections, as are token moves and drags, explored-area reports, and wall, light, fog and door edits. A player's initiative rolls count toward their dice limit, and a spectator's initiative roll is refused straight away.

#### What players are sent about tokens

- **Players are sent only what they may see of a token.** Hit points only when the DM has turned the creature's HP bar on or they control it, never its stat block or notes, and darkvision only for tokens they control. The API's reply to a player updating their own token was the whole stored map, including hidden creatures, DM notes and the fog; it is now filtered like the map. One visible effect: a creature with its HP bar off no longer looks downed to players at zero hit points, and still blocks its square until the DM removes it or turns its bar on.

- **The initiative tracker no longer shows players exact hit points or hidden creatures.** A player sees a creature's hit points only when its HP bar is on or they control it, and does not see a hidden creature listed until it is revealed.

- **An obscured token no longer reveals its controller, kind, facing or stored initiative to other players.** The masked token is built from a short list of what may be known (position, size, plane, and that it is obscured), so a token field added in a later release stays private by default.

- **Rolling initiative for a hidden creature is no longer announced to every player.** The roll now goes to the DM and to players who are sent the token on the current map; light and fog are not taken into account for this. The name in the dice log now comes from the server. Rolls from the DM's stat-block picker (custom roll box included), and from the **Roll...** menu or **View Character Sheet** of a token with a character sheet, name a hidden, spirit-layer or obscured creature *Unknown creature*. A player rolling from their own token rolls as their character.

- **Token moves reach only the players who would be sent the token.** A hidden token's moves, with its DM notes, reached players on lit maps, and every move of a hidden token was broadcast. Moves on the spirit plane, and material-plane moves to players in the spirit realm, ignored which plane each player can see. Every move now follows the same rules as opening the map. While a token is dragged, its position goes only to the DM and to players who could see it when the drag started, checked again if the token is hidden or changes plane and at least once a second. A player can no longer move a spirit-plane token through the API while unable to see that plane.

- **Revealing a token from the Spirit Layer panel no longer sends players its notes and position.** Players are sent the map again as they may see it.

- **Every token field is checked before it is stored, and a token can be bound only to a character in its own campaign.** A player moving their own token could store any extra data with it, which went to every member, and DM fields were stored as sent (a text value in the hidden flag showed players a token the DM thought hidden). A token bound to another campaign's character let a DM read that character's Dexterity through an initiative roll.

- **A spectator never controls a token and cannot change a character.** A token that still names a spectator from their time as a player is treated as nobody's, for hit points, darkvision, obscuring, sight and the spirit plane. The DM can hand a token only to a player. A spectator cannot edit a character while they are a spectator in its campaign; the DM still can. The roster, the token editors, the Characters page and the character editor no longer offer a spectator what the server would refuse.

- **A spectator cannot move or edit a token through the API, and only the DM can resize a token.** Live play already refused a spectator's moves. Size is now DM-only because a token always sees the ground it stands on, so a larger token sees further.

- **A player opening or closing a door can only change whether it is open.** A scripted client could move or stretch the door, changing what everyone on a lit map could see.

- **Pausing or ending a session stops players moving tokens on the server as well as in the browser**, live and through the API. The DM can still move tokens. A token being dragged when the pause lands, or whose drop is refused because the DM took the token back or changed the player's role, goes back to where it was on every screen that watched the drag and may still see it.

#### Web page content

- **Branding image paths containing a backslash or a control character are refused.** Browsers can read either as a way to another site, and the same-origin check missed both.

- **A character sheet's header colour is used only if it is a preset or a `#RRGGBB` colour.**

- **Atmosphere filters and the spirit realm's custom colour are checked before use**, on the server, and again on the map in the browser. A campaign archive carrying anything else imports with the default.

#### Backups, deployment and dependencies

- **A crafted backup file can no longer run shell commands in the backend container.** A restore now runs the database tool in its restricted mode, and refuses a file containing statements that could cut the restore short. This does not make every file safe: a backup is SQL that the database runs with full rights, so restore only backups made by the dashboard or the backup script on an instance you trust. The restore screen and the deployment guide say so.

- **Backups no longer contain sign-in sessions, and a restore signs everyone out.** Restoring an older backup brought back its sign-ins, including ones ended since. The dashboard's restore also closes every live connection. After using the command-line restore script, restart the backend to close them; the script says so.

- **Backups are readable only by the backend's user.** Dashboard and script backups were readable by every account on the server, and they hold every password hash and MFA secret. The temporary copies made during a backup or restore are private too, and the backup script also locks down an existing backups folder and older dumps in it. On Docker, copying a dashboard backup off the server by hand now needs `sudo`; downloading from the dashboard does not. On an install without Docker the backend also makes the backups folder itself private, and logs the old permissions when it changes them.

- **The database password no longer shows in the server's process list during a backup or restore.**

- **Backups are kept outside the uploads folder**, in `backend/backups/`, so syncing uploads off-site no longer copies them. See the upgrade note for moving old ones.

- **A production instance refuses to start with the placeholder database password**, as it already did for `SESSION_SECRET`. The message prints the commands to change it, filled in with your own database user and database name. See the upgrade note.

- **The bundled nginx no longer saves a huge upload to the restore address from anyone who sends one.** Uploads now go straight to the backend, which refuses anyone but an administrator before reading.

- **Behind a Cloudflare Tunnel or another proxy, one person's wrong passwords no longer lock everyone out.** nginx passed every visitor on with the proxy's address, so every per-address limit was shared by everyone. It now passes on each visitor's own address, trusting the proxy's word only when it connects from a private address. The deployment guide shows how to check which address CozyVTT sees, and what to add for a proxy on a public address.

- **Dependencies updated for published advisories.** Every published advisory against the running application is fixed, including the email library (nodemailer, moved to version 10; the advisory needed several mail servers in one process, which an instance never has) and the live-connection transport (engine.io, updated in range). Two remaining advisories in the routing library need a major upgrade and do not apply here: the app does not render pages on the server, and no navigation target comes from user input. The OpenAI client library, which nothing used, is removed.

---

## [1.4.0] — 2026-09-14

### Upgrading from 1.3.0

Nothing to do beyond the usual upgrade, and nothing you have is changed or
removed. The upgrade adds two new, empty database tables (one for saved dice
macros, one for documents shared with a campaign); they are created
automatically on the first startup after you pull, and no existing table is
touched. Back up first as always — see [Database Backups](docs/DEPLOYMENT.md#database-backups) — then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

**One new optional setting.** `MAX_DOCUMENT_SIZE_MB` sets the largest document a
DM can upload and defaults to **50 MB** if you do not set it, so you can ignore
it unless you want a different limit. It lives beside the other size limits
under **Admin → Settings → Upload Size Limits**. Rulebooks are large, so if you
raise it, raise `NGINX_MAX_BODY_SIZE` to match, or the bundled proxy will reject
the upload before it reaches CozyVTT.

There is no manual data migration for this release.


### Added

- **Walls can be selected and moved.** The Select tool could only take one wall and drag its endpoints, so there was no way to move a wall, let alone a whole room. Click one, Shift-click to add more, drag a box over an area, or press Ctrl+A for the lot; then drag them or nudge with the arrow keys, a whole grid square at a time with Shift held. Delete removes what is selected, changing the wall type applies to all of it, and Ctrl+Z undoes the move. **This is also the fix if a map's walls do not sit on its artwork**, which happens when the file they came from was cropped: select them all and nudge them into place

- **Rulebooks and handouts, readable inside CozyVTT.** ([#39](https://github.com/CheekyChinchilla/CozyVTT/issues/39)) A group's rulebook used to live on everyone's own device, or on some other website with a link passed round, which meant two places to switch between at the table. There is now a **Documents** section on your dashboard, kept apart from the Asset Library so a rulebook never sits among your map thumbnails. Upload a **PDF, plain text or Markdown** file, or write a text or Markdown document from scratch without uploading anything, and read it in a full-screen reader or open it in a new tab. Text and Markdown documents can be **edited afterwards** by whoever uploaded them, so session notes and house rules can be kept current without re-uploading. **Who can read a document depends on where you put it.** A *Personal* document is yours alone until a DM shares it with a campaign. A *Campaign* document belongs to that table and its members can read it at once. A *Global* one is readable by everyone on the instance, and only an admin or a global asset manager can make one. **Inside a campaign**, a new book icon in the header opens the documents shared with that table, for every member, not just the DM. The DM shares from there, uploads or writes new ones for the campaign directly, and can stop sharing at any time; a player sees only what has been shared and nothing that lets them change it. **Sharing is for your own documents and global ones.** A document someone shared with a table you play at is yours to read there, not to pass on to a campaign you run; that stays the uploader's choice. **Uploads are checked, not trusted.** Every file has to be what it claims: a real PDF is recognised by its contents, and a text or Markdown file has to genuinely be text, so an executable renamed `.md` is refused. Documents are always served as plain text or PDF, never as a web page, so a file containing HTML or a script is displayed as text and cannot run. **Self-hosters: this adds one new database table** for sharing documents with campaigns, created automatically on upgrade with nothing existing altered, a new `documents/` folder under your uploads directory, and a `MAX_DOCUMENT_SIZE_MB` setting defaulting to 50 MB, shown beside the others under **Admin → Settings → Upload Size Limits**. Rulebooks are big, so if you raise it, raise `NGINX_MAX_BODY_SIZE` with it. EPUB and other e-reader formats are not supported yet; see the backlog

- **Save the rolls you keep retyping.** ([#47](https://github.com/CheekyChinchilla/CozyVTT/issues/47)) Some rolls are never on a character sheet: a homebrew subsystem your table invented, a recurring `2d6+3` for a house rule, `4d6kh3` for rolling up a new character, an attack the sheet cannot describe. The quick-roll buttons cover the plain dice and nothing you have built yourself, so those got typed out again every session. Press **Saved** beneath the dice buttons, give a roll a name and an expression, and it becomes a button of its own — one click, and it rolls exactly as if you had typed it, appearing in the roll history like anything else. If you have just typed something into the expression box, opening **Saved** carries it across, so naming it is all that is left. The same button is where you rename, correct or delete them. **They are yours alone** — not even your DM can see them — and they belong to the campaign you made them in, so one table's homebrew does not follow you into an unrelated game. Up to fifty per campaign. **An expression that cannot actually be rolled is refused when you save it**, with an explanation, rather than becoming a button that fails every time you press it. **Self-hosters: this adds one new database table.** It is created automatically when you upgrade, and nothing existing is altered

- **The DM can hand the game to someone else.** ([#33](https://github.com/CheekyChinchilla/CozyVTT/issues/33)) A campaign has always had exactly one DM and no way to change who it was — handing a game to a co-DM, stepping back while the group plays on, or letting someone else narrate for a session all meant editing the database by hand. Open **Campaign Settings → Members** and click the **crown** beside anyone at the table. They become the DM and get the DM's controls; you become a player in the same campaign, keeping your characters and your seat. **It happens live** — if you are both in the session when you do it, the controls move across there and then, without either of you reloading. **A campaign still has exactly one DM**; the seat moves rather than being shared, and the swap happens as a single change so the campaign is never briefly left with two DMs or none. **Owning a campaign is a separate thing from running it, and does not move.** If you created the campaign you still own it afterwards — you can still delete it, and you can be made DM again later — which is what lets you hand the narration to somebody else, or to an automated DM account, and stay at the table as an ordinary player. **If you own the campaign, you keep a way back in.** An owner who is no longer the DM gets an **Owner Settings** button in the sidebar, holding the two things that are still theirs: deleting the campaign, and taking the DM seat back from whoever has it. The rest of the settings — renaming, chat, inviting, exporting — belong to whoever is running the game. Everywhere the app names a DM now names the person actually running the game rather than whoever created the campaign, and where those are two different people it says who owns it as well, so a handover cannot leave the dashboard or the campaign panel quietly crediting the wrong person

- **Hit dice can be spent from the sheet and the roll menu.** ([#43](https://github.com/CheekyChinchilla/CozyVTT/issues/43)) A D&D 5e sheet has always had somewhere to record hit dice, but the number was not clickable the way an ability score or an attack is, and it never appeared in the right-click **Roll...** menu — the only way to use one was to roll it by hand somewhere else and edit the count down yourself. Clicking your hit dice on the **Combat** tab now spends one: it rolls a single die plus your Constitution modifier, the result goes to the roll history like any other roll, and the count drops by one. The same entry appears under **Hit Dice** in the roll menu, so it works from a token as well as from the sheet. **It rolls one die, not the pool** — the rules have you spend one at a time and decide whether to spend another after each result, so click again for a second. **Your hit dice now have a die and a maximum of their own.** The row used to be one box holding both, so five d10 was written `5d10` next to a separate count that meant something different — and the two could quietly disagree. There is now a box for the die and a box for how many you have, which is also what a future long rest will count back up towards. **A hit die does not have to be a plain die any more**: a homebrew class rolling `2d6`, or one with a flat bonus like `1d10+1`, can be typed straight in and rolls exactly as written. Sheets written before this keep working untouched and are read exactly as they were; editing one fills in the new boxes for you. **The hit points are not added for you** — CozyVTT rolls the die and keeps count, and you apply the healing with the **+** on the roster card, which is also where a negative Constitution modifier is handled, since the rules floor what you regain at zero rather than taking hit points away. Once a pool is empty it stops being clickable, and hit dice left blank or typed as something the dice roller cannot read offer nothing rather than a roll that cannot be made. Your DM can spend one on your behalf if you are away from the table, and it comes off your own sheet

- **A roll of your own, from your own token.** Right-clicking a creature has always offered the DM a **Custom Roll** box for anything its stat block does not cover — a falling rock, an improvised save, a homebrew effect. Right-clicking your *own* character offered only what the sheet could work out, so anything else meant leaving the token, switching to the Dice tab, and typing it there. That box now sits at the foot of your character's roll menu, below the skills and attacks, and it is pinned rather than buried — you do not have to scroll past a long skill list to reach it. Because the roll comes from your character's menu it is **filed under your character**, which the Dice tab cannot do unless you type the name in yourself: "Bramble Nettlefoot — Falling rock" rather than your own name with nothing to say who it was for. Both menus now draw this control from one place, so they cannot drift apart again

### Fixed

- **Updated the image library that makes map and token previews.** The version CozyVTT used had known flaws in the code that reads GIF images, which anyone able to upload a token could have reached. It is updated to a fixed version. Nothing about your images changes, and GIF tokens work exactly as before.

- **Only the person who controls a token can drag it.** While a token was being dragged, the server passed the moving position along to everyone without checking who was doing the dragging, so any player at the table could take hold of the DM's monster or another player's character and send it skidding across the map on everyone's screen. Spectators could do it too. The position is now checked against who controls the token on every step of the drag, and a spectator who was left holding a token from before can no longer move it at all.

- **Removing someone from a campaign now takes effect straight away.** A player who was removed from a campaign, or whose role was changed, kept playing on the connection they already had: still sending chat and dice, still seeing everything happening at the table, until they happened to close the tab. A DM removing someone disruptive had no way to make it stick. Both now reach open connections at once. Handing over the DM seat already worked this way. If the person is in other campaigns, those are not affected.

- **Changing your password now signs out your other devices.** If you thought someone else had got into your account, changing your password did not actually remove them: any session they already had carried on working. Changing your password, or turning off two-factor authentication, now ends every other session on the account. The device you are using stays signed in, so you are not interrupted.

- **Taking away someone's access now takes effect at once.** An administrator's powers were read from their sign-in and never checked again, so removing someone's admin rights, or deleting their account entirely, changed nothing for them until they happened to sign out. Someone being removed for behaving badly kept every power they had for as long as they left the tab open. Either of those changes now ends the sessions they already have, so they are signed out immediately. Permission to manage shared assets or templates is checked against the database each time it is used, so withdrawing it has always taken effect on the next request without a sign-out. Editing your own profile, such as changing your display name, does not sign you out.

- **Homebrew creatures stay in the campaign they were made for.** A creature you build belongs to one campaign, but anyone running a campaign of their own could ask for another table's creature by its id and get the whole stat block back, then keep a copy of it in their own campaign. Those ids are not secret: every monster placed on a map carries one. Creatures from another campaign are now treated as though they do not exist, and a copy someone had already saved to their favourites is no longer shown. The creatures that come with CozyVTT are shared by everyone as before, and nothing changes inside your own campaign.

- **A failed restore no longer empties your database.** Restoring a backup replaces everything you have, so the file it reads from starts by deleting your existing tables. If that file turned out to be incomplete, damaged, or not a CozyVTT backup at all, the deletion still happened, the replacement did not, and the screen said the restore had finished successfully. A restore is now all or nothing: if any part of the backup cannot be applied, nothing at all is changed and you are told plainly that it failed. The command-line restore script also checks the backup file is complete before it touches your database, and stops with your data untouched if it is not.

- **An uploaded map or token image can no longer be served as a web page or a script.** CozyVTT accepts an image by checking its actual contents, but it stored the file under whatever name was sent and served it back with a type taken from that name. A real image uploaded as `page.html` was handed to the browser as a web page from your instance's own address, and one uploaded as `script.js` as a script, which together let a signed-in user plant a page that runs code for anyone they sent it to. Images are now stored under a name that matches what they really are and always served as an image, so opening one only ever shows the picture. Nothing you have uploaded is changed.

- **The map tool panels start out of the way.** Walls, Lights and Fog of War all opened expanded, covering a good part of the map before you had asked for any of them. They now start folded, and open with a click when you want one

- **Folding a tool panel away puts its tool down.** The Walls and Lights panels already did this; Fog of War did not, so you could arm Reveal, fold the panel, and then change what your players could see with a drag on the map and nothing on screen to explain it. All three behave the same way now

- **An imported map is no longer pitch black for your players.** Importing a UVTT switched dynamic lighting on whenever the file brought walls, and most files bring walls without bringing lights. Walls block sight, so with nothing lighting the rooms the players saw a black map with a small circle around their own token, and the only clue was a setting they had no reason to look for. Lighting now comes on only when the file actually has lights in it. You can still turn it on yourself at any time from the Lights panel

- **Maps imported from a UVTT get the same checks, and a preview, as any other upload.** The picture inside a UVTT was written straight to disk without checking it was an image at all, without the map size limit applying, and without the thumbnail every other map gets, which is why imported maps were the only ones showing no preview in the asset library. Only a campaign's DM could ever reach it, so nothing was open to the world; it was simply the one upload with no checks on it. All four now apply

- **Maps exported as part of a bigger map now line up.** Some tools let you export a region of a larger map, and the file records where that region sits. CozyVTT was not reading it, so every wall, door and light landed exactly as far from where it belonged as the region was from the corner of its parent map. Whole-map exports, which is most files, were never affected and are unchanged

- **Furniture can block sight now, if you want it to.** Tools like Dungeondraft keep the walls around furniture, pillars and crates separate from the room walls. CozyVTT ignored them completely, so a pillar in the middle of a hall hid nothing. When a file has them, the import now asks whether to bring them in. Leave the box unticked and only the architecture blocks sight, exactly as before

- **A map too big to edit is now refused when you import it.** A map can hold 5000 wall segments, and every wall edit checks that. Importing did not, so a very large file imported happily and then refused the first change you made to it, with no way to get under the limit except starting again. It now says so at import, where you can still choose to leave the furniture walls out and come in under the line

- **Coloured lights from a UVTT keep their colour.** Files commonly write a light's colour with its transparency in front of it, which CozyVTT did not recognise, so every such light came in the same default orange

- **A Universal VTT whose walls reach outside its own picture now says so before importing.** ([#59](https://github.com/CheekyChinchilla/CozyVTT/issues/59)) A `.uvtt` file holds one map picture and the walls that go with it. Some tools crop the picture to part of the map but still write out the walls for the whole thing, and importing one of those gave a map with bare patches and walls standing in them, with nothing to say why. CozyVTT now counts what falls outside the picture and asks first: *"79 walls and 20 doors in this file sit outside its map picture. … Import anyway?"* Say yes and it imports exactly as before, keeping every wall, because it is the picture that is incomplete and not the walls. Say no and nothing is created. **Nothing changes for a file whose picture covers its map**, which is almost all of them, and a wall sitting on the very edge does not count as outside. If a section of your map comes in with no artwork, the tool that exported the file left it out; export that section on its own, or export the map as an image and add it as an ordinary map

- **Instance branding images must live on your own instance.** The logo, mascot and favicon are changed by replacing the files in `frontend/public/` and rebuilding, which is what the README and the user guide describe. The settings API also accepted a link to an image on someone else's website, which was never a supported way to brand an instance and had a cost nobody asked for: every visitor's browser would contact that site before they had even signed in, handing over their address and the time they visited. A link to another site is now refused with an explanation, and the user guide no longer suggests it. **If you already set one**, replace it with your own file; the picture will not display until you do

- **The app now tells your browser what it is allowed to do.** A web page can carry a set of instructions telling the browser which code it may run and which sites it may talk to, so that if a flaw ever let hostile content onto a page, the browser refuses to act on it. CozyVTT set those instructions on its API responses, where they do nothing, and not on the page itself, where they matter. The page now carries them. In practice: injected script will not run, the app cannot be loaded inside a frame on someone else's site, and the browser will not send data to an address CozyVTT does not use. Nothing about using CozyVTT changes. **If you put your own reverse proxy in front of CozyVTT**, check it passes response headers through rather than replacing them; the deployment guide says how. **If you serve CozyVTT over HTTPS**, there is one more header worth turning on by hand, and `nginx/nginx.conf` now carries it, commented, with instructions

- **An asset's scope is spelled out everywhere it appears.** In the asset library's list view, a campaign or global asset showed the internal code, `CAMPAIGN` or `GLOBAL`, in place of a readable word, while the same asset in grid view read "Campaign" and "Global" as it should. Every list, card, panel and admin table now takes its wording from one place, so they cannot disagree again

- **The atmosphere track list only offers tracks that will actually play.** The picker listed every audio file the DM could see, including audio belonging to other campaigns they play in. Choosing one of those did nothing at all, with no explanation, because the server keeps a campaign's audio to that campaign. Those are no longer listed. Each track also says where it lives correctly: a track of your own now reads **Personal** where it used to claim to be **Global**

- **Atmosphere audio from the DM's own library now plays for the whole table.** When a DM picked a track from their personal library as the campaign's ambience, they heard it and nobody else did. The sound is not sent from the DM's computer: each player's browser fetches the track from the server, and the server was refusing a personal track to anyone but the person who uploaded it. Players saw nothing wrong, just silence. A track the campaign is playing is now readable by everyone in that campaign for as long as it is playing, the same rule that already lets players see a map the DM picked from their own library. Stop the track and it is private again. Tracks from the campaign's own library or the global library were never affected

- **An uploaded audio file can no longer be served as a web page.** CozyVTT recorded the file type each upload *claimed* to be and handed that back when playing it, while checking the actual bytes separately. A file that began like an MP3, carried a web page after it, and was uploaded claiming to be a web page was therefore served as one, from your instance's own address. Playing it was harmless; opening its address directly showed the page. It now goes out as the audio type its file extension says it is, and never as anything a browser will render. Nothing you have uploaded is changed, and real audio plays exactly as before

- **Downloading an asset follows the same rules as viewing it.** The download button checked who could have a file by its own older list, which did not know two things the rest of the app does: that a map or token picture is readable by everyone in a campaign that uses it, and that a document shared with a campaign is readable by its members. So a player could see a file on the map and be refused when they clicked download. Both now ask the same question

- **Tables and single line breaks in Markdown.** Personal notes rendered headings, lists and emphasis but not tables, and pressing Enter once did not start a new line — you had to press it twice, because that is how Markdown proper reads a lone line break. Notes and documents now share one renderer that understands tables, strikethrough, task lists and bare web addresses, and treats a single Enter as a new line, the way GitHub comments and Discord do. Nothing already written is changed; it simply displays as you meant it. **The safety rules are unchanged**: raw HTML in a note is still shown as text, never run, and links to anything but a web address or email are still stripped

- **Notes and documents no longer load pictures from other websites.** A Markdown image pointing at an outside address made every reader's browser fetch it from there, which tells that site who opened the document and when, down to their IP address. For a personal note only you were exposed; for a document a DM shares with the table, everyone who opened it was. Pictures that live on your own CozyVTT still show as before. A picture hosted anywhere else is replaced by its description text, and nothing is fetched. To include a picture, upload it to your asset library and link to it from there

- **An upload has to look like what it claims to be.** CozyVTT checks the actual bytes of every uploaded file rather than trusting its name, but two exceptions had crept in: a file called `.pdf` uploaded as a map, or `.mp3` uploaded as audio, was accepted without that check whenever the bytes could not be identified at all. Real PDFs and MP3s are identified without trouble, so the exception only ever applied to files that were not what they said they were. Both now have to start the way a genuine PDF or MP3 starts, or they are refused. Nothing you have already uploaded is affected, and a real file uploads exactly as before

- **Clearing the dice history now follows who is running the game.** The **Clear History** control in the Dice panel is meant for the DM, but it was checking who originally *created* the campaign rather than who is the DM now. In most campaigns that is the same person, which is why this went unseen. The two come apart in any campaign where the DM is not its creator: the person actually running the game was refused with "Only the DM can clear roll history", while the creator — sitting at the table as an ordinary player — could still clear the panel for everybody. It now asks who the DM is, the same way the rest of the app does. **No roll history is affected by this**, and clearing still only hides rolls from the panel rather than deleting them, exactly as before

- **Two settings CozyVTT offered but ignored.** `.env` has always offered `VITE_API_URL` and `VITE_SOCKET_URL`, which tell the browser where to reach CozyVTT's backend when it does not answer at the same address as the page itself. Neither did anything: the production build pinned both to empty before your values could reach it, so whatever you set was discarded — no error, no warning, just a setting that quietly meant nothing. Both are now read from your `.env`. Two further things behind them were broken as well. The live-connection setting could only ever describe a backend sitting at the very top of a web address, because a folder in that address was read as something else entirely and never reached the server. And the two windows that offer you a starter character sheet asked the site they were loaded from rather than the address you had configured, so on any setup where the two differ they would have come up empty. **If you left both settings blank, nothing about your instance changes** — blank is what `.env.example` ships, what the deployment and development guides both tell you to use, and what nearly everyone wants: the page asks its own address and the web server bundled with CozyVTT passes `/api/` and the live connection through to the backend. **If you did put something in there**, it was being thrown away and now will not be. Check it is right before you next rebuild, because a wrong address gives you a page that loads and then cannot reach anything

- **Dice rolls live in the Dice panel, and always have.** Several guides said your rolls appeared in the chat conversation. They never did — they appear in the **Dice** tab beside it, which is where you have always seen them. Behind that, every roll was quietly writing a second copy of itself into the chat log that nothing ever displayed and no "clear" could reach, where it did nothing but crowd out the messages you wanted to read. That copy is no longer written. **Nothing you can see has been removed**, no roll history is affected, and the rolls already recorded that way are left where they are rather than deleted. The guides now describe what the app actually does

- **Chat history goes all the way back again.** ([#44](https://github.com/CheekyChinchilla/CozyVTT/issues/44)) Scrolling up and pressing **Load More** fetched the same fifty messages over and over, so anything older than that was unreachable — and on a busy table it was worse than that, because the newest fifty *rows* were mostly dice rolls, which are filtered out of chat. A campaign that had rolled a lot could open its chat and find a handful of messages, or an empty panel reading "No messages yet", over a log that was entirely intact in the database. **Nothing was ever lost**; it simply could not be reached. Load More now walks steadily backwards a page at a time, and keeps going until you arrive at the first thing anyone said in the campaign — the button disappears when you get there. Rolling dice no longer eats into the page either, so a session of heavy combat leaves the conversation exactly as readable as it was before. Messages sent while you are reading back can no longer shuffle the page under you, and a message can no longer appear twice

- **A roll now says who it is *for*, not just who pressed the button.** The dice panel headed every entry with the roller's name, which was fine while everyone rolled only for themselves. It stopped being fine the moment a DM rolled on someone else's behalf: covering for an absent player, or working through a room of monsters, produced a column of results that all read as the DM's own. You could see that *something* had been rolled for a Perception check, but not which creature or which character it belonged to. Each entry is now headed by the **character** whose sheet the roll came from, or the **token's name** for a creature, with a small note beside it saying **(DM rolled)** so nobody mistakes it for the player's own roll — or **(you rolled)** on the DM's own screen. A roll you make for your own character is unchanged apart from being headed by the character rather than by you, and a plain roll typed into the dice panel still shows your name, since there is no character to show instead. Creature rolls also stop repeating themselves: the token's name used to be pasted onto the front of the description, so a goblin's attack read "Gnarlfang the Goblin: Claw Attack" underneath the DM's name, and now reads simply "Claw Attack" beneath the goblin

- **Only you and your DM can roll your character's dice.** ([#42](https://github.com/CheekyChinchilla/CozyVTT/issues/42)) A **Roll...** entry appeared on every character, not just your own. Right-click another player's token on the map, or their name in the roster, and you were offered *their* rolls — their skill bonuses, their saving throws, their attacks. Opening their character sheet did the same thing, with every stat on it clickable. The result was always logged under your own name, so nothing was disguised as someone else's roll, but it meant anyone at the table could roll with another player's numbers, and the Player Guide already told you that you couldn't. Rolling now follows who owns the character: yours are yours, and the DM keeps it on everyone, which is what lets them cover for a player who couldn't make the session. **Being able to read another player's sheet has not changed** — you can still open it from the same menu, exactly as before, because knowing what the rest of the party is carrying is part of playing together. Its stats simply aren't clickable any more when the character isn't yours

- **The backup script runs on Linux and macOS.** `backend/scripts/backup.sh` is what the upgrade instructions, the README and the deployment guide all tell you to run before upgrading — and it was stored in the repository without its executable permission, so `./backend/scripts/backup.sh` answered `Permission denied` on any system that enforces one. Windows ignores file permissions entirely, which is why this went unnoticed for so long: the command worked for whoever last touched it. Running it as `bash backend/scripts/backup.sh` was the workaround, and it now runs exactly as documented. `restore.sh` had the same problem. `start.sh` is marked alongside them for consistency, though it was never affected — the container image sets the permission itself when it builds

- **CozyVTT declares its licence correctly.** The backend's `package.json` said `MIT` while the `LICENSE` file, the README and the API specification all said AGPL-3.0, and the frontend's declared nothing at all. CozyVTT has always been AGPL-3.0 — the licence itself has not changed and nobody's rights under it are altered. But a package manifest is where automated tooling and most people actually look, and one saying something different from the licence beside it is worth nothing but trouble. Both manifests now say `AGPL-3.0-only`, matching the licence text that has always shipped with the project

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
