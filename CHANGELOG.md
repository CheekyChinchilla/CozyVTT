# Changelog

All notable changes to CozyVTT will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

The notes for 1.5.4 and earlier were shortened in 1.6.0. The full notes of each release are in `CHANGELOG.md` at its tag, such as [v1.5.4](https://github.com/CheekyChinchilla/CozyVTT/blob/v1.5.4/CHANGELOG.md).

---

## [Unreleased]

### Upgrading from 1.5.4

The upgrade is the usual one. Back up first, as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

There is a database change, made by itself on the first start in four steps, one after another. All of it is added; no message, map, campaign, saved roll or document you have is changed or removed:

- Chat messages gain a column for the person a whisper is for, and an index, and the kinds of chat message gain one, the whisper.
- Maps gain a table for what is drawn on them, and campaigns a column for whether players may draw, which is on for every campaign you have.
- Saved rolls gain two columns, for the character a roll is made as and what it is for. Both are empty on every saved roll you have, so each rolls as it did.
- Documents gain a table of the pictures each one shows by its address, and uploads a column for when a document was last read for it; both start empty. The server fills them as a document is uploaded, written or saved. It reads the plain text and Markdown documents you already have after the upgrade, each once, five at a time whenever a player opens their Asset Library or a picture or anyone deletes an asset, until all have been read.

There is no new server setting and no manual step. The backend and frontend containers are rebuilt with the new code. `nginx/nginx.conf` and `docker-compose.yml` do not change, so `git pull` does not stop at your own edits to them, and a proxy of your own in place of the bundled nginx needs nothing new.

To go back to 1.5.4 after upgrading, restore the backup you took before the upgrade. The restore also takes back everything done since the upgrade, the drawings and whispers among it. Without the restore, 1.5.4 cannot read a whisper: the chat of a campaign where one was sent shows an error in place of its history. After going back, reload every open CozyVTT tab, since a page still open from this release would send a message meant as a whisper to the whole table.

#### What you will notice

- **The chat has a To list above the message box.** It starts at **Everyone**, so a message goes to the whole table until someone chooses a person.
- **On a phone or a tablet, buttons, menus and the map's toolbar are bigger, and text in boxes is at least 16 pixels high.** With a mouse they look as before.
- **Players can draw on the map.** **Players may draw** is on in every campaign after the upgrade; turn it off in **Campaign Settings**, on the **General** tab.
- **A D&D 5e or Pathfinder 2e sheet you can roll from has Roll mode in its header.** It starts at **Normal** each time the sheet opens, so a click rolls as before.
- **In a long session the chat holds the newest 400 messages.** **Load More**, at the top of the chat, brings back older ones.
- **A player can no longer turn their token while the session is paused or has ended.** The DM turns any token at any time.
- **Below 1,024 pixels wide the campaign page has a phone layout, and the Desktop Required notice is gone.** That is a phone, most tablets held upright, or a narrow browser window at the usual text size.
- **A player's Asset Library no longer lists the pictures of maps the table is not on.** Each comes back while the table is on a map using it.
- **Just after the upgrade, a map picture in an older handout may not load for players.** The server reads each handout once, a few at a time as the table plays; opening the handout again afterwards shows the picture.
- **Each map's card in the Map Library, except the active map's, has Open to prepare beside Set Active.**
- **A backup of tens of thousands of uploaded files takes longer to make.** About 18 seconds for 40,000 files, where 1.5.4 took about 9; about a minute for 80,000 and two minutes for 100,000.

#### What to do afterwards, if it applies to you

- **Reload any CozyVTT page left open through the upgrade.** Until you do, it shows a whisper to you as an ordinary message; only you and its sender are sent it.
- **If you have put a symbolic link in `backend/uploads`, back up what it points to on its own.** A backup leaves the link out and the backend log names it, and a backup made before the upgrade did not hold those files either. See [Via the Admin Panel](docs/DEPLOYMENT.md#via-the-admin-panel).

### Added

- **Whisper to one person in the chat.** ([#45](https://github.com/CheekyChinchilla/CozyVTT/issues/45)) Choose someone in the **To** list above the chat box, or type `/w` and their name; only the two of you see it, and the DM sees a whisper only when they are one of the two. Whispers are stored like the rest of the chat, so whoever runs the server can read them in its database and backups. See [Whispering to one person](docs/USER_GUIDE.md#whispering-to-one-person).

- **Draw on the map.** ([#46](https://github.com/CheekyChinchilla/CozyVTT/issues/46)) **Draw**, in the map's toolbar, has a pen, lines, arrows, shapes and text labels that everyone on the map sees, over tokens, fog and the dark. The DM can keep a drawing to themselves with **Only I can see this**, and players draw while **Players may draw** is on. See [Drawing on the map](docs/DM_GUIDE.md#drawing-on-the-map) and [Drawing and pointing](docs/PLAYER_GUIDE.md#drawing-and-pointing).

- **A laser pointer for the map.** **Laser pointer**, in the drawing tools, draws a trail everyone sees as you drag, which fades within 3 seconds and is never kept. See [Drawing and pointing](docs/PLAYER_GUIDE.md#drawing-and-pointing).

- **Draw a map in CozyVTT.** ([#46](https://github.com/CheekyChinchilla/CozyVTT/issues/46)) **Create Map** has **Draw a map**, a blank map you paint with **Mapmaker**: brushes, shapes, textures, rooms that add their own walls, stamps, fill, text and more. **Save** writes the painting over the map's picture, after asking, and an unsaved painting is kept as a draft in the browser. See [Drawing a map](docs/DM_GUIDE.md#drawing-a-map).

- **Prepare a map while your players keep playing.** **Open to prepare**, on a map's card in the **Map Library**, opens a map on the DM's screen only; players are sent nothing of it until **Bring everyone here**. See [Preparing a map while the table plays](docs/DM_GUIDE.md#preparing-a-map-while-the-table-plays).

- **The campaign page fits a phone.** ([#31](https://github.com/CheekyChinchilla/CozyVTT/issues/31)) Below 1,024 pixels wide the map fills the screen, with **Map**, **Chat**, **Dice**, **Initiative**, **Party** and **More** along the bottom, each opening its panel as a sheet over the map. Every control there is at least 44 by 44 pixels, and the on-screen keyboard never covers what you type. See [The campaign page on a phone or tablet](docs/USER_GUIDE.md#the-campaign-page-on-a-phone-or-tablet).

- **CozyVTT can go on a phone's or a tablet's home screen.** It opens full screen at the dashboard, without the browser's address bar; Chrome installs it only from an `https://` address. See [Adding CozyVTT to your home screen](docs/USER_GUIDE.md#adding-cozyvtt-to-your-home-screen).

- **The table works by touch on a tablet.** Pinch to zoom, drag to move the view, slide a finger to carry a token, and press and hold a token or a door for its menu or empty ground to ping it. A tap on a token shows its card, and the new **Ping** button pings the next spot you tap. See [On a touch screen](docs/PLAYER_GUIDE.md#on-a-touch-screen).

- **Double tap the map to ping it on a touch screen.** Two quick taps on empty ground ping the spot for the whole table, while no tool is up. See [Pointing at the Map](docs/PLAYER_GUIDE.md#pointing-at-the-map).

- **Roll with advantage or disadvantage from a sheet on a phone or a tablet.** Press and hold a stat for its **Normal**, **Advantage** and **Disadvantage** menu. A D&D 5e or Pathfinder 2e sheet also has **Roll mode** in its header on every device, which applies to every check, save, skill and attack you roll from it until you change it or close the sheet. See [Rolling from your sheet](docs/PLAYER_GUIDE.md#rolling-from-your-sheet).

- **Move, turn and step through tokens from the keyboard.** Click a token to select it, then use the arrow keys to move it, **[** and **]** to turn it, **,** and **.** to step to the next token and **Enter** for its menu. Keyboard moves follow the same rules as the mouse. See [Moving Your Token](docs/PLAYER_GUIDE.md#moving-your-token).

- **A list of the map's keyboard shortcuts.** Press **?** on the map, or click **Keyboard shortcuts** in the header, to see every key the map takes. See [Keyboard Shortcuts](docs/DM_GUIDE.md#keyboard-shortcuts).

- **While you hold a token, the map shows how far it has come.** The bottom left of the map shows the distance, such as "Carried 15 ft (3 sq)", measured as the **Ruler** measures. See [Moving Your Token](docs/PLAYER_GUIDE.md#moving-your-token).

- **Follow my selection in Player Preview.** The box beside **Preview Player View** offers **Follow my selection**, which shows what the token you select sees; it never falls back to your own view. See [Previewing the Player View](docs/DM_GUIDE.md#previewing-the-player-view).

- **The AoE Shape panel has a Snap to grid box.** Unticked, a shape goes exactly where you click or tap, which a finger or a stylus could not do before. On a touch screen, slide from a cone's or a line's origin to aim it. See [Measuring and Spell Areas](docs/PLAYER_GUIDE.md#measuring-and-spell-areas).

- **On a touch screen the DM moves a combatant up or down the order with arrows on its row.** Dragging by touch does not work in every browser. See [Managing Turn Order](docs/DM_GUIDE.md#managing-turn-order).

- **Reset position puts the DM's tool panels back in their corner.** The bar above the **Fog of War**, **Walls** and **Lights** panels offers it once you have moved them.

- **The Walls panel has buttons for what took a key or a double-click.** **Done**, **Cancel**, **Add to selection** and **Delete segment** sit in the panel, and its **Undo** now does what **Ctrl+Z** does. See [The Wall Drawing Tool](docs/DM_GUIDE.md#the-wall-drawing-tool).

- **Edit Token offers D&D 5e effects beside the conditions.** **Blessed**, **Concentrating**, **Hasted** and six more each have a badge no condition shares. See [Editing Tokens During Play](docs/DM_GUIDE.md#editing-tokens-during-play).

- **Give temporary hit points from a token's menu or the roster.** **Temporary HP...** asks how many and, when the creature already has some, whether to keep those or take the new ones. It is not offered for Call of Cthulhu. See [Granting Temporary Hit Points](docs/DM_GUIDE.md#granting-temporary-hit-points).

- **Players and spectators can leave a campaign.** **Leave Campaign**, under **Your role** in **Campaign Info**, asks first. Your characters go back to **My Characters**, and your notes and saved rolls stay readable on your dashboard. See [Leaving a campaign](docs/PLAYER_GUIDE.md#leaving-a-campaign).

- **A saved roll can keep a character and a purpose of its own.** In **Saved**, a roll has optional **Character** and **Purpose** boxes; a saved roll you already have rolls as before. See [Rolling Dice](docs/USER_GUIDE.md#rolling-dice).

### Changed

- **Changes for scripts and integrations.** See [API changes in Unreleased](docs/api-changes/unreleased.md).

- **A player can no longer turn their token while the session is paused or has ended, as with moving it.** The DM turns any token at any time, and a player can still change their token's conditions.

- **Lighting on a very large map is worked out at a slightly lower resolution.** On a lit map of more than 16,777,216 pixels, such as 5,000 by 3,400, the edges of light and shadow are a little softer. That is the largest canvas Safari on an iPhone or iPad can hold.

- **On a touch screen the ruler measures by taps.** The DM taps a start and an end; a player's ruler starts at their token and a tap sets the end. See [Measuring and Area Templates](docs/DM_GUIDE.md#measuring-and-area-templates) and [Measuring and Spell Areas](docs/PLAYER_GUIDE.md#measuring-and-spell-areas).

- **A click or a tap on a combatant's name in the initiative tracker opens its menu.** A double-click still opens a character's sheet at once.

- **On a phone or a tablet, the map's toolbar, the menus and many buttons are at least 44 by 44 pixels.** With a mouse they keep their size. See [On a touch screen](docs/PLAYER_GUIDE.md#on-a-touch-screen).

- **The chat holds the newest 400 messages, and Load More brings back older ones.** A long session made the page heavier the longer the table played. Nothing is deleted: the whole history stays on the server. See [The Chat Panel](docs/USER_GUIDE.md#the-chat-panel).

- **A backup leaves out a symbolic link in the uploads folder, and the backend log names it.** A restore turned such a link into a small file holding its path, and the files behind it were never in the backup. A campaign export leaves out a linked picture or sound the same way. See [Via the Admin Panel](docs/DEPLOYMENT.md#via-the-admin-panel).

### Removed

- **The Desktop Required notice is gone.** Below 1,024 pixels the campaign page now uses its phone layout, a narrow browser window on a computer included, and the remembered **Continue anyway** is no longer read. See [The campaign page on a phone or tablet](docs/USER_GUIDE.md#the-campaign-page-on-a-phone-or-tablet).

### Fixed

- **On a lit map without fog of war, players no longer see a strip of the map's edge.**

- **Create Backup says when the Admin Panel could not restore the backup it made.** A backup over the restore's limits (4 GB, 100,000 files or 10 GiB unpacked) is still made, now with a warning pointing to the command-line restore. See [Database Backups](docs/DEPLOYMENT.md#database-backups).

- **A backup of tens of thousands of uploaded files no longer runs the backend out of memory.** With the usual 512 MB a backup of about 60,000 files used to stop part-way; 100,000 files now back up within about 275 MB.

- **A backup no longer holds a file that makes the restore refuse it.** A file in `backend/uploads` with two dots in a row or a backslash in its name is left out and named in the backend log; rename it to back it up. See [Via the Admin Panel](docs/DEPLOYMENT.md#via-the-admin-panel).

- **An imported campaign's pictures and sounds keep their names, descriptions and tags.** Export the campaign again from a server running this version; an older archive does not carry them. See [Exporting a Campaign](docs/DM_GUIDE.md#exporting-a-campaign).

- **A campaign export stopped part-way no longer keeps a file open in the backend.**

- **Text holding the null character is refused with a message, and a campaign archive holding one imports.** Pasted text carrying the invisible character U+0000 failed to save with a vague error; it is now refused with "Text cannot contain the null character (U+0000)." Type the text again instead of pasting it. An archive is imported with the character taken out.

- **Stopping the backend no longer forgets what a player explored in the second before the stop.**

- **A password reset email asked for just before the backend stops is still sent.** A mail server slower than 2 seconds can still miss it; asking again after 5 minutes sends a new link.

- **A DM who handed the DM seat over can no longer delete the new DM's map pictures.** A member who does not run the campaign may delete or move a file they uploaded only while nothing but their own characters, tokens and documents use it. See [Viewing and Managing Assets](docs/USER_GUIDE.md#viewing-and-managing-assets).

- **Deleting a picture asks first when a document can show it.** A text or Markdown document showing the picture by its address, such as a handout, is now listed in the question. See [Viewing and Managing Assets](docs/USER_GUIDE.md#viewing-and-managing-assets).

- **A refused move no longer names a creature hidden under fog.** The note says "Someone" for a creature the player cannot see.

- **A token someone is carrying goes back to its square when they are removed from the campaign.**

- **Players' pages stop hearing about a map once the table has left it.** For up to a second after a switch, a few updates for the old map could still arrive; they carried nothing players had not just been shown.

- **A map's spirit layer picture is never drawn over another map.**

- **A player's fog of war is drawn even when something drawn before it on the map fails.**

- **A fog box over most of a large map, and a wide view of explored ground, are no longer lost.** Ground lost this way before the upgrade is remembered once a token sees it again after the map is next opened.

- **A large lit map pans smoothly for players.** A frame while panning a 5,600 by 4,200 lit map took about 1.15 seconds in a slowed test and now takes 17 milliseconds.

- **The map is drawn at your screen's resolution.** On phones, tablets and high-density displays the map, tokens and walls are sharp, up to three pixels per point.

- **A new map fits the view even when its picture arrives before the map area has a size.**

- **Changing a map's picture during play no longer blanks the map while the new picture loads.** The old picture stays until the new one is ready.

- **In Player Preview a click no longer picks up a creature the preview does not show.** To move a hidden creature, return to your own view first.

- **A token you have picked up keeps its hit-point bar, condition badges and rings** while it waits on its own square.

- **A wall or a light the map has no room for is no longer drawn.** At 5,000 walls or 200 lights the tools refuse before drawing, and anything else the server refuses is taken off your map again. See [The Wall Drawing Tool](docs/DM_GUIDE.md#the-wall-drawing-tool).

- **A wall line you had started no longer waits, unseen, in another tool.** Choosing another tool drops it; the walls its clicks placed stay.

- **Esc closes only the roll picker or the menu it is pressed in,** and no longer also puts away the map's tool.

- **Tab moves on from a panel divider while the pointer rests on the map.** Tab pings only while the map has the keyboard.

- **Tab no longer pings beside the map's picture.**

- **Edit Token saves to the map its token is on,** even if the map on screen changes while it is open.

- **Edit Token offers no 51st condition.** At 50, the conditions a token does not carry are greyed out, with a note saying why.

- **A token's or a door's menu, and a Roll... picker opened from it, close when the map changes.**

- **A token's or a door's menu closes when a character's menu opens.**

- **A door's menu stays on the screen** near the right or bottom edge.

- **A token's menu opens with Move to Map… shut.**

- **A token's menu shows one divider above Remove from Map in a campaign with one map.**

- **A tap on a menu over a divider between the page's columns works.**

- **The initiative tracker opens a combatant's character sheet whatever map their token is on.** **Roll...** is still offered only for a combatant on the map on screen, and players' trackers are unchanged. See [A Combatant's Sheet and Rolls](docs/DM_GUIDE.md#a-combatants-sheet-and-rolls).

- **The AoE Shape panel no longer covers the map's toolbar with a mouse.**

- **The map's toolbar fits a narrow map.** It wraps onto a second row, and the panels below it start under that row.

- **The campaign page stays above the browser's toolbar on a phone or a tablet.**

- **The chat and the Dice log stay at the newest message or roll when their panel gets shorter.**

- **The Dice panel's colours follow the app's theme whether your computer is set to light or dark, and its quick dice stay readable under the pointer.**

- **Damage and hit dice the dice cannot roll are no longer offered as a roll.** In the **Roll...** pickers and on a sheet, damage such as `1d8 slashing` shows as written and says why it cannot roll, and **Custom Roll** explains a refusal before sending. See [Rolling from your sheet](docs/PLAYER_GUIDE.md#rolling-from-your-sheet).

- **A character sheet's roll menu stays on the screen, and Esc closes only the menu.**

- **On a phone or a tablet a character sheet shows which stats roll.** The dice icons that showed only under a mouse pointer now show all the time.

- **Character sheets and their editors fit a phone.** Below 640 pixels wide or 500 tall they take the whole screen, and the D&D 5e, Pathfinder 2e, Call of Cthulhu and Flexible layouts no longer run past the sheet's edge. See [The Character Editor](docs/USER_GUIDE.md#the-character-editor).

- **Every tab of a character sheet can be reached on a phone.** Tabs wrap onto a second row where they do not fit.

- **On a phone or a tablet, a swipe on a Flexible sheet's editor scrolls the page.** A finger drags a section or an entry by its grip.

- **A sheet editor's two notes under the portrait no longer overlap.**

- **Text dragged from one box to another in a character sheet opened from the map now lands there.**

- **The Call of Cthulhu skills list puts its headings over its columns.**

- **A Call of Cthulhu age saved as text shows in the editor and is kept until you type a number.** An age already replaced by 0 is in a backup taken before that save.

- **The My Characters page and the character editor's page no longer scroll sideways on a phone.**

- **Tapping a box on an iPhone or an iPad no longer zooms the page.**

- **Dialogs, side panels and pop-up messages fit a phone.**

- **The dashboard fits a phone narrower than 400 pixels when you are an administrator.**

- **The Admin Panel fits a phone.** Its tabs scroll sideways in their own row.

- **The Crop Avatar window works on a phone, a tablet and the keyboard.**

- **Every map card in the Map Library can be deleted on a phone.**

- **On a screen narrower than 1,024 pixels, the Creature Library's and Token Templates' forms open in place of the list.** See [Creating Custom Creatures](docs/DM_GUIDE.md#creating-custom-creatures).

- **Create Custom in the Creature Library opens an empty form while a creature is being edited.**

- **Create Map's and Edit Map's buttons no longer sit over the form.**

- **The grid preview in Create Map and Edit Map is sharp on a phone.**

- **Edit Map shows the grid preview beside the grid's settings,** with the lighting and fog switches in a **Lighting and Fog** section below.

- **Create Map and Edit Map describe the Alternating diagonal rule at the map's Grid Scale,** such as "10/20/10/20 ft diagonals" on 10 ft squares.

- **Each Confirm? in the Fog of War panel stays readable.**

- **The Lights panel spells Global Illumination as Edit Map does.**

- **Deleting a campaign tells its owner once.**

- **Remove from Campaign names the character,** as in "Remove Ash's hero from the campaign?"

- **The remove button is no longer shown beside the campaign's owner** on the **Members** tab of **Campaign Settings**.

- **Removing a spectator from a campaign calls them a spectator.**

- **The Members tab in Campaign Settings writes each role as the rest of the app does.**

- **The dashboard no longer shows a campaign you have just been removed from.**

- **Character sheet tabs and the Admin Panel's tabs work as tabs for a screen reader and the keyboard.** **Tab** stops on the open tab, and the arrow keys, **Home** and **End** move between them.

- **A screen reader names more controls.** Every remove button in the sheet editors, the size boxes in Create Map and Edit Map, **Include audio assets**, the ✕ on the Creature Library and Token Templates forms, **Preview Player View**, and the buttons that show only an icon on a phone.

- **The keyboard reaches your avatar on the Profile page.** It is a button, **Change avatar**, that **Tab** reaches.

### Security

- **Players no longer see map pictures before the table goes there.** A map picture in a campaign's library shows to players and spectators only while their table is on a map using it; handouts the DM shares keep their pictures. See [Uploading Assets](docs/USER_GUIDE.md#uploading-assets).

- **What one account can make the server hold for its live connections is bounded.** A signed-in account could make the server keep answers in memory until the backend passed its memory limit and restarted, dropping every table. Messages from one account are now rate limited, and a connection that stops reading is closed.

- **A condition named `constructor` or `__proto__` on a token no longer breaks the map.**

## [1.5.4] - 2026-10-25

### Upgrading from 1.5.3

The upgrade is the usual one. Back up first, as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

There is one new setting, `BACKEND_MEMORY_LIMIT`, which you can leave out: without it the backend keeps the 512 MB it has always had (see [Backend memory](docs/DEPLOYMENT.md#backend-memory)). No setting is removed, and there is no database change or manual step. The backend and frontend containers are rebuilt with the new code. The nginx container is recreated, because `docker-compose.yml` now stops it with a different signal.

If you have edited `docker-compose.yml`, `git pull` stops at it because this release changes it. Set your edits aside and bring them back with `git stash`, `git pull origin main` and `git stash pop`, as described in [Updating after you've edited `docker-compose.yml`](docs/DEPLOYMENT.md#updating-after-youve-edited-docker-composeyml). If you deleted the `nginx` service to use your own proxy, `git stash pop` reports a conflict there, because this release changes that service. Keep it deleted: remove the lines from `<<<<<<< Updated upstream` down to `=======`, both included, and the `>>>>>>> Stashed changes` line below them, then run `git reset` and `git stash drop` as the guide says. If you changed the backend's `memory: 512M` line, `git stash pop` reports a conflict there too. Keep the new line, `memory: ${BACKEND_MEMORY_LIMIT:-512M}`: remove the `<<<<<<< Updated upstream` line, and the lines from `=======` down to `>>>>>>> Stashed changes`, both included. Then put your value in `.env` as `BACKEND_MEMORY_LIMIT=` followed by it, such as `BACKEND_MEMORY_LIMIT=1G`, and run `docker compose up -d`.

#### What you will notice

- **The app needs Firefox 128 or newer.** Chrome and Edge 111 and Safari 16.4 are still enough.
- **A new map, token or avatar picture has size limits.** At most 16,384 pixels a side, and for an animation at most 1,000 frames; pictures already uploaded are kept as they are.
- **Character sheets take your theme.** A dark theme no longer shows a pale card with light text on it.
- **An invitation sent from the app runs out after 14 days.** One that has run out can be sent again, and **Campaign Settings → Members** lists the ones still open.
- **A player rolls initiative once per fight.** A second roll is refused; the DM can still change the number.
- **A saved roll that cannot work is refused when it is used,** such as one that could divide by zero, with the reason; edit it to fix it.

#### What to do afterwards, if it applies to you

- **If you serve CozyVTT with your own Nginx** following [Serve with Nginx](docs/DEPLOYMENT.md#5-serve-with-nginx), you can narrow its security policy as the bundled one now is: copy the `map $host $csp_socket_sources` block from the top of the example into the top of your site file, and in your `Content-Security-Policy` line change `connect-src 'self' ws: wss:` to `connect-src 'self' $csp_socket_sources`. Then `sudo nginx -t` and `sudo systemctl reload nginx`. Your current line keeps working if you leave it.

- **If your `DATABASE_URL` names a schema** (it ends in `?schema=` followed by a name other than `public`), everyone is signed out by the upgrade and signs in once more: sign-ins are now kept in that schema. The ones from before stay in a `session` table in the `public` schema, which CozyVTT no longer reads. If nothing else on that database uses a table of that name, you can remove it with `DROP TABLE public.session;`.

- **If your `DATABASE_URL` names a schema and you kept backups made with `backup.sh`,** those files hold the whole database, so neither the dashboard nor the scripts restore them now. Keep them, and make a new backup with **Create Backup** on the Admin Panel's **Backups** tab after the upgrade: it holds your schema alone and restores as usual. To restore one of the older files, follow [Restoring an older script backup of an install that names a schema](docs/DEPLOYMENT.md#restoring-an-older-script-backup-of-an-install-that-names-a-schema).

### Added

- **The backend's memory limit is a setting.** Set `BACKEND_MEMORY_LIMIT` in `.env` (`1G`, `2G`) and run `docker compose up -d`; without it 512 MB applies, as before, and it cannot go below 256M. See [Backend memory](docs/DEPLOYMENT.md#backend-memory).

- **See and clear an account's sign-in lock from the Admin Panel.** In **Admin → Users** a locked account shows **Locked until**, and **Clear lock** lets it sign in at once with its usual password. See [Logging In](docs/USER_GUIDE.md#logging-in).

- **A Call of Cthulhu investigator's contacts, and notes on Luck and wealth, can be edited.** **Edit** has a **Contacts** list on the **Possessions** tab, a note under **Luck Score** and **Wealth notes** under **Assets**.

- **Specialised skills can be added to a Call of Cthulhu investigator.** Fighting, Firearms and science specialisations come from the rulebook's list at their base values, and **Add Language** and **Add Skill** add others.

- **A D&D 5e sheet shows an item's value, the character's carrying capacity and the player's name.**

- **See and withdraw the invitations you have sent.** **Campaign Settings → Members** lists them under **Invited**, with an **×** to withdraw each, and an invitation now runs out after 14 days.

- **Continue anyway on the campaign page in a narrow window.** ([#85](https://github.com/CheekyChinchilla/CozyVTT/issues/85)) Below 1024 pixels wide the **Desktop Required** notice gained a button that opens the desktop layout; your browser remembers the choice.

- **Jump to newest in the chat and the Dice panel.** While you are scrolled up, a button at the bottom of the list takes you down to what has arrived.

- **Open a combatant's sheet and roll for them from the initiative tracker.** ([#90](https://github.com/CheekyChinchilla/CozyVTT/issues/90)) Right-click a combatant for **View Character Sheet** and **Roll...**, or double-click a player character's row for their sheet. See [A Combatant's Sheet and Rolls](docs/DM_GUIDE.md#a-combatants-sheet-and-rolls).

- **Tokens can be turned to face any direction.** ([#89](https://github.com/CheekyChinchilla/CozyVTT/issues/89)) Right-click a token for **Rotate Left** and **Rotate Right**, 45 degrees a turn; the DM can type an exact **Facing** in **Edit Token**. See [Turning a Token](docs/DM_GUIDE.md#turning-a-token).

### Changed

- **Changes for scripts and integrations.** See [API changes in 1.5.4](docs/api-changes/1.5.4.md).

- **A server admin moving someone's personal file into a campaign is written to the activity log,** under **Recent Admin Actions** on the Admin Panel's **Activity** tab.

- **The placeholders in the D&D 5e and Pathfinder 2e editors' headers take the header's own colour.**

- **The Asset Library, the pickers and the Map Library load small previews of maps and tokens,** so a library of large maps opens faster. A picture imported from an archive, or uploaded before previews were made, is still shown full size.

- **In Chrome, Edge, Safari and on phones, the document reader offers a PDF as a button to open it in a new tab.** Those browsers will not show a PDF inside the reader; Firefox on a computer still does.

- **Only an asset's uploader can move it to their Personal library.** A campaign's DM can still delete such an asset and make the other moves.

- **The app now needs Firefox 128, from July 2024, or a newer version.** The styles moved to Tailwind CSS 4, which uses features Firefox added in 128. Chrome and Edge 111 and Safari 16.4 are still enough, and Firefox ESR 128 and later are new enough.

### Removed

- **The backend no longer installs the mathjs package,** about 20 MB with its dependencies. Dice roll as before.

- **The Call of Cthulhu read-only sheet no longer has a palette button.** Choose the header colour in **Edit**, as on the other sheets.

### Fixed

- **Stopping or upgrading CozyVTT during a restore lets the restore finish,** for up to 10 minutes, and `docker compose logs backend` says it is waiting.

- **A database password with a `%` that encodes nothing works for every backup and restore.** A password such as `pa%ss` or `100%` broke them all; percent-encoded characters such as `%40` are decoded as before.

- **Backups and restores work on an install whose database address carries settings of the app's, and keep to the schema it names.** On an address that names a schema, a backup and a restore cover that schema alone. The backup and restore scripts work with the `public` schema only, and refuse another, pointing to the Admin Panel's backups.

- **A restore sent a damaged upload says so:** "The upload could not be read. Nothing was changed."

- **A backup no longer holds an empty backups folder among the uploaded files.**

- **A restore is listed in Admin → Activity when the database update after it fails.**

- **A backup the restore refuses part-way gives its disk space back at once.**

- **The warning about a missing or example session secret names the right file:** the `.env` in the CozyVTT folder for Docker, and `backend/.env` without Docker.

- **A notes download someone stops part-way is no longer logged as an error.**

- **The backend's log no longer shows an error each time two overlapping changes are sorted out.** Each retry is logged only with `LOG_LEVEL=debug`, and an error only when the backend gives up after 5 tries.

- **The backend container finds a database whose address names no port.** It uses PostgreSQL's usual port, 5432.

- **The backend starts when its uploads or logs folder is on a NAS or network share that refuses a change of owner.** It warns if it cannot write there, naming the user ID to give the folder to. See [the backend's log says it cannot write to `/app/uploads` or `/app/logs`](docs/DEPLOYMENT.md#the-backends-log-says-it-cannot-write-to-appuploads-or-applogs).

- **A second stop while the backend is stopping no longer logs an error.**

- **Stopping CozyVTT no longer waits 10 seconds while a player is connected.**

- **The instance's name and branding arrive once the server answers,** on a page opened while CozyVTT was restarting.

- **The two-factor setup page says when the server is not answering.**

- **Copy works for a new user's temporary password on a plain-HTTP instance,** and says so when it cannot.

- **A one-letter display name can be chosen on every page.**

- **Two refusals name their buttons as the app shows them:** **Send Reset Link** and **Change Password**.

- **The server refuses a sign-up whose email address holds `<` or `>`.**

- **A campaign keeps showing a map or token picture from the personal library of someone who deleted their account.** A personal file only that campaign uses now becomes the campaign's own; others get a line in **Activity**. Files kept by an earlier deletion show under the **No Uploader (account deleted)** filter on the Admin Panel's **Assets** tab, for an administrator to move.

- **A map you switch to cannot be deleted at the same moment.**

- **The Campaign Roster keeps up with characters deleted, created into the campaign, or moved to another one.**

- **A campaign's name and description can be as long as the server allows,** 200 and 5,000 characters.

- **A campaign that exports can be imported again, however large.** Maps, pictures and sounds are limited only by the archive's 1,000 files, and custom creatures and token templates by 2,000 each; **Export Campaign** says when a campaign is over those.

- **A campaign import keeps picture and sound names within an upload's limits,** 200 characters for a name and 255 for a file name.

- **A new invitation appears on the dashboard without pressing Refresh.**

- **An invitation names the campaign's DM,** where it named the owner.

- **Campaign Settings shows Danger Zone only to those who may delete the campaign:** its owner and administrators.

- **Emptying a campaign's description in Campaign Settings clears it.**

- **Open Campaign after an import opens the campaign.**

- **Remove from Campaign in the Campaign Roster removes the character, for the DM too.**

- **A character taken out of a campaign leaves the campaign page at once.**

- **A chat cooldown the DM turns on during play reaches the players at the table,** as do the other saved **Campaign Settings**.

- **Saving Campaign Settings, removing a player and handing over the DM seat leave the table as it is.**

- **Sending an invitation leaves the page as it is.**

- **The Campaign Roster keeps its list while it updates.**

- **A campaign that is still loading when you open another one can no longer replace it.**

- **A character's name reads on a pale header colour,** in every system's sheet and editor.

- **The buttons on a character sheet's header read clearly on every header colour.**

- **A DM opening a player's sheet sees the player's name.**

- **A sheet opened from the Characters page no longer offers rolls it cannot make.**

- **Save and Cancel can be tapped in a character editor on a phone.**

- **Character sheets follow your theme,** with the theme's paper, text, borders and colours in every system.

- **The header colour you pick is drawn everywhere a sheet uses it.**

- **The built-in character templates follow the rules.** Characters already made from a template keep their numbers; the Call of Cthulhu editor works an investigator's out again when it is next saved.

- **The Pathfinder 2e and Call of Cthulhu editors say which name is missing** before a save is refused.

- **A feature listed twice is kept twice.**

- **Save as Template works for a character with a picture.** The template is published without the picture, unless it is already a global asset.

- **Two people editing one character template no longer undo each other.**

- **A copied character keeps "(Copy)" in its name when it is saved.**

- **A Flexible sheet's add buttons stop where the server does:** 100 sections, 200 stats in a section, 1,000 list entries, and 50 columns and 1,000 rows in a table.

- **Game systems are named in words everywhere,** where some places showed a code such as `DND_5E`.

- **You can delete your character while its campaign is being played,** after a warning naming the campaign.

- **Create & Publish as Template publishes the character you made, and says so when it cannot.**

- **Choosing a Flexible campaign in Create New Character makes the character Flexible.**

- **Create New Character says what happens after Create.**

- **Create New Character takes a name as long as the sheet does,** 200 characters.

- **A refused template sheet save names the boxes to fix.**

- **Edit Template no longer offers a token picture it cannot use.**

- **A screen reader names every box in the three character editors, and the boxes stop at the length a sheet stores.**

- **A Call of Cthulhu investigator whose CON and SIZ add up to less than 10 can be saved.**

- **A Call of Cthulhu investigator's own language follows EDU.**

- **The Call of Cthulhu sheet shows the derived attributes an investigator's characteristics give.**

- **A Call of Cthulhu investigator's token picture is checked and named after the investigator.**

- **A Call of Cthulhu weapon rolls its damage bonus and its skill's current value.** Damage such as "1d3+DB" rolls the damage bonus.

- **The Call of Cthulhu read-only sheet reads clearly.**

- **Every Call of Cthulhu skill rolls from the sheet, named once.**

- **A Call of Cthulhu box can be cleared and retyped.**

- **A Call of Cthulhu investigator stored without skills can be saved.**

- **A Call of Cthulhu investigator with POW 100 can be saved, and current Sanity stays within the maximum.**

- **Cthulhu Mythos typed on a Call of Cthulhu sheet lowers maximum Sanity.**

- **A Call of Cthulhu major wound threshold rounds up.**

- **A Pathfinder 2e ancestry or class with 0 hit points counts as 0.**

- **An item's value keeps fractions of a gold piece on the D&D 5e and Pathfinder 2e sheets.**

- **The Pathfinder 2e sheet and editor agree on more of a character.**

- **Pathfinder 2e spell slots never show more used than there are.**

- **A Pathfinder 2e lore named with "Lore" rolls under its own name.**

- **The Pathfinder 2e sheet shows and rolls the saves, Perception and skills its own numbers give.**

- **A Pathfinder 2e check penalty lowers the skill however it is typed.**

- **The Pathfinder 2e focus pool holds what your character has.**

- **A Pathfinder 2e feat with no level is listed first on the sheet.**

- **A Pathfinder 2e feat from a built-in template opens with its text in the editor.**

- **A Pathfinder 2e character stored with spellcasting but no spell attack or spell DC can be saved.**

- **A Pathfinder 2e spell DC uses its own item bonus, and one spellcasting rank sets both spell attack and spell DC.** A character whose DC changes because of this gets a note above the sheet when it opens.

- **Pathfinder 2e Bulk follows the rules on the sheet and in the editor.**

- **A Pathfinder 2e character whose AC, Class DC or Spell DC works out under 10 can be saved.**

- **Every Pathfinder 2e Add Feat button has its colour.**

- **The D&D 5e editor says when it has brought a stored number within range.**

- **The D&D 5e editor says what to fix before a save is refused.**

- **A row added by mistake no longer stops a D&D 5e sheet from saving.**

- **A D&D 5e character's Proficiency Bonus follows their level.** See [Levelling up (D&D 5e)](docs/PLAYER_GUIDE.md#levelling-up-dd-5e).

- **A D&D 5e sheet stops adding skills and damage rolls where it can still be saved.**

- **Unticking Requires Attunement on a D&D 5e item ends its attunement.**

- **A D&D 5e sheet's Total Weight counts items with no weight or quantity.**

- **Naming a D&D 5e spellcasting ability raises the spell save DC and spell attack.** A sheet saved before with the ability empty shows a negative **Other bonus** on its Spells tab; set it back to 0.

- **A D&D 5e character stored without its saving throws can be saved from the editor.**

- **Coloured messages, labels, text and buttons read clearly in every theme.**

- **Text boxes, checkboxes and dropdown lists are dark in a dark theme.**

- **The panels show a token's disposition and HP in the map's own colours.**

- **The Spirit Realm badge over the map can be read over any map.**

- **Personal notes follow your theme.**

- **A screen reader no longer reads out older chat messages as they load.**

- **Three more controls read correctly to a screen reader.**

- **An asset card's View, Download and Delete buttons can be reached with Tab and are always shown on a touch screen.**

- **The DM can reorder initiative and edit a value from the keyboard.**

- **Screen readers hear new dice rolls and the connection status, and the dice panel's boxes and windows have names.**

- **The map's Fog of War, Walls and Lights panels open and fold from the keyboard.**

- **The DM's side panels work from the keyboard and are announced as dialogs.**

- **With reduce motion turned on, windows and notifications fade out where they are.**

- **With one window open over another, Escape and Tab act on the top one only.**

- **The Desktop Required notice is no longer hidden behind an open window.**

- **A screen reader reads a Creature Library row and its favourite star as two controls.**

- **The Atmosphere panel's volume slider tells the table however it is moved.**

- **A document saved twice at the same moment records the size of the text it keeps.**

- **Every sound file and document you may use is offered.**

- **The picture pickers can find every picture you may use,** by part of a name or a whole tag, with **Load more**.

- **The Asset Library's search and sort cover the whole library.**

- **An MP1 or MP2 sound file is refused when it is uploaded or imported.** Convert it to MP3, Ogg or WAV.

- **A PDF uploaded under another name opens as a PDF.**

- **A document you stop editing after a refused save shows its text again.**

- **The Upload Asset window's progress bar shows how much of the file has been sent.**

- **A picture that fails to load no longer breaks the asset pickers.**

- **The Asset Library's detail panel slides away when you close it.**

- **In Firefox, the Asset Library's cards fade in once as it opens.**

- **An asset you move in the Asset Library takes its new place at once.**

- **The Asset Library offers Campaign as a place to move an asset only when one of your campaigns can take it.**

- **The Asset Library offers Delete and Move to whoever may use them.**

- **A move the Asset Library refuses says why.**

- **A file whose name has accented or other non-ASCII letters keeps its name.** Files uploaded before keep their stored names; upload one again to show its name correctly.

- **The Upload Asset window takes Ogg and WAV sound files in Firefox, and Markdown documents in every browser.**

- **Searching a library for `%` or `_` finds only names that hold one.**

- **A mistyped `ASSET_UPLOAD_RATE_LIMIT` no longer turns the upload limit off.** A value that is not a number is ignored, with a warning in the log, and the default of 30 uploads a minute per user applies.

- **A campaign archive is uploaded once when you import it.**

- **Changing a creature's ability scores or Challenge Rating moves its saves and skills, and saves them.**

- **A Pathfinder 2e stat block shows the creature's level, its attribute modifiers and Fort, Ref and Will.**

- **Stat blocks in Flexible and Shadowrun campaigns print negative saves and skills properly.**

- **The Creature Library and Token Templates say why a save was refused, and their boxes stop at the server's limits.**

- **Copying a token template to another campaign says it worked, naming the campaign, or says why it was refused.**

- **Deleting a favourite creature takes it out of the Creature Library's Favorites too.**

- **Edit Token shows changes made elsewhere while it is open, and no longer undoes them.**

- **A token whose controller is no longer a player says so.**

- **The Token Manager no longer offers to send an object to the spirit realm.**

- **The Token Manager says why the server refused.**

- **A Player token from the Token Manager can stand for a character,** chosen from a **Character** list.

- **A token's conditions follow the campaign's game system, and you can type your own.** See [Editing Tokens During Play](docs/DM_GUIDE.md#editing-tokens-during-play).

- **A token added, changed or removed reaches everyone at once, from wherever it was changed.**

- **A token goes back where it stands when whoever was carrying it loses their connection.**

- **Damage from the minus buttons takes temporary hit points first, on the roster and in Edit Token.**

- **A player who right-clicks a creature or an object on the map no longer gets an empty menu.**

- **More actions say why when they fail.**

- **Players no longer see walls and doors through the fog of war.**

- **Moving a token on a lit map with many walls no longer holds up the server.** On a map of 1,000 walls, a move seen by 12 players took about 345 ms of the server's time and now takes about 21.

- **The DM tool panels stay on the map,** and double-clicking the bar above them puts them back in their corner.

- **A light's colour can be typed into the Lights panel.**

- **The Spirit Layer panel shows the veil and the style as the server has them.**

- **Saving the vibe periods updates everyone's table at once.**

- **Saving the vibe periods keeps the weather, and the ambient track, as they are.**

- **Moving the pointer over the map does less work.**

- **Token pictures load together when a map opens, and one that cannot be loaded is not asked for again every time a token moves.**

- **A burst of edits to one map no longer holds up the rest of the server.**

- **Fog of war fades away over the squares you reveal.**

- **The AoE Shape tool's cone has the right shape for your game:** as wide as it is long in D&D 5e, a quarter circle in Pathfinder 2e.

- **Walls, doors and lights stay on the map's picture when you change its Width, Height or Grid Size.**

- **Players see an edit to the map on screen straight away.**

- **The map's Zoom In and Zoom Out buttons zoom about the middle of the view.**

- **A player opening or closing a door while you drag walls keeps their change.**

- **Clicking a token beside a door picks the token up, or puts the one you are holding down there.**

- **Switching maps lets go of whatever you were holding on the last one,** and **Esc** puts a held token back.

- **Letting go of the mouse button off the map finishes what you were doing.**

- **The ruler counts alternating diagonals at the map's own scale.**

- **Preview Player View can always be ended.**

- **The light tool's Select does nothing during a preview.**

- **The DM's spirit token button on the map toolbar says what a click does.**

- **The right mouse button pans the map under every wall, fog and light tool, and opens no menu there.**

- **Clicking near a polygon's first corner closes the shape.**

- **Esc puts the light tool away, as it does the wall tools.**

- **Reset explored areas clears every player's memory of the map.**

- **Export as .uvtt file says why a map cannot be exported, and saves only a real file.**

- **Export as .uvtt file works for a map picture of more than 16,383 by 16,383 pixels.**

- **Ending a session with Save game state unticked keeps the snapshot taken when you paused.**

- **Starting, pausing and ending a session from two tabs at once can no longer leave two sessions open, or an ended session marked Paused.** A campaign an earlier version left marked **Paused** or **Active** with no session open offers **Start Session**.

- **The session timer counts from the session's start after Resume Session.**

- **The paused-session notices say which rolls stay private:** only rolls from the **Dice** tab.

- **Advantage, disadvantage and a plain d20 show their critical in the Dice panel.**

- **Initiative rolls stay in the Dice panel after a reload.**

- **A player rolls initiative once per fight.** Taking their token out of the order and putting it back lets them roll again.

- **A token deleted while its initiative was being rolled no longer appears in the order.**

- **A dice expression is read the same way everywhere, and one that cannot work is refused when it is rolled or saved.** A saved roll stored before that breaks the rules is refused when used, with the reason; edit it to fix it.

- **A roll from a character sheet, the roster or the map's Roll... menu says why when it does not go through,** and spending a hit die keeps the die when its roll is refused.

- **What the table refuses is shown as a message, and the Dice panel shows only what happened to its own rolls.**

- **A saved roll shows its name in the dice log.**

- **Coming back after a dropped connection brings back what the DM changed meanwhile.**

- **Coming back after a long disconnect fills in the chat messages you missed,** up to 500.

- **Chat times move on.**

- **Enter no longer sends a chat message or a roll while you are picking characters in an input method.**

- **The Dice and Chat boxes keep the keyboard after you roll or send.**

- **A failed Load More in chat no longer leaves its message up for good, or makes the list jump later.**

- **A chat message that does not get through says so,** marked **Not sent** with **Retry** and **Discard**. A message stops at 2,000 characters.

- **Firefox no longer logs "Invalid URI. Load of media resource failed" on every campaign page.**

- **Hit point changes during a fight do less work.**

- **The Session tab at the top of the right-hand panel is no longer cut off.**

- **The campaign page no longer scrolls sideways.**

- **The campaign page opens when the browser refuses to store site data.**

- **The dark backdrop behind a character sheet opened from the campaign roster covers the whole window.**

- **A failed save or request no longer copies what it sent into the browser's console.**

- **Pop-up messages leave one at a time, each after its own few seconds.**

### Security

- **Ten security advisories against five of the backend's libraries are cleared,** in body-parser, multer, zod, nodemailer and fast-uri. The updates change nothing in how the app behaves.

- **A map, token or avatar picture is held to limits that keep an animation from swamping players' browsers.** At most 16,384 pixels a side, and an animation at most 1,000 frames and 200 million pixels across them for a map, 50 million for a token or an avatar. Pictures already uploaded are not affected.

- **A crafted map in a campaign archive no longer costs the import far more memory than its size.**

- **On an install whose database address names a schema, a password change or a removed account ends the other sign-ins.** The sign-in store also keeps to the address's `connection_limit`.

- **The live table connects only to the instance itself.** A reverse proxy of your own should pass the browser's host name on (`proxy_set_header Host $host;` in Nginx); where it does not, the live table still works over a slower connection.

- **A server admin who runs a campaign can share only their own documents and global ones with it.**

- **An invited administrator has the full 7 days to set up two-factor authentication,** counted from when they set their password.

- **Forgot password answers as quickly for an address with an account as for one without.**

- **A flood of sign-ins can no longer stall the server.** At most 2 passwords are checked at a time, with 50 more waiting; past that the forms say "The server is busy, try again in a moment."

- **A player removed or demoted while their page is switching campaigns loses the access at once.**

- **A game tab left open is disconnected when its sign-in ends.**

- **A character saved as a template leaves the player's name and the Keeper's Notes behind.**

- **A picture whose campaign was deleted no longer has its details shown to everyone.**

- **A text document opened from the browser's cache keeps its sandbox.**

- **Asking for something you may not see is answered as if it were not there.**

- **With fog of war on, a player can open or close only a door beside a square revealed to them.**

- **The security advisories against the tools that build and test CozyVTT are cleared.** None of them was ever in an instance.

## [1.5.3] - 2026-10-17

### Upgrading from 1.5.2

The upgrade is the usual one. Back up first, as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

Coming from 1.5.1 or earlier, read the **Upgrading** notes of every release in between too, oldest first. The commands are the same, and each release's notes say what it needs from you.

This release moves CozyVTT to new versions of what it is built on and adds no features. There is no new setting, required or optional, no setting is removed, and there is no manual step. Two database updates run by themselves on the first start. One records the table that keeps sign-ins, which the backend made for itself when it first started, so it finds the table there and changes nothing, and nobody is signed out. The other clears the author of any custom creature whose author's account was already deleted, since it named an account that no longer exists; the creatures themselves are kept. Nothing else you have stored is rewritten.

All four containers are recreated, because `docker-compose.yml` changes each of them: every container drops the Linux capabilities its start-up does not use, the backend's and the bundled nginx's files become read-only, as the frontend's already were, and the frontend image is no longer built with `VITE_API_URL` and `VITE_SOCKET_URL` (see **Changed** and **Security** below). Compose makes two new volumes on the first start, `nginx_temp` for uploads and downloads on their way through nginx and `backend_tmp` for the backend's `/tmp`; neither needs a backup. Your campaigns, uploads and backups are not touched; Docker's own log of each container starts afresh. The images stay on Node.js 26, nginx 1.30 and PostgreSQL 15, `nginx/nginx.conf` does not change, and `.env.example` gains no setting and loses none.

If you have edited `docker-compose.yml`, `git pull` stops at it because this release changes it. Set your edits aside and bring them back with `git stash`, `git pull origin main` and `git stash pop`, as described in [Updating after you've edited `docker-compose.yml`](docs/DEPLOYMENT.md#updating-after-youve-edited-docker-composeyml). If you deleted the `nginx` service to use your own proxy, `git stash pop` reports a conflict there, because this release changes that service. Keep it deleted: remove the lines from `<<<<<<< Updated upstream` down to `=======`, both included, and the `>>>>>>> Stashed changes` line below them, then run `git reset` and `git stash drop` as the guide says.

If you use your own proxy in place of the bundled nginx, it needs nothing new. It must send `/api/` and `/socket.io/` to the backend on the page's own address, as [Using an External Reverse Proxy](docs/DEPLOYMENT.md#using-an-external-reverse-proxy) shows, which is now the only way the page reaches the backend: a `VITE_API_URL` or `VITE_SOCKET_URL` left in `.env` is no longer built into the app.

An install without Docker stays on Node.js 26 and upgrades with the usual commands in [Without Docker](docs/DEPLOYMENT.md#without-docker). `npm run build` in the `backend` folder now also prepares the database client, which `npm install` no longer does, so run both, in the order the guide gives.

#### What you will notice

- **The app needs Chrome or Edge 111, Firefox 114 or Safari 16.4, or a newer version.** An older browser, such as Safari on an iPad that cannot update past iPadOS 15, no longer loads the app.

- **Many of the app's icons are drawn a little differently.** Each still stands for what it did.

- **The database's log shows two harmless `chmod: ... Operation not permitted` lines each time it starts.** Its folders already have the right permissions.

- **A browser that has used your instance over HTTPS keeps to HTTPS for its name for a year,** up from 180 days. Read [HTTPS is remembered by browsers](docs/DEPLOYMENT.md#https-is-remembered-by-browsers) before you ever move the name back to plain HTTP.

- **People in one home who connect over IPv6 share the request and sign-in limits,** as people behind one IPv4 address already did.

#### What to do afterwards, if it applies to you

- **If you run commands in the backend container, add `-u appuser`,** such as `docker compose exec -u appuser backend node dist/scripts/migrate-sheet-fields.js --dry-run`. Run Prisma's own commands as `./node_modules/.bin/prisma` in place of `npx prisma`, such as `docker compose exec -u appuser backend ./node_modules/.bin/prisma migrate status`, because `npx` writes to a folder that is now read-only. A command that writes a file of its own must write it under `/tmp`; copy it out with `docker compose cp backend:/tmp/the-file .`.

- **If your `docker-compose.override.yml` adds a program that needs a Linux capability, such as a network tool,** give it back there with `cap_add`, as [the deployment guide](docs/DEPLOYMENT.md#a-container-stops-with-permission-denied-operation-not-permitted-or-read-only-file-system) shows. Without it, that program fails with `Operation not permitted`.

- **If a file of yours in `nginx/conf.d` writes a log to a file of its own,** send that log to `/dev/stdout` instead, such as `access_log /dev/stdout;`. Otherwise nginx stops with `Read-only file system`.

- **If `.env` still sets `VITE_API_URL` or `VITE_SOCKET_URL`,** you can delete both lines: nothing reads them any more.

### Changed

- **Changes for scripts and integrations.** See [API changes in 1.5.3](docs/api-changes/1.5.3.md).

- **The backend's database library moves to Prisma 7.** It opens at most 10 connections for its own queries, and settings in `DATABASE_URL`, such as `sslmode`, apply to every connection. Deleting an account now clears the author of the creatures it made and keeps the creatures. See [Without Docker](docs/DEPLOYMENT.md#without-docker) for the build order outside Docker.

- **The app now needs Chrome or Edge 111, Firefox 114 or Safari 16.4, all released in 2023, or a newer version.** Until now Chrome 87, Firefox 78 and Safari 14 were enough.

- **The libraries CozyVTT is built on are updated to recent releases,** among them Express 5 and React 19. Nobody is signed out, and campaign exports and backups hold the same files as before.

- **A browser that has used your instance over HTTPS now keeps to HTTPS for its name for a year,** up from 180 days. An instance only ever used over plain HTTP is not affected. See [HTTPS is remembered by browsers](docs/DEPLOYMENT.md#https-is-remembered-by-browsers).

- **Visitors who connect over IPv6 are counted by their network for the request and sign-in limits.** All the addresses in one /56 block share one allowance; the limits for each account are unchanged. See [Visitor addresses and sign-in limits](docs/DEPLOYMENT.md#visitor-addresses-and-sign-in-limits).

- **Many of the app's icons are drawn a little differently.** Screen readers now pass over icons that are only decoration.

- **`VITE_API_URL` and `VITE_SOCKET_URL` in `.env` no longer reach the app.** The page always reaches the backend on its own address, so a proxy of your own must send `/api/` and `/socket.io/` there. See [Using an External Reverse Proxy](docs/DEPLOYMENT.md#using-an-external-reverse-proxy).

- **For people working on CozyVTT: after this update, start the development stack once with `docker compose -f docker-compose.dev.yml up --build -V`.** Without it the development containers keep running the old packages.

### Security

- **Security advisories against the tools that build and test CozyVTT are cleared.** None of their code is part of a running instance.

- **The check of who belongs to a campaign takes the campaign from the request's address alone.** No request could reach the old path.

- **Two security advisories against the library that moves between the app's pages are cleared.** Neither could be reached in CozyVTT.

- **Each container keeps only the powers its start-up needs.** All four drop the Linux capabilities their start-up does not use, which is why backend commands now take `-u appuser`. See [the deployment guide](docs/DEPLOYMENT.md#a-container-stops-with-permission-denied-operation-not-permitted-or-read-only-file-system).

- **The bundled nginx can no longer change its own files.** Its filesystem is read-only, with uploads and downloads on the new `nginx_temp` volume.

- **The backend can no longer change its own program files.** Only `backend/uploads`, `backend/backups`, `backend/logs` and `/tmp` (the new `backend_tmp` volume) are writable, and a database copy left in `/tmp` by a stopped backup is removed at each start.

- **Building CozyVTT stops at a package that wants to run a program while it installs, unless CozyVTT has approved it.**

## [1.5.2] - 2026-10-14

### Upgrading from 1.5.1

The upgrade is the usual one. Back up first, as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

Coming from 1.5.0 or earlier, read the **Upgrading** notes of every release in between too, oldest first. The commands are the same, and each release's notes say what it needs from you.

**If a Cloudflare Tunnel or another proxy sits in front of CozyVTT, change `.env` before you pull or straight after.** The bundled nginx now believes only the proxies you list about who each visitor is. Until now it believed any machine on a private network, so anything that could reach nginx from such an address, an ordinary visitor over IPv6 included, could choose the address CozyVTT counts it as. For a tunnel or proxy on the same server, add:

```env
NGINX_TRUSTED_PROXIES=172.16.0.0/12
HTTP_PORT=127.0.0.1:80
HTTPS_PORT=127.0.0.1:443
```

then run `docker compose up -d`. `172.16.0.0/12` is the range on most servers ([check yours](docs/DEPLOYMENT.md#the-range-for-a-proxy-on-the-same-server)). The two port lines keep nginx's ports to this server, so visitors can only arrive through the tunnel; keep your own port numbers if you changed them, and leave the two lines out if your proxy reaches nginx from another machine. Without the first line, every visitor counts as the proxy's one address: a few wrong passwords from anyone lock everybody out of signing in for 15 minutes, the whole table shares one limit of 300 requests a minute, and sign-in cookies are no longer marked HTTPS-only. 1.5.1 ignores the first line and already reads the other two, so you can add all three before you pull. Requests a tunnel sends straight to the backend, without the bundled nginx, are unaffected. Other setups, and a check that it worked, are in [Visitor addresses and sign-in limits](docs/DEPLOYMENT.md#visitor-addresses-and-sign-in-limits).

There is no database change and no new required setting, and nothing you have stored is rewritten. A production instance whose `SESSION_SECRET` is shorter than 32 characters, or an example value from the guides, now refuses to start; **What you will notice** below says what to do. All four containers are recreated, because `docker-compose.yml` changes each of them: every container gets Docker's `no-new-privileges` option, the frontend container's files become read-only, the backend is given longer to stop, and nginx moves to its stable 1.30 releases with a reworked `nginx/nginx.conf`. Your campaigns, uploads and backups are not touched; Docker's own log of each container starts afresh. The backend image now runs on Node.js 26, and the app is built with it. An install without Docker needs Node.js 26 before it is upgraded: follow [Install Node.js 26](docs/DEPLOYMENT.md#1-install-nodejs-26) and check that `node --version` prints a version starting `v26`.

If you have edited `docker-compose.yml`, `git pull` stops at it because this release changes it. Set your edits aside and bring them back with `git stash`, `git pull origin main` and `git stash pop`, as described in [Updating after you've edited `docker-compose.yml`](docs/DEPLOYMENT.md#updating-after-youve-edited-docker-composeyml).

If you have edited `nginx/nginx.conf`, to turn on HTTPS or to add a proxy's addresses, this is the last time `git pull` stops at it. HTTPS now goes in a file of your own in the new `nginx/conf.d/` folder, which git leaves alone, and a proxy's addresses go in `.env`. Move your edits over once, before you pull:

1. Keep a copy of what you changed: `git diff nginx/nginx.conf > ~/my-nginx-changes.txt`
2. Put the shipped file back: `git checkout nginx/nginx.conf`
3. Pull: `git pull origin main` (with the `git stash` steps above if you also edited `docker-compose.yml`)
4. For HTTPS, create `nginx/conf.d/https.conf` from the example in [SSL/TLS with Let's Encrypt](docs/DEPLOYMENT.md#configure-nginx-to-use-the-certificate), with your domain. Your certificates stay where they are, in `nginx/certs/`. If your copy of the HTTPS block had a `Strict-Transport-Security` line turned on, turn on the one in the example too.
5. For `set_real_ip_from` lines you added, put those addresses in `NGINX_TRUSTED_PROXIES` in `.env`, separated by spaces.
6. `docker compose up -d --build`, then open your site over HTTPS to check it.

Skip step 4 and, after step 6, your instance answers over plain HTTP only.

If you use your own proxy in place of the bundled nginx, it must send `/api/` and `/socket.io/` to the backend on the page's own address, as [Using an External Reverse Proxy](docs/DEPLOYMENT.md#using-an-external-reverse-proxy) shows: `VITE_API_URL` and `VITE_SOCKET_URL`, for a backend on another address, are no longer offered in `.env.example` (see **Removed** below). Your proxy may also compress the backend's answers, as the bundled nginx now does, and if it replaces CozyVTT's security headers with a policy of its own, you can remove `fonts.googleapis.com` and `fonts.gstatic.com` from it.

There are two new settings for `.env`, both optional. `NGINX_TRUSTED_PROXIES` lists the proxies in front of the bundled nginx; leave it out and nginx believes none. `SETUP_TOKEN` matters only on a fresh install; leave it out and the backend prints a token for the setup wizard in its log.

#### What you will notice

- **A weak `SESSION_SECRET` stops a production instance starting.** If `docker compose logs backend` shows `[FATAL] SESSION_SECRET`, put the output of `openssl rand -hex 32` in `.env` and run `docker compose up -d`; a new secret signs everyone out once.

- **A sign-in ends 30 days after it was made, however active it has been.** `REMEMBER_ME_MAX_AGE` in `.env`, if you set it, is now the longest any sign-in lasts.

- **An administrator without two-factor authentication has 7 days to set it up.** After the date on the banner, the account can only set it up, change its password or sign out.

- **On a fresh install only, the setup wizard asks for a setup token.** Find it with `docker compose logs backend | grep "setup token"`.

- **The browser tab shows your instance's name,** and the Timezone box is gone from the setup wizard and **Admin Panel → Settings**.

- **Only an administrator can import the D&D 5e SRD creatures, and Invite Player finds people by name.** Type at least 2 letters of a display name.

- **New limits, set far above what a table uses,** on characters, templates, invitation emails, sheet lists and uploads. What is already saved stays.

- **The Profile page has a Remove Avatar button,** and uploading a new avatar deletes the old picture.

#### What to do afterwards, if it applies to you

- **If you got a Let's Encrypt certificate with the deployment guide's earlier steps, check that it can renew.** Run `sudo certbot renew --dry-run`. If it says `Could not bind TCP port 80`, follow [If you obtained your certificate with the earlier steps](docs/DEPLOYMENT.md#if-you-obtained-your-certificate-with-the-earlier-steps).

- **If you installed without Docker, update your Nginx site file from the example in [Manual Deployment](docs/DEPLOYMENT.md#5-serve-with-nginx).** Copy its `gzip` lines and `server_tokens off;`, the headers in its `location /` block, the `if (-d $request_filename)` block and the `try_files $uri /index.html;` line that replaces the old one, the two `X-Forwarded` lines in its `/socket.io/` block, and the `X-Real-IP`, `X-Forwarded-For` and `X-Forwarded-Proto` lines in its `/health` block, then run `sudo nginx -t` and `sudo systemctl reload nginx`. Without them the app page has no Content-Security-Policy, the app's scripts and styles and the backend's answers are not compressed, and reloading or bookmarking the Asset Library page (`/assets`) shows "403 Forbidden".

- **To remove the files of accounts deleted before this release,** open the **Assets** tab of the Admin Panel and choose **Uploader**: **No Uploader (account deleted)**.

### Added

- **Administrators can find and delete files that nothing uses.** The Admin Panel's **Assets** tab has a **Leftover Files** check, and filters for files whose uploader was deleted and for documents. See [Files with no owner, and leftover files](docs/USER_GUIDE.md#files-with-no-owner-and-leftover-files-admins).

- **The app shows how many two-factor backup codes you have left,** on the Profile page and after signing in with one.

- **Signing in takes you to the page you were trying to open,** when it is a page of your own instance.

- **The Admin Panel warns when the disk holding the uploads is nearly full,** above 80%, under **Storage** in **System Overview**. See [File Storage](docs/DEPLOYMENT.md#file-storage).

### Changed

- **Changes for scripts and integrations.** See [API changes in 1.5.2](docs/api-changes/1.5.2.md).

- **Deleting an account now deletes its avatar and the personal files nothing uses.** Campaign files and shared documents stay, with no owner. Accounts deleted earlier keep their files; find them with **No Uploader (account deleted)** on the Admin Panel's **Assets** tab.

- **A player removed from a campaign can still read their notes and saved rolls from it,** on their dashboard under **Notes From Campaigns You Have Left**. See [Removing a Player](docs/DM_GUIDE.md#removing-a-player).

- **The bundled nginx, and the web server inside the frontend image, now use nginx's stable 1.30 releases.**

- **The fonts now come from your own instance, so visitors' browsers no longer contact Google.** A proxy of your own that replaces CozyVTT's security headers can drop `fonts.googleapis.com` and `fonts.gstatic.com` from its policy.

- **The app's scripts and styles, and everything the backend sends as data, are now compressed on their way to the browser.** An install without Docker needs the new `gzip` lines in its Nginx site file.

- **HTTPS, and any other nginx settings of your own, now go in a file in the new `nginx/conf.d/` folder, which git leaves alone.** See [SSL/TLS with Let's Encrypt](docs/DEPLOYMENT.md#ssltls-with-lets-encrypt).

- **CozyVTT now runs on Node.js 26,** supported until April 2029. An install without Docker needs it before upgrading.

### Removed

- **The Timezone setting is gone from the setup wizard and from Admin Panel → Settings.** Nothing used it; times are shown in each viewer's own time zone.

- **`.env.example` no longer offers `VITE_API_URL` and `VITE_SOCKET_URL`.** A backend on another address left pictures, sounds and PDFs blank. If you set them, empty them and have your proxy send `/api/` and `/socket.io/` to the backend on the page's own address. See [Using an External Reverse Proxy](docs/DEPLOYMENT.md#using-an-external-reverse-proxy).

### Fixed

- **Dice rolls made in the same instant keep one order in the dice history.**

- **A Flexible character sheet or template laid out wrongly is no longer saved.**

- **A published character template keeps only the fields its sheet has.**

- **A character sheet that cannot be shown no longer takes the whole page with it.**

- **A Flexible sheet already stored in a shape its page could not read opens again, and can be put right.**

- **The D&D 5e Spells tab opens for every caster, and spell slots are held to 20 of each level.**

- **The D&D 5e "other bonus" boxes for initiative, passive Perception, spell save DC and spell attack take -30 to +30.**

- **The name written on a character sheet is held to 200 characters, like the name a character is created with.**

- **Every box on a character sheet now has a length limit:** 100,000 characters for notes and other long text, 1,000 for most boxes. A sheet stored with more keeps loading.

- **The Import Campaign window works with a screen reader and the keyboard.**

- **A screen reader names the D&D 5e editor's Alignment and Background boxes.**

- **Saving a text or Markdown document can no longer leave it empty or cut off.**

- **An upload that cannot be saved no longer leaves files behind on the server.**

- **A session or rate-limit setting that is not a whole number no longer breaks sign-in or turns the limit off.** A bad `SESSION_MAX_AGE`, `REMEMBER_ME_MAX_AGE` or `RATE_LIMIT_MAX_REQUESTS` falls back to the default, and the log says so.

- **The sign-in, sign-up, two-factor code and password reset pages say why they refused.**

- **Correct two-factor codes entered at the same moment from one address are all accepted.**

- **Two setup wizards submitted at the same moment no longer both change the instance's settings, and a setup that fails part-way no longer locks the instance.**

- **The instance always keeps an administrator, whatever happens at the same moment.**

- **Deleting the account of someone who runs a campaign they did not create is refused until they hand the DM seat on.**

- **A campaign keeps exactly one DM when its seat changes hands at the same moment as something else.**

- **The Custom theme shows the colours that were picked.**

- **Dragging a custom colour on the Profile page saves it once.**

- **The instance name is now the browser tab's title and is used in emails.**

- **Create User and Invite User in the Admin Panel check the display name the way sign-up does, and refuse an email address holding `<` or `>`.**

- **Only one restore runs at a time, and nothing changes the database while a restore replaces it.** During a restore, every request is answered "The instance is being restored from a backup. Try again in a minute; everyone signs in again once it has finished."

- **A backup the restore refuses now says why.**

- **An uploaded backup left behind by a restore that was cut short is cleaned up.**

- **The backup and restore scripts accept a database password written percent-encoded.**

- **The restore script reads a backup with very long lines quickly.**

- **A sound that a time of day plays counts as in use.**

- **The Admin Panel's status card shows how the server really is:** **Healthy**, **Degraded** or **Unknown**.

- **Admin Panel settings that could not be loaded can no longer be saved over the real ones.**

- **After a restore, Go to Login opens the sign-in page.**

- **The Admin Panel's Create User and Invite User window works with a screen reader and the keyboard.**

- **The Admin Panel's Assets tab keeps showing what its filters say.**

- **A sign-in never waits more than 15 seconds behind other attempts still being checked.**

- **A wrong password or code on the Profile page is now said on the form.**

- **A server restart no longer sends everyone to the sign-in page.** The page says "Can't reach the server" and opens once the server answers.

- **The Forgot your password? page no longer says a link was sent when none was.** An instance without email says "Password reset by email is not available".

- **A backup code mistyped at sign-in can be corrected with Backspace.**

- **Going back to the sign-up or two-factor code page after signing in no longer shows a blank page.**

- **Back to login on the two-factor code page goes back to the sign-in page.**

- **The Copy buttons for the two-factor key and the backup codes work over plain HTTP, and say when they could not copy.**

- **Reloading the two-factor setup page keeps you on it, and the browser asks before you leave unsaved backup codes.**

- **The password strength meter no longer calls a password Strong that the page then refuses.**

- **A campaign page says why its table has ended, and leaves it.**

- **A campaign page reconnects by itself however long the server is away, and shows Connected once it has.**

- **On a lit map, a token two squares or taller sees from its middle.**

- **On a lit map, a player can open or close only a door one of their tokens can see.**

- **The quick editor no longer shows a token change that was not saved.**

- **The token menu offers View Character Sheet only for a character in the campaign, and says why when a sheet cannot be opened.**

- **A Universal VTT import that fails while saving leaves nothing behind.**

- **Universal VTT imports use less of the server's memory, and wait their turn when several arrive at once.** An import waits at most 20 seconds for its turn and runs for at most 30. See [Importing a Universal VTT file](docs/DM_GUIDE.md#importing-a-universal-vtt-file).

- **Stopping or upgrading CozyVTT while the Admin Dashboard is making a backup now lets the backup finish,** for up to 10 minutes.

- **An error the backend cannot recover from is now written to its log files,** in `backend/logs/error.log`.

- **The API guide shows what the server really sends.**

- **The WebSocket guide for scripts and integrations is corrected.**

- **The restore script says plainly which address to check afterwards.**

- **The example settings file and the deployment guide now say what the database password and email need.** The database password must use letters and digits only, and email counts as set up only when `SMTP_HOST`, `SMTP_USER` and `SMTP_PASS` are all set.

- **The Let's Encrypt steps in the deployment guide now keep the certificate renewing.**

- **The deployment guide now says that browsers remember HTTPS for your instance's name.**

- **The deployment guide's steps for an install without Docker work as written.**

- **The User, Player and DM Guides were checked against the app and corrected.**

- **The User Guide says how a token is moved.**

- **The Player Guide no longer says a token is dragged, and no longer lists Shadowrun.**

- **The DM Guide says how a token is moved and which tokens send a player to the spirit realm.**

- **The guides for people working on CozyVTT match the code again.**

- **The bug report form and the security policy now say what to send and what to leave out.**

- **The README says how a token is moved.**

- **A connection still being made when you leave a campaign no longer breaks the next campaign you open.**

- **Reloading or bookmarking the Asset Library page now opens it.** On an instance with a port in its address, a browser may remember the old redirect until its cache is cleared.

- **Uploading a large file on a slow connection no longer fails with "Failed to upload asset".**

- **The Import Campaign window can no longer be closed while an import is running.**

- **A refused character sheet save names the boxes to fix, in the editor at the table as well.**

- **The lists on a D&D 5e, Pathfinder 2e or Call of Cthulhu sheet hold up to 500 entries.** A sheet already stored with more keeps loading, and its next save names the list to shorten.

- **Pathfinder 2e item bonuses are held to -30 to +30, and spell slots to 20 a rank.**

- **An Ogg sound file recorded in Opus can now be uploaded, and Ogg files carrying FLAC or Speex now play.** A FLAC or Speex file uploaded before that does not play has to be uploaded again.

- **The Creature Library credits the D&D 5e SRD whenever it lists SRD creatures.**

### Security

- **A sign-in ends 30 days after it was made, and an account keeps at most 20 sign-ins.**

- **A failure to end someone's sign-ins is no longer reported as success, and deleting an account ends its sign-ins in the same step.**

- **Administrator accounts must use two-factor authentication.** An administrator without it has 7 days, then can only set it up, change their password or sign out.

- **The setup wizard can no longer be claimed by a stranger.** It asks for a setup token, printed in the backend log while setup is not complete, or chosen with the optional `SETUP_TOKEN` in `.env`.

- **Password reset and invitation links are stored hashed.**

- **One password reset email per account every five minutes.**

- **An administrator can no longer reset their own two-factor authentication or password from the Admin Panel.**

- **Signing in with an email that has no account takes as long as a wrong password.**

- **Ten wrong passwords in an hour lock an account from every address, and the admins are told** in **Admin → Activity**. A new password opens the account at once.

- **The password you confirm when changing your password, your email address or deleting your account now has an attempt limit,** 10 wrong passwords per 15 minutes.

- **A sign-in waiting at the two-factor code step ends with the password that started it, and expires after five minutes.**

- **Sign-in and registration no longer answer with the server's own error text.**

- **A production instance refuses to start on a session secret that could be guessed:** an example value from the guides, or one shorter than 32 characters.

- **Everything an administrator does to someone's account is now written to Admin → Activity, with who did it.** See [The activity log](docs/USER_GUIDE.md#the-activity-log-admins).

- **The instance's default theme colours are checked before they are saved.**

- **An invitation can be sent again only to an account that has never signed in.**

- **Signing out now clears the lists the app had loaded for you.**

- **A failed two-factor code or setup wizard no longer leaves the code or the new password in the browser's console.**

- **On a lit map, a token carried out of a player's sight leaves their map at that point.**

- **Only someone who could delete a document can rewrite it, and only someone who could delete a global asset can take it out of the library.**

- **A DM's change to a player's token picture changes only the tokens in campaigns that DM runs.**

- **Call of Cthulhu Keeper's Notes are now the Keeper's alone.**

- **Players' browsers are no longer told which doors are locked or where the lights that are off are.** See [What players' browsers receive](docs/DM_GUIDE.md#what-players-browsers-receive).

- **Pictures in a document or note load only from the asset library, and links open in a new tab.** See [Safety](docs/USER_GUIDE.md#safety).

- **A map picture uploaded from Create Map goes to your personal library unless you choose the campaign's.** See [Adding Maps to Your Campaign](docs/DM_GUIDE.md#adding-maps-to-your-campaign).

- **A DM can have the instance send 20 invitation emails an hour, and the email's subject no longer quotes the campaign.**

- **The Invite Player dialog searches by name, and no longer lists everyone on the instance.** See [Inviting Players](docs/DM_GUIDE.md#inviting-players).

- **Display names no longer keep invisible characters.**

- **One account can publish up to 500 character templates, and the template list loads without every template's sheet.**

- **One account can have up to 1,000 characters, and the Characters page no longer loads every sheet at once.**

- **An upload's name, description and tags have limits:** 200 characters, 1,000, and 50 tags of 50 characters.

- **A new avatar deletes the old picture, and an avatar can be removed.**

- **Only an administrator can import the SRD creatures, and the import gives up on Open5e after 15 seconds.**

- **Refused dice rolls now count towards the dice roll limit.**

- **The development stack, `docker-compose.dev.yml`, now opens its ports to the computer it runs on and no one else.** See [Local Setup (With Docker)](docs/DEVELOPMENT.md#local-setup-with-docker).

- **The bundled nginx believes a visitor's address, and whether they used HTTPS, only from proxies you list** in the new optional `NGINX_TRUSTED_PROXIES`. See [Visitor addresses and sign-in limits](docs/DEPLOYMENT.md#visitor-addresses-and-sign-in-limits).

- **Every container now runs with Docker's `no-new-privileges` option, the container that serves the app's files is read-only, and neither bundled nginx names its version.**

- **The Nginx example for an install without Docker now gives the app page its Content-Security-Policy and Permissions-Policy.** The dashboard's backups need `pg_dump` on the machine the backend runs on.

- **Environment files in the `backend` folder are now kept out of its Docker image.**

- **The libraries the backend and the app are built on are updated to recent releases within the versions they already used, which fixes a security advisory in the image library.**

- **Two-factor codes are checked by a maintained library, and a code is accepted only as exactly six digits.** Authenticator apps already set up keep working.

- **A map's picture and spirit layer picture can only be map pictures from the asset library.**

- **The server reads a stored picture only once it has checked that the file is a PNG, JPEG, WebP or GIF image.** A map whose picture is another kind of file cannot be exported as `.uvtt`; choose a map picture for it in **Edit Map**.

- **Asking for a password reset now gives the same answer for every address even when the server has trouble saving the link.**

## [1.5.1] - 2026-10-10

### Upgrading from 1.5.0

The upgrade is the usual one. Back up first, as always (see [Database Backups](docs/DEPLOYMENT.md#database-backups)), then rebuild and restart:

```bash
git pull origin main
docker compose up -d --build
```

There is no database change, no new required setting and no manual step. Nothing you have stored is rewritten. All four containers are recreated, because `docker-compose.yml` now gives Docker's own log of each container a size limit. Your campaigns, uploads and backups are kept in a volume and in folders that the recreation does not touch, but Docker's old container logs are removed with the old containers.

If you have edited `nginx/nginx.conf`, for example to turn on HTTPS, or `docker-compose.yml`, `git pull` stops at it because this release changes both files. Set your edits aside and bring them back with `git stash`, `git pull origin main` and `git stash pop`, as described in [Updating after you've edited `docker-compose.yml`](docs/DEPLOYMENT.md#updating-after-youve-edited-docker-composeyml). If `git stash pop` reports a conflict in `nginx/nginx.conf`, keep your own lines, then compare your HTTPS block with the new commented-out one and add what it has that yours lacks:

- the two `set` lines after `server_name`, naming `$cozyvtt_backend` and `$cozyvtt_frontend`,
- `$cozyvtt_backend` in place of `http://backend:4000`, and `$cozyvtt_frontend` in place of `http://frontend:80`, in every `proxy_pass` line,
- the whole `location /api/campaigns/import` block.

The new `resolver` line near the top of the file covers both blocks.

If you use your own proxy instead of the bundled nginx, give `/api/campaigns/import` a body limit of at least 505 MB and 300 seconds to answer, as [Minimum proxy requirements](docs/DEPLOYMENT.md#minimum-proxy-requirements) describes, or larger campaign archives cannot be imported. There is one new setting, `CAMPAIGN_ARCHIVE_RATE_LIMIT`, and it is optional: leave it out and the default of 20 applies.

#### What you will notice

- **New limits, set far above what a table or a DM preparing a campaign does.** A map is 1 to 500 squares a side with up to 1,000 tokens, a stat block up to 64 KB, and each account may preview, import and export 20 campaign archives an hour; existing maps over these keep loading. Fog of war and explored areas are refused on a map of more than 250,000 squares.
- **Deleting something now asks first,** and shows where a picture or sound is still used.
- **A PDF is no longer accepted as a map picture.** PDF map pictures you already have are kept.
- **CozyVTT now accepts a Universal VTT file of up to 75 MB.** The bundled nginx still stops one over 55 MB unless you raise `NGINX_MAX_BODY_SIZE`; see [Upload Size Limits](docs/DEPLOYMENT.md#upload-size-limits).
- **D&D 5e skills and saving throws have a box for other bonuses.** Opening an existing sheet in the editor puts any difference there, so no total changes.
- **Edits lost before this release are not brought back by it.** A backup from before the loss is the only way back.

#### What to do afterwards, if it applies to you

- **If you set up a `logrotate` rule for `backend/logs`, remove it.** The backend now rotates its own log files, and the two would fight over them.
- **Log lines written before the upgrade still contain full email addresses.** New lines keep only the first letter and the domain. To remove the old lines, follow [Persistent Log Files](docs/DEPLOYMENT.md#persistent-log-files).

### Changed

- **Changes for scripts and integrations.** See [API changes in 1.5.1](docs/api-changes/1.5.1.md).

- **PDF files are no longer accepted as a map picture.** A map takes PNG, JPEG or WebP; PDFs still go in the Documents library, and a map already stored as a PDF is kept.

- **Deleting an asset that is still in use now shows where it is used before anything is removed.** The file goes only with **Delete anyway**, in the Asset Library, the Documents pages and the Admin Panel's Assets tab.

- **The Admin Panel asks before deleting a backup or changing someone's role.**

- **Deleting a custom creature, a token template or a token from the map now asks first.**

- **Dice rolls allow far more before the limit:** 200 a minute and 50 in any one second, where 30 a minute was reachable.

### Fixed

- **A Universal VTT import that is refused now says why.**

- **A Universal VTT import can no longer exhaust the server's memory.** One person runs one import at a time.

- **Exporting a map to a Universal VTT file is quick on large maps, and keeps more of the map.**

- **The proxy size advice now covers Universal VTT imports.** See [Upload Size Limits](docs/DEPLOYMENT.md#upload-size-limits).

- **Closing a document you are writing or editing no longer throws the text away without asking.**

- **The backend's log files say what went wrong.**

- **Log files no longer grow until the disk is full.** The backend keeps five files of 10 MB each, and Docker the same for each container, from the next `docker compose up -d`.

- **The backend keeps running when the database restarts.**

- **Audio tracks are served correctly from any point in the file.**

- **Stopping, restarting or upgrading the stack is quick and clean,** usually within a second.

- **Markdown documents opened from the Documents page are formatted.**

- **Typing in a token's stat block no longer saves, and resends the whole map to every player, on every keystroke.**

- **Dragging the ambient sound's volume slider no longer sends every step to the whole table.**

- **A chat cooldown longer than a minute now lasts its full length.**

- **The dice log keeps up with new rolls.**

- **Uploaded file names keep their double quotes.**

- **Exporting a large campaign no longer risks stopping the server, and works on slow connections.** An export over 500 MB, the most an import accepts, is refused with its size.

- **Campaign archives up to 500 MB can be imported through the bundled nginx.**

- **A large campaign import or backup restore on a slow connection is no longer cut off after five minutes.** It now has an hour.

- **The site no longer answers 502 after only the backend is recreated.**

- **The deployment guide's section on the API documentation is corrected.**

- **The DM Guide's map export and campaign import sections match the app.**

- **The Characters page shows a character as you last saved it.** ([#40](https://github.com/CheekyChinchilla/CozyVTT/issues/40))

- **Saving in the Character Editor no longer copies the whole sheet into the browser's console.**

- **Opening a D&D 5e sheet's editor and cancelling leaves the sheet as it was.**

- **A D&D 5e sheet with cantrips typed in counts as saved once you save it.**

- **What you type while a sheet is saving is kept.**

- **A save refused because the character changed keeps your edits.** ([#40](https://github.com/CheekyChinchilla/CozyVTT/issues/40)) The editor lists them under **This character has changed**, with **Save my changes** and **Keep editing**.

- **Edit Template keeps your sheet edits when a save fails.**

- **Saving a Flexible sheet keeps everything stored in it.**

- **A colour you pick for a D&D 5e or Pathfinder 2e sheet stays picked while you edit.**

- **Players can no longer see through a wall that has the same identifier as another.**

- **Editing one light through the API can no longer leave its dim radius smaller than its bright radius.**

- **A single wall can be set to a locked door through the API.**

- **Tokens always stand on whole squares, with all of them on the map.**

- **Wall, door, light and fog changes made at the same moment are all kept.**

- **Undoing a wall change after switching maps no longer puts the old map's walls on the new one.**

- **Typing in the chat box, or any other text box, no longer edits the map's walls.**

- **The DM's map tool panels keep one width.**

- **Walls, doors and lights can be drawn on a map opened over plain HTTP from another device.**

- **The DM's map shows doors players open, and the DM's next wall edit no longer closes them again.**

- **Handing over the DM seat no longer mixes up the spirit realm for the two people involved.**

- **Reconnecting brings back doors and lights changed while you were away.**

- **Switching a map's lighting or fog no longer brings back its old picture.**

- **Saving Edit Map no longer removes the map's spirit layer picture.**

- **D&D 5e features that share a name are all kept.** One already lost is only in a backup taken before.

- **Call of Cthulhu: Dodge keeps the points put into it.** A Dodge already reset has to be typed in again, or restored from a backup.

- **Editing a token template no longer deletes its hit points.** Hit points already lost have to be entered again in **Max HP**.

- **Pathfinder 2e characters made from a built-in template keep their skill bonuses.** One saved with the lower numbers gets them back when next saved in the editor.

- **Typing a list into a character sheet works.**

- **D&D 5e: an older sheet's languages show under Languages.** A language already saved under Weapons has to be moved by hand.

- **D&D 5e: skills and saving throws can include bonuses the sheet cannot work out, and keep them.** A bonus an earlier save removed has to be typed in again, or restored from a backup.

- **Moving a character's older fields no longer deletes what it has not moved.** Run `migrate:sheet-fields` and check its report before saving such a character in the editor; content lost before the upgrade is only in a backup.

- **The character maintenance commands report problems properly,** and end with an error status when they fail.

- **A map name set through the API is limited to 200 characters, as everywhere else.**

- **An uploaded picture, sound file or document is recorded as what it really is.**

- **A campaign import that fails part-way no longer leaves a half-made campaign behind.**

- **Importing a campaign no longer loses whole maps, and says what it changed or left out,** under **Changed to fit** and **Left out**.

- **Imported creatures and templates can be placed on a map and edited.**

- **"Include audio assets" now puts your atmosphere's sound in a campaign export.** An archive exported before holds no sound; export it again.

- **An imported campaign's maps are listed in the order they were in.**

### Security

- **One player can no longer flood the chat, hit points, hit dice or token moves.** Each has a limit per player far above what a table sends; the DM's chat cooldown still works on top.

- **One account can no longer hold unlimited live connections, or rejoin a campaign in a loop.** An account may have 40 open at once.

- **The DM's live controls have limits too.**

- **A dice roll's character name and purpose are limited in length,** 200 and 300 characters.

- **Exploring a map no longer rewrites a player's whole memory of it several times a second.**

- **Signing in with the right password can no longer lock anyone out.** Only wrong answers count toward the limit of five in fifteen minutes from one address.

- **A damaged upload can no longer shut the server down or leave it stuck.**

- **A signed-in user can no longer fill the server's disk through its log.**

- **A malformed request is no longer logged with the text around the mistake.**

- **Log files no longer keep full email addresses,** only the first letter and the domain. See [Persistent Log Files](docs/DEPLOYMENT.md#persistent-log-files) to remove older lines.

- **A specially crafted email address could make the server stop responding for minutes.** An address over 254 characters is refused.

- **A specially crafted atmosphere setting could make the server stop responding for minutes.**

- **A specially crafted hit dice entry on a character sheet could freeze the browser of anyone who opened the sheet.**

- **Restoring a specially crafted backup from the Admin Panel could make the server stop responding.**

- **A very large map can no longer take the whole server down.** Maps are 1 to 500 squares a side, with a grid of 10 to 500 pixels and 1 to 100 feet a square; a larger older map still opens.

- **One map can no longer be grown until the server stalls.** A map holds up to 1,000 tokens and a stat block up to 64 KB; a map that has more keeps them.

- **A wall placed absurdly far away can no longer freeze the server.** Walls and lights may reach up to 500 grid squares past the map's edge.

- **A crafted campaign archive can no longer crash the server.** An archive listing more than 1,000 files is refused.

- **Campaign imports and exports are limited per person:** 20 previews, 20 imports and 20 exports an hour, one at a time, set with the optional `CAMPAIGN_ARCHIVE_RATE_LIMIT`. See [Campaign Import and Export Limits](docs/DEPLOYMENT.md#campaign-import-and-export-limits).

- **Campaign imports take only the files an upload would.**

## [1.5.0] - 2026-10-03

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

- **Fog of war now hides the map completely.** Players see solid black where nothing has been revealed; existing maps keep fog on, with the same areas revealed.
- **Existing lit maps keep line-of-sight lighting.** They get **Global Illumination** switched on; turn it off in Edit Map or the Lights panel when you want lights and darkvision to matter.
- **A player or spectator with no token on a lit map sees nothing.** To let a spectator watch a lit map, turn dynamic lighting off for that map.
- **Players' maps remember explored areas,** in grey, on lit maps. It is on for existing maps.
- **A token belongs to whoever is set as its controller.** If a player should have a token set to **Nobody (DM controls)**, choose them in **Edit Token → Controlled By**.
- **Character sheets drop fields their game system does not define,** the next time each sheet is saved. Older fields are moved to where the sheet reads them first.

#### What to do afterwards, if it applies to you

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

- **Obscure a token's identity.** Right-click a token for **Obscure Identity**: players who do not control it see a grey shape called "Unknown creature", and nothing else about it reaches their browsers. See [Obscuring a Token's Identity](docs/DM_GUIDE.md#obscuring-a-tokens-identity).

- **Maps remember what each player has explored.** **Remember Explored Areas** in Edit Map turns it on for a map, and **Reset explored areas** in the Fog of War panel clears it. See [Explored Areas](docs/DM_GUIDE.md#explored-areas).

- **Tokens have darkvision,** set in grid squares in the Token Manager or Edit Token. See [Darkvision](docs/DM_GUIDE.md#darkvision).

- **Preview the map through a token,** or **All player tokens** for the whole party. See [Previewing the Player View](docs/DM_GUIDE.md#previewing-the-player-view).

- **The DM can delete the campaign's own documents** from the Campaign documents panel.

- **Fog of war can be turned on or off for each map,** at the top of the Fog of War panel or in Edit Map. See [Turning Fog On or Off](docs/DM_GUIDE.md#turning-fog-on-or-off).

- **Each vibe period can play its own music,** chosen in the period editor. Notes typed into the old audio box are dropped the next time the periods are saved.

### Changed

- **Tied initiative keeps the order combatants were added in.**

- **Dynamic lighting limits what players see.** A player sees what their tokens' darkvision reaches and what a light lights. **Global Illumination** keeps the older line-of-sight behaviour, and is on for maps made before this release. See [Enabling Dynamic Lighting](docs/DM_GUIDE.md#enabling-dynamic-lighting).

- **Preview Player View shows one chosen player's view.**

- **New maps start with fog of war off.**

- **The Creature Library and Token Templates buttons have their own icons,** a skull and a stamp.

- **Spectators can chat but can no longer roll dice.**

### Fixed

- **Deleting an account works.** The person's chat, rolls and uploads stay, no longer linked to anyone. A campaign they created with no other DM must be handed over or deleted first.

- **Display names are checked by the server,** 1 to 50 characters.

- **A new instance gets exactly one first administrator.**

- **Accepting an invitation brings only characters that can join that campaign.**

- **Character sheets store only the fields their game system defines.**

- **Saving a sheet no longer undoes hit point changes the DM made.**

- **A save refused over a bad value keeps your edits.**

- **An emptied text box no longer stops a sheet saving.**

- **D&D 5e characters made before 1.3.0 show their proficiencies and languages.**

- **A D&D 5e character without spellcasting details can be saved.**

- **Pathfinder 2e spells no longer stop a sheet saving.**

- **Pathfinder 2e spell slots show how many are used.**

- **Pathfinder 2e feat descriptions show on the read-only sheet.**

- **Call of Cthulhu skills inside a group can be edited.**

- **Call of Cthulhu possession notes keep their dashes.**

- **A short colour code such as `#fff` works as a sheet's header colour.**

- **Screen readers can reach the character sheet and its editor.**

- **The editor that opens over a character sheet asks "Discard Changes?" only when you have changed something.**

- **Escape no longer throws away edits in the sheet editor.**

- **The Characters page shows a sheet as it was last saved.**

- **Leaving a Flexible sheet with unsaved changes asks first.**

- **Being signed out no longer loses the changes in a character sheet editor.**

- **A character sheet editor with unsaved changes keeps you signed in.**

- **Fog of war hides the map from players.**

- **Players see lighting changes straight away.**

- **The screen and the server agree on what a player can see.**

- **Move to Map… includes maps made after the page loaded.**

- **The Map Library remembers which map the table is on.**

- **Wall and fog changes made through the API reach players' open maps at once.**

- **Revealed fog no longer looks lost after a refresh.**

- **A map with no picture says so:** "This map has no picture".

- **Light edges fade softly.**

- **Carrying a player's token no longer reveals the map to them.**

- **A token picked up and put back returns for everyone.**

- **The Token Templates list shows each template's picture.**

- **Any token can be hidden from the right-click menu.**

- **A token moved to another map keeps all its details.**

- **Moving several tokens between maps no longer loses or doubles any.**

- **A moved token keeps its initiative entry, and the table stays on its map.**

- **A player's token is the one they control, on screen as on the server.**

- **The page keeps its member list up to date as people join, leave or change role.**

- **Refused changes to a token now say why.**

- **Creatures and token templates with unrecognised values can be placed.**

- **The initiative tracker follows the token.**

- **Rolling or typing initiative works for a combatant on another map.**

- **Removing the last combatant ends the fight.**

- **A roll that finishes after the fight ends, or after its combatant is removed, no longer brings either back.**

- **A combatant whose token or map is deleted now leaves the order.**

- **Resuming a paused session keeps what the DM did during the break.**

- **Role changes take effect on open pages at once.**

- **Messages and rolls sent by others during a reconnect are no longer missed.**

- **A player no longer falls behind after a dropped connection.**

- **The connection badge shows Connected after the server closes and reopens a connection.**

- **A game table whose sign-in has ended goes to the sign-in page.**

- **Deleting a campaign removes everyone still on it from its live game.**

- **A brief database error while telling the table about a change no longer reports a saved change as failed.**

- **The vibe tracker says when it is off.**

- **The vibe period editor keeps its buttons on screen.**

- **Player Preview looks only through tokens the players would have.**

- **Player Preview hides the DM's light markers.**

- **Backups made from the Admin Dashboard restore again,** including backups made on 1.4.0 and backups from an older version into a newer one.

- **A restore checks the file first and keeps a copy of what it replaces.**

- **The command-line restore script no longer deletes your database before the backup has loaded.**

- **Long backups and restores no longer show as failed while still running.**

- **A backup appears in the list only once it is complete.**

- **Two backups made in the same second no longer overwrite each other.**

- **A backup that fails while being written no longer stops the backend.**

- **A backups folder the backend cannot use is reported by name.**

- **The restore script explains a full temporary folder.**

- **The message shown when the backup tools are missing names the right fix.**

- **Malformed requests from scripts get a message that says what is wrong.**

- **A map whose picture was deleted before the campaign was exported now imports without a picture.**

- **`SESSION_MAX_AGE`, `REMEMBER_ME_MAX_AGE` and `LOG_LEVEL` in `.env` now work on Docker.** Use `docker compose up -d` after changing `.env`; `docker compose restart` keeps the old settings.

- **The bundled web server forwards `/health` to the backend,** which answers 503 when the database is unreachable.

- **The deployment guide covers backups behind your own proxy.**

- **Above a PDF, the document reader now says "Not showing?" and links to open it in a new tab.**

- **Imported tokens and token templates are held to the same limits as ones placed by hand.**

- **Imported tokens whose picture was not in the archive import with no picture.**

- **The API's character validation check reports real problems.**

- **Guides and in-app text corrected.**

- **Developer documentation corrections.**

### Security

- **A profile picture can only point at that user's own uploaded avatar.**

- **A page on another address can no longer act as you.** A request that changes something, and a live game connection, must come from the address in `CORS_ORIGIN`.

- **MFA backup codes are harder to guess and stored like passwords.** Existing codes stop working; regenerate them.

- **A backup code works only once, even when two sign-ins use it at the same moment.**

- **An authenticator code works only once, and wrong codes are limited per account.**

- **Setting up MFA, turning it off and regenerating backup codes have attempt limits.**

- **Changing an email address through the API, or turning on MFA, needs your current password.**

- **Only the newest password-reset or invitation link works.**

- **The forgot-password page no longer gives away which addresses have accounts by how long it takes.**

- **Ending a sign-in closes its live game connections too.**

- **Deleting your own account signs it out on every device.**

- **An instance can no longer lose its last administrator.**

- **An account registered while admin approval is required cannot sign in before it is approved.**

- **Each sign-in starts a new session.**

- **One password rule everywhere: at least 12 characters, with an uppercase letter, a lowercase letter, a number and a special character.** Passwords already set are not affected.

- **Names and descriptions typed by users appear as plain text in emails.**

- **The Creature Library's homebrew count covers only your campaign.**

- **Saving someone else's character no longer reveals its game system.**

- **Maps the DM has not shown yet are private to the DM.** Players and spectators get only the campaign's current map.

- **Players are not told about combatants on a map the table is not showing.**

- **A removed player's characters leave the campaign with them.**

- **A former member can no longer delete or move campaign assets they uploaded.**

- **Deleting a campaign hands its library to the uploaders and deletes the campaign in one step.**

- **Only the DM can add assets to a campaign's library, by uploading or by moving.** Players may still add token art.

- **A picture can only be used by someone allowed to read it.**

- **Exports include only files the person exporting may open.**

- **The creature and token template libraries can be read only by the DM.**

- **The campaign overview no longer shows players a map's spirit-layer image address.**

- **Campaign settings are checked before they are saved.**

- **Only the DM's chat messages are shown as DM messages.**

- **A live connection is only ever in one campaign.**

- **Repeated requests can no longer slow the server down.**

- **Players are sent only what they may see of a token.** A creature with its HP bar off no longer looks downed to players at zero hit points.

- **The initiative tracker no longer shows players exact hit points or hidden creatures.**

- **An obscured token no longer reveals its controller, kind, facing or stored initiative to other players.**

- **Rolling initiative for a hidden creature is no longer announced to every player.**

- **Token moves reach only the players who would be sent the token.**

- **Revealing a token from the Spirit Layer panel no longer sends players its notes and position.**

- **Every token field is checked before it is stored, and a token can be bound only to a character in its own campaign.**

- **A spectator never controls a token and cannot change a character.**

- **A spectator cannot move or edit a token through the API, and only the DM can resize a token.**

- **A player opening or closing a door can only change whether it is open.**

- **Pausing or ending a session stops players moving tokens on the server as well as in the browser.**

- **Branding image paths containing a backslash or a control character are refused.**

- **A character sheet's header colour is used only if it is a preset or a `#RRGGBB` colour.**

- **Atmosphere filters and the spirit realm's custom colour are checked before use.**

- **A crafted backup file can no longer run shell commands in the backend container.** A backup is still SQL the database runs with full rights, so restore only backups made on an instance you trust.

- **Backups no longer contain sign-in sessions, and a restore signs everyone out.** After the command-line restore script, restart the backend.

- **Backups are readable only by the backend's user.** On Docker, copying a dashboard backup off the server by hand needs `sudo`.

- **The database password no longer shows in the server's process list during a backup or restore.**

- **Backups are kept outside the uploads folder,** in `backend/backups/`.

- **A production instance refuses to start with the placeholder database password.** See [Changing the database password](docs/DEPLOYMENT.md#changing-the-database-password).

- **The bundled nginx no longer saves a huge upload to the restore address from anyone who sends one.**

- **Behind a Cloudflare Tunnel or another proxy, one person's wrong passwords no longer lock everyone out.** See [Visitor addresses and sign-in limits](docs/DEPLOYMENT.md#visitor-addresses-and-sign-in-limits).

- **Dependencies updated for published advisories.** The unused OpenAI client library is removed.

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
