/**
 * Every route the server answers has a test that sends a request to it, or is
 * listed as not having one yet.
 *
 * The route list is read from the app itself, as createApp (src/app.ts)
 * builds it for the server and the test app alike, so a new route fails this
 * file until someone writes its test and adds it to TESTED, or knowingly adds
 * it to UNTESTED. UNTESTED is a list to shrink: those routes are where a
 * broken permission check would go unnoticed. A test file that sends a
 * request to one of them fails this file too, until the route moves to
 * TESTED, so the list cannot go on claiming a route nobody tests.
 *
 * TESTED names one test file per route that sends a request to it. One is
 * enough to find the tests; it is not a claim that every case is covered.
 */

import fs from 'fs';
import path from 'path';
import { createTestApp } from '../../__tests__/helpers/test-app';
import { mountedRoutes, routeKey } from '../../__tests__/helpers/routeInventory';

const SRC = path.resolve(__dirname, '../..');

/** Route, and a test file under backend/src that sends a request to it. */
const TESTED: Record<string, string> = {
  'GET /health': 'routes/__tests__/auth.e2e.test.ts',
  'GET /api/config': 'routes/__tests__/uploadLimitsConfig.e2e.test.ts',
  'POST /api/auth/register': 'routes/__tests__/registrationApproval.e2e.test.ts',
  'POST /api/auth/login': 'websocket/__tests__/liveSessionsEnd.integration.test.ts',
  'POST /api/auth/logout': 'websocket/__tests__/liveSessionsEnd.integration.test.ts',
  'GET /api/auth/me': 'websocket/__tests__/liveSessionsEnd.integration.test.ts',
  'POST /api/auth/forgot-password': 'routes/__tests__/authMalformedInput.e2e.test.ts',
  'POST /api/auth/reset-password': 'websocket/__tests__/liveSessionsEnd.integration.test.ts',
  'POST /api/auth/change-password': 'websocket/__tests__/liveSessionsEnd.integration.test.ts',
  'DELETE /api/auth/account': 'routes/__tests__/accessRevocation.e2e.test.ts',
  'POST /api/auth/mfa/setup': 'routes/__tests__/mfaEnrolment.e2e.test.ts',
  'POST /api/auth/mfa/verify': 'routes/__tests__/mfaEnrolment.e2e.test.ts',
  'POST /api/auth/mfa/verify-login': 'routes/__tests__/mfaCodeReplay.e2e.test.ts',
  'POST /api/auth/mfa/disable': 'routes/__tests__/mfaCodeReplay.e2e.test.ts',
  'POST /api/auth/mfa/backup-codes': 'routes/__tests__/signInLimiter.e2e.test.ts',
  'GET /api/auth/ping': 'routes/__tests__/auth.e2e.test.ts',
  'GET /api/auth/appearance': 'routes/__tests__/passwordChangeGate.e2e.test.ts',
  'GET /api/admin/settings': 'routes/__tests__/adminBranding.e2e.test.ts',
  'PUT /api/admin/settings': 'routes/__tests__/adminBranding.e2e.test.ts',
  'GET /api/admin/config': 'routes/__tests__/uploadLimitsConfig.e2e.test.ts',
  'POST /api/admin/backups': 'routes/__tests__/backupRestore.e2e.test.ts',
  'GET /api/admin/backups': 'routes/__tests__/backupRestore.e2e.test.ts',
  'POST /api/admin/backups/restore': 'routes/__tests__/backupRestore.e2e.test.ts',
  'GET /api/campaigns/:campaignId': 'routes/__tests__/campaignMapMeta.e2e.test.ts',
  'GET /api/campaigns/:campaignId/characters': 'routes/__tests__/characterCampaignAssignment.e2e.test.ts',
  'PUT /api/campaigns/:campaignId': 'routes/__tests__/atmosphereTrackWrite.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/vibe': 'routes/__tests__/atmosphereTrackWrite.e2e.test.ts',
  'DELETE /api/campaigns/:campaignId': 'routes/__tests__/campaignDeleteAssets.e2e.test.ts',
  'POST /api/campaigns/:campaignId/invite': 'routes/__tests__/campaignInvite.e2e.test.ts',
  'GET /api/campaigns/:campaignId/invitable-users': 'routes/__tests__/invitableUsers.e2e.test.ts',
  'GET /api/character-templates/:id': 'routes/__tests__/characterTemplates.e2e.test.ts',
  'GET /api/assets/avatars/:userId': 'routes/__tests__/avatarReplace.e2e.test.ts',
  'POST /api/campaigns/:campaignId/creatures/seed': 'routes/__tests__/srdSeedRoute.e2e.test.ts',
  'DELETE /api/campaigns/:campaignId/members/:userId': 'routes/__tests__/campaignOwnerRemoval.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/members/:userId/role': 'websocket/__tests__/initiativeResend.integration.test.ts',
  'PUT /api/campaigns/:campaignId/dm': 'routes/__tests__/campaignOwnerRemoval.e2e.test.ts',
  'GET /api/campaigns/:campaignId/messages': 'routes/__tests__/campaignMessages.e2e.test.ts',
  'DELETE /api/campaigns/:campaignId/messages/join-leave': 'routes/__tests__/clearJoinLeaveMessages.e2e.test.ts',
  'GET /api/campaigns/:campaignId/dice-rolls': 'routes/__tests__/campaignDiceRolls.e2e.test.ts',
  'GET /api/campaigns/:campaignId/notes': 'routes/__tests__/personalNotes.e2e.test.ts',
  'POST /api/campaigns/:campaignId/notes': 'routes/__tests__/personalNotes.e2e.test.ts',
  'GET /api/campaigns/:campaignId/notes/:noteId': 'routes/__tests__/personalNotes.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/notes/:noteId': 'routes/__tests__/personalNotes.e2e.test.ts',
  'DELETE /api/campaigns/:campaignId/notes/:noteId': 'routes/__tests__/personalNotes.e2e.test.ts',
  'GET /api/campaigns/left': 'routes/__tests__/leftCampaignNotes.e2e.test.ts',
  'GET /api/campaigns/left/:campaignId': 'routes/__tests__/leftCampaignNotes.e2e.test.ts',
  'GET /api/campaigns/left/:campaignId/notes': 'routes/__tests__/leftCampaignNotes.e2e.test.ts',
  'GET /api/campaigns/left/:campaignId/notes/:noteId': 'routes/__tests__/leftCampaignNotes.e2e.test.ts',
  'GET /api/campaigns/:campaignId/sessions': 'routes/__tests__/sessionHistory.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/sessions/:sessionId/notes': 'routes/__tests__/sessionHistory.e2e.test.ts',
  'POST /api/campaigns/:campaignId/sessions': 'routes/__tests__/sessionResume.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/sessions/:sessionId/pause': 'routes/__tests__/sessionResume.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/resume': 'routes/__tests__/sessionResume.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/sessions/:sessionId/end': 'routes/__tests__/sessionLifecycle.e2e.test.ts',
  'GET /api/campaigns/:campaignId/export': 'routes/__tests__/campaignArchiveLimits.e2e.test.ts',
  'POST /api/campaigns/import/preview': 'routes/__tests__/campaignImportBounds.e2e.test.ts',
  'POST /api/campaigns/import': 'routes/__tests__/campaignImportAllowlist.e2e.test.ts',
  'GET /api/campaigns/:campaignId/macros': 'routes/__tests__/diceMacros.e2e.test.ts',
  'POST /api/campaigns/:campaignId/macros': 'routes/__tests__/diceMacros.e2e.test.ts',
  'GET /api/campaigns/:campaignId/macros/:macroId': 'routes/__tests__/diceMacros.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/macros/:macroId': 'routes/__tests__/diceMacros.e2e.test.ts',
  'DELETE /api/campaigns/:campaignId/macros/:macroId': 'routes/__tests__/diceMacros.e2e.test.ts',
  'GET /api/campaigns/:campaignId/documents': 'routes/__tests__/campaignDocuments.e2e.test.ts',
  'POST /api/campaigns/:campaignId/documents': 'routes/__tests__/campaignDocuments.e2e.test.ts',
  'DELETE /api/campaigns/:campaignId/documents/:assetId': 'routes/__tests__/campaignDocuments.e2e.test.ts',
  'GET /api/campaigns/:campaignId/creatures/seed/status': 'routes/__tests__/creatureCampaignScope.e2e.test.ts',
  'GET /api/campaigns/:campaignId/creatures': 'routes/__tests__/creatures.e2e.test.ts',
  'GET /api/campaigns/:campaignId/creatures/:creatureId': 'routes/__tests__/creatures.e2e.test.ts',
  'POST /api/campaigns/:campaignId/creatures': 'routes/__tests__/creatures.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/creatures/:creatureId': 'routes/__tests__/creatures.e2e.test.ts',
  'DELETE /api/campaigns/:campaignId/creatures/:creatureId': 'routes/__tests__/creatures.e2e.test.ts',
  'POST /api/campaigns/:campaignId/creatures/:creatureId/duplicate': 'routes/__tests__/creatureCampaignScope.e2e.test.ts',
  'GET /api/campaigns/:campaignId/creatures/favorites/list': 'routes/__tests__/creatures.e2e.test.ts',
  'POST /api/campaigns/:campaignId/creatures/:creatureId/favorite': 'routes/__tests__/creatures.e2e.test.ts',
  'GET /api/campaigns/:campaignId/token-templates': 'routes/__tests__/tokenTemplates.e2e.test.ts',
  'GET /api/campaigns/:campaignId/token-templates/:id': 'routes/__tests__/tokenTemplates.e2e.test.ts',
  'POST /api/campaigns/:campaignId/token-templates': 'routes/__tests__/tokenTemplates.e2e.test.ts',
  'POST /api/campaigns/:campaignId/token-templates/:id/copy-to/:targetCampaignId': 'routes/__tests__/assetReferenceChecks.e2e.test.ts',
  'POST /api/campaigns/:campaignId/maps': 'routes/__tests__/mapSizeInput.e2e.test.ts',
  'GET /api/campaigns/:campaignId/maps': 'routes/__tests__/mapSettings.e2e.test.ts',
  'POST /api/campaigns/:campaignId/maps/import-uvtt': 'routes/__tests__/mapSizeInput.e2e.test.ts',
  'GET /api/campaigns/:campaignId/maps/:id/export-uvtt': 'routes/__tests__/exportReferenceChecks.e2e.test.ts',
  'GET /api/campaigns/:campaignId/maps/:id': 'routes/__tests__/spectatorNeverControls.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/maps/:id': 'routes/__tests__/mapSizeInput.e2e.test.ts',
  'DELETE /api/campaigns/:campaignId/maps/:id': 'websocket/__tests__/initiativeResend.integration.test.ts',
  'PUT /api/campaigns/:campaignId/maps/:id/set-current': 'websocket/__tests__/initiativeResend.integration.test.ts',
  'POST /api/campaigns/:campaignId/maps/:id/tokens': 'routes/__tests__/spectatorNeverControls.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/maps/:id/tokens/:tokenId': 'websocket/__tests__/initiativeResend.integration.test.ts',
  'POST /api/campaigns/:campaignId/maps/:id/tokens/move': 'routes/__tests__/mapTokenLimits.e2e.test.ts',
  'DELETE /api/campaigns/:campaignId/maps/:id/tokens/:tokenId': 'websocket/__tests__/initiativeResend.integration.test.ts',
  'GET /api/campaigns/:campaignId/maps/:id/walls': 'routes/__tests__/preparedMapsDmOnly.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/maps/:id/walls': 'routes/__tests__/wallLightBounds.e2e.test.ts',
  'POST /api/campaigns/:campaignId/maps/:id/walls': 'routes/__tests__/wallRestBroadcast.e2e.test.ts',
  'DELETE /api/campaigns/:campaignId/maps/:id/walls/:sid': 'routes/__tests__/mapEditLocking.e2e.test.ts',
  'PATCH /api/campaigns/:campaignId/maps/:id/walls/:sid': 'routes/__tests__/mapEditLocking.e2e.test.ts',
  'GET /api/campaigns/:campaignId/maps/:id/lights': 'routes/__tests__/preparedMapsDmOnly.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/maps/:id/lights': 'routes/__tests__/wallLightBounds.e2e.test.ts',
  'POST /api/campaigns/:campaignId/maps/:id/lights': 'routes/__tests__/preparedMapBroadcasts.e2e.test.ts',
  'PATCH /api/campaigns/:campaignId/maps/:id/lights/:lightId': 'routes/__tests__/mapEditLocking.e2e.test.ts',
  'DELETE /api/campaigns/:campaignId/maps/:id/lights/:lightId': 'routes/__tests__/mapEditLocking.e2e.test.ts',
  'GET /api/campaigns/:campaignId/maps/:id/fog': 'routes/__tests__/mapSizeLimits.e2e.test.ts',
  'POST /api/campaigns/:campaignId/maps/:id/fog/operation': 'routes/__tests__/fogRest.e2e.test.ts',
  'PUT /api/campaigns/:campaignId/maps/:id/lighting': 'routes/__tests__/mapSettings.e2e.test.ts',
  'POST /api/characters': 'routes/__tests__/characterValidate.e2e.test.ts',
  'GET /api/characters/:id': 'routes/__tests__/memberRemovalCharacters.e2e.test.ts',
  'GET /api/characters/:id/validate': 'routes/__tests__/characterValidate.e2e.test.ts',
  'PUT /api/characters/:id': 'websocket/__tests__/initiativeResend.integration.test.ts',
  'POST /api/characters/:id/assign': 'routes/__tests__/assignAndInviteInput.e2e.test.ts',
  'GET /api/character-templates': 'routes/__tests__/characterTemplates.e2e.test.ts',
  'POST /api/character-templates': 'routes/__tests__/characterTemplates.e2e.test.ts',
  'PUT /api/character-templates/:id': 'routes/__tests__/characterTemplates.e2e.test.ts',
  'DELETE /api/character-templates/:id': 'routes/__tests__/characterTemplates.e2e.test.ts',
  'PUT /api/users/:id': 'websocket/__tests__/liveSessionsEnd.integration.test.ts',
  'DELETE /api/users/:id': 'websocket/__tests__/liveSessionsEnd.integration.test.ts',
  'POST /api/users/:id/reset-password': 'websocket/__tests__/liveSessionsEnd.integration.test.ts',
  'GET /api/assets': 'routes/__tests__/assetScopeAndReferences.e2e.test.ts',
  'POST /api/assets/upload': 'routes/__tests__/assetScopeAndReferences.e2e.test.ts',
  'GET /api/assets/:id': 'routes/__tests__/assetScopeAndReferences.e2e.test.ts',
  'DELETE /api/assets/:id': 'routes/__tests__/assetDelete.e2e.test.ts',
  'GET /api/assets/:id/download': 'routes/__tests__/campaignDocuments.e2e.test.ts',
  'POST /api/assets/documents': 'routes/__tests__/atmosphereTrackWrite.e2e.test.ts',
  'PUT /api/assets/documents/:id/content': 'routes/__tests__/assetScopeAndReferences.e2e.test.ts',
  'GET /api/assets/documents/:id': 'routes/__tests__/atmosphereTrackWrite.e2e.test.ts',
  'GET /api/assets/maps/:id': 'routes/__tests__/assetScopeAndReferences.e2e.test.ts',
  'GET /api/assets/tokens/:id': 'routes/__tests__/assetReferenceChecks.e2e.test.ts',
  'GET /api/assets/audio/:id': 'routes/__tests__/atmosphereAudioAccess.e2e.test.ts',
  'PATCH /api/assets/:id/scope': 'routes/__tests__/assetScopeAndReferences.e2e.test.ts',
  'POST /api/invitations/:id/accept': 'routes/__tests__/invitationAccept.e2e.test.ts',
  'GET /api/users': 'routes/__tests__/userRoutes.e2e.test.ts',
  'GET /api/users/:id': 'routes/__tests__/userRoutes.e2e.test.ts',
  'GET /api/users/:id/preferences': 'routes/__tests__/userRoutes.e2e.test.ts',
  'PUT /api/users/:id/preferences': 'routes/__tests__/userRoutes.e2e.test.ts',
  'POST /api/users/:id/send-reset-link': 'routes/__tests__/userRoutes.e2e.test.ts',
  'GET /api/admin/stats': 'routes/__tests__/adminRoutes.e2e.test.ts',
  'GET /api/admin/health': 'routes/__tests__/adminHealth.e2e.test.ts',
  'POST /api/admin/users': 'routes/__tests__/adminRoutes.e2e.test.ts',
  'POST /api/admin/users/invite': 'routes/__tests__/adminRoutes.e2e.test.ts',
  'POST /api/admin/users/:id/resend-invite': 'routes/__tests__/adminRoutes.e2e.test.ts',
  'POST /api/admin/users/:id/approve': 'routes/__tests__/adminRoutes.e2e.test.ts',
  'POST /api/admin/users/:id/reset-mfa': 'routes/__tests__/adminRoutes.e2e.test.ts',
  'GET /api/admin/activity': 'routes/__tests__/adminRoutes.e2e.test.ts',
  'POST /api/admin/smtp/test': 'routes/__tests__/adminRoutes.e2e.test.ts',
  'GET /api/admin/backups/:filename/download': 'routes/__tests__/adminRoutes.e2e.test.ts',
  'DELETE /api/admin/backups/:filename': 'routes/__tests__/adminRoutes.e2e.test.ts',
  'GET /api/admin/orphaned-files': 'routes/__tests__/orphanedFiles.e2e.test.ts',
  'DELETE /api/admin/orphaned-files': 'routes/__tests__/orphanedFiles.e2e.test.ts',
  'GET /api/campaigns/admin/all': 'routes/__tests__/adminRoutes.e2e.test.ts',
  'GET /api/campaigns': 'routes/__tests__/characterAndCampaignCreate.e2e.test.ts',
  'POST /api/campaigns': 'routes/__tests__/characterAndCampaignCreate.e2e.test.ts',
  'GET /api/characters': 'routes/__tests__/characterAndCampaignCreate.e2e.test.ts',
  'DELETE /api/characters/:id': 'routes/__tests__/characterAndCampaignCreate.e2e.test.ts',
  'POST /api/characters/:id/copy': 'routes/__tests__/characterAndCampaignCreate.e2e.test.ts',
  'GET /api/setup/status': 'routes/__tests__/setupWizard.e2e.test.ts',
  'POST /api/setup/init': 'routes/__tests__/setupWizard.e2e.test.ts',
  'GET /api/characters/templates/:gameSystem/:templateName': 'routes/__tests__/flexibleTemplateLookup.e2e.test.ts',
};

/** Routes no test sends a request to yet. Shrink this list; do not grow it. */
const UNTESTED: string[] = [
  'GET /api/auth/registration-status',
  'PUT /api/campaigns/:campaignId/token-templates/:id',
  'DELETE /api/campaigns/:campaignId/token-templates/:id',
  'POST /api/campaigns/:campaignId/token-templates/from-token',
  'GET /api/invitations',
  'POST /api/invitations/:id/decline',
];

const mounted = mountedRoutes(createTestApp()).map(routeKey);

it('reads the routes from the routers', () => {
  // A sanity floor, so a walk that silently found nothing cannot pass.
  expect(mounted.length).toBeGreaterThan(150);
  expect(mounted).toContain('GET /api/campaigns/:campaignId/maps/:id');
});

it('has every route either tested or listed as untested', () => {
  const unaccounted = mounted.filter((key) => !(key in TESTED) && !UNTESTED.includes(key));
  // A route here is new. Write a test that sends a request to it and add it
  // to TESTED with that file's path.
  expect(unaccounted).toEqual([]);
});

it('lists only routes that exist', () => {
  const stale = [...Object.keys(TESTED), ...UNTESTED].filter((key) => !mounted.includes(key));
  expect(stale).toEqual([]);
});

it('does not list a route as both tested and untested', () => {
  expect(UNTESTED.filter((key) => key in TESTED)).toEqual([]);
  expect(new Set(UNTESTED).size).toBe(UNTESTED.length);
});

it('names test files that exist', () => {
  const missing = Object.entries(TESTED)
    .filter(([, file]) => !fs.existsSync(path.join(SRC, file)))
    .map(([key, file]) => `${key}: ${file}`);
  expect(missing).toEqual([]);
});

it('reads the server\'s own app: server.ts adds nothing to what createApp builds', () => {
  const source = fs.readFileSync(path.join(SRC, 'server.ts'), 'utf8');
  expect(source).toMatch(/\bcreateApp\(/);
  expect(source).not.toMatch(/\bapp\.(use|get|post|put|patch|delete|all|route)\(/);
});

/** Every test file under backend/src, as path and text. */
function testFiles(dir: string = SRC): Array<[string, string]> {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry): Array<[string, string]> => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : testFiles(full);
    return /\.test\.ts$/.test(entry.name) ? [[path.relative(SRC, full), fs.readFileSync(full, 'utf8')]] : [];
  });
}

/**
 * A request to the route as the suites write one: `.put(` then a quoted or
 * template path, each `:param` standing for an id, a `${...}` or anything
 * else without a slash. A path built from a variable is not seen, so this
 * finds most new tests, not all.
 */
function requestTo(route: string): RegExp {
  const [method, routePath] = route.split(' ');
  const segments = routePath
    .split('/')
    .map((segment) => (segment.startsWith(':') ? '[^/\'"`\\s]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return new RegExp(`\\.${method.toLowerCase()}\\(\\s*['"\`]${segments.join('/')}['"\`?]`);
}

it('moves a route to TESTED once a test sends a request to it', () => {
  // This file's own examples below are not tests of the routes.
  const files = testFiles().filter(([file]) => path.join(SRC, file) !== __filename);
  const nowTested = UNTESTED.flatMap((route) => {
    const file = files.find(([, text]) => requestTo(route).test(text));
    return file ? [`${route}: ${file[0]}`] : [];
  });
  // A route here has a test now: move it from UNTESTED to TESTED with that file.
  expect(nowTested).toEqual([]);
});

it('recognises a request to a route in the forms the suites write', () => {
  const pattern = requestTo('PUT /api/campaigns/:campaignId/sessions/:sessionId/end');
  expect(pattern.test("agent.put(`/api/campaigns/${campaign.id}/sessions/${id}/end`)")).toBe(true);
  expect(pattern.test("request(app).put('/api/campaigns/c1/sessions/s1/end').send({})")).toBe(true);
  expect(pattern.test("agent.put(`/api/campaigns/${campaign.id}/sessions/${id}/notes`)")).toBe(false);
  expect(pattern.test("agent.get(`/api/campaigns/${campaign.id}/sessions/${id}/end`)")).toBe(false);
  expect(requestTo('GET /api/invitations').test("agent.get('/api/invitations/abc/accept')")).toBe(false);
  expect(requestTo('GET /api/invitations').test("agent.get('/api/invitations?status=PENDING')")).toBe(true);
});
