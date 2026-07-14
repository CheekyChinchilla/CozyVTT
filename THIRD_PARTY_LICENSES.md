# Third-Party Licenses

## Fonts

CozyVTT uses open-source fonts served via [Google Fonts](https://fonts.google.com/). All fonts are licensed under the **SIL Open Font License 1.1** (OFL-1.1) unless noted otherwise.

| Font | Designer | License |
|------|----------|---------|
| [Quicksand](https://fonts.google.com/specimen/Quicksand) | Andrew Paglinawan | OFL-1.1 |
| [Inter](https://fonts.google.com/specimen/Inter) | Rasmus Andersson | OFL-1.1 |
| [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) | JetBrains | OFL-1.1 |
| [Comfortaa](https://fonts.google.com/specimen/Comfortaa) | Johan Aakerlund | OFL-1.1 |
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
| [Open Sans](https://fonts.google.com/specimen/Open+Sans) | Steve Matteson | OFL-1.1 |

### SIL Open Font License 1.1

The SIL Open Font License (OFL) allows fonts to be used, studied, modified, and redistributed freely as long as they are not sold by themselves. The full license text is available at: https://scripts.sil.org/OFL

## Game Content

CozyVTT includes creature data from the [Open5e](https://open5e.com/) SRD API, which is based on the Systems Reference Document 5.1 published by Wizards of the Coast under the Creative Commons Attribution 4.0 International License (CC BY 4.0).

## Icons

UI icons are provided by [Lucide](https://lucide.dev/), licensed under the ISC License.

## Campaign Export/Import Libraries

| Package | Purpose | License |
|---------|---------|---------|
| [archiver](https://github.com/archiverjs/node-archiver) | ZIP archive creation for campaign export | MIT |
| [unzipper](https://github.com/ZJONSSON/node-unzipper) | ZIP archive extraction for campaign import | MIT |
| [file-type](https://github.com/sindresorhus/file-type) | Magic byte detection for asset file validation | MIT |

## Core Application Libraries

CozyVTT is built on widely-used open-source libraries distributed under permissive licenses (MIT, ISC, and Apache-2.0). This is not an exhaustive list — the complete dependency tree and each package's license are recorded in `backend/package-lock.json` and `frontend/package-lock.json`.

| Package | Purpose | License |
|---------|---------|---------|
| [React](https://react.dev/) | Frontend UI library | MIT |
| [Vite](https://vitejs.dev/) | Frontend build tooling | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | Live session state store | MIT |
| [TanStack Query](https://tanstack.com/query) | REST data fetching / caching | MIT |
| [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) | Resizable session workspace | MIT |
| [Framer Motion](https://www.framer.com/motion/) | Animations | MIT |
| [Express](https://expressjs.com/) | Backend HTTP framework | MIT |
| [Prisma](https://www.prisma.io/) | Database ORM | Apache-2.0 |
| [Socket.IO](https://socket.io/) | Real-time WebSocket transport | MIT |
| [Zod](https://zod.dev/) | Runtime validation | MIT |
