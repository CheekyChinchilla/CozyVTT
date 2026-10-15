# Third-Party Licenses

## Fonts

CozyVTT bundles the open-source fonts its font choices use, and each instance serves them itself: visitors' browsers do not fetch them from another site. The files are the [Google Fonts](https://fonts.google.com/) builds of each family, kept in `frontend/src/assets/fonts/`. All of them are licensed under the **SIL Open Font License 1.1** (OFL-1.1); each family's copyright notice and the full licence text are in [`frontend/src/assets/fonts/OFL.txt`](frontend/src/assets/fonts/OFL.txt) and in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).

| Font | Designer | License |
|------|----------|---------|
| [Quicksand](https://fonts.google.com/specimen/Quicksand) | Andrew Paglinawan | OFL-1.1 |
| [Inter](https://fonts.google.com/specimen/Inter) | Rasmus Andersson | OFL-1.1 |
| [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) | JetBrains | OFL-1.1 |
| [MedievalSharp](https://fonts.google.com/specimen/MedievalSharp) | Wojciech Kalinowski | OFL-1.1 |
| [Merriweather](https://fonts.google.com/specimen/Merriweather) | Sorkin Type | OFL-1.1 |
| [Playfair Display](https://fonts.google.com/specimen/Playfair+Display) | Claus Eggers Sorensen | OFL-1.1 |
| [Lora](https://fonts.google.com/specimen/Lora) | Cyreal | OFL-1.1 |
| [Poppins](https://fonts.google.com/specimen/Poppins) | Indian Type Foundry | OFL-1.1 |
| [Nunito](https://fonts.google.com/specimen/Nunito) | Vernon Adams et al. | OFL-1.1 |
| [Fira Code](https://fonts.google.com/specimen/Fira+Code) | Nikita Prokopov | OFL-1.1 |
| [Caveat](https://fonts.google.com/specimen/Caveat) | Impallari Type | OFL-1.1 |
| [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand) | Patrick Wagesreiter | OFL-1.1 |
| [Raleway](https://fonts.google.com/specimen/Raleway) | Multiple designers | OFL-1.1 |
| [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3) | Paul D. Hunt | OFL-1.1 |
| [Source Code Pro](https://fonts.google.com/specimen/Source+Code+Pro) | Paul D. Hunt | OFL-1.1 |
| [Cinzel](https://fonts.google.com/specimen/Cinzel) | Natanael Gama | OFL-1.1 |
| [EB Garamond](https://fonts.google.com/specimen/EB+Garamond) | Georg Duffner | OFL-1.1 |
| [UnifrakturMaguntia](https://fonts.google.com/specimen/UnifrakturMaguntia) | j. 'mach' wust | OFL-1.1 |
| [Crimson Text](https://fonts.google.com/specimen/Crimson+Text) | Sebastian Kosch | OFL-1.1 |

Comfortaa and Open Sans are named as fallbacks in the default font choice. They are not bundled, and are used only on a device that has them installed.

### SIL Open Font License 1.1

The SIL Open Font License (OFL) allows fonts to be used, studied, modified, and redistributed freely as long as they are not sold by themselves. The full licence text is in [`frontend/src/assets/fonts/OFL.txt`](frontend/src/assets/fonts/OFL.txt), and at https://scripts.sil.org/OFL.

## Game Content

CozyVTT ships no game content. An administrator can import creature data from the [Open5e](https://open5e.com/) SRD API into an instance's own database; it comes from the System Reference Document 5.1, published by Wizards of the Coast under the Creative Commons Attribution 4.0 International License (CC BY 4.0). See [SRD_ATTRIBUTION.md](SRD_ATTRIBUTION.md).

## Icons

UI icons are provided by [Lucide](https://lucide.dev/), licensed under the ISC License (Copyright (c) Lucide Icons and Contributors). The icons Lucide derives from [Feather](https://github.com/feathericons/feather) are under the MIT License (Copyright (c) 2013-present Cole Bemis).

## Campaign Export/Import Libraries

| Package | Purpose | License |
|---------|---------|---------|
| [archiver](https://github.com/archiverjs/node-archiver) | ZIP archive creation for campaign export | MIT |
| [unzipper](https://github.com/ZJONSSON/node-unzipper) | ZIP archive extraction for campaign import | MIT |
| [file-type](https://github.com/sindresorhus/file-type) | Magic byte detection for asset file validation | MIT |

## Core Application Libraries

CozyVTT is built on widely-used open-source libraries distributed under permissive licenses (MIT, ISC, and Apache-2.0). The Prisma command-line tool also brings a few packages under EPL-2.0 and the Unlicense into the backend image, unmodified; [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) names them. This is not an exhaustive list — the complete dependency tree and each package's license are recorded in `backend/package-lock.json` and `frontend/package-lock.json`.

| Package | Purpose | License |
|---------|---------|---------|
| [React](https://react.dev/) | Frontend UI library | MIT |
| [React Router](https://reactrouter.com/) | Moves between the app's pages (8.x) | MIT |
| [Vite](https://vitejs.dev/) | Frontend build tooling | MIT |
| [Playwright](https://playwright.dev/) | Browser smoke tests, for development only; not part of an instance | Apache-2.0 |
| [Zustand](https://github.com/pmndrs/zustand) | Live session state store | MIT |
| [TanStack Query](https://tanstack.com/query) | REST data fetching / caching | MIT |
| [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) | Resizable session workspace | MIT |
| [Framer Motion](https://motion.dev/) | Animations | MIT |
| [react-markdown](https://github.com/remarkjs/react-markdown) | Renders personal notes and documents written in Markdown | MIT |
| [remark-gfm](https://github.com/remarkjs/remark-gfm) | Tables, strikethrough, task lists and autolinks in that Markdown | MIT |
| [remark-breaks](https://github.com/remarkjs/remark-breaks) | A single newline as a line break in that Markdown | MIT |
| [Express](https://expressjs.com/) | Backend HTTP framework | MIT |
| [Multer](https://github.com/expressjs/multer) | Reads uploaded files and forms on the backend | MIT |
| [Prisma](https://www.prisma.io/) | Database ORM (7.x) and the tool that applies database migrations, with `@prisma/adapter-pg`, which connects it through the `pg` driver, also Apache-2.0 | Apache-2.0 |
| [Socket.IO](https://socket.io/) | Real-time WebSocket transport | MIT |
| [Zod](https://zod.dev/) | Runtime validation | MIT |
| [otplib](https://github.com/yeojz/otplib) | Authenticator (two-factor) codes, with its `@otplib/*` parts and the `@noble/hashes` and `@scure/base` they use, all MIT | MIT |
| [sharp](https://github.com/lovell/sharp) | Picture thumbnails, and picture sizes for Universal VTT export | Apache-2.0 |

The tools that only build the app include [Lightning CSS](https://lightningcss.dev/), which Vite uses to minify the stylesheets, under the Mozilla Public License 2.0 (MPL-2.0). It runs unmodified while the app is built, and none of its code is part of an instance.
