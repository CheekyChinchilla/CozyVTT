"""
scripts/nginx-check.py renders the nginx container's configuration from the
compose file and the deployment guide. These check the reading it does
before Docker is involved: compose's defaults, the guide's HTTPS example and
the mounts, so a change to either file's shape fails here and not quietly.

    python3 -m unittest discover -s scripts/tests
"""

import importlib.util
import os
import unittest

SCRIPTS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('nginx_check', os.path.join(SCRIPTS, 'nginx-check.py'))
nc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nc)


class Interpolate(unittest.TestCase):
    def test_gives_each_setting_its_default_as_with_no_env_file(self):
        self.assertEqual(nc.interpolate('${NGINX_MAX_BODY_SIZE:-55M}'), '55M')
        self.assertEqual(nc.interpolate('${NGINX_TRUSTED_PROXIES:-}'), '')
        self.assertEqual(nc.interpolate('${UNSET}'), '')
        self.assertEqual(nc.interpolate('NGINX_MAX_BODY_SIZE|NGINX_REAL_IP_FROM'), 'NGINX_MAX_BODY_SIZE|NGINX_REAL_IP_FROM')


class HttpsExample(unittest.TestCase):
    def test_takes_the_example_out_of_its_list_item_as_a_self_hoster_copies_it(self):
        guide = '2. Create it:\n\n   ```nginx\n   # nginx/conf.d/https.conf: HTTPS\n   server {\n       listen 443 ssl;\n   }\n   ```\n'
        self.assertEqual(nc.https_example(guide), '# nginx/conf.d/https.conf: HTTPS\nserver {\n    listen 443 ssl;\n}\n')

    def test_stops_when_the_guide_has_none(self):
        with self.assertRaises(SystemExit):
            nc.https_example('```nginx\nserver {}\n```\n')

    def test_finds_the_one_in_the_deployment_guide(self):
        with open(nc.GUIDE, encoding='utf-8') as f:
            example = nc.https_example(f.read())
        self.assertIn('include /etc/nginx/cozyvtt/locations.conf;', example)


class Mounts(unittest.TestCase):
    def test_swaps_the_self_hosters_folders_and_keeps_the_rest(self):
        args = nc.mounts(
            ['./nginx/nginx.conf:/etc/nginx/templates/default.conf.template:ro', './nginx/conf.d:/etc/nginx/cozyvtt.d:ro',
             './nginx/certs:/etc/nginx/certs:ro'],
            '/tmp/conf', '/tmp/certs',
        )
        self.assertEqual(args, [
            '-v', os.path.join(nc.ROOT, 'nginx/nginx.conf') + ':/etc/nginx/templates/default.conf.template:ro',
            '-v', '/tmp/conf:/etc/nginx/cozyvtt.d:ro',
            '-v', '/tmp/certs:/etc/nginx/certs:ro',
        ])

    def test_stops_on_a_mount_it_does_not_know(self):
        with self.assertRaises(SystemExit):
            nc.mounts([{'type': 'bind', 'source': './nginx', 'target': '/x'}], '/a', '/b')
        with self.assertRaises(SystemExit):
            nc.mounts(['nginx_data:/var/cache/nginx'], '/a', '/b')

    def test_reads_the_compose_files_nginx_service(self):
        with open(nc.COMPOSE, encoding='utf-8') as f:
            try:
                image, environment, volumes = nc.nginx_service(f.read())
            except ImportError:
                self.skipTest('PyYAML is not installed')
        self.assertTrue(image.startswith('nginx:'))
        self.assertEqual(environment['NGINX_MAX_BODY_SIZE'], '55M')
        self.assertIn('NGINX_ENVSUBST_FILTER', environment)
        self.assertTrue(any(v.startswith('./nginx/trusted-proxies.envsh:/docker-entrypoint.d/') for v in volumes))


if __name__ == '__main__':
    unittest.main()
