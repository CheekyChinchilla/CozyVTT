"""
The two documentation checks read routes and socket events out of the
TypeScript source with patterns. A declaration written in a form a pattern
does not know used to be skipped without a word, so the check passed while
the route or event went undocumented. These feed each script small sources
and check that it reads every form the code uses, and names any it cannot
read so the run fails.

    python3 -m unittest discover -s scripts/tests

Run from the repository root. Standard library only.
"""

import importlib.util
import os
import tempfile
import textwrap
import unittest

SCRIPTS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), os.path.join(SCRIPTS, f'{name}.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Sources:
    """A throwaway backend/src with the files given."""

    def __init__(self, files):
        self.dir = tempfile.TemporaryDirectory()
        for rel, text in files.items():
            path = os.path.join(self.dir.name, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(textwrap.dedent(text))

    def path(self, rel):
        return os.path.join(self.dir.name, rel)

    def close(self):
        self.dir.cleanup()


APP = '''
    import express from 'express';
    import userRoutes from './routes/users';
    import mapRoutes from "./routes/maps";
    export function createApp() {
      const app = express();
      app.use(helmet());
      app.get("/health", (_req, res) => res.json({}));
      app.use('/api/users', userRoutes);
      app.use("/api/campaigns/:campaignId/maps", mapRoutes);
      app.use(`/api/maps`, mapRoutes);
      return app;
    }
'''


class SpecCoverage(unittest.TestCase):
    def inventory(self, app=APP, routes=None, server='const app = createApp(options);\n'):
        files = {'app.ts': app, 'server.ts': server}
        for name, text in (routes or {}).items():
            files[f'routes/{name}.ts'] = text
        src = Sources(files)
        self.addCleanup(src.close)
        sc = load('spec-coverage')
        sc.SERVER = src.path('app.ts')
        sc.APP_FILES = [src.path('app.ts'), src.path('server.ts')]
        sc.ROUTES = src.path('routes')
        return sc

    def test_reads_every_quote_style_and_a_router_mounted_twice(self):
        sc = self.inventory(routes={
            'users': "router.get('/', h);\nrouter.put(\"/:id\", h);\n",
            'maps': "router.post(\n  `/:id/walls`,\n  h,\n);\n",
        })
        self.assertEqual(sc.routed(), {
            'GET /health', 'GET /api/users', 'PUT /api/users/:x',
            'POST /api/campaigns/:x/maps/:x/walls', 'POST /api/maps/:x/walls',
        })
        self.assertEqual(sc.unreadable(), [])

    def test_does_not_count_a_route_that_is_commented_out(self):
        sc = self.inventory(routes={
            'users': "// router.get('/old', h);\n/* router.delete('/:id', h); */\nrouter.get('/', h);\n",
            'maps': '',
        })
        self.assertEqual(sc.routed(), {'GET /health', 'GET /api/users'})

    def test_names_the_route_declarations_it_cannot_read(self):
        sc = self.inventory(routes={
            'users': "router.get(`/${prefix}/x`, h);\nrouter.route('/a').get(h);\nrouter.all('/b', h);\nrouter.get(PATH, h);\n",
            'maps': "import walls from './walls';\nrouter.use('/walls', walls);\nrouter.use(requireAuth);\n",
            'walls': "router.get('/', h);\n",
        })
        problems = sc.unreadable()
        self.assertEqual(len(problems), 5, problems)
        for line in ('users.ts:1', 'users.ts:2', 'users.ts:3', 'users.ts:4', 'maps.ts:2'):
            self.assertTrue(any(line in p for p in problems), (line, problems))

    def test_names_a_mount_it_cannot_read_and_a_router_it_never_saw_mounted(self):
        app = APP.replace("app.use('/api/users', userRoutes);", "app.use(USERS_PREFIX, userRoutes);")
        sc = self.inventory(app=app, routes={'users': "router.get('/', h);\n", 'maps': ''})
        problems = sc.unreadable()
        self.assertTrue(any('app.ts' in p and 'USERS_PREFIX' in p for p in problems), problems)
        self.assertTrue(any('userRoutes' in p and 'never mounted' in p for p in problems), problems)

    def test_names_routes_the_server_adds_outside_the_app(self):
        sc = self.inventory(routes={'users': '', 'maps': ''}, server="app.get(`/${x}`, h);\n")
        self.assertTrue(any('server.ts:1' in p for p in sc.unreadable()), sc.unreadable())


class ClientCalls(unittest.TestCase):
    """The frontend's requests, read from its API client, against the OpenAPI file."""

    def calls(self, text):
        src = Sources({'api.ts': text})
        self.addCleanup(src.close)
        sc = load('spec-coverage')
        sc.CLIENT = src.path('api.ts')
        return sc.client_calls()

    def test_reads_each_request_the_client_sends(self):
        calls, problems = self.calls('''
            const API_BASE_URL = '';
            class ApiClient {
              async a() { return this.client.get<{ users: User[] }>('/api/users'); }
              async b(id: string) { return this.client.put(
                `/api/users/${id}`,
                body,
              ); }
              async c(c: string, n: string) { return this.client.delete(`/api/campaigns/${c}/notes/${encodeURIComponent(n)}`); }
              async d(c: string) { return this.client.get<Array<{ id: string }>>(`/api/campaigns/${c}/invitable-users?search=${q}`); }
              async e(c: string) { return fetch(`${API_BASE_URL}/api/campaigns/${c}/export?includeAudio=${x}`, { credentials: 'include' }); }
              async f() { return fetch(`${API_BASE_URL}/api/admin/backups/restore`, { method: 'POST', body }); }
              // this.client.get('/api/old');
            }
        ''')
        self.assertEqual(calls, {
            'GET /api/users', 'PUT /api/users/:x', 'DELETE /api/campaigns/:x/notes/:x',
            'GET /api/campaigns/:x/invitable-users', 'GET /api/campaigns/:x/export',
            'POST /api/admin/backups/restore',
        })
        self.assertEqual(problems, [])

    def test_names_a_request_whose_address_it_cannot_read(self):
        _calls, problems = self.calls("async a(url: string) { return this.client.get(url); }\n")
        self.assertEqual(len(problems), 1, problems)
        self.assertIn('api.ts:1', problems[0])


class WebsocketEvents(unittest.TestCase):
    def events(self, files):
        src = Sources(files)
        self.addCleanup(src.close)
        we = load('websocket-events')
        we.HANDLERS = [src.path('**/*.ts')]
        return we

    def test_reads_a_handler_and_an_emit_in_either_quote_style(self):
        we = self.events({'handlers/a.ts': '''
            socket.on("token:move", async (data) => {
              socket.emit("token:moved", data);
            });
            socket.on('token:remove', () => {});
        '''})
        inbound, outbound = we.collect()
        self.assertEqual(set(inbound), {'token:move', 'token:remove'})
        self.assertEqual(set(outbound), {'token:moved'})
        self.assertEqual(we.unreadable(), [])

    def test_names_a_handler_or_emit_whose_event_it_cannot_read(self):
        we = self.events({'handlers/a.ts': '''
            socket.on(EVENT, () => {});
            socket.on(`map:${kind}`, () => {});
            io.to(room).emit(name, data);
            broadcastToCampaign(campaignId, eventName, data);
        '''})
        problems = we.unreadable()
        self.assertEqual(len(problems), 4, problems)

    def test_lets_the_broadcast_helpers_pass_on_the_event_they_were_given(self):
        we = self.events({'utils.ts': '''
            export function broadcastToCampaign(campaignId: string, event: string, data: unknown): void {
              getSocketInstance().to(`campaign:${campaignId}`).emit(event, data);
            }
        '''})
        self.assertEqual(we.unreadable(), [])

    def test_says_which_doors_a_player_may_toggle(self):
        we = self.events({
            'handlers/walls.ts': '''
                socket.on('wall:update', async (data) => {
                  if (!canToggleDoor(socket.role)) return;
                  if (map.lightingEnabled && !sight?.seesPoint(x, y)) return;
                  if (map.fogEnabled && !doorBesideRevealedFog(door, map)) return;
                });
            ''',
            'handlers/plain.ts': '''
                socket.on('door:plain', async (data) => {
                  if (!canToggleDoor(socket.role)) return;
                });
            ''',
        })
        inbound, _ = we.collect()
        self.assertEqual(
            we.who_may_send(inbound['wall:update']),
            'DM; a player may toggle an unlocked door (on a lit map, one their tokens see; '
            'under manual fog, one beside a square revealed to them)')
        self.assertEqual(we.who_may_send(inbound['door:plain']), 'DM; a player may toggle an unlocked door')

    def test_says_when_a_player_may_roll_initiative(self):
        we = self.events({'handlers/initiative.ts': '''
            socket.on('initiative.roll', async (data) => {
              if (socket.role !== 'DM') {
                if (!canControlToken(socket.role, token.controlledBy, socket.userId)) return;
                if (existingIndex === -1) return;
                if (state.active) return;
                if (playerHasRolled(campaignId, tokenId)) return;
                markPlayerRolled(campaignId, tokenId);
              }
            });
            socket.on('token.nudge', async (data) => {
              if (!canControlToken(socket.role, token.controlledBy, socket.userId)) return;
            });
        '''})
        inbound, _ = we.collect()
        self.assertEqual(
            we.who_may_send(inbound['initiative.roll']),
            "DM, or the token's player: once the DM has put it in the order, before the fight starts, "
            'once each time it joins the order')
        self.assertEqual(we.who_may_send(inbound['token.nudge']), "DM, or the token's player")

    def test_says_who_each_outbound_event_is_sent_to(self):
        we = self.events({
            'handlers/a.ts': '''
                socket.on('ask', async () => {
                  socket.emit('answer', {});
                  io.to(socket.campaignId!).emit('everyone', {});
                  io.to(userId).emit('just.them', {});
                  socket.to(room).emit('others', {});
                  for (const s of sockets) s.emit('picked', {});
                  broadcastToUser(userId, 'user.event', {});
                  broadcastToCampaign(campaignId, 'campaign.event', {});
                  await emitToMapReaders(io, campaignId, mapId, 'map.event', {});
                  await tellMapReadersAs(campaignId, mapId, 'per.role', (role) => null);
                  await emitMoveToVisibleSockets('token.moved', token, mapId, null, {}, true);
                });
                function tell(socket) {
                  socket.emit('handed', {});
                }
            ''',
            'handlers/b.ts': '''
                socket.on('again', () => { socket.emit('everyone', {}); });
            ''',
        })
        _, outbound = we.collect()
        sent = {name: info['to'] for name, info in outbound.items()}
        self.assertEqual(sent, {
            'answer': {'the sender'},
            'everyone': {'the campaign', 'the sender'},
            'just.them': {"one user's sockets"},
            'others': {'the campaign but the sender'},
            'picked': {'members the handler picks'},
            'user.event': {"one user's sockets"},
            'campaign.event': {'the campaign'},
            'map.event': {'map readers'},
            'per.role': {'map readers, as their role sees it'},
            'token.moved': {'map readers sent the token'},
            'handed': {'one socket'},
        })
        rows = we.table({}, outbound).split('\n')
        self.assertIn('| Event | Sent to | Emitted from |', rows)
        self.assertIn('| `everyone` | The campaign; the sender | `a.ts` |', rows)


if __name__ == '__main__':
    unittest.main()
