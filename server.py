import http.server
import json
import os
import urllib.parse
import secrets
import sys
import redis

# Redis Connection URL - uses env variable if configured on Render, otherwise falls back to provided connection string
REDIS_URL = os.environ.get('REDIS_URL', 'redis://default:u4yMVt7YK73SkejNDQ0bzF6ul26YGwCy@spade-modest-textured-10352.db.redis.io:16084')
r_db = redis.Redis.from_url(REDIS_URL, decode_responses=True)

ADMIN_USER = 'admin'
ADMIN_PASS = 'Nehal123'
SESSION_TOKEN = secrets.token_hex(16)

class APIRoutingHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, data, status=200):
        try:
            response_bytes = json.dumps(data).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(response_bytes)))
            self.end_headers()
            self.wfile.write(response_bytes)
        except Exception as e:
            print(f"Error sending JSON: {e}")
            sys.stdout.flush()

    def check_admin_auth(self):
        auth_header = self.headers.get('Authorization')
        if not auth_header:
            return False
        parts = auth_header.split(' ')
        if len(parts) == 2 and parts[0] == 'Bearer':
            return parts[1] == SESSION_TOKEN
        return False

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path_parts = [p for p in parsed_url.path.split('/') if p]

        try:
            # API: Get Ad Script
            if path_parts == ['api', 'ad']:
                ad_code = r_db.get("config:ad_code") or ""
                self.send_json({'ad_code': ad_code})
                return

            # API: Get Statistics
            elif path_parts == ['api', 'stats']:
                if not self.check_admin_auth():
                    self.send_json({'error': 'Unauthorized'}, 401)
                    return
                
                # Fetch all paste keys
                paste_keys = r_db.keys("paste:*")
                total = len(paste_keys)
                public_count = r_db.zcard("public_pastes")
                
                # Language stats
                lang_counts = {}
                for key in paste_keys:
                    lang = r_db.hget(key, "language")
                    if lang:
                        lang_counts[lang] = lang_counts.get(lang, 0) + 1
                
                sorted_langs = [{'language': k, 'count': v} for k, v in sorted(lang_counts.items(), key=lambda item: item[1], reverse=True)]
                
                self.send_json({
                    'total_pastes': total,
                    'public_pastes': public_count,
                    'private_pastes': total - public_count,
                    'db_size': "Cloud-Managed (Redis)",
                    'languages': sorted_langs
                })
                return

            # API: List Public Pastes
            elif path_parts == ['api', 'pastes']:
                # ZSET stores public paste IDs scored by created_at
                paste_ids = r_db.zrevrange("public_pastes", 0, -1)
                
                pastes = []
                for pid in paste_ids:
                    pdata = r_db.hgetall(f"paste:{pid}")
                    if pdata:
                        pastes.append({
                            'id': pdata.get('id'),
                            'alias': pdata.get('alias') or None,
                            'code': pdata.get('code'),
                            'title': pdata.get('title'),
                            'content': pdata.get('content'),
                            'language': pdata.get('language'),
                            'visibility': pdata.get('visibility'),
                            'expiration': pdata.get('expiration'),
                            'createdAt': int(pdata.get('createdAt', 0))
                        })
                self.send_json(pastes)
                return

            # API: Get Specific Paste
            elif len(path_parts) == 3 and path_parts[0:2] == ['api', 'pastes']:
                identifier = path_parts[2]
                
                # Resolve identifier if it's an alias or code mapping
                resolved_id = identifier
                if r_db.exists(f"alias:{identifier}"):
                    resolved_id = r_db.get(f"alias:{identifier}")
                elif r_db.exists(f"code:{identifier.upper()}"):
                    resolved_id = r_db.get(f"code:{identifier.upper()}")
                
                pdata = r_db.hgetall(f"paste:{resolved_id}")
                if pdata:
                    self.send_json({
                        'id': pdata.get('id'),
                        'alias': pdata.get('alias') or None,
                        'code': pdata.get('code'),
                        'title': pdata.get('title'),
                        'content': pdata.get('content'),
                        'language': pdata.get('language'),
                        'visibility': pdata.get('visibility'),
                        'expiration': pdata.get('expiration'),
                        'createdAt': int(pdata.get('createdAt', 0))
                    })
                else:
                    self.send_json({'error': 'Not Found'}, 404)
                return
        except Exception as e:
            print(f"GET exception: {e}")
            sys.stdout.flush()
            self.send_json({'error': f"Internal server error: {str(e)}"}, 500)
            return

        # Serve SPA static files
        filename = parsed_url.path.lstrip('/')
        if not filename:
            filename = 'index.html'
            
        if os.path.exists(filename) and os.path.isfile(filename):
            return super().do_GET()
        else:
            self.path = '/index.html'
            return super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path_parts = [p for p in parsed_url.path.split('/') if p]

        # Read JSON body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        try:
            body = json.loads(post_data) if post_data else {}
        except json.JSONDecodeError:
            self.send_json({'error': 'Invalid JSON body'}, 400)
            return

        try:
            # API: Login
            if path_parts == ['api', 'login']:
                username = body.get('username')
                password = body.get('password')
                
                if username == ADMIN_USER and password == ADMIN_PASS:
                    self.send_json({'token': SESSION_TOKEN})
                else:
                    self.send_json({'error': 'Invalid credentials'}, 401)
                return

            # API: Save Ad Script
            elif path_parts == ['api', 'ad']:
                if not self.check_admin_auth():
                    self.send_json({'error': 'Unauthorized'}, 401)
                    return
                    
                ad_code = body.get('ad_code', '')
                r_db.set("config:ad_code", ad_code)
                self.send_json({'success': True})
                return

            # API: Create Paste
            elif path_parts == ['api', 'pastes']:
                pid = body.get('id')
                alias = body.get('alias')
                code = body.get('code')
                title = body.get('title')
                content = body.get('content')
                language = body.get('language')
                visibility = body.get('visibility')
                expiration = body.get('expiration')
                created_at = body.get('createdAt')
                
                if not pid:
                    self.send_json({'error': 'Paste ID is required'}, 400)
                    return

                # Validate unique custom alias or unique custom code conflict
                if alias:
                    if r_db.exists(f"alias:{alias}") or r_db.exists(f"paste:{alias}"):
                        self.send_json({'error': 'Alias is already taken'}, 400)
                        return

                # Write to Redis Hash
                mapping = {
                    'id': pid,
                    'alias': alias or '',
                    'code': code,
                    'title': title,
                    'content': content,
                    'language': language,
                    'visibility': visibility,
                    'expiration': expiration,
                    'createdAt': str(created_at)
                }
                
                r_db.hset(f"paste:{pid}", mapping=mapping)
                
                # Write search indexes
                if alias:
                    r_db.set(f"alias:{alias}", pid)
                if code:
                    r_db.set(f"code:{code.upper()}", pid)
                if visibility == 'public':
                    r_db.zadd("public_pastes", {pid: created_at})
                    
                self.send_json({'success': True, 'id': pid}, 201)
                return
        except Exception as e:
            print(f"POST exception: {e}")
            sys.stdout.flush()
            self.send_json({'error': f"Internal server error: {str(e)}"}, 500)
            return

    def do_PUT(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path_parts = [p for p in parsed_url.path.split('/') if p]

        try:
            # API: Update Paste
            if len(path_parts) == 3 and path_parts[0:2] == ['api', 'pastes']:
                pid = path_parts[2]
                content_length = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(content_length).decode('utf-8'))
                content = body.get('content')
                created_at = int(body.get('createdAt', 0))
                
                if r_db.exists(f"paste:{pid}"):
                    r_db.hset(f"paste:{pid}", "content", content)
                    r_db.hset(f"paste:{pid}", "createdAt", str(created_at))
                    # Update ZSET score if public
                    vis = r_db.hget(f"paste:{pid}", "visibility")
                    if vis == 'public':
                        r_db.zadd("public_pastes", {pid: created_at})
                    self.send_json({'success': True})
                else:
                    self.send_json({'error': 'Not Found'}, 404)
                return
        except Exception as e:
            print(f"PUT exception: {e}")
            sys.stdout.flush()
            self.send_json({'error': f"Internal server error: {str(e)}"}, 500)
            return

    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path_parts = [p for p in parsed_url.path.split('/') if p]

        try:
            # API: Delete Paste
            if len(path_parts) == 3 and path_parts[0:2] == ['api', 'pastes']:
                pid = path_parts[2]
                
                # Fetch metadata to clean up indexes
                pdata = r_db.hgetall(f"paste:{pid}")
                if pdata:
                    alias = pdata.get('alias')
                    code = pdata.get('code')
                    
                    # Delete main keys & search lookup keys
                    r_db.delete(f"paste:{pid}")
                    r_db.zrem("public_pastes", pid)
                    if alias:
                        r_db.delete(f"alias:{alias}")
                    if code:
                        r_db.delete(f"code:{code.upper()}")
                        
                    self.send_json({'success': True})
                else:
                    self.send_json({'error': 'Not Found'}, 404)
                return
        except Exception as e:
            print(f"DELETE exception: {e}")
            sys.stdout.flush()
            self.send_json({'error': f"Internal server error: {str(e)}"}, 500)
            return

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    server_address = ('0.0.0.0', port)
    httpd = http.server.HTTPServer(server_address, APIRoutingHandler)
    print(f"Serving FoxBin Redis API and frontend on port {port}...")
    sys.stdout.flush()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
