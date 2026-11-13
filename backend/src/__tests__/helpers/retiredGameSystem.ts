/**
 * The value of the unreleased game system the GameSystem enum held until
 * 1.7.0's migration gave its rows no system and dropped it. Tests give it to
 * a request, an archive or a row stored before the migration, to show it is
 * read as no system at all. The migration's test checks it was the enum's.
 */

export { RETIRED_GAME_SYSTEM } from '../../legacy/retiredGameSystem';
