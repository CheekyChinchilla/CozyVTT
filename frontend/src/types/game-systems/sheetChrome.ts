/**
 * Fields the app stores on every character sheet, whatever the game system.
 *
 * `themeColor` is the header colour chosen in the editor: a preset name or a
 * `#RRGGBB` colour. No game system defines it, so every system's server-side
 * schema declares it explicitly. The server stores the parsed sheet, and a
 * key no schema declares does not survive a save. Each system's sheet type
 * extends this, so the field is declared once.
 */
export interface SheetChrome {
  themeColor?: string;
}
